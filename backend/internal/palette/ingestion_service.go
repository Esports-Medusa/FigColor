package palette

import (
	"context"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"regexp"
	"strings"
	"time"

	"github.com/lib/pq"
	"github.com/qiqi/figcolor/backend/internal/config"
	"github.com/qiqi/figcolor/backend/internal/database"
	figjcs "github.com/qiqi/figcolor/backend/internal/jcs"
)

const (
	IngestionPipelineVersion                   = "palette-ingest-wp5-reporting.1"
	IngestionServiceCreated                    = "success_created"
	IngestionServiceReplayed                   = "success_replayed"
	IngestionServiceRecoveredUnknown           = "success_recovered_after_unknown_commit"
	IngestionServiceRetryNotReady              = "INGESTION_RETRY_NOT_READY"
	IngestionServiceOutcomeUnknown             = "INGESTION_OUTCOME_UNKNOWN"
	IngestionServiceInternalError              = "INGESTION_INTERNAL_ERROR"
	IngestionServiceValidationFailed           = "INGESTION_VALIDATION_FAILED"
	IngestionServiceUnsupportedSchemaVersion   = "UNSUPPORTED_SCHEMA_VERSION"
	IngestionServiceUnsupportedPipelineVersion = "UNSUPPORTED_PIPELINE_VERSION"
	IngestionServiceAggregateRetryableFailure  = "AGGREGATE_TRANSACTION_RETRYABLE"
	IngestionServiceAggregateIntegrityFailure  = "INGESTION_INTEGRITY_FAILURE"
	ingestionUnknownResolutionTimeout          = 2 * time.Second
)

var ErrIngestionAggregateTransient = errors.New("transient ingestion aggregate persistence failure")
var ErrUnsupportedIngestionSchemaVersion = errors.New("unsupported ingestion schema version")
var ErrUnsupportedIngestionPipelineVersion = errors.New("unsupported ingestion pipeline version")
var ingestionSourceKeyPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]{0,79}$`)
var ingestionColorIDPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]{0,79}$`)

type CandidateIngestionSubmission struct {
	CanonicalRequest  json.RawMessage
	IdempotencyKey    string
	ActorUserID       string
	ValidationIssues  json.RawMessage
	DuplicateEvidence json.RawMessage
	SourceReference   *string
}

type canonicalIngestionRequest struct {
	IngestionMetadata ingestionRequestMetadata   `json:"ingestion_metadata"`
	Palette           ingestionPaletteInput      `json:"palette"`
	PreviewCases      []CreatePreviewCaseRequest `json:"preview_cases"`
}

type ingestionRequestMetadata struct {
	ProposalID            string          `json:"proposal_id"`
	SourceKey             string          `json:"source_key"`
	SourceHash            string          `json:"source_hash"`
	NormalizedContentHash string          `json:"normalized_content_hash"`
	PipelineVersion       string          `json:"pipeline_version"`
	SchemaVersion         int             `json:"schema_version"`
	ValidationIssues      json.RawMessage `json:"validation_issues"`
	DuplicateEvidence     json.RawMessage `json:"duplicate_evidence"`
	SourceReference       json.RawMessage `json:"source_reference,omitempty"`
}

type ingestionPaletteColor struct {
	ID    string `json:"id"`
	Hex   string `json:"hex"`
	RGB   [3]int `json:"rgb"`
	Order int    `json:"order"`
}

type ingestionPaletteInput struct {
	Name               string                   `json:"name"`
	Type               string                   `json:"type"`
	Colors             []ingestionPaletteColor  `json:"colors"`
	ColorCount         int                      `json:"color_count"`
	Disciplines        []string                 `json:"disciplines"`
	UseCases           []string                 `json:"use_cases"`
	AvoidCases         []string                 `json:"avoid_cases"`
	Tags               []string                 `json:"tags"`
	ChartApplicability []ChartTypeApplicability `json:"chart_applicability"`
}

type preparedIngestion struct {
	claim    IngestionClaimInput
	palette  CreatePaletteRequest
	previews []CreatePreviewCaseRequest
}

type IngestionServiceResult struct {
	Outcome           string          `json:"outcome"`
	Receipt           json.RawMessage `json:"receipt,omitempty"`
	Replay            bool            `json:"replay,omitempty"`
	Code              string          `json:"code,omitempty"`
	Message           string          `json:"message,omitempty"`
	RetryAfterSeconds int64           `json:"retry_after_seconds,omitempty"`
	MatchedIdentity   string          `json:"matched_identity,omitempty"`
}

