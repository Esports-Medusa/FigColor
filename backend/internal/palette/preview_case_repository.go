package palette

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"github.com/lib/pq"
	"github.com/qiqi/figcolor/backend/internal/database"
)

var (
	ErrPreviewCaseNotFound   = errors.New("preview case not found")
	ErrPreviewCaseConflict   = errors.New("preview case conflict")
	ErrPreviewCaseForeignKey = errors.New("preview case foreign key failure")
	ErrPreviewCaseConstraint = errors.New("preview case constraint failure")
)

const previewCaseSelectColumns = `
	id, palette_id, chart_type, template_id, template_version, schema_version,
	color_roles, preview_config, seed_strategy, seed_value, is_primary, status,
	created_at, updated_at
`

type previewCaseQueryer interface {
	Exec(query string, args ...interface{}) (sql.Result, error)
	Query(query string, args ...interface{}) (*sql.Rows, error)
	QueryRow(query string, args ...interface{}) *sql.Row
}

// CreatePreviewCase inserts a draft, non-primary preview case.
func (r *Repository) CreatePreviewCase(paletteID string, req *CreatePreviewCaseRequest) (*PalettePreviewCase, error) {
	return r.createPreviewCase(database.DB, paletteID, req)
}

// CreatePreviewCaseTx is the caller-owned transaction adapter used by the
// ingestion aggregate. It performs the same validation and never commits.
func (r *Repository) CreatePreviewCaseTx(tx *sql.Tx, paletteID string, req *CreatePreviewCaseRequest) (*PalettePreviewCase, error) {
	return r.createPreviewCase(tx, paletteID, req)
}

func (r *Repository) createPreviewCase(q previewCaseQueryer, paletteID string, req *CreatePreviewCaseRequest) (*PalettePreviewCase, error) {
	if err := validateCreatePreviewCaseRequest(req); err != nil {
		return nil, err
	}

	var seedValue interface{}
	if req.SeedValue != nil {
		seedValue = *req.SeedValue
	}

	row := q.QueryRow(`
		INSERT INTO palette_preview_cases (
			palette_id, chart_type, template_id, template_version, schema_version,
			color_roles, preview_config, seed_strategy, seed_value, is_primary, status
		) VALUES (
			$1, $2, $3, $4, $5,
			$6, $7, $8, $9, FALSE, 'draft'
		)
		RETURNING `+previewCaseSelectColumns,
		paletteID,
		req.ChartType,
		req.TemplateID,
		req.TemplateVersion,
		req.SchemaVersion,
		req.ColorRoles,
		req.PreviewConfig,
		req.SeedStrategy,
		seedValue,
	)
	previewCase, err := scanPreviewCase(row)
	if err != nil {
		return nil, classifyPreviewCaseDBError("create preview case", err)
	}

	return previewCase, nil
}

func (r *Repository) GetPreviewCaseByID(id string) (*PalettePreviewCase, error) {
	return r.getPreviewCaseByID(database.DB, id, false)
}

func (r *Repository) GetPreviewCaseByIDForUpdateTx(tx *sql.Tx, id string) (*PalettePreviewCase, error) {
	return r.getPreviewCaseByID(tx, id, true)
}

func (r *Repository) getPreviewCaseByID(q previewCaseQueryer, id string, forUpdate bool) (*PalettePreviewCase, error) {
	lockClause := ""
	if forUpdate {
		lockClause = " FOR UPDATE"
	}
	previewCase, err := scanPreviewCase(q.QueryRow(`
		SELECT `+previewCaseSelectColumns+`
		FROM palette_preview_cases
		WHERE id = $1
	`+lockClause, id))
	if err == sql.ErrNoRows {
		return nil, ErrPreviewCaseNotFound
	}
	if err != nil {
		return nil, classifyPreviewCaseDBError("get preview case", err)
	}
	return previewCase, nil
}

func (r *Repository) ListPreviewCasesByPalette(paletteID string, includeArchived bool) ([]*PalettePreviewCase, error) {
	query := `
		SELECT ` + previewCaseSelectColumns + `
		FROM palette_preview_cases
		WHERE palette_id = $1
	`
	args := []interface{}{paletteID}
	if !includeArchived {
		query += " AND status <> 'archived'"
	}
	query += previewCaseOrderClause()

	return queryPreviewCases(database.DB, query, args...)
}

func (r *Repository) UpdatePreviewCase(id string, req *UpdatePreviewCaseRequest) (*PalettePreviewCase, error) {
	return r.updatePreviewCase(database.DB, id, req)
}

func (r *Repository) UpdatePreviewCaseTx(tx *sql.Tx, id string, req *UpdatePreviewCaseRequest) (*PalettePreviewCase, error) {
	return r.updatePreviewCase(tx, id, req)
}

