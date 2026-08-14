package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"net/url"
	"regexp"
	"strings"
	"time"

	figjwt "github.com/qiqi/figcolor/backend/internal/jwt"
	"github.com/qiqi/figcolor/backend/internal/user"
	"golang.org/x/crypto/bcrypt"
)

const publicRecoveryMessage = "If an account exists for this email, an email has been sent."

var letterPattern = regexp.MustCompile(`[A-Za-z]`)
var numberPattern = regexp.MustCompile(`[0-9]`)

type Service struct {
	userRepo   *user.Repository
	repo       *Repository
	mailer     Mailer
	jwtSecret  string
	jwtExpiry  time.Duration
	bcryptCost int
	appBaseURL string
	verifyTTL  time.Duration
	resetTTL   time.Duration
}

func NewService(userRepo *user.Repository, repo *Repository, mailer Mailer, jwtSecret string, jwtExpiry time.Duration, bcryptCost int, appBaseURL string, verifyTTL, resetTTL time.Duration) *Service {
	return &Service{userRepo: userRepo, repo: repo, mailer: mailer, jwtSecret: jwtSecret, jwtExpiry: jwtExpiry, bcryptCost: bcryptCost, appBaseURL: strings.TrimRight(appBaseURL, "/"), verifyTTL: verifyTTL, resetTTL: resetTTL}
}

func normalizeEmail(value string) string { return strings.ToLower(strings.TrimSpace(value)) }
func validatePassword(password, confirmation string) error {
	if password != confirmation {
		return authError("PASSWORD_MISMATCH", "Passwords do not match.")
	}
	if len(password) < 8 || len(password) > 128 || !letterPattern.MatchString(password) || !numberPattern.MatchString(password) {
		return authError("PASSWORD_INVALID", "Password must be at least 8 characters and contain both letters and numbers.")
	}
	return nil
}
func rawToken() (string, string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", "", err
	}
	raw := base64.RawURLEncoding.EncodeToString(b)
	sum := sha256.Sum256([]byte(raw))
	return raw, hex.EncodeToString(sum[:]), nil
}
func tokenHash(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

func (s *Service) Register(req *RegisterRequest) error {
	req.Email = normalizeEmail(req.Email)
	if err := validatePassword(req.Password, req.ConfirmPassword); err != nil {
		return err
	}
	exists, err := s.userRepo.EmailExists(req.Email)
	if err != nil {
		return err
	}
	if exists {
		return authError("EMAIL_ALREADY_REGISTERED", "An account with this email already exists.")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), s.bcryptCost)
	if err != nil {
		return err
	}
	u, err := s.userRepo.Create(req.Email, string(hash), req.Name)
	if err != nil {
		return err
	}
	return s.sendVerification(u)
}
func (s *Service) sendVerification(u *user.User) error {
	raw, hash, err := rawToken()
	if err != nil {
		return err
	}
	if err = s.repo.ReplaceToken(u.ID, PurposeVerifyEmail, hash, time.Now().Add(s.verifyTTL)); err != nil {
		return err
	}
	link := s.appBaseURL + "/verify-email?token=" + url.QueryEscape(raw)
	return s.mailer.SendVerificationEmail(u.Email, link)
}
func (s *Service) Login(req *LoginRequest) (*AuthResponse, error) {
	req.Email = normalizeEmail(req.Email)
	u, err := s.userRepo.GetByEmail(req.Email)
	if err != nil {
		return nil, err
	}
	if u == nil {
		return nil, authError("INVALID_CREDENTIALS", "Invalid email or password.")
	}
	hash, err := s.userRepo.GetPasswordHashByID(u.ID)
	if err != nil || bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.Password)) != nil {
		return nil, authError("INVALID_CREDENTIALS", "Invalid email or password.")
	}
	if !u.EmailVerified {
		return nil, authError("EMAIL_NOT_VERIFIED", "Please verify your email before signing in.")
	}
	if u.Status != "active" {
		return nil, authError("INVALID_CREDENTIALS", "Invalid email or password.")
	}
	token, err := figjwt.GenerateToken(u.ID, u.Email, u.AuthVersion, s.jwtSecret, s.jwtExpiry)
	if err != nil {
		return nil, err
	}
	return &AuthResponse{User: u, Token: token}, nil
}
func (s *Service) VerifyEmail(raw string) error {
	hash := tokenHash(raw)
	state, err := s.repo.TokenState(hash, PurposeVerifyEmail)
	if err != nil {
		return err
	}
	if state != "valid" {
		return tokenStateError(state)
	}
	_, err = s.repo.ConsumeVerification(hash)
	if err == sql.ErrNoRows {
		return authError("TOKEN_INVALID", "This verification link is invalid.")
	}
	return err
}
func tokenStateError(state string) error {
	switch state {
	case "expired":
		return authError("TOKEN_EXPIRED", "This link has expired.")
	case "consumed":
		return authError("TOKEN_CONSUMED", "This link has already been used.")
	default:
		return authError("TOKEN_INVALID", "This link is invalid.")
	}
}
func (s *Service) ResendVerification(email string) error {
	u, err := s.userRepo.GetByEmail(normalizeEmail(email))
	if err != nil || u == nil || u.EmailVerified {
		return err
	}
	last, err := s.repo.LastTokenCreatedAt(u.ID, PurposeVerifyEmail)
	if err != nil {
		return err
	}
	if last != nil && time.Since(*last) < time.Minute {
		return authError("RATE_LIMITED", "Please wait before requesting another email.")
	}
	return s.sendVerification(u)
}
func (s *Service) ForgotPassword(email string) error {
	u, err := s.userRepo.GetByEmail(normalizeEmail(email))
	if err != nil || u == nil || !u.EmailVerified {
		return err
	}
	last, err := s.repo.LastTokenCreatedAt(u.ID, PurposeResetPassword)
	if err != nil {
		return err
	}
	if last != nil && time.Since(*last) < time.Minute {
		return nil
	}
	raw, hash, err := rawToken()
	if err != nil {
		return err
	}
	if err = s.repo.ReplaceToken(u.ID, PurposeResetPassword, hash, time.Now().Add(s.resetTTL)); err != nil {
		return err
	}
	return s.mailer.SendPasswordResetEmail(u.Email, s.appBaseURL+"/reset-password?token="+url.QueryEscape(raw))
}