type ingestionClaimRepository interface {
	ClaimOrRecover(context.Context, IngestionClaimInput) (*IngestionClaimResult, error)
	Lookup(context.Context, string, string, string) (*IngestionClaimResult, error)
	MarkFailed(context.Context, string, int, string, IngestionFailureInput) (*IngestionRecord, error)
}

type ingestionAggregateTx interface {
	CreateCandidate(*CreatePaletteRequest, string) (*Palette, error)
	CreatePreview(string, *CreatePreviewCaseRequest) (*PalettePreviewCase, error)
	BindSuccess(context.Context, string, int, string, string, json.RawMessage) (*IngestionRecord, error)
	Commit() error
	Rollback() error
}

type ingestionAggregateFactory interface {
	BeginAggregate(context.Context) (ingestionAggregateTx, error)
}

type IngestionService struct {
	claims       ingestionClaimRepository
	aggregates   ingestionAggregateFactory
	candidates   *CandidateAggregateService
	unknownAfter int64
}

func NewIngestionService() (*IngestionService, error) {
	cfg, err := config.LoadIngestionRecoveryConfig()
	if err != nil {
		return nil, err
	}
	return NewIngestionServiceWithConfig(cfg)
}

func NewIngestionServiceWithConfig(cfg config.IngestionRecoveryConfig) (*IngestionService, error) {
	if cfg.RetryBackoffSeconds != IngestionRetryBackoffSeconds || cfg.AutomaticAttemptLimit != MaxAutomaticIngestionAttempts || cfg.UnknownRetryAfterSeconds != 5 {
		return nil, fmt.Errorf("ingestion recovery configuration does not match the frozen contract")
	}
	repo, err := NewIngestionRepositoryWithLease(cfg.LeaseSeconds)
	if err != nil {
		return nil, err
	}
	return &IngestionService{claims: repo, aggregates: sqlIngestionAggregateFactory{claims: repo, palettes: NewRepository()}, candidates: NewCandidateAggregateService(), unknownAfter: int64(cfg.UnknownRetryAfterSeconds)}, nil
}

func newIngestionService(claims ingestionClaimRepository, aggregates ingestionAggregateFactory, unknownAfter int64) *IngestionService {
	return &IngestionService{claims: claims, aggregates: aggregates, candidates: NewCandidateAggregateService(), unknownAfter: unknownAfter}
}

func (s *IngestionService) Ingest(ctx context.Context, input CandidateIngestionSubmission) (result *IngestionServiceResult) {
	prepared, err := prepareIngestion(input)
	if err != nil {
		if errors.Is(err, ErrUnsupportedIngestionSchemaVersion) {
			return safeServiceFailure(IngestionServiceUnsupportedSchemaVersion, "The ingestion schema version is not supported.")
		}
		if errors.Is(err, ErrUnsupportedIngestionPipelineVersion) {
			return safeServiceFailure(IngestionServiceUnsupportedPipelineVersion, "The ingestion pipeline version is not supported.")
		}
		return safeServiceFailure(IngestionServiceValidationFailed, "Canonical ingestion request validation failed.")
	}
	claim, err := s.claims.ClaimOrRecover(ctx, prepared.claim)
	if err != nil {
		return safeServiceFailure(IngestionServiceInternalError, "Ingestion persistence is temporarily unavailable.")
	}
	if claim == nil || claim.Record == nil {
		return safeServiceFailure(IngestionServiceInternalError, "Ingestion persistence returned an invalid result.")
	}
	switch claim.Outcome {
	case IngestionClaimed, IngestionRecovered:
		return s.runAggregate(ctx, prepared, claim)
	case IngestionReplay:
		return receiptResult(IngestionServiceReplayed, claim.Record.Receipt, true)
	case IngestionInProgress:
		return typedServiceOutcome(IngestionInProgress, claim.RetryAfterSeconds, claim.MatchedIdentity)
	case IngestionIdempotencyPayloadMismatch, IngestionProposalIDConflict, IngestionExactContentDuplicate:
		return typedServiceOutcome(claim.Outcome, 0, claim.MatchedIdentity)
	case IngestionRetryableFailure:
		return typedServiceOutcome(IngestionServiceRetryNotReady, claim.RetryAfterSeconds, "")
	case IngestionFailed:
		return persistedFailureResult(claim.Record)
	}
	return safeServiceFailure(IngestionServiceInternalError, "Ingestion persistence returned an unsupported outcome.")
}

