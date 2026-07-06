package user

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
	users := router.Group("/users")
	{
		users.GET("/me", authMiddleware, h.GetMe)
		users.PATCH("/me", authMiddleware, h.UpdateMe)
	}
}

// GetMe godoc
// @Summary Get current user
// @Description Get the currently authenticated user's profile
// @Tags users
// @Produce json
// @Success 200 {object} User
// @Router /api/users/me [get]
func (h *Handler) GetMe(c *gin.Context) {
	userID := authctx.GetUserID(c)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	user, err := h.service.GetByID(userID)
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

// UpdateMe godoc
// @Summary Update current user
// @Description Update the currently authenticated user's profile
// @Tags users
// @Accept json
// @Produce json
// @Param request body UpdateUserRequest true "Update details"
// @Success 200 {object} map[string]string
// @Router /api/users/me [patch]
func (h *Handler) UpdateMe(c *gin.Context) {
	userID := authctx.GetUserID(c)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	var req UpdateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Name != nil {
		if err := h.service.UpdateName(userID, req.Name); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	if req.AvatarURL != nil {
		if err := h.service.UpdateAvatar(userID, req.AvatarURL); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "user updated"})
}