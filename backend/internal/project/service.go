package project

import (
	"fmt"
	"net/http"
	"regexp"
	"strings"

	palettepkg "github.com/qiqi/figcolor/backend/internal/palette"
)

var projectHexColorPattern = regexp.MustCompile(`^#[0-9A-Fa-f]{6}$`)

type Service struct {
	repo *Repository
}

type RequestError struct {
	Status  int
	Message string
}

func (e *RequestError) Error() string {
	return e.Message
}

func newRequestError(status int, message string) error {
	return &RequestError{Status: status, Message: message}
}

func statusFromProjectError(err error) int {
	if requestErr, ok := err.(*RequestError); ok {
		return requestErr.Status
	}
	switch err.Error() {
	case "project not found", "figure not found":
		return http.StatusNotFound
	case "access denied":
		return http.StatusNotFound
	default:
		return http.StatusInternalServerError
	}
}

func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

func (s *Service) CreateProject(userID string, req CreateProjectRequest) (*PaperProject, error) {
	if req.Name == "" {
		return nil, fmt.Errorf("project name is required")
	}
	return s.repo.CreateProject(userID, req.Name, req.Description)
}

func (s *Service) GetProjectsByUserID(userID string) ([]PaperProject, error) {
	return s.repo.GetProjectsByUserID(userID)
}

func (s *Service) GetProjectByID(projectID, userID string) (*PaperProject, error) {
	project, err := s.repo.GetProjectByIDForUser(projectID, userID)
	if err != nil {
		return nil, err
	}
	if project == nil {
		return nil, fmt.Errorf("project not found")
	}
	return project, nil
}

func (s *Service) UpdateProject(projectID, userID string, req UpdateProjectRequest) error {
	if err := s.repo.UpdateProjectForUser(projectID, userID, req.Name, req.Description); err != nil {
		return err
	}
	return nil
}

func (s *Service) DeleteProject(projectID, userID string) error {
	if err := s.repo.DeleteProjectForUser(projectID, userID); err != nil {
		return err
	}
	return nil
}

func (s *Service) GetProjectDetail(projectID, userID string) (*ProjectDetailResponse, error) {
	project, err := s.GetProjectByID(projectID, userID)
	if err != nil {
		return nil, err
	}

	palettes, err := s.repo.GetProjectPalettes(projectID)
	if err != nil {
		return nil, err
	}

	var rolesMap = make(map[string][]PaletteRole)
	for _, palette := range palettes {
		roles, err := s.repo.GetPaletteRoles(palette.ID)
		if err != nil {
			return nil, err
		}
		rolesMap[palette.ID] = roles
	}

	for i := range palettes {
		if r, ok := rolesMap[palettes[i].ID]; ok {
			palettes[i].Roles = r
		}
	}
	if err := attachProjectPalettePreviews(palettes, userID); err != nil {
		return nil, err
	}

	figures, err := s.repo.GetFigures(projectID)
	if err != nil {
		return nil, err
	}
	if err := s.attachSelectedRoleKeys(figures); err != nil {
		return nil, err
	}

	return &ProjectDetailResponse{
		Project:  project,
		Palettes: palettes,
		Figures:  figures,
	}, nil
}

func attachProjectPalettePreviews(projectPalettes []ProjectPalette, userID string) error {
	repo := palettepkg.NewRepository()
	for i := range projectPalettes {
		basePaletteID := projectPalettes[i].BasePaletteID
		if basePaletteID == nil || *basePaletteID == "" {
			continue
		}
		basePalette, err := repo.GetByID(*basePaletteID)
		if err != nil {
			return err
		}
		if basePalette == nil ||
			!((basePalette.Visibility == "public" && basePalette.OwnerUserID == nil) ||
				(basePalette.OwnerUserID != nil && *basePalette.OwnerUserID == userID)) {
			continue
		}

		var primary *palettepkg.PublicPalettePreviewCase
		previewCase, err := repo.GetPrimaryPublishedPreviewByPalette(*basePaletteID)
		if err != nil && err != palettepkg.ErrPreviewCaseNotFound {
			return err
		}
		if previewCase != nil {
			primary = &palettepkg.PublicPalettePreviewCase{
				ID: previewCase.ID, PaletteID: previewCase.PaletteID,
				ChartType: previewCase.ChartType, TemplateID: previewCase.TemplateID,
				TemplateVersion: previewCase.TemplateVersion, SchemaVersion: previewCase.SchemaVersion,
				ColorRoles: previewCase.ColorRoles, PreviewConfig: previewCase.PreviewConfig,
				SeedStrategy: previewCase.SeedStrategy, SeedValue: previewCase.SeedValue,
				IsPrimary: previewCase.IsPrimary, Status: previewCase.Status,
			}
		}
		projectPalettes[i].PreviewPalette = &ProjectPalettePreview{
			Palette: *basePalette, PrimaryPreviewCase: primary,
		}
	}
	return nil
}

func (s *Service) GetProjects() ([]PaperProject, error) {
	return s.repo.GetPublicProjects()
}