func (s *IngestionService) runAggregate(ctx context.Context, prepared *preparedIngestion, claim *IngestionClaimResult) (result *IngestionServiceResult) {
	tx, err := s.aggregates.BeginAggregate(ctx)
	if err != nil {
		if isKnownTransientAggregateError(err) {
			return s.markKnownFailure(ctx, claim, true)
		}
		return safeServiceFailure(IngestionServiceInternalError, "The candidate aggregate could not be started safely.")
	}
	finished := false
	defer func() {
		if recovered := recover(); recovered != nil {
			rollbackErr := tx.Rollback()
			finished = true
			if rollbackErr == nil {
				result = safeServiceFailure(IngestionServiceInternalError, "Ingestion aggregate failed safely.")
			} else {
				result = s.resolveUnknown(prepared.claim, false)
			}
		}
		if !finished {
			_ = tx.Rollback()
		}
	}()

	aggregate, err := s.candidates.Create(tx, CandidateAggregateInput{Palette: candidatePaletteInputFromOffline(prepared.palette), PreviewCases: prepared.previews, ActorUserID: prepared.claim.ActorUserID})
	if err != nil {
		finished = true
		return s.rollbackAndClassify(ctx, tx, claim, err)
	}
	receipt, err := json.Marshal(ingestionReceipt{
		ProposalID: prepared.claim.ProposalID, NormalizedContentHash: prepared.claim.NormalizedContentHash,
		RequestFingerprint: prepared.claim.RequestFingerprint, PaletteID: aggregate.PaletteID, Slug: aggregate.Slug,
		Status: "candidate", PreviewCaseIDs: aggregate.PreviewCaseIDs,
	})
	if err != nil {
		finished = true
		return s.rollbackAndClassify(ctx, tx, claim, err)
	}
	bound, bindErr := tx.BindSuccess(ctx, claim.Record.ID, claim.Record.AttemptCount, claim.LeaseToken, aggregate.PaletteID, receipt)
	if bindErr != nil {
		finished = true
		return s.rollbackBindFailure(ctx, tx, claim, bindErr)
	}
	if err = tx.Commit(); err != nil {
		finished = true
		return s.resolveUnknown(prepared.claim, true)
	}
	finished = true
	return receiptResult(IngestionServiceCreated, bound.Receipt, false)
}

func candidatePaletteInputFromOffline(input CreatePaletteRequest) CandidatePaletteInput {
	return CandidatePaletteInput{
		Name: input.Name, Slug: input.Slug, Colors: input.Colors, ColorCount: input.ColorCount, Type: input.Type,
		ChartTypes: input.ChartTypes, ChartApplicability: input.ChartApplicability, JournalStyle: input.JournalStyle,
		Discipline: input.Discipline, UseCase: input.UseCase, AvoidCase: input.AvoidCase, Tags: input.Tags,
		Accessibility: input.Accessibility, SourceType: input.SourceType, SourceImage: input.SourceImage,
		SourceNote: input.SourceNote, Version: input.Version,
	}
}

func (s *IngestionService) rollbackAndClassify(ctx context.Context, tx ingestionAggregateTx, claim *IngestionClaimResult, cause error) *IngestionServiceResult {
	err := tx.Rollback()
	if err != nil {
		return s.resolveUnknown(IngestionClaimInput{ActorUserID: claim.Record.ActorUserID, Operation: claim.Record.Operation, IdempotencyKey: claim.Record.IdempotencyKey}, false)
	}
	_, validation := IsValidationError(cause)
	if validation || errors.Is(cause, ErrIngestionReceipt) {
		return s.markKnownFailure(ctx, claim, false)
	}
	if isKnownTransientAggregateError(cause) {
		return s.markKnownFailure(ctx, claim, true)
	}
	return safeServiceFailure(IngestionServiceInternalError, "The candidate aggregate failed safely.")
}

