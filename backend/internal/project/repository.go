package project

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"
	"github.com/qiqi/figcolor/backend/internal/database"
)

type Repository struct{}

func NewRepository() *Repository {
	return &Repository{}
}

// Default roles for new projects
var defaultRoles = []struct {
	Key      string
	Label    string
	Color    string
	RoleType string
}{
	{Key: "control", Label: "Control", Color: "#3D5A80", RoleType: "semantic"},
	{Key: "treatment", Label: "Treatment", Color: "#EE6C4D", RoleType: "semantic"},
	{Key: "highlight", Label: "Highlight", Color: "#E9C46A", RoleType: "ui"},
	{Key: "background", Label: "Background", Color: "#F8F9FA", RoleType: "ui"},
}

type catalogColor struct {
	ID    string `json:"id"`
	Hex   string `json:"hex"`
	Name  string `json:"name"`
	Label string `json:"label"`
}

type projectPaletteLookup struct {
	ID            string
	BasePaletteID *string
	IsDefault     bool
}

func (r *Repository) CreateProject(userID, name string, description *string) (*PaperProject, error) {
	tx, err := database.DB.Begin()
	if err != nil {
		return nil, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	// Create project with user_id
	projectID := uuid.New()
	project := &PaperProject{
		ID:          projectID.String(),
		UserID:      &userID,
		Name:        name,
		Description: description,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	_, err = tx.Exec(`
		INSERT INTO paper_projects (id, user_id, name, description, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, project.ID, userID, name, description, project.CreatedAt, project.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("failed to insert project: %w", err)
	}

	basePaletteID := uuid.New()
	baseColors, err := json.Marshal([]catalogColor{
		{ID: "control", Hex: "#3D5A80", Name: "Control"},
		{ID: "treatment", Hex: "#EE6C4D", Name: "Treatment"},
		{ID: "highlight", Hex: "#E9C46A", Name: "Highlight"},
		{ID: "background", Hex: "#F8F9FA", Name: "Background"},
	})
	if err != nil {
		return nil, fmt.Errorf("failed to encode default palette colors: %w", err)
	}
	_, err = tx.Exec(`
		INSERT INTO palettes (
			id, slug, name, owner_user_id, visibility, origin, colors, color_count, type, chart_types, journal_style,
			discipline, use_case, tags, accessibility, source_type, status, version,
			created_at, updated_at, published_at
		)
		VALUES (
			$1, $2, $3, $4, 'private', 'custom', $5, $6, 'categorical', $7, $8,
			$9, $10, $11, $12, 'manual', 'draft', 'project-default',
			$13, $14, NULL
		)
		ON CONFLICT (id) DO NOTHING
	`, basePaletteID.String(), "project-default-"+projectID.String(), "Default Palette", userID, baseColors, len(defaultRoles),
		pq.Array([]string{"bar", "line", "heatmap"}), pq.Array([]string{"general"}), pq.Array([]string{"general"}),
		pq.Array([]string{"presentation"}), pq.Array([]string{"project_default"}),
		`{"colorblind_safe": false, "print_friendly": true, "dark_background": false}`,
		time.Now(), time.Now())
	if err != nil {
		return nil, fmt.Errorf("failed to insert default base palette: %w", err)
	}

	paletteID := uuid.New()
	_, err = tx.Exec(`
		INSERT INTO project_palettes (id, project_id, name, base_palette_id, is_default, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, paletteID.String(), project.ID, "Default Palette", basePaletteID.String(), true, time.Now(), time.Now())
	if err != nil {
		return nil, fmt.Errorf("failed to insert default palette: %w", err)
	}

	// Update project's default_palette_id
	_, err = tx.Exec(`
		UPDATE paper_projects SET default_palette_id = $1 WHERE id = $2
	`, paletteID.String(), project.ID)
	if err != nil {
		return nil, fmt.Errorf("failed to update project's default_palette_id: %w", err)
	}
	paletteIDStr := paletteID.String()
	project.DefaultPaletteID = &paletteIDStr

	// Create default roles
	for i, role := range defaultRoles {
		roleID := uuid.New()
		_, err = tx.Exec(`
			INSERT INTO palette_roles (id, palette_id, key, label, color, role_type, sort_order, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		`, roleID.String(), paletteID.String(), role.Key, role.Label, role.Color, role.RoleType, i, time.Now(), time.Now())
		if err != nil {
			return nil, fmt.Errorf("failed to insert role %s: %w", role.Key, err)
		}
	}

	if err = tx.Commit(); err != nil {
		return nil, fmt.Errorf("failed to commit transaction: %w", err)
	}

	return project, nil
}

func (r *Repository) GetProjects() ([]PaperProject, error) {
	rows, err := database.DB.Query(`
		SELECT id, user_id, name, description, default_palette_id, created_at, updated_at
		FROM paper_projects
		ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, fmt.Errorf("failed to query projects: %w", err)
	}
	defer rows.Close()

	var projects []PaperProject
	for rows.Next() {
		var p PaperProject
		err := rows.Scan(&p.ID, &p.UserID, &p.Name, &p.Description, &p.DefaultPaletteID, &p.CreatedAt, &p.UpdatedAt)
		if err != nil {
			return nil, fmt.Errorf("failed to scan project: %w", err)
		}
		projects = append(projects, p)
	}

	return projects, nil
}

func (r *Repository) GetPublicProjects() ([]PaperProject, error) {
	rows, err := database.DB.Query(`
		SELECT id, user_id, name, description, default_palette_id, created_at, updated_at
		FROM paper_projects
		WHERE user_id IS NULL
		ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, fmt.Errorf("failed to query public projects: %w", err)
	}
	defer rows.Close()

	var projects []PaperProject
	for rows.Next() {
		var p PaperProject
		err := rows.Scan(&p.ID, &p.UserID, &p.Name, &p.Description, &p.DefaultPaletteID, &p.CreatedAt, &p.UpdatedAt)
		if err != nil {
			return nil, fmt.Errorf("failed to scan public project: %w", err)
		}
		projects = append(projects, p)
	}

	return projects, nil
}

func (r *Repository) GetProjectsByUserID(userID string) ([]PaperProject, error) {
	rows, err := database.DB.Query(`
		SELECT id, user_id, name, description, default_palette_id, created_at, updated_at
		FROM paper_projects
		WHERE user_id = $1
		ORDER BY created_at DESC
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to query projects: %w", err)
	}
	defer rows.Close()

	var projects []PaperProject
	for rows.Next() {
		var p PaperProject
		err := rows.Scan(&p.ID, &p.UserID, &p.Name, &p.Description, &p.DefaultPaletteID, &p.CreatedAt, &p.UpdatedAt)
		if err != nil {
			return nil, fmt.Errorf("failed to scan project: %w", err)
		}
		projects = append(projects, p)
	}

	return projects, nil
}

func (r *Repository) GetProjectByID(id string) (*PaperProject, error) {
	var p PaperProject
	err := database.DB.QueryRow(`
		SELECT id, user_id, name, description, default_palette_id, created_at, updated_at
		FROM paper_projects
		WHERE id = $1
	`, id).Scan(&p.ID, &p.UserID, &p.Name, &p.Description, &p.DefaultPaletteID, &p.CreatedAt, &p.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to query project: %w", err)
	}
	return &p, nil
}

func (r *Repository) GetProjectByIDForUser(id string, userID string) (*PaperProject, error) {
	var p PaperProject
	err := database.DB.QueryRow(`
		SELECT id, user_id, name, description, default_palette_id, created_at, updated_at
		FROM paper_projects
		WHERE id = $1 AND user_id = $2
	`, id, userID).Scan(&p.ID, &p.UserID, &p.Name, &p.Description, &p.DefaultPaletteID, &p.CreatedAt, &p.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to query project for user: %w", err)
	}
	return &p, nil
}

func (r *Repository) GetPublicProjectByID(id string) (*PaperProject, error) {
	var p PaperProject
	err := database.DB.QueryRow(`
		SELECT id, user_id, name, description, default_palette_id, created_at, updated_at
		FROM paper_projects
		WHERE id = $1 AND user_id IS NULL
	`, id).Scan(&p.ID, &p.UserID, &p.Name, &p.Description, &p.DefaultPaletteID, &p.CreatedAt, &p.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to query public project: %w", err)
	}
	return &p, nil
}

func (r *Repository) UpdateProject(id string, name *string, description *string) error {
	result, err := database.DB.Exec(`
		UPDATE paper_projects 
		SET name = COALESCE($2, name),
		    description = COALESCE($3, description),
		    updated_at = NOW()
		WHERE id = $1
	`, id, name, description)
	if err != nil {
		return fmt.Errorf("failed to update project: %w", err)
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return fmt.Errorf("project not found")
	}

	return nil
}

func (r *Repository) UpdateProjectForUser(id string, userID string, name *string, description *string) error {
	result, err := database.DB.Exec(`
		UPDATE paper_projects
		SET name = COALESCE($3, name),
		    description = COALESCE($4, description),
		    updated_at = NOW()
		WHERE id = $1 AND user_id = $2
	`, id, userID, name, description)
	if err != nil {
		return fmt.Errorf("failed to update project: %w", err)
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return fmt.Errorf("project not found")
	}

	return nil
}

func (r *Repository) DeleteProject(id string) error {
	result, err := database.DB.Exec(`DELETE FROM paper_projects WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("failed to delete project: %w", err)
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return fmt.Errorf("project not found")
	}

	return nil
}

func (r *Repository) DeleteProjectForUser(id string, userID string) error {
	result, err := database.DB.Exec(`DELETE FROM paper_projects WHERE id = $1 AND user_id = $2`, id, userID)
	if err != nil {
		return fmt.Errorf("failed to delete project: %w", err)
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return fmt.Errorf("project not found")
	}

	return nil
}

func (r *Repository) GetProjectPalettes(projectID string) ([]ProjectPalette, error) {
	rows, err := database.DB.Query(`
		SELECT id, project_id, name, base_palette_id, is_default, created_at, updated_at
		FROM project_palettes
		WHERE project_id = $1
		ORDER BY is_default DESC, created_at ASC
	`, projectID)
	if err != nil {
		return nil, fmt.Errorf("failed to query palettes: %w", err)
	}
	defer rows.Close()

	palettes := []ProjectPalette{}
	for rows.Next() {
		var p ProjectPalette
		err := rows.Scan(&p.ID, &p.ProjectID, &p.Name, &p.BasePaletteID, &p.IsDefault, &p.CreatedAt, &p.UpdatedAt)
		if err != nil {
			return nil, fmt.Errorf("failed to scan palette: %w", err)
		}
		palettes = append(palettes, p)
	}

	return palettes, nil
}

func (r *Repository) GetPaletteRoles(paletteID string) ([]PaletteRole, error) {
	rows, err := database.DB.Query(`
		SELECT id, palette_id, key, label, color, role_type, sort_order, created_at, updated_at
		FROM palette_roles
		WHERE palette_id = $1
		ORDER BY sort_order ASC
	`, paletteID)
	if err != nil {
		return nil, fmt.Errorf("failed to query roles: %w", err)
	}
	defer rows.Close()

	roles := []PaletteRole{}
	for rows.Next() {
		var role PaletteRole
		err := rows.Scan(&role.ID, &role.PaletteID, &role.Key, &role.Label, &role.Color, &role.RoleType, &role.Order, &role.CreatedAt, &role.UpdatedAt)
		if err != nil {
			return nil, fmt.Errorf("failed to scan role: %w", err)
		}
		roles = append(roles, role)
	}

	return roles, nil
}

func (r *Repository) PaletteExists(paletteID string) (bool, error) {
	var exists bool
	err := database.DB.QueryRow(`SELECT EXISTS (SELECT 1 FROM palettes WHERE id = $1)`, paletteID).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("failed to check palette: %w", err)
	}
	return exists, nil
}

func (r *Repository) PaletteVisibleToUser(paletteID string, userID string) (bool, error) {
	var exists bool
	err := database.DB.QueryRow(`
		SELECT EXISTS (
			SELECT 1
			FROM palettes
			WHERE id = $1
			  AND (
			    (visibility = 'public' AND owner_user_id IS NULL)
			    OR owner_user_id = $2
			  )
		)
	`, paletteID, userID).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("failed to check palette visibility: %w", err)
	}
	return exists, nil
}

func (r *Repository) GetProjectPaletteByID(projectID string, projectPaletteID string) (*projectPaletteLookup, error) {
	var palette projectPaletteLookup
	err := database.DB.QueryRow(`
		SELECT id, base_palette_id, is_default
		FROM project_palettes
		WHERE project_id = $1 AND id = $2
	`, projectID, projectPaletteID).Scan(&palette.ID, &palette.BasePaletteID, &palette.IsDefault)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to query project palette: %w", err)
	}
	return &palette, nil
}

