package palette

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/qiqi/figcolor/backend/internal/database"
)

// Service handles business logic for palettes
type Service struct {
	repo *Repository
}

var (
	ErrPaletteNotFound                       = errors.New("palette not found")
	ErrPaletteNotAdminManageable             = errors.New("palette is not admin manageable")
	ErrPalettePublicationConflict            = errors.New("palette publication conflict")
	ErrPaletteRejectionConflict              = errors.New("palette rejection conflict")
	ErrPaletteNotImportedCandidate           = errors.New("palette is not an imported candidate")
	ErrInvalidPreviewCaseLifecycleTransition = errors.New("invalid preview case lifecycle transition")
	ErrPreviewCaseValidationFailure          = errors.New("preview case validation failure")
)

// NewService creates a new palette service
func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

// GetByID retrieves a palette by ID
func (s *Service) GetByID(id string) (*Palette, error) {
	palette, err := s.repo.GetByID(id)
	if err != nil || palette == nil {
		return palette, err
	}
	if !isAdminManageablePalette(palette) {
		return nil, nil
	}
	return palette, nil
}

// GetBySlug retrieves a palette by slug
func (s *Service) GetBySlug(slug string) (*Palette, error) {
	return s.repo.GetBySlug(slug)
}

// List retrieves palettes with optional filtering
func (s *Service) List(params ListParams) ([]*Palette, int, error) {
	params.PublicCatalogOnly = true
	params.Visibility = ""
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
	if err := validatePaletteTypeForCreate(req.Type); err != nil {
		return nil, err
	}
	applyOfficialCatalogOwnership(req)

	req.Slug = defaultPaletteSlug(req.Name, req.Slug)

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

	colors, colorCount, err := normalizeCreateColors(req.Colors, req.ColorCount)
	if err != nil {
		return nil, err
	}
	req.Colors = colors
	req.ColorCount = colorCount
	if err := s.applyCreateApplicabilityRules(req); err != nil {
		return nil, err
	}

	return s.repo.Create(req, createdBy)
}

func applyOfficialCatalogOwnership(req *CreatePaletteRequest) {
	if req == nil {
		return
	}
	// Admin-created palettes are official catalog records. created_by remains
	// audit metadata; owner_user_id is reserved for private user palettes.
	req.OwnerUserID = nil
	req.Visibility = "public"
	req.Origin = "curated"
	req.SourcePaletteID = nil
}

func isAdminManageablePalette(palette *Palette) bool {
	return palette != nil && palette.Visibility == "public" && palette.OwnerUserID == nil
}

func ensureAdminManageablePalette(palette *Palette) error {
	if palette == nil {
		return ErrPaletteNotFound
	}
	if !isAdminManageablePalette(palette) {
		return ErrPaletteNotAdminManageable
	}
	return nil
}

func (s *Service) ensurePreviewCaseAdminManageablePalette(previewCase *PalettePreviewCase) (*Palette, error) {
	if previewCase == nil {
		return nil, ErrPreviewCaseNotFound
	}
	palette, err := s.repo.GetByID(previewCase.PaletteID)
	if err != nil {
		return nil, fmt.Errorf("load palette for preview case: %w", err)
	}
	if err := ensureAdminManageablePalette(palette); err != nil {
		return nil, err
	}
	return palette, nil
}

func applyAdminCatalogUpdateBoundary(req *UpdatePaletteRequest) {
	if req == nil {
		return
	}
	req.OwnerUserID = nil
	req.Visibility = nil
	req.Origin = nil
	req.SourcePaletteID = nil
}

func defaultPaletteSlug(name, slug string) string {
	slug = strings.TrimSpace(slug)
	if slug != "" {
		return slug
	}
	return GenerateSlug(name)
}

