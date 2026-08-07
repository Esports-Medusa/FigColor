package palette

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"encoding/json"
	"errors"
	"io"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/qiqi/figcolor/backend/internal/database"
)

func TestUpdatePreviewCaseUsesLockedStateBeforeMergeAndValidation(t *testing.T) {
	restore := installScriptedDB(t, []scriptedDBOp{
		queryOp("FROM palette_preview_cases", "FOR UPDATE", previewCaseRow(PreviewCaseStatusDraft, false)),
		queryOp("FROM palettes", "", paletteRow(t)),
		queryOp("UPDATE palette_preview_cases", "", previewCaseRow(PreviewCaseStatusDraft, false)),
	})
	defer restore()

	previewConfig := validBarErrorPreviewConfigJSON()
	previewCase, err := NewService(NewRepository()).UpdatePreviewCase("preview-1", &UpdatePreviewCaseRequest{
		PreviewConfig: previewConfig,
	})
	if err != nil {
		t.Fatalf("UpdatePreviewCase returned error: %v", err)
	}
	if previewCase.ID != "preview-1" {
		t.Fatalf("preview case id = %q, want preview-1", previewCase.ID)
	}

	assertScriptedEvents(t,
		"begin",
		"query SELECT id, palette_id, chart_type",
		"query SELECT id, slug, name, owner_user_id, visibility, origin, source_palette_id",
		"query UPDATE palette_preview_cases",
		"commit",
	)
}

func TestPublishPreviewCaseEvaluatesStatusInsideTransaction(t *testing.T) {
	restore := installScriptedDB(t, []scriptedDBOp{
		queryOp("FROM palette_preview_cases", "FOR UPDATE", previewCaseRow(PreviewCaseStatusDraft, false)),
		queryOp("FROM palettes", "", paletteRow(t)),
		queryOp("UPDATE palette_preview_cases", "", previewCaseRow(PreviewCaseStatusPublished, false)),
	})
	defer restore()

	previewCase, err := NewService(NewRepository()).PublishPreviewCase("preview-1")
	if err != nil {
		t.Fatalf("PublishPreviewCase returned error: %v", err)
	}
	if previewCase.Status != PreviewCaseStatusPublished {
		t.Fatalf("status = %q, want published", previewCase.Status)
	}

	assertScriptedEvents(t,
		"begin",
		"query SELECT id, palette_id, chart_type",
		"query SELECT id, slug, name, owner_user_id, visibility, origin, source_palette_id",
		"query UPDATE palette_preview_cases",
		"commit",
	)
}

func TestPublishPreviewCaseRejectsArchivedAfterLocking(t *testing.T) {
	restore := installScriptedDB(t, []scriptedDBOp{
		queryOp("FROM palette_preview_cases", "FOR UPDATE", previewCaseRow(PreviewCaseStatusArchived, false)),
		queryOp("FROM palettes", "", paletteRow(t)),
	})
	defer restore()

	_, err := NewService(NewRepository()).PublishPreviewCase("preview-1")
	if !errors.Is(err, ErrInvalidPreviewCaseLifecycleTransition) {
		t.Fatalf("PublishPreviewCase error = %v, want lifecycle transition error", err)
	}

	assertScriptedEvents(t,
		"begin",
		"query SELECT id, palette_id, chart_type",
		"query SELECT id, slug, name, owner_user_id, visibility, origin, source_palette_id",
		"rollback",
	)
}

func TestPublishPreviewCaseAlreadyPublishedIsIdempotentInsideTransaction(t *testing.T) {
	restore := installScriptedDB(t, []scriptedDBOp{
		queryOp("FROM palette_preview_cases", "FOR UPDATE", previewCaseRow(PreviewCaseStatusPublished, false)),
		queryOp("FROM palettes", "", paletteRow(t)),
	})
	defer restore()

	previewCase, err := NewService(NewRepository()).PublishPreviewCase("preview-1")
	if err != nil {
		t.Fatalf("PublishPreviewCase returned error: %v", err)
	}
	if previewCase.Status != PreviewCaseStatusPublished {
		t.Fatalf("status = %q, want published", previewCase.Status)
	}

	assertScriptedEvents(t,
		"begin",
		"query SELECT id, palette_id, chart_type",
		"query SELECT id, slug, name, owner_user_id, visibility, origin, source_palette_id",
		"commit",
	)
}