func (s *Service) GetProjectByIDOnly(projectID string) (*PaperProject, error) {
	return s.repo.GetPublicProjectByID(projectID)
}

func (s *Service) GetPublicProjectDetail(projectID string) (*ProjectDetailResponse, error) {
	project, err := s.repo.GetPublicProjectByID(projectID)
	if err != nil {
		return nil, err
	}
	if project == nil {
		return nil, fmt.Errorf("project not found")
	}

	palettes, err := s.repo.GetProjectPalettes(projectID)
	if err != nil {
		return nil, err
	}
	for i := range palettes {
		roles, err := s.repo.GetPaletteRoles(palettes[i].ID)
		if err != nil {
			return nil, err
		}
		palettes[i].Roles = roles
	}
	figures, err := s.repo.GetFigures(projectID)
	if err != nil {
		return nil, err
	}
	if err := s.attachSelectedRoleKeys(figures); err != nil {
		return nil, err
	}
	return &ProjectDetailResponse{Project: project, Palettes: palettes, Figures: figures}, nil
}

func (s *Service) UpdateProjectOnly(projectID string, req UpdateProjectRequest) error {
	return s.repo.UpdateProject(projectID, req.Name, req.Description)
}

func (s *Service) DeleteProjectOnly(projectID string) error {
	return s.repo.DeleteProject(projectID)
}

func (s *Service) assertProjectOwner(projectID, userID string) error {
	project, err := s.repo.GetProjectByIDForUser(projectID, userID)
	if err != nil {
		return err
	}
	if project == nil {
		return fmt.Errorf("project not found")
	}
	return nil
}

// Figure operations
func (s *Service) GetFigures(projectID string) ([]FigureAssignment, error) {
	figures, err := s.repo.GetFigures(projectID)
	if err != nil {
		return nil, err
	}
	if err := s.attachSelectedRoleKeys(figures); err != nil {
		return nil, err
	}
	return figures, nil
}

func (s *Service) CreateFigure(projectID string, req CreateFigureRequest) (*FigureAssignment, error) {
	if strings.TrimSpace(req.Name) == "" {
		return nil, newRequestError(http.StatusBadRequest, "figure name is required")
	}
	if strings.TrimSpace(req.ChartType) == "" {
		return nil, newRequestError(http.StatusBadRequest, "chartType is required")
	}
	if strings.TrimSpace(req.PaletteID) == "" {
		return nil, newRequestError(http.StatusBadRequest, "paletteId is required")
	}
	if len(req.SelectedRoleKeys) == 0 {
		return nil, newRequestError(http.StatusUnprocessableEntity, "select at least one palette role")
	}

	basePaletteExists, err := s.repo.PaletteExists(req.PaletteID)
	if err != nil {
		return nil, err
	}

	projectPaletteByBase, err := s.repo.GetProjectPaletteByBasePaletteID(projectID, req.PaletteID)
	if err != nil {
		return nil, err
	}
	projectPaletteByID, err := s.repo.GetProjectPaletteByID(projectID, req.PaletteID)
	if err != nil {
		return nil, err
	}

	projectPalette, err := validateFigurePaletteSelection(basePaletteExists, projectPaletteByBase, projectPaletteByID)
	if err != nil {
		return nil, err
	}

	roles, err := s.repo.GetPaletteRoles(projectPalette.ID)
	if err != nil {
		return nil, err
	}
	roleKeys := make(map[string]bool, len(roles))
	for _, role := range roles {
		roleKeys[role.Key] = true
	}
	for _, selectedKey := range req.SelectedRoleKeys {
		if !roleKeys[selectedKey] {
			return nil, newRequestError(http.StatusUnprocessableEntity, fmt.Sprintf("selected role %q is not available for this palette", selectedKey))
		}
	}

	return s.repo.CreateFigure(projectID, req)
}

func validateFigurePaletteSelection(basePaletteExists bool, projectPaletteByBase *projectPaletteLookup, projectPaletteByID *projectPaletteLookup) (*projectPaletteLookup, error) {
	if projectPaletteByBase != nil {
		if !basePaletteExists {
			return nil, newRequestError(http.StatusNotFound, "palette not found")
		}
		return projectPaletteByBase, nil
	}
	if projectPaletteByID != nil {
		if projectPaletteByID.BasePaletteID == nil || *projectPaletteByID.BasePaletteID == "" {
			return nil, newRequestError(http.StatusUnprocessableEntity, "project palette has no basePaletteId; custom project palettes cannot be used for figures yet")
		}
		return nil, newRequestError(http.StatusUnprocessableEntity, "paletteId must be the basePaletteId for the selected project palette")
	}
	if !basePaletteExists {
		return nil, newRequestError(http.StatusNotFound, "palette not found")
	}
	return nil, newRequestError(http.StatusUnprocessableEntity, "palette is not available in this project")
}

