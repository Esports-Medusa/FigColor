// Package palettesuggestion turns trusted WP-B2 colour evidence into
// deterministic, non-authoritative palette proposals. It performs no image
// decoding, transport handling, persistence, or semantic chart inference.
package palettesuggestion

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"math"
	"regexp"
	"strconv"

	"github.com/qiqi/figcolor/backend/internal/paletteassistant"
	"github.com/qiqi/figcolor/backend/internal/paletteassistant/imageanalysis"
)

const (
	PolicyVersion       = "deterministic-palette-suggestion.v1"
	Producer            = "deterministic_rule_engine"
	MinimumColors       = 2
	MaximumColors       = 12
	RuleSelectRetained  = "SELECT_WP_B2_RETAINED_DATA_COLORS"
	RuleCategorical     = "SUGGEST_CATEGORICAL_FOR_UNORDERED_COLOR_SET"
	ReasonSelected      = "RETAINED_DATA_COLOR_SELECTED"
	ReasonTruncated     = "ABOVE_MAXIMUM_PALETTE_COLORS"
	ReasonStructural    = "WP_B2_STRUCTURAL_COLOR_NOT_PROMOTED"
	ReasonExcluded      = "WP_B2_EXCLUDED_COLOR_NOT_PROMOTED"
	WarningHeuristic    = "HEURISTIC_SUGGESTION_REQUIRES_ADMIN_REVIEW"
	WarningInsufficient = "INSUFFICIENT_USABLE_COLORS"
	WarningTruncated    = "USABLE_COLORS_TRUNCATED"
	WarningNoUsable     = "NO_USABLE_DATA_COLOR"
)

var (
	ErrInvalidContext      = errors.New("PALETTE_SUGGESTION_INVALID_CONTEXT")
	ErrInvalidEngine       = errors.New("PALETTE_SUGGESTION_ENGINE_INVALID")
	ErrUnsupportedAnalyzer = errors.New("PALETTE_SUGGESTION_ANALYZER_UNSUPPORTED")
	ErrInvalidEvidence     = errors.New("PALETTE_SUGGESTION_EVIDENCE_INVALID")
	ErrCancelled           = errors.New("PALETTE_SUGGESTION_CANCELLED")
	hexPattern             = regexp.MustCompile(`^#[0-9A-F]{6}$`)
)

type CompletenessState string

const (
	StateComplete       CompletenessState = "complete"
	StateNeedsReview    CompletenessState = "needs_review"
	StateNoUsableColors CompletenessState = "no_usable_colors"
)

type Policy struct {
	Version       string `json:"version"`
	MinimumColors int    `json:"minimum_colors"`
	MaximumColors int    `json:"maximum_colors"`
}
type Fact struct {
	Code  string `json:"code"`
	Value string `json:"value"`
}
type UnresolvedDecision struct {
	Field      string `json:"field"`
	ReasonCode string `json:"reason_code"`
}
type PaletteTypeSuggestion struct {
	Value            string   `json:"value"`
	Producer         string   `json:"producer"`
	AlgorithmVersion string   `json:"algorithm_version"`
	RuleID           string   `json:"rule_id"`
	ReasonCodes      []string `json:"reason_codes"`
	Authoritative    bool     `json:"authoritative"`
}
type SuggestedColor struct {
	ID                 string   `json:"id"`
	Hex                string   `json:"hex"`
	PixelCount         int64    `json:"pixel_count"`
	Fraction           float64  `json:"fraction"`
	SourceSuggestionID string   `json:"source_suggestion_id"`
	RuleID             string   `json:"rule_id"`
	ReasonCodes        []string `json:"reason_codes"`
	Authoritative      bool     `json:"authoritative"`
}
type OmittedColor struct {
	Hex            string   `json:"hex"`
	PixelCount     int64    `json:"pixel_count"`
	Fraction       float64  `json:"fraction"`
	Classification string   `json:"classification"`
	ReasonCodes    []string `json:"reason_codes"`
}
type Result struct {
	Policy                Policy                 `json:"policy"`
	SourceAnalyzerVersion string                 `json:"source_analyzer_version"`
	SourceEvidenceSHA256  string                 `json:"source_evidence_sha256"`
	SuggestionSetID       string                 `json:"suggestion_set_id"`
	State                 CompletenessState      `json:"state"`
	Reviewable            bool                   `json:"reviewable"`
	SelectedColors        []SuggestedColor       `json:"selected_colors"`
	OmittedColors         []OmittedColor         `json:"omitted_colors"`
	PaletteType           *PaletteTypeSuggestion `json:"palette_type,omitempty"`
	Facts                 []Fact                 `json:"facts"`
	Warnings              []string               `json:"warnings"`
	UnresolvedDecisions   []UnresolvedDecision   `json:"unresolved_decisions"`
	OutputSHA256          string                 `json:"output_sha256"`
}
type Engine struct{ policy Policy }