func TestArchivePreviewCaseEvaluatesStatusInsideTransactionAndClearsPrimary(t *testing.T) {
	restore := installScriptedDB(t, []scriptedDBOp{
		queryOp("FROM palette_preview_cases", "FOR UPDATE", previewCaseRow(PreviewCaseStatusPublished, true)),
		queryOp("FROM palettes", "", paletteRow(t)),
		queryOp("UPDATE palette_preview_cases", "", previewCaseRow(PreviewCaseStatusArchived, false)),
	})
	defer restore()

	previewCase, err := NewService(NewRepository()).ArchivePreviewCase("preview-1")
	if err != nil {
		t.Fatalf("ArchivePreviewCase returned error: %v", err)
	}
	if previewCase.Status != PreviewCaseStatusArchived || previewCase.IsPrimary {
		t.Fatalf("archived preview = status %q primary %v, want archived non-primary", previewCase.Status, previewCase.IsPrimary)
	}

	assertScriptedEvents(t,
		"begin",
		"query SELECT id, palette_id, chart_type",
		"query SELECT id, slug, name, owner_user_id, visibility, origin, source_palette_id",
		"query UPDATE palette_preview_cases",
		"commit",
	)
}

func TestSetPrimaryPreviewCaseUsesPaletteLockOrderingAndRequiresPublished(t *testing.T) {
	restore := installScriptedDB(t, []scriptedDBOp{
		queryOp("FROM palette_preview_cases", "", previewCaseRow(PreviewCaseStatusPublished, false)),
		queryOp("FROM palettes", "FOR UPDATE", paletteRow(t)),
		queryOp("FROM palette_preview_cases", "FOR UPDATE", previewCaseRow(PreviewCaseStatusPublished, false)),
		execOp("UPDATE palette_preview_cases", "is_primary = FALSE"),
		queryOp("UPDATE palette_preview_cases", "is_primary = TRUE", previewCaseRow(PreviewCaseStatusPublished, true)),
	})
	defer restore()

	previewCase, err := NewService(NewRepository()).SetPrimaryPreviewCase("preview-1")
	if err != nil {
		t.Fatalf("SetPrimaryPreviewCase returned error: %v", err)
	}
	if !previewCase.IsPrimary {
		t.Fatal("target preview case was not marked primary")
	}

	assertScriptedEvents(t,
		"query SELECT id, palette_id, chart_type, template_id, template_version, schema_version",
		"begin",
		"query SELECT id, slug, name, owner_user_id, visibility, origin, source_palette_id",
		"query SELECT id, palette_id, chart_type, template_id, template_version, schema_version",
		"exec UPDATE palette_preview_cases",
		"query UPDATE palette_preview_cases",
		"commit",
	)
}

func TestSetPrimaryPreviewCaseRejectsDraftAfterPaletteLock(t *testing.T) {
	restore := installScriptedDB(t, []scriptedDBOp{
		queryOp("FROM palette_preview_cases", "", previewCaseRow(PreviewCaseStatusDraft, false)),
		queryOp("FROM palettes", "FOR UPDATE", paletteRow(t)),
		queryOp("FROM palette_preview_cases", "FOR UPDATE", previewCaseRow(PreviewCaseStatusDraft, false)),
	})
	defer restore()

	_, err := NewService(NewRepository()).SetPrimaryPreviewCase("preview-1")
	if !errors.Is(err, ErrInvalidPreviewCaseLifecycleTransition) {
		t.Fatalf("SetPrimaryPreviewCase error = %v, want lifecycle transition error", err)
	}

	assertScriptedEvents(t,
		"query SELECT id, palette_id, chart_type, template_id, template_version, schema_version",
		"begin",
		"query SELECT id, slug, name, owner_user_id, visibility, origin, source_palette_id",
		"query SELECT id, palette_id, chart_type, template_id, template_version, schema_version",
		"rollback",
	)
}

