package project

import (
	"time"
)

type PaperProject struct {
	ID              string     `json:"id"`
	UserID          *string    `json:"userId,omitempty"`
	Name            string     `json:"name"`
	Description     *string    `json:"description,omitempty"`
	DefaultPaletteID *string   `json:"defaultPaletteId,omitempty"`
	CreatedAt       time.Time  `json:"createdAt"`
	UpdatedAt       time.Time  `json:"updatedAt"`
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
	Project  *PaperProject     `json:"project"`
	Palettes []ProjectPalette  `json:"palettes"`
	Figures  []FigureAssignment `json:"figures"`
}

type ProjectPalette struct {
	ID            string       `json:"id"`
	ProjectID     string       `json:"projectId"`
	Name          string       `json:"name"`
	BasePaletteID *string      `json:"basePaletteId,omitempty"`
	IsDefault     bool         `json:"isDefault"`
	Roles         []PaletteRole `json:"roles"`
	CreatedAt     time.Time    `json:"createdAt"`
	UpdatedAt     time.Time    `json:"updatedAt"`
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

// FigureAssignment represents a figure in a project
type FigureAssignment struct {
	ID              string    `json:"id"`
	ProjectID       string    `json:"projectId"`
	PaletteID       string    `json:"paletteId"`
	Name            string    `json:"name"`
	Panel           *string   `json:"panel,omitempty"`
	ChartType       string    `json:"chartType"`
	SelectedRoleKeys []string `json:"selectedRoleKeys"`
	Notes           *string   `json:"notes,omitempty"`
	CreatedAt       time.Time `json:"createdAt"`
	UpdatedAt       time.Time `json:"updatedAt"`
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
	Name            string   `json:"name" binding:"required"`
	Panel           *string  `json:"panel,omitempty"`
	ChartType       string   `json:"chartType" binding:"required"`
	PaletteID       string   `json:"paletteId" binding:"required"`
	SelectedRoleKeys []string `json:"selectedRoleKeys"`
	Notes           *string  `json:"notes,omitempty"`
}

// UpdateFigureRequest is the request body for updating a figure
type UpdateFigureRequest struct {
	Name            *string  `json:"name,omitempty"`
	Panel           *string  `json:"panel,omitempty"`
	ChartType       *string  `json:"chartType,omitempty"`
	PaletteID       *string  `json:"paletteId,omitempty"`
	SelectedRoleKeys []string `json:"selectedRoleKeys,omitempty"`
	Notes           *string  `json:"notes,omitempty"`
}