func (s *IngestionService) rollbackBindFailure(ctx context.Context, tx ingestionAggregateTx, claim *IngestionClaimResult, cause error) *IngestionServiceResult {
	if err := tx.Rollback(); err != nil {
		return s.resolveAuthoritative(IngestionClaimInput{ActorUserID: claim.Record.ActorUserID, Operation: claim.Record.Operation, IdempotencyKey: claim.Record.IdempotencyKey}, false)
	}
	if errors.Is(cause, ErrIngestionClaimState) {
		return s.resolveAuthoritative(IngestionClaimInput{ActorUserID: claim.Record.ActorUserID, Operation: claim.Record.Operation, IdempotencyKey: claim.Record.IdempotencyKey}, false)
	}
	if errors.Is(cause, ErrIngestionReceipt) {
		return s.markKnownFailure(ctx, claim, false)
	}
	if isKnownTransientAggregateError(cause) {
		return s.markKnownFailure(ctx, claim, true)
	}
	return safeServiceFailure(IngestionServiceInternalError, "The candidate aggregate binding failed safely.")
}

func isKnownTransientAggregateError(err error) bool {
	if errors.Is(err, ErrIngestionAggregateTransient) {
		return true
	}
	var pqErr *pq.Error
	if !errors.As(err, &pqErr) {
		return false
	}
	class := string(pqErr.Code.Class())
	return class == "08" || class == "40" || class == "53" || class == "57"
}

func (s *IngestionService) markKnownFailure(ctx context.Context, claim *IngestionClaimResult, retryable bool) *IngestionServiceResult {
	code := IngestionServiceAggregateIntegrityFailure
	message := "The candidate aggregate violated an ingestion invariant."
	if retryable {
		code = IngestionServiceAggregateRetryableFailure
		message = "The candidate aggregate could not be persisted."
	}
	markCtx := ctx
	cancel := func() {}
	if ctx.Err() != nil {
		markCtx, cancel = context.WithTimeout(context.Background(), ingestionUnknownResolutionTimeout)
	}
	defer cancel()
	record, err := s.claims.MarkFailed(markCtx, claim.Record.ID, claim.Record.AttemptCount, claim.LeaseToken, IngestionFailureInput{Code: code, Summary: message, Retryable: retryable})
	if err != nil {
		if errors.Is(err, ErrIngestionClaimState) {
			return s.resolveAuthoritative(IngestionClaimInput{ActorUserID: claim.Record.ActorUserID, Operation: claim.Record.Operation, IdempotencyKey: claim.Record.IdempotencyKey}, false)
		}
		return safeServiceFailure(IngestionServiceInternalError, "Ingestion failure state could not be confirmed.")
	}
	if record != nil && record.FailureRetryable != nil && *record.FailureRetryable {
		return typedServiceOutcome(IngestionServiceRetryNotReady, IngestionRetryBackoffSeconds, "")
	}
	return persistedFailureResult(record)
}

func (s *IngestionService) resolveUnknown(claim IngestionClaimInput, committedPossibly bool) *IngestionServiceResult {
	return s.resolveAuthoritative(claim, committedPossibly)
}

func (s *IngestionService) resolveAuthoritative(claim IngestionClaimInput, recoveredAfterUnknown bool) *IngestionServiceResult {
	ctx, cancel := context.WithTimeout(context.Background(), ingestionUnknownResolutionTimeout)
	defer cancel()
	lookup, err := s.claims.Lookup(ctx, claim.ActorUserID, claim.Operation, claim.IdempotencyKey)
	if err != nil || lookup == nil || lookup.Record == nil {
		return &IngestionServiceResult{Outcome: IngestionServiceOutcomeUnknown, Code: IngestionServiceOutcomeUnknown, Message: "The ingestion outcome could not be confirmed.", RetryAfterSeconds: s.unknownAfter}
	}
	switch lookup.Outcome {
	case IngestionReplay:
		outcome := IngestionServiceReplayed
		if recoveredAfterUnknown {
			outcome = IngestionServiceRecoveredUnknown
		}
		return receiptResult(outcome, lookup.Record.Receipt, true)
	case IngestionInProgress:
		return typedServiceOutcome(IngestionInProgress, lookup.RetryAfterSeconds, "")
	case IngestionRetryableFailure:
		return typedServiceOutcome(IngestionServiceRetryNotReady, lookup.RetryAfterSeconds, "")
	case IngestionFailed:
		return persistedFailureResult(lookup.Record)
	}
	return safeServiceFailure(IngestionServiceInternalError, "The authoritative ingestion state is unsupported.")
}

