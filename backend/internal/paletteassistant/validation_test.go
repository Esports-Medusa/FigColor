package paletteassistant

import (
	"encoding/json"
	"fmt"
	"math"
	"os"
	"reflect"
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
}
