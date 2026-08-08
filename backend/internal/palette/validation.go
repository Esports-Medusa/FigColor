package palette

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
)

type ValidationIssue struct {
	Path    string `json:"path"`
	Code    string `json:"code"`
	Message string `json:"message"`
}

type ValidationError struct {
	Issues []ValidationIssue `json:"issues"`
}

func (e *ValidationError) Error() string {
	return "validation failed"
}

func NewValidationError(issues []ValidationIssue) *ValidationError {
	return &ValidationError{Issues: issues}
}

func IsValidationError(err error) (*ValidationError, bool) {
	var validationErr *ValidationError
	ok := errors.As(err, &validationErr)
	return validationErr, ok
}

func validationIssue(path, code, message string) ValidationIssue {
	return ValidationIssue{Path: path, Code: code, Message: message}
}

var canonicalPaletteTypes = map[string]bool{
	"categorical": true,
	"sequential":  true,
	"diverging":   true,
	"mixed":       true,
}

// Legacy values remain readable and may be preserved on existing records.
// New writes must use canonical palette types; heatmap needs manual review
// before any future migration because it may describe usage rather than type.
var legacyPaletteTypes = map[string]bool{
	"qualitative": true,
	"heatmap":     true,
}

const (
	ChartTypeBarError           = "bar_error"
	ChartTypeBoxplotJitter      = "boxplot_jitter"
	ChartTypeLineMultiseries    = "line_multiseries"
	ChartTypeHeatmapAnnotated   = "heatmap_annotated"
	ChartTypeScatterGrouped     = "scatter_grouped"
	ChartTypeViolinDistribution = "violin_distribution"

	ChartSuitabilityBestFit     = "best_fit"
	ChartSuitabilityRecommended = "recommended"
	ChartSuitabilityCompatible  = "compatible"
	ChartSuitabilityLimited     = "limited"

	ChartApplicabilitySourceCurated = "curated"
)

var allowedChartTypes = map[string]bool{
	ChartTypeBarError:           true,
	ChartTypeBoxplotJitter:      true,
	ChartTypeLineMultiseries:    true,
	ChartTypeHeatmapAnnotated:   true,
	ChartTypeScatterGrouped:     true,
	ChartTypeViolinDistribution: true,
}

var allowedChartSuitabilities = map[string]bool{
	ChartSuitabilityBestFit:     true,
	ChartSuitabilityRecommended: true,
	ChartSuitabilityCompatible:  true,
	ChartSuitabilityLimited:     true,
}

func validatePaletteTypeForCreate(value string) error {
	value = strings.TrimSpace(value)
	if value == "" {
		return NewValidationError([]ValidationIssue{
			validationIssue("type", "PALETTE_TYPE_REQUIRED", "Palette type is required."),
		})
	}
	if canonicalPaletteTypes[value] {
		return nil
	}
	if legacyPaletteTypes[value] {
		return NewValidationError([]ValidationIssue{
			validationIssue("type", "LEGACY_PALETTE_TYPE_NOT_ALLOWED", "Legacy palette types cannot be used for new palettes."),
		})
	}
	return NewValidationError([]ValidationIssue{
		validationIssue("type", "INVALID_PALETTE_TYPE", "Palette type must be categorical, sequential, diverging, or mixed."),
	})
}

func validatePaletteTypeForUpdate(existingType string, nextType *string) error {
	if nextType == nil {
		return nil
	}
	value := strings.TrimSpace(*nextType)
	if canonicalPaletteTypes[value] {
		*nextType = value
		return nil
	}
	if legacyPaletteTypes[value] && value == existingType {
		*nextType = value
		return nil
	}
	if legacyPaletteTypes[value] {
		return NewValidationError([]ValidationIssue{
			validationIssue("type", "LEGACY_PALETTE_TYPE_NOT_ALLOWED", "Legacy palette types may only be preserved on existing legacy records."),
		})
	}
	return NewValidationError([]ValidationIssue{
		validationIssue("type", "INVALID_PALETTE_TYPE", "Palette type must be categorical, sequential, diverging, or mixed."),
	})
}

