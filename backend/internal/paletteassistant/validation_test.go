package paletteassistant

import (
	"encoding/json"
	"fmt"
	"go/parser"
	"go/token"
	"math"
	"os"
	"path/filepath"
	"reflect"
	"strconv"
	"strings"
	"testing"
)

const colorOne = "11111111-1111-4111-8111-111111111111"
const colorTwo = "22222222-2222-4222-8222-222222222222"

func goodDraft(chart string) AssistantDraft {
	roles, config := previewFixture(chart)
	seed := 0
	return AssistantDraft{
		ContractVersion: ContractVersion, Revision: 1, Name: "Validated Palette", Type: "categorical",
		Colors:             []DraftColor{{ID: colorOne, Hex: "#112233", Order: 0, Source: SourceAssistant, State: StateAccepted}, {ID: colorTwo, Hex: "#AABBCC", Order: 1, Source: SourceAdmin, State: StateModified}},
		ChartApplicability: []DraftChartApplicability{{ChartType: chart, Suitability: "best_fit"}},
		Disciplines:        []string{"general"}, UseCases: []string{"publication"}, AvoidCases: []string{}, Tags: []string{"clean"},
		Accessibility: DraftAccessibility{}, SourceType: OnlineSourceType, SourceNote: "Reviewed extraction",
		PreviewCases: []DraftPreviewCase{{ChartType: chart, TemplateID: chart + "_v1", TemplateVersion: 1, SchemaVersion: 1, ColorRoles: roles, PreviewConfig: config, SeedStrategy: "fixed", SeedValue: &seed}},
		Provenance:   []SuggestionProvenance{{Path: "/name", Source: SourceAssistant, State: StateAccepted, Producer: "rules", AlgorithmVersion: "1", ReasonCodes: []string{"SUGGESTED"}, SuggestedValue: json.RawMessage(`"Validated Palette"`)}},
	}
}

func previewFixture(chart string) (json.RawMessage, json.RawMessage) {
	palette := func(id string) map[string]any { return map[string]any{"source": "palette", "color_id": id} }
	theme := func(token string) map[string]any { return map[string]any{"source": "theme", "token": token} }
	var roles, config any
	switch chart {
	case "bar_error":
		roles = map[string]any{"groups": []any{map[string]any{"key": "a", "label": "A", "fill": palette(colorOne)}}, "elements": map[string]any{"axis": theme("foreground"), "grid": theme("grid"), "text": theme("foreground"), "error_bar": theme("foreground"), "background": theme("background")}}
		config = map[string]any{"orientation": "vertical", "sample_size": 24, "error_type": "sem", "data_pattern": "mixed"}
	case "boxplot_jitter":
		roles = map[string]any{"groups": []any{map[string]any{"key": "a", "label": "A", "color": palette(colorOne)}}}
		config = map[string]any{"jitter_density": "medium", "show_outliers": true}
	case "line_multiseries":
		roles = map[string]any{"series": []any{map[string]any{"key": "a", "label": "A", "line": palette(colorOne)}}}
		config = map[string]any{"point_count": 8, "curve_shape": "mixed"}
	case "heatmap_annotated":
		roles = map[string]any{"scale": map[string]any{"type": "sequential", "stops": []any{map[string]any{"position": 0, "color": palette(colorOne)}, map[string]any{"position": 1, "color": palette(colorTwo)}}}}
		config = map[string]any{"rows": 6, "columns": 6, "cluster_rows": false, "cluster_columns": false, "show_row_labels": true, "show_column_labels": true, "show_values": false, "data_pattern": "mixed"}
	case "scatter_grouped":
		roles = map[string]any{"groups": []any{map[string]any{"key": "a", "label": "A", "color": palette(colorOne)}}, "elements": map[string]any{"axis": theme("foreground"), "muted_foreground": theme("muted_foreground"), "grid": theme("grid"), "background": theme("background")}}
		config = map[string]any{"point_count": 18, "data_pattern": "clusters", "point_size": "medium"}
	case "violin_distribution":
		roles = map[string]any{"groups": []any{map[string]any{"key": "a", "label": "A", "fill": palette(colorOne)}}, "elements": map[string]any{"outline": theme("foreground"), "median": theme("foreground"), "axis": theme("foreground"), "grid": theme("grid"), "background": theme("background")}}
		config = map[string]any{"sample_count": 32, "distribution_shape": "mixed", "bandwidth": "medium", "show_summary": true}
	}
	return mustJSON(roles), mustJSON(config)
}

func mustJSON(value any) json.RawMessage {
	encoded, err := json.Marshal(value)
	if err != nil {
		panic(err)
	}
	return encoded
}
func issue(result DraftValidationResult, path, code string) bool {
	for _, item := range result.Issues {
		if item.Path == path && item.Code == code {
			return true
		}
	}
	return false
}

func TestValidateAssistantDraftKnownGoodAndDetached(t *testing.T) {
	draft := goodDraft("bar_error")
	before := cloneAssistantDraft(draft)
	first := ValidateAssistantDraft(draft)
	second := ValidateAssistantDraft(draft)
	if first.ValidatedDraft == nil || len(first.Issues) != 0 || !reflect.DeepEqual(first, second) {
		t.Fatalf("valid deterministic result: %+v", first)
	}
	if !reflect.DeepEqual(draft, before) {
		t.Fatal("validator mutated input")
	}
	first.ValidatedDraft.Colors[0].Hex = "#FFFFFF"
	first.ValidatedDraft.Disciplines[0] = "clinical"
	first.ValidatedDraft.PreviewCases[0].ColorRoles[0] = '{'
	first.ValidatedDraft.Provenance[0].ReasonCodes[0] = "CHANGED"
	first.ValidatedDraft.Provenance[0].SuggestedValue[0] = 'n'
	if !reflect.DeepEqual(draft, before) {
		t.Fatal("returned Draft aliases input")
	}
	draft.Colors[0].Hex = "#000000"
	draft.PreviewCases[0].PreviewConfig[0] = '['
	if first.ValidatedDraft.Colors[0].Hex != "#FFFFFF" || first.ValidatedDraft.PreviewCases[0].PreviewConfig[0] == '[' {
		t.Fatal("input aliases returned Draft")
	}
}