func TestUpdatePreviewCaseRollsBackOnTransactionError(t *testing.T) {
	restore := installScriptedDB(t, []scriptedDBOp{
		queryOp("FROM palette_preview_cases", "FOR UPDATE", previewCaseRow(PreviewCaseStatusDraft, false)),
		queryOp("FROM palettes", "", paletteRow(t)),
		errorQueryOp("UPDATE palette_preview_cases", "", errors.New("driver update failed")),
	})
	defer restore()

	previewConfig := validBarErrorPreviewConfigJSON()
	_, err := NewService(NewRepository()).UpdatePreviewCase("preview-1", &UpdatePreviewCaseRequest{
		PreviewConfig: previewConfig,
	})
	if err == nil || !strings.Contains(err.Error(), "driver update failed") {
		t.Fatalf("UpdatePreviewCase error = %v, want wrapped driver update error", err)
	}

	assertScriptedEvents(t,
		"begin",
		"query SELECT id, palette_id, chart_type",
		"query SELECT id, slug, name, owner_user_id, visibility, origin, source_palette_id",
		"query UPDATE palette_preview_cases",
		"rollback",
	)
}

func TestDeleteDraftPreviewCaseLocksChecksDeletesAndCommits(t *testing.T) {
	restore := installScriptedDB(t, []scriptedDBOp{
		queryOp("FROM palette_preview_cases", "FOR UPDATE", previewCaseRow(PreviewCaseStatusDraft, false)),
		queryOp("FROM palettes", "", paletteRow(t)),
		execOp("DELETE FROM palette_preview_cases", ""),
	})
	defer restore()

	err := NewService(NewRepository()).DeleteDraftPreviewCase("preview-1")
	if err != nil {
		t.Fatalf("DeleteDraftPreviewCase returned error: %v", err)
	}

	assertScriptedEvents(t,
		"begin",
		"query SELECT id, palette_id, chart_type",
		"query SELECT id, slug, name, owner_user_id, visibility, origin, source_palette_id",
		"exec DELETE FROM palette_preview_cases",
		"commit",
	)
}

func TestDeleteDraftPreviewCaseRejectsPublishedAndRollsBack(t *testing.T) {
	restore := installScriptedDB(t, []scriptedDBOp{
		queryOp("FROM palette_preview_cases", "FOR UPDATE", previewCaseRow(PreviewCaseStatusPublished, false)),
		queryOp("FROM palettes", "", paletteRow(t)),
	})
	defer restore()

	err := NewService(NewRepository()).DeleteDraftPreviewCase("preview-1")
	if !errors.Is(err, ErrInvalidPreviewCaseLifecycleTransition) {
		t.Fatalf("DeleteDraftPreviewCase error = %v, want lifecycle transition error", err)
	}

	assertScriptedEvents(t,
		"begin",
		"query SELECT id, palette_id, chart_type",
		"query SELECT id, slug, name, owner_user_id, visibility, origin, source_palette_id",
		"rollback",
	)
}

func TestDeleteDraftPreviewCaseRejectsArchivedAndRollsBack(t *testing.T) {
	restore := installScriptedDB(t, []scriptedDBOp{
		queryOp("FROM palette_preview_cases", "FOR UPDATE", previewCaseRow(PreviewCaseStatusArchived, false)),
		queryOp("FROM palettes", "", paletteRow(t)),
	})
	defer restore()

	err := NewService(NewRepository()).DeleteDraftPreviewCase("preview-1")
	if !errors.Is(err, ErrInvalidPreviewCaseLifecycleTransition) {
		t.Fatalf("DeleteDraftPreviewCase error = %v, want lifecycle transition error", err)
	}

	assertScriptedEvents(t,
		"begin",
		"query SELECT id, palette_id, chart_type",
		"query SELECT id, slug, name, owner_user_id, visibility, origin, source_palette_id",
		"rollback",
	)
}

