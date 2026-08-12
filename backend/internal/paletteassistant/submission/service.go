package submission

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/qiqi/figcolor/backend/internal/palette"
	pa "github.com/qiqi/figcolor/backend/internal/paletteassistant"
)

type Comparison struct {
	ID, Status string
	HEX        []string
}

type Repository interface {
	Snapshot(context.Context) ([]Comparison, error)
	Replay(context.Context, string, string, string) (*pa.CandidateReceipt, Outcome, error)
	Create(context.Context, string, string, string, string, string, pa.AssistantDraft, []pa.ProtocolFinding) (*pa.CandidateReceipt, Outcome, error)
}

type Outcome string

const (
	OutcomeCreated    Outcome = "created"
	OutcomeReplay     Outcome = "replay"
	OutcomeConflict   Outcome = "conflict"
	OutcomeInProgress Outcome = "in_progress"
	OutcomeExact      Outcome = "exact"
)

type Service struct {
	repo   Repository
	secret []byte
	now    func() time.Time
}

func NewService(repo Repository, secret []byte, now func() time.Time) (*Service, error) {
	if repo == nil || len(secret) < pa.ValidationReceiptMinSecretBytes {
		return nil, errors.New("Palette Assistant submission is unavailable")
	}
	if now == nil {
		now = time.Now
	}
	return &Service{repo: repo, secret: append([]byte(nil), secret...), now: now}, nil
}

type Result struct {
	Response *pa.ValidateResponse
	Receipt  *pa.CandidateReceipt
	Problem  *pa.Problem
	Status   int
}

func (s *Service) Validate(ctx context.Context, actor string, request pa.ValidateRequest) Result {
	draft, problem := validateRequestDraft(request.Draft, request.ConfirmedRevision)
	if problem != nil {
		return Result{Problem: problem, Status: statusFor(problem.Code)}
	}
	snapshot, err := s.repo.Snapshot(ctx)
	if err != nil {
		return internal()
	}
	digest, findings, duplicates, similarities, err := evaluate(*draft, snapshot)
	if err != nil {
		return internal()
	}
	findingDigest, err := findingSetDigest(findings)
	if err != nil {
		return internal()
	}
	now := s.now().UTC().Truncate(time.Second)
	payload := pa.ValidationReceiptPayload{Version: pa.ValidationReceiptVersion, DraftDigest: digest, ActorUserID: actor, RegistryFingerprint: pa.PreviewRegistryFingerprint, FindingSetDigest: findingDigest, DuplicatePolicyVersion: pa.DuplicatePolicyVersion, SimilarityPolicyVersion: pa.SimilarityPolicyVersion, IssuedAt: now.Unix(), ExpiresAt: now.Add(pa.ReceiptLifetime).Unix()}
	token, err := issueReceipt(payload, s.secret)
	if err != nil {
		return internal()
	}
	return Result{Status: 200, Response: &pa.ValidateResponse{ContractVersion: pa.ContractVersion, NormalizedDraft: *draft, ValidatedRevision: draft.Revision, DraftDigest: digest, ValidationPolicy: fmt.Sprintf("draft-v%d", pa.DraftDigestVersion), RegistryVersion: pa.PreviewRegistryFingerprint, VocabularyVersion: pa.PreviewRegistryFingerprint, Warnings: warningDTOs(findings), Duplicates: duplicates, Similarities: similarities, ValidationReceipt: token, ReceiptExpiresAt: now.Add(pa.ReceiptLifetime)}}
}