func New() *Engine {
	return &Engine{policy: Policy{Version: PolicyVersion, MinimumColors: MinimumColors, MaximumColors: MaximumColors}}
}

func (e *Engine) Suggest(ctx context.Context, input imageanalysis.Result) (Result, error) {
	if ctx == nil {
		return Result{}, ErrInvalidContext
	}
	if e == nil || e.policy != (Policy{Version: PolicyVersion, MinimumColors: MinimumColors, MaximumColors: MaximumColors}) {
		return Result{}, ErrInvalidEngine
	}
	if err := ctx.Err(); err != nil {
		return Result{}, ErrCancelled
	}
	if input.Evidence.AlgorithmVersion != imageanalysis.AlgorithmVersion || input.Evidence.Configuration.AlgorithmVersion != imageanalysis.AlgorithmVersion {
		return Result{}, ErrUnsupportedAnalyzer
	}
	if !validEvidence(input) || !imageanalysis.VerifyResult(input) {
		return Result{}, ErrInvalidEvidence
	}
	r := Result{Policy: e.policy, SourceAnalyzerVersion: input.Evidence.AlgorithmVersion, SourceEvidenceSHA256: input.Evidence.OutputSHA256, Reviewable: true,
		SelectedColors: []SuggestedColor{}, OmittedColors: []OmittedColor{}, Facts: []Fact{{Code: "SOURCE_PIXEL_COUNT", Value: itoa(input.Image.PixelCount)}, {Code: "WP_B2_RETAINED_DATA_COLOR_COUNT", Value: itoa(int64(len(input.ColorSuggestions)))}},
		Warnings: []string{WarningHeuristic}, UnresolvedDecisions: semanticUnresolved()}
	for i, c := range input.ColorSuggestions {
		if i < e.policy.MaximumColors {
			r.SelectedColors = append(r.SelectedColors, SuggestedColor{ID: selectedColorID(e.policy, input.Evidence.OutputSHA256, c), Hex: c.Hex, PixelCount: c.PixelCount, Fraction: c.Fraction, SourceSuggestionID: c.ID, RuleID: RuleSelectRetained, ReasonCodes: []string{ReasonSelected}, Authoritative: false})
		} else {
			r.OmittedColors = append(r.OmittedColors, OmittedColor{Hex: c.Hex, PixelCount: c.PixelCount, Fraction: c.Fraction, Classification: "data", ReasonCodes: []string{ReasonTruncated}})
		}
	}
	for _, c := range input.StructuralColors {
		r.OmittedColors = append(r.OmittedColors, OmittedColor{Hex: c.Hex, PixelCount: c.PixelCount, Fraction: c.Fraction, Classification: "structural", ReasonCodes: []string{ReasonStructural}})
	}
	for _, c := range input.Evidence.Excluded {
		r.OmittedColors = append(r.OmittedColors, OmittedColor{Hex: c.Hex, PixelCount: c.PixelCount, Fraction: c.Fraction, Classification: c.Classification, ReasonCodes: append([]string{ReasonExcluded}, c.ReasonCodes...)})
	}
	switch {
	case len(r.SelectedColors) == 0:
		r.State = StateNoUsableColors
		r.Warnings = append(r.Warnings, WarningNoUsable)
	case len(r.SelectedColors) < e.policy.MinimumColors:
		r.State = StateNeedsReview
		r.Warnings = append(r.Warnings, WarningInsufficient)
	default:
		r.State = StateComplete
		r.PaletteType = &PaletteTypeSuggestion{Value: "categorical", Producer: Producer, AlgorithmVersion: e.policy.Version, RuleID: RuleCategorical, ReasonCodes: []string{"MULTIPLE_UNORDERED_RETAINED_DATA_COLORS"}}
		r.UnresolvedDecisions = removeUnresolved(r.UnresolvedDecisions, "/palette_type")
	}
	if len(input.ColorSuggestions) > e.policy.MaximumColors {
		r.Warnings = append(r.Warnings, WarningTruncated)
	}
	r.SuggestionSetID = stableID(e.policy.Version, strconv.Itoa(e.policy.MinimumColors), strconv.Itoa(e.policy.MaximumColors), input.Evidence.OutputSHA256, semanticHash(r))
	r.OutputSHA256 = semanticHash(r)
	return r, nil
}