func (r *Repository) GetProjectPaletteByBasePaletteID(projectID string, basePaletteID string) (*projectPaletteLookup, error) {
	var palette projectPaletteLookup
	err := database.DB.QueryRow(`
		SELECT id, base_palette_id, is_default
		FROM project_palettes
		WHERE project_id = $1 AND base_palette_id = $2
	`, projectID, basePaletteID).Scan(&palette.ID, &palette.BasePaletteID, &palette.IsDefault)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to query project palette by base palette: %w", err)
	}
	return &palette, nil
}

func (r *Repository) CreateProjectPalette(projectID string, userID string, req CreateProjectPaletteRequest) (*ProjectPalette, error) {
	if req.BasePaletteID == nil || *req.BasePaletteID == "" {
		return nil, fmt.Errorf("basePaletteId is required")
	}

	var baseName string
	var colorsRaw []byte
	err := database.DB.QueryRow(`
		SELECT name, colors
		FROM palettes
		WHERE id = $1
		  AND (
		    (visibility = 'public' AND owner_user_id IS NULL)
		    OR owner_user_id = $2
		  )
	`, *req.BasePaletteID, userID).Scan(&baseName, &colorsRaw)
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("palette not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to query base palette: %w", err)
	}

	var colors []catalogColor
	if err := json.Unmarshal(colorsRaw, &colors); err != nil {
		return nil, fmt.Errorf("failed to decode base palette colors: %w", err)
	}
	if len(colors) == 0 {
		return nil, fmt.Errorf("palette has no colors")
	}

	projectPaletteID := uuid.New()
	paletteName := baseName
	if req.Name != nil && *req.Name != "" {
		paletteName = *req.Name
	}
	now := time.Now()

	tx, err := database.DB.Begin()
	if err != nil {
		return nil, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	_, err = tx.Exec(`
		INSERT INTO project_palettes (id, project_id, name, base_palette_id, is_default, created_at, updated_at)
		VALUES ($1, $2, $3, $4, false, $5, $6)
	`, projectPaletteID.String(), projectID, paletteName, *req.BasePaletteID, now, now)
	if err != nil {
		return nil, fmt.Errorf("failed to insert project palette: %w", err)
	}

	roles := make([]PaletteRole, 0, len(colors))
	for idx, color := range colors {
		roleID := uuid.New()
		label := color.Label
		if label == "" {
			label = color.Name
		}
		if label == "" {
			label = fmt.Sprintf("Color %d", idx+1)
		}
		key := color.ID
		if key == "" {
			key = fmt.Sprintf("color-%d", idx)
		}
		_, err = tx.Exec(`
			INSERT INTO palette_roles (id, palette_id, key, label, color, role_type, sort_order, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, 'semantic', $6, $7, $8)
		`, roleID.String(), projectPaletteID.String(), key, label, color.Hex, idx, now, now)
		if err != nil {
			return nil, fmt.Errorf("failed to insert project palette role: %w", err)
		}
		roles = append(roles, PaletteRole{
			ID:        roleID.String(),
			PaletteID: projectPaletteID.String(),
			Key:       key,
			Label:     label,
			Color:     color.Hex,
			RoleType:  "semantic",
			Order:     idx,
			CreatedAt: now,
			UpdatedAt: now,
		})
	}

	if err = tx.Commit(); err != nil {
		return nil, fmt.Errorf("failed to commit project palette: %w", err)
	}

	return &ProjectPalette{
		ID:            projectPaletteID.String(),
		ProjectID:     projectID,
		Name:          paletteName,
		BasePaletteID: req.BasePaletteID,
		IsDefault:     false,
		Roles:         roles,
		CreatedAt:     now,
		UpdatedAt:     now,
	}, nil
}