func (s *Service) Create(ctx context.Context, actor, key string, request pa.CreateCandidateRequest) Result {
	if request.ValidationReceipt == "" {
		return problem(pa.ErrValidationReceiptMissing, "A validation receipt is required.", 400, nil)
	}
	draft, p := validateRequestDraft(request.Draft, request.ConfirmedRevision)
	if p != nil {
		return Result{Problem: p, Status: statusFor(p.Code)}
	}
	digest, err := draftDigest(*draft)
	if err != nil {
		return internal()
	}
	payload, err := verifyReceipt(request.ValidationReceipt, s.secret, s.now())
	if errors.Is(err, errReceiptExpired) {
		return problem(pa.ErrValidationReceiptExpired, "The validation receipt has expired.", 409, nil)
	}
	if err != nil {
		return problem(pa.ErrValidationReceiptInvalid, "The validation receipt is invalid.", 400, nil)
	}
	if payload.ActorUserID != actor {
		return problem(pa.ErrValidationActorMismatch, "The validation receipt belongs to another actor.", 403, nil)
	}
	if payload.DraftDigest != digest {
		return problem(pa.ErrValidationPolicyChanged, "The validated Draft or findings have changed.", 409, nil)
	}
	if payload.RegistryFingerprint != pa.PreviewRegistryFingerprint || payload.DuplicatePolicyVersion != pa.DuplicatePolicyVersion || payload.SimilarityPolicyVersion != pa.SimilarityPolicyVersion {
		return problem(pa.ErrValidationPolicyChanged, "The validation policy has changed.", 409, nil)
	}
	receiptIntent, err := createIntentDigest(actor, digest, request.ConfirmedRevision, request.WarningAcknowledgments, payload.FindingSetDigest)
	if err != nil {
		return internal()
	}
	if replay, outcome, replayErr := s.repo.Replay(ctx, actor, key, receiptIntent); replayErr != nil {
		return problem(pa.ErrCandidateTransactionFailed, "Candidate creation could not be completed.", 503, nil)
	} else if outcome == OutcomeReplay {
		replay.Replay = true
		return Result{Receipt: replay, Status: 201}
	} else if outcome == OutcomeConflict {
		return problem(pa.ErrIdempotencyConflict, "The idempotency key was already used for another request.", 409, nil)
	} else if outcome == OutcomeInProgress {
		return problem(pa.ErrIdempotencyInProgress, "The request is already in progress.", 409, nil)
	}
	snapshot, err := s.repo.Snapshot(ctx)
	if err != nil {
		return internal()
	}
	digest, findings, duplicates, _, err := evaluate(*draft, snapshot)
	if err != nil {
		return internal()
	}
	if len(duplicates) != 0 {
		return problem(pa.ErrExactDuplicateCandidate, "An exact public Candidate or Published Palette already exists.", 409, nil)
	}
	findingDigest, err := findingSetDigest(findings)
	if err != nil {
		return internal()
	}
	if payload.FindingSetDigest != findingDigest {
		return problem(pa.ErrValidationPolicyChanged, "The validated Draft or findings have changed.", 409, nil)
	}
	if ackProblem := validateAcknowledgments(findings, request.WarningAcknowledgments); ackProblem != nil {
		return Result{Problem: ackProblem, Status: statusFor(ackProblem.Code)}
	}
	intent, err := createIntentDigest(actor, digest, request.ConfirmedRevision, request.WarningAcknowledgments, findingDigest)
	if err != nil {
		return internal()
	}
	receipt, outcome, err := s.repo.Create(ctx, actor, key, intent, digest, findingDigest, *draft, findings)
	if err != nil {
		return problem(pa.ErrCandidateTransactionFailed, "Candidate creation could not be completed.", 503, nil)
	}
	switch outcome {
	case OutcomeConflict:
		return problem(pa.ErrIdempotencyConflict, "The idempotency key was already used for another request.", 409, nil)
	case OutcomeInProgress:
		return problem(pa.ErrIdempotencyInProgress, "The request is already in progress.", 409, nil)
	case OutcomeExact:
		return problem(pa.ErrExactDuplicateCandidate, "An exact public Candidate or Published Palette already exists.", 409, nil)
	}
	if outcome == OutcomeReplay {
		receipt.Replay = true
	}
	return Result{Receipt: receipt, Status: 201}
}

func validateRequestDraft(input pa.AssistantDraft, confirmed uint64) (*pa.AssistantDraft, *pa.Problem) {
	validation := pa.ValidateAssistantDraft(input)
	if validation.ValidatedDraft == nil {
		return nil, &pa.Problem{Code: pa.ErrInvalidDraft, Message: "The Draft is invalid.", Retryable: false, Issues: validation.Issues}
	}
	if confirmed == 0 || confirmed != validation.ValidatedDraft.Revision {
		return nil, &pa.Problem{Code: pa.ErrStaleRevision, Message: "confirmed_revision must equal the Draft revision.", Issues: []pa.FieldIssue{{Path: "/confirmed_revision", Code: "REVISION_MISMATCH", Message: "Confirm the current Draft revision."}}}
	}
	return validation.ValidatedDraft, nil
}

