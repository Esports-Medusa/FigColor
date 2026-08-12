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
