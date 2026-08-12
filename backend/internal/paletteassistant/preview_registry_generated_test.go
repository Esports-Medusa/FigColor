package paletteassistant

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"strings"
	"testing"
)

func TestGeneratedPreviewRegistryArtifact(t *testing.T) {
	var projection struct {
		ProjectionFormatVersion int `json:"projection_format_version"`
		Charts                  []struct {
			ChartType string `json:"chart_type"`
			Templates []struct {
				TemplateID      string         `json:"template_id"`
				TemplateVersion int            `json:"template_version"`
				SchemaVersion   int            `json:"schema_version"`
				RolesSchema     map[string]any `json:"roles_schema"`
				ConfigSchema    map[string]any `json:"config_schema"`
			} `json:"templates"`
		} `json:"charts"`
		Vocabularies map[string][]string `json:"vocabularies"`
	}
	if err := json.Unmarshal([]byte(previewRegistryProjectionJSON), &projection); err != nil {
		t.Fatalf("generated projection must decode: %v", err)
	}
	if projection.ProjectionFormatVersion != PreviewRegistryProjectionFormatVersion || len(projection.Charts) != 6 {
		t.Fatalf("unexpected projection shape: version=%d charts=%d", projection.ProjectionFormatVersion, len(projection.Charts))
	}
	charts, templates := map[string]bool{}, map[string]bool{}
	for _, chart := range projection.Charts {
		if chart.ChartType == "" || charts[chart.ChartType] || len(chart.Templates) != 1 {
			t.Fatalf("invalid chart entry: %q", chart.ChartType)
		}
		charts[chart.ChartType] = true
		for _, template := range chart.Templates {
			if template.TemplateID == "" || templates[template.TemplateID] || template.TemplateVersion != 1 || template.SchemaVersion != 1 || len(template.RolesSchema) == 0 || len(template.ConfigSchema) == 0 {
				t.Fatalf("invalid template entry: %q", template.TemplateID)
			}
			templates[template.TemplateID] = true
		}
	}
	for _, key := range []string{"disciplines", "use_cases", "avoid_cases", "tags"} {
		if len(projection.Vocabularies[key]) == 0 {
			t.Fatalf("missing vocabulary %s", key)
		}
	}
	for key, values := range projection.Vocabularies {
		seen := map[string]bool{}
		for _, value := range values {
			if value == "" || seen[value] {
				t.Fatalf("invalid or duplicate %s vocabulary value %q", key, value)
			}
			seen[value] = true
		}
	}
	for chartIndex, chart := range projection.Charts {
		for templateIndex, template := range chart.Templates {
			validateGeneratedSchemaNode(t, template.RolesSchema, "roles", chartIndex, templateIndex)
			validateGeneratedSchemaNode(t, template.ConfigSchema, "config", chartIndex, templateIndex)
		}
	}
	digest := sha256.Sum256([]byte(previewRegistryProjectionJSON))
	if hex.EncodeToString(digest[:]) != PreviewRegistryFingerprint || len(PreviewRegistryFingerprint) != 64 {
		t.Fatal("generated fingerprint does not bind canonical projection")
	}
	for _, forbidden := range []string{"owner_user_id", "preview_case_id", "created_at", "candidate"} {
		if strings.Contains(previewRegistryProjectionJSON, forbidden) {
			t.Fatalf("generated projection contains lifecycle material %q", forbidden)
		}
	}
}

