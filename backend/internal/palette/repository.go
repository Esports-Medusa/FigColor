package palette

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/lib/pq"
	"github.com/qiqi/figcolor/backend/internal/database"
)

type Repository struct{}

func NewRepository() *Repository {
	return &Repository{}
}

// GetByID retrieves a palette by its ID
func (r *Repository) GetByID(id string) (*Palette, error) {
	return r.getByID(database.DB, id, false)
}

func (r *Repository) getByID(q previewCaseQueryer, id string, forUpdate bool) (*Palette, error) {
	var palette Palette
	var colors, chartApplicability, accessibility []byte
	var chartTypes, journalStyle, discipline, useCase, avoidCase, tags []string
	var sourceType, sourceImage, sourceNote, version sql.NullString
	var createdBy sql.NullString
	var publishedAt, archivedAt sql.NullTime
	lockClause := ""
	if forUpdate {
		lockClause = " FOR UPDATE"
	}

	err := q.QueryRow(`
		SELECT id, slug, name, colors, color_count, type,
			chart_types, chart_applicability, journal_style, discipline, use_case, avoid_case, tags,
			accessibility, source_type, source_image, source_note,
			status, version, created_by, created_at, updated_at,
			published_at, archived_at
		FROM palettes
		WHERE id = $1
	`+lockClause, id).Scan(
		&palette.ID,
		&palette.Slug,
		&palette.Name,
		&colors,
		&palette.ColorCount,
		&palette.Type,
		pq.Array(&chartTypes),
		&chartApplicability,
		pq.Array(&journalStyle),
		pq.Array(&discipline),
		pq.Array(&useCase),
		pq.Array(&avoidCase),
		pq.Array(&tags),
		&accessibility,
		&sourceType,
		&sourceImage,
		&sourceNote,
		&palette.Status,
		&version,
		&createdBy,
		&palette.CreatedAt,
		&palette.UpdatedAt,
		&publishedAt,
		&archivedAt,
	)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get palette by id: %w", err)
	}

	palette.Colors = colors
	palette.ChartTypes = chartTypes
	if err := scanChartApplicability(chartApplicability, &palette); err != nil {
		return nil, err
	}
	palette.JournalStyle = journalStyle
	palette.Discipline = discipline
	palette.UseCase = useCase
	palette.AvoidCase = avoidCase
	palette.Tags = tags
	palette.Accessibility = &Accessibility{}
	json.Unmarshal(accessibility, palette.Accessibility)

	if sourceType.Valid {
		palette.SourceType = sourceType.String
	}
	if sourceImage.Valid {
		palette.SourceImage = sourceImage.String
	}
	if sourceNote.Valid {
		palette.SourceNote = sourceNote.String
	}
	if version.Valid {
		palette.Version = version.String
	}
	if createdBy.Valid {
		palette.CreatedBy = &createdBy.String
	}
	if publishedAt.Valid {
		palette.PublishedAt = &publishedAt.Time
	}
	if archivedAt.Valid {
		palette.ArchivedAt = &archivedAt.Time
	}

	return &palette, nil
}

func (r *Repository) GetPaletteByIDTx(tx *sql.Tx, id string) (*Palette, error) {
	return r.getByID(tx, id, false)
}

func (r *Repository) LockPaletteByIDTx(tx *sql.Tx, id string) (*Palette, error) {
	return r.getByID(tx, id, true)
}

