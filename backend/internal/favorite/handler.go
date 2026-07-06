package favorite

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
	me := router.Group("/me")
	me.Use(authMiddleware)
	{
		me.GET("/favorites", h.GetFavorites)
		me.POST("/favorites/:paletteId", h.AddFavorite)
		me.DELETE("/favorites/:paletteId", h.RemoveFavorite)
	}
}

// GetFavorites godoc
// @Summary Get user's favorite palettes
// @Description Get all favorite palettes for the authenticated user
// @Tags favorites
// @Produce json
// @Success 200 {object} map[string][]FavoritePalette
// @Router /api/me/favorites [get]
func (h *Handler) GetFavorites(c *gin.Context) {
	userID := authctx.GetUserID(c)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	favorites, err := h.service.GetByUserID(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if favorites == nil {
		favorites = []FavoritePalette{}
	}

	c.JSON(http.StatusOK, gin.H{"favorites": favorites})
}

// AddFavorite godoc
// @Summary Add a palette to favorites
// @Description Add a palette to the authenticated user's favorites
// @Tags favorites
// @Produce json
// @Param paletteId path string true "Palette ID"
// @Success 201 {object} FavoritePalette
// @Router /api/me/favorites/{paletteId} [post]
func (h *Handler) AddFavorite(c *gin.Context) {
	userID := authctx.GetUserID(c)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	paletteID := c.Param("paletteId")
	if paletteID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "palette ID required"})
		return
	}

	favorite, err := h.service.AddFavorite(userID, paletteID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if favorite == nil {
		c.JSON(http.StatusOK, gin.H{"message": "already favorited"})
		return
	}

	c.JSON(http.StatusCreated, favorite)
}

// RemoveFavorite godoc
// @Summary Remove a palette from favorites
// @Description Remove a palette from the authenticated user's favorites
// @Tags favorites
// @Produce json
// @Param paletteId path string true "Palette ID"
// @Success 200 {object} map[string]string
// @Router /api/me/favorites/{paletteId} [delete]
func (h *Handler) RemoveFavorite(c *gin.Context) {
	userID := authctx.GetUserID(c)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	paletteID := c.Param("paletteId")
	if paletteID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "palette ID required"})
		return
	}

	err := h.service.RemoveFavorite(userID, paletteID)
	if err != nil {
		if err.Error() == "favorite not found" {
			c.JSON(http.StatusNotFound, gin.H{"error": "favorite not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "removed from favorites"})
}