func TestDeleteDraftPreviewCaseRollsBackOnDeleteSQLFailure(t *testing.T) {
	restore := installScriptedDB(t, []scriptedDBOp{
		queryOp("FROM palette_preview_cases", "FOR UPDATE", previewCaseRow(PreviewCaseStatusDraft, false)),
		queryOp("FROM palettes", "", paletteRow(t)),
		errorExecOp("DELETE FROM palette_preview_cases", "", errors.New("driver delete failed")),
	})
	defer restore()

	err := NewService(NewRepository()).DeleteDraftPreviewCase("preview-1")
	if err == nil || !strings.Contains(err.Error(), "driver delete failed") {
		t.Fatalf("DeleteDraftPreviewCase error = %v, want wrapped driver delete error", err)
	}

	assertScriptedEvents(t,
		"begin",
		"query SELECT id, palette_id, chart_type",
		"query SELECT id, slug, name, owner_user_id, visibility, origin, source_palette_id",
		"exec DELETE FROM palette_preview_cases",
		"rollback",
	)
}

func TestDeleteDraftPreviewCaseNotFoundRollsBack(t *testing.T) {
	restore := installScriptedDB(t, []scriptedDBOp{
		queryOp("FROM palette_preview_cases", "FOR UPDATE", emptyPreviewCaseRows()),
	})
	defer restore()

	err := NewService(NewRepository()).DeleteDraftPreviewCase("missing")
	if !errors.Is(err, ErrPreviewCaseNotFound) {
		t.Fatalf("DeleteDraftPreviewCase error = %v, want not found", err)
	}

	assertScriptedEvents(t,
		"begin",
		"query SELECT id, palette_id, chart_type",
		"rollback",
	)
}

func TestColorReferenceSourceValidation(t *testing.T) {
	service := NewService(NewRepository())
	palette := testPaletteWithColors(t)

	if err := service.validatePreviewCaseCandidate(palette, validPreviewCaseCandidate()); err != nil {
		t.Fatalf("source validation rejected valid bar_error roles: %v", err)
	}

	candidate := validPreviewCaseCandidate()
	candidate.ColorRoles = json.RawMessage(`{
		"groups": [
			{"key":"control","label":"Control","fill":{"source":"inline","color_id":"color-1"}},
			{"key":"treated","label":"Treated","fill":{"source":"palette","color_id":"color-2"}},
			{"key":"rescue","label":"Rescue","fill":{"source":"palette","color_id":"color-1"}}
		],
		"elements": {
			"axis":{"source":"theme","token":"foreground"},
			"grid":{"source":"theme","token":"grid"},
			"text":{"source":"theme","token":"muted_foreground"},
			"error_bar":{"source":"theme","token":"foreground"},
			"background":{"source":"theme","token":"background"}
		}
	}`)
	err := service.validatePreviewCaseCandidate(palette, candidate)
	if err == nil {
		t.Fatal("expected validation error")
	}
	validationErr, ok := IsValidationError(err)
	if !ok {
		t.Fatalf("error type = %T, want validation error", err)
	}
	assertValidationIssue(t, validationErr.Issues, "preview_case.color_roles.groups[0].fill.source", "INVALID_COLOR_REFERENCE")
}

type scriptedDBOp struct {
	kind     string
	contains []string
	rows     *scriptedRows
	err      error
}

type scriptedRows struct {
	columns []string
	values  [][]driver.Value
	index   int
}

type scriptedDBState struct {
	mu     sync.Mutex
	ops    []scriptedDBOp
	events []string
}

var scriptedState *scriptedDBState

func init() {
	sql.Register("figcolor_scripted_tx", scriptedDriver{})
}

