package user

import (
	"errors"
	"fmt"

	"golang.org/x/crypto/bcrypt"
)

type Service struct {
	repo      *Repository
	bcryptCost int
}

func NewService(repo *Repository, bcryptCost int) *Service {
	return &Service{
		repo:        repo,
		bcryptCost: bcryptCost,
	}
}

func (s *Service) GetByID(id string) (*User, error) {
	return s.repo.GetByID(id)
}

func (s *Service) GetByEmail(email string) (*User, error) {
	return s.repo.GetByEmail(email)
}

func (s *Service) Create(email, password string, name *string) (*User, error) {
	// Check if email already exists
	exists, err := s.repo.EmailExists(email)
	if err != nil {
		return nil, err
	}
	if exists {
		return nil, errors.New("email already registered")
	}

	// Hash password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), s.bcryptCost)
	if err != nil {
		return nil, fmt.Errorf("failed to hash password: %w", err)
	}

	return s.repo.Create(email, string(hashedPassword), name)
}

func (s *Service) CheckPassword(user *User, password string) bool {
	// This assumes the user repo can fetch password_hash
	// For now, we need to get the password hash separately
	// We'll handle this via auth service
	return false
}

func (s *Service) UpdateName(userID string, name *string) error {
	return s.repo.UpdateName(userID, name)
}

func (s *Service) UpdateAvatar(userID string, avatarURL *string) error {
	return s.repo.UpdateAvatar(userID, avatarURL)
}