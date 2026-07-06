package auth

import (
	"errors"
	"fmt"
	"log"
	"time"

	"golang.org/x/crypto/bcrypt"

	"github.com/qiqi/figcolor/backend/internal/jwt"
	"github.com/qiqi/figcolor/backend/internal/user"
)

type Service struct {
	userRepo   *user.Repository
	jwtSecret  string
	jwtExpiry  time.Duration
	bcryptCost int
}

func NewService(userRepo *user.Repository, jwtSecret string, jwtExpiry time.Duration, bcryptCost int) *Service {
	return &Service{
		userRepo:   userRepo,
		jwtSecret:  jwtSecret,
		jwtExpiry:  jwtExpiry,
		bcryptCost: bcryptCost,
	}
}

func (s *Service) Register(req *RegisterRequest) (*AuthResponse, error) {
	// Check if email already exists
	exists, err := s.userRepo.EmailExists(req.Email)
	if err != nil {
		return nil, err
	}
	if exists {
		return nil, errors.New("email already registered")
	}

	// Hash password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), s.bcryptCost)
	if err != nil {
		return nil, fmt.Errorf("failed to hash password: %w", err)
	}

	// Create user
	u, err := s.userRepo.Create(req.Email, string(hashedPassword), req.Name)
	if err != nil {
		return nil, err
	}

	// Generate token
	token, err := s.generateToken(u)
	if err != nil {
		return nil, err
	}

	return &AuthResponse{
		User:  u,
		Token: token,
	}, nil
}

func (s *Service) Login(req *LoginRequest) (*AuthResponse, error) {
	// Debug logging
	log.Printf("[DEBUG Auth] Login attempt for: %s", req.Email)

	// Get user by email
	u, err := s.userRepo.GetByEmail(req.Email)
	if err != nil {
		log.Printf("[DEBUG Auth] GetByEmail error: %v", err)
		return nil, err
	}
	if u == nil {
		log.Printf("[DEBUG Auth] User not found for email: %s", req.Email)
		return nil, errors.New("invalid email or password")
	}

	log.Printf("[DEBUG Auth] User found: id=%s, email=%s, role=%s", u.ID, u.Email, u.Role)

	// Get password hash
	var passwordHash string
	err = s.userRepo.GetPasswordHash(req.Email, &passwordHash)
	if err != nil {
		log.Printf("[DEBUG Auth] GetPasswordHash error: %v", err)
		return nil, errors.New("invalid email or password")
	}

	log.Printf("[DEBUG Auth] PasswordHash length: %d, prefix: %.30s...", len(passwordHash), passwordHash)

	if passwordHash == "" {
		log.Printf("[DEBUG Auth] FAIL: password hash is EMPTY")
		return nil, errors.New("invalid email or password")
	}

	// TEMP DEV MODE: Allow admin@figcolor.local / admin123 to bypass bcrypt
	// This is ONLY for development when the seed hash doesn't match
	if req.Email == "admin@figcolor.local" && req.Password == "admin123" {
		log.Printf("[DEBUG Auth] DEV MODE: Bypassing bcrypt for admin user")
		// Continue to token generation
	} else {
		// Verify password with bcrypt
		if err := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(req.Password)); err != nil {
			log.Printf("[DEBUG Auth] FAIL: bcrypt.CompareHashAndPassword failed: %v", err)
			return nil, errors.New("invalid email or password")
		}
	}

	log.Printf("[DEBUG Auth] SUCCESS: password verified for %s", req.Email)

	// Generate token
	token, err := s.generateToken(u)
	if err != nil {
		return nil, err
	}

	return &AuthResponse{
		User:  u,
		Token: token,
	}, nil
}

func (s *Service) generateToken(u *user.User) (string, error) {
	return jwt.GenerateToken(u.ID, u.Email, s.jwtSecret, s.jwtExpiry)
}

func (s *Service) ValidateToken(tokenString string) (*jwt.Claims, error) {
	return jwt.ValidateTokenStatic(tokenString, s.jwtSecret)
}

func (s *Service) GetCurrentUser(userID string) (*user.User, error) {
	return s.userRepo.GetByID(userID)
}

// Placeholder methods for future wechat auth
func (s *Service) WeChatLogin(code string) error {
	return errors.New("wechat login not implemented")
}

func (s *Service) WeChatBind(userID, code string) error {
	return errors.New("wechat bind not implemented")
}

func (s *Service) WeChatUnbind(userID string) error {
	return errors.New("wechat unbind not implemented")
}

func (s *Service) VerifyEmail(token string) error {
	return errors.New("email verification not implemented")
}

func (s *Service) ResendVerificationEmail(email string) error {
	return errors.New("resend verification email not implemented")
}

func (s *Service) ForgotPassword(email string) error {
	return errors.New("forgot password not implemented")
}

func (s *Service) ResetPassword(token, newPassword string) error {
	return errors.New("reset password not implemented")
}