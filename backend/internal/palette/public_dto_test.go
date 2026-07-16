package palette

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func TestBuildPublicPaletteDTONoPreviewCases(t *testing.T) {
	dto := buildPublicPaletteDTO(testPublicPalette("palette-1"), nil)

	if dto.PrimaryPreviewCase != nil {
		t.Fatalf("primary preview = %#v, want nil", dto.PrimaryPreviewCase)
	}
	if len(dto.PreviewCases) != 0 {
		t.Fatalf("preview cases = %d, want 0", len(dto.PreviewCases))
	}
}

func TestBuildPublicPaletteDTOIncludesPublishedPreviewCasesAndPrimary(t *testing.T) {
	primary := testPublicPreviewCase("preview-primary", PreviewCaseStatusPublished, true)
	secondary := testPublicPreviewCase("preview-secondary", PreviewCaseStatusPublished, false)

	dto := buildPublicPaletteDTO(testPublicPalette("palette-1"), []*PalettePreviewCase{primary, secondary})

	if dto.PrimaryPreviewCase == nil || dto.PrimaryPreviewCase.ID != "preview-primary" {
		t.Fatalf("primary preview = %#v, want preview-primary", dto.PrimaryPreviewCase)
	}
	if len(dto.PreviewCases) != 2 {
		t.Fatalf("preview cases = %d, want 2", len(dto.PreviewCases))
	}
	if dto.PreviewCases[0].ID != "preview-primary" || dto.PreviewCases[1].ID != "preview-secondary" {
		t.Fatalf("preview case order = %#v, want repository order preserved", dto.PreviewCases)
	}
}

func TestBuildPublicPaletteDTOExcludesDraftAndArchivedPreviewCases(t *testing.T) {
	dto := buildPublicPaletteDTO(testPublicPalette("palette-1"), []*PalettePreviewCase{
		testPublicPreviewCase("preview-draft", PreviewCaseStatusDraft, true),
		testPublicPreviewCase("preview-archived", PreviewCaseStatusArchived, true),
		testPublicPreviewCase("preview-published", PreviewCaseStatusPublished, false),
	})

	if dto.PrimaryPreviewCase != nil {
		t.Fatalf("primary preview = %#v, want nil because no published primary exists", dto.PrimaryPreviewCase)
	}
	if len(dto.PreviewCases) != 1 || dto.PreviewCases[0].ID != "preview-published" {
		t.Fatalf("preview cases = %#v, want only published preview", dto.PreviewCases)
	}

	encoded, err := json.Marshal(dto)
	if err != nil {
		t.Fatalf("marshal public dto: %v", err)
	}
	if strings.Contains(string(encoded), `"status":"draft"`) || strings.Contains(string(encoded), `"status":"archived"`) {
		t.Fatalf("public dto exposed unpublished status: %s", encoded)
	}
}

func TestBuildPublicPaletteDTONoPrimaryReturnsNull(t *testing.T) {
	dto := buildPublicPaletteDTO(testPublicPalette("palette-1"), []*PalettePreviewCase{
		testPublicPreviewCase("preview-published", PreviewCaseStatusPublished, false),
	})

	if dto.PrimaryPreviewCase != nil {
		t.Fatalf("primary preview = %#v, want nil", dto.PrimaryPreviewCase)
	}
	if len(dto.PreviewCases) != 1 {
		t.Fatalf("preview cases = %d, want 1", len(dto.PreviewCases))
	}
}

func testPublicPalette(id string) *Palette {
	now := time.Now().UTC()
	return &Palette{
		ID:         id,
		Slug:       "test-palette",
		Name:       "Test Palette",
		Colors:     json.RawMessage(`[{"id":"color-1","hex":"#112233","rgb":[17,34,51],"order":0}]`),
		ColorCount: 1,
		Type:       "categorical",
		Status:     "published",
		CreatedAt:  now,
		UpdatedAt:  now,
	}
}

func testPublicPreviewCase(id string, status string, isPrimary bool) *PalettePreviewCase {
	now := time.Now().UTC()
	return &PalettePreviewCase{
		ID:              id,
		PaletteID:       "palette-1",
		ChartType:       ChartTypeBarError,
		TemplateID:      "bar_error_v1",
		TemplateVersion: 1,
		SchemaVersion:   1,
		ColorRoles:      json.RawMessage(`{"groups":[]}`),
		PreviewConfig:   json.RawMessage(`{"show_error_bars":true}`),
		SeedStrategy:    PreviewCaseSeedStrategyStableID,
		IsPrimary:       isPrimary,
		Status:          status,
		CreatedAt:       now,
		UpdatedAt:       now,
	}
}
