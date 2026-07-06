package user

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/qiqi/figcolor/backend/internal/database"
)

type Repository struct{}

func NewRepository() *Repository {
	return &Repository{}
}

func (r *Repository) GetByID(id string) (*User, error) {
	var user User
	var name, avatarURL sql.NullString

	err := database.DB.QueryRow(`
		SELECT id, email, email_verified, name, avatar_url, role, status, created_at, updated_at
		FROM users
		WHERE id = $1
	`, id).Scan(
		&user.ID,
		&user.Email,
		&user.EmailVerified,
		&name,
		&avatarURL,
		&user.Role,
		&user.Status,
		&user.CreatedAt,
		&user.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get user by id: %w", err)
	}

	if name.Valid {
		user.Name = &name.String
	}
	if avatarURL.Valid {
		user.AvatarURL = &avatarURL.String
	}

	return &user, nil
}

func (r *Repository) GetByEmail(email string) (*User, error) {
	var user User
	var name, avatarURL sql.NullString

	err := database.DB.QueryRow(`
		SELECT id, email, email_verified, name, avatar_url, role, status, created_at, updated_at
		FROM users
		WHERE email = $1
	`, email).Scan(
		&user.ID,
		&user.Email,
		&user.EmailVerified,
		&name,
		&avatarURL,
		&user.Role,
		&user.Status,
		&user.CreatedAt,
		&user.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get user by email: %w", err)
	}

	if name.Valid {
		user.Name = &name.String
	}
	if avatarURL.Valid {
		user.AvatarURL = &avatarURL.String
	}

	return &user, nil
}

func (r *Repository) Create(email, passwordHash string, name *string) (*User, error) {
	user := &User{
		ID:            "",
		Email:         email,
		EmailVerified: false,
		Name:          name,
		AvatarURL:     nil,
		Status:        "active",
		CreatedAt:     time.Now(),
		UpdatedAt:     time.Now(),
	}

	var avatarURL sql.NullString

	err := database.DB.QueryRow(`
		INSERT INTO users (email, password_hash, name, role, status, created_at, updated_at)
		VALUES ($1, $2, $3, 'user', $4, $5, $6)
		RETURNING id, avatar_url, created_at, updated_at
	`, email, passwordHash, name, user.Status, user.CreatedAt, user.UpdatedAt).Scan(
		&user.ID,
		&avatarURL,
		&user.CreatedAt,
		&user.UpdatedAt,
	)

	if err != nil {
		return nil, fmt.Errorf("failed to create user: %w", err)
	}

	if avatarURL.Valid {
		user.AvatarURL = &avatarURL.String
	}

	return user, nil
}

func (r *Repository) UpdateName(userID string, name *string) error {
	_, err := database.DB.Exec(`
		UPDATE users SET name = $1, updated_at = $2 WHERE id = $3
	`, name, time.Now(), userID)

	if err != nil {
		return fmt.Errorf("failed to update user name: %w", err)
	}
	return nil
}

func (r *Repository) UpdateAvatar(userID string, avatarURL *string) error {
	_, err := database.DB.Exec(`
		UPDATE users SET avatar_url = $1, updated_at = $2 WHERE id = $3
	`, avatarURL, time.Now(), userID)

	if err != nil {
		return fmt.Errorf("failed to update user avatar: %w", err)
	}
	return nil
}

func (r *Repository) EmailExists(email string) (bool, error) {
	var count int
	err := database.DB.QueryRow(`SELECT COUNT(*) FROM users WHERE email = $1`, email).Scan(&count)
	if err != nil {
		return false, fmt.Errorf("failed to check email existence: %w", err)
	}
	return count > 0, nil
}

func (r *Repository) GetPasswordHash(email string, passwordHash *string) error {
	err := database.DB.QueryRow(`SELECT password_hash FROM users WHERE email = $1`, email).Scan(passwordHash)
	if err == sql.ErrNoRows {
		return fmt.Errorf("user not found")
	}
	return err
}