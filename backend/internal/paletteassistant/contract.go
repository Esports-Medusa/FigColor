// Package paletteassistant owns the dependency-light, online-only wire contract
// for the Admin Image Palette Assistant. It contains no handlers, persistence,
// image decoding, signing, frontend, or offline-ingestion dependencies.
package paletteassistant

import (
	"encoding/json"
	"reflect"
	"time"
)

const (
	ContractVersion = "palette-assistant.v1"

	AnalyzePath                     = "/api/admin/palette-assistant/analyze"
	ValidatePath                    = "/api/admin/palette-assistant/validate"
	CreateCandidatePath             = "/api/admin/palette-assistant/candidates"
	AnalyzeImageField               = "image"
	ImageFormatPNG                  = "png"
	ImageFormatJPEG                 = "jpeg"
	MultipartBodyLimit              = 8 * 1024 * 1024
	EncodedImageLimit               = 6 * 1024 * 1024
	MaximumImageWidth               = 4096
	MaximumImageHeight              = 4096
	MaximumImagePixels              = 8_000_000
	AnalysisTimeout                 = 5 * time.Second
	ReceiptLifetime                 = 15 * time.Minute
	DraftDigestVersion              = 1
	CreateIntentDigestVersion       = 1
	ExactFingerprintVersion         = 1
	FindingEnvelopeVersion          = 1
	ValidationReceiptVersion        = 1
	ConfirmationVersion             = 1
	DuplicatePolicyVersion          = 1
	SimilarityPolicyVersion         = 1
	ValidationReceiptSecretEnv      = "PALETTE_ASSISTANT_VALIDATION_RECEIPT_SECRET"
	ValidationReceiptMinSecretBytes = 32
	PreviewJSONByteLimit            = 32 * 1024
	OnlineSourceType                = "figure_extracted"
	RejectMissingRequiredFields     = true
	RejectNullRequiredFields        = true
	RejectUnknownFields             = true
	RejectDuplicateJSONKeys         = true
)

var SupportedImageFormats = [...]string{ImageFormatPNG, ImageFormatJPEG}

type SuggestionSource string

const (
	SourceAssistant SuggestionSource = "assistant"
	SourceAdmin     SuggestionSource = "admin"
)

type SuggestionState string

const (
	StateUnconfirmed SuggestionState = "unconfirmed"
	StateAccepted    SuggestionState = "accepted"
	StateModified    SuggestionState = "modified"
	StateCleared     SuggestionState = "cleared"
)

// AssistantDraft is browser-owned authoring state. DraftColor.ID is a
// Draft-local reference only; it is never an authoritative persisted color ID.
// Server-controlled Palette fields and server warning findings are absent.
type AssistantDraft struct {
	ContractVersion    string                    `json:"contract_version"`
	Revision           uint64                    `json:"revision"`
	Name               string                    `json:"name"`
	Type               string                    `json:"type"`
	Colors             []DraftColor              `json:"colors"`
	ChartApplicability []DraftChartApplicability `json:"chart_applicability"`
	Disciplines        []string                  `json:"disciplines"`
	UseCases           []string                  `json:"use_cases"`
	AvoidCases         []string                  `json:"avoid_cases"`
	Tags               []string                  `json:"tags"`
	Accessibility      DraftAccessibility        `json:"accessibility"`
	SourceType         string                    `json:"source_type"`
	SourceNote         string                    `json:"source_note"`
	PreviewCases       []DraftPreviewCase        `json:"preview_cases"`
	Provenance         []SuggestionProvenance    `json:"provenance"`
}

func (d AssistantDraft) MarshalJSON() ([]byte, error) {
	type plain AssistantDraft
	d.Colors = nonNil(d.Colors)
	d.ChartApplicability = nonNil(d.ChartApplicability)
	d.Disciplines = nonNil(d.Disciplines)
	d.UseCases = nonNil(d.UseCases)
	d.AvoidCases = nonNil(d.AvoidCases)
	d.Tags = nonNil(d.Tags)
	d.PreviewCases = nonNil(d.PreviewCases)
	d.Provenance = nonNil(d.Provenance)
	return json.Marshal(plain(d))
}

