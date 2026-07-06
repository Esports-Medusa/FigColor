package project

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
	// Public routes (no auth for browsing)
	router.GET("/projects", h.GetProjects)
	router.GET("/projects/:projectId", h.GetProjectDetail)

	// Protected routes under /api/me
	me := router.Group("/me")
	me.Use(authMiddleware)
	{
		me.GET("/projects", h.GetMyProjects)
		me.POST("/projects", h.CreateProject)
		me.GET("/projects/:projectId", h.GetMyProjectDetail)
		me.PATCH("/projects/:projectId", h.UpdateProject)
		me.DELETE("/projects/:projectId", h.DeleteProject)
		me.PATCH("/projects/:projectId/palettes/:paletteId/roles/:roleId", h.UpdateRoleColor)
		me.GET("/projects/:projectId/figures", h.GetFigures)
		me.POST("/projects/:projectId/figures", h.CreateFigure)
		me.PATCH("/projects/:projectId/figures/:figureId", h.UpdateFigure)
		me.DELETE("/projects/:projectId/figures/:figureId", h.DeleteFigure)
	}
}

// GetProjects godoc
// @Summary Get all projects (public)
// @Description Get all paper projects (no auth required for browsing)
// @Tags projects
// @Accept json
// @Produce json
// @Success 200 {array} PaperProject
// @Router /api/projects [get]
func (h *Handler) GetProjects(c *gin.Context) {
	projects, err := h.service.GetProjects()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if projects == nil {
		projects = []PaperProject{}
	}
	c.JSON(http.StatusOK, projects)
}

