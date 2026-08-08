package palette

import (
	"encoding/json"
	"testing"
)

func TestNormalizePaletteColorsGeneratesStableShape(t *testing.T) {
	raw := json.RawMessage(`[{"hex":"#aabbcc"}]`)

	normalized, count, err := normalizeCreateColors(raw, 1)
	if err != nil {
		t.Fatalf("normalizeCreateColors returned error: %v", err)
	}
	if count != 1 {
		t.Fatalf("count = %d, want 1", count)
	}

	var colors []PaletteColor
	if err := json.Unmarshal(normalized, &colors); err != nil {
		t.Fatalf("normalized colors are invalid JSON: %v", err)
	}
	if colors[0].ID == "" {
		t.Fatal("generated color ID is empty")
	}
	if colors[0].Hex != "#AABBCC" {
		t.Fatalf("hex = %q, want #AABBCC", colors[0].Hex)
	}
	if colors[0].RGB != [3]int{170, 187, 204} {
		t.Fatalf("rgb = %v, want [170 187 204]", colors[0].RGB)
	}
	if colors[0].Order != 0 {
		t.Fatalf("order = %d, want 0", colors[0].Order)
	}
}

func TestNormalizePaletteColorsPreservesExistingIDAndDerivesRGB(t *testing.T) {
	raw := json.RawMessage(`[{"id":"color-abc","hex":"336699","rgb":[0,0,0],"label":" Signal "}]`)

	normalized, _, err := normalizeCreateColors(raw, 1)
	if err != nil {
		t.Fatalf("normalizeCreateColors returned error: %v", err)
	}

	var colors []PaletteColor
	if err := json.Unmarshal(normalized, &colors); err != nil {
		t.Fatalf("normalized colors are invalid JSON: %v", err)
	}
	if colors[0].ID != "color-abc" {
		t.Fatalf("id = %q, want color-abc", colors[0].ID)
	}
	if colors[0].Hex != "#336699" {
		t.Fatalf("hex = %q, want #336699", colors[0].Hex)
	}
	if colors[0].RGB != [3]int{51, 102, 153} {
		t.Fatalf("rgb = %v, want [51 102 153]", colors[0].RGB)
	}
	if colors[0].Label != "Signal" {
		t.Fatalf("label = %q, want Signal", colors[0].Label)
	}
}

func TestNormalizePaletteColorsRejectsInvalidAndMissingHex(t *testing.T) {
	tests := []struct {
		name string
		raw  json.RawMessage
		code string
	}{
		{name: "missing", raw: json.RawMessage(`[{"id":"a"}]`), code: "MISSING_HEX"},
		{name: "invalid", raw: json.RawMessage(`[{"id":"a","hex":"nope"}]`), code: "INVALID_HEX"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, _, err := normalizeCreateColors(tt.raw, 1)
			if err == nil {
				t.Fatal("expected validation error")
			}
			validationErr, ok := IsValidationError(err)
			if !ok {
				t.Fatalf("error type = %T, want *ValidationError", err)
			}
			if len(validationErr.Issues) != 1 || validationErr.Issues[0].Code != tt.code {
				t.Fatalf("issues = %#v, want code %s", validationErr.Issues, tt.code)
			}
		})
	}
}

func TestNormalizePaletteColorsRejectsDuplicateIDs(t *testing.T) {
	raw := json.RawMessage(`[{"id":"dup","hex":"#111111"},{"id":"dup","hex":"#222222"}]`)

	_, _, err := normalizeCreateColors(raw, 2)
	if err == nil {
		t.Fatal("expected validation error")
	}
	validationErr, ok := IsValidationError(err)
	if !ok {
		t.Fatalf("error type = %T, want *ValidationError", err)
	}
	if validationErr.Issues[0].Code != "DUPLICATE_COLOR_ID" {
		t.Fatalf("issue code = %s, want DUPLICATE_COLOR_ID", validationErr.Issues[0].Code)
	}
	if validationErr.Issues[0].Path != "colors[1].id" {
		t.Fatalf("issue path = %s, want colors[1].id", validationErr.Issues[0].Path)
	}
}