type DraftColor struct {
	ID     string           `json:"id"`
	Hex    string           `json:"hex"`
	Label  string           `json:"label,omitempty"`
	Order  int              `json:"order"`
	Source SuggestionSource `json:"source"`
	State  SuggestionState  `json:"state"`
}

type SuggestionProvenance struct {
	Path             string           `json:"path"`
	Source           SuggestionSource `json:"source"`
	State            SuggestionState  `json:"state"`
	Producer         string           `json:"producer"`
	AlgorithmVersion string           `json:"algorithm_version"`
	ReasonCodes      []string         `json:"reason_codes"`
	SuggestedValue   json.RawMessage  `json:"suggested_value"`
	AmbiguityGroup   string           `json:"ambiguity_group,omitempty"`
}

func (p SuggestionProvenance) MarshalJSON() ([]byte, error) {
	if p.Producer == "" || p.AlgorithmVersion == "" || len(p.ReasonCodes) == 0 || len(p.SuggestedValue) == 0 || !json.Valid(p.SuggestedValue) {
		return nil, unsupportedContractValue(p, "complete suggestion provenance required")
	}
	type plain SuggestionProvenance
	p.ReasonCodes = nonNil(p.ReasonCodes)
	return json.Marshal(plain(p))
}

type DraftChartApplicability struct {
	ChartType   string `json:"chart_type"`
	Suitability string `json:"suitability"`
	Notes       string `json:"notes,omitempty"`
}

type DraftAccessibility struct {
	ColorblindSafe bool `json:"colorblind_safe"`
	PrintFriendly  bool `json:"print_friendly"`
	DarkBackground bool `json:"dark_background"`
}

// ColorRoles and PreviewConfig must each be a non-null JSON object, no larger
// than PreviewJSONByteLimit bytes. Validation rejects nil, empty, null, arrays,
// malformed JSON, and unknown schema fields. Their RFC 8785 canonical forms,
// not their input byte spelling, participate in the Draft digest.
type DraftPreviewCase struct {
	ChartType       string          `json:"chart_type"`
	TemplateID      string          `json:"template_id"`
	TemplateVersion int             `json:"template_version"`
	SchemaVersion   int             `json:"schema_version"`
	ColorRoles      json.RawMessage `json:"color_roles"`
	PreviewConfig   json.RawMessage `json:"preview_config"`
	SeedStrategy    string          `json:"seed_strategy"`
	SeedValue       *int            `json:"seed_value,omitempty"`
}

// WarningFinding is server-issued response data, never AssistantDraft content.
// ID is a lowercase SHA-256 fingerprint over code, normalized path, authorized
// Palette identity (if any), policy/version, and canonical normalized Params.
type WarningFinding struct {
	ID                     string          `json:"id"`
	Code                   string          `json:"code"`
	Path                   string          `json:"path,omitempty"`
	Message                string          `json:"message"`
	Policy                 string          `json:"policy"`
	PaletteID              string          `json:"palette_id,omitempty"`
	Params                 json.RawMessage `json:"params"`
	RequiresAcknowledgment bool            `json:"requires_acknowledgment"`
}

func (f WarningFinding) MarshalJSON() ([]byte, error) {
	if err := requireJSONObject(f.Params, PreviewJSONByteLimit, true); err != nil {
		return nil, err
	}
	type plain WarningFinding
	return json.Marshal(plain(f))
}

type AnalyzeResponse struct {
	ContractVersion  string            `json:"contract_version"`
	AnalysisID       string            `json:"analysis_id"`
	Image            ImageFacts        `json:"image"`
	ColorSuggestions []ColorSuggestion `json:"color_suggestions"`
	StructuralColors []ColorSuggestion `json:"structural_color_suggestions"`
	Draft            AssistantDraft    `json:"draft"`
	Warnings         []WarningFinding  `json:"warnings"`
	AlgorithmVersion string            `json:"algorithm_version"`
}

func (r AnalyzeResponse) MarshalJSON() ([]byte, error) {
	type plain AnalyzeResponse
	r.ColorSuggestions = nonNil(r.ColorSuggestions)
	r.StructuralColors = nonNil(r.StructuralColors)
	r.Warnings = nonNil(r.Warnings)
	return json.Marshal(plain(r))
}