// GetMyProjects godoc
// @Summary Get current user's projects
// @Description Get all projects for the authenticated user
// @Tags projects
// @Accept json
// @Produce json
// @Success 200 {array} PaperProject
// @Router /api/me/projects [get]
func (h *Handler) GetMyProjects(c *gin.Context) {
	userID := authctx.GetUserID(c)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	projects, err := h.service.GetProjectsByUserID(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if projects == nil {
		projects = []PaperProject{}
	}
	c.JSON(http.StatusOK, projects)
}

// CreateProject godoc
// @Summary Create a new project
// @Description Create a new paper project for the authenticated user
// @Tags projects
// @Accept json
// @Produce json
// @Param request body CreateProjectRequest true "Project details"
// @Success 201 {object} PaperProject
// @Router /api/me/projects [post]
func (h *Handler) CreateProject(c *gin.Context) {
	userID := authctx.GetUserID(c)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	var req CreateProjectRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	project, err := h.service.CreateProject(userID, req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, project)
}

// GetProjectDetail godoc
// @Summary Get project details (public)
// @Description Get project with palettes and figures (no auth for browsing)
func (h *Handler) GetProjectDetail(c *gin.Context) {
	projectID := c.Param("projectId")

	detail, err := h.service.GetProjectDetail(projectID, "")
	if err != nil {
		if err.Error() == "project not found" {
			c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if detail == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
		return
	}
	c.JSON(http.StatusOK, detail)
}

// GetMyProjectDetail godoc
// @Summary Get current user's project details
// @Description Get project with palettes and figures (auth required)
func (h *Handler) GetMyProjectDetail(c *gin.Context) {
	userID := authctx.GetUserID(c)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	projectID := c.Param("projectId")

	detail, err := h.service.GetProjectDetail(projectID, userID)
	if err != nil {
		if err.Error() == "project not found" {
			c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
			return
		}
		if err.Error() == "access denied" {
			c.JSON(http.StatusForbidden, gin.H{"error": "access denied"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if detail == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
		return
	}
	c.JSON(http.StatusOK, detail)
}

// UpdateProject godoc
// @Summary Update project
// @Description Update project name and/or description (auth required)
func (h *Handler) UpdateProject(c *gin.Context) {
	userID := authctx.GetUserID(c)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	projectID := c.Param("projectId")

	var req UpdateProjectRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	err := h.service.UpdateProject(projectID, userID, req)
	if err != nil {
		if err.Error() == "project not found" {
			c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
			return
		}
		if err.Error() == "access denied" {
			c.JSON(http.StatusForbidden, gin.H{"error": "access denied"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "project updated"})
}

// DeleteProject godoc
// @Summary Delete project
// @Description Delete a paper project and all related data (auth required)
func (h *Handler) DeleteProject(c *gin.Context) {
	userID := authctx.GetUserID(c)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	projectID := c.Param("projectId")

	err := h.service.DeleteProject(projectID, userID)
	if err != nil {
		if err.Error() == "project not found" {
			c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
			return
		}
		if err.Error() == "access denied" {
			c.JSON(http.StatusForbidden, gin.H{"error": "access denied"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "project deleted"})
}

// UpdateRoleColor godoc
// @Summary Update role color
// @Description Update a palette role's color (auth required)
func (h *Handler) UpdateRoleColor(c *gin.Context) {
	userID := authctx.GetUserID(c)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	projectID := c.Param("projectId")
	roleID := c.Param("roleId")

	// Check project ownership
	project, err := h.service.GetProjectByID(projectID, userID)
	if err != nil {
		if err.Error() == "project not found" {
			c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
			return
		}
		if err.Error() == "access denied" {
			c.JSON(http.StatusForbidden, gin.H{"error": "access denied"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	_ = project // project ownership verified

	var req UpdateRoleColorRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	err = h.service.UpdateRoleColor(roleID, req.Color)
	if err != nil {
		if err.Error() == "role not found" {
			c.JSON(http.StatusNotFound, gin.H{"error": "role not found"})
			return
		}
		if err.Error() == "invalid color format" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid color format: must be #RRGGBB"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "role color updated"})
}

// GetFigures godoc
// @Summary Get all figures for a project (auth required)
func (h *Handler) GetFigures(c *gin.Context) {
	userID := authctx.GetUserID(c)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	projectID := c.Param("projectId")

	// Check project ownership
	_, err := h.service.GetProjectByID(projectID, userID)
	if err != nil {
		if err.Error() == "project not found" {
			c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
			return
		}
		if err.Error() == "access denied" {
			c.JSON(http.StatusForbidden, gin.H{"error": "access denied"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	figures, err := h.service.GetFigures(projectID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if figures == nil {
		figures = []FigureAssignment{}
	}
	c.JSON(http.StatusOK, figures)
}

// CreateFigure godoc
// @Summary Create a new figure (auth required)
func (h *Handler) CreateFigure(c *gin.Context) {
	userID := authctx.GetUserID(c)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	projectID := c.Param("projectId")

	// Check project ownership
	_, err := h.service.GetProjectByID(projectID, userID)
	if err != nil {
		if err.Error() == "project not found" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "project not found"})
			return
		}
		if err.Error() == "access denied" {
			c.JSON(http.StatusForbidden, gin.H{"error": "access denied"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var req CreateFigureRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	figure, err := h.service.CreateFigure(projectID, req)
	if err != nil {
		if err.Error() == "project not found" || err.Error() == "palette not found" {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, figure)
}

// UpdateFigure godoc
// @Summary Update a figure (auth required)
func (h *Handler) UpdateFigure(c *gin.Context) {
	userID := authctx.GetUserID(c)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	projectID := c.Param("projectId")
	figureID := c.Param("figureId")

	// Check project ownership
	_, err := h.service.GetProjectByID(projectID, userID)
	if err != nil {
		if err.Error() == "project not found" {
			c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
			return
		}
		if err.Error() == "access denied" {
			c.JSON(http.StatusForbidden, gin.H{"error": "access denied"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var req UpdateFigureRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	err = h.service.UpdateFigure(figureID, req)
	if err != nil {
		if err.Error() == "figure not found" {
			c.JSON(http.StatusNotFound, gin.H{"error": "figure not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "figure updated"})
}

// DeleteFigure godoc
// @Summary Delete a figure (auth required)
func (h *Handler) DeleteFigure(c *gin.Context) {
	userID := authctx.GetUserID(c)
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	projectID := c.Param("projectId")
	figureID := c.Param("figureId")

	// Check project ownership
	_, err := h.service.GetProjectByID(projectID, userID)
	if err != nil {
		if err.Error() == "project not found" {
			c.JSON(http.StatusNotFound, gin.H{"error": "project not found"})
			return
		}
		if err.Error() == "access denied" {
			c.JSON(http.StatusForbidden, gin.H{"error": "access denied"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	err = h.service.DeleteFigure(figureID)
	if err != nil {
		if err.Error() == "figure not found" {
			c.JSON(http.StatusNotFound, gin.H{"error": "figure not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "figure deleted"})
}