func TestNormalizeUpdateColorsPreservesIDsAcrossReorderAndHexEdit(t *testing.T) {
	raw := json.RawMessage(`[
		{"id":"second","hex":"#222222"},
		{"id":"first","hex":"#123456"},
		{"hex":"#333333"}
	]`)
	count := 3

	normalized, normalizedCount, err := normalizeUpdateColors(raw, &count)
	if err != nil {
		t.Fatalf("normalizeUpdateColors returned error: %v", err)
	}
	if normalizedCount != 3 {
		t.Fatalf("count = %d, want 3", normalizedCount)
	}

	var colors []PaletteColor
	if err := json.Unmarshal(normalized, &colors); err != nil {
		t.Fatalf("normalized colors are invalid JSON: %v", err)
	}
	if colors[0].ID != "second" || colors[0].Order != 0 {
		t.Fatalf("first normalized color = %#v", colors[0])
	}
	if colors[1].ID != "first" || colors[1].Hex != "#123456" || colors[1].Order != 1 {
		t.Fatalf("second normalized color = %#v", colors[1])
	}
	if colors[2].ID == "" {
		t.Fatal("inserted color did not receive an ID")
	}
}

func TestNormalizeUpdateColorsGeneratesIDsOnlyForNewColors(t *testing.T) {
	raw := json.RawMessage(`[
		{"id":"existing-a","hex":"#111111"},
		{"hex":"#222222"},
		{"id":"existing-b","hex":"#333333"}
	]`)
	count := 3

	normalized, _, err := normalizeUpdateColors(raw, &count)
	if err != nil {
		t.Fatalf("normalizeUpdateColors returned error: %v", err)
	}

	var colors []PaletteColor
	if err := json.Unmarshal(normalized, &colors); err != nil {
		t.Fatalf("normalized colors are invalid JSON: %v", err)
	}

	if colors[0].ID != "existing-a" {
		t.Fatalf("first id = %q, want existing-a", colors[0].ID)
	}
	if colors[1].ID == "" || colors[1].ID == "existing-a" || colors[1].ID == "existing-b" {
		t.Fatalf("new color id = %q, want fresh generated id", colors[1].ID)
	}
	if colors[2].ID != "existing-b" {
		t.Fatalf("third id = %q, want existing-b", colors[2].ID)
	}
}

func TestNormalizePaletteColorsDerivesColorCount(t *testing.T) {
	raw := json.RawMessage(`[{"hex":"#111111"},{"hex":"#222222"}]`)

	_, count, err := normalizeCreateColors(raw, 0)
	if err != nil {
		t.Fatalf("normalizeCreateColors returned error: %v", err)
	}
	if count != 2 {
		t.Fatalf("count = %d, want 2", count)
	}
}

func TestNormalizePaletteColorsRejectsColorCountMismatch(t *testing.T) {
	raw := json.RawMessage(`[{"hex":"#111111"},{"hex":"#222222"}]`)

	_, _, err := normalizeCreateColors(raw, 1)
	if err == nil {
		t.Fatal("expected validation error")
	}
	validationErr, ok := IsValidationError(err)
	if !ok {
		t.Fatalf("error type = %T, want *ValidationError", err)
	}
	if validationErr.Issues[0].Code != "COLOR_COUNT_MISMATCH" {
		t.Fatalf("issue code = %s, want COLOR_COUNT_MISMATCH", validationErr.Issues[0].Code)
	}
}

func TestNormalizePaletteColorsRejectsMalformedJSON(t *testing.T) {
	_, _, err := normalizeCreateColors(json.RawMessage(`{"hex":"#111111"}`), 1)
	if err == nil {
		t.Fatal("expected validation error")
	}
	validationErr, ok := IsValidationError(err)
	if !ok {
		t.Fatalf("error type = %T, want *ValidationError", err)
	}
	if validationErr.Issues[0].Code != "MALFORMED_COLOR_ENTRY" {
		t.Fatalf("issue code = %s, want MALFORMED_COLOR_ENTRY", validationErr.Issues[0].Code)
	}
}