func prepareIngestion(input CandidateIngestionSubmission) (*preparedIngestion, error) {
	var request canonicalIngestionRequest
	decoder := json.NewDecoder(strings.NewReader(string(input.CanonicalRequest)))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil {
		return nil, err
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		return nil, errors.New("trailing canonical request data")
	}
	if err := validateRawPreviewSeedContract(input.CanonicalRequest); err != nil {
		return nil, err
	}
	meta := request.IngestionMetadata
	if meta.SchemaVersion != 1 {
		return nil, ErrUnsupportedIngestionSchemaVersion
	}
	if meta.PipelineVersion != IngestionPipelineVersion {
		return nil, ErrUnsupportedIngestionPipelineVersion
	}
	if meta.ProposalID == "" || !ingestionSourceKeyPattern.MatchString(meta.SourceKey) || !isSHA256(meta.SourceHash) || !isSHA256(meta.NormalizedContentHash) || !ingestionUUIDPattern.MatchString(input.IdempotencyKey) || !ingestionUUIDPattern.MatchString(input.ActorUserID) {
		return nil, errors.New("invalid ingestion metadata")
	}
	if err := validateCanonicalEvidence(meta.ValidationIssues, meta.DuplicateEvidence); err != nil {
		return nil, err
	}
	var sourceReference *string
	if len(meta.SourceReference) > 0 {
		var value string
		if string(meta.SourceReference) == "null" || json.Unmarshal(meta.SourceReference, &value) != nil || value == "" || len(value) > 2000 {
			return nil, errors.New("invalid source_reference")
		}
		sourceReference = &value
	}
	fingerprint, err := canonicalJSONHash(input.CanonicalRequest)
	if err != nil {
		return nil, err
	}
	if request.PreviewCases == nil || request.Palette.Disciplines == nil || request.Palette.UseCases == nil || request.Palette.AvoidCases == nil || request.Palette.Tags == nil ||
		len(request.Palette.Colors) == 0 || len(request.Palette.Colors) > 64 || request.Palette.ColorCount != len(request.Palette.Colors) || !canonicalPaletteTypes[request.Palette.Type] || strings.TrimSpace(request.Palette.Name) == "" || len(request.Palette.ChartApplicability) == 0 {
		return nil, errors.New("invalid palette aggregate")
	}
	seenColors := map[string]bool{}
	colors := make([]PaletteColor, len(request.Palette.Colors))
	contentColors := make([]interface{}, len(request.Palette.Colors))
	for i, color := range request.Palette.Colors {
		if !ingestionColorIDPattern.MatchString(color.ID) || seenColors[color.ID] || color.Order != i || NormalizeHex(color.Hex) != color.Hex || HexToRGB(color.Hex) != color.RGB {
			return nil, errors.New("invalid ordered palette colors")
		}
		seenColors[color.ID] = true
		colors[i] = PaletteColor{ID: color.ID, Hex: color.Hex, RGB: color.RGB, Order: color.Order}
		contentColors[i] = map[string]interface{}{"provisional_id": color.ID, "hex": color.Hex, "order": color.Order}
	}
	contentHash, err := canonicalValueHash(normalizedIngestionContent(request, contentColors))
	if err != nil || contentHash != meta.NormalizedContentHash {
		return nil, errors.New("normalized content hash mismatch")
	}
	colorsJSON, _ := json.Marshal(colors)
	appJSON, _ := json.Marshal(request.Palette.ChartApplicability)
	optional := OptionalChartApplicability{Present: true, Raw: appJSON, Value: append([]ChartTypeApplicability(nil), request.Palette.ChartApplicability...)}
	palette := CreatePaletteRequest{
		Name: request.Palette.Name, Slug: GenerateSlug(request.Palette.Name) + "-" + fingerprint[:12], Colors: colorsJSON,
		ColorCount: len(colors), Type: request.Palette.Type, Discipline: append([]string(nil), request.Palette.Disciplines...),
		UseCase: append([]string(nil), request.Palette.UseCases...), AvoidCase: append([]string(nil), request.Palette.AvoidCases...),
		Tags: append([]string(nil), request.Palette.Tags...), ChartApplicability: optional, Status: "candidate", SourceType: "curated",
	}
	applicability, err := normalizeChartApplicability(&palette.ChartApplicability)
	if err != nil {
		return nil, err
	}
	palette.ChartApplicability.Value = applicability
	palette.ChartTypes = deriveChartTypesFromApplicability(applicability)
	paletteModel := &Palette{Colors: colorsJSON}
	previews := make([]CreatePreviewCaseRequest, len(request.PreviewCases))
	for i := range request.PreviewCases {
		candidate := request.PreviewCases[i]
		if err := validateCreatePreviewCaseRequest(&candidate); err != nil {
			return nil, err
		}
		pc := previewCaseCandidate{ChartType: candidate.ChartType, TemplateID: candidate.TemplateID, TemplateVersion: candidate.TemplateVersion, SchemaVersion: candidate.SchemaVersion, ColorRoles: candidate.ColorRoles, PreviewConfig: candidate.PreviewConfig, SeedStrategy: candidate.SeedStrategy, SeedValue: candidate.SeedValue}
		if err := (&Service{}).validatePreviewCaseCandidate(paletteModel, &pc); err != nil {
			return nil, err
		}
		previews[i] = clonePreviewRequest(candidate)
	}
	return &preparedIngestion{claim: IngestionClaimInput{
		ProposalID: meta.ProposalID, SourceKey: meta.SourceKey, SourceHash: meta.SourceHash, NormalizedContentHash: meta.NormalizedContentHash,
		Operation: IngestionOperationPaletteCandidate, IdempotencyKey: input.IdempotencyKey, RequestFingerprint: fingerprint,
		PipelineVersion: meta.PipelineVersion, SchemaVersion: meta.SchemaVersion, ValidationIssues: append(json.RawMessage(nil), meta.ValidationIssues...),
		DuplicateEvidence: append(json.RawMessage(nil), meta.DuplicateEvidence...), SourceReference: sourceReference, ActorUserID: input.ActorUserID,
	}, palette: palette, previews: previews}, nil
}