// Update updates an existing palette
func (s *Service) Update(id string, req *UpdatePaletteRequest) (*Palette, error) {
	// Check if palette exists
	existing, err := s.repo.GetByID(id)
	if err != nil {
		return nil, err
	}
	if existing == nil {
		return nil, ErrPaletteNotFound
	}
	if err := ensureAdminManageablePalette(existing); err != nil {
		return nil, err
	}
	applyAdminCatalogUpdateBoundary(req)
	// Candidate review edits are not publication transitions. Preserve the
	// ingestion-owned candidate state even if a client submits a status field.
	applyCandidateReviewUpdateBoundary(existing, req)
	if err := validatePaletteTypeForUpdate(existing.Type, req.Type); err != nil {
		return nil, err
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

	if req.Colors != nil {
		colors, colorCount, err := normalizeUpdateColors(req.Colors, req.ColorCount)
		if err != nil {
			return nil, err
		}
		req.Colors = colors
		req.ColorCount = &colorCount
	} else {
		// color_count is derived from colors and is not independently editable.
		req.ColorCount = nil
	}
	if err := s.applyUpdateApplicabilityRules(existing, req); err != nil {
		return nil, err
	}

	return s.repo.Update(id, req)
}

func applyCandidateReviewUpdateBoundary(existing *Palette, req *UpdatePaletteRequest) {
	if existing != nil && existing.Status == "candidate" && req != nil {
		req.Status = nil
	}
}

func (s *Service) applyCreateApplicabilityRules(req *CreatePaletteRequest) error {
	if !req.ChartApplicability.Present || req.ChartApplicability.Null {
		return nil
	}

	applicability, err := normalizeChartApplicability(&req.ChartApplicability)
	if err != nil {
		return err
	}
	derivedChartTypes := deriveChartTypesFromApplicability(applicability)
	if req.ChartTypes != nil && !chartTypesEqual(req.ChartTypes, derivedChartTypes) {
		return chartTypesConflictError()
	}
	req.ChartApplicability.Value = applicability
	req.ChartTypes = derivedChartTypes
	return nil
}

func (s *Service) applyUpdateApplicabilityRules(existing *Palette, req *UpdatePaletteRequest) error {
	if req.ChartApplicability.Present {
		if req.ChartApplicability.Null {
			req.ChartTypes = nil
			return nil
		}

		applicability, err := normalizeChartApplicability(&req.ChartApplicability)
		if err != nil {
			return err
		}
		derivedChartTypes := deriveChartTypesFromApplicability(applicability)
		if req.ChartTypes != nil && !chartTypesEqual(req.ChartTypes, derivedChartTypes) {
			return chartTypesConflictError()
		}
		req.ChartApplicability.Value = applicability
		req.ChartTypes = derivedChartTypes
		return nil
	}

	if existing.ChartApplicability == nil {
		return nil
	}

	derivedChartTypes := deriveChartTypesFromApplicability(*existing.ChartApplicability)
	if req.ChartTypes != nil && !chartTypesEqual(req.ChartTypes, derivedChartTypes) {
		return chartTypesConflictError()
	}
	req.ChartTypes = derivedChartTypes
	return nil
}

func chartTypesConflictError() error {
	return NewValidationError([]ValidationIssue{
		validationIssue("chart_types", "CHART_TYPES_CONFLICT", "chart_types must match chart_applicability chart_type order when chart_applicability is authoritative."),
	})
}

// CreatePreviewCase creates a draft, non-primary preview case. It never
// publishes implicitly.
func (s *Service) CreatePreviewCase(paletteID string, req *CreatePreviewCaseRequest) (*PalettePreviewCase, error) {
	palette, err := s.repo.GetByID(paletteID)
	if err != nil {
		return nil, fmt.Errorf("load palette for preview case: %w", err)
	}
	if palette == nil {
		return nil, ErrPaletteNotFound
	}
	if err := ensureAdminManageablePalette(palette); err != nil {
		return nil, err
	}
	if err := validateCreatePreviewCaseRequest(req); err != nil {
		return nil, previewCaseValidationError(err)
	}

	candidate := previewCaseCandidateFromCreate(paletteID, req)
	if err := s.validatePreviewCaseCandidate(palette, candidate); err != nil {
		return nil, err
	}

	previewCase, err := s.repo.CreatePreviewCase(paletteID, req)
	if err != nil {
		return nil, previewCaseServiceError("create preview case", err)
	}
	return previewCase, nil
}

func (s *Service) ListPreviewCasesByPalette(paletteID string, includeArchived bool) ([]*PalettePreviewCase, error) {
	palette, err := s.repo.GetByID(paletteID)
	if err != nil {
		return nil, fmt.Errorf("load palette for preview cases: %w", err)
	}
	if palette == nil {
		return nil, ErrPaletteNotFound
	}
	if err := ensureAdminManageablePalette(palette); err != nil {
		return nil, err
	}
	previewCases, err := s.repo.ListPreviewCasesByPalette(paletteID, includeArchived)
	if err != nil {
		return nil, previewCaseServiceError("list preview cases", err)
	}
	return previewCases, nil
}

func (s *Service) GetPreviewCaseByID(id string) (*PalettePreviewCase, error) {
	previewCase, err := s.repo.GetPreviewCaseByID(id)
	if err != nil {
		return nil, previewCaseServiceError("load preview case", err)
	}
	if _, err := s.ensurePreviewCaseAdminManageablePalette(previewCase); err != nil {
		return nil, err
	}
	return previewCase, nil
}

func (s *Service) UpdatePreviewCase(id string, req *UpdatePreviewCaseRequest) (*PalettePreviewCase, error) {
	if err := validateUpdatePreviewCaseRequest(req); err != nil {
		return nil, previewCaseValidationError(err)
	}

	tx, err := database.DB.Begin()
	if err != nil {
		return nil, fmt.Errorf("begin update preview case transaction: %w", err)
	}
	defer tx.Rollback()

	existing, err := s.repo.GetPreviewCaseByIDForUpdateTx(tx, id)
	if err != nil {
		return nil, previewCaseServiceError("load preview case", err)
	}
	palette, err := s.repo.GetPaletteByIDTx(tx, existing.PaletteID)
	if err != nil {
		return nil, fmt.Errorf("load palette for preview case: %w", err)
	}
	if palette == nil {
		return nil, ErrPaletteNotFound
	}
	if err := ensureAdminManageablePalette(palette); err != nil {
		return nil, err
	}

	candidate := previewCaseCandidateFromExisting(existing)
	mergePreviewCaseUpdate(candidate, req)
	if err := s.validatePreviewCaseCandidate(palette, candidate); err != nil {
		return nil, err
	}

	previewCase, err := s.repo.UpdatePreviewCaseTx(tx, id, req)
	if err != nil {
		return nil, previewCaseServiceError("update preview case", err)
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit update preview case transaction: %w", err)
	}
	return previewCase, nil
}

func (s *Service) DeleteDraftPreviewCase(id string) error {
	tx, err := database.DB.Begin()
	if err != nil {
		return fmt.Errorf("begin delete preview case transaction: %w", err)
	}
	defer tx.Rollback()

	existing, err := s.repo.GetPreviewCaseByIDForUpdateTx(tx, id)
	if err != nil {
		return previewCaseServiceError("load preview case", err)
	}
	palette, err := s.repo.GetPaletteByIDTx(tx, existing.PaletteID)
	if err != nil {
		return fmt.Errorf("load palette for preview case: %w", err)
	}
	if err := ensureAdminManageablePalette(palette); err != nil {
		return err
	}
	if err := canDeleteDraftPreviewCase(existing); err != nil {
		return err
	}
	if err := s.repo.DeletePreviewCaseTx(tx, id); err != nil {
		return previewCaseServiceError("delete preview case", err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit delete preview case transaction: %w", err)
	}
	return nil
}

// PublishPreviewCase is idempotent for already-published cases and returns the
// current row unchanged. Archived cases cannot be published.
func (s *Service) PublishPreviewCase(id string) (*PalettePreviewCase, error) {
	tx, err := database.DB.Begin()
	if err != nil {
		return nil, fmt.Errorf("begin publish preview case transaction: %w", err)
	}
	defer tx.Rollback()

	existing, err := s.repo.GetPreviewCaseByIDForUpdateTx(tx, id)
	if err != nil {
		return nil, previewCaseServiceError("load preview case", err)
	}
	palette, err := s.repo.GetPaletteByIDTx(tx, existing.PaletteID)
	if err != nil {
		return nil, fmt.Errorf("load palette for preview case: %w", err)
	}
	if err := ensureAdminManageablePalette(palette); err != nil {
		return nil, err
	}
	unchanged, err := canPublishPreviewCase(existing)
	if err != nil {
		return nil, err
	}
	if unchanged {
		if err := tx.Commit(); err != nil {
			return nil, fmt.Errorf("commit publish preview case transaction: %w", err)
		}
		return existing, nil
	}

	candidate := previewCaseCandidateFromExisting(existing)
	if err := s.validatePreviewCaseCandidate(palette, candidate); err != nil {
		return nil, err
	}

	previewCase, err := s.repo.UpdatePreviewCaseLifecycleTx(tx, id, PreviewCaseStatusPublished, existing.IsPrimary)
	if err != nil {
		return nil, previewCaseServiceError("publish preview case", err)
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit publish preview case transaction: %w", err)
	}
	return previewCase, nil
}

// ArchivePreviewCase is idempotent for already-archived cases and returns the
// current row unchanged. Archiving clears primary atomically.
func (s *Service) ArchivePreviewCase(id string) (*PalettePreviewCase, error) {
	tx, err := database.DB.Begin()
	if err != nil {
		return nil, fmt.Errorf("begin archive preview case transaction: %w", err)
	}
	defer tx.Rollback()

	existing, err := s.repo.GetPreviewCaseByIDForUpdateTx(tx, id)
	if err != nil {
		return nil, previewCaseServiceError("load preview case", err)
	}
	palette, err := s.repo.GetPaletteByIDTx(tx, existing.PaletteID)
	if err != nil {
		return nil, fmt.Errorf("load palette for preview case: %w", err)
	}
	if err := ensureAdminManageablePalette(palette); err != nil {
		return nil, err
	}
	unchanged, err := canArchivePreviewCase(existing)
	if err != nil {
		return nil, err
	}
	if unchanged {
		if err := tx.Commit(); err != nil {
			return nil, fmt.Errorf("commit archive preview case transaction: %w", err)
		}
		return existing, nil
	}

	previewCase, err := s.repo.UpdatePreviewCaseLifecycleTx(tx, id, PreviewCaseStatusArchived, false)
	if err != nil {
		return nil, previewCaseServiceError("archive preview case", err)
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit archive preview case transaction: %w", err)
	}
	return previewCase, nil
}

func (s *Service) SetPrimaryPreviewCase(id string) (*PalettePreviewCase, error) {
	target, err := s.repo.GetPreviewCaseByID(id)
	if err != nil {
		return nil, previewCaseServiceError("load preview case", err)
	}

	tx, err := database.DB.Begin()
	if err != nil {
		return nil, fmt.Errorf("begin set primary preview case transaction: %w", err)
	}
	defer tx.Rollback()

	palette, err := s.repo.LockPaletteByIDTx(tx, target.PaletteID)
	if err != nil {
		return nil, fmt.Errorf("lock palette for preview case: %w", err)
	}
	if palette == nil {
		return nil, ErrPaletteNotFound
	}
	if err := ensureAdminManageablePalette(palette); err != nil {
		return nil, err
	}

	existing, err := s.repo.GetPreviewCaseByIDForUpdateTx(tx, id)
	if err != nil {
		return nil, previewCaseServiceError("load preview case", err)
	}
	if existing.PaletteID != target.PaletteID {
		return nil, fmt.Errorf("%w: preview case palette changed while setting primary", ErrInvalidPreviewCaseLifecycleTransition)
	}
	if err := canSetPrimaryPreviewCase(existing); err != nil {
		return nil, err
	}
	if err := s.repo.UnsetPrimaryPreviewCasesTx(tx, existing.PaletteID); err != nil {
		return nil, previewCaseServiceError("unset primary preview cases", err)
	}
	previewCase, err := s.repo.SetPrimaryPreviewCaseTx(tx, id)
	if err != nil {
		return nil, previewCaseServiceError("set primary preview case", err)
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit set primary preview case transaction: %w", err)
	}
	return previewCase, nil
}

type previewCaseCandidate struct {
	PaletteID       string
	ChartType       string
	TemplateID      string
	TemplateVersion int
	SchemaVersion   int
	ColorRoles      json.RawMessage
	PreviewConfig   json.RawMessage
	SeedStrategy    string
	SeedValue       *int
}

func previewCaseCandidateFromCreate(paletteID string, req *CreatePreviewCaseRequest) *previewCaseCandidate {
	return &previewCaseCandidate{
		PaletteID:       paletteID,
		ChartType:       req.ChartType,
		TemplateID:      req.TemplateID,
		TemplateVersion: req.TemplateVersion,
		SchemaVersion:   req.SchemaVersion,
		ColorRoles:      req.ColorRoles,
		PreviewConfig:   req.PreviewConfig,
		SeedStrategy:    req.SeedStrategy,
		SeedValue:       req.SeedValue,
	}
}

func previewCaseCandidateFromExisting(existing *PalettePreviewCase) *previewCaseCandidate {
	return &previewCaseCandidate{
		PaletteID:       existing.PaletteID,
		ChartType:       existing.ChartType,
		TemplateID:      existing.TemplateID,
		TemplateVersion: existing.TemplateVersion,
		SchemaVersion:   existing.SchemaVersion,
		ColorRoles:      existing.ColorRoles,
		PreviewConfig:   existing.PreviewConfig,
		SeedStrategy:    existing.SeedStrategy,
		SeedValue:       existing.SeedValue,
	}
}

func mergePreviewCaseUpdate(candidate *previewCaseCandidate, req *UpdatePreviewCaseRequest) {
	if req.ChartType != nil {
		candidate.ChartType = *req.ChartType
	}
	if req.TemplateID != nil {
		candidate.TemplateID = *req.TemplateID
	}
	if req.TemplateVersion != nil {
		candidate.TemplateVersion = *req.TemplateVersion
	}
	if req.SchemaVersion != nil {
		candidate.SchemaVersion = *req.SchemaVersion
	}
	if req.ColorRoles != nil {
		candidate.ColorRoles = req.ColorRoles
	}
	if req.PreviewConfig != nil {
		candidate.PreviewConfig = req.PreviewConfig
	}
	if req.SeedStrategy != nil {
		candidate.SeedStrategy = *req.SeedStrategy
	}
	if req.SeedValue.Present {
		if req.SeedValue.Null {
			candidate.SeedValue = nil
		} else {
			value := req.SeedValue.Value
			candidate.SeedValue = &value
		}
	}
}

func canDeleteDraftPreviewCase(existing *PalettePreviewCase) error {
	if existing.Status != PreviewCaseStatusDraft {
		return fmt.Errorf("%w: only draft preview cases can be hard deleted", ErrInvalidPreviewCaseLifecycleTransition)
	}
	return nil
}

func canPublishPreviewCase(existing *PalettePreviewCase) (bool, error) {
	switch existing.Status {
	case PreviewCaseStatusDraft:
		return false, nil
	case PreviewCaseStatusPublished:
		return true, nil
	case PreviewCaseStatusArchived:
		return false, fmt.Errorf("%w: archived preview cases cannot be published", ErrInvalidPreviewCaseLifecycleTransition)
	default:
		return false, fmt.Errorf("%w: unknown preview case status %q", ErrInvalidPreviewCaseLifecycleTransition, existing.Status)
	}
}

func canArchivePreviewCase(existing *PalettePreviewCase) (bool, error) {
	switch existing.Status {
	case PreviewCaseStatusDraft, PreviewCaseStatusPublished:
		return false, nil
	case PreviewCaseStatusArchived:
		return true, nil
	default:
		return false, fmt.Errorf("%w: unknown preview case status %q", ErrInvalidPreviewCaseLifecycleTransition, existing.Status)
	}
}

func canSetPrimaryPreviewCase(existing *PalettePreviewCase) error {
	if existing.Status != PreviewCaseStatusPublished {
		return fmt.Errorf("%w: only published preview cases can be primary", ErrInvalidPreviewCaseLifecycleTransition)
	}
	return nil
}

func (s *Service) validatePreviewCaseCandidate(palette *Palette, candidate *previewCaseCandidate) error {
	issues := validatePreviewCaseStorageFields(
		strings.TrimSpace(candidate.ChartType),
		strings.TrimSpace(candidate.TemplateID),
		candidate.TemplateVersion,
		candidate.SchemaVersion,
		candidate.ColorRoles,
		candidate.PreviewConfig,
		strings.TrimSpace(candidate.SeedStrategy),
		candidate.SeedValue,
		"preview_case",
		true,
	)
	if len(issues) == 0 {
		issues = append(issues, validatePreviewCaseTemplateContract(candidate)...)
	}
	if len(issues) == 0 {
		colorIDs, err := paletteColorIDs(palette)
		if err != nil {
			return err
		}
		issues = append(issues, validatePaletteColorReferences(candidate.ColorRoles, colorIDs, "preview_case.color_roles")...)
	}
	if len(issues) > 0 {
		return previewCaseValidationError(NewValidationError(issues))
	}
	return nil
}

func paletteColorIDs(palette *Palette) (map[string]bool, error) {
	var colors []PaletteColor
	if err := json.Unmarshal(palette.Colors, &colors); err != nil {
		return nil, previewCaseValidationError(NewValidationError([]ValidationIssue{
			validationIssue("palette.colors", "MALFORMED_PALETTE_COLORS", "Palette colors must be a valid array before preview cases can reference them."),
		}))
	}
	ids := make(map[string]bool, len(colors))
	for _, color := range colors {
		id := strings.TrimSpace(color.ID)
		if id != "" {
			ids[id] = true
		}
	}
	return ids, nil
}

func validatePaletteColorReferences(raw json.RawMessage, validColorIDs map[string]bool, rootPath string) []ValidationIssue {
	var value interface{}
	if err := json.Unmarshal(raw, &value); err != nil {
		return []ValidationIssue{
			validationIssue(rootPath, "MALFORMED_COLOR_ROLES", "Color roles must be valid JSON."),
		}
	}
	return validatePaletteColorReferenceValue(value, validColorIDs, rootPath)
}

func validatePaletteColorReferenceValue(value interface{}, validColorIDs map[string]bool, path string) []ValidationIssue {
	switch typed := value.(type) {
	case map[string]interface{}:
		issues := make([]ValidationIssue, 0)
		source, hasSource := typed["source"]
		if hasSource {
			sourceText, ok := source.(string)
			if !ok {
				issues = append(issues, validationIssue(path+".source", "INVALID_COLOR_REFERENCE", "Color reference source must be a string."))
			}
			sourceText = strings.TrimSpace(sourceText)
			if ok && sourceText == "palette" {
				colorValue, hasColorID := typed["color_id"]
				if !hasColorID {
					issues = append(issues, validationIssue(path+".color_id", "COLOR_ID_REQUIRED", "Palette color references must include color_id."))
				} else if colorID, ok := colorValue.(string); !ok {
					issues = append(issues, validationIssue(path+".color_id", "INVALID_COLOR_REFERENCE", "Palette color_id must be a string."))
				} else {
					colorID = strings.TrimSpace(colorID)
					if colorID == "" {
						issues = append(issues, validationIssue(path+".color_id", "COLOR_ID_REQUIRED", "Palette color references must include color_id."))
					} else if !validColorIDs[colorID] {
						issues = append(issues, validationIssue(path+".color_id", "COLOR_NOT_FOUND", "Palette color reference does not match a persisted palette color."))
					}
				}
			} else if ok && sourceText != "theme" {
				issues = append(issues, validationIssue(path+".source", "INVALID_COLOR_REFERENCE", "Color reference source must be palette or theme."))
			}
		}
		for key, child := range typed {
			issues = append(issues, validatePaletteColorReferenceValue(child, validColorIDs, path+"."+key)...)
		}
		return issues
	case []interface{}:
		issues := make([]ValidationIssue, 0)
		for index, child := range typed {
			issues = append(issues, validatePaletteColorReferenceValue(child, validColorIDs, fmt.Sprintf("%s[%d]", path, index))...)
		}
		return issues
	default:
		return nil
	}
}

func previewCaseValidationError(err error) error {
	if err == nil {
		return nil
	}
	return fmt.Errorf("%w: %w", ErrPreviewCaseValidationFailure, err)
}

func previewCaseServiceError(operation string, err error) error {
	if err == nil {
		return nil
	}
	switch {
	case errors.Is(err, ErrPreviewCaseNotFound):
		return fmt.Errorf("%s: %w", operation, ErrPreviewCaseNotFound)
	case errors.Is(err, ErrPreviewCaseConflict):
		return fmt.Errorf("%s: %w", operation, ErrPreviewCaseConflict)
	case errors.Is(err, ErrPreviewCaseConstraint):
		return fmt.Errorf("%s: %w", operation, ErrPreviewCaseValidationFailure)
	case errors.Is(err, ErrPreviewCaseForeignKey):
		return fmt.Errorf("%s: %w", operation, ErrPaletteNotFound)
	default:
		return fmt.Errorf("%s: %w", operation, err)
	}
}

// Publish publishes a palette (sets status to 'published')
func (s *Service) Publish(id string) (*Palette, error) {
	tx, err := database.DB.Begin()
	if err != nil {
		return nil, fmt.Errorf("begin publication transaction: %w", err)
	}
	defer tx.Rollback()
	existing, err := s.repo.getByID(tx, id, true)
	if err != nil {
		return nil, err
	}
	if existing == nil {
		return nil, ErrPaletteNotFound
	}
	if err := ensureAdminManageablePalette(existing); err != nil {
		return nil, err
	}

	// Imported palettes enter review as candidates, while an existing published
	// palette returns to draft when an admin unpublishes it. Both states are
	// intentionally publishable from the admin UI.
	if existing.Status != "candidate" && existing.Status != "draft" {
		return nil, ErrPalettePublicationConflict
	}
	unpublishedStatus := existing.Status
	previewCases, err := s.repo.ListPreviewCasesByPaletteTx(tx, id, true)
	if err != nil {
		return nil, previewCaseServiceError("load publication preview cases", err)
	}
	if err := s.validatePublicationReadiness(tx, existing, previewCases); err != nil {
		return nil, err
	}
	result, err := tx.Exec(`UPDATE palettes SET status='published', published_at=clock_timestamp(), updated_at=clock_timestamp()
		WHERE id=$1 AND status=$2 AND visibility='public' AND owner_user_id IS NULL`, id, unpublishedStatus)
	if err != nil {
		return nil, fmt.Errorf("publish candidate: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil || rows != 1 {
		return nil, ErrPalettePublicationConflict
	}
	published, err := s.repo.getByID(tx, id, false)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit publication transaction: %w", err)
	}
	return published, nil
}

// Reject atomically moves an imported candidate to the existing archived terminal state.
func (s *Service) Reject(id string) (*Palette, error) {
	tx, err := database.DB.Begin()
	if err != nil {
		return nil, fmt.Errorf("begin rejection transaction: %w", err)
	}
	defer tx.Rollback()
	existing, err := s.repo.getByID(tx, id, true)
	if err != nil {
		return nil, err
	}
	if existing == nil {
		return nil, ErrPaletteNotFound
	}
	if err := ensureAdminManageablePalette(existing); err != nil {
		return nil, err
	}
	if existing.Status != "candidate" {
		return nil, ErrPaletteRejectionConflict
	}
	var ingestionID string
	if err := tx.QueryRow(`SELECT id FROM palette_ingestion_records WHERE palette_id=$1 AND processing_state='succeeded'`, id).Scan(&ingestionID); err == sql.ErrNoRows {
		return nil, ErrPaletteNotImportedCandidate
	} else if err != nil {
		return nil, fmt.Errorf("load rejection ingestion identity: %w", err)
	}
	if _, err := tx.Exec(`UPDATE palette_preview_cases SET status='archived',is_primary=false,updated_at=clock_timestamp()
		WHERE palette_id=$1 AND status<>'archived'`, id); err != nil {
		return nil, fmt.Errorf("archive rejected candidate previews: %w", err)
	}
	result, err := tx.Exec(`UPDATE palettes SET status='archived',archived_at=clock_timestamp(),updated_at=clock_timestamp()
		WHERE id=$1 AND status='candidate' AND visibility='public' AND owner_user_id IS NULL`, id)
	if err != nil {
		return nil, fmt.Errorf("reject imported candidate: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil || rows != 1 {
		return nil, ErrPaletteRejectionConflict
	}
	rejected, err := s.repo.getByID(tx, id, false)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit rejection transaction: %w", err)
	}
	return rejected, nil
}

func (s *Service) CanReject(id string) (bool, error) {
	palette, err := s.repo.GetByID(id)
	if err != nil || palette == nil {
		return false, err
	}
	if err := ensureAdminManageablePalette(palette); err != nil {
		return false, err
	}
	if palette.Status != "candidate" {
		return false, nil
	}
	var eligible bool
	err = database.DB.QueryRow(`SELECT EXISTS(SELECT 1 FROM palette_ingestion_records WHERE palette_id=$1 AND processing_state='succeeded')`, id).Scan(&eligible)
	return eligible, err
}

func (s *Service) validatePublicationReadiness(tx *sql.Tx, palette *Palette, previewCases []*PalettePreviewCase) error {
	issues := make([]ValidationIssue, 0)
	if strings.TrimSpace(palette.Name) == "" {
		issues = append(issues, validationIssue("name", "NAME_REQUIRED", "Palette name is required."))
	}
	if strings.TrimSpace(palette.Slug) == "" {
		issues = append(issues, validationIssue("slug", "SLUG_REQUIRED", "Palette slug is required."))
	}
	if _, _, err := normalizeUpdateColors(palette.Colors, &palette.ColorCount); err != nil {
		if validationErr, ok := IsValidationError(err); ok {
			issues = append(issues, validationErr.Issues...)
		}
	}
	if err := validatePaletteTypeForUpdate(palette.Type, &palette.Type); err != nil {
		if validationErr, ok := IsValidationError(err); ok {
			issues = append(issues, validationErr.Issues...)
		}
	}
	if palette.ChartApplicability != nil {
		raw, _ := json.Marshal(*palette.ChartApplicability)
		optional := OptionalChartApplicability{Present: true, Raw: raw}
		if _, err := normalizeChartApplicability(&optional); err != nil {
			if validationErr, ok := IsValidationError(err); ok {
				issues = append(issues, validationErr.Issues...)
			}
		}
	}
	for index, previewCase := range previewCases {
		if previewCase.Status == PreviewCaseStatusArchived {
			continue
		}
		if err := s.validatePreviewCaseCandidate(palette, previewCaseCandidateFromExisting(previewCase)); err != nil {
			if validationErr, ok := IsValidationError(err); ok {
				for _, issue := range validationErr.Issues {
					issue.Path = fmt.Sprintf("preview_cases[%d].%s", index, strings.TrimPrefix(issue.Path, "preview_case."))
					issues = append(issues, issue)
				}
			}
		}
	}
	var raw []byte
	err := tx.QueryRow(`SELECT validation_issues FROM palette_ingestion_records WHERE palette_id=$1`, palette.ID).Scan(&raw)
	if err != nil && err != sql.ErrNoRows {
		return fmt.Errorf("load ingestion validation issues: %w", err)
	}
	if len(raw) > 0 {
		var stored []struct {
			Path     string `json:"path"`
			Code     string `json:"code"`
			Message  string `json:"message"`
			Severity string `json:"severity"`
			Blocking bool   `json:"blocking"`
		}
		if json.Unmarshal(raw, &stored) == nil {
			for _, issue := range stored {
				if issue.Blocking || issue.Severity == "error" {
					issues = append(issues, validationIssue(issue.Path, issue.Code, issue.Message))
				}
			}
		}
	}
	if len(issues) > 0 {
		return NewValidationError(issues)
	}
	return nil
}

// Unpublish unpublishes a palette (sets status to 'draft')
func (s *Service) Unpublish(id string) (*Palette, error) {
	existing, err := s.repo.GetByID(id)
	if err != nil {
		return nil, err
	}
	if existing == nil {
		return nil, ErrPaletteNotFound
	}
	if err := ensureAdminManageablePalette(existing); err != nil {
		return nil, err
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
		return nil, ErrPaletteNotFound
	}
	if err := ensureAdminManageablePalette(existing); err != nil {
		return nil, err
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
		return ErrPaletteNotFound
	}
	if err := ensureAdminManageablePalette(existing); err != nil {
		return err
	}

	return s.repo.Delete(id)
}

// ListPublic retrieves only published palettes (for public API)
func (s *Service) ListPublic(params ListParams) ([]*PublicPaletteDTO, int, error) {
	params.PublishedOnly = true
	params.Visibility = "public"
	params.PublicCatalogOnly = true
	palettes, total, err := s.repo.List(params)
	if err != nil {
		return nil, 0, err
	}

	paletteIDs := make([]string, 0, len(palettes))
	for _, palette := range palettes {
		paletteIDs = append(paletteIDs, palette.ID)
	}
	previewCasesByPalette, err := s.repo.ListPublishedPreviewCasesByPalettes(paletteIDs)
	if err != nil {
		return nil, 0, previewCaseServiceError("list published preview cases", err)
	}

	publicPalettes := make([]*PublicPaletteDTO, 0, len(palettes))
	for _, palette := range palettes {
		publicPalettes = append(publicPalettes, buildPublicPaletteDTO(palette, previewCasesByPalette[palette.ID]))
	}
	return publicPalettes, total, nil
}

// GetPublicBySlug retrieves a published palette by slug (for public API)
func (s *Service) GetPublicBySlug(slug string) (*PublicPaletteDTO, error) {
	palette, err := s.repo.GetBySlug(slug)
	if err != nil {
		return nil, err
	}
	if palette == nil {
		return nil, nil
	}
	if palette.Status != "published" || !isAdminManageablePalette(palette) {
		return nil, fmt.Errorf("palette not found")
	}
	previewCases, err := s.repo.ListPublishedPreviewCasesByPalette(palette.ID)
	if err != nil {
		return nil, previewCaseServiceError("list published preview cases", err)
	}
	return buildPublicPaletteDTO(palette, previewCases), nil
}

// GetPublicByID retrieves a published palette by ID (for public API)
func (s *Service) GetPublicByID(id string) (*PublicPaletteDTO, error) {
	palette, err := s.repo.GetByID(id)
	if err != nil {
		return nil, err
	}
	if palette == nil {
		return nil, nil
	}
	if palette.Status != "published" || !isAdminManageablePalette(palette) {
		return nil, fmt.Errorf("palette not found")
	}
	previewCases, err := s.repo.ListPublishedPreviewCasesByPalette(palette.ID)
	if err != nil {
		return nil, previewCaseServiceError("list published preview cases", err)
	}
	return buildPublicPaletteDTO(palette, previewCases), nil
}

// Ensure the database connection is available
var _ = database.DB