func installScriptedDB(t *testing.T, ops []scriptedDBOp) func() {
	t.Helper()
	previousDB := database.DB
	state := &scriptedDBState{ops: ops}
	scriptedState = state
	db, err := sql.Open("figcolor_scripted_tx", "test")
	if err != nil {
		t.Fatalf("open scripted db: %v", err)
	}
	database.DB = db
	return func() {
		db.Close()
		database.DB = previousDB
		scriptedState = nil
		if remaining := state.remainingOps(); remaining != 0 {
			t.Fatalf("%d scripted DB operations were not consumed", remaining)
		}
	}
}

func queryOp(contains string, alsoContains string, rows *scriptedRows) scriptedDBOp {
	op := scriptedDBOp{kind: "query", contains: []string{contains}, rows: rows}
	if alsoContains != "" {
		op.contains = append(op.contains, alsoContains)
	}
	return op
}

func errorQueryOp(contains string, alsoContains string, err error) scriptedDBOp {
	op := scriptedDBOp{kind: "query", contains: []string{contains}, err: err}
	if alsoContains != "" {
		op.contains = append(op.contains, alsoContains)
	}
	return op
}

func execOp(contains string, alsoContains string) scriptedDBOp {
	op := scriptedDBOp{kind: "exec", contains: []string{contains}}
	if alsoContains != "" {
		op.contains = append(op.contains, alsoContains)
	}
	return op
}

func errorExecOp(contains string, alsoContains string, err error) scriptedDBOp {
	op := scriptedDBOp{kind: "exec", contains: []string{contains}, err: err}
	if alsoContains != "" {
		op.contains = append(op.contains, alsoContains)
	}
	return op
}

func emptyPreviewCaseRows() *scriptedRows {
	return &scriptedRows{
		columns: []string{
			"id", "palette_id", "chart_type", "template_id", "template_version", "schema_version",
			"color_roles", "preview_config", "seed_strategy", "seed_value", "is_primary", "status",
			"created_at", "updated_at",
		},
	}
}

func previewCaseRow(status string, isPrimary bool) *scriptedRows {
	now := time.Now()
	return &scriptedRows{
		columns: []string{
			"id", "palette_id", "chart_type", "template_id", "template_version", "schema_version",
			"color_roles", "preview_config", "seed_strategy", "seed_value", "is_primary", "status",
			"created_at", "updated_at",
		},
		values: [][]driver.Value{{
			"preview-1",
			"palette-1",
			ChartTypeBarError,
			"bar_error_v1",
			int64(1),
			int64(1),
			[]byte(validBarErrorColorRolesJSON()),
			[]byte(validBarErrorPreviewConfigJSON()),
			PreviewCaseSeedStrategyStableID,
			nil,
			isPrimary,
			status,
			now,
			now,
		}},
	}
}

func paletteRow(t *testing.T) *scriptedRows {
	return paletteRowWithVisibility(t, "public", "curated", nil)
}

func paletteRowWithVisibility(t *testing.T, visibility string, origin string, ownerUserID driver.Value) *scriptedRows {
	t.Helper()
	colors, err := json.Marshal([]PaletteColor{
		{ID: "color-1", Hex: "#112233", RGB: [3]int{17, 34, 51}, Order: 0},
		{ID: "color-2", Hex: "#445566", RGB: [3]int{68, 85, 102}, Order: 1},
	})
	if err != nil {
		t.Fatalf("marshal colors: %v", err)
	}
	now := time.Now()
	return &scriptedRows{
		columns: []string{
			"id", "slug", "name", "owner_user_id", "visibility", "origin", "source_palette_id",
			"colors", "color_count", "type",
			"chart_types", "chart_applicability", "journal_style", "discipline", "use_case", "avoid_case", "tags",
			"accessibility", "source_type", "source_image", "source_note",
			"status", "version", "created_by", "created_at", "updated_at",
			"published_at", "archived_at",
		},
		values: [][]driver.Value{{
			"palette-1",
			"palette-one",
			"Palette One",
			ownerUserID,
			visibility,
			origin,
			nil,
			colors,
			int64(2),
			"categorical",
			"{bar_error}",
			nil,
			"{}",
			"{}",
			"{}",
			"{}",
			"{}",
			[]byte(`{"colorblind_safe":false,"print_friendly":false,"dark_background":false}`),
			nil,
			nil,
			nil,
			"published",
			nil,
			nil,
			now,
			now,
			nil,
			nil,
		}},
	}
}

