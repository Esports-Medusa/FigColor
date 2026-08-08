package palette

import (
	"encoding/json"
	"testing"
)

func TestScatterGroupedAndViolinDistributionTemplateContracts(t *testing.T) {
	tests := []struct {
		name       string
		chartType  string
		templateID string
		roles      string
		config     string
	}{
		{
			name:       "scatter grouped",
			chartType:  ChartTypeScatterGrouped,
			templateID: "scatter_grouped_v1",
			roles: `{
				"groups":[
					{"key":"control","label":"Control","color":{"source":"palette","color_id":"color-1"}},
					{"key":"treated","label":"Treated","color":{"source":"palette","color_id":"color-2"}}
				],
				"elements":{
					"axis":{"source":"theme","token":"foreground"},
					"muted_foreground":{"source":"theme","token":"muted_foreground"},
					"grid":{"source":"theme","token":"grid"},
					"background":{"source":"theme","token":"background"}
				}
			}`,
			config: `{"point_count":14,"data_pattern":"clusters","point_size":"medium","point_opacity":0.68}`,
		},
		{
			name:       "violin distribution",
			chartType:  ChartTypeViolinDistribution,
			templateID: "violin_distribution_v1",
			roles: `{
				"groups":[
					{"key":"control","label":"Control","fill":{"source":"palette","color_id":"color-1"}},
					{"key":"treated","label":"Treated","fill":{"source":"palette","color_id":"color-2"}}
				],
				"elements":{
					"outline":{"source":"theme","token":"foreground"},
					"median":{"source":"theme","token":"foreground"},
					"axis":{"source":"theme","token":"foreground"},
					"grid":{"source":"theme","token":"grid"},
					"background":{"source":"theme","token":"background"}
				}
			}`,
			config: `{"sample_count":28,"distribution_shape":"mixed","bandwidth":"medium","show_summary":true}`,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			candidate := &previewCaseCandidate{
				ChartType:       test.chartType,
				TemplateID:      test.templateID,
				TemplateVersion: 1,
				SchemaVersion:   1,
				ColorRoles:      json.RawMessage(test.roles),
				PreviewConfig:   json.RawMessage(test.config),
			}
			if issues := validatePreviewCaseTemplateContract(candidate); len(issues) != 0 {
				t.Fatalf("valid contract rejected: %#v", issues)
			}
		})
	}
}

func TestScatterViolinValidationFailures(t *testing.T) {
	scatter := &previewCaseCandidate{
		ChartType:       ChartTypeScatterGrouped,
		TemplateID:      "scatter_grouped_v1",
		TemplateVersion: 1,
		SchemaVersion:   1,
		ColorRoles: json.RawMessage(`{
			"groups":[
				{"key":"same","label":"One","color":{"source":"palette","color_id":"color-1","opacity":2}},
				{"key":"same","label":"Two","color":{"source":"palette","color_id":"color-2"}}
			],
			"elements":{
				"axis":{"source":"theme","token":"foreground"},
				"muted_foreground":{"source":"theme","token":"muted_foreground"},
				"grid":{"source":"theme","token":"grid"},
				"background":{"source":"theme","token":"background"}
			}
		}`),
		PreviewConfig: json.RawMessage(`{"point_count":2,"data_pattern":"clusters","point_size":"medium"}`),
	}
	issues := validatePreviewCaseTemplateContract(scatter)
	assertHasValidationCode(t, issues, "DUPLICATE_ROLE_KEY")
	assertHasValidationCode(t, issues, "INVALID_OPACITY")
	assertHasValidationCode(t, issues, "INVALID_PREVIEW_CONFIG")

	violin := &previewCaseCandidate{
		ChartType:       ChartTypeViolinDistribution,
		TemplateID:      "violin_distribution_v1",
		TemplateVersion: 1,
		SchemaVersion:   1,
		ColorRoles:      json.RawMessage(`{"groups":[],"elements":{}}`),
		PreviewConfig:   json.RawMessage(`{"sample_count":28,"distribution_shape":"unknown","bandwidth":"medium","show_summary":true}`),
	}
	issues = validatePreviewCaseTemplateContract(violin)
	assertHasValidationCode(t, issues, "INVALID_ROLE_STRUCTURE")
	assertHasValidationCode(t, issues, "INVALID_COLOR_ROLES")
	assertHasValidationCode(t, issues, "INVALID_PREVIEW_CONFIG")
}

func assertHasValidationCode(t *testing.T, issues []ValidationIssue, code string) {
	t.Helper()
	for _, issue := range issues {
		if issue.Code == code {
			return
		}
	}
	t.Fatalf("issues %#v do not contain %s", issues, code)
}
