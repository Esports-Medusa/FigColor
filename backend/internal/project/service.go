package project

import (
	"fmt"
)

type Service struct {
	repo *Repository
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
	project, err := s.repo.GetProjectByID(projectID)
	if err != nil {
		return nil, err
	}
	if project == nil {
		return nil, fmt.Errorf("project not found")
	}
	// Check ownership
	if project.UserID != nil && *project.UserID != userID {
		return nil, fmt.Errorf("access denied")
	}
	return project, nil
}

func (s *Service) UpdateProject(projectID, userID string, req UpdateProjectRequest) error {
	// Check ownership first
	project, err := s.repo.GetProjectByID(projectID)
	if err != nil {
		return err
	}
	if project == nil {
		return fmt.Errorf("project not found")
	}
	if project.UserID != nil && *project.UserID != userID {
		return fmt.Errorf("access denied")
	}
	return s.repo.UpdateProject(projectID, req.Name, req.Description)
}

func (s *Service) DeleteProject(projectID, userID string) error {
	// Check ownership first
	project, err := s.repo.GetProjectByID(projectID)
	if err != nil {
		return err
	}
	if project == nil {
		return fmt.Errorf("project not found")
	}
	if project.UserID != nil && *project.UserID != userID {
		return fmt.Errorf("access denied")
	}
	return s.repo.DeleteProject(projectID)
}

func (s *Service) GetProjectDetail(projectID, userID string) (*ProjectDetailResponse, error) {
	// Check ownership
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

	// Assign roles to palettes
	for i := range palettes {
		if r, ok := rolesMap[palettes[i].ID]; ok {
			palettes[i].Roles = r
		}
	}

	figures, err := s.repo.GetFigures(projectID)
	if err != nil {
		return nil, err
	}

	return &ProjectDetailResponse{
		Project:  project,
		Palettes: palettes,
		Figures:  figures,
	}, nil
}

func (s *Service) GetProjects() ([]PaperProject, error) {
	return s.repo.GetProjects()
}

func (s *Service) GetProjectByIDOnly(projectID string) (*PaperProject, error) {
	return s.repo.GetProjectByID(projectID)
}

func (s *Service) UpdateProjectOnly(projectID string, req UpdateProjectRequest) error {
	return s.repo.UpdateProject(projectID, req.Name, req.Description)
}

func (s *Service) DeleteProjectOnly(projectID string) error {
	return s.repo.DeleteProject(projectID)
}

// Figure operations
func (s *Service) GetFigures(projectID string) ([]FigureAssignment, error) {
	return s.repo.GetFigures(projectID)
}

func (s *Service) CreateFigure(projectID string, req CreateFigureRequest) (*FigureAssignment, error) {
	return s.repo.CreateFigure(projectID, req)
}

func (s *Service) UpdateFigure(figureID string, req UpdateFigureRequest) error {
	figure, err := s.repo.GetFigureByID(figureID)
	if err != nil {
		return err
	}
	if figure == nil {
		return fmt.Errorf("figure not found")
	}
	return s.repo.UpdateFigure(figureID, req)
}

func (s *Service) DeleteFigure(figureID string) error {
	figure, err := s.repo.GetFigureByID(figureID)
	if err != nil {
		return err
	}
	if figure == nil {
		return fmt.Errorf("figure not found")
	}
	return s.repo.DeleteFigure(figureID)
}

func (s *Service) UpdateRoleColor(roleID string, color string) error {
	return s.repo.UpdateRoleColor(roleID, color)
}