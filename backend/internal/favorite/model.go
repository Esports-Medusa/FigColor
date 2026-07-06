package favorite

import (
	"time"
)

type FavoritePalette struct {
	ID        string    `json:"id"`
	UserID    string    `json:"userId"`
	PaletteID string    `json:"paletteId"`
	CreatedAt time.Time `json:"createdAt"`
}