// UpdateProjectPalette synchronizes only the project-local palette and roles.
// The base palettes catalog is intentionally absent from every write query.
func (r *Repository) UpdateProjectPalette(projectID, userID, paletteID string, req UpdateProjectPaletteRequest) (*ProjectPalette, error) {
	tx, err := database.DB.Begin()
	if err != nil {
		return nil, fmt.Errorf("failed to begin project palette transaction: %w", err)
	}
	defer tx.Rollback()

	var palette ProjectPalette
	err = tx.QueryRow(`
		SELECT pp.id, pp.project_id, pp.base_palette_id, pp.is_default, pp.created_at
		FROM project_palettes pp
		JOIN paper_projects p ON p.id = pp.project_id
		WHERE pp.id = $1 AND pp.project_id = $2 AND p.user_id = $3
		FOR UPDATE
	`, paletteID, projectID, userID).Scan(&palette.ID, &palette.ProjectID, &palette.BasePaletteID, &palette.IsDefault, &palette.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, newRequestError(http.StatusNotFound, "project palette not found")
	}
	if err != nil {
		return nil, fmt.Errorf("failed to lock project palette: %w", err)
	}

	rows, err := tx.Query(`
		SELECT id, key, label, color, role_type, sort_order, created_at, updated_at
		FROM palette_roles WHERE palette_id = $1 FOR UPDATE
	`, paletteID)
	if err != nil {
		return nil, fmt.Errorf("failed to query project palette roles: %w", err)
	}
	existing := make(map[string]PaletteRole)
	for rows.Next() {
		var role PaletteRole
		role.PaletteID = paletteID
		if err := rows.Scan(&role.ID, &role.Key, &role.Label, &role.Color, &role.RoleType, &role.Order, &role.CreatedAt, &role.UpdatedAt); err != nil {
			rows.Close()
			return nil, fmt.Errorf("failed to scan project palette role: %w", err)
		}
		existing[role.ID] = role
	}
	if err := rows.Close(); err != nil {
		return nil, fmt.Errorf("failed to close project palette roles: %w", err)
	}

	requestedExisting := make(map[string]bool)
	for _, role := range req.Roles {
		if role.ID == nil || *role.ID == "" {
			continue
		}
		current, ok := existing[*role.ID]
		if !ok {
			return nil, newRequestError(http.StatusUnprocessableEntity, fmt.Sprintf("role %q does not belong to this project palette", *role.ID))
		}
		if current.Key != role.Key {
			return nil, newRequestError(http.StatusUnprocessableEntity, fmt.Sprintf("existing role key %q cannot be changed", current.Key))
		}
		requestedExisting[*role.ID] = true
	}

	for id, role := range existing {
		if requestedExisting[id] {
			continue
		}
		var references int
		err := tx.QueryRow(`
			SELECT COUNT(*)
			FROM figure_selected_roles fsr
			JOIN figure_assignments fa ON fa.id = fsr.figure_id
			WHERE fa.project_id = $1 AND fa.palette_id = $2 AND fsr.role_key = $3
		`, projectID, palette.BasePaletteID, role.Key).Scan(&references)
		if err != nil {
			return nil, fmt.Errorf("failed to check role references: %w", err)
		}
		if references > 0 {
			return nil, newRequestError(http.StatusConflict, fmt.Sprintf("role %q is used by %d figure(s) and cannot be deleted", role.Key, references))
		}
	}

	now := time.Now()
	if _, err := tx.Exec(`UPDATE project_palettes SET name = $1, updated_at = $2 WHERE id = $3`, strings.TrimSpace(req.Name), now, paletteID); err != nil {
		return nil, fmt.Errorf("failed to update project palette: %w", err)
	}
	for id := range existing {
		if !requestedExisting[id] {
			if _, err := tx.Exec(`DELETE FROM palette_roles WHERE id = $1 AND palette_id = $2`, id, paletteID); err != nil {
				return nil, fmt.Errorf("failed to delete project palette role: %w", err)
			}
		}
	}

	roles := make([]PaletteRole, 0, len(req.Roles))
	for _, input := range req.Roles {
		roleID := uuid.New().String()
		createdAt := now
		if input.ID != nil && *input.ID != "" {
			roleID = *input.ID
			createdAt = existing[roleID].CreatedAt
			_, err = tx.Exec(`
				UPDATE palette_roles SET label = $1, color = $2, role_type = $3, sort_order = $4, updated_at = $5
				WHERE id = $6 AND palette_id = $7
			`, strings.TrimSpace(input.Label), strings.ToUpper(input.Color), input.RoleType, input.Order, now, roleID, paletteID)
		} else {
			_, err = tx.Exec(`
				INSERT INTO palette_roles (id, palette_id, key, label, color, role_type, sort_order, created_at, updated_at)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
			`, roleID, paletteID, input.Key, strings.TrimSpace(input.Label), strings.ToUpper(input.Color), input.RoleType, input.Order, now)
		}
		if err != nil {
			return nil, fmt.Errorf("failed to persist project palette role: %w", err)
		}
		roles = append(roles, PaletteRole{ID: roleID, PaletteID: paletteID, Key: input.Key, Label: strings.TrimSpace(input.Label), Color: strings.ToUpper(input.Color), RoleType: input.RoleType, Order: input.Order, CreatedAt: createdAt, UpdatedAt: now})
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("failed to commit project palette update: %w", err)
	}
	palette.Name = strings.TrimSpace(req.Name)
	palette.Roles = roles
	palette.UpdatedAt = now
	return &palette, nil
}