type ImageFacts struct {
	Format          string `json:"format"`
	EncodedBytes    int64  `json:"encoded_bytes"`
	Width           int    `json:"width"`
	Height          int    `json:"height"`
	PixelCount      int64  `json:"pixel_count"`
	HasTransparency bool   `json:"has_transparency"`
	AlphaBackdrop   string `json:"alpha_backdrop"`
	SHA256          string `json:"sha256"`
}

type ColorSuggestion struct {
	ID               string   `json:"id"`
	Hex              string   `json:"hex"`
	PixelCount       int64    `json:"pixel_count"`
	Fraction         float64  `json:"fraction"`
	Producer         string   `json:"producer"`
	AlgorithmVersion string   `json:"algorithm_version"`
	ReasonCodes      []string `json:"reason_codes"`
	AmbiguityGroup   string   `json:"ambiguity_group,omitempty"`
}

func (s ColorSuggestion) MarshalJSON() ([]byte, error) {
	if s.Producer == "" || s.AlgorithmVersion == "" || len(s.ReasonCodes) == 0 {
		return nil, unsupportedContractValue(s, "complete color suggestion evidence required")
	}
	type plain ColorSuggestion
	s.ReasonCodes = nonNil(s.ReasonCodes)
	return json.Marshal(plain(s))
}

type ValidateRequest struct {
	Draft             AssistantDraft `json:"draft"`
	ConfirmedRevision uint64         `json:"confirmed_revision"`
}

type ValidateResponse struct {
	ContractVersion   string              `json:"contract_version"`
	NormalizedDraft   AssistantDraft      `json:"normalized_draft"`
	ValidatedRevision uint64              `json:"validated_revision"`
	DraftDigest       string              `json:"draft_digest"`
	ValidationPolicy  string              `json:"validation_policy"`
	RegistryVersion   string              `json:"registry_version"`
	VocabularyVersion string              `json:"vocabulary_version"`
	Warnings          []WarningFinding    `json:"warnings"`
	Duplicates        []DuplicateFinding  `json:"duplicates"`
	Similarities      []SimilarityFinding `json:"similarities"`
	ValidationReceipt string              `json:"validation_receipt"`
	ReceiptExpiresAt  time.Time           `json:"receipt_expires_at"`
}

func (r ValidateResponse) MarshalJSON() ([]byte, error) {
	type plain ValidateResponse
	r.Warnings = nonNil(r.Warnings)
	r.Duplicates = nonNil(r.Duplicates)
	r.Similarities = nonNil(r.Similarities)
	return json.Marshal(plain(r))
}

type DuplicateFinding struct {
	ID        string `json:"id"`
	PaletteID string `json:"palette_id,omitempty"`
	Kind      string `json:"kind"`
}

type SimilarityFinding struct {
	ID        string          `json:"id"`
	PaletteID string          `json:"palette_id,omitempty"`
	Score     float64         `json:"score"`
	Policy    string          `json:"policy"`
	Params    json.RawMessage `json:"params"`
}

func (f SimilarityFinding) MarshalJSON() ([]byte, error) {
	if err := requireJSONObject(f.Params, PreviewJSONByteLimit, true); err != nil {
		return nil, err
	}
	type plain SimilarityFinding
	return json.Marshal(plain(f))
}

type CreateCandidateRequest struct {
	Draft                  AssistantDraft `json:"draft"`
	ConfirmedRevision      uint64         `json:"confirmed_revision"`
	ValidationReceipt      string         `json:"validation_receipt"`
	WarningAcknowledgments []string       `json:"warning_acknowledgments"`
}

// ValidationReceiptPayload is the canonical authenticated payload. Runtime
// signing is owned by WP-B6 and uses HMAC-SHA-256 over its JCS bytes.
type ValidationReceiptPayload struct {
	Version                 int    `json:"version"`
	DraftDigest             string `json:"draft_digest"`
	ActorUserID             string `json:"actor_user_id"`
	RegistryFingerprint     string `json:"registry_fingerprint"`
	FindingSetDigest        string `json:"finding_set_digest"`
	DuplicatePolicyVersion  int    `json:"duplicate_policy_version"`
	SimilarityPolicyVersion int    `json:"similarity_policy_version"`
	IssuedAt                int64  `json:"issued_at"`
	ExpiresAt               int64  `json:"expires_at"`
}

