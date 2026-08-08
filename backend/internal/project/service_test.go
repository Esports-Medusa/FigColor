package project

import (
	"net/http"
	"os"
	"strings"
	"testing"
)

func requestErrorStatus(t *testing.T, err error) int {
	t.Helper()
	requestErr, ok := err.(*RequestError)
	if !ok {
		t.Fatalf("error type = %T, want *RequestError", err)
	}
	return requestErr.Status
}

func TestValidateFigurePaletteSelectionAcceptsAvailableBasePalette(t *testing.T) {
	baseID := "base-palette-1"
	projectPalette := &projectPaletteLookup{ID: "project-palette-1", BasePaletteID: &baseID}

	got, err := validateFigurePaletteSelection(true, projectPalette, nil)
	if err != nil {
		t.Fatalf("validateFigurePaletteSelection returned error: %v", err)
	}
	if got != projectPalette {
		t.Fatalf("project palette = %#v, want available project palette", got)
	}
}

func TestValidateFigurePaletteSelectionRejectsProjectPaletteID(t *testing.T) {
	baseID := "base-palette-1"
	_, err := validateFigurePaletteSelection(true, nil, &projectPaletteLookup{ID: "project-palette-1", BasePaletteID: &baseID})
	if err == nil {
		t.Fatal("expected error for project palette id")
	}
	if status := requestErrorStatus(t, err); status != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422", status)
	}
	if !strings.Contains(err.Error(), "basePaletteId") {
		t.Fatalf("error = %q, want basePaletteId guidance", err.Error())
	}
}

func TestValidateFigurePaletteSelectionRejectsPaletteOutsideProject(t *testing.T) {
	_, err := validateFigurePaletteSelection(true, nil, nil)
	if err == nil {
		t.Fatal("expected error for palette outside project")
	}
	if status := requestErrorStatus(t, err); status != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422", status)
	}
	if !strings.Contains(err.Error(), "not available in this project") {
		t.Fatalf("error = %q, want project availability guidance", err.Error())
	}
}

func TestValidateFigurePaletteSelectionRejectsMissingBasePaletteID(t *testing.T) {
	_, err := validateFigurePaletteSelection(false, nil, &projectPaletteLookup{ID: "custom-project-palette"})
	if err == nil {
		t.Fatal("expected error for custom project palette")
	}
	if status := requestErrorStatus(t, err); status != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want 422", status)
	}
	if !strings.Contains(err.Error(), "custom project palettes cannot be used") {
		t.Fatalf("error = %q, want custom palette limitation", err.Error())
	}
}

func TestFigureAssignmentsMigrationTargetsBasePalettes(t *testing.T) {
	migration, err := os.ReadFile("../../migrations/016_figure_assignments_base_palette_fk.sql")
	if err != nil {
		t.Fatalf("read migration: %v", err)
	}
	sql := string(migration)
	for _, want := range []string{
		"UPDATE figure_assignments fa",
		"SET palette_id = pp.base_palette_id",
		"FOREIGN KEY (palette_id) REFERENCES palettes(id)",
		"FOREIGN KEY (base_palette_id) REFERENCES palettes(id)",
	} {
		if !strings.Contains(sql, want) {
			t.Fatalf("migration missing %q", want)
		}
	}
}

func TestCreateProjectDefaultPaletteIsPrivateUserOwnedCatalogRow(t *testing.T) {
	source, err := os.ReadFile("repository.go")
	if err != nil {
		t.Fatalf("read project repository: %v", err)
	}
	code := string(source)
	for _, want := range []string{
		"owner_user_id, visibility, origin",
		"'private', 'custom'",
		"'manual', 'draft', 'project-default'",
		"\"project-default-\"+projectID.String()",
		"\"Default Palette\", userID",
		"INSERT INTO project_palettes (id, project_id, name, base_palette_id, is_default",
	} {
		if !strings.Contains(code, want) {
			t.Fatalf("project default palette creation missing %q", want)
		}
	}
}

func TestProjectPreviewPayloadUsesBasePaletteIdentityAndOwnerVisibility(t *testing.T) {
	source, err := os.ReadFile("service.go")
	if err != nil {
		t.Fatalf("read project service: %v", err)
	}
	code := string(source)
	for _, want := range []string{
		"basePaletteID := projectPalettes[i].BasePaletteID",
		"repo.GetByID(*basePaletteID)",
		"basePalette.OwnerUserID != nil && *basePalette.OwnerUserID == userID",
		"repo.GetPrimaryPublishedPreviewByPalette(*basePaletteID)",
		"PrimaryPreviewCase: primary",
	} {
		if !strings.Contains(code, want) {
			t.Fatalf("project preview integration missing %q", want)
		}
	}
}

func TestCreateProjectPaletteAttachesCanonicalPreviewPayload(t *testing.T) {
	source, err := os.ReadFile("service.go")
	if err != nil {
		t.Fatalf("read project service: %v", err)
	}
	code := string(source)
	createStart := strings.Index(code, "func (s *Service) CreateProjectPalette")
	attachStart := strings.Index(code[createStart:], "attachProjectPalettePreviews(projectPalettes, userID)")
	if createStart < 0 || attachStart < 0 {
		t.Fatal("create project palette must attach the same canonical preview payload used by project detail")
	}
}

func TestFR20ProjectRepositoryUsesOwnerAndProjectScopedQueries(t *testing.T) {
	source, err := os.ReadFile("repository.go")
	if err != nil {
		t.Fatalf("read project repository: %v", err)
	}
	code := string(source)
	for _, want := range []string{
		"WHERE id = $1 AND user_id = $2",
		"DELETE FROM paper_projects WHERE id = $1 AND user_id = $2",
		"WHERE project_id = $1 AND id = $2",
		"DELETE FROM figure_assignments WHERE project_id = $1 AND id = $2",
		"AND project_palettes.project_id = $1",
		"(visibility = 'public' AND owner_user_id IS NULL)",
		"OR owner_user_id = $2",
		"WHERE user_id IS NULL",
	} {
		if !strings.Contains(code, want) {
			t.Fatalf("repository missing FR-20 ownership/visibility guard %q", want)
		}
	}
}

func TestFR20CrossOwnerProjectErrorsAreNotFound(t *testing.T) {
	err := newRequestError(http.StatusNotFound, "project not found")
	if status := statusFromProjectError(err); status != http.StatusNotFound {
		t.Fatalf("request status = %d, want 404", status)
	}
	accessDenied := errString("access denied")
	if status := statusFromProjectError(accessDenied); status != http.StatusNotFound {
		t.Fatalf("access denied status = %d, want 404 to avoid resource disclosure", status)
	}
}

type errString string

func (e errString) Error() string {
	return string(e)
}