func (s *Service) CreateProjectPalette(projectID string, userID string, req CreateProjectPaletteRequest) (*ProjectPalette, error) {
	if req.BasePaletteID == nil || strings.TrimSpace(*req.BasePaletteID) == "" {
		return nil, newRequestError(http.StatusUnprocessableEntity, "basePaletteId is required; custom project palettes are not supported yet")
	}
	projectPalette, err := s.repo.CreateProjectPalette(projectID, userID, req)
	if err != nil {
		return nil, err
	}
	projectPalettes := []ProjectPalette{*projectPalette}
	if err := attachProjectPalettePreviews(projectPalettes, userID); err != nil {
		return nil, err
	}
	return &projectPalettes[0], nil
}

func (s *Service) UpdateProjectPalette(projectID, userID, paletteID string, req UpdateProjectPaletteRequest) (*ProjectPalette, error) {
	if strings.TrimSpace(req.Name) == "" {
		return nil, newRequestError(http.StatusUnprocessableEntity, "palette name is required")
	}
	if len(req.Roles) < 2 {
		return nil, newRequestError(http.StatusUnprocessableEntity, "a project palette must contain at least two roles")
	}
	keys := make(map[string]bool, len(req.Roles))
	for _, role := range req.Roles {
		if strings.TrimSpace(role.Key) == "" || strings.TrimSpace(role.Label) == "" {
			return nil, newRequestError(http.StatusUnprocessableEntity, "role key and label are required")
		}
		if keys[role.Key] {
			return nil, newRequestError(http.StatusUnprocessableEntity, fmt.Sprintf("duplicate role key %q", role.Key))
		}
		keys[role.Key] = true
		if !projectHexColorPattern.MatchString(role.Color) {
			return nil, newRequestError(http.StatusUnprocessableEntity, fmt.Sprintf("invalid color for role %q", role.Key))
		}
		switch role.RoleType {
		case "semantic", "group", "ui", "custom":
		default:
			return nil, newRequestError(http.StatusUnprocessableEntity, fmt.Sprintf("invalid role type for %q", role.Key))
		}
	}
	palette, err := s.repo.UpdateProjectPalette(projectID, userID, paletteID, req)
	if err != nil {
		return nil, err
	}
	projectPalettes := []ProjectPalette{*palette}
	if err := attachProjectPalettePreviews(projectPalettes, userID); err != nil {
		return nil, err
	}
	return &projectPalettes[0], nil
}

func (s *Service) attachSelectedRoleKeys(figures []FigureAssignment) error {
	for index := range figures {
		keys, err := s.repo.GetFigureSelectedRoles(figures[index].ID)
		if err != nil {
			return err
		}
		figures[index].SelectedRoleKeys = keys
	}
	return nil
}

func (s *Service) UpdateFigure(projectID, figureID string, req UpdateFigureRequest) error {
	figure, err := s.repo.GetFigureByProjectID(projectID, figureID)
	if err != nil {
		return err
	}
	if figure == nil {
		return fmt.Errorf("figure not found")
	}
	paletteID := figure.PaletteID
	if req.PaletteID != nil {
		paletteID = *req.PaletteID
	}
	if req.PaletteID != nil || req.SelectedRoleKeys != nil {
		if err := s.validateProjectFigurePalette(projectID, paletteID, req.SelectedRoleKeys); err != nil {
			return err
		}
	}
	return s.repo.UpdateFigureForProject(projectID, figureID, req)
}

func (s *Service) DeleteFigure(projectID, figureID string) error {
	return s.repo.DeleteFigureForProject(projectID, figureID)
}

func (s *Service) UpdateRoleColor(projectID, paletteID, roleID string, color string) error {
	return s.repo.UpdateRoleColorForProject(projectID, paletteID, roleID, color)
}

func (s *Service) validateProjectFigurePalette(projectID string, paletteID string, selectedRoleKeys []string) error {
	basePaletteExists, err := s.repo.PaletteExists(paletteID)
	if err != nil {
		return err
	}
	projectPaletteByBase, err := s.repo.GetProjectPaletteByBasePaletteID(projectID, paletteID)
	if err != nil {
		return err
	}
	projectPaletteByID, err := s.repo.GetProjectPaletteByID(projectID, paletteID)
	if err != nil {
		return err
	}
	projectPalette, err := validateFigurePaletteSelection(basePaletteExists, projectPaletteByBase, projectPaletteByID)
	if err != nil {
		return err
	}
	if selectedRoleKeys == nil {
		return nil
	}
	if len(selectedRoleKeys) == 0 {
		return newRequestError(http.StatusUnprocessableEntity, "select at least one palette role")
	}
	roles, err := s.repo.GetPaletteRoles(projectPalette.ID)
	if err != nil {
		return err
	}
	roleKeys := make(map[string]bool, len(roles))
	for _, role := range roles {
		roleKeys[role.Key] = true
	}
	for _, selectedKey := range selectedRoleKeys {
		if !roleKeys[selectedKey] {
			return newRequestError(http.StatusUnprocessableEntity, fmt.Sprintf("selected role %q is not available for this palette", selectedKey))
		}
	}
	return nil
}