func TestValidateAssistantDraftCoreMatrix(t *testing.T) {
	tests := []struct {
		name, path, code string
		mutate           func(*AssistantDraft)
	}{
		{"contract", "/contract_version", "UNSUPPORTED_CONTRACT_VERSION", func(d *AssistantDraft) { d.ContractVersion = "x" }},
		{"revision", "/revision", "REVISION_REQUIRED", func(d *AssistantDraft) { d.Revision = 0 }},
		{"blank name", "/name", "NAME_REQUIRED", func(d *AssistantDraft) { d.Name = " \t" }},
		{"name 101", "/name", "NAME_TOO_LONG", func(d *AssistantDraft) { d.Name = strings.Repeat("界", 101) }},
		{"type", "/type", "INVALID_PALETTE_TYPE", func(d *AssistantDraft) { d.Type = "qualitative" }},
		{"source", "/source_type", "INVALID_SOURCE_TYPE", func(d *AssistantDraft) { d.SourceType = "manual" }},
		{"source note trim", "/source_note", "SOURCE_NOTE_INVALID", func(d *AssistantDraft) { d.SourceNote = " note" }},
		{"source note max", "/source_note", "SOURCE_NOTE_TOO_LONG", func(d *AssistantDraft) { d.SourceNote = strings.Repeat("界", 501) }},
		{"empty colors", "/colors", "COLORS_REQUIRED", func(d *AssistantDraft) { d.Colors = nil; d.PreviewCases = nil }},
		{"too many colors", "/colors", "TOO_MANY_COLORS", func(d *AssistantDraft) { d.PreviewCases = nil; d.Colors = makeColors(65) }},
		{"uuid", "/colors/0/id", "INVALID_COLOR_ID", func(d *AssistantDraft) { d.Colors[0].ID = "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA" }},
		{"duplicate uuid", "/colors/1/id", "DUPLICATE_COLOR_ID", func(d *AssistantDraft) { d.Colors[1].ID = colorOne }},
		{"hex", "/colors/0/hex", "INVALID_HEX", func(d *AssistantDraft) { d.Colors[0].Hex = "#aabbcc" }},
		{"duplicate hex", "/colors/1/hex", "DUPLICATE_HEX", func(d *AssistantDraft) { d.Colors[1].Hex = d.Colors[0].Hex }},
		{"order", "/colors/1/order", "INVALID_COLOR_ORDER", func(d *AssistantDraft) { d.Colors[1].Order = 3 }},
		{"app empty", "/chart_applicability", "APPLICABILITY_REQUIRED", func(d *AssistantDraft) { d.ChartApplicability = nil; d.PreviewCases = nil }},
		{"best zero", "/chart_applicability", "BEST_FIT_CARDINALITY", func(d *AssistantDraft) { d.ChartApplicability[0].Suitability = "compatible" }},
		{"best two", "/chart_applicability", "BEST_FIT_CARDINALITY", func(d *AssistantDraft) {
			d.ChartApplicability = append(d.ChartApplicability, DraftChartApplicability{ChartType: "boxplot_jitter", Suitability: "best_fit"})
		}},
		{"vocab", "/disciplines/0", "UNKNOWN_VOCABULARY_VALUE", func(d *AssistantDraft) { d.Disciplines[0] = "General" }},
		{"vocab duplicate", "/tags/1", "DUPLICATE_VOCABULARY_VALUE", func(d *AssistantDraft) { d.Tags = []string{"clean", "clean"} }},
		{"provenance pointer", "/provenance/0/path", "INVALID_JSON_POINTER", func(d *AssistantDraft) { d.Provenance[0].Path = "name" }},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			d := goodDraft("bar_error")
			test.mutate(&d)
			result := ValidateAssistantDraft(d)
			if result.ValidatedDraft != nil || !issue(result, test.path, test.code) {
				t.Fatalf("missing %s %s: %+v", test.path, test.code, result)
			}
		})
	}
	for _, n := range []int{1, 12, 13, 64} {
		d := goodDraft("bar_error")
		d.PreviewCases = nil
		d.Colors = makeColors(n)
		if result := ValidateAssistantDraft(d); result.ValidatedDraft == nil {
			t.Fatalf("color boundary %d: %+v", n, result.Issues)
		}
	}
	for _, name := range []string{"x", strings.Repeat("界", 100)} {
		d := goodDraft("bar_error")
		d.Name = name
		if result := ValidateAssistantDraft(d); result.ValidatedDraft == nil {
			t.Fatalf("name boundary %d", utf8Count(name))
		}
	}
	for _, typ := range []string{"categorical", "sequential", "diverging", "mixed"} {
		d := goodDraft("bar_error")
		d.Type = typ
		if result := ValidateAssistantDraft(d); result.ValidatedDraft == nil {
			t.Fatalf("type %s", typ)
		}
	}
}

