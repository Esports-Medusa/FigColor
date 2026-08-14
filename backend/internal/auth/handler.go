package auth

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/qiqi/figcolor/backend/internal/authctx"
)

type limiterEntry struct {
	count int
	reset time.Time
}
type Handler struct {
	service  *Service
	mu       sync.Mutex
	attempts map[string]limiterEntry
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service, attempts: make(map[string]limiterEntry)}
}

func (h *Handler) RegisterRoutes(router *gin.RouterGroup, _ string, authMiddleware gin.HandlerFunc) {
	a := router.Group("/auth")
	a.POST("/register", h.limit("register", 10, time.Hour), h.Register)
	a.POST("/login", h.limit("login", 20, 15*time.Minute), h.Login)
	a.POST("/verify-email", h.limit("verify", 30, time.Hour), h.VerifyEmail)
	a.POST("/resend-verification-email", h.limit("resend", 10, time.Hour), h.ResendVerification)
	a.POST("/forgot-password", h.limit("forgot", 10, time.Hour), h.ForgotPassword)
	a.POST("/reset-password", h.limit("reset", 20, time.Hour), h.ResetPassword)
	p := a.Group("")
	p.Use(authMiddleware)
	p.POST("/logout", h.Logout)
	p.GET("/me", h.GetMe)
	p.POST("/request-password-change", h.RequestPasswordChange)
}
func (h *Handler) limit(scope string, max int, window time.Duration) gin.HandlerFunc {
	return func(c *gin.Context) {
		key := scope + ":" + c.ClientIP()
		now := time.Now()
		h.mu.Lock()
		entry := h.attempts[key]
		if now.After(entry.reset) {
			entry = limiterEntry{reset: now.Add(window)}
		}
		entry.count++
		h.attempts[key] = entry
		h.mu.Unlock()
		if entry.count > max {
			writeError(c, http.StatusTooManyRequests, authError("RATE_LIMITED", "Too many requests. Please try again later."))
			c.Abort()
			return
		}
		c.Next()
	}
}
func bind(c *gin.Context, dst any) bool {
	if err := c.ShouldBindJSON(dst); err != nil {
		writeError(c, http.StatusBadRequest, authError("INVALID_REQUEST", "Please check the submitted fields."))
		return false
	}
	return true
}
func writeError(c *gin.Context, status int, err error) {
	if e, ok := asAuthError(err); ok {
		c.JSON(status, gin.H{"error": gin.H{"code": e.Code, "message": e.Message}})
		return
	}
	c.JSON(http.StatusInternalServerError, gin.H{"error": gin.H{"code": "INTERNAL_ERROR", "message": "Something went wrong."}})
}
func statusFor(err error, fallback int) int {
	if e, ok := asAuthError(err); ok {
		switch e.Code {
		case "INVALID_CREDENTIALS", "CURRENT_PASSWORD_INVALID":
			return http.StatusUnauthorized
		case "EMAIL_NOT_VERIFIED":
			return http.StatusForbidden
		case "EMAIL_ALREADY_REGISTERED":
			return http.StatusConflict
		case "RATE_LIMITED":
			return http.StatusTooManyRequests
		default:
			return http.StatusBadRequest
		}
	}
	return fallback
}

func (h *Handler) Register(c *gin.Context) {
	var req RegisterRequest
	if !bind(c, &req) {
		return
	}
	if err := h.service.Register(&req); err != nil {
		writeError(c, statusFor(err, http.StatusInternalServerError), err)
		return
	}
	c.JSON(http.StatusCreated, MessageResponse{Message: "Account created. Please check your email to verify your account."})
}
func (h *Handler) Login(c *gin.Context) {
	var req LoginRequest
	if !bind(c, &req) {
		return
	}
	resp, err := h.service.Login(&req)
	if err != nil {
		writeError(c, statusFor(err, http.StatusInternalServerError), err)
		return
	}
	c.JSON(http.StatusOK, resp)
}
func (h *Handler) VerifyEmail(c *gin.Context) {
	var req VerifyEmailRequest
	if !bind(c, &req) {
		return
	}
	if err := h.service.VerifyEmail(req.Token); err != nil {
		writeError(c, statusFor(err, http.StatusInternalServerError), err)
		return
	}
	c.JSON(http.StatusOK, MessageResponse{Message: "Email verified. You can now sign in."})
}
func (h *Handler) ResendVerification(c *gin.Context) {
	var req ResendVerificationRequest
	if !bind(c, &req) {
		return
	}
	err := h.service.ResendVerification(req.Email)
	if err != nil {
		if e, ok := asAuthError(err); ok && e.Code == "RATE_LIMITED" {
			writeError(c, http.StatusTooManyRequests, err)
			return
		}
	}
	c.JSON(http.StatusOK, MessageResponse{Message: "If an account exists for this email, a verification email has been sent."})
}
func (h *Handler) ForgotPassword(c *gin.Context) {
	var req ForgotPasswordRequest
	if !bind(c, &req) {
		return
	}
	_ = h.service.ForgotPassword(req.Email)
	c.JSON(http.StatusOK, MessageResponse{Message: publicRecoveryMessage})
}
func (h *Handler) ResetPassword(c *gin.Context) {
	var req ResetPasswordRequest
	if !bind(c, &req) {
		return
	}
	if err := h.service.ResetPassword(&req); err != nil {
		writeError(c, statusFor(err, http.StatusInternalServerError), err)
		return
	}
	c.JSON(http.StatusOK, MessageResponse{Message: "Password reset. Please sign in again."})
}
func (h *Handler) RequestPasswordChange(c *gin.Context) {
	if err := h.service.RequestPasswordChange(authctx.GetUserID(c)); err != nil {
		writeError(c, statusFor(err, http.StatusInternalServerError), err)
		return
	}
	c.JSON(http.StatusOK, MessageResponse{Message: "A password update link has been sent to your email."})
}
func (h *Handler) Logout(c *gin.Context) {
	c.JSON(http.StatusOK, MessageResponse{Message: "Logged out."})
}
func (h *Handler) GetMe(c *gin.Context) {
	u, err := h.service.GetCurrentUser(authctx.GetUserID(c))
	if err != nil || u == nil {
		writeError(c, http.StatusUnauthorized, authError("UNAUTHENTICATED", "Not authenticated."))
		return
	}
	c.JSON(http.StatusOK, u)
}