func semanticUnresolved() []UnresolvedDecision {
	fields := []string{"/name", "/palette_type", "/chart_applicability", "/disciplines", "/use_cases", "/avoid_cases", "/tags", "/accessibility", "/preview_cases"}
	out := make([]UnresolvedDecision, 0, len(fields))
	for _, f := range fields {
		out = append(out, UnresolvedDecision{Field: f, ReasonCode: "INSUFFICIENT_COLOR_EVIDENCE_FOR_SEMANTIC_INFERENCE"})
	}
	return out
}
func removeUnresolved(items []UnresolvedDecision, field string) []UnresolvedDecision {
	out := make([]UnresolvedDecision, 0, len(items)-1)
	for _, item := range items {
		if item.Field != field {
			out = append(out, item)
		}
	}
	return out
}
func validEvidence(r imageanalysis.Result) bool {
	if r.Image.Format != "png" && r.Image.Format != "jpeg" || r.Image.EncodedBytes <= 0 || r.Image.Width <= 0 || r.Image.Height <= 0 || r.Image.PixelCount != int64(r.Image.Width)*int64(r.Image.Height) || r.Image.AlphaBackdrop != "#FFFFFF" || len(r.Image.SHA256) != 64 {
		return false
	}
	if r.Evidence.Configuration != imageanalysis.DefaultConfig() || r.Evidence.OutputSHA256 == "" || r.Evidence.Background.Classification != "background" {
		return false
	}
	seen := map[string]bool{}
	previousCount := int64(math.MaxInt64)
	previousHex := ""
	checkOrdered := func(items []paletteassistant.ColorSuggestion, class string) bool {
		previousCount = math.MaxInt64
		previousHex = ""
		for _, c := range items {
			if !hexPattern.MatchString(c.Hex) || c.PixelCount <= 0 || c.PixelCount > r.Image.PixelCount || !validFraction(c.Fraction, c.PixelCount, r.Image.PixelCount) || c.Producer != imageanalysis.Producer || c.AlgorithmVersion != imageanalysis.AlgorithmVersion || c.ID != wpB2SuggestionID(c.AlgorithmVersion, class, c.Hex) || len(c.ReasonCodes) != 1 || seen[c.ID] || seen[c.Hex] || (c.PixelCount > previousCount) || (c.PixelCount == previousCount && previousHex != "" && c.Hex < previousHex) {
				return false
			}
			if class == "data" && c.ReasonCodes[0] != imageanalysis.ReasonPixelSupport {
				return false
			}
			if class == "structural" && c.ReasonCodes[0] != imageanalysis.ReasonLikelyStructural {
				return false
			}
			seen[c.ID] = true
			seen[c.Hex] = true
			previousCount = c.PixelCount
			previousHex = c.Hex
		}
		return true
	}
	if !checkOrdered(r.ColorSuggestions, "data") || !checkOrdered(r.StructuralColors, "structural") {
		return false
	}
	retained := make(map[string]imageanalysis.ColorEvidence, len(r.Evidence.Colors))
	for _, c := range r.Evidence.Colors {
		if !hexPattern.MatchString(c.Hex) || c.PixelCount <= 0 || !validFraction(c.Fraction, c.PixelCount, r.Image.PixelCount) || (c.Classification != "data" && c.Classification != "structural") || len(c.ReasonCodes) != 1 || retained[c.Hex].Hex != "" {
			return false
		}
		retained[c.Hex] = c
	}
	for _, group := range []struct {
		items []paletteassistant.ColorSuggestion
		class string
	}{{r.ColorSuggestions, "data"}, {r.StructuralColors, "structural"}} {
		for _, c := range group.items {
			ev, ok := retained[c.Hex]
			if !ok || ev.PixelCount != c.PixelCount || ev.Fraction != c.Fraction || ev.Classification != group.class || !equalStrings(ev.ReasonCodes, c.ReasonCodes) {
				return false
			}
			delete(retained, c.Hex)
		}
	}
	if len(retained) != 0 {
		return false
	}
	for _, c := range r.Evidence.Excluded {
		if !hexPattern.MatchString(c.Hex) || c.PixelCount <= 0 || !validFraction(c.Fraction, c.PixelCount, r.Image.PixelCount) || (c.Classification != "excluded" && c.Classification != "background") || len(c.ReasonCodes) != 1 || seen[c.Hex] {
			return false
		}
		if c.Classification == "excluded" && c.ReasonCodes[0] != imageanalysis.ReasonBelowSupport || c.Classification == "background" && c.ReasonCodes[0] != imageanalysis.ReasonNearBackground {
			return false
		}
		seen[c.Hex] = true
	}
	if !hexPattern.MatchString(r.Evidence.Background.Hex) || r.Evidence.Background.PixelCount <= 0 || !validFraction(r.Evidence.Background.Fraction, r.Evidence.Background.PixelCount, r.Image.PixelCount) || len(r.Evidence.Background.ReasonCodes) != 1 || r.Evidence.Background.ReasonCodes[0] != imageanalysis.ReasonNearBackground || !lowerSHA256(r.Image.SHA256) || !lowerSHA256(r.Evidence.OutputSHA256) {
		return false
	}
	return true
}
func validFraction(f float64, count, total int64) bool {
	return !math.IsNaN(f) && !math.IsInf(f, 0) && f > 0 && f <= 1 && f == float64(count)/float64(total)
}
func stableID(parts ...string) string {
	h := sha256.New()
	for _, p := range parts {
		h.Write([]byte{0})
		h.Write([]byte(p))
	}
	return "suggestion-" + hex.EncodeToString(h.Sum(nil)[:16])
}
func selectedColorID(policy Policy, evidenceDigest string, c paletteassistant.ColorSuggestion) string {
	return stableID(policy.Version, RuleSelectRetained, evidenceDigest, c.ID, c.Hex, strconv.FormatInt(c.PixelCount, 10), strconv.FormatFloat(c.Fraction, 'g', -1, 64))
}
func wpB2SuggestionID(version, classification, value string) string {
	sum := sha256.Sum256([]byte(version + "|" + classification + "|" + value))
	return "color-" + hex.EncodeToString(sum[:8])
}
func equalStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
func lowerSHA256(value string) bool {
	if len(value) != 64 {
		return false
	}
	for _, c := range value {
		if !(c >= '0' && c <= '9' || c >= 'a' && c <= 'f') {
			return false
		}
	}
	return true
}
func semanticHash(v Result) string {
	v.OutputSHA256 = ""
	b, err := json.Marshal(v)
	if err != nil {
		panic("palettesuggestion: invariant encoding")
	}
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}
func itoa(v int64) string { return strconv.FormatInt(v, 10) }