func TestPaletteTypePolicy(t *testing.T) {
	if err := validatePaletteTypeForCreate("categorical"); err != nil {
		t.Fatalf("canonical create type rejected: %v", err)
	}
	if err := validatePaletteTypeForCreate("qualitative"); err == nil {
		t.Fatal("legacy create type was accepted")
	}

	legacy := "qualitative"
	if err := validatePaletteTypeForUpdate("qualitative", &legacy); err != nil {
		t.Fatalf("existing legacy type was not preserved: %v", err)
	}

	toCanonical := "categorical"
	if err := validatePaletteTypeForUpdate("qualitative", &toCanonical); err != nil {
		t.Fatalf("legacy-to-canonical update rejected: %v", err)
	}

	toLegacy := "heatmap"
	if err := validatePaletteTypeForUpdate("categorical", &toLegacy); err == nil {
		t.Fatal("canonical-to-legacy update was accepted")
	}
}

func TestDefaultPaletteSlugAllowsBlankCreateSlug(t *testing.T) {
	got := defaultPaletteSlug("My Blank Slug Palette", "")
	if got != "my-blank-slug-palette" {
		t.Fatalf("slug = %q, want my-blank-slug-palette", got)
	}

	got = defaultPaletteSlug("My Blank Slug Palette", "custom-slug")
	if got != "custom-slug" {
		t.Fatalf("slug = %q, want custom-slug", got)
	}

	got = defaultPaletteSlug("My Blank Slug Palette", "   ")
	if got != "my-blank-slug-palette" {
		t.Fatalf("slug = %q, want my-blank-slug-palette", got)
	}
}

func TestNormalizeChartApplicabilityAllowsEmptyArray(t *testing.T) {
	input := OptionalChartApplicability{Present: true, Raw: json.RawMessage(`[]`)}

	normalized, err := normalizeChartApplicability(&input)
	if err != nil {
		t.Fatalf("normalizeChartApplicability returned error: %v", err)
	}
	if normalized == nil {
		t.Fatal("normalized applicability is nil, want empty slice")
	}
	if len(normalized) != 0 {
		t.Fatalf("len = %d, want 0", len(normalized))
	}
}

func TestNormalizeChartApplicabilityPreservesOrderAndNormalizesCuratedSource(t *testing.T) {
	input := OptionalChartApplicability{Present: true, Raw: json.RawMessage(`[
		{"chart_type":"line_multiseries","suitability":"best_fit","notes":" Primary "},
		{"chart_type":"bar_error","suitability":"compatible","source":"curated"}
	]`)}

	normalized, err := normalizeChartApplicability(&input)
	if err != nil {
		t.Fatalf("normalizeChartApplicability returned error: %v", err)
	}
	if normalized[0].ChartType != "line_multiseries" || normalized[1].ChartType != "bar_error" {
		t.Fatalf("order = %#v, want line_multiseries then bar_error", normalized)
	}
	if normalized[0].Notes != "Primary" {
		t.Fatalf("notes = %q, want Primary", normalized[0].Notes)
	}
	if normalized[0].Source != "curated" || normalized[1].Source != "curated" {
		t.Fatalf("sources = %q/%q, want curated/curated", normalized[0].Source, normalized[1].Source)
	}
}

func TestNormalizeChartApplicabilityRejectsInvalidValues(t *testing.T) {
	input := OptionalChartApplicability{Present: true, Raw: json.RawMessage(`[
		{"chart_type":"line_multiseries","suitability":"best_fit","source":"legacy_chart_types"},
		{"chart_type":"line_multiseries","suitability":"best_fit"},
		{"chart_type":"bar","suitability":"great"}
	]`)}

	_, err := normalizeChartApplicability(&input)
	if err == nil {
		t.Fatal("expected validation error")
	}
	validationErr, ok := IsValidationError(err)
	if !ok {
		t.Fatalf("error type = %T, want *ValidationError", err)
	}
	codes := map[string]bool{}
	for _, issue := range validationErr.Issues {
		codes[issue.Code] = true
	}
	for _, code := range []string{
		"INVALID_APPLICABILITY_SOURCE",
		"DUPLICATE_CHART_TYPE",
		"MULTIPLE_BEST_FIT",
		"INVALID_CHART_TYPE",
		"INVALID_CHART_SUITABILITY",
	} {
		if !codes[code] {
			t.Fatalf("issues = %#v, missing code %s", validationErr.Issues, code)
		}
	}
}

