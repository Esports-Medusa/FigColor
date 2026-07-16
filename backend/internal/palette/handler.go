package palette

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/qiqi/figcolor/backend/internal/authctx"
)

type handlerService interface {
	GetByID(id string) (*Palette, error)
	GetBySlug(slug string) (*Palette, error)
	List(params ListParams) ([]*Palette, int, error)
	GetStats() (*PaletteStats, error)
	Create(req *CreatePaletteRequest, createdBy string) (*Palette, error)
	Update(id string, req *UpdatePaletteRequest) (*Palette, error)
	Publish(id string) (*Palette, error)
	Unpublish(id string) (*Palette, error)
	Archive(id string) (*Palette, error)
	Delete(id string) error
	ListPublic(params ListParams) ([]*PublicPaletteDTO, int, error)
	GetPublicBySlug(slug string) (*PublicPaletteDTO, error)
	GetPublicByID(id string) (*PublicPaletteDTO, error)

	ListPreviewCasesByPalette(paletteID string, includeArchived bool) ([]*PalettePreviewCase, error)
	GetPreviewCaseByID(id string) (*PalettePreviewCase, error)
	CreatePreviewCase(paletteID string, req *CreatePreviewCaseRequest) (*PalettePreviewCase, error)
	UpdatePreviewCase(id string, req *UpdatePreviewCaseRequest) (*PalettePreviewCase, error)
	DeleteDraftPreviewCase(id string) error
	PublishPreviewCase(id string) (*PalettePreviewCase, error)
	ArchivePreviewCase(id string) (*PalettePreviewCase, error)
	SetPrimaryPreviewCase(id string) (*PalettePreviewCase, error)
}

// Handler handles HTTP requests for palette management
type Handler struct {
	service handlerService
}

// NewHandler creates a new palette handler
func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// RegisterRoutes registers the palette routes
func (h *Handler) RegisterRoutes(router *gin.RouterGroup, jwtSecret string, authMiddleware gin.HandlerFunc, adminMiddleware gin.HandlerFunc) {
	// Admin routes (require admin role)
	admin := router.Group("/admin")
	admin.Use(authMiddleware)
	admin.Use(adminMiddleware)
	{
		admin.GET("/stats", h.GetStats)
		palettes := admin.Group("/palettes")
		{
			palettes.GET("", h.List)
			palettes.GET("/:id", h.GetByID)
			palettes.GET("/:id/preview-cases", h.ListPreviewCases)
			palettes.POST("/:id/preview-cases", h.CreatePreviewCase)
			palettes.POST("", h.Create)
			palettes.PATCH("/:id", h.Update)
			palettes.POST("/:id/publish", h.Publish)
			palettes.POST("/:id/unpublish", h.Unpublish)
			palettes.DELETE("/:id", h.Delete)
		}
		previewCases := admin.Group("/preview-cases")
		{
			previewCases.GET("/:id", h.GetPreviewCase)
			previewCases.PATCH("/:id", h.UpdatePreviewCase)
			previewCases.DELETE("/:id", h.DeletePreviewCase)
			previewCases.POST("/:id/publish", h.PublishPreviewCase)
			previewCases.POST("/:id/archive", h.ArchivePreviewCase)
			previewCases.POST("/:id/set-primary", h.SetPrimaryPreviewCase)
		}
	}

	// Public routes (no auth required)
	public := router.Group("/palettes")
	{
		public.GET("", h.ListPublic)
		public.GET("/:slug", h.GetPublicBySlug)
	}
}

// List returns a list of palettes for admin
func (h *Handler) List(c *gin.Context) {
	params := ListParams{
		Status:       c.Query("status"),
		Type:         c.Query("type"),
		ChartType:    c.Query("chart_type"),
		JournalStyle: c.Query("journal_style"),
		Discipline:   c.Query("discipline"),
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	params.Page = page
	params.PageSize = pageSize

	palettes, total, err := h.service.List(params)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"palettes":  palettes,
		"total":     total,
		"page":      page,
		"page_size": pageSize,
	})
}

// GetByID returns a single palette by ID for admin
func (h *Handler) GetByID(c *gin.Context) {
	id := c.Param("id")
	palette, err := h.service.GetByID(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if palette == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "palette not found"})
		return
	}

	c.JSON(http.StatusOK, palette)
}

// Create creates a new palette
func (h *Handler) Create(c *gin.Context) {
	var req CreatePaletteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Get current user ID from context
	userID := authctx.GetUserID(c)

	palette, err := h.service.Create(&req, userID)
	if err != nil {
		if validationErr, ok := IsValidationError(err); ok {
			c.JSON(http.StatusUnprocessableEntity, gin.H{"error": validationErr.Error(), "issues": validationErr.Issues})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, palette)
}

// Update updates an existing palette
func (h *Handler) Update(c *gin.Context) {
	id := c.Param("id")

	var req UpdatePaletteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	palette, err := h.service.Update(id, &req)
	if err != nil {
		if validationErr, ok := IsValidationError(err); ok {
			c.JSON(http.StatusUnprocessableEntity, gin.H{"error": validationErr.Error(), "issues": validationErr.Issues})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, palette)
}

// Publish publishes a palette
func (h *Handler) Publish(c *gin.Context) {
	id := c.Param("id")

	palette, err := h.service.Publish(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, palette)
}

// Unpublish unpublishes a palette
func (h *Handler) Unpublish(c *gin.Context) {
	id := c.Param("id")

	palette, err := h.service.Unpublish(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, palette)
}

// Delete soft-deletes (archives) a palette
func (h *Handler) Delete(c *gin.Context) {
	id := c.Param("id")

	// Archive instead of hard delete (soft delete)
	palette, err := h.service.Archive(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "palette archived", "palette": palette})
}

// ListPublic returns only published palettes for public API
func (h *Handler) ListPublic(c *gin.Context) {
	params := ListParams{
		Page:          1,
		PageSize:      100, // Public API returns more items by default
		PublishedOnly: true,
	}

	// Optional filters for public API
	params.Type = c.Query("type")
	params.ChartType = c.Query("chart_type")
	params.JournalStyle = c.Query("journal_style")
	params.Discipline = c.Query("discipline")

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	params.Page = page
	params.PageSize = pageSize

	palettes, total, err := h.service.ListPublic(params)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"palettes":  palettes,
		"total":     total,
		"page":      page,
		"page_size": pageSize,
	})
}

// GetPublicBySlug returns a published palette by slug for public API
func (h *Handler) GetPublicBySlug(c *gin.Context) {
	slug := c.Param("slug")

	palette, err := h.service.GetPublicBySlug(slug)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "palette not found"})
		return
	}
	if palette == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "palette not found"})
		return
	}

	c.JSON(http.StatusOK, palette)
}

// GetStats returns palette statistics for the admin dashboard
func (h *Handler) GetStats(c *gin.Context) {
	stats, err := h.service.GetStats()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, stats)
}
