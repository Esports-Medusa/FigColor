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

func TestUpdateProjectPaletteValidationRejectsUnsafePayloads(t *testing.T) {
	service := NewService(nil)
	validRoles := []UpdateProjectPaletteRoleRequest{
		{Key: "control", Label: "Control", Color: "#112233", RoleType: "semantic"},
		{Key: "treatment", Label: "Treatment", Color: "#445566", RoleType: "semantic"},
	}
	tests := []struct {
		name string
		req  UpdateProjectPaletteRequest
		want string
	}{
		{"empty name", UpdateProjectPaletteRequest{Roles: validRoles}, "palette name is required"},
		{"too few roles", UpdateProjectPaletteRequest{Name: "Mine", Roles: validRoles[:1]}, "at least two roles"},
		{"duplicate key", UpdateProjectPaletteRequest{Name: "Mine", Roles: []UpdateProjectPaletteRoleRequest{validRoles[0], validRoles[0]}}, "duplicate role key"},
		{"invalid color", UpdateProjectPaletteRequest{Name: "Mine", Roles: []UpdateProjectPaletteRoleRequest{validRoles[0], {Key: "bad", Label: "Bad", Color: "red", RoleType: "custom"}}}, "invalid color"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := service.UpdateProjectPalette("project", "user", "palette", tt.req)
			if err == nil || !strings.Contains(err.Error(), tt.want) {
				t.Fatalf("error = %v, want %q", err, tt.want)
			}
			if status := requestErrorStatus(t, err); status != http.StatusUnprocessableEntity {
				t.Fatalf("status = %d, want 422", status)
			}
		})
	}
}

func TestUpdateProjectPaletteRepositoryIsOwnerScopedAndCatalogReadOnly(t *testing.T) {
	source, err := os.ReadFile("repository.go")
	if err != nil {
		t.Fatalf("read project repository: %v", err)
	}
	code := string(source)
	start := strings.Index(code, "func (r *Repository) UpdateProjectPalette")
	end := strings.Index(code[start:], "func (r *Repository) UpdateRoleColor")
	if start < 0 || end < 0 {
		t.Fatal("project palette update repository function is missing")
	}
	body := code[start : start+end]
	for _, want := range []string{
		"JOIN paper_projects p ON p.id = pp.project_id",
		"pp.id = $1 AND pp.project_id = $2 AND p.user_id = $3",
		"UPDATE project_palettes SET name",
		"INSERT INTO palette_roles",
		"DELETE FROM palette_roles",
		"figure_selected_roles",
		"http.StatusConflict",
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("scoped palette update missing %q", want)
		}
	}
	for _, forbidden := range []string{"UPDATE palettes ", "DELETE FROM palettes", "palette_preview_cases"} {
		if strings.Contains(body, forbidden) {
			t.Fatalf("project palette update must not touch public catalog path %q", forbidden)
		}
	}
}

type errString string

func (e errString) Error() string {
	return string(e)
}