func makeColors(count int) []DraftColor {
	colors := make([]DraftColor, count)
	for i := range colors {
		colors[i] = DraftColor{ID: fmtUUID(i), Hex: fmt.Sprintf("#%06X", i+1), Order: i, Source: SourceAdmin, State: StateAccepted}
	}
	return colors
}
func fmtUUID(i int) string       { return fmt.Sprintf("%08x-0000-4000-8000-%012x", i+1, i+1) }
func utf8Count(value string) int { return len([]rune(value)) }

func TestValidateAssistantDraftSixPreviewContracts(t *testing.T) {
	charts := []string{"bar_error", "boxplot_jitter", "line_multiseries", "heatmap_annotated", "scatter_grouped", "violin_distribution"}
	for _, chart := range charts {
		t.Run(chart, func(t *testing.T) {
			d := goodDraft(chart)
			if got := ValidateAssistantDraft(d); got.ValidatedDraft == nil {
				t.Fatalf("valid: %+v", got.Issues)
			}
			roles := decodeMap(d.PreviewCases[0].ColorRoles)
			delete(roles, firstRequiredRoot(chart))
			d.PreviewCases[0].ColorRoles = mustJSON(roles)
			if got := ValidateAssistantDraft(d); got.ValidatedDraft != nil || !hasCode(got, "INVALID_COLOR_ROLES") {
				t.Fatalf("required member: %+v", got)
			}
			d = goodDraft(chart)
			roles = decodeMap(d.PreviewCases[0].ColorRoles)
			roles["unexpected"] = true
			d.PreviewCases[0].ColorRoles = mustJSON(roles)
			if got := ValidateAssistantDraft(d); got.ValidatedDraft != nil || !hasCode(got, "INVALID_COLOR_ROLES") {
				t.Fatalf("exact unknown: %+v", got)
			}
			d = goodDraft(chart)
			config := decodeMap(d.PreviewCases[0].PreviewConfig)
			config[firstConfigField(chart)] = "__invalid__"
			d.PreviewCases[0].PreviewConfig = mustJSON(config)
			if got := ValidateAssistantDraft(d); got.ValidatedDraft != nil || !hasCode(got, "INVALID_PREVIEW_CONFIG") {
				t.Fatalf("enum/range: %+v", got)
			}
			d = goodDraft(chart)
			replaceFirstColorID(t, &d, "ffffffff-ffff-4fff-8fff-ffffffffffff", nil)
			if got := ValidateAssistantDraft(d); !hasCode(got, "UNKNOWN_DRAFT_COLOR_REFERENCE") {
				t.Fatalf("membership: %+v", got)
			}
			d = goodDraft(chart)
			replaceFirstColorID(t, &d, "", map[string]any{"hex": "#112233", "index": 0, "order": 0})
			if got := ValidateAssistantDraft(d); got.ValidatedDraft != nil || hasCode(got, "UNKNOWN_DRAFT_COLOR_REFERENCE") || !hasCode(got, "INVALID_COLOR_ROLES") {
				t.Fatalf("fallback must fail at shape: %+v", got)
			}
		})
	}
}

func firstRequiredRoot(chart string) string {
	if chart == "line_multiseries" {
		return "series"
	}
	if chart == "heatmap_annotated" {
		return "scale"
	}
	return "groups"
}
func firstConfigField(chart string) string {
	switch chart {
	case "bar_error":
		return "orientation"
	case "boxplot_jitter":
		return "jitter_density"
	case "line_multiseries":
		return "curve_shape"
	case "heatmap_annotated":
		return "data_pattern"
	case "scatter_grouped":
		return "data_pattern"
	default:
		return "distribution_shape"
	}
}
func decodeMap(raw json.RawMessage) map[string]any {
	var value map[string]any
	if json.Unmarshal(raw, &value) != nil {
		panic("json")
	}
	return value
}
func hasCode(result DraftValidationResult, code string) bool {
	for _, item := range result.Issues {
		if item.Code == code {
			return true
		}
	}
	return false
}

func replaceFirstColorID(t *testing.T, d *AssistantDraft, id string, extra map[string]any) {
	t.Helper()
	roles := decodeMap(d.PreviewCases[0].ColorRoles)
	var visit func(any) bool
	visit = func(value any) bool {
		switch x := value.(type) {
		case map[string]any:
			if x["source"] == "palette" {
				delete(x, "color_id")
				if id != "" {
					x["color_id"] = id
				}
				for k, v := range extra {
					x[k] = v
				}
				return true
			}
			for _, child := range x {
				if visit(child) {
					return true
				}
			}
		case []any:
			for _, child := range x {
				if visit(child) {
					return true
				}
			}
		}
		return false
	}
	if !visit(roles) {
		t.Fatal("no palette reference")
	}
	d.PreviewCases[0].ColorRoles = mustJSON(roles)
}

