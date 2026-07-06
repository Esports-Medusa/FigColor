package authctx

import (
	"github.com/gin-gonic/gin"
)

const (
	UserIDKey = "user_id"
	RoleKey   = "role"
)

// GetUserID extracts the current user ID from the gin context
func GetUserID(c *gin.Context) string {
	userID, exists := c.Get(UserIDKey)
	if !exists {
		return ""
	}
	return userID.(string)
}

// GetRole extracts the current user role from the gin context
func GetRole(c *gin.Context) string {
	role, exists := c.Get(RoleKey)
	if !exists {
		return ""
	}
	return role.(string)
}

// SetUser sets user ID and role in the gin context
func SetUser(c *gin.Context, userID, role string) {
	c.Set(UserIDKey, userID)
	c.Set(RoleKey, role)
}