func (r *Repository) updatePreviewCase(q previewCaseQueryer, id string, req *UpdatePreviewCaseRequest) (*PalettePreviewCase, error) {
	if err := validateUpdatePreviewCaseRequest(req); err != nil {
		return nil, err
	}

	var setClauses []string
	var args []interface{}
	argIndex := 1

	if req.ChartType != nil {
		setClauses = append(setClauses, fmt.Sprintf("chart_type = $%d", argIndex))
		args = append(args, *req.ChartType)
		argIndex++
	}
	if req.TemplateID != nil {
		setClauses = append(setClauses, fmt.Sprintf("template_id = $%d", argIndex))
		args = append(args, *req.TemplateID)
		argIndex++
	}
	if req.TemplateVersion != nil {
		setClauses = append(setClauses, fmt.Sprintf("template_version = $%d", argIndex))
		args = append(args, *req.TemplateVersion)
		argIndex++
	}
	if req.SchemaVersion != nil {
		setClauses = append(setClauses, fmt.Sprintf("schema_version = $%d", argIndex))
		args = append(args, *req.SchemaVersion)
		argIndex++
	}
	if req.ColorRoles != nil {
		setClauses = append(setClauses, fmt.Sprintf("color_roles = $%d", argIndex))
		args = append(args, req.ColorRoles)
		argIndex++
	}
	if req.PreviewConfig != nil {
		setClauses = append(setClauses, fmt.Sprintf("preview_config = $%d", argIndex))
		args = append(args, req.PreviewConfig)
		argIndex++
	}
	if req.SeedStrategy != nil {
		setClauses = append(setClauses, fmt.Sprintf("seed_strategy = $%d", argIndex))
		args = append(args, *req.SeedStrategy)
		argIndex++
	}
	if req.SeedValue.Present {
		setClauses = append(setClauses, fmt.Sprintf("seed_value = $%d", argIndex))
		if req.SeedValue.Null {
			args = append(args, nil)
		} else {
			args = append(args, req.SeedValue.Value)
		}
		argIndex++
	}

	if len(setClauses) == 0 {
		return r.getPreviewCaseByID(q, id, false)
	}

	setClauses = append(setClauses, "updated_at = NOW()")
	args = append(args, id)

	query := fmt.Sprintf(`
		UPDATE palette_preview_cases
		SET %s
		WHERE id = $%d
		RETURNING %s
	`, strings.Join(setClauses, ", "), argIndex, previewCaseSelectColumns)

	previewCase, err := scanPreviewCase(q.QueryRow(query, args...))
	if err == sql.ErrNoRows {
		return nil, ErrPreviewCaseNotFound
	}
	if err != nil {
		return nil, classifyPreviewCaseDBError("update preview case", err)
	}
	return previewCase, nil
}

func (r *Repository) DeletePreviewCase(id string) error {
	return r.deletePreviewCase(database.DB, id)
}

func (r *Repository) DeletePreviewCaseTx(tx *sql.Tx, id string) error {
	return r.deletePreviewCase(tx, id)
}

