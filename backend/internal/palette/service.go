package palette

import (
	"encoding/json"
	"fmt"

	"github.com/qiqi/figcolor/backend/internal/database"
)

// Service handles business logic for palettes
type Service struct {
	repo *Repository
}

// NewService creates a new palette service
func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

// GetByID retrieves a palette by ID
func (s *Service) GetByID(id string) (*Palette, error) {
	return s.repo.GetByID(id)
}

// GetBySlug retrieves a palette by slug
func (s *Service) GetBySlug(slug string) (*Palette, error) {
	return s.repo.GetBySlug(slug)
}

// List retrieves palettes with optional filtering
func (s *Service) List(params ListParams) ([]*Palette, int, error) {
	return s.repo.List(params)
}

// GetStats returns palette statistics
func (s *Service) GetStats() (*PaletteStats, error) {
	return s.repo.GetStats()
}

// Create creates a new palette
func (s *Service) Create(req *CreatePaletteRequest, createdBy string) (*Palette, error) {
	// Validate required fields
	if req.Name == "" {
		return nil, fmt.Errorf("name is required")
	}
	if req.Colors == nil {
		return nil, fmt.Errorf("colors is required")
	}
	if req.Type == "" {
		return nil, fmt.Errorf("type is required")
	}

	// Generate slug if not provided
	if req.Slug == "" {
		req.Slug = GenerateSlug(req.Name)
	}

	// Ensure slug is unique
	baseSlug := req.Slug
	counter := 1
	for {
		exists, err := s.repo.SlugExists(req.Slug, "")
		if err != nil {
			return nil, err
		}
		if !exists {
			break
		}
		req.Slug = fmt.Sprintf("%s-%d", baseSlug, counter)
		counter++
	}

	// Parse colors and compute color_count if not provided
	if req.ColorCount == 0 {
		var colors []PaletteColor
		if err := json.Unmarshal(req.Colors, &colors); err == nil {
			req.ColorCount = len(colors)
		}
	}

	return s.repo.Create(req, createdBy)
}

// Update updates an existing palette
func (s *Service) Update(id string, req *UpdatePaletteRequest) (*Palette, error) {
	// Check if palette exists
	existing, err := s.repo.GetByID(id)
	if err != nil {
		return nil, err
	}
	if existing == nil {
		return nil, fmt.Errorf("palette not found")
	}

	// If slug is being changed, check uniqueness
	if req.Slug != nil && *req.Slug != existing.Slug {
		exists, err := s.repo.SlugExists(*req.Slug, id)
		if err != nil {
			return nil, err
		}
		if exists {
			return nil, fmt.Errorf("slug already in use")
		}
	}

	// Parse colors and compute color_count if being updated
	if req.Colors != nil && (req.ColorCount == nil || *req.ColorCount == 0) {
		var colors []PaletteColor
		if err := json.Unmarshal(req.Colors, &colors); err == nil {
			count := len(colors)
			req.ColorCount = &count
		}
	}

	return s.repo.Update(id, req)
}

// Publish publishes a palette (sets status to 'published')
func (s *Service) Publish(id string) (*Palette, error) {
	existing, err := s.repo.GetByID(id)
	if err != nil {
		return nil, err
	}
	if existing == nil {
		return nil, fmt.Errorf("palette not found")
	}

	return s.repo.Publish(id)
}

// Unpublish unpublishes a palette (sets status to 'candidate')
func (s *Service) Unpublish(id string) (*Palette, error) {
	existing, err := s.repo.GetByID(id)
	if err != nil {
		return nil, err
	}
	if existing == nil {
		return nil, fmt.Errorf("palette not found")
	}

	return s.repo.Unpublish(id)
}

// Archive archives a palette (soft delete, sets status to 'archived')
func (s *Service) Archive(id string) (*Palette, error) {
	existing, err := s.repo.GetByID(id)
	if err != nil {
		return nil, err
	}
	if existing == nil {
		return nil, fmt.Errorf("palette not found")
	}

	return s.repo.Archive(id)
}

// Delete permanently deletes a palette
func (s *Service) Delete(id string) error {
	existing, err := s.repo.GetByID(id)
	if err != nil {
		return err
	}
	if existing == nil {
		return fmt.Errorf("palette not found")
	}

	return s.repo.Delete(id)
}

// ListPublic retrieves only published palettes (for public API)
func (s *Service) ListPublic(params ListParams) ([]*Palette, int, error) {
	params.PublishedOnly = true
	return s.repo.List(params)
}

// GetPublicBySlug retrieves a published palette by slug (for public API)
func (s *Service) GetPublicBySlug(slug string) (*Palette, error) {
	palette, err := s.repo.GetBySlug(slug)
	if err != nil {
		return nil, err
	}
	if palette == nil {
		return nil, nil
	}
	if palette.Status != "published" {
		return nil, fmt.Errorf("palette not found")
	}
	return palette, nil
}

// GetPublicByID retrieves a published palette by ID (for public API)
func (s *Service) GetPublicByID(id string) (*Palette, error) {
	palette, err := s.repo.GetByID(id)
	if err != nil {
		return nil, err
	}
	if palette == nil {
		return nil, nil
	}
	if palette.Status != "published" {
		return nil, fmt.Errorf("palette not found")
	}
	return palette, nil
}

// Ensure the database connection is available
var _ = database.DB