func validateGeneratedSchemaNode(t *testing.T, node map[string]any, path string, chartIndex, templateIndex int) {
	t.Helper()
	kind, ok := node["kind"].(string)
	if !ok {
		t.Fatalf("chart %d template %d %s missing kind", chartIndex, templateIndex, path)
	}
	switch kind {
	case "object":
		if _, ok := node["exact"].(bool); !ok {
			t.Fatalf("%s object missing exact", path)
		}
		fields, ok := node["fields"].(map[string]any)
		if !ok {
			t.Fatalf("%s object missing fields", path)
		}
		for name, rawField := range fields {
			field, ok := rawField.(map[string]any)
			if !ok {
				t.Fatalf("%s.%s invalid field", path, name)
			}
			if _, ok := field["required"].(bool); !ok {
				t.Fatalf("%s.%s missing required", path, name)
			}
			child, ok := field["schema"].(map[string]any)
			if !ok {
				t.Fatalf("%s.%s missing schema", path, name)
			}
			validateGeneratedSchemaNode(t, child, path+"."+name, chartIndex, templateIndex)
		}
		validateGeneratedRules(t, node["rules"], path, map[string]bool{"conditional_min_items": true})
	case "array":
		child, ok := node["items"].(map[string]any)
		if !ok {
			t.Fatalf("%s array missing items", path)
		}
		validateGeneratedSchemaNode(t, child, path+"[]", chartIndex, templateIndex)
		min, minOK := node["minItems"].(float64)
		max, maxOK := node["maxItems"].(float64)
		if minOK && min < 0 || maxOK && max < 0 || minOK && maxOK && min > max {
			t.Fatalf("%s invalid item bounds", path)
		}
		validateGeneratedRules(t, node["rules"], path, map[string]bool{"unique_by": true, "strictly_increasing": true})
	case "string":
		if values, ok := node["enum"].([]any); ok {
			seen := map[string]bool{}
			for _, raw := range values {
				value, ok := raw.(string)
				if !ok || value == "" || seen[value] {
					t.Fatalf("%s invalid enum", path)
				}
				seen[value] = true
			}
		}
	case "number":
		min, minOK := node["min"].(float64)
		max, maxOK := node["max"].(float64)
		if minOK && maxOK && min > max {
			t.Fatalf("%s invalid numeric bounds", path)
		}
		if integer, present := node["integer"]; present {
			if _, ok := integer.(bool); !ok {
				t.Fatalf("%s invalid integer flag", path)
			}
		}
	case "boolean":
	case "palette_reference":
		validateUnknownMemberPolicy(t, node, path)
	case "visual_reference":
		validateUnknownMemberPolicy(t, node, path)
		tokens, ok := node["themeTokens"].([]any)
		if !ok || len(tokens) == 0 {
			t.Fatalf("%s visual reference missing tokens", path)
		}
	default:
		t.Fatalf("%s unsupported schema kind %q", path, kind)
	}
}

func validateUnknownMemberPolicy(t *testing.T, node map[string]any, path string) {
	t.Helper()
	if node["unknownMembers"] != "allow" && node["unknownMembers"] != "reject" {
		t.Fatalf("%s reference missing unknown-member policy", path)
	}
}

func validateGeneratedRules(t *testing.T, raw any, path string, supported map[string]bool) {
	t.Helper()
	if raw == nil {
		return
	}
	rules, ok := raw.([]any)
	if !ok {
		t.Fatalf("%s rules not array", path)
	}
	for _, candidate := range rules {
		rule, ok := candidate.(map[string]any)
		if !ok {
			t.Fatalf("%s invalid rule", path)
		}
		kind, ok := rule["kind"].(string)
		if !ok || !supported[kind] {
			t.Fatalf("%s unsupported rule %q", path, kind)
		}
		switch kind {
		case "unique_by", "strictly_increasing":
			if field, ok := rule["field"].(string); !ok || field == "" {
				t.Fatalf("%s rule missing field", path)
			}
		case "conditional_min_items":
			if field, ok := rule["arrayField"].(string); !ok || field == "" {
				t.Fatalf("%s conditional rule missing array field", path)
			}
			if field, ok := rule["discriminatorField"].(string); !ok || field == "" {
				t.Fatalf("%s conditional rule missing discriminator", path)
			}
			cases, ok := rule["cases"].(map[string]any)
			if !ok || len(cases) == 0 {
				t.Fatalf("%s conditional rule missing cases", path)
			}
			for _, minimum := range cases {
				number, ok := minimum.(float64)
				if !ok || number < 0 || number != float64(int(number)) {
					t.Fatalf("%s invalid conditional minimum", path)
				}
			}
		}
	}
}
