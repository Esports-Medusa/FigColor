package auth

import (
	"time"

	"github.com/qiqi/figcolor/backend/internal/user"
)

type RegisterRequest struct {
	Email    string  `json:"email" binding:"required,email"`
	Password string  `json:"password" binding:"required,min=8"`
	Name     *string `json:"name,omitempty"`
}

type LoginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

type AuthResponse struct {
	User  *user.User `json:"user"`
	Token string     `json:"token"`
}

type CurrentUser struct {
	ID            string    `json:"id"`
	Email         string    `json:"email"`
	Name          *string   `json:"name,omitempty"`
	EmailVerified bool      `json:"emailVerified"`
	AvatarURL     *string   `json:"avatarUrl,omitempty"`
	Status        string    `json:"status"`
	CreatedAt     time.Time `json:"createdAt"`
}

func ToCurrentUser(u *user.User) *CurrentUser {
	return &CurrentUser{
		ID:            u.ID,
		Email:         u.Email,
		Name:          u.Name,
		EmailVerified: u.EmailVerified,
		AvatarURL:     u.AvatarURL,
		Status:        u.Status,
		CreatedAt:     u.CreatedAt,
	}
}

// WeChat OAuth placeholder interfaces (for future implementation)
type WeChatLoginRequest struct {
	Code string `json:"code"`
}

type WeChatBindRequest struct {
	Code string `json:"code"`
}

type VerifyEmailRequest struct {
	Token string `json:"token" binding:"required"`
}

type ResendVerificationRequest struct {
	Email string `json:"email" binding:"required,email"`
}

type ForgotPasswordRequest struct {
	Email string `json:"email" binding:"required,email"`
}

type ResetPasswordRequest struct {
	Token       string `json:"token" binding:"required"`
	NewPassword string `json:"newPassword" binding:"required,min=8"`
}