// GetBySlug retrieves a palette by its slug
func (r *Repository) GetBySlug(slug string) (*Palette, error) {
	var palette Palette
	var colors, chartApplicability, accessibility []byte
	var chartTypes, journalStyle, discipline, useCase, avoidCase, tags []string
	var sourceType, sourceImage, sourceNote, version sql.NullString
	var createdBy sql.NullString
	var publishedAt, archivedAt sql.NullTime

	err := database.DB.QueryRow(`
		SELECT id, slug, name, colors, color_count, type,
			chart_types, chart_applicability, journal_style, discipline, use_case, avoid_case, tags,
			accessibility, source_type, source_image, source_note,
			status, version, created_by, created_at, updated_at,
			published_at, archived_at
		FROM palettes
		WHERE slug = $1
	`, slug).Scan(
		&palette.ID,
		&palette.Slug,
		&palette.Name,
		&colors,
		&palette.ColorCount,
		&palette.Type,
		pq.Array(&chartTypes),
		&chartApplicability,
		pq.Array(&journalStyle),
		pq.Array(&discipline),
		pq.Array(&useCase),
		pq.Array(&avoidCase),
		pq.Array(&tags),
		&accessibility,
		&sourceType,
		&sourceImage,
		&sourceNote,
		&palette.Status,
		&version,
		&createdBy,
		&palette.CreatedAt,
		&palette.UpdatedAt,
		&publishedAt,
		&archivedAt,
	)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get palette by slug: %w", err)
	}

	palette.Colors = colors
	palette.ChartTypes = chartTypes
	if err := scanChartApplicability(chartApplicability, &palette); err != nil {
		return nil, err
	}
	palette.JournalStyle = journalStyle
	palette.Discipline = discipline
	palette.UseCase = useCase
	palette.AvoidCase = avoidCase
	palette.Tags = tags
	palette.Accessibility = &Accessibility{}
	json.Unmarshal(accessibility, palette.Accessibility)

	if sourceType.Valid {
		palette.SourceType = sourceType.String
	}
	if sourceImage.Valid {
		palette.SourceImage = sourceImage.String
	}
	if sourceNote.Valid {
		palette.SourceNote = sourceNote.String
	}
	if version.Valid {
		palette.Version = version.String
	}
	if createdBy.Valid {
		palette.CreatedBy = &createdBy.String
	}
	if publishedAt.Valid {
		palette.PublishedAt = &publishedAt.Time
	}
	if archivedAt.Valid {
		palette.ArchivedAt = &archivedAt.Time
	}

	return &palette, nil
}

// ListParams represents query parameters for listing palettes
type ListParams struct {
	Status        string
	Type          string
	ChartType     string
	JournalStyle  string
	Discipline    string
	Page          int
	PageSize      int
	PublishedOnly bool // For public API
}

// List retrieves palettes with optional filtering
func (r *Repository) List(params ListParams) ([]*Palette, int, error) {
	if params.Page < 1 {
		params.Page = 1
	}
	if params.PageSize < 1 || params.PageSize > 100 {
		params.PageSize = 20
	}
	offset := (params.Page - 1) * params.PageSize

	// Build WHERE clause
	var conditions []string
	var args []interface{}
	argIndex := 1

	if params.Status != "" {
		conditions = append(conditions, fmt.Sprintf("status = $%d", argIndex))
		args = append(args, params.Status)
		argIndex++
	}
	if params.Type != "" {
		conditions = append(conditions, fmt.Sprintf("type = $%d", argIndex))
		args = append(args, params.Type)
		argIndex++
	}
	if params.ChartType != "" {
		conditions = append(conditions, fmt.Sprintf("$%d = ANY(chart_types)", argIndex))
		args = append(args, params.ChartType)
		argIndex++
	}
	if params.JournalStyle != "" {
		conditions = append(conditions, fmt.Sprintf("$%d = ANY(journal_style)", argIndex))
		args = append(args, params.JournalStyle)
		argIndex++
	}
	if params.Discipline != "" {
		conditions = append(conditions, fmt.Sprintf("$%d = ANY(discipline)", argIndex))
		args = append(args, params.Discipline)
		argIndex++
	}
	if params.PublishedOnly {
		conditions = append(conditions, "status = 'published'")
	}

	whereClause := ""
	if len(conditions) > 0 {
		whereClause = "WHERE " + strings.Join(conditions, " AND ")
	}

	// Count total
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM palettes %s", whereClause)
	var total int
	err := database.DB.QueryRow(countQuery, args...).Scan(&total)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to count palettes: %w", err)
	}

	// Fetch palettes
	query := fmt.Sprintf(`
		SELECT id, slug, name, colors, color_count, type,
			chart_types, chart_applicability, journal_style, discipline, use_case, avoid_case, tags,
			accessibility, source_type, source_image, source_note,
			status, version, created_by, created_at, updated_at,
			published_at, archived_at
		FROM palettes
		%s
		ORDER BY created_at DESC
		LIMIT $%d OFFSET $%d
	`, whereClause, argIndex, argIndex+1)

	args = append(args, params.PageSize, offset)

	rows, err := database.DB.Query(query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to list palettes: %w", err)
	}
	defer rows.Close()

	var palettes []*Palette
	for rows.Next() {
		var palette Palette
		var colors, chartApplicability, accessibility []byte
		var chartTypes, journalStyle, discipline, useCase, avoidCase, tags []string
		var sourceType, sourceImage, sourceNote, version sql.NullString
		var createdBy sql.NullString
		var publishedAt, archivedAt sql.NullTime

		err := rows.Scan(
			&palette.ID,
			&palette.Slug,
			&palette.Name,
			&colors,
			&palette.ColorCount,
			&palette.Type,
			pq.Array(&chartTypes),
			&chartApplicability,
			pq.Array(&journalStyle),
			pq.Array(&discipline),
			pq.Array(&useCase),
			pq.Array(&avoidCase),
			pq.Array(&tags),
			&accessibility,
			&sourceType,
			&sourceImage,
			&sourceNote,
			&palette.Status,
			&version,
			&createdBy,
			&palette.CreatedAt,
			&palette.UpdatedAt,
			&publishedAt,
			&archivedAt,
		)
		if err != nil {
			return nil, 0, fmt.Errorf("failed to scan palette: %w", err)
		}

		palette.Colors = colors
		palette.ChartTypes = chartTypes
		if err := scanChartApplicability(chartApplicability, &palette); err != nil {
			return nil, 0, err
		}
		palette.JournalStyle = journalStyle
		palette.Discipline = discipline
		palette.UseCase = useCase
		palette.AvoidCase = avoidCase
		palette.Tags = tags
		palette.Accessibility = &Accessibility{}
		json.Unmarshal(accessibility, palette.Accessibility)

		if sourceType.Valid {
			palette.SourceType = sourceType.String
		}
		if sourceImage.Valid {
			palette.SourceImage = sourceImage.String
		}
		if sourceNote.Valid {
			palette.SourceNote = sourceNote.String
		}
		if version.Valid {
			palette.Version = version.String
		}
		if createdBy.Valid {
			palette.CreatedBy = &createdBy.String
		}
		if publishedAt.Valid {
			palette.PublishedAt = &publishedAt.Time
		}
		if archivedAt.Valid {
			palette.ArchivedAt = &archivedAt.Time
		}

		palettes = append(palettes, &palette)
	}

	return palettes, total, nil
}