func (r *Repository) deletePreviewCase(q previewCaseQueryer, id string) error {
	result, err := q.Exec(`
		DELETE FROM palette_preview_cases
		WHERE id = $1
	`, id)
	if err != nil {
		return classifyPreviewCaseDBError("delete preview case", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err == nil && rowsAffected == 0 {
		return ErrPreviewCaseNotFound
	}
	return nil
}

func (r *Repository) UpdatePreviewCaseLifecycleTx(tx *sql.Tx, id string, status string, isPrimary bool) (*PalettePreviewCase, error) {
	previewCase, err := scanPreviewCase(tx.QueryRow(`
		UPDATE palette_preview_cases
		SET status = $1, is_primary = $2, updated_at = NOW()
		WHERE id = $3
		RETURNING `+previewCaseSelectColumns,
		status,
		isPrimary,
		id,
	))
	if err == sql.ErrNoRows {
		return nil, ErrPreviewCaseNotFound
	}
	if err != nil {
		return nil, classifyPreviewCaseDBError("update preview case lifecycle", err)
	}
	return previewCase, nil
}

func (r *Repository) UnsetPrimaryPreviewCasesTx(tx *sql.Tx, paletteID string) error {
	_, err := tx.Exec(`
		UPDATE palette_preview_cases
		SET is_primary = FALSE, updated_at = NOW()
		WHERE palette_id = $1 AND is_primary = TRUE
	`, paletteID)
	if err != nil {
		return classifyPreviewCaseDBError("unset primary preview cases", err)
	}
	return nil
}

func (r *Repository) SetPrimaryPreviewCaseTx(tx *sql.Tx, id string) (*PalettePreviewCase, error) {
	previewCase, err := scanPreviewCase(tx.QueryRow(`
		UPDATE palette_preview_cases
		SET is_primary = TRUE, updated_at = NOW()
		WHERE id = $1
		RETURNING `+previewCaseSelectColumns,
		id,
	))
	if err == sql.ErrNoRows {
		return nil, ErrPreviewCaseNotFound
	}
	if err != nil {
		return nil, classifyPreviewCaseDBError("set primary preview case", err)
	}
	return previewCase, nil
}

func (r *Repository) GetPrimaryPublishedPreviewByPalette(paletteID string) (*PalettePreviewCase, error) {
	previewCase, err := scanPreviewCase(database.DB.QueryRow(`
		SELECT `+previewCaseSelectColumns+`
		FROM palette_preview_cases
		WHERE palette_id = $1
			AND status = 'published'
			AND is_primary = TRUE
		ORDER BY created_at ASC, id ASC
		LIMIT 1
	`, paletteID))
	if err == sql.ErrNoRows {
		return nil, ErrPreviewCaseNotFound
	}
	if err != nil {
		return nil, classifyPreviewCaseDBError("get primary published preview case", err)
	}
	return previewCase, nil
}

func (r *Repository) ListPublishedPreviewCasesByPalette(paletteID string) ([]*PalettePreviewCase, error) {
	return queryPreviewCases(database.DB, `
		SELECT `+previewCaseSelectColumns+`
		FROM palette_preview_cases
		WHERE palette_id = $1
			AND status = 'published'
	`+previewCaseOrderClause(), paletteID)
}

func (r *Repository) ListPublishedPreviewCasesByPalettes(paletteIDs []string) (map[string][]*PalettePreviewCase, error) {
	previewCasesByPalette := make(map[string][]*PalettePreviewCase, len(paletteIDs))
	if len(paletteIDs) == 0 {
		return previewCasesByPalette, nil
	}

	previewCases, err := queryPreviewCases(database.DB, `
		SELECT `+previewCaseSelectColumns+`
		FROM palette_preview_cases
		WHERE palette_id = ANY($1)
			AND status = 'published'
	`+previewCaseOrderClause(), pq.Array(paletteIDs))
	if err != nil {
		return nil, err
	}
	for _, previewCase := range previewCases {
		previewCasesByPalette[previewCase.PaletteID] = append(previewCasesByPalette[previewCase.PaletteID], previewCase)
	}
	return previewCasesByPalette, nil
}

func queryPreviewCases(q previewCaseQueryer, query string, args ...interface{}) ([]*PalettePreviewCase, error) {
	rows, err := q.Query(query, args...)
	if err != nil {
		return nil, classifyPreviewCaseDBError("query preview cases", err)
	}
	defer rows.Close()

	previewCases := make([]*PalettePreviewCase, 0)
	for rows.Next() {
		previewCase, err := scanPreviewCase(rows)
		if err != nil {
			return nil, classifyPreviewCaseDBError("scan preview case", err)
		}
		previewCases = append(previewCases, previewCase)
	}
	if err := rows.Err(); err != nil {
		return nil, classifyPreviewCaseDBError("iterate preview cases", err)
	}
	return previewCases, nil
}

func previewCaseOrderClause() string {
	return `
		ORDER BY is_primary DESC, created_at ASC, id ASC
	`
}

type previewCaseScanner interface {
	Scan(dest ...interface{}) error
}

func scanPreviewCase(scanner previewCaseScanner) (*PalettePreviewCase, error) {
	var previewCase PalettePreviewCase
	var seedValue sql.NullInt64
	err := scanner.Scan(
		&previewCase.ID,
		&previewCase.PaletteID,
		&previewCase.ChartType,
		&previewCase.TemplateID,
		&previewCase.TemplateVersion,
		&previewCase.SchemaVersion,
		&previewCase.ColorRoles,
		&previewCase.PreviewConfig,
		&previewCase.SeedStrategy,
		&seedValue,
		&previewCase.IsPrimary,
		&previewCase.Status,
		&previewCase.CreatedAt,
		&previewCase.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	if seedValue.Valid {
		value := int(seedValue.Int64)
		previewCase.SeedValue = &value
	}
	return &previewCase, nil
}

func classifyPreviewCaseDBError(operation string, err error) error {
	var pqErr *pq.Error
	if errors.As(err, &pqErr) {
		switch pqErr.Code {
		case "23505":
			return fmt.Errorf("%s: %w", operation, ErrPreviewCaseConflict)
		case "23503":
			return fmt.Errorf("%s: %w", operation, ErrPreviewCaseForeignKey)
		case "23514":
			return fmt.Errorf("%s: %w", operation, ErrPreviewCaseConstraint)
		}
	}
	return fmt.Errorf("%s failed: %w", operation, err)
}
