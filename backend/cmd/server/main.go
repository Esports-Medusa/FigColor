package main

import (
	"fmt"
	"log"
	"os"

	"github.com/gin-gonic/gin"
	"github.com/qiqi/figcolor/backend/internal/auth"
	"github.com/qiqi/figcolor/backend/internal/config"
	"github.com/qiqi/figcolor/backend/internal/database"
	"github.com/qiqi/figcolor/backend/internal/favorite"
	"github.com/qiqi/figcolor/backend/internal/middleware"
	"github.com/qiqi/figcolor/backend/internal/palette"
	"github.com/qiqi/figcolor/backend/internal/paletteassistant/analyze"
	"github.com/qiqi/figcolor/backend/internal/paletteassistant/submission"
	"github.com/qiqi/figcolor/backend/internal/project"
	"github.com/qiqi/figcolor/backend/internal/user"
)

func main() {
	// Load configuration
	cfg := config.Load()

	// Connect to database
	if err := database.Connect(cfg.DatabaseURL); err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer database.Close()

	// Initialize Gin router
	router := gin.Default()

	// Apply middleware
	router.Use(middleware.CORS())

	// Health check endpoint
	router.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	// Initialize repositories
	userRepo := user.NewRepository()
	paletteRepo := palette.NewRepository()

	// Initialize services
	authService := auth.NewService(userRepo, cfg.JWTSecret, cfg.JWTExpiry, cfg.BCryptCost)
	userService := user.NewService(userRepo, cfg.BCryptCost)
	projectRepo := project.NewRepository()
	projectService := project.NewService(projectRepo)
	favoriteRepo := favorite.NewRepository()
	favoriteService := favorite.NewService(favoriteRepo)
	paletteService := palette.NewService(paletteRepo)
	ingestionService, err := palette.NewIngestionService()
	if err != nil {
		log.Fatalf("Failed to initialize Palette ingestion service: %v", err)
	}

	// Initialize handlers
	authHandler := auth.NewHandler(authService)
	userHandler := user.NewHandler(userService)
	projectHandler := project.NewHandler(projectService)
	favoriteHandler := favorite.NewHandler(favoriteService)
	paletteHandler := palette.NewHandler(paletteService)
	ingestionHandler, err := palette.NewIngestionHandler(ingestionService)
	if err != nil {
		log.Fatalf("Failed to initialize Palette ingestion HTTP handler: %v", err)
	}
	analyzeHandler, err := analyze.NewHandler(analyze.NewService())
	if err != nil {
		log.Fatalf("Failed to initialize Palette Assistant Analyze handler: %v", err)
	}
	submissionService, submissionErr := submission.NewService(submission.NewSQLRepository(), []byte(os.Getenv("PALETTE_ASSISTANT_VALIDATION_RECEIPT_SECRET")), nil)
	var submissionHandler *submission.Handler
	if submissionErr != nil {
		log.Printf("Palette Assistant Validate/Create disabled: validation receipt secret is missing or too short")
		submissionHandler = submission.NewHandler(nil)
	} else {
		submissionHandler = submission.NewHandler(submissionService)
	}

	// Create middleware
	authMiddleware := middleware.Auth(cfg.JWTSecret, userRepo)
	adminMiddleware := middleware.AdminRequired()

	// Register API routes
	api := router.Group("/api")

	// Auth routes (register, login, logout, me)
	authHandler.RegisterRoutes(api, cfg.JWTSecret, authMiddleware)

	// User routes (me)
	userHandler.RegisterRoutes(api, cfg.JWTSecret, authMiddleware)

	// Project routes
	projectHandler.RegisterRoutes(api, cfg.JWTSecret, authMiddleware)

	// Favorite routes
	favoriteHandler.RegisterRoutes(api, cfg.JWTSecret, authMiddleware)

	// Palette routes (admin and public)
	paletteHandler.RegisterRoutes(api, cfg.JWTSecret, authMiddleware, adminMiddleware)
	ingestionHandler.RegisterRoutes(api, authMiddleware, adminMiddleware)
	analyzeHandler.RegisterRoutes(api, authMiddleware, adminMiddleware)
	submissionHandler.RegisterRoutes(api, authMiddleware, adminMiddleware)

	// Start server
	addr := fmt.Sprintf(":%s", cfg.ServerPort)
	log.Printf("Server starting on %s", addr)
	if err := router.Run(addr); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
