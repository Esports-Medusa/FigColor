package palette

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
)

func (h *Handler) ListPreviewCases(c *gin.Context) {
	includeArchived, ok := parseIncludeArchived(c)
	if !ok {
		return
	}

	items, err := h.service.ListPreviewCasesByPalette(previewCasePaletteIDParam(c), includeArchived)
	if err != nil {
		writePreviewCaseError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"items": items,
		"total": len(items),
	})
}

func (h *Handler) GetPreviewCase(c *gin.Context) {
	previewCase, err := h.service.GetPreviewCaseByID(c.Param("id"))
	if err != nil {
		writePreviewCaseError(c, err)
		return
	}
	c.JSON(http.StatusOK, previewCase)
}

func (h *Handler) CreatePreviewCase(c *gin.Context) {
	var req CreatePreviewCaseRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	previewCase, err := h.service.CreatePreviewCase(previewCasePaletteIDParam(c), &req)
	if err != nil {
		writePreviewCaseError(c, err)
		return
	}
	c.JSON(http.StatusCreated, previewCase)
}

func (h *Handler) UpdatePreviewCase(c *gin.Context) {
	var req UpdatePreviewCaseRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	previewCase, err := h.service.UpdatePreviewCase(c.Param("id"), &req)
	if err != nil {
		writePreviewCaseError(c, err)
		return
	}
	c.JSON(http.StatusOK, previewCase)
}

func (h *Handler) DeletePreviewCase(c *gin.Context) {
	if err := h.service.DeleteDraftPreviewCase(c.Param("id")); err != nil {
		writePreviewCaseError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *Handler) PublishPreviewCase(c *gin.Context) {
	previewCase, err := h.service.PublishPreviewCase(c.Param("id"))
	if err != nil {
		writePreviewCaseError(c, err)
		return
	}
	c.JSON(http.StatusOK, previewCase)
}

func (h *Handler) ArchivePreviewCase(c *gin.Context) {
	previewCase, err := h.service.ArchivePreviewCase(c.Param("id"))
	if err != nil {
		writePreviewCaseError(c, err)
		return
	}
	c.JSON(http.StatusOK, previewCase)
}

func (h *Handler) SetPrimaryPreviewCase(c *gin.Context) {
	previewCase, err := h.service.SetPrimaryPreviewCase(c.Param("id"))
	if err != nil {
		writePreviewCaseError(c, err)
		return
	}
	c.JSON(http.StatusOK, previewCase)
}

func parseIncludeArchived(c *gin.Context) (bool, bool) {
	value, exists := c.GetQuery("include_archived")
	if !exists || value == "" || value == "false" {
		return false, true
	}
	if value == "true" {
		return true, true
	}
	c.JSON(http.StatusBadRequest, gin.H{"error": "include_archived must be true or false"})
	return false, false
}

func previewCasePaletteIDParam(c *gin.Context) string {
	if paletteID := c.Param("palette_id"); paletteID != "" {
		return paletteID
	}
	return c.Param("id")
}

func writePreviewCaseError(c *gin.Context, err error) {
	if validationErr, ok := IsValidationError(err); ok {
		c.JSON(http.StatusUnprocessableEntity, gin.H{
			"error":  validationErr.Error(),
			"issues": validationErr.Issues,
		})
		return
	}

	switch {
	case errors.Is(err, ErrPreviewCaseNotFound), errors.Is(err, ErrPaletteNotFound), errors.Is(err, ErrPaletteNotAdminManageable):
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
	case errors.Is(err, ErrInvalidPreviewCaseLifecycleTransition):
		c.JSON(http.StatusConflict, gin.H{"error": "invalid lifecycle transition"})
	case errors.Is(err, ErrPreviewCaseConflict):
		c.JSON(http.StatusConflict, gin.H{"error": "preview case conflict"})
	case errors.Is(err, ErrPreviewCaseValidationFailure):
		c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "validation failed"})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
	}
}