// GetStats returns palette statistics for the admin dashboard
func (r *Repository) GetStats() (*PaletteStats, error) {
	stats := &PaletteStats{}

	err := database.DB.QueryRow(`
		SELECT 
			COUNT(*) as total,
			COUNT(*) FILTER (WHERE status = 'draft') as draft,
			COUNT(*) FILTER (WHERE status = 'candidate') as candidate,
			COUNT(*) FILTER (WHERE status = 'published') as published,
			COUNT(*) FILTER (WHERE status = 'archived') as archived
		FROM palettes
	`).Scan(&stats.Total, &stats.Draft, &stats.Candidate, &stats.Published, &stats.Archived)

	if err != nil {
		return nil, fmt.Errorf("failed to get palette stats: %w", err)
	}

	return stats, nil
}

// Create inserts a new palette
func (r *Repository) Create(req *CreatePaletteRequest, createdBy string) (*Palette, error) {
	now := time.Now()
	status := req.Status
	if status == "" {
		status = "draft"
	}

	accessibilityJSON, _ := json.Marshal(req.Accessibility)
	if req.Accessibility == nil {
		accessibilityJSON = []byte(`{"colorblind_safe": false, "print_friendly": false, "dark_background": false}`)
	}

	var createdByPtr *string
	if createdBy != "" {
		createdByPtr = &createdBy
	}

	var paletteID string
	chartApplicabilityJSON, err := chartApplicabilityJSONValue(req.ChartApplicability)
	if err != nil {
		return nil, err
	}
	err = database.DB.QueryRow(`
		INSERT INTO palettes (
			slug, name, colors, color_count, type,
			chart_types, chart_applicability, journal_style, discipline, use_case, avoid_case, tags,
			accessibility, source_type, source_image, source_note,
			status, version, created_by, created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
		RETURNING id
	`,
		req.Slug,
		req.Name,
		req.Colors,
		req.ColorCount,
		req.Type,
		pq.Array(req.ChartTypes),
		chartApplicabilityJSON,
		pq.Array(req.JournalStyle),
		pq.Array(req.Discipline),
		pq.Array(req.UseCase),
		pq.Array(req.AvoidCase),
		pq.Array(req.Tags),
		accessibilityJSON,
		req.SourceType,
		req.SourceImage,
		req.SourceNote,
		status,
		req.Version,
		createdByPtr,
		now,
		now,
	).Scan(&paletteID)

	if err != nil {
		return nil, fmt.Errorf("failed to create palette: %w", err)
	}

	return r.GetByID(paletteID)
}

