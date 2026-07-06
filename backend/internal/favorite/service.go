package favorite

type Service struct {
	repo *Repository
}

func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

func (s *Service) GetByUserID(userID string) ([]FavoritePalette, error) {
	return s.repo.GetByUserID(userID)
}

func (s *Service) AddFavorite(userID, paletteID string) (*FavoritePalette, error) {
	// Check if already favorited
	exists, err := s.repo.Exists(userID, paletteID)
	if err != nil {
		return nil, err
	}
	if exists {
		return nil, nil // Already favorited
	}

	return s.repo.Create(userID, paletteID)
}

func (s *Service) RemoveFavorite(userID, paletteID string) error {
	return s.repo.Delete(userID, paletteID)
}

func (s *Service) IsFavorited(userID, paletteID string) (bool, error) {
	return s.repo.Exists(userID, paletteID)
}