func (r *Repository) UpdateRoleColor(roleID string, color string) error {
	// Validate hex color format
	if len(color) != 7 || color[0] != '#' {
		return fmt.Errorf("invalid color format")
	}

	result, err := database.DB.Exec(`
		UPDATE palette_roles 
		SET color = $2, updated_at = NOW()
		WHERE id = $1
	`, roleID, color)
	if err != nil {
		return fmt.Errorf("failed to update role color: %w", err)
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return fmt.Errorf("role not found")
	}

	return nil
}

func (r *Repository) UpdateRoleColorForProject(projectID string, paletteID string, roleID string, color string) error {
	if len(color) != 7 || color[0] != '#' {
		return fmt.Errorf("invalid color format")
	}

	result, err := database.DB.Exec(`
		UPDATE palette_roles
		SET color = $4, updated_at = NOW()
		WHERE id = $3
		  AND palette_id = $2
		  AND EXISTS (
		    SELECT 1
		    FROM project_palettes
		    WHERE project_palettes.id = palette_roles.palette_id
		      AND project_palettes.project_id = $1
		  )
	`, projectID, paletteID, roleID, color)
	if err != nil {
		return fmt.Errorf("failed to update role color: %w", err)
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return fmt.Errorf("role not found")
	}

	return nil
}