func TestValidateAssistantDraftPreviewBoundariesAndSeeds(t *testing.T) {
	d := goodDraft("bar_error")
	d.PreviewCases = nil
	if got := ValidateAssistantDraft(d); got.ValidatedDraft == nil {
		t.Fatal(got.Issues)
	}
	d = goodDraft("bar_error")
	d.PreviewCases = append(d.PreviewCases, d.PreviewCases[0])
	if got := ValidateAssistantDraft(d); !issue(got, "/preview_cases", "TOO_MANY_PREVIEW_CASES") {
		t.Fatal(got.Issues)
	}
	stable := goodDraft("bar_error")
	stable.PreviewCases[0].SeedStrategy = "stable_id"
	stable.PreviewCases[0].SeedValue = nil
	if got := ValidateAssistantDraft(stable); got.ValidatedDraft == nil {
		t.Fatal(got.Issues)
	}
	zero := 0
	stable.PreviewCases[0].SeedValue = &zero
	if got := ValidateAssistantDraft(stable); !hasCode(got, "STABLE_SEED_VALUE_FORBIDDEN") {
		t.Fatal(got.Issues)
	}
	fixed := goodDraft("bar_error")
	fixed.PreviewCases[0].SeedValue = nil
	if got := ValidateAssistantDraft(fixed); !hasCode(got, "FIXED_SEED_VALUE_REQUIRED") {
		t.Fatal(got.Issues)
	}
	for _, seed := range []int{math.MinInt32, 0, math.MaxInt32} {
		d := goodDraft("bar_error")
		d.PreviewCases[0].SeedValue = &seed
		if got := ValidateAssistantDraft(d); got.ValidatedDraft == nil {
			t.Fatalf("seed %d: %+v", seed, got.Issues)
		}
	}
	for _, seed := range []int{math.MinInt32 - 1, math.MaxInt32 + 1} {
		d := goodDraft("bar_error")
		d.PreviewCases[0].SeedValue = &seed
		if got := ValidateAssistantDraft(d); !hasCode(got, "FIXED_SEED_OUT_OF_RANGE") {
			t.Fatalf("out of range %d: %+v", seed, got.Issues)
		}
	}
}

func TestValidateAssistantDraftJSONAndOrdering(t *testing.T) {
	d := goodDraft("bar_error")
	d.Name = ""
	d.Colors[0].Hex = "bad"
	d.PreviewCases[0].ColorRoles = json.RawMessage(`null`)
	got := ValidateAssistantDraft(d)
	if got.ValidatedDraft != nil {
		t.Fatal("invalid returned Draft")
	}
	for i := 1; i < len(got.Issues); i++ {
		a, b := got.Issues[i-1], got.Issues[i]
		if a.Path > b.Path || a.Path == b.Path && a.Code > b.Code {
			t.Fatalf("issues not sorted: %+v", got.Issues)
		}
	}
	d = goodDraft("bar_error")
	d.PreviewCases[0].ColorRoles = make(json.RawMessage, PreviewJSONByteLimit+1)
	if got := ValidateAssistantDraft(d); !hasCode(got, "JSON_OBJECT_TOO_LARGE") {
		t.Fatal(got.Issues)
	}
	for name, raw := range map[string]json.RawMessage{"nil": nil, "empty": {}, "null": json.RawMessage(`null`), "array": json.RawMessage(`[]`), "malformed": json.RawMessage(`{"x":`), "trailing": json.RawMessage(`{} {}`)} {
		t.Run(name, func(t *testing.T) {
			draft := goodDraft("bar_error")
			draft.PreviewCases[0].PreviewConfig = raw
			if got := ValidateAssistantDraft(draft); !hasCode(got, "INVALID_JSON_OBJECT") {
				t.Fatalf("%s: %+v", name, got.Issues)
			}
		})
	}
}

func TestGeneratedInterpreterFeaturesAndFailClosed(t *testing.T) {
	v := &draftValidator{}
	object := map[string]any{"items": []any{map[string]any{"key": "a", "value": 1}, map[string]any{"key": "a", "value": 1}}}
	exact := true
	min, max := 1, 2
	zero, ten := float64(0), float64(10)
	item := schemaNode{Kind: "object", Exact: &exact, Fields: map[string]schemaField{
		"key":   {Required: true, Schema: schemaNode{Kind: "string", NonWhitespace: true}},
		"value": {Required: true, Schema: schemaNode{Kind: "number", Integer: true, Min: &zero, Max: &ten}},
	}}
	array := schemaNode{Kind: "array", Items: &item, MinItems: &min, MaxItems: &max, Rules: []schemaRule{{Kind: "unique_by", Field: "key"}}}
	schema := schemaNode{Kind: "object", Exact: &exact, Fields: map[string]schemaField{"items": {Required: true, Schema: array}}}
	if _, err := v.validateSchema(object, schema, "/x", "INVALID"); err != nil || len(v.issues) == 0 {
		t.Fatalf("interpreter features: %v %+v", err, v.issues)
	}
	for _, bad := range []schemaNode{{Kind: "unknown"}, {Kind: "array", Items: &schemaNode{Kind: "boolean"}, Rules: []schemaRule{{Kind: "unknown", Field: "x"}}}, {Kind: "palette_reference", UnknownMembers: "unknown"}} {
		if validateAuthorityNode(bad) == nil {
			t.Fatalf("authority accepted %+v", bad)
		}
	}
	visual := schemaNode{Kind: "visual_reference", ThemeTokens: []string{"foreground"}, UnknownMembers: "reject"}
	v = &draftValidator{}
	if refs, err := v.validateSchema(map[string]any{"source": "theme", "token": "foreground", "extra": true}, visual, "/visual", "INVALID"); err != nil || len(refs) != 0 || len(v.issues) != 1 || v.issues[0].Path != "/visual/extra" {
		t.Fatalf("visual/exact: %v %+v", err, v.issues)
	}
	palette := schemaNode{Kind: "palette_reference", UnknownMembers: "allow"}
	v = &draftValidator{}
	refs, err := v.validateSchema(map[string]any{"source": "palette", "color_id": colorOne, "hex": "#112233"}, palette, "/palette", "INVALID")
	if err != nil || len(v.issues) != 0 || len(refs) != 1 || refs[0].id != colorOne {
		t.Fatalf("palette allow: %v %+v %+v", err, v.issues, refs)
	}
	exactObject := schemaNode{Kind: "object", Exact: &exact, Fields: map[string]schemaField{}}
	v = &draftValidator{}
	_, _ = v.validateSchema(map[string]any{"a/b~c": true}, exactObject, "/x", "INVALID")
	if len(v.issues) != 1 || v.issues[0].Path != "/x/a~1b~0c" {
		t.Fatalf("pointer escaping: %+v", v.issues)
	}
}

