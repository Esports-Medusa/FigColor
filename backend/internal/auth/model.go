package auth

import "github.com/qiqi/figcolor/backend/internal/user"

type RegisterRequest struct {
	Email           string  `json:"email" binding:"required,email"`
	Password        string  `json:"password" binding:"required"`
	ConfirmPassword string  `json:"confirmPassword" binding:"required"`
	Name            *string `json:"name,omitempty"`
}
type LoginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
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
	Token           string `json:"token" binding:"required"`
	NewPassword     string `json:"newPassword" binding:"required"`
	ConfirmPassword string `json:"confirmPassword" binding:"required"`
}
type AuthResponse struct {
	User  *user.User `json:"user"`
	Token string     `json:"token"`
}
type MessageResponse struct {
	Message string `json:"message"`
}