type exactFingerprintProjection struct {
	Version    int      `json:"version"`
	OrderedHEX []string `json:"ordered_hex"`
}

type findingEnvelope struct {
	Version  int               `json:"version"`
	Findings []protocolFinding `json:"findings"`
}

type protocolFinding struct {
	ID                  string          `json:"id"`
	Kind                string          `json:"kind"`
	Severity            string          `json:"severity"`
	Path                string          `json:"path"`
	Code                string          `json:"code"`
	Message             string          `json:"message"`
	PolicyVersion       int             `json:"policy_version"`
	ComparisonPaletteID string          `json:"comparison_palette_id"`
	Evidence            json.RawMessage `json:"evidence"`
}

type ProtocolFinding = protocolFinding

func ExactFingerprintProjectionValue(hexes []string) any {
	return exactFingerprintProjection{Version: ExactFingerprintVersion, OrderedHEX: append([]string(nil), hexes...)}
}
func FindingEnvelopeValue(findings []ProtocolFinding) any {
	return findingEnvelope{Version: FindingEnvelopeVersion, Findings: append([]protocolFinding(nil), findings...)}
}
func CreateIntentProjectionValue(actor, draftDigest string, revision uint64, acknowledgments []string, findingDigest string) any {
	return createIntentProjection{Version: CreateIntentDigestVersion, ActorUserID: actor, DraftDigest: draftDigest, ConfirmationVersion: ConfirmationVersion, ConfirmedRevision: revision, AcknowledgedFindingIDs: append([]string(nil), acknowledgments...), FindingSetDigest: findingDigest, DuplicatePolicyVersion: DuplicatePolicyVersion, SimilarityPolicyVersion: SimilarityPolicyVersion, RegistryFingerprint: PreviewRegistryFingerprint}
}
func NewProtocolFindingValue(kind, severity, path, code, message string, policyVersion int, paletteID string, evidence json.RawMessage) ProtocolFinding {
	return protocolFinding{Kind: kind, Severity: severity, Path: path, Code: code, Message: message, PolicyVersion: policyVersion, ComparisonPaletteID: paletteID, Evidence: append(json.RawMessage(nil), evidence...)}
}
func SetProtocolFindingID(f ProtocolFinding, id string) ProtocolFinding { f.ID = id; return f }
func ProtocolFindingFields(f ProtocolFinding) (id, kind, severity, path, code, message, paletteID string, evidence json.RawMessage) {
	return f.ID, f.Kind, f.Severity, f.Path, f.Code, f.Message, f.ComparisonPaletteID, append(json.RawMessage(nil), f.Evidence...)
}

type createIntentProjection struct {
	Version                 int      `json:"version"`
	ActorUserID             string   `json:"actor_user_id"`
	DraftDigest             string   `json:"draft_digest"`
	ConfirmationVersion     int      `json:"confirmation_version"`
	ConfirmedRevision       uint64   `json:"confirmed_revision"`
	AcknowledgedFindingIDs  []string `json:"acknowledged_finding_ids"`
	FindingSetDigest        string   `json:"finding_set_digest"`
	DuplicatePolicyVersion  int      `json:"duplicate_policy_version"`
	SimilarityPolicyVersion int      `json:"similarity_policy_version"`
	RegistryFingerprint     string   `json:"registry_fingerprint"`
}

// submissionRecordProjection is internal persistence authority, not a public
// response DTO. WP-B6 freezes its database representation in a migration.
type submissionRecordProjection struct {
	ActorUserID             string          `json:"actor_user_id"`
	IdempotencyKey          string          `json:"idempotency_key"`
	CreateIntentDigest      string          `json:"create_intent_digest"`
	DraftDigest             string          `json:"draft_digest"`
	FindingSetDigest        string          `json:"finding_set_digest"`
	RegistryFingerprint     string          `json:"registry_fingerprint"`
	DuplicatePolicyVersion  int             `json:"duplicate_policy_version"`
	SimilarityPolicyVersion int             `json:"similarity_policy_version"`
	CandidateID             string          `json:"candidate_id,omitempty"`
	Receipt                 json.RawMessage `json:"candidate_receipt,omitempty"`
	Status                  string          `json:"status"`
}