func TestValidateAssistantDraftMetadataProvenanceAndPreviewMetadata(t *testing.T) {
	for _, field := range []string{"disciplines", "use_cases", "avoid_cases", "tags"} {
		d := goodDraft("bar_error")
		switch field {
		case "disciplines":
			d.Disciplines = []string{"unknown"}
		case "use_cases":
			d.UseCases = []string{"unknown"}
		case "avoid_cases":
			d.AvoidCases = []string{"unknown"}
		case "tags":
			d.Tags = []string{"unknown"}
		}
		if got := ValidateAssistantDraft(d); !hasCode(got, "UNKNOWN_VOCABULARY_VALUE") {
			t.Fatalf("%s: %+v", field, got.Issues)
		}
	}
	d := goodDraft("bar_error")
	d.ChartApplicability = append(d.ChartApplicability, DraftChartApplicability{ChartType: "bar_error", Suitability: "compatible"})
	if got := ValidateAssistantDraft(d); !hasCode(got, "DUPLICATE_CHART_TYPE") {
		t.Fatal(got.Issues)
	}
	mutations := []func(*DraftPreviewCase){func(p *DraftPreviewCase) { p.ChartType = "boxplot_jitter" }, func(p *DraftPreviewCase) { p.TemplateID = "missing_v1" }, func(p *DraftPreviewCase) { p.TemplateVersion = 2 }, func(p *DraftPreviewCase) { p.SchemaVersion = 2 }}
	for _, mutate := range mutations {
		draft := goodDraft("bar_error")
		mutate(&draft.PreviewCases[0])
		if got := ValidateAssistantDraft(draft); got.ValidatedDraft != nil {
			t.Fatal("invalid preview metadata accepted")
		}
	}
	d = goodDraft("bar_error")
	d.Provenance[0].AmbiguityGroup = "single"
	if got := ValidateAssistantDraft(d); !hasCode(got, "INVALID_AMBIGUITY_GROUP") {
		t.Fatal(got.Issues)
	}
	heat := goodDraft("heatmap_annotated")
	roles := decodeMap(heat.PreviewCases[0].ColorRoles)
	scale := roles["scale"].(map[string]any)
	stops := scale["stops"].([]any)
	stops[1].(map[string]any)["position"] = 0
	heat.PreviewCases[0].ColorRoles = mustJSON(roles)
	if got := ValidateAssistantDraft(heat); !hasCode(got, "INVALID_COLOR_ROLES") {
		t.Fatalf("strictly increasing: %+v", got.Issues)
	}
	heat = goodDraft("heatmap_annotated")
	roles = decodeMap(heat.PreviewCases[0].ColorRoles)
	scale = roles["scale"].(map[string]any)
	scale["type"] = "diverging"
	heat.PreviewCases[0].ColorRoles = mustJSON(roles)
	if got := ValidateAssistantDraft(heat); !hasCode(got, "INVALID_COLOR_ROLES") {
		t.Fatalf("conditional minimum: %+v", got.Issues)
	}
}

func TestValidateAssistantDraftAccessibilityCombinations(t *testing.T) {
	for bits := 0; bits < 8; bits++ {
		d := goodDraft("bar_error")
		d.Accessibility = DraftAccessibility{ColorblindSafe: bits&1 != 0, PrintFriendly: bits&2 != 0, DarkBackground: bits&4 != 0}
		before := d.Accessibility
		got := ValidateAssistantDraft(d)
		if got.ValidatedDraft == nil || got.ValidatedDraft.Accessibility != before || d.Accessibility != before {
			t.Fatalf("combination %03b changed or rejected: %+v", bits, got)
		}
		got.ValidatedDraft.Accessibility.ColorblindSafe = !before.ColorblindSafe
		if d.Accessibility != before {
			t.Fatalf("combination %03b aliases input", bits)
		}
	}
}