func evaluate(draft pa.AssistantDraft, snapshot []Comparison) (string, []pa.ProtocolFinding, []pa.DuplicateFinding, []pa.SimilarityFinding, error) {
	digest, err := draftDigest(draft)
	if err != nil {
		return "", nil, nil, nil, err
	}
	exact, err := exactFingerprint(draft)
	if err != nil {
		return "", nil, nil, nil, err
	}
	draftHEX := make([]string, len(draft.Colors))
	for i := range draft.Colors {
		draftHEX[i] = draft.Colors[i].Hex
	}
	sort.Slice(snapshot, func(i, j int) bool { return snapshot[i].ID < snapshot[j].ID })
	findings := []pa.ProtocolFinding{}
	duplicates := []pa.DuplicateFinding{}
	similarities := []pa.SimilarityFinding{}
	for _, c := range snapshot {
		projection := pa.AssistantDraft{Colors: make([]pa.DraftColor, len(c.HEX))}
		for i, h := range c.HEX {
			projection.Colors[i] = pa.DraftColor{Hex: h}
		}
		other, e := exactFingerprint(projection)
		if e != nil {
			return "", nil, nil, nil, e
		}
		if other == exact {
			evidence, _ := json.Marshal(map[string]any{"fingerprint": exact, "fingerprint_version": pa.ExactFingerprintVersion, "comparison_status": c.Status})
			f, e := newProtocolFinding("exact_duplicate", "blocking", "/colors", "EXACT_DUPLICATE_CANDIDATE", "The ordered colors exactly match an existing Palette.", pa.DuplicatePolicyVersion, c.ID, evidence)
			if e != nil {
				return "", nil, nil, nil, e
			}
			findings = append(findings, f)
			duplicates = append(duplicates, pa.DuplicateFinding{ID: f.ID, PaletteID: c.ID, Kind: "exact_duplicate"})
			continue
		}
		sim, e := pa.EvaluatePaletteSimilarity(draftHEX, c.HEX)
		if e != nil {
			return "", nil, nil, nil, e
		}
		if !sim.Similar {
			continue
		}
		meanThreshold, maxThreshold, e := pa.SimilarityPolicyThresholds()
		if e != nil {
			return "", nil, nil, nil, e
		}
		evidence, _ := json.Marshal(map[string]any{"color_count": len(draftHEX), "color_space": "oklab_d65", "comparison_palette_id": c.ID, "comparison_status": c.Status, "matching": "canonical_index_order_preserving_one_to_one", "maximum_pair_distance": sim.MaximumPairDistance, "maximum_pair_distance_threshold": maxThreshold, "mean_distance": sim.MeanDistance, "mean_distance_threshold": meanThreshold, "policy_version": pa.SimilarityPolicyVersion})
		f, e := newProtocolFinding("similar_palette", "warning", "/colors", "SIMILAR_PALETTE", "The ordered colors are similar to an existing Palette.", pa.SimilarityPolicyVersion, c.ID, evidence)
		if e != nil {
			return "", nil, nil, nil, e
		}
		findings = append(findings, f)
		similarities = append(similarities, pa.SimilarityFinding{ID: f.ID, PaletteID: c.ID, Score: sim.MeanDistance, Policy: "oklab_d65_v1", Params: evidence})
	}
	sort.Slice(findings, func(i, j int) bool { return findings[i].ID < findings[j].ID })
	sort.Slice(duplicates, func(i, j int) bool { return duplicates[i].ID < duplicates[j].ID })
	sort.Slice(similarities, func(i, j int) bool { return similarities[i].ID < similarities[j].ID })
	return digest, findings, duplicates, similarities, nil
}

func warningDTOs(findings []pa.ProtocolFinding) []pa.WarningFinding {
	out := []pa.WarningFinding{}
	for _, f := range findings {
		id, kind, severity, path, code, message, pid, evidence := pa.ProtocolFindingFields(f)
		if severity == "warning" {
			out = append(out, pa.WarningFinding{ID: id, Code: code, Path: path, Message: message, Policy: kind + "_v1", PaletteID: pid, Params: evidence, RequiresAcknowledgment: true})
		}
	}
	return out
}
func validateAcknowledgments(findings []pa.ProtocolFinding, values []string) *pa.Problem {
	required := map[string]bool{}
	seen := map[string]bool{}
	for _, f := range findings {
		id, _, severity, _, _, _, _, _ := pa.ProtocolFindingFields(f)
		if severity == "warning" {
			required[id] = true
		}
	}
	for _, v := range values {
		if seen[v] || !required[v] {
			return &pa.Problem{Code: pa.ErrWarningAcknowledgmentInvalid, Message: "Warning acknowledgments do not match current findings."}
		}
		seen[v] = true
	}
	if len(seen) != len(required) {
		return &pa.Problem{Code: pa.ErrWarningAcknowledgmentRequired, Message: "All current warnings must be acknowledged."}
	}
	return nil
}

