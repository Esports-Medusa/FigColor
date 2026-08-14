package project

import (
	"time"

	palettepkg "github.com/qiqi/figcolor/backend/internal/palette"
)

type PaperProject struct {
	ID               string    `json:"id"`
	UserID           *string   `json:"userId,omitempty"`
	Name             string    `json:"name"`
	Description      *string   `json:"description,omitempty"`
	DefaultPaletteID *string   `json:"defaultPaletteId,omitempty"`
	CreatedAt        time.Time `json:"createdAt"`
	UpdatedAt        time.Time `json:"updatedAt"`
}

type CreateProjectRequest struct {
	Name        string  `json:"name" binding:"required"`
	Description *string `json:"description,omitempty"`
}

type UpdateProjectRequest struct {
	Name        *string `json:"name,omitempty"`
	Description *string `json:"description,omitempty"`
}

type ProjectDetailResponse struct {
	Project  *PaperProject      `json:"project"`
	Palettes []ProjectPalette   `json:"palettes"`
	Figures  []FigureAssignment `json:"figures"`
}

type ProjectPalette struct {
	ID             string                 `json:"id"`
	ProjectID      string                 `json:"projectId"`
	Name           string                 `json:"name"`
	BasePaletteID  *string                `json:"basePaletteId,omitempty"`
	IsDefault      bool                   `json:"isDefault"`
	Roles          []PaletteRole          `json:"roles"`
	PreviewPalette *ProjectPalettePreview `json:"previewPalette,omitempty"`
	CreatedAt      time.Time              `json:"createdAt"`
	UpdatedAt      time.Time              `json:"updatedAt"`
}

// ProjectPalettePreview carries the base palette identity and its published
// primary preview through the authenticated project response. It deliberately
// does not expose draft or secondary preview cases.
type ProjectPalettePreview struct {
	palettepkg.Palette
	PrimaryPreviewCase *palettepkg.PublicPalettePreviewCase `json:"primary_preview_case"`
}

type PaletteRole struct {
	ID        string    `json:"id"`
	PaletteID string    `json:"paletteId"`
	Key       string    `json:"key"`
	Label     string    `json:"label"`
	Color     string    `json:"color"`
	RoleType  string    `json:"roleType"`
	Order     int       `json:"order"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type UpdateRoleColorRequest struct {
	Color string `json:"color" binding:"required"`
}

type CreateProjectPaletteRequest struct {
	BasePaletteID *string `json:"basePaletteId,omitempty"`
	Name          *string `json:"name,omitempty"`
}

type UpdateProjectPaletteRoleRequest struct {
	ID       *string `json:"id,omitempty"`
	Key      string  `json:"key" binding:"required"`
	Label    string  `json:"label" binding:"required"`
	Color    string  `json:"color" binding:"required"`
	RoleType string  `json:"roleType" binding:"required"`
	Order    int     `json:"order"`
}

type UpdateProjectPaletteRequest struct {
	Name  string                            `json:"name" binding:"required"`
	Roles []UpdateProjectPaletteRoleRequest `json:"roles" binding:"required,min=2,dive"`
}

// FigureAssignment represents a figure in a project
type FigureAssignment struct {
	ID               string    `json:"id"`
	ProjectID        string    `json:"projectId"`
	PaletteID        string    `json:"paletteId"`
	Name             string    `json:"name"`
	Panel            *string   `json:"panel,omitempty"`
	ChartType        string    `json:"chartType"`
	SelectedRoleKeys []string  `json:"selectedRoleKeys"`
	Notes            *string   `json:"notes,omitempty"`
	CreatedAt        time.Time `json:"createdAt"`
	UpdatedAt        time.Time `json:"updatedAt"`
}

// FigureSelectedRole represents a selected role for a figure
type FigureSelectedRole struct {
	ID        string `json:"id"`
	FigureID  string `json:"figureId"`
	RoleKey   string `json:"roleKey"`
	SortOrder int    `json:"sortOrder"`
}

// CreateFigureRequest is the request body for creating a figure
type CreateFigureRequest struct {
	Name             string   `json:"name" binding:"required"`
	Panel            *string  `json:"panel,omitempty"`
	ChartType        string   `json:"chartType" binding:"required"`
	PaletteID        string   `json:"paletteId" binding:"required"`
	SelectedRoleKeys []string `json:"selectedRoleKeys"`
	Notes            *string  `json:"notes,omitempty"`
}

// UpdateFigureRequest is the request body for updating a figure
type UpdateFigureRequest struct {
	Name             *string  `json:"name,omitempty"`
	Panel            *string  `json:"panel,omitempty"`
	ChartType        *string  `json:"chartType,omitempty"`
	PaletteID        *string  `json:"paletteId,omitempty"`
	SelectedRoleKeys []string `json:"selectedRoleKeys,omitempty"`
	Notes            *string  `json:"notes,omitempty"`
}
