package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/qiqi/figcolor/backend/internal/authctx"
	"github.com/qiqi/figcolor/backend/internal/jwt"
	"github.com/qiqi/figcolor/backend/internal/user"
)

const (
	AuthorizationHeader = "Authorization"
	BearerPrefix        = "Bearer "
)

// Auth middleware validates JWT and stores user_id AND role in context
func Auth(jwtSecret string, userRepo *user.Repository) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader(AuthorizationHeader)
		if authHeader == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "authorization header required"})
			return
		}

		if !strings.HasPrefix(authHeader, BearerPrefix) {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid authorization format"})
			return
		}

		tokenString := strings.TrimPrefix(authHeader, BearerPrefix)
		if tokenString == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "token required"})
			return
		}

		// Parse and validate token
		claims, err := jwt.ValidateTokenStatic(tokenString, jwtSecret)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired token"})
			return
		}

		// Get user to fetch role
		u, err := userRepo.GetByID(claims.UserID)
		if err != nil || u == nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "user not found"})
			return
		}

		// Store both user_id and role in context using authctx package
		authctx.SetUser(c, claims.UserID, u.Role)
		c.Next()
	}
}

// AdminRequired middleware checks if the current user is an admin
// It reads role from context (set by Auth middleware), not from user package
func AdminRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		role := authctx.GetRole(c)
		if role == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}

		if role != "admin" {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "access denied"})
			return
		}

		c.Next()
	}
}