func TestNormalizeChartApplicabilityRejectsMalformedShape(t *testing.T) {
	input := OptionalChartApplicability{Present: true, Raw: json.RawMessage(`{"chart_type":"bar_error"}`)}

	_, err := normalizeChartApplicability(&input)
	if err == nil {
		t.Fatal("expected validation error")
	}
	validationErr, ok := IsValidationError(err)
	if !ok {
		t.Fatalf("error type = %T, want *ValidationError", err)
	}
	if validationErr.Issues[0].Code != "MALFORMED_CHART_APPLICABILITY" {
		t.Fatalf("issue code = %s, want MALFORMED_CHART_APPLICABILITY", validationErr.Issues[0].Code)
	}
}

func TestApplyCreateApplicabilityRulesDerivesChartTypes(t *testing.T) {
	service := NewService(nil)
	req := &CreatePaletteRequest{
		ChartApplicability: OptionalChartApplicability{Present: true, Raw: json.RawMessage(`[
			{"chart_type":"boxplot_jitter","suitability":"recommended"},
			{"chart_type":"heatmap_annotated","suitability":"limited"}
		]`)},
	}

	if err := service.applyCreateApplicabilityRules(req); err != nil {
		t.Fatalf("applyCreateApplicabilityRules returned error: %v", err)
	}
	want := []string{"boxplot_jitter", "heatmap_annotated"}
	if !chartTypesEqual(req.ChartTypes, want) {
		t.Fatalf("chart_types = %#v, want %#v", req.ChartTypes, want)
	}
}

func TestApplyCreateApplicabilityRulesRejectsConflictingChartTypes(t *testing.T) {
	service := NewService(nil)
	req := &CreatePaletteRequest{
		ChartTypes: []string{"bar_error"},
		ChartApplicability: OptionalChartApplicability{Present: true, Raw: json.RawMessage(`[
			{"chart_type":"line_multiseries","suitability":"recommended"}
		]`)},
	}

	err := service.applyCreateApplicabilityRules(req)
	if err == nil {
		t.Fatal("expected validation error")
	}
	validationErr, ok := IsValidationError(err)
	if !ok {
		t.Fatalf("error type = %T, want *ValidationError", err)
	}
	if validationErr.Issues[0].Code != "CHART_TYPES_CONFLICT" {
		t.Fatalf("issue code = %s, want CHART_TYPES_CONFLICT", validationErr.Issues[0].Code)
	}
}

func TestChartTypeFilterConditionUsesApplicabilityBeforeLegacyChartTypes(t *testing.T) {
	condition, nextArgIndex := chartTypeFilterCondition(3, 2)
	if nextArgIndex != 7 {
		t.Fatalf("next arg index = %d, want 7", nextArgIndex)
	}
	if condition != "((chart_applicability IS NULL AND ($3 = ANY(chart_types) OR $4 = ANY(chart_types))) OR (chart_applicability IS NOT NULL AND (chart_applicability @> $5::jsonb OR chart_applicability @> $6::jsonb)))" {
		t.Fatalf("condition = %q", condition)
	}
	if got := chartApplicabilityContainsValue("bar_error"); got != `[{"chart_type":"bar_error"}]` {
		t.Fatalf("contains JSON = %s, want chart_type-only containment JSON", got)
	}
	targets := chartTypeFilterTargets("line")
	if len(targets) != 2 || targets[0] != "line" || targets[1] != "line_multiseries" {
		t.Fatalf("line targets = %#v, want broad and Phase 1 target", targets)
	}
	canonicalTargets := chartTypeFilterTargets("heatmap_annotated")
	if len(canonicalTargets) != 1 || canonicalTargets[0] != "heatmap_annotated" {
		t.Fatalf("canonical heatmap targets = %#v, want exact Phase 1 target", canonicalTargets)
	}
}