func (r CreateCandidateRequest) MarshalJSON() ([]byte, error) {
	type plain CreateCandidateRequest
	r.WarningAcknowledgments = nonNil(r.WarningAcknowledgments)
	return json.Marshal(plain(r))
}

type CandidateReceipt struct {
	ContractVersion string    `json:"contract_version"`
	ReceiptID       string    `json:"receipt_id"`
	CandidateID     string    `json:"candidate_id"`
	Status          string    `json:"status"`
	PreviewCaseIDs  []string  `json:"preview_case_ids"`
	AdminReviewPath string    `json:"admin_review_path"`
	CreatedAt       time.Time `json:"created_at"`
	Replay          bool      `json:"replay"`
}

func (r CandidateReceipt) MarshalJSON() ([]byte, error) {
	type plain CandidateReceipt
	r.PreviewCaseIDs = nonNil(r.PreviewCaseIDs)
	return json.Marshal(plain(r))
}

type Problem struct {
	Code      ProblemCode  `json:"code"`
	Message   string       `json:"message"`
	Retryable bool         `json:"retryable"`
	Issues    []FieldIssue `json:"issues,omitempty"`
}

type FieldIssue struct {
	Path    string `json:"path"`
	Code    string `json:"code"`
	Message string `json:"message"`
}

type ProblemCode string

type ProblemSpec struct {
	Code       ProblemCode
	HTTPStatus int
	Retryable  bool
	Analyze    bool
	Validate   bool
	Create     bool
}

const (
	ErrAuthenticationRequired        ProblemCode = "AUTHENTICATION_REQUIRED"
	ErrAdminRequired                 ProblemCode = "ADMIN_REQUIRED"
	ErrMalformedRequest              ProblemCode = "MALFORMED_REQUEST"
	ErrMissingImage                  ProblemCode = "MISSING_IMAGE"
	ErrMultipleImages                ProblemCode = "MULTIPLE_IMAGES"
	ErrRequestTooLarge               ProblemCode = "REQUEST_TOO_LARGE"
	ErrUnsupportedMediaType          ProblemCode = "UNSUPPORTED_MEDIA_TYPE"
	ErrImageSignatureMismatch        ProblemCode = "IMAGE_SIGNATURE_MISMATCH"
	ErrImageDecodeFailed             ProblemCode = "IMAGE_DECODE_FAILED"
	ErrImageDimensionsExceeded       ProblemCode = "IMAGE_DIMENSIONS_EXCEEDED"
	ErrImagePixelLimitExceeded       ProblemCode = "IMAGE_PIXEL_LIMIT_EXCEEDED"
	ErrAnalysisTimeout               ProblemCode = "ANALYSIS_TIMEOUT"
	ErrAnalysisOverloaded            ProblemCode = "ANALYSIS_OVERLOADED"
	ErrRequestCancelled              ProblemCode = "REQUEST_CANCELLED"
	ErrInvalidDraft                  ProblemCode = "INVALID_DRAFT"
	ErrStaleRevision                 ProblemCode = "STALE_REVISION"
	ErrConfirmationRequired          ProblemCode = "CONFIRMATION_REQUIRED"
	ErrValidationReceiptMissing      ProblemCode = "VALIDATION_RECEIPT_MISSING"
	ErrValidationReceiptInvalid      ProblemCode = "VALIDATION_RECEIPT_INVALID"
	ErrValidationReceiptExpired      ProblemCode = "VALIDATION_RECEIPT_EXPIRED"
	ErrValidationActorMismatch       ProblemCode = "VALIDATION_ACTOR_MISMATCH"
	ErrValidationPolicyChanged       ProblemCode = "VALIDATION_POLICY_CHANGED"
	ErrExactDuplicateCandidate       ProblemCode = "EXACT_DUPLICATE_CANDIDATE"
	ErrWarningAcknowledgmentRequired ProblemCode = "WARNING_ACKNOWLEDGMENT_REQUIRED"
	ErrWarningAcknowledgmentInvalid  ProblemCode = "WARNING_ACKNOWLEDGMENT_INVALID"
	ErrIdempotencyKeyMissing         ProblemCode = "IDEMPOTENCY_KEY_MISSING"
	ErrIdempotencyKeyInvalid         ProblemCode = "IDEMPOTENCY_KEY_INVALID"
	ErrIdempotencyConflict           ProblemCode = "IDEMPOTENCY_CONFLICT"
	ErrIdempotencyInProgress         ProblemCode = "IDEMPOTENCY_IN_PROGRESS"
	ErrCandidateTransactionFailed    ProblemCode = "CANDIDATE_TRANSACTION_FAILED"
	ErrInternalAnalysisFailure       ProblemCode = "INTERNAL_ANALYSIS_FAILURE"
	ErrInternal                      ProblemCode = "INTERNAL_ERROR"
)