func validateRawPreviewSeedContract(raw json.RawMessage) error {
	var envelope struct {
		PreviewCases []map[string]json.RawMessage `json:"preview_cases"`
	}
	if err := json.Unmarshal(raw, &envelope); err != nil {
		return err
	}
	for index, preview := range envelope.PreviewCases {
		value, present := preview["seed_value"]
		if present && strings.TrimSpace(string(value)) == "null" {
			return fmt.Errorf("preview_cases[%d].seed_value must not be null", index)
		}
		var strategy string
		if rawStrategy, ok := preview["seed_strategy"]; ok {
			if err := json.Unmarshal(rawStrategy, &strategy); err != nil {
				return fmt.Errorf("preview_cases[%d].seed_strategy is invalid", index)
			}
		}
		if strategy == PreviewCaseSeedStrategyStableID && present {
			return fmt.Errorf("preview_cases[%d].seed_value must be omitted for stable_id", index)
		}
	}
	return nil
}

func normalizedIngestionContent(request canonicalIngestionRequest, contentColors []interface{}) map[string]interface{} {
	return map[string]interface{}{
		"schema_version": request.IngestionMetadata.SchemaVersion,
		"colors":         contentColors,
		"palette": map[string]interface{}{
			"name": request.Palette.Name, "type": request.Palette.Type,
			"disciplines": request.Palette.Disciplines, "use_cases": request.Palette.UseCases,
			"avoid_cases": request.Palette.AvoidCases, "tags": request.Palette.Tags,
			"chart_applicability": request.Palette.ChartApplicability,
		},
		"preview_cases": request.PreviewCases,
	}
}

func validateCanonicalEvidence(validationIssues, duplicateEvidence json.RawMessage) error {
	if err := validateEvidenceArray(validationIssues, nil, nil, validateValidationIssueObject); err != nil {
		return fmt.Errorf("invalid validation_issues: %w", err)
	}
	if err := validateEvidenceArray(duplicateEvidence, nil, nil, validateDuplicateEvidenceObject); err != nil {
		return fmt.Errorf("invalid duplicate_evidence: %w", err)
	}
	return nil
}

var validationIssueKeys = stringSet("path", "code", "message", "severity", "source")
var validationIssueRequired = stringSet("path", "code", "message", "severity", "source")
var exactEvidenceKeys = stringSet("kind", "fingerprint_type", "fingerprint_version", "fingerprint", "current_identity", "matched_identity", "scope", "path", "code", "message", "severity", "source")
var perceptualEvidenceKeys = stringSet("kind", "perceptual_policy_version", "color_conversion_version", "current_identity", "matched_identity", "scope", "current_color_count", "matched_color_count", "mean_distance", "maximum_pair_distance", "matched_pairs", "mean_threshold", "max_threshold", "path", "code", "message", "severity", "source")