func (r *Repository) GetFigures(projectID string) ([]FigureAssignment, error) {
	rows, err := database.DB.Query(`
		SELECT id, project_id, palette_id, name, panel, chart_type, notes, created_at, updated_at
		FROM figure_assignments
		WHERE project_id = $1
		ORDER BY created_at DESC
	`, projectID)
	if err != nil {
		return nil, fmt.Errorf("failed to query figures: %w", err)
	}
	defer rows.Close()

	figures := []FigureAssignment{}
	for rows.Next() {
		var f FigureAssignment
		var panel, notes sql.NullString
		err := rows.Scan(&f.ID, &f.ProjectID, &f.PaletteID, &f.Name, &panel, &f.ChartType, &notes, &f.CreatedAt, &f.UpdatedAt)
		if err != nil {
			return nil, fmt.Errorf("failed to scan figure: %w", err)
		}
		if panel.Valid {
			f.Panel = &panel.String
		}
		if notes.Valid {
			f.Notes = &notes.String
		}
		figures = append(figures, f)
	}

	return figures, nil
}

func (r *Repository) GetFigureByID(figureID string) (*FigureAssignment, error) {
	var f FigureAssignment
	var panel, notes sql.NullString
	err := database.DB.QueryRow(`
		SELECT id, project_id, palette_id, name, panel, chart_type, notes, created_at, updated_at
		FROM figure_assignments
		WHERE id = $1
	`, figureID).Scan(&f.ID, &f.ProjectID, &f.PaletteID, &f.Name, &panel, &f.ChartType, &notes, &f.CreatedAt, &f.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to query figure: %w", err)
	}
	if panel.Valid {
		f.Panel = &panel.String
	}
	if notes.Valid {
		f.Notes = &notes.String
	}
	return &f, nil
}

