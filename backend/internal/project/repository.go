package project

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
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

	// Create default palette
	paletteID := uuid.New()
	_, err = tx.Exec(`
		INSERT INTO project_palettes (id, project_id, name, is_default, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, paletteID.String(), project.ID, "Default Palette", true, time.Now(), time.Now())
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

func (r *Repository) CreateFigure(projectID string, req CreateFigureRequest) (*FigureAssignment, error) {
	figureID := uuid.New()
	now := time.Now()

	// DEBUG: Log palette_id to diagnose foreign key constraint error
	fmt.Printf("[DEBUG] CreateFigure - projectID: %s, paletteID: %s, req.PaletteID: %s\n", projectID, req.PaletteID, req.PaletteID)

	_, err := database.DB.Exec(`
		INSERT INTO figure_assignments (id, project_id, palette_id, name, panel, chart_type, notes, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`, figureID.String(), projectID, req.PaletteID, req.Name, req.Panel, req.ChartType, req.Notes, now, now)
	if err != nil {
		return nil, fmt.Errorf("failed to insert figure: %w", err)
	}

	return &FigureAssignment{
		ID:        figureID.String(),
		ProjectID: projectID,
		PaletteID: req.PaletteID,
		Name:      req.Name,
		Panel:     req.Panel,
		ChartType: req.ChartType,
		Notes:     req.Notes,
		CreatedAt: now,
		UpdatedAt: now,
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

func (r *Repository) DeleteFigure(figureID string) error {
	_, err := database.DB.Exec(`DELETE FROM figure_assignments WHERE id = $1`, figureID)
	if err != nil {
		return fmt.Errorf("failed to delete figure: %w", err)
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