func TestValidateAssistantDraftMetadataCardinalityBoundaries(t *testing.T) {
	authority, err := loadGeneratedRegistry()
	if err != nil {
		t.Fatal(err)
	}
	tests := []struct {
		name    string
		allowed []string
		maximum int
		set     func(*AssistantDraft, []string)
	}{
		{"disciplines", authority.Vocabularies.Disciplines, maximumDisciplines, func(d *AssistantDraft, values []string) { d.Disciplines = values }},
		{"use_cases", authority.Vocabularies.UseCases, maximumUseCases, func(d *AssistantDraft, values []string) { d.UseCases = values }},
		{"avoid_cases", authority.Vocabularies.AvoidCases, maximumAvoidCases, func(d *AssistantDraft, values []string) { d.AvoidCases = values }},
		{"tags", authority.Vocabularies.Tags, maximumTags, func(d *AssistantDraft, values []string) { d.Tags = values }},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			atMaximum := make([]string, test.maximum)
			for i := range atMaximum {
				atMaximum[i] = test.allowed[i%len(test.allowed)]
			}
			d := goodDraft("bar_error")
			test.set(&d, atMaximum)
			at := ValidateAssistantDraft(d)
			if issue(at, "/"+test.name, "TOO_MANY_VOCABULARY_VALUES") {
				t.Fatalf("exact maximum rejected as overflow: %+v", at.Issues)
			}
			if len(test.allowed) >= test.maximum {
				if at.ValidatedDraft == nil {
					t.Fatalf("unique exact maximum rejected: %+v", at.Issues)
				}
				returned := metadataValues(at.ValidatedDraft, test.name)
				returned[0] = test.allowed[len(test.allowed)-1]
				if metadataValues(&d, test.name)[0] != atMaximum[0] {
					t.Fatal("metadata result aliases input")
				}
			}
			overflow := append(cloneSlice(atMaximum), test.allowed[0])
			test.set(&d, overflow)
			if got := ValidateAssistantDraft(d); !issue(got, "/"+test.name, "TOO_MANY_VOCABULARY_VALUES") || got.ValidatedDraft != nil {
				t.Fatalf("overflow accepted: %+v", got)
			}
		})
	}
	for _, field := range []string{"disciplines", "use_cases", "avoid_cases", "tags"} {
		d := goodDraft("bar_error")
		switch field {
		case "disciplines":
			d.Disciplines = []string{"General"}
		case "use_cases":
			d.UseCases = []string{" publication"}
		case "avoid_cases":
			d.AvoidCases = []string{"HEATMAP"}
		case "tags":
			d.Tags = []string{"Clean"}
		}
		if got := ValidateAssistantDraft(d); !issue(got, "/"+field+"/0", "UNKNOWN_VOCABULARY_VALUE") {
			t.Fatalf("%s canonical matching: %+v", field, got.Issues)
		}
	}
}

func TestValidateAssistantDraftProvenanceBoundaries(t *testing.T) {
	entry := goodDraft("bar_error").Provenance[0]
	entries := make([]SuggestionProvenance, maximumProvenanceEntries)
	for i := range entries {
		entries[i] = entry
		entries[i].Path = "/name/" + strconv.Itoa(i)
		entries[i].ReasonCodes = []string{"SUGGESTED"}
		entries[i].SuggestedValue = json.RawMessage(`null`)
	}
	d := goodDraft("bar_error")
	d.Provenance = entries
	if got := ValidateAssistantDraft(d); got.ValidatedDraft == nil {
		t.Fatalf("exact provenance maximum: %+v", got.Issues)
	} else {
		got.ValidatedDraft.Provenance[0].ReasonCodes[0] = "CHANGED"
		got.ValidatedDraft.Provenance[0].SuggestedValue[0] = 'f'
		if d.Provenance[0].ReasonCodes[0] != "SUGGESTED" || string(d.Provenance[0].SuggestedValue) != "null" {
			t.Fatal("provenance result aliases input")
		}
	}
	d.Provenance = append(d.Provenance, entry)
	if got := ValidateAssistantDraft(d); !issue(got, "/provenance", "TOO_MANY_PROVENANCE_ENTRIES") {
		t.Fatalf("provenance overflow: %+v", got.Issues)
	}

	validText := strings.Repeat("界", maximumProvenanceTextRunes)
	tests := []struct {
		name, path, code string
		mutate           func(*SuggestionProvenance)
	}{
		{"producer max", "", "", func(p *SuggestionProvenance) { p.Producer = validText }},
		{"producer overflow", "/provenance/0/producer", "PRODUCER_TOO_LONG", func(p *SuggestionProvenance) { p.Producer = validText + "界" }},
		{"producer control", "/provenance/0/producer", "INVALID_PRODUCER", func(p *SuggestionProvenance) { p.Producer = "a\n" }},
		{"algorithm max", "", "", func(p *SuggestionProvenance) { p.AlgorithmVersion = validText }},
		{"algorithm overflow", "/provenance/0/algorithm_version", "ALGORITHM_VERSION_TOO_LONG", func(p *SuggestionProvenance) { p.AlgorithmVersion = validText + "界" }},
		{"reason max", "", "", func(p *SuggestionProvenance) { p.ReasonCodes = []string{validText} }},
		{"reason overflow", "/provenance/0/reason_codes/0", "REASON_CODE_TOO_LONG", func(p *SuggestionProvenance) { p.ReasonCodes = []string{validText + "界"} }},
		{"ambiguity max", "", "", func(p *SuggestionProvenance) { p.AmbiguityGroup = validText; p.ReasonCodes = []string{"AMBIGUOUS"} }},
		{"ambiguity overflow", "/provenance/0/ambiguity_group", "AMBIGUITY_GROUP_TOO_LONG", func(p *SuggestionProvenance) {
			p.AmbiguityGroup = validText + "界"
			p.ReasonCodes = []string{"AMBIGUOUS"}
		}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			draft := goodDraft("bar_error")
			test.mutate(&draft.Provenance[0])
			got := ValidateAssistantDraft(draft)
			if test.code == "" && got.ValidatedDraft == nil {
				t.Fatalf("boundary rejected: %+v", got.Issues)
			}
			if test.code != "" && !issue(got, test.path, test.code) {
				t.Fatalf("missing boundary issue: %+v", got.Issues)
			}
		})
	}
	d = goodDraft("bar_error")
	d.Provenance[0].ReasonCodes = make([]string, maximumReasonCodes)
	for i := range d.Provenance[0].ReasonCodes {
		d.Provenance[0].ReasonCodes[i] = fmt.Sprintf("R%d", i)
	}
	if got := ValidateAssistantDraft(d); got.ValidatedDraft == nil {
		t.Fatalf("reason exact max: %+v", got.Issues)
	}
	d.Provenance[0].ReasonCodes = append(d.Provenance[0].ReasonCodes, "OVER")
	if got := ValidateAssistantDraft(d); !issue(got, "/provenance/0/reason_codes", "TOO_MANY_REASON_CODES") {
		t.Fatal(got.Issues)
	}

	exactJSON := json.RawMessage(`"` + strings.Repeat("x", maximumSuggestedValueBytes-2) + `"`)
	d = goodDraft("bar_error")
	d.Provenance[0].SuggestedValue = exactJSON
	if got := ValidateAssistantDraft(d); got.ValidatedDraft == nil {
		t.Fatalf("exact JSON bytes: %+v", got.Issues)
	}
	d.Provenance[0].SuggestedValue = append(cloneSlice(exactJSON), ' ')
	if got := ValidateAssistantDraft(d); !issue(got, "/provenance/0/suggested_value", "SUGGESTED_VALUE_TOO_LARGE") {
		t.Fatal(got.Issues)
	}
}

