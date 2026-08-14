package user

import (
	"time"
)

type User struct {
	ID                string     `json:"id"`
	Email             string     `json:"email"`
	EmailVerified     bool       `json:"emailVerified"`
	EmailVerifiedAt   *time.Time `json:"emailVerifiedAt,omitempty"`
	Name              *string    `json:"name,omitempty"`
	AvatarURL         *string    `json:"avatarUrl,omitempty"`
	Role              string     `json:"role"`
	Status            string     `json:"status"`
	CreatedAt         time.Time  `json:"createdAt"`
	UpdatedAt         time.Time  `json:"updatedAt"`
	PasswordChangedAt *time.Time `json:"-"`
	AuthVersion       int        `json:"-"`
}

type UpdateUserRequest struct {
	Name      *string `json:"name,omitempty"`
	AvatarURL *string `json:"avatarUrl,omitempty"`
}
