package palette

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"sync"
	"testing"

	"github.com/qiqi/figcolor/backend/internal/database"
)

func TestCandidatePublicationPostgres(t *testing.T) {
	dsn := os.Getenv("FIGCOLOR_PUBLICATION_TEST_DSN")
	if dsn == "" {
		t.Skip("FIGCOLOR_PUBLICATION_TEST_DSN is required")
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	previousDB := database.DB
	database.DB = db
	defer func() { database.DB = previousDB }()

	service := NewService(NewRepository())
	validID := insertPublicationCandidate(t, db, "valid", "candidate", "public", nil)
	t.Logf("candidate palette id: %s", validID)
	var previewID string
	if err := db.QueryRow(`INSERT INTO palette_preview_cases
		(palette_id,chart_type,template_id,color_roles,preview_config,status)
		VALUES($1,'bar_error','publication-archived','{}','{}','archived') RETURNING id`, validID).Scan(&previewID); err != nil {
		t.Fatal(err)
	}
	insertPublicationIngestion(t, db, validID, `[{"severity":"warning","code":"ADVISORY","message":"reviewed"}]`)
	adminCandidates, adminTotal, err := service.List(ListParams{Status: "candidate", Search: "Publication valid", Page: 1, PageSize: 1})
	if err != nil || adminTotal != 1 || len(adminCandidates) != 1 || adminCandidates[0].ID != validID {
		t.Fatalf("admin candidate discovery mismatch: total=%d count=%d err=%v", adminTotal, len(adminCandidates), err)
	}
	adminDetail, err := service.GetByID(validID)
	if err != nil || adminDetail == nil || len(adminDetail.Colors) == 0 || adminDetail.ChartApplicability == nil {
		t.Fatalf("admin candidate detail incomplete: detail=%+v err=%v", adminDetail, err)
	}
	editedName := "Publication valid edited"
	if _, err := service.Update(validID, &UpdatePaletteRequest{Name: &editedName}); err != nil {
		t.Fatal(err)
	}
	adminDetail, err = service.GetByID(validID)
	if err != nil || adminDetail == nil || adminDetail.Name != editedName {
		t.Fatalf("admin edit did not persist: detail=%+v err=%v", adminDetail, err)
	}
	var applicabilityBefore string
	if err := db.QueryRow(`SELECT chart_applicability::text FROM palettes WHERE id=$1`, validID).Scan(&applicabilityBefore); err != nil {
		t.Fatal(err)
	}

	if got, _, err := service.ListPublic(ListParams{Page: 1, PageSize: 20}); err != nil || len(got) != 0 {
		t.Fatalf("candidate leaked into public list: count=%d err=%v", len(got), err)
	}
	if got, err := service.GetPublicBySlug("publication-valid"); err == nil || got != nil {
		t.Fatalf("candidate leaked into public detail: got=%v err=%v", got, err)
	}

	published, err := service.Publish(validID)
	if err != nil {
		t.Fatal(err)
	}
	if published.ID != validID || published.Status != "published" || published.PublishedAt == nil {
		t.Fatalf("unexpected publication: %+v", published)
	}
	if got, total, err := service.ListPublic(ListParams{Page: 1, PageSize: 20}); err != nil || total != 1 || len(got) != 1 || got[0].ID != validID {
		t.Fatalf("public list mismatch: total=%d count=%d err=%v", total, len(got), err)
	}
	if got, err := service.GetPublicBySlug("publication-valid"); err != nil || got == nil || got.ID != validID {
		t.Fatalf("public detail mismatch: got=%v err=%v", got, err)
	}
	var linkedPaletteID, receiptPaletteID string
	if err := db.QueryRow(`SELECT p.palette_id,r.receipt->>'palette_id'
		FROM palette_preview_cases p JOIN palette_ingestion_records r ON r.palette_id=p.palette_id
		WHERE p.id=$1`, previewID).Scan(&linkedPaletteID, &receiptPaletteID); err != nil {
		t.Fatal(err)
	}
	if linkedPaletteID != validID || receiptPaletteID != validID {
		t.Fatalf("publication changed aggregate linkage: preview=%s receipt=%s", linkedPaletteID, receiptPaletteID)
	}
	var applicabilityAfter string
	if err := db.QueryRow(`SELECT chart_applicability::text FROM palettes WHERE id=$1`, validID).Scan(&applicabilityAfter); err != nil {
		t.Fatal(err)
	}
	if applicabilityAfter != applicabilityBefore {
		t.Fatalf("publication changed authored applicability: before=%s after=%s", applicabilityBefore, applicabilityAfter)
	}
	if _, err := service.Publish(validID); !errors.Is(err, ErrPalettePublicationConflict) {
		t.Fatalf("repeat publication err=%v", err)
	}

	invalidID := insertPublicationCandidate(t, db, "invalid", "candidate", "public", nil)
	insertPublicationIngestion(t, db, invalidID, `[{"severity":"error","code":"SOURCE_BLOCKED","message":"source validation failed"}]`)
	if _, err := service.Publish(invalidID); !IsValidationErrorValue(err) {
		t.Fatalf("invalid candidate err=%v", err)
	}
	assertPublicationState(t, db, invalidID, "candidate")

	var privateOwner string
	if err := db.QueryRow(`SELECT id FROM users ORDER BY created_at LIMIT 1`).Scan(&privateOwner); err != nil {
		t.Fatal(err)
	}
	privateID := insertPublicationCandidate(t, db, "private", "candidate", "private", &privateOwner)
	if _, err := service.Publish(privateID); !errors.Is(err, ErrPaletteNotAdminManageable) {
		t.Fatalf("private publication err=%v", err)
	}

	concurrentID := insertPublicationCandidate(t, db, "concurrent", "candidate", "public", nil)
	var wg sync.WaitGroup
	results := make(chan error, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); _, err := service.Publish(concurrentID); results <- err }()
	}
	wg.Wait()
	close(results)
	successes, conflicts := 0, 0
	for err := range results {
		switch {
		case err == nil:
			successes++
		case errors.Is(err, ErrPalettePublicationConflict):
			conflicts++
		default:
			t.Fatalf("concurrent publication err=%v", err)
		}
	}
	if successes != 1 || conflicts != 1 {
		t.Fatalf("concurrent results successes=%d conflicts=%d", successes, conflicts)
	}

	rollbackID := insertPublicationCandidate(t, db, "rollback", "candidate", "public", nil)
	if _, err := db.Exec(`CREATE FUNCTION reject_publication_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
		IF NEW.id = '` + rollbackID + `'::uuid THEN RAISE EXCEPTION 'forced publication failure'; END IF; RETURN NEW; END $$`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TRIGGER reject_publication_test BEFORE UPDATE ON palettes FOR EACH ROW EXECUTE FUNCTION reject_publication_test()`); err != nil {
		t.Fatal(err)
	}
	if _, err := service.Publish(rollbackID); err == nil {
		t.Fatal("forced database failure unexpectedly succeeded")
	}
	assertPublicationState(t, db, rollbackID, "candidate")
}

func IsValidationErrorValue(err error) bool {
	_, ok := IsValidationError(err)
	return ok
}

func insertPublicationCandidate(t *testing.T, db *sql.DB, suffix, status, visibility string, owner *string) string {
	t.Helper()
	var id string
	err := db.QueryRow(`INSERT INTO palettes
		(slug,name,colors,color_count,type,chart_applicability,status,visibility,origin,owner_user_id)
		VALUES($1,$2,$3,2,'categorical','[{"chart_type":"bar_error","suitability":"recommended"}]',$4,$5,'curated',$6) RETURNING id`,
		"publication-"+suffix, "Publication "+suffix,
		`[{"id":"c1","hex":"#112233","rgb":[17,34,51],"order":0},{"id":"c2","hex":"#445566","rgb":[68,85,102],"order":1}]`,
		status, visibility, owner).Scan(&id)
	if err != nil {
		t.Fatal(err)
	}
	return id
}

func insertPublicationIngestion(t *testing.T, db *sql.DB, paletteID, issues string) {
	t.Helper()
	tx, err := db.Begin()
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	var actorID string
	if err := tx.QueryRow(`SELECT id FROM users ORDER BY created_at LIMIT 1`).Scan(&actorID); err != nil {
		t.Fatal(err)
	}
	digest := sha256.Sum256([]byte(paletteID))
	hash := hex.EncodeToString(digest[:])
	proposal := "publication-" + paletteID
	receipt := fmt.Sprintf(`{"proposal_id":%q,"normalized_content_hash":%q,"request_fingerprint":%q,"palette_id":%q,"slug":"publication","status":"candidate","preview_case_ids":[]}`, proposal, hash, hash, paletteID)
	var recordID string
	err = tx.QueryRow(`INSERT INTO palette_ingestion_records
		(proposal_id,source_key,source_hash,normalized_content_hash,operation,idempotency_key,request_fingerprint,
		 processing_state,palette_id,receipt,pipeline_version,schema_version,validation_issues,actor_user_id)
		VALUES($1,$2,$3,$3,'palette_candidate_import_v1',$4,$3,'succeeded',$5,$6,'test',1,$7,$8)
		RETURNING id`, proposal, proposal, hash, paletteID, paletteID, receipt, issues, actorID).Scan(&recordID)
	if err != nil {
		t.Fatal(err)
	}
	var attemptID string
	if err := tx.QueryRow(`INSERT INTO palette_ingestion_attempts
		(ingestion_record_id,attempt_number,lease_token,recovery_mode,started_at,lease_expires_at)
		VALUES($1,1,gen_random_uuid(),'initial',clock_timestamp(),clock_timestamp()+interval '1 minute') RETURNING id`, recordID).Scan(&attemptID); err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(`UPDATE palette_ingestion_attempts SET outcome='succeeded',completed_at=clock_timestamp() WHERE id=$1`, attemptID); err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
}

func assertPublicationState(t *testing.T, db *sql.DB, id, want string) {
	t.Helper()
	var status string
	var publishedAt sql.NullTime
	if err := db.QueryRow(`SELECT status,published_at FROM palettes WHERE id=$1`, id).Scan(&status, &publishedAt); err != nil {
		t.Fatal(err)
	}
	if status != want || publishedAt.Valid {
		t.Fatalf("palette %s status=%s published_at=%v", id, status, publishedAt)
	}
}