// ProblemSpecs is the complete frozen mapping. Integer statuses keep this
// protocol package independent of net/http and handler concerns.
var ProblemSpecs = [...]ProblemSpec{
	{ErrAuthenticationRequired, 401, false, true, true, true},
	{ErrAdminRequired, 403, false, true, true, true},
	{ErrMalformedRequest, 400, false, true, true, true},
	{ErrMissingImage, 400, false, true, false, false},
	{ErrMultipleImages, 400, false, true, false, false},
	{ErrRequestTooLarge, 413, false, true, false, false},
	{ErrUnsupportedMediaType, 415, false, true, true, true},
	{ErrImageSignatureMismatch, 415, false, true, false, false},
	{ErrImageDecodeFailed, 422, false, true, false, false},
	{ErrImageDimensionsExceeded, 422, false, true, false, false},
	{ErrImagePixelLimitExceeded, 422, false, true, false, false},
	{ErrAnalysisTimeout, 504, true, true, false, false},
	{ErrAnalysisOverloaded, 503, true, true, false, false},
	{ErrRequestCancelled, 499, true, true, true, true},
	{ErrInvalidDraft, 422, false, false, true, true},
	{ErrStaleRevision, 409, false, false, true, true},
	{ErrConfirmationRequired, 409, false, false, true, true},
	{ErrValidationReceiptMissing, 400, false, false, false, true},
	{ErrValidationReceiptInvalid, 400, false, false, false, true},
	{ErrValidationReceiptExpired, 409, true, false, false, true},
	{ErrValidationActorMismatch, 403, false, false, false, true},
	{ErrValidationPolicyChanged, 409, true, false, false, true},
	{ErrExactDuplicateCandidate, 409, false, false, true, true},
	{ErrWarningAcknowledgmentRequired, 422, false, false, false, true},
	{ErrWarningAcknowledgmentInvalid, 422, false, false, false, true},
	{ErrIdempotencyKeyMissing, 400, false, false, false, true},
	{ErrIdempotencyKeyInvalid, 400, false, false, false, true},
	{ErrIdempotencyConflict, 409, false, false, false, true},
	{ErrIdempotencyInProgress, 409, true, false, false, true},
	{ErrCandidateTransactionFailed, 503, true, false, false, true},
	{ErrInternalAnalysisFailure, 500, true, true, false, false},
	{ErrInternal, 500, true, false, true, true},
}

func nonNil[T any](value []T) []T {
	if value == nil {
		return []T{}
	}
	return value
}

func requireJSONObject(raw json.RawMessage, limit int, requireMember bool) error {
	if len(raw) == 0 || len(raw) > limit {
		return unsupportedContractValue(raw, "JSON object is missing or exceeds its byte limit")
	}
	var object map[string]json.RawMessage
	if err := json.Unmarshal(raw, &object); err != nil {
		return err
	}
	if object == nil || (requireMember && len(object) == 0) {
		return unsupportedContractValue(raw, "non-empty JSON object required")
	}
	return nil
}

func unsupportedContractValue(value any, message string) error {
	return &json.UnsupportedValueError{Value: reflect.ValueOf(value), Str: message}
}