func validateValidationIssueObject(object map[string]json.RawMessage) error {
	if err := validateEvidenceKeys(object, validationIssueKeys, validationIssueRequired); err != nil {
		return err
	}
	for _, key := range []string{"path", "code", "message", "severity", "source"} {
		if _, err := evidenceString(object, key); err != nil {
			return err
		}
	}
	severity, _ := evidenceString(object, "severity")
	source, _ := evidenceString(object, "source")
	if !stringSet("error", "warning", "info")[severity] || !stringSet("input", "extraction", "normalization", "domain", "duplicate", "import")[source] {
		return errors.New("unsupported validation issue severity or source")
	}
	code, _ := evidenceString(object, "code")
	if !regexp.MustCompile(`^[A-Z][A-Z0-9_]+$`).MatchString(code) {
		return errors.New("invalid validation issue code")
	}
	return nil
}

func validateEvidenceArray(raw json.RawMessage, allowed, required map[string]bool, objectValidator func(map[string]json.RawMessage) error) error {
	if len(raw) == 0 || string(raw) == "null" {
		return errors.New("required evidence array is missing or null")
	}
	var entries []json.RawMessage
	decoder := json.NewDecoder(strings.NewReader(string(raw)))
	if err := decoder.Decode(&entries); err != nil {
		return err
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		return errors.New("trailing evidence data")
	}
	for _, entry := range entries {
		var object map[string]json.RawMessage
		objectDecoder := json.NewDecoder(strings.NewReader(string(entry)))
		if err := objectDecoder.Decode(&object); err != nil || object == nil {
			return errors.New("evidence entry must be an object")
		}
		if objectValidator != nil {
			if err := objectValidator(object); err != nil {
				return err
			}
		} else if err := validateEvidenceKeys(object, allowed, required); err != nil {
			return err
		}
	}
	return nil
}

func validateDuplicateEvidenceObject(object map[string]json.RawMessage) error {
	var kind string
	if err := json.Unmarshal(object["kind"], &kind); err != nil {
		return errors.New("duplicate evidence kind is required")
	}
	switch kind {
	case "source_identity", "canonical_content":
		if err := validateEvidenceKeys(object, exactEvidenceKeys, exactEvidenceKeys); err != nil {
			return err
		}
		for _, key := range []string{"fingerprint_type", "fingerprint", "current_identity", "matched_identity", "scope", "path", "code", "message", "severity", "source"} {
			if _, err := evidenceString(object, key); err != nil {
				return err
			}
		}
		version, err := evidenceInt(object, "fingerprint_version")
		if err != nil || version != 1 {
			return errors.New("unsupported exact evidence fingerprint version")
		}
		return nil
	case "perceptual_similarity":
		if err := validateEvidenceKeys(object, perceptualEvidenceKeys, perceptualEvidenceKeys); err != nil {
			return err
		}
		for _, key := range []string{"current_identity", "matched_identity", "scope", "path", "code", "message", "severity", "source"} {
			if _, err := evidenceString(object, key); err != nil {
				return err
			}
		}
		for _, key := range []string{"perceptual_policy_version", "color_conversion_version", "current_color_count", "matched_color_count"} {
			if _, err := evidenceInt(object, key); err != nil {
				return err
			}
		}
		for _, key := range []string{"mean_distance", "maximum_pair_distance", "mean_threshold", "max_threshold"} {
			if _, err := evidenceNumber(object, key); err != nil {
				return err
			}
		}
		var pairs []map[string]json.RawMessage
		if err := json.Unmarshal(object["matched_pairs"], &pairs); err != nil {
			return errors.New("matched_pairs must be an array")
		}
		pairKeys := stringSet("current_index", "matched_index", "current_hex", "matched_hex", "distance")
		for _, pair := range pairs {
			if err := validateEvidenceKeys(pair, pairKeys, pairKeys); err != nil {
				return err
			}
			for _, key := range []string{"current_index", "matched_index"} {
				if _, err := evidenceInt(pair, key); err != nil {
					return err
				}
			}
			for _, key := range []string{"current_hex", "matched_hex"} {
				if _, err := evidenceString(pair, key); err != nil {
					return err
				}
			}
			if _, err := evidenceNumber(pair, "distance"); err != nil {
				return err
			}
		}
		return nil
	default:
		return errors.New("unsupported duplicate evidence kind")
	}
}

func evidenceString(object map[string]json.RawMessage, key string) (string, error) {
	var value string
	if err := json.Unmarshal(object[key], &value); err != nil {
		return "", fmt.Errorf("evidence field %q must be a string", key)
	}
	return value, nil
}