// CreateCandidateTx is the narrow caller-owned transaction adapter for the
// ingestion aggregate. The caller must provide an already validated,
// server-owned candidate request. This method never commits.
func (r *Repository) CreateCandidateTx(tx *sql.Tx, req *CreatePaletteRequest, createdBy string) (*Palette, error) {
	accessibilityJSON, err := json.Marshal(req.Accessibility)
	if err != nil {
		return nil, err
	}
	if req.Accessibility == nil {
		accessibilityJSON = []byte(`{"colorblind_safe": false, "print_friendly": false, "dark_background": false}`)
	}
	chartApplicabilityJSON, err := chartApplicabilityJSONValue(req.ChartApplicability)
	if err != nil {
		return nil, err
	}
	var createdByPtr *string
	if createdBy != "" {
		createdByPtr = &createdBy
	}
	var id string
	err = tx.QueryRow(`
		INSERT INTO palettes (
			slug,name,owner_user_id,visibility,origin,source_palette_id,colors,color_count,type,
			chart_types,chart_applicability,journal_style,discipline,use_case,avoid_case,tags,
			accessibility,source_type,source_image,source_note,status,version,created_by
		) VALUES ($1,$2,NULL,'public','curated',NULL,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'candidate',$17,$18)
		RETURNING id`, req.Slug, req.Name, req.Colors, req.ColorCount, req.Type,
		pq.Array(req.ChartTypes), chartApplicabilityJSON, pq.Array(req.JournalStyle), pq.Array(req.Discipline),
		pq.Array(req.UseCase), pq.Array(req.AvoidCase), pq.Array(req.Tags), accessibilityJSON,
		req.SourceType, req.SourceImage, req.SourceNote, req.Version, createdByPtr).Scan(&id)
	if err != nil {
		return nil, fmt.Errorf("create ingestion candidate: %w", err)
	}
	return r.GetPaletteByIDTx(tx, id)
}

// Update modifies an existing palette
func (r *Repository) Update(id string, req *UpdatePaletteRequest) (*Palette, error) {
	now := time.Now()

	// Build dynamic update query
	var setClauses []string
	var args []interface{}
	argIndex := 1

	if req.Name != nil {
		setClauses = append(setClauses, fmt.Sprintf("name = $%d", argIndex))
		args = append(args, *req.Name)
		argIndex++
	}
	if req.Slug != nil {
		setClauses = append(setClauses, fmt.Sprintf("slug = $%d", argIndex))
		args = append(args, *req.Slug)
		argIndex++
	}
	if req.Colors != nil {
		setClauses = append(setClauses, fmt.Sprintf("colors = $%d", argIndex))
		args = append(args, req.Colors)
		argIndex++
	}
	if req.ColorCount != nil {
		setClauses = append(setClauses, fmt.Sprintf("color_count = $%d", argIndex))
		args = append(args, *req.ColorCount)
		argIndex++
	}
	if req.Type != nil {
		setClauses = append(setClauses, fmt.Sprintf("type = $%d", argIndex))
		args = append(args, *req.Type)
		argIndex++
	}
	if req.ChartTypes != nil {
		setClauses = append(setClauses, fmt.Sprintf("chart_types = $%d", argIndex))
		args = append(args, pq.Array(req.ChartTypes))
		argIndex++
	}
	if req.ChartApplicability.Present {
		chartApplicabilityJSON, err := chartApplicabilityJSONValue(req.ChartApplicability)
		if err != nil {
			return nil, err
		}
		setClauses = append(setClauses, fmt.Sprintf("chart_applicability = $%d", argIndex))
		args = append(args, chartApplicabilityJSON)
		argIndex++
	}
	if req.JournalStyle != nil {
		setClauses = append(setClauses, fmt.Sprintf("journal_style = $%d", argIndex))
		args = append(args, pq.Array(req.JournalStyle))
		argIndex++
	}
	if req.Discipline != nil {
		setClauses = append(setClauses, fmt.Sprintf("discipline = $%d", argIndex))
		args = append(args, pq.Array(req.Discipline))
		argIndex++
	}
	if req.UseCase != nil {
		setClauses = append(setClauses, fmt.Sprintf("use_case = $%d", argIndex))
		args = append(args, pq.Array(req.UseCase))
		argIndex++
	}
	if req.AvoidCase != nil {
		setClauses = append(setClauses, fmt.Sprintf("avoid_case = $%d", argIndex))
		args = append(args, pq.Array(req.AvoidCase))
		argIndex++
	}
	if req.Tags != nil {
		setClauses = append(setClauses, fmt.Sprintf("tags = $%d", argIndex))
		args = append(args, pq.Array(req.Tags))
		argIndex++
	}
	if req.Accessibility != nil {
		accessibilityJSON, _ := json.Marshal(req.Accessibility)
		setClauses = append(setClauses, fmt.Sprintf("accessibility = $%d", argIndex))
		args = append(args, accessibilityJSON)
		argIndex++
	}
	if req.SourceType != nil {
		setClauses = append(setClauses, fmt.Sprintf("source_type = $%d", argIndex))
		args = append(args, *req.SourceType)
		argIndex++
	}
	if req.SourceImage != nil {
		setClauses = append(setClauses, fmt.Sprintf("source_image = $%d", argIndex))
		args = append(args, *req.SourceImage)
		argIndex++
	}
	if req.SourceNote != nil {
		setClauses = append(setClauses, fmt.Sprintf("source_note = $%d", argIndex))
		args = append(args, *req.SourceNote)
		argIndex++
	}
	if req.Version != nil {
		setClauses = append(setClauses, fmt.Sprintf("version = $%d", argIndex))
		args = append(args, *req.Version)
		argIndex++
	}
	if req.Status != nil {
		setClauses = append(setClauses, fmt.Sprintf("status = $%d", argIndex))
		args = append(args, *req.Status)
		argIndex++
	}

	if len(setClauses) == 0 {
		return r.GetByID(id)
	}

	// Always update updated_at
	setClauses = append(setClauses, fmt.Sprintf("updated_at = $%d", argIndex))
	args = append(args, now)
	argIndex++

	args = append(args, id)

	query := fmt.Sprintf(`
		UPDATE palettes 
		SET %s 
		WHERE id = $%d
	`, strings.Join(setClauses, ", "), argIndex)

	_, err := database.DB.Exec(query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to update palette: %w", err)
	}

	return r.GetByID(id)
}