func metadataValues(d *AssistantDraft, field string) []string {
	switch field {
	case "disciplines":
		return d.Disciplines
	case "use_cases":
		return d.UseCases
	case "avoid_cases":
		return d.AvoidCases
	default:
		return d.Tags
	}
}

func TestValidateAssistantDraftOneColorAllPaletteTypesAndApplicabilityMaximum(t *testing.T) {
	for _, typ := range []string{"categorical", "sequential", "diverging", "mixed"} {
		d := goodDraft("bar_error")
		d.Type, d.Colors, d.PreviewCases = typ, d.Colors[:1], nil
		if got := ValidateAssistantDraft(d); got.ValidatedDraft == nil {
			t.Fatalf("%s one color: %+v", typ, got.Issues)
		}
	}
	authority, err := loadGeneratedRegistry()
	if err != nil {
		t.Fatal(err)
	}
	d := goodDraft("bar_error")
	d.PreviewCases = nil
	d.ChartApplicability = make([]DraftChartApplicability, len(authority.Charts))
	for i, chart := range authority.Charts {
		suitability := "compatible"
		if i == 0 {
			suitability = "best_fit"
		}
		d.ChartApplicability[i] = DraftChartApplicability{ChartType: chart.ChartType, Suitability: suitability}
	}
	if got := ValidateAssistantDraft(d); got.ValidatedDraft == nil {
		t.Fatalf("all registered applicability: %+v", got.Issues)
	}
	d.ChartApplicability = append(d.ChartApplicability, DraftChartApplicability{ChartType: authority.Charts[0].ChartType, Suitability: "compatible"})
	if got := ValidateAssistantDraft(d); !hasCode(got, "DUPLICATE_CHART_TYPE") {
		t.Fatal(got.Issues)
	}
}

func TestConditionalMinimumWrongTypeParity(t *testing.T) {
	exact := true
	arrayItems := schemaNode{Kind: "string"}
	array := schemaNode{Kind: "array", Items: &arrayItems}
	schema := schemaNode{Kind: "object", Exact: &exact, Fields: map[string]schemaField{
		"type":  {Required: true, Schema: schemaNode{Kind: "string"}},
		"stops": {Required: true, Schema: array},
	}, Rules: []schemaRule{{Kind: "conditional_min_items", DiscriminatorField: "type", ArrayField: "stops", Cases: map[string]int{"sequential": 2}}}}
	v := &draftValidator{}
	_, err := v.validateSchema(map[string]any{"type": "sequential", "stops": "wrong"}, schema, "/scale", "INVALID_COLOR_ROLES")
	if err != nil || len(v.issues) != 1 || v.issues[0].Path != "/scale/stops" || v.issues[0].Code != "INVALID_COLOR_ROLES" {
		t.Fatalf("wrong-type parity emitted extra issue: %v %+v", err, v.issues)
	}
}

func TestMalformedRolesAndConfigAreIndependent(t *testing.T) {
	roles := goodDraft("bar_error")
	roles.PreviewCases[0].ColorRoles = json.RawMessage(`{"groups":`)
	if got := ValidateAssistantDraft(roles); !issue(got, "/preview_cases/0/color_roles", "INVALID_JSON_OBJECT") || issue(got, "/preview_cases/0/preview_config", "INVALID_JSON_OBJECT") {
		t.Fatal(got.Issues)
	}
	config := goodDraft("bar_error")
	config.PreviewCases[0].PreviewConfig = json.RawMessage(`{"orientation":`)
	if got := ValidateAssistantDraft(config); !issue(got, "/preview_cases/0/preview_config", "INVALID_JSON_OBJECT") || issue(got, "/preview_cases/0/color_roles", "INVALID_JSON_OBJECT") {
		t.Fatal(got.Issues)
	}
}