func (r *Repository) GetFigureByProjectID(projectID string, figureID string) (*FigureAssignment, error) {
	var f FigureAssignment
	var panel, notes sql.NullString
	err := database.DB.QueryRow(`
		SELECT id, project_id, palette_id, name, panel, chart_type, notes, created_at, updated_at
		FROM figure_assignments
		WHERE project_id = $1 AND id = $2
	`, projectID, figureID).Scan(&f.ID, &f.ProjectID, &f.PaletteID, &f.Name, &panel, &f.ChartType, &notes, &f.CreatedAt, &f.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to query figure: %w", err)
	}
	if panel.Valid {
		f.Panel = &panel.String
	}
	if notes.Valid {
		f.Notes = &notes.String
	}
	return &f, nil
}

func (r *Repository) CreateFigure(projectID string, req CreateFigureRequest) (*FigureAssignment, error) {
	figureID := uuid.New()
	now := time.Now()

	tx, err := database.DB.Begin()
	if err != nil {
		return nil, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	_, err = tx.Exec(`
		INSERT INTO figure_assignments (id, project_id, palette_id, name, panel, chart_type, notes, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`, figureID.String(), projectID, req.PaletteID, req.Name, req.Panel, req.ChartType, req.Notes, now, now)
	if err != nil {
		return nil, fmt.Errorf("failed to insert figure: %w", err)
	}

	for index, roleKey := range req.SelectedRoleKeys {
		_, err = tx.Exec(`
			INSERT INTO figure_selected_roles (id, figure_id, role_key, sort_order)
			VALUES ($1, $2, $3, $4)
		`, uuid.New().String(), figureID.String(), roleKey, index)
		if err != nil {
			return nil, fmt.Errorf("failed to add selected role: %w", err)
		}
	}

	if err = tx.Commit(); err != nil {
		return nil, fmt.Errorf("failed to commit figure: %w", err)
	}

	return &FigureAssignment{
		ID:               figureID.String(),
		ProjectID:        projectID,
		PaletteID:        req.PaletteID,
		Name:             req.Name,
		Panel:            req.Panel,
		ChartType:        req.ChartType,
		SelectedRoleKeys: req.SelectedRoleKeys,
		Notes:            req.Notes,
		CreatedAt:        now,
		UpdatedAt:        now,
	}, nil
}

func (r *Repository) UpdateFigure(figureID string, req UpdateFigureRequest) error {
	_, err := database.DB.Exec(`
		UPDATE figure_assignments 
		SET name = COALESCE($2, name),
		    panel = COALESCE($3, panel),
		    chart_type = COALESCE($4, chart_type),
		    palette_id = COALESCE($5, palette_id),
		    notes = COALESCE($6, notes),
		    updated_at = NOW()
		WHERE id = $1
	`, figureID, req.Name, req.Panel, req.ChartType, req.PaletteID, req.Notes)
	if err != nil {
		return fmt.Errorf("failed to update figure: %w", err)
	}
	return nil
}

func (r *Repository) UpdateFigureForProject(projectID string, figureID string, req UpdateFigureRequest) error {
	tx, err := database.DB.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin figure update: %w", err)
	}
	defer tx.Rollback()

	result, err := tx.Exec(`
		UPDATE figure_assignments
		SET name = COALESCE($3, name),
		    panel = COALESCE($4, panel),
		    chart_type = COALESCE($5, chart_type),
		    palette_id = COALESCE($6, palette_id),
		    notes = COALESCE($7, notes),
		    updated_at = NOW()
		WHERE project_id = $1 AND id = $2
	`, projectID, figureID, req.Name, req.Panel, req.ChartType, req.PaletteID, req.Notes)
	if err != nil {
		return fmt.Errorf("failed to update figure: %w", err)
	}
	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return fmt.Errorf("figure not found")
	}

	if req.SelectedRoleKeys != nil {
		if _, err := tx.Exec(`DELETE FROM figure_selected_roles WHERE figure_id = $1`, figureID); err != nil {
			return fmt.Errorf("failed to delete selected roles: %w", err)
		}
		for index, roleKey := range req.SelectedRoleKeys {
			_, err = tx.Exec(`
				INSERT INTO figure_selected_roles (id, figure_id, role_key, sort_order)
				VALUES ($1, $2, $3, $4)
			`, uuid.New().String(), figureID, roleKey, index)
			if err != nil {
				return fmt.Errorf("failed to add selected role: %w", err)
			}
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit figure update: %w", err)
	}
	return nil
}