func (s *Service) RequestPasswordChange(userID string) error {
	u, err := s.userRepo.GetByID(userID)
	if err != nil {
		return err
	}
	if u == nil || !u.EmailVerified {
		return authError("UNAUTHENTICATED", "Not authenticated.")
	}
	last, err := s.repo.LastTokenCreatedAt(u.ID, PurposeResetPassword)
	if err != nil {
		return err
	}
	if last != nil && time.Since(*last) < time.Minute {
		return authError("RATE_LIMITED", "Please wait before requesting another email.")
	}
	raw, hash, err := rawToken()
	if err != nil {
		return err
	}
	if err = s.repo.ReplaceToken(u.ID, PurposeResetPassword, hash, time.Now().Add(s.resetTTL)); err != nil {
		return err
	}
	return s.mailer.SendPasswordResetEmail(u.Email, s.appBaseURL+"/reset-password?token="+url.QueryEscape(raw))
}
func (s *Service) ResetPassword(req *ResetPasswordRequest) error {
	if err := validatePassword(req.NewPassword, req.ConfirmPassword); err != nil {
		return err
	}
	hashToken := tokenHash(req.Token)
	state, err := s.repo.TokenState(hashToken, PurposeResetPassword)
	if err != nil {
		return err
	}
	if state != "valid" {
		return tokenStateError(state)
	}
	userID, err := s.repo.ValidTokenUser(hashToken, PurposeResetPassword)
	if err != nil {
		return authError("TOKEN_INVALID", "This reset link is invalid.")
	}
	current, err := s.userRepo.GetPasswordHashByID(userID)
	if err != nil {
		return err
	}
	if bcrypt.CompareHashAndPassword([]byte(current), []byte(req.NewPassword)) == nil {
		return authError("PASSWORD_REUSED", "New password must be different from the current password.")
	}
	err = func() error { // compare before consuming
		newHash, e := bcrypt.GenerateFromPassword([]byte(req.NewPassword), s.bcryptCost)
		if e != nil {
			return e
		}
		_, e = s.repo.ConsumeReset(hashToken, string(newHash))
		return e
	}()
	if err == sql.ErrNoRows {
		return authError("TOKEN_INVALID", "This reset link is invalid.")
	}
	if err != nil {
		return err
	}
	email, err := s.repo.UserEmail(userID)
	if err == nil {
		_ = s.mailer.SendPasswordChangedEmail(email)
	}
	return nil
}
func (s *Service) GetCurrentUser(id string) (*user.User, error) { return s.userRepo.GetByID(id) }