func NewUUID() (string, error) {
	b := make([]byte, 16)
	if _, e := rand.Read(b); e != nil {
		return "", e
	}
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	s := hex.EncodeToString(b)
	return s[:8] + "-" + s[8:12] + "-" + s[12:16] + "-" + s[16:20] + "-" + s[20:], nil
}
func Slug(name, id string) string {
	var b strings.Builder
	dash := false
	for _, r := range strings.ToLower(name) {
		if r >= 'a' && r <= 'z' || r >= '0' && r <= '9' {
			b.WriteRune(r)
			dash = false
		} else if b.Len() > 0 && !dash {
			b.WriteByte('-')
			dash = true
		}
	}
	return strings.Trim(b.String(), "-") + "-" + strings.ReplaceAll(id, "-", "")[:8]
}
func PaletteInput(d pa.AssistantDraft, ids map[string]string) (palette.CandidateAggregateInput, error) {
	colors := make([]palette.PaletteColor, len(d.Colors))
	for i, c := range d.Colors {
		id := ids[c.ID]
		if id == "" {
			return palette.CandidateAggregateInput{}, errors.New("missing color mapping")
		}
		colors[i] = palette.PaletteColor{ID: id, Hex: c.Hex, RGB: palette.HexToRGB(c.Hex), Label: c.Label, Order: i}
	}
	raw, _ := json.Marshal(colors)
	app := make([]palette.ChartTypeApplicability, len(d.ChartApplicability))
	charts := make([]string, len(app))
	for i, a := range d.ChartApplicability {
		app[i] = palette.ChartTypeApplicability{ChartType: a.ChartType, Suitability: a.Suitability, Notes: a.Notes, Source: "admin"}
		charts[i] = a.ChartType
	}
	ar, _ := json.Marshal(app)
	previews := make([]palette.CreatePreviewCaseRequest, len(d.PreviewCases))
	for i, p := range d.PreviewCases {
		roles, e := mapReferences(p.ColorRoles, ids)
		if e != nil {
			return palette.CandidateAggregateInput{}, e
		}
		previews[i] = palette.CreatePreviewCaseRequest{ChartType: p.ChartType, TemplateID: p.TemplateID, TemplateVersion: p.TemplateVersion, SchemaVersion: p.SchemaVersion, ColorRoles: roles, PreviewConfig: append(json.RawMessage(nil), p.PreviewConfig...), SeedStrategy: p.SeedStrategy, SeedValue: p.SeedValue}
	}
	return palette.CandidateAggregateInput{Palette: palette.CandidatePaletteInput{Name: d.Name, Colors: raw, ColorCount: len(colors), Type: d.Type, ChartTypes: charts, ChartApplicability: palette.OptionalChartApplicability{Present: true, Raw: ar, Value: app}, Discipline: d.Disciplines, UseCase: d.UseCases, AvoidCase: d.AvoidCases, Tags: d.Tags, Accessibility: &palette.Accessibility{ColorblindSafe: d.Accessibility.ColorblindSafe, PrintFriendly: d.Accessibility.PrintFriendly, DarkBackground: d.Accessibility.DarkBackground}, SourceType: pa.OnlineSourceType, SourceImage: "", SourceNote: d.SourceNote, Version: "1"}, PreviewCases: previews}, nil
}
func mapReferences(raw json.RawMessage, ids map[string]string) (json.RawMessage, error) {
	var v any
	if json.Unmarshal(raw, &v) != nil {
		return nil, errors.New("invalid roles")
	}
	var walk func(any) error
	walk = func(x any) error {
		switch n := x.(type) {
		case map[string]any:
			if s, ok := n["source"].(string); ok && s == "palette" {
				id, ok := n["color_id"].(string)
				if !ok || ids[id] == "" {
					return errors.New("unknown color reference")
				}
				n["color_id"] = ids[id]
			}
			for _, v := range n {
				if e := walk(v); e != nil {
					return e
				}
			}
		case []any:
			for _, v := range n {
				if e := walk(v); e != nil {
					return e
				}
			}
		}
		return nil
	}
	if e := walk(v); e != nil {
		return nil, e
	}
	return json.Marshal(v)
}
func problem(code pa.ProblemCode, message string, status int, issues []pa.FieldIssue) Result {
	return Result{Status: status, Problem: &pa.Problem{Code: code, Message: message, Retryable: status >= 500, Issues: issues}}
}
func internal() Result {
	return problem(pa.ErrInternal, "The request could not be completed.", 500, nil)
}
func statusFor(code pa.ProblemCode) int {
	for _, s := range pa.ProblemSpecs {
		if s.Code == code {
			return s.HTTPStatus
		}
	}
	return 500
}
