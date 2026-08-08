package palette

import (
	"database/sql"
	"errors"
	"os"
	"sync"
	"testing"

	"github.com/qiqi/figcolor/backend/internal/database"
)

func TestCandidateRejectionPostgres(t *testing.T) {
	dsn := os.Getenv("FIGCOLOR_REJECTION_TEST_DSN")
	if dsn == "" {
		t.Skip("FIGCOLOR_REJECTION_TEST_DSN is required")
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	previous := database.DB
	database.DB = db
	defer func() { database.DB = previous }()
	service := NewService(NewRepository())

	id := insertPublicationCandidate(t, db, "reject-valid", "candidate", "public", nil)
	insertPublicationIngestion(t, db, id, `[]`)
	pc := validPreviewCaseCandidate()
	preview, err := service.CreatePreviewCase(id, &CreatePreviewCaseRequest{ChartType: pc.ChartType, TemplateID: pc.TemplateID, TemplateVersion: pc.TemplateVersion, SchemaVersion: pc.SchemaVersion, ColorRoles: pc.ColorRoles, PreviewConfig: pc.PreviewConfig, SeedStrategy: pc.SeedStrategy, SeedValue: pc.SeedValue})
	if err != nil {
		t.Fatal(err)
	}
	preview, err = service.PublishPreviewCase(preview.ID)
	if err != nil {
		t.Fatal(err)
	}
	preview, err = service.SetPrimaryPreviewCase(preview.ID)
	if err != nil {
		t.Fatal(err)
	}
	var receiptBefore, applicabilityBefore string
	if err := db.QueryRow(`SELECT r.receipt::text,p.chart_applicability::text FROM palettes p JOIN palette_ingestion_records r ON r.palette_id=p.id WHERE p.id=$1`, id).Scan(&receiptBefore, &applicabilityBefore); err != nil {
		t.Fatal(err)
	}
	assertPaletteAbsentFromPublicList(t, service, id)
	rejected, err := service.Reject(id)
	if err != nil {
		t.Fatal(err)
	}
	if rejected.ID != id || rejected.Status != "archived" || rejected.ArchivedAt == nil {
		t.Fatalf("rejected=%+v", rejected)
	}
	var receiptAfter, applicabilityAfter, previewStatus string
	var primary bool
	if err := db.QueryRow(`SELECT r.receipt::text,p.chart_applicability::text,pc.status,pc.is_primary FROM palettes p JOIN palette_ingestion_records r ON r.palette_id=p.id JOIN palette_preview_cases pc ON pc.palette_id=p.id WHERE p.id=$1`, id).Scan(&receiptAfter, &applicabilityAfter, &previewStatus, &primary); err != nil {
		t.Fatal(err)
	}
	if receiptAfter != receiptBefore || applicabilityAfter != applicabilityBefore || previewStatus != "archived" || primary {
		t.Fatalf("aggregate not preserved receipt=%v applicability=%v preview=%s primary=%v", receiptAfter == receiptBefore, applicabilityAfter == applicabilityBefore, previewStatus, primary)
	}
	assertPaletteAbsentFromPublicList(t, service, id)
	if _, err := service.GetPublicBySlug("publication-reject-valid"); err == nil {
		t.Fatal("rejected detail remained public")
	}
	if _, err := service.Reject(id); !errors.Is(err, ErrPaletteRejectionConflict) {
		t.Fatalf("repeat err=%v", err)
	}

	nonImported := insertPublicationCandidate(t, db, "reject-manual", "candidate", "public", nil)
	if _, err := service.Reject(nonImported); !errors.Is(err, ErrPaletteNotImportedCandidate) {
		t.Fatalf("manual err=%v", err)
	}
	var owner string
	if err := db.QueryRow(`SELECT id FROM users ORDER BY created_at LIMIT 1`).Scan(&owner); err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		name, visibility string
		owner            *string
	}{{"owned", "public", &owner}, {"private", "private", &owner}} {
		pid := insertPublicationCandidate(t, db, "reject-"+tc.name, "candidate", tc.visibility, tc.owner)
		if _, err := service.Reject(pid); !errors.Is(err, ErrPaletteNotAdminManageable) {
			t.Fatalf("%s err=%v", tc.name, err)
		}
	}
	for _, status := range []string{"draft", "published", "archived"} {
		sid := insertPublicationCandidate(t, db, "reject-"+status, status, "public", nil)
		insertPublicationIngestion(t, db, sid, `[]`)
		if _, err := service.Reject(sid); !errors.Is(err, ErrPaletteRejectionConflict) {
			t.Fatalf("%s err=%v", status, err)
		}
	}
	if _, err := service.Reject("00000000-0000-0000-0000-000000000099"); !errors.Is(err, ErrPaletteNotFound) {
		t.Fatalf("missing err=%v", err)
	}

	concurrent := insertPublicationCandidate(t, db, "reject-concurrent", "candidate", "public", nil)
	insertPublicationIngestion(t, db, concurrent, `[]`)
	assertTwoTransitions(t, func() error { _, e := service.Reject(concurrent); return e }, func() error { _, e := service.Reject(concurrent); return e })
	race := insertPublicationCandidate(t, db, "reject-publish-race", "candidate", "public", nil)
	insertPublicationIngestion(t, db, race, `[]`)
	assertTwoTransitions(t, func() error { _, e := service.Publish(race); return e }, func() error { _, e := service.Reject(race); return e })
	var final string
	if err := db.QueryRow(`SELECT status FROM palettes WHERE id=$1`, race).Scan(&final); err != nil {
		t.Fatal(err)
	}
	if final != "published" && final != "archived" {
		t.Fatalf("race final=%s", final)
	}

	rollback := insertPublicationCandidate(t, db, "reject-rollback", "candidate", "public", nil)
	insertPublicationIngestion(t, db, rollback, `[]`)
	rollbackPreview, err := service.CreatePreviewCase(rollback, &CreatePreviewCaseRequest{ChartType: pc.ChartType, TemplateID: pc.TemplateID, TemplateVersion: pc.TemplateVersion, SchemaVersion: pc.SchemaVersion, ColorRoles: pc.ColorRoles, PreviewConfig: pc.PreviewConfig, SeedStrategy: pc.SeedStrategy, SeedValue: pc.SeedValue})
	if err != nil {
		t.Fatal(err)
	}
	rollbackPreview, err = service.PublishPreviewCase(rollbackPreview.ID)
	if err != nil {
		t.Fatal(err)
	}
	rollbackPreview, err = service.SetPrimaryPreviewCase(rollbackPreview.ID)
	if err != nil {
		t.Fatal(err)
	}
	var paletteStatusBefore, previewStatusBefore, previewPaletteBefore string
	var archivedAtBefore sql.NullTime
	var previewPrimaryBefore bool
	if err := db.QueryRow(`SELECT p.status,p.archived_at,pc.status,pc.is_primary,pc.palette_id
		FROM palettes p JOIN palette_preview_cases pc ON pc.palette_id=p.id
		WHERE p.id=$1 AND pc.id=$2`, rollback, rollbackPreview.ID).Scan(&paletteStatusBefore, &archivedAtBefore, &previewStatusBefore, &previewPrimaryBefore, &previewPaletteBefore); err != nil {
		t.Fatal(err)
	}
	var ingestionIDBefore, ingestionPaletteBefore, receiptBeforeRollback string
	if err := db.QueryRow(`SELECT id,palette_id,receipt::text FROM palette_ingestion_records WHERE palette_id=$1`, rollback).Scan(&ingestionIDBefore, &ingestionPaletteBefore, &receiptBeforeRollback); err != nil {
		t.Fatal(err)
	}
	if paletteStatusBefore != "candidate" || archivedAtBefore.Valid || previewStatusBefore != "published" || !previewPrimaryBefore || previewPaletteBefore != rollback {
		t.Fatalf("invalid rollback fixture palette=%s archived=%v preview=%s primary=%v linkage=%s", paletteStatusBefore, archivedAtBefore.Valid, previewStatusBefore, previewPrimaryBefore, previewPaletteBefore)
	}
	if _, err := db.Exec(`CREATE FUNCTION reject_candidate_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id='` + rollback + `'::uuid THEN RAISE EXCEPTION 'forced reject failure'; END IF; RETURN NEW; END $$`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TRIGGER reject_candidate_failure BEFORE UPDATE ON palettes FOR EACH ROW EXECUTE FUNCTION reject_candidate_failure()`); err != nil {
		t.Fatal(err)
	}
	if _, err := service.Reject(rollback); err == nil {
		t.Fatal("forced failure succeeded")
	}
	var paletteStatusAfter, previewStatusAfter, previewPaletteAfter string
	var archivedAtAfter sql.NullTime
	var previewPrimaryAfter bool
	if err := db.QueryRow(`SELECT p.status,p.archived_at,pc.status,pc.is_primary,pc.palette_id
		FROM palettes p JOIN palette_preview_cases pc ON pc.palette_id=p.id
		WHERE p.id=$1 AND pc.id=$2`, rollback, rollbackPreview.ID).Scan(&paletteStatusAfter, &archivedAtAfter, &previewStatusAfter, &previewPrimaryAfter, &previewPaletteAfter); err != nil {
		t.Fatal(err)
	}
	var ingestionIDAfter, ingestionPaletteAfter, receiptAfterRollback string
	if err := db.QueryRow(`SELECT id,palette_id,receipt::text FROM palette_ingestion_records WHERE palette_id=$1`, rollback).Scan(&ingestionIDAfter, &ingestionPaletteAfter, &receiptAfterRollback); err != nil {
		t.Fatal(err)
	}
	if paletteStatusAfter != paletteStatusBefore || archivedAtAfter.Valid != archivedAtBefore.Valid ||
		previewStatusAfter != previewStatusBefore || previewPrimaryAfter != previewPrimaryBefore || previewPaletteAfter != previewPaletteBefore ||
		ingestionIDAfter != ingestionIDBefore || ingestionPaletteAfter != ingestionPaletteBefore || receiptAfterRollback != receiptBeforeRollback {
		t.Fatalf("reject rollback changed aggregate palette=%s/%s archived=%v/%v preview=%s/%s primary=%v/%v preview_link=%s/%s ingestion=%s/%s ingestion_link=%s/%s receipt_equal=%v",
			paletteStatusBefore, paletteStatusAfter, archivedAtBefore.Valid, archivedAtAfter.Valid,
			previewStatusBefore, previewStatusAfter, previewPrimaryBefore, previewPrimaryAfter,
			previewPaletteBefore, previewPaletteAfter, ingestionIDBefore, ingestionIDAfter,
			ingestionPaletteBefore, ingestionPaletteAfter, receiptBeforeRollback == receiptAfterRollback)
	}
}

func assertTwoTransitions(t *testing.T, first, second func() error) {
	t.Helper()
	var wg sync.WaitGroup
	results := make(chan error, 2)
	for _, fn := range []func() error{first, second} {
		wg.Add(1)
		go func(f func() error) { defer wg.Done(); results <- f() }(fn)
	}
	wg.Wait()
	close(results)
	success, conflict := 0, 0
	for err := range results {
		if err == nil {
			success++
		} else if errors.Is(err, ErrPaletteRejectionConflict) || errors.Is(err, ErrPalettePublicationConflict) {
			conflict++
		} else {
			t.Fatalf("race err=%v", err)
		}
	}
	if success != 1 || conflict != 1 {
		t.Fatalf("race success=%d conflict=%d", success, conflict)
	}
}

func assertPaletteAbsentFromPublicList(t *testing.T, service *Service, id string) {
	t.Helper()
	palettes, _, err := service.ListPublic(ListParams{Page: 1, PageSize: 100})
	if err != nil {
		t.Fatal(err)
	}
	for _, palette := range palettes {
		if palette.ID == id {
			t.Fatalf("palette %s leaked into public list", id)
		}
	}
}
