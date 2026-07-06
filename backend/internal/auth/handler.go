package auth

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/qiqi/figcolor/backend/internal/authctx"
)

type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

func (h *Handler) RegisterRoutes(router *gin.RouterGroup, jwtSecret string, authMiddleware gin.HandlerFunc) {
	auth := router.Group("/auth")
	{
		// Public routes
		auth.POST("/register", h.Register)
		auth.POST("/login", h.Login)

		// Protected routes with auth middleware
		protected := auth.Group("")
		protected.Use(authMiddleware)
		{
			protected.POST("/logout", h.Logout)
			protected.GET("/me", h.GetMe)
		}
	}

	// Placeholder routes for future wechat auth (framework only, not implemented)
	{
		// WeChat OAuth placeholder endpoints
		auth.GET("/wechat/login", h.WeChatLoginPlaceholder)
		auth.GET("/wechat/callback", h.WeChatCallbackPlaceholder)
		auth.POST("/wechat/bind", h.WeChatBindPlaceholder)
		auth.POST("/wechat/unbind", h.WeChatUnbindPlaceholder)

		// Email verification placeholder endpoints
		auth.POST("/verify-email", h.VerifyEmailPlaceholder)
		auth.POST("/resend-verification-email", h.ResendVerificationPlaceholder)
		auth.POST("/forgot-password", h.ForgotPasswordPlaceholder)
		auth.POST("/reset-password", h.ResetPasswordPlaceholder)
	}
}

// Register godoc
// @Summary Register a new user
// @Description Create a new user account with email and password
// @Tags auth
// @Accept json
// @Produce json
// @Param request body RegisterRequest true "Registration details"
// @Success 201 {object} AuthResponse
// @Router /api/auth/register [post]
func (h *Handler) Register(c *gin.Context) {
	var req RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	resp, err := h.service.Register(&req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, resp)
}

// Login godoc
// @Summary Login user
// @Description Authenticate user with email and password
// @Tags auth
// @Accept json
// @Produce json
// @Param request body LoginRequest true "Login credentials"
// @Success 200 {object} AuthResponse
// @Router /api/auth/login [post]
func (h *Handler) Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	resp, err := h.service.Login(&req)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, resp)
}

// Logout godoc
// @Summary Logout user
// @Description Logout current user (client should discard token)
// @Tags auth
// @Produce json
// @Success 200 {object} map[string]string
// @Router /api/auth/logout [post]
func (h *Handler) Logout(c *gin.Context) {
	// For JWT-based auth, logout is handled client-side
	// Server just returns success
	c.JSON(http.StatusOK, gin.H{"message": "logged out"})
}

// GetMe godoc
// @Summary Get current user
// @Description Get the currently authenticated user's profile
// @Tags auth
// @Produce json
// @Success 200 {object} user.User
// @Router /api/auth/me [get]
func (h *Handler) GetMe(c *gin.Context) {
	userID := authctx.GetUserID(c)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	user, err := h.service.GetCurrentUser(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if user == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	c.JSON(http.StatusOK, user)
}

// Placeholder handlers for future implementations

func (h *Handler) WeChatLoginPlaceholder(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, gin.H{"error": "wechat login not implemented"})
}

func (h *Handler) WeChatCallbackPlaceholder(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, gin.H{"error": "wechat callback not implemented"})
}

func (h *Handler) WeChatBindPlaceholder(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, gin.H{"error": "wechat bind not implemented"})
}

func (h *Handler) WeChatUnbindPlaceholder(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, gin.H{"error": "wechat unbind not implemented"})
}

func (h *Handler) VerifyEmailPlaceholder(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, gin.H{"error": "email verification not implemented"})
}

func (h *Handler) ResendVerificationPlaceholder(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, gin.H{"error": "resend verification email not implemented"})
}

func (h *Handler) ForgotPasswordPlaceholder(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, gin.H{"error": "forgot password not implemented"})
}

func (h *Handler) ResetPasswordPlaceholder(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, gin.H{"error": "reset password not implemented"})
}