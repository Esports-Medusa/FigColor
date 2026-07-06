package palette

import (
	"encoding/json"
	"time"
)

// PaletteColor represents a single color in a palette
type PaletteColor struct {
	Hex string       `json:"hex"`
	RGB [3]int       `json:"rgb"` // [R, G, B]
}

// Accessibility represents accessibility features of a palette
type Accessibility struct {
	ColorblindSafe bool `json:"colorblind_safe"`
	PrintFriendly  bool `json:"print_friendly"`
	DarkBackground bool `json:"dark_background"`
}

// Palette represents a color palette for charting
type Palette struct {
	ID            string          `json:"id"`
	Slug          string          `json:"slug"`
	Name          string          `json:"name"`
	Colors        json.RawMessage `json:"colors"` // []PaletteColor
	ColorCount    int             `json:"color_count"`
	Type          string          `json:"type"` // categorical, sequential, diverging, qualitative, heatmap
	ChartTypes    []string        `json:"chart_types,omitempty"`
	JournalStyle  []string        `json:"journal_style,omitempty"`
	Discipline    []string        `json:"discipline,omitempty"`
	UseCase       []string        `json:"use_case,omitempty"`
	AvoidCase     []string        `json:"avoid_case,omitempty"`
	Tags          []string        `json:"tags,omitempty"`
	Accessibility *Accessibility  `json:"accessibility,omitempty"`
	SourceType    string          `json:"source_type,omitempty"` // manual, figure_extracted, curated
	SourceImage   string          `json:"source_image,omitempty"`
	SourceNote    string          `json:"source_note,omitempty"`
	Status        string          `json:"status"` // draft, candidate, published, archived
	Version       string          `json:"version,omitempty"`
	CreatedBy     *string         `json:"created_by,omitempty"`
	CreatedAt     time.Time       `json:"created_at"`
	UpdatedAt     time.Time       `json:"updated_at"`
	PublishedAt   *time.Time      `json:"published_at,omitempty"`
	ArchivedAt    *time.Time      `json:"archived_at,omitempty"`
}

// PaletteListParams represents query parameters for listing palettes
type PaletteListParams struct {
	Status       string
	Type         string
	ChartType    string
	JournalStyle string
	Discipline   string
	Page         int
	PageSize     int
}

// PaletteStats represents statistics for the dashboard
type PaletteStats struct {
	Total      int `json:"total"`
	Draft      int `json:"draft"`
	Candidate  int `json:"candidate"`
	Published  int `json:"published"`
	Archived   int `json:"archived"`
}

// CreatePaletteRequest represents the request body for creating a palette
type CreatePaletteRequest struct {
	Name          string          `json:"name" binding:"required"`
	Slug          string          `json:"slug" binding:"required"`
	Colors        json.RawMessage `json:"colors" binding:"required"`
	ColorCount    int             `json:"color_count" binding:"required,min=1"`
	Type          string          `json:"type" binding:"required"`
	ChartTypes    []string        `json:"chart_types,omitempty"`
	JournalStyle  []string        `json:"journal_style,omitempty"`
	Discipline    []string        `json:"discipline,omitempty"`
	UseCase       []string        `json:"use_case,omitempty"`
	AvoidCase     []string        `json:"avoid_case,omitempty"`
	Tags          []string        `json:"tags,omitempty"`
	Accessibility *Accessibility  `json:"accessibility,omitempty"`
	SourceType    string          `json:"source_type,omitempty"`
	SourceImage   string          `json:"source_image,omitempty"`
	SourceNote    string          `json:"source_note,omitempty"`
	Version       string          `json:"version,omitempty"`
	Status        string          `json:"status,omitempty"`
}

// UpdatePaletteRequest represents the request body for updating a palette
type UpdatePaletteRequest struct {
	Name          *string         `json:"name,omitempty"`
	Slug          *string         `json:"slug,omitempty"`
	Colors        json.RawMessage `json:"colors,omitempty"`
	ColorCount    *int            `json:"color_count,omitempty"`
	Type          *string         `json:"type,omitempty"`
	ChartTypes    []string        `json:"chart_types,omitempty"`
	JournalStyle  []string        `json:"journal_style,omitempty"`
	Discipline    []string        `json:"discipline,omitempty"`
	UseCase       []string        `json:"use_case,omitempty"`
	AvoidCase     []string        `json:"avoid_case,omitempty"`
	Tags          []string        `json:"tags,omitempty"`
	Accessibility *Accessibility  `json:"accessibility,omitempty"`
	SourceType    *string         `json:"source_type,omitempty"`
	SourceImage   *string         `json:"source_image,omitempty"`
	SourceNote    *string         `json:"source_note,omitempty"`
	Version       *string         `json:"version,omitempty"`
	Status        *string         `json:"status,omitempty"`
}

// PaletteColorInput represents the input format for colors (HEX only, RGB computed)
type PaletteColorInput struct {
	Hex string `json:"hex" binding:"required"`
}

// ToPaletteColors converts input colors to PaletteColor array
func ToPaletteColors(inputs []PaletteColorInput) []PaletteColor {
	colors := make([]PaletteColor, len(inputs))
	for i, input := range inputs {
		colors[i] = PaletteColor{
			Hex: input.Hex,
			RGB: HexToRGB(input.Hex),
		}
	}
	return colors
}

// HexToRGB converts a HEX color string to RGB array
func HexToRGB(hex string) [3]int {
	hex = trimHash(hex)
	r := hexToInt(hex[0:2])
	g := hexToInt(hex[2:4])
	b := hexToInt(hex[4:6])
	return [3]int{r, g, b}
}

func trimHash(hex string) string {
	if len(hex) > 0 && hex[0] == '#' {
		return hex[1:]
	}
	return hex
}

func hexToInt(hex string) int {
	var result int
	for _, c := range hex {
		result *= 16
		if c >= '0' && c <= '9' {
			result += int(c - '0')
		} else if c >= 'A' && c <= 'F' {
			result += int(c - 'A' + 10)
		} else if c >= 'a' && c <= 'f' {
			result += int(c - 'a' + 10)
		}
	}
	return result
}

// IsValidHex checks if a string is a valid HEX color
func IsValidHex(hex string) bool {
	hex = trimHash(hex)
	if len(hex) != 6 {
		return false
	}
	for _, c := range hex {
		if !((c >= '0' && c <= '9') || (c >= 'A' && c <= 'F') || (c >= 'a' && c <= 'f')) {
			return false
		}
	}
	return true
}

// GenerateSlug generates a URL-friendly slug from a name
func GenerateSlug(name string) string {
	slug := ""
	for _, c := range name {
		if (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') {
			slug += string(c)
		} else if c >= 'A' && c <= 'Z' {
			slug += string(c + 32) // lowercase
		} else if c == ' ' || c == '-' || c == '_' {
			slug += "-"
		}
	}
	return slug
}