func (r *Repository) DeleteFigure(figureID string) error {
	_, err := database.DB.Exec(`DELETE FROM figure_assignments WHERE id = $1`, figureID)
	if err != nil {
		return fmt.Errorf("failed to delete figure: %w", err)
	}
	return nil
}

func (r *Repository) DeleteFigureForProject(projectID string, figureID string) error {
	result, err := database.DB.Exec(`DELETE FROM figure_assignments WHERE project_id = $1 AND id = $2`, projectID, figureID)
	if err != nil {
		return fmt.Errorf("failed to delete figure: %w", err)
	}
	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return fmt.Errorf("figure not found")
	}
	return nil
}

func (r *Repository) GetFigureSelectedRoles(figureID string) ([]string, error) {
	rows, err := database.DB.Query(`
		SELECT role_key FROM figure_selected_roles
		WHERE figure_id = $1
		ORDER BY sort_order ASC
	`, figureID)
	if err != nil {
		return nil, fmt.Errorf("failed to query selected roles: %w", err)
	}
	defer rows.Close()

	keys := []string{}
	for rows.Next() {
		var key string
		if err := rows.Scan(&key); err != nil {
			return nil, err
		}
		keys = append(keys, key)
	}
	return keys, nil
}

func (r *Repository) AddFigureSelectedRole(figureID string, roleKey string, sortOrder int) error {
	_, err := database.DB.Exec(`
		INSERT INTO figure_selected_roles (id, figure_id, role_key, sort_order)
		VALUES ($1, $2, $3, $4)
	`, uuid.New().String(), figureID, roleKey, sortOrder)
	if err != nil {
		return fmt.Errorf("failed to add selected role: %w", err)
	}
	return nil
}

func (r *Repository) DeleteFigureSelectedRoles(figureID string) error {
	_, err := database.DB.Exec(`DELETE FROM figure_selected_roles WHERE figure_id = $1`, figureID)
	if err != nil {
		return fmt.Errorf("failed to delete selected roles: %w", err)
	}
	return nil
}