func TestValidateAssistantDraftFrozenApplicabilityColorAndProvenanceValues(t *testing.T) {
	for _, source := range []SuggestionSource{SourceAssistant, SourceAdmin} {
		for _, state := range []SuggestionState{StateUnconfirmed, StateAccepted, StateModified} {
			d := goodDraft("bar_error")
			d.Colors[0].Source, d.Colors[0].State = source, state
			if got := ValidateAssistantDraft(d); got.ValidatedDraft == nil {
				t.Fatalf("color %s/%s: %+v", source, state, got.Issues)
			}
		}
	}
	for _, mutation := range []func(*DraftColor){
		func(c *DraftColor) { c.Source = "system" },
		func(c *DraftColor) { c.State = StateCleared },
	} {
		d := goodDraft("bar_error")
		mutation(&d.Colors[0])
		if got := ValidateAssistantDraft(d); got.ValidatedDraft != nil {
			t.Fatal("invalid active color source/state accepted")
		}
	}
	for _, source := range []SuggestionSource{SourceAssistant, SourceAdmin} {
		for _, state := range []SuggestionState{StateUnconfirmed, StateAccepted, StateModified, StateCleared} {
			d := goodDraft("bar_error")
			d.Provenance[0].Source, d.Provenance[0].State = source, state
			if got := ValidateAssistantDraft(d); got.ValidatedDraft == nil {
				t.Fatalf("provenance %s/%s: %+v", source, state, got.Issues)
			}
		}
	}
	for _, count := range []int{maximumApplicabilityRunes, maximumApplicabilityRunes + 1} {
		d := goodDraft("bar_error")
		d.ChartApplicability[0].Notes = strings.Repeat("界", count)
		got := ValidateAssistantDraft(d)
		if count == maximumApplicabilityRunes && got.ValidatedDraft == nil {
			t.Fatalf("notes exact maximum: %+v", got.Issues)
		}
		if count > maximumApplicabilityRunes && !issue(got, "/chart_applicability/0/notes", "INVALID_APPLICABILITY_NOTES") {
			t.Fatalf("notes overflow: %+v", got.Issues)
		}
	}
}

func TestSixPreviewConfigConstraintFamilies(t *testing.T) {
	tests := []struct {
		chart     string
		mutations []func(map[string]any)
	}{
		{"bar_error", []func(map[string]any){func(c map[string]any) { c["orientation"] = "diagonal" }, func(c map[string]any) { c["sample_size"] = 0 }, func(c map[string]any) { c["sample_size"] = 1.5 }}},
		{"boxplot_jitter", []func(map[string]any){func(c map[string]any) { c["jitter_density"] = "extreme" }, func(c map[string]any) { c["show_outliers"] = "true" }}},
		{"line_multiseries", []func(map[string]any){func(c map[string]any) { c["curve_shape"] = "flat" }, func(c map[string]any) { c["point_count"] = 5 }, func(c map[string]any) { c["point_count"] = 6.5 }}},
		{"heatmap_annotated", []func(map[string]any){func(c map[string]any) { c["data_pattern"] = "noise" }, func(c map[string]any) { c["rows"] = 3 }, func(c map[string]any) { c["columns"] = 4.5 }, func(c map[string]any) { c["cluster_rows"] = "false" }}},
		{"scatter_grouped", []func(map[string]any){func(c map[string]any) { c["point_size"] = "huge" }, func(c map[string]any) { c["point_count"] = 31 }, func(c map[string]any) { c["point_opacity"] = 0.24 }}},
		{"violin_distribution", []func(map[string]any){func(c map[string]any) { c["bandwidth"] = "automatic" }, func(c map[string]any) { c["sample_count"] = 15 }, func(c map[string]any) { c["sample_count"] = 16.5 }, func(c map[string]any) { c["show_summary"] = 1 }}},
	}
	for _, test := range tests {
		for i, mutate := range test.mutations {
			t.Run(fmt.Sprintf("%s/%d", test.chart, i), func(t *testing.T) {
				d := goodDraft(test.chart)
				config := decodeMap(d.PreviewCases[0].PreviewConfig)
				mutate(config)
				d.PreviewCases[0].PreviewConfig = mustJSON(config)
				if got := ValidateAssistantDraft(d); !hasCode(got, "INVALID_PREVIEW_CONFIG") || got.ValidatedDraft != nil {
					t.Fatalf("constraint accepted: %+v", got)
				}
			})
		}
	}
}

func TestUniqueByIssuePathAndDeterminism(t *testing.T) {
	d := goodDraft("bar_error")
	roles := decodeMap(d.PreviewCases[0].ColorRoles)
	groups := roles["groups"].([]any)
	duplicate := map[string]any{"key": "a", "label": "B", "fill": map[string]any{"source": "palette", "color_id": colorTwo}}
	roles["groups"] = append(groups, duplicate)
	d.PreviewCases[0].ColorRoles = mustJSON(roles)
	first, second := ValidateAssistantDraft(d), ValidateAssistantDraft(d)
	if !reflect.DeepEqual(first.Issues, second.Issues) || !issue(first, "/preview_cases/0/color_roles/groups/1/key", "DUPLICATE_ROLE_KEY") {
		t.Fatalf("unique_by issue: %+v", first.Issues)
	}
}

func TestValidationDependencyBoundary(t *testing.T) {
	source, err := os.ReadFile("validation.go")
	if err != nil {
		t.Fatal(err)
	}
	text := string(source)
	for _, forbidden := range []string{"github.com/gin-gonic", "net/http", "database/sql", "internal/repository", "CandidateAggregate", "CreateCandidate"} {
		if strings.Contains(text, forbidden) {
			t.Fatalf("validation boundary contains %q", forbidden)
		}
	}
	fset := token.NewFileSet()
	packages, err := parser.ParseDir(fset, ".", func(info os.FileInfo) bool {
		return filepath.Ext(info.Name()) == ".go" && !strings.HasSuffix(info.Name(), "_test.go")
	}, parser.ImportsOnly)
	if err != nil {
		t.Fatal(err)
	}
	pkg := packages["paletteassistant"]
	if pkg == nil {
		t.Fatal("paletteassistant package not parsed")
	}
	for filename, file := range pkg.Files {
		for _, spec := range file.Imports {
			path, err := strconv.Unquote(spec.Path.Value)
			if err != nil {
				t.Fatal(err)
			}
			if strings.Contains(path, ".") || path == "net/http" || path == "database/sql" {
				t.Fatalf("production package import %q in %s violates dependency boundary", path, filename)
			}
		}
	}
}
