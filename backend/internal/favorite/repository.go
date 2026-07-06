package favorite

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

func (r *Repository) GetByUserID(userID string) ([]FavoritePalette, error) {
	rows, err := database.DB.Query(`
		SELECT id, user_id, palette_id, created_at
		FROM favorite_palettes
		WHERE user_id = $1
		ORDER BY created_at DESC
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get favorites: %w", err)
	}
	defer rows.Close()

	var favorites []FavoritePalette
	for rows.Next() {
		var f FavoritePalette
		if err := rows.Scan(&f.ID, &f.UserID, &f.PaletteID, &f.CreatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan favorite: %w", err)
		}
		favorites = append(favorites, f)
	}

	return favorites, nil
}

func (r *Repository) GetByUserIDAndPaletteID(userID, paletteID string) (*FavoritePalette, error) {
	var f FavoritePalette
	err := database.DB.QueryRow(`
		SELECT id, user_id, palette_id, created_at
		FROM favorite_palettes
		WHERE user_id = $1 AND palette_id = $2
	`, userID, paletteID).Scan(&f.ID, &f.UserID, &f.PaletteID, &f.CreatedAt)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get favorite: %w", err)
	}

	return &f, nil
}

func (r *Repository) Create(userID, paletteID string) (*FavoritePalette, error) {
	f := &FavoritePalette{
		ID:        "",
		UserID:    userID,
		PaletteID: paletteID,
		CreatedAt: time.Now(),
	}

	err := database.DB.QueryRow(`
		INSERT INTO favorite_palettes (user_id, palette_id, created_at)
		VALUES ($1, $2, $3)
		RETURNING id, created_at
	`, userID, paletteID, f.CreatedAt).Scan(&f.ID, &f.CreatedAt)

	if err != nil {
		return nil, fmt.Errorf("failed to create favorite: %w", err)
	}

	return f, nil
}

func (r *Repository) Delete(userID, paletteID string) error {
	result, err := database.DB.Exec(`
		DELETE FROM favorite_palettes
		WHERE user_id = $1 AND palette_id = $2
	`, userID, paletteID)

	if err != nil {
		return fmt.Errorf("failed to delete favorite: %w", err)
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		return fmt.Errorf("favorite not found")
	}

	return nil
}

func (r *Repository) Exists(userID, paletteID string) (bool, error) {
	var count int
	err := database.DB.QueryRow(`
		SELECT COUNT(*) FROM favorite_palettes
		WHERE user_id = $1 AND palette_id = $2
	`, userID, paletteID).Scan(&count)

	if err != nil {
		return false, fmt.Errorf("failed to check favorite existence: %w", err)
	}

	return count > 0, nil
}