func normalizeChartApplicability(input *OptionalChartApplicability) ([]ChartTypeApplicability, error) {
	if input == nil || !input.Present || input.Null {
		return nil, nil
	}
	if len(input.Raw) == 0 || strings.TrimSpace(string(input.Raw)) == "" {
		return nil, NewValidationError([]ValidationIssue{
			validationIssue("chart_applicability", "MALFORMED_CHART_APPLICABILITY", "Chart applicability must be null or an array."),
		})
	}

	var rawItems []json.RawMessage
	if err := json.Unmarshal(input.Raw, &rawItems); err != nil {
		return nil, NewValidationError([]ValidationIssue{
			validationIssue("chart_applicability", "MALFORMED_CHART_APPLICABILITY", "Chart applicability must be an array of objects."),
		})
	}

	issues := make([]ValidationIssue, 0)
	seenChartTypes := map[string]int{}
	bestFitCount := 0
	normalized := make([]ChartTypeApplicability, 0, len(rawItems))

	for index, rawItem := range rawItems {
		path := fmt.Sprintf("chart_applicability[%d]", index)
		var item ChartTypeApplicability
		if err := json.Unmarshal(rawItem, &item); err != nil {
			issues = append(issues, validationIssue(path, "MALFORMED_CHART_APPLICABILITY", "Chart applicability entries must be objects."))
			continue
		}

		item.ChartType = strings.TrimSpace(item.ChartType)
		item.Suitability = strings.TrimSpace(item.Suitability)
		item.Notes = strings.TrimSpace(item.Notes)
		item.Source = strings.TrimSpace(item.Source)

		if !allowedChartTypes[item.ChartType] {
			issues = append(issues, validationIssue(path+".chart_type", "INVALID_CHART_TYPE", "Chart type is not part of the Phase 1 scientific preview set."))
		}
		if firstIndex, exists := seenChartTypes[item.ChartType]; exists && item.ChartType != "" {
			issues = append(issues, validationIssue(path+".chart_type", "DUPLICATE_CHART_TYPE", fmt.Sprintf("Chart type duplicates chart_applicability[%d].chart_type.", firstIndex)))
		}
		seenChartTypes[item.ChartType] = index

		if !allowedChartSuitabilities[item.Suitability] {
			issues = append(issues, validationIssue(path+".suitability", "INVALID_CHART_SUITABILITY", "Chart suitability must be best_fit, recommended, compatible, or limited."))
		}
		if item.Suitability == ChartSuitabilityBestFit {
			bestFitCount++
			if bestFitCount > 1 {
				issues = append(issues, validationIssue(path+".suitability", "MULTIPLE_BEST_FIT", "Only one chart applicability entry may be best_fit."))
			}
		}
		if item.Source != "" && item.Source != ChartApplicabilitySourceCurated {
			issues = append(issues, validationIssue(path+".source", "INVALID_APPLICABILITY_SOURCE", "Persisted chart applicability source must be curated."))
		}

		item.Source = ChartApplicabilitySourceCurated
		normalized = append(normalized, item)
	}

	if len(issues) > 0 {
		return nil, NewValidationError(issues)
	}
	return normalized, nil
}

func deriveChartTypesFromApplicability(applicability []ChartTypeApplicability) []string {
	chartTypes := make([]string, 0, len(applicability))
	for _, item := range applicability {
		chartTypes = append(chartTypes, item.ChartType)
	}
	return chartTypes
}

func chartTypesEqual(left, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}

func normalizeCreateColors(raw json.RawMessage, suppliedColorCount int) (json.RawMessage, int, error) {
	return normalizePaletteColors(raw, suppliedColorCount, suppliedColorCount > 0)
}

func normalizeUpdateColors(raw json.RawMessage, suppliedColorCount *int) (json.RawMessage, int, error) {
	colorCount := 0
	hasColorCount := false
	if suppliedColorCount != nil {
		colorCount = *suppliedColorCount
		hasColorCount = true
	}
	return normalizePaletteColors(raw, colorCount, hasColorCount)
}

func normalizePaletteColors(raw json.RawMessage, suppliedColorCount int, hasColorCount bool) (json.RawMessage, int, error) {
	var inputs []paletteColorInput
	if len(raw) == 0 {
		return nil, 0, NewValidationError([]ValidationIssue{
			validationIssue("colors", "COLORS_REQUIRED", "Colors are required."),
		})
	}
	if err := json.Unmarshal(raw, &inputs); err != nil {
		return nil, 0, NewValidationError([]ValidationIssue{
			validationIssue("colors", "MALFORMED_COLOR_ENTRY", "Colors must be an array of color objects."),
		})
	}
	if len(inputs) == 0 {
		return nil, 0, NewValidationError([]ValidationIssue{
			validationIssue("colors", "EMPTY_COLOR_ARRAY", "At least one color is required."),
		})
	}

	issues := make([]ValidationIssue, 0)
	seenIDs := map[string]int{}
	colors := make([]PaletteColor, len(inputs))

	for index, input := range inputs {
		path := fmt.Sprintf("colors[%d]", index)
		hex := strings.TrimSpace(input.Hex)
		if hex == "" {
			issues = append(issues, validationIssue(path+".hex", "MISSING_HEX", "Color HEX is required."))
			continue
		}
		if !IsValidHex(hex) {
			issues = append(issues, validationIssue(path+".hex", "INVALID_HEX", "Color HEX must be a valid 6-digit HEX value."))
			continue
		}

		id := strings.TrimSpace(input.ID)
		if id == "" {
			id = uuid.NewString()
		}
		if firstIndex, exists := seenIDs[id]; exists {
			issues = append(issues, validationIssue(
				path+".id",
				"DUPLICATE_COLOR_ID",
				fmt.Sprintf("Color ID duplicates colors[%d].id.", firstIndex),
			))
			continue
		}
		seenIDs[id] = index

		normalizedHex := NormalizeHex(hex)
		colors[index] = PaletteColor{
			ID:    id,
			Hex:   normalizedHex,
			RGB:   HexToRGB(normalizedHex),
			Label: strings.TrimSpace(input.Label),
			Order: index,
		}
	}

	if hasColorCount && suppliedColorCount != len(inputs) {
		issues = append(issues, validationIssue("color_count", "COLOR_COUNT_MISMATCH", "Color count must match colors.length."))
	}
	if len(issues) > 0 {
		return nil, 0, NewValidationError(issues)
	}

	normalized, err := json.Marshal(colors)
	if err != nil {
		return nil, 0, err
	}
	return normalized, len(colors), nil
}

type paletteColorInput struct {
	ID    string `json:"id"`
	Hex   string `json:"hex"`
	Label string `json:"label"`
}