// Publish sets status to 'published' and sets published_at
func (r *Repository) Publish(id string) (*Palette, error) {
	now := time.Now()
	_, err := database.DB.Exec(`
		UPDATE palettes 
		SET status = 'published', published_at = $1, updated_at = $1 
		WHERE id = $2
	`, now, id)
	if err != nil {
		return nil, fmt.Errorf("failed to publish palette: %w", err)
	}
	return r.GetByID(id)
}

// Unpublish sets status to 'draft' (not candidate per spec) and clears published_at
func (r *Repository) Unpublish(id string) (*Palette, error) {
	now := time.Now()
	_, err := database.DB.Exec(`
		UPDATE palettes 
		SET status = 'draft', published_at = NULL, updated_at = $1 
		WHERE id = $2
	`, now, id)
	if err != nil {
		return nil, fmt.Errorf("failed to unpublish palette: %w", err)
	}
	return r.GetByID(id)
}

// Archive sets status to 'archived' and sets archived_at (soft delete)
func (r *Repository) Archive(id string) (*Palette, error) {
	now := time.Now()
	_, err := database.DB.Exec(`
		UPDATE palettes 
		SET status = 'archived', archived_at = $1, updated_at = $1 
		WHERE id = $2
	`, now, id)
	if err != nil {
		return nil, fmt.Errorf("failed to archive palette: %w", err)
	}
	return r.GetByID(id)
}

// Delete permanently removes a palette (admin only, use Archive for soft delete)
func (r *Repository) Delete(id string) error {
	_, err := database.DB.Exec("DELETE FROM palettes WHERE id = $1", id)
	if err != nil {
		return fmt.Errorf("failed to delete palette: %w", err)
	}
	return nil
}

// SlugExists checks if a slug is already in use (excluding a specific ID for updates)
func (r *Repository) SlugExists(slug string, excludeID string) (bool, error) {
	var count int
	var err error
	if excludeID != "" {
		err = database.DB.QueryRow(`
			SELECT COUNT(*) FROM palettes WHERE slug = $1 AND id != $2
		`, slug, excludeID).Scan(&count)
	} else {
		err = database.DB.QueryRow(`
			SELECT COUNT(*) FROM palettes WHERE slug = $1
		`, slug).Scan(&count)
	}
	if err != nil {
		return false, fmt.Errorf("failed to check slug existence: %w", err)
	}
	return count > 0, nil
}

func scanChartApplicability(raw []byte, palette *Palette) error {
	if raw == nil {
		palette.ChartApplicability = nil
		return nil
	}
	var applicability []ChartTypeApplicability
	if err := json.Unmarshal(raw, &applicability); err != nil {
		return fmt.Errorf("failed to scan chart applicability: %w", err)
	}
	palette.ChartApplicability = &applicability
	return nil
}

func chartApplicabilityJSONValue(input OptionalChartApplicability) (interface{}, error) {
	if !input.Present || input.Null {
		return nil, nil
	}
	encoded, err := json.Marshal(input.Value)
	if err != nil {
		return nil, fmt.Errorf("failed to encode chart applicability: %w", err)
	}
	return encoded, nil
}
