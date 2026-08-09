package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/qiqi/figcolor/backend/internal/authctx"
	"github.com/qiqi/figcolor/backend/internal/jwt"
	"github.com/qiqi/figcolor/backend/internal/paletteassistant"
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
			abortAuthentication(c, "authorization header required")
			return
		}

		if !strings.HasPrefix(authHeader, BearerPrefix) {
			abortAuthentication(c, "invalid authorization format")
			return
		}

		tokenString := strings.TrimPrefix(authHeader, BearerPrefix)
		if tokenString == "" {
			abortAuthentication(c, "token required")
			return
		}

		// Parse and validate token
		claims, err := jwt.ValidateTokenStatic(tokenString, jwtSecret)
		if err != nil {
			abortAuthentication(c, "invalid or expired token")
			return
		}

		// Get user to fetch role
		u, err := userRepo.GetByID(claims.UserID)
		if err != nil || u == nil {
			abortAuthentication(c, "user not found")
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
			abortAuthentication(c, "unauthorized")
			return
		}

		if role != "admin" {
			if c.Request.URL.Path == paletteassistant.AnalyzePath {
				c.AbortWithStatusJSON(http.StatusForbidden, paletteassistant.Problem{Code: paletteassistant.ErrAdminRequired, Message: "Admin access is required.", Retryable: false})
			} else {
				c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "access denied"})
			}
			return
		}

		c.Next()
	}
}

func abortAuthentication(c *gin.Context, legacyMessage string) {
	if c.Request.URL.Path == paletteassistant.AnalyzePath {
		c.AbortWithStatusJSON(http.StatusUnauthorized, paletteassistant.Problem{Code: paletteassistant.ErrAuthenticationRequired, Message: "Sign in is required.", Retryable: false})
		return
	}
	c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": legacyMessage})
}