func evidenceInt(object map[string]json.RawMessage, key string) (int, error) {
	var value int
	if err := json.Unmarshal(object[key], &value); err != nil {
		return 0, fmt.Errorf("evidence field %q must be an integer", key)
	}
	return value, nil
}

func evidenceNumber(object map[string]json.RawMessage, key string) (float64, error) {
	var value float64
	if err := json.Unmarshal(object[key], &value); err != nil {
		return 0, fmt.Errorf("evidence field %q must be a number", key)
	}
	return value, nil
}

func validateEvidenceKeys(object map[string]json.RawMessage, allowed, required map[string]bool) error {
	for key := range object {
		if !allowed[key] {
			return fmt.Errorf("unknown evidence field %q", key)
		}
	}
	for key := range required {
		if _, ok := object[key]; !ok {
			return fmt.Errorf("required evidence field %q is missing", key)
		}
	}
	return nil
}

func stringSet(values ...string) map[string]bool {
	result := make(map[string]bool, len(values))
	for _, value := range values {
		result[value] = true
	}
	return result
}

func canonicalJSONHash(raw json.RawMessage) (string, error) {
	_, hash, err := figjcs.Hash(raw)
	return hash, err
}

func canonicalValueHash(value interface{}) (string, error) {
	raw, err := json.Marshal(value)
	if err != nil {
		return "", err
	}
	return canonicalJSONHash(raw)
}

func isSHA256(value string) bool {
	_, err := hex.DecodeString(value)
	return len(value) == 64 && err == nil && value == strings.ToLower(value)
}
func cloneString(value *string) *string {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}
func clonePreviewRequest(value CreatePreviewCaseRequest) CreatePreviewCaseRequest {
	value.ColorRoles = append(json.RawMessage(nil), value.ColorRoles...)
	value.PreviewConfig = append(json.RawMessage(nil), value.PreviewConfig...)
	if value.SeedValue != nil {
		copy := *value.SeedValue
		value.SeedValue = &copy
	}
	return value
}
func receiptResult(outcome string, receipt json.RawMessage, replay bool) *IngestionServiceResult {
	return &IngestionServiceResult{Outcome: outcome, Receipt: append(json.RawMessage(nil), receipt...), Replay: replay}
}
func typedServiceOutcome(code string, retry int64, matched string) *IngestionServiceResult {
	return &IngestionServiceResult{Outcome: code, Code: code, Message: "The ingestion request could not proceed in its current state.", RetryAfterSeconds: retry, MatchedIdentity: matched}
}
func persistedFailureResult(record *IngestionRecord) *IngestionServiceResult {
	code := IngestionFailed
	if record != nil && record.FailureCode != nil {
		code = *record.FailureCode
	}
	return &IngestionServiceResult{Outcome: IngestionFailed, Code: code, Message: "The ingestion request is in a failed state."}
}
func safeServiceFailure(code, message string) *IngestionServiceResult {
	return &IngestionServiceResult{Outcome: code, Code: code, Message: message}
}

type sqlIngestionAggregateFactory struct {
	claims   *IngestionRepository
	palettes *Repository
}

func (f sqlIngestionAggregateFactory) BeginAggregate(ctx context.Context) (ingestionAggregateTx, error) {
	tx, err := database.DB.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	return &sqlIngestionAggregateTx{tx: tx, claims: f.claims, palettes: f.palettes}, nil
}

type sqlIngestionAggregateTx struct {
	tx       *sql.Tx
	claims   *IngestionRepository
	palettes *Repository
}

func (t *sqlIngestionAggregateTx) CreateCandidate(req *CreatePaletteRequest, actor string) (*Palette, error) {
	return t.palettes.CreateCandidateTx(t.tx, req, actor)
}
func (t *sqlIngestionAggregateTx) CreatePreview(id string, req *CreatePreviewCaseRequest) (*PalettePreviewCase, error) {
	return t.palettes.CreatePreviewCaseTx(t.tx, id, req)
}
func (t *sqlIngestionAggregateTx) BindSuccess(ctx context.Context, record string, attempt int, lease, paletteID string, receipt json.RawMessage) (*IngestionRecord, error) {
	return t.claims.BindSuccessTx(ctx, t.tx, record, attempt, lease, paletteID, receipt)
}
func (t *sqlIngestionAggregateTx) Commit() error   { return t.tx.Commit() }
func (t *sqlIngestionAggregateTx) Rollback() error { return t.tx.Rollback() }