func assertScriptedEvents(t *testing.T, expected ...string) {
	t.Helper()
	events := scriptedState.snapshotEvents()
	if len(events) != len(expected) {
		t.Fatalf("events = %#v, want %#v", events, expected)
	}
	for index := range expected {
		if !strings.HasPrefix(events[index], expected[index]) {
			t.Fatalf("event[%d] = %q, want prefix %q; all events %#v", index, events[index], expected[index], events)
		}
	}
}

type scriptedDriver struct{}

func (scriptedDriver) Open(name string) (driver.Conn, error) {
	return scriptedConn{}, nil
}

type scriptedConn struct{}

func (scriptedConn) Prepare(query string) (driver.Stmt, error) {
	return nil, errors.New("prepare is not supported by scripted driver")
}

func (scriptedConn) Close() error {
	return nil
}

func (scriptedConn) Begin() (driver.Tx, error) {
	scriptedState.record("begin")
	return scriptedTx{}, nil
}

func (scriptedConn) QueryContext(ctx context.Context, query string, args []driver.NamedValue) (driver.Rows, error) {
	return scriptedState.query(query)
}

func (scriptedConn) ExecContext(ctx context.Context, query string, args []driver.NamedValue) (driver.Result, error) {
	return scriptedState.exec(query)
}

type scriptedTx struct{}

func (scriptedTx) Commit() error {
	scriptedState.record("commit")
	return nil
}

func (scriptedTx) Rollback() error {
	scriptedState.record("rollback")
	return nil
}

func (s *scriptedDBState) query(query string) (driver.Rows, error) {
	op, err := s.pop("query", query)
	if err != nil {
		return nil, err
	}
	if op.err != nil {
		return nil, op.err
	}
	return op.rows.clone(), nil
}

func (s *scriptedDBState) exec(query string) (driver.Result, error) {
	op, err := s.pop("exec", query)
	if err != nil {
		return nil, err
	}
	if op.err != nil {
		return nil, op.err
	}
	return driver.RowsAffected(1), nil
}

func (s *scriptedDBState) pop(kind string, query string) (scriptedDBOp, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.events = append(s.events, kind+" "+firstSQLLine(query))
	if len(s.ops) == 0 {
		return scriptedDBOp{}, errors.New("unexpected scripted DB operation")
	}
	op := s.ops[0]
	s.ops = s.ops[1:]
	if op.kind != kind {
		return scriptedDBOp{}, errors.New("unexpected scripted DB operation kind")
	}
	for _, contains := range op.contains {
		if !strings.Contains(query, contains) {
			return scriptedDBOp{}, errors.New("scripted DB query did not contain expected SQL fragment")
		}
	}
	return op, nil
}

func (s *scriptedDBState) record(event string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.events = append(s.events, event)
}

func (s *scriptedDBState) snapshotEvents() []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	events := make([]string, len(s.events))
	copy(events, s.events)
	return events
}

func (s *scriptedDBState) remainingOps() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return len(s.ops)
}

func firstSQLLine(query string) string {
	return strings.Join(strings.Fields(query), " ")
}

func (r *scriptedRows) Columns() []string {
	return r.columns
}

func (r *scriptedRows) Close() error {
	return nil
}

func (r *scriptedRows) Next(dest []driver.Value) error {
	if r.index >= len(r.values) {
		return io.EOF
	}
	copy(dest, r.values[r.index])
	r.index++
	return nil
}

func (r *scriptedRows) clone() *scriptedRows {
	values := make([][]driver.Value, len(r.values))
	for index := range r.values {
		values[index] = append([]driver.Value(nil), r.values[index]...)
	}
	return &scriptedRows{
		columns: append([]string(nil), r.columns...),
		values:  values,
	}
}
