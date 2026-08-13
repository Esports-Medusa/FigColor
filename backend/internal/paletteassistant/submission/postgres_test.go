package submission

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"os"
	"sync"
	"testing"
	"time"

	_ "github.com/lib/pq"
	"github.com/qiqi/figcolor/backend/internal/palette"
	pa "github.com/qiqi/figcolor/backend/internal/paletteassistant"
)

func TestSubmissionPostgresRuntimeAcceptance(t *testing.T) {
	dsn := os.Getenv("FIGCOLOR_SUBMISSION_TEST_DSN")
	if dsn == "" {
		t.Skip("FIGCOLOR_SUBMISSION_TEST_DSN is required")
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err = db.Ping(); err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	var actor string
	if err = db.QueryRow(`SELECT id FROM users WHERE email='admin@figcolor.local'`).Scan(&actor); err != nil {
		t.Fatal(err)
	}
	repo := &SQLRepository{db: db, palettes: palette.NewRepository(), aggregate: palette.NewCandidateAggregateService()}
	now := time.Unix(1786195200, 0).UTC()
	service, _ := NewService(repo, bytes.Repeat([]byte("s"), 32), func() time.Time { return now })
	draft := validDraft()
	validation := service.Validate(ctx, actor, pa.ValidateRequest{Draft: draft, ConfirmedRevision: 1})
	if validation.Response == nil {
		t.Fatalf("validate=%+v", validation)
	}
	key := "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
	request := pa.CreateCandidateRequest{Draft: draft, ConfirmedRevision: 1, ValidationReceipt: validation.Response.ValidationReceipt, WarningAcknowledgments: []string{}}
	created := service.Create(ctx, actor, key, request)
	if created.Receipt == nil || created.Receipt.Replay {
		t.Fatalf("created=%+v", created)
	}
	wantReviewPath := "/admin/palettes/" + created.Receipt.CandidateID + "/edit"
	if created.Receipt.Status != "candidate" || created.Receipt.AdminReviewPath != wantReviewPath {
		t.Fatalf("created receipt status=%q candidate=%q review_path=%q want=%q", created.Receipt.Status, created.Receipt.CandidateID, created.Receipt.AdminReviewPath, wantReviewPath)
	}
	var persistedReviewPath string
	if err = db.QueryRow(`SELECT candidate_receipt->>'admin_review_path' FROM palette_assistant_submissions WHERE candidate_id=$1`, created.Receipt.CandidateID).Scan(&persistedReviewPath); err != nil {
		t.Fatal(err)
	}
	if persistedReviewPath != wantReviewPath {
		t.Fatalf("persisted review_path=%q want=%q", persistedReviewPath, wantReviewPath)
	}
	assertAggregate(t, db, created.Receipt.CandidateID, len(draft.Colors), 1)
	replayed := service.Create(ctx, actor, key, request)
	if replayed.Receipt == nil || !replayed.Receipt.Replay || replayed.Receipt.CandidateID != created.Receipt.CandidateID || replayed.Receipt.ReceiptID != created.Receipt.ReceiptID || replayed.Receipt.AdminReviewPath != wantReviewPath || !replayed.Receipt.CreatedAt.Equal(created.Receipt.CreatedAt) {
		t.Fatalf("replay=%+v created=%+v", replayed, created)
	}
	changed := request
	changed.WarningAcknowledgments = []string{"unknown-finding"}
	conflict := service.Create(ctx, actor, key, changed)
	if conflict.Problem == nil || conflict.Problem.Code != pa.ErrIdempotencyConflict {
		t.Fatalf("conflict=%+v", conflict)
	}
	var submissions, palettes, previews int
	db.QueryRow(`SELECT count(*) FROM palette_assistant_submissions`).Scan(&submissions)
	db.QueryRow(`SELECT count(*) FROM palettes WHERE status='candidate' AND source_type='figure_extracted'`).Scan(&palettes)
	db.QueryRow(`SELECT count(*) FROM palette_preview_cases pc JOIN palettes p ON p.id=pc.palette_id WHERE p.source_type='figure_extracted'`).Scan(&previews)
	if submissions != 1 || palettes != 1 || previews != 1 {
		t.Fatalf("stable counts submissions=%d palettes=%d previews=%d", submissions, palettes, previews)
	}
	idempotentDraft := validDraft()
	idempotentDraft.Name = "Concurrent idempotency"
	idempotentDraft.Colors[0].Hex = "#334455"
	idempotentDraft.Colors[1].Hex = "#BBCCDD"
	idemValidation := service.Validate(ctx, actor, pa.ValidateRequest{Draft: idempotentDraft, ConfirmedRevision: 1})
	if idemValidation.Response == nil {
		t.Fatal("idempotency validation failed")
	}
	idemRequest := pa.CreateCandidateRequest{Draft: idempotentDraft, ConfirmedRevision: 1, ValidationReceipt: idemValidation.Response.ValidationReceipt, WarningAcknowledgments: []string{}}
	idemBarrier := newSnapshotBarrier(repo, 2)
	idemService, _ := NewService(idemBarrier, bytes.Repeat([]byte("s"), 32), func() time.Time { return now })
	idemResults := make([]Result, 2)
	var idemWG sync.WaitGroup
	for i := range idemResults {
		idemWG.Add(1)
		go func(i int) {
			defer idemWG.Done()
			idemResults[i] = idemService.Create(ctx, actor, "99999999-9999-4999-8999-999999999999", idemRequest)
		}(i)
	}
	idemWG.Wait()
	createdCount, replayCount := 0, 0
	var stableID string
	for _, result := range idemResults {
		if result.Receipt == nil {
			t.Fatalf("idempotency race=%+v", idemResults)
		}
		if result.Receipt.Replay {
			replayCount++
		} else {
			createdCount++
		}
		if stableID == "" {
			stableID = result.Receipt.CandidateID
		} else if stableID != result.Receipt.CandidateID {
			t.Fatal("idempotency race returned different candidates")
		}
	}
	if createdCount != 1 || replayCount != 1 {
		t.Fatalf("idempotency outcomes=%+v", idemResults)
	}

	beforeExactSubmissions, beforeExactPalettes := tableCount(t, db, "palette_assistant_submissions"), tableCount(t, db, "palettes")
	concurrentDraft := validDraft()
	concurrentDraft.Name = "Concurrent exact"
	concurrentDraft.Colors[0].Hex = "#445566"
	concurrentDraft.Colors[1].Hex = "#DDEEFF"
	firstValidation := service.Validate(ctx, actor, pa.ValidateRequest{Draft: concurrentDraft, ConfirmedRevision: 1})
	secondValidation := service.Validate(ctx, actor, pa.ValidateRequest{Draft: concurrentDraft, ConfirmedRevision: 1})
	if firstValidation.Response == nil || secondValidation.Response == nil {
		t.Fatal("concurrent validation failed")
	}
	barrier := newSnapshotBarrier(repo, 2)
	raceService, _ := NewService(barrier, bytes.Repeat([]byte("s"), 32), func() time.Time { return now })
	requests := []pa.CreateCandidateRequest{{Draft: concurrentDraft, ConfirmedRevision: 1, ValidationReceipt: firstValidation.Response.ValidationReceipt, WarningAcknowledgments: []string{}}, {Draft: concurrentDraft, ConfirmedRevision: 1, ValidationReceipt: secondValidation.Response.ValidationReceipt, WarningAcknowledgments: []string{}}}
	keys := []string{"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "cccccccc-cccc-4ccc-8ccc-cccccccccccc"}
	results := make([]Result, 2)
	var wg sync.WaitGroup
	for i := range results {
		wg.Add(1)
		go func(i int) { defer wg.Done(); results[i] = raceService.Create(ctx, actor, keys[i], requests[i]) }(i)
	}
	wg.Wait()
	success, exact := 0, 0
	for _, result := range results {
		if result.Receipt != nil {
			success++
		}
		if result.Problem != nil && result.Problem.Code == pa.ErrExactDuplicateCandidate {
			exact++
		}
	}
	if success != 1 || exact != 1 {
		t.Fatalf("exact race=%+v", results)
	}
	db.QueryRow(`SELECT count(*) FROM palette_assistant_submissions`).Scan(&submissions)
	db.QueryRow(`SELECT count(*) FROM palettes WHERE status='candidate' AND source_type='figure_extracted'`).Scan(&palettes)
	if submissions != beforeExactSubmissions+1 || palettes != beforeExactPalettes+1 {
		t.Fatalf("exact rollback counts submissions=%d palettes=%d", submissions, palettes)
	}
	var incomplete int
	db.QueryRow(`SELECT count(*) FROM palette_assistant_submissions WHERE status<>'succeeded' OR candidate_receipt IS NULL OR completed_at IS NULL`).Scan(&incomplete)
	if incomplete != 0 {
		t.Fatalf("incomplete submissions=%d", incomplete)
	}

	rollbackDraft := validDraft()
	rollbackDraft.Name = "Preview rollback"
	rollbackDraft.Colors[0].Hex = "#778899"
	rollbackDraft.Colors[1].Hex = "#CCDDEE"
	rollbackValidation := service.Validate(ctx, actor, pa.ValidateRequest{Draft: rollbackDraft, ConfirmedRevision: 1})
	if rollbackValidation.Response == nil {
		t.Fatal("rollback validation failed")
	}
	beforeSubmissions, beforePalettes, beforePreviews := tableCount(t, db, "palette_assistant_submissions"), tableCount(t, db, "palettes"), tableCount(t, db, "palette_preview_cases")
	if _, err = db.Exec(`CREATE FUNCTION fail_wpb6_preview() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced preview failure'; END $$; CREATE TRIGGER fail_wpb6_preview BEFORE INSERT ON palette_preview_cases FOR EACH ROW EXECUTE FUNCTION fail_wpb6_preview()`); err != nil {
		t.Fatal(err)
	}
	failed := service.Create(ctx, actor, "dddddddd-dddd-4ddd-8ddd-dddddddddddd", pa.CreateCandidateRequest{Draft: rollbackDraft, ConfirmedRevision: 1, ValidationReceipt: rollbackValidation.Response.ValidationReceipt, WarningAcknowledgments: []string{}})
	if failed.Problem == nil || failed.Problem.Code != pa.ErrCandidateTransactionFailed {
		t.Fatalf("preview failure=%+v", failed)
	}
	if _, err = db.Exec(`DROP TRIGGER fail_wpb6_preview ON palette_preview_cases; DROP FUNCTION fail_wpb6_preview()`); err != nil {
		t.Fatal(err)
	}
	if tableCount(t, db, "palette_assistant_submissions") != beforeSubmissions || tableCount(t, db, "palettes") != beforePalettes || tableCount(t, db, "palette_preview_cases") != beforePreviews {
		t.Fatal("preview failure left partial aggregate")
	}
	receiptDraft := rollbackDraft
	receiptDraft.Name = "Receipt rollback"
	receiptDraft.Colors[0].Hex = "#8899AA"
	receiptValidation := service.Validate(ctx, actor, pa.ValidateRequest{Draft: receiptDraft, ConfirmedRevision: 1})
	if receiptValidation.Response == nil {
		t.Fatal("receipt rollback validation failed")
	}
	if _, err = db.Exec(`CREATE FUNCTION fail_wpb6_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='succeeded' THEN RAISE EXCEPTION 'forced receipt failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_wpb6_receipt BEFORE UPDATE ON palette_assistant_submissions FOR EACH ROW EXECUTE FUNCTION fail_wpb6_receipt()`); err != nil {
		t.Fatal(err)
	}
	failed = service.Create(ctx, actor, "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", pa.CreateCandidateRequest{Draft: receiptDraft, ConfirmedRevision: 1, ValidationReceipt: receiptValidation.Response.ValidationReceipt, WarningAcknowledgments: []string{}})
	if failed.Problem == nil || failed.Problem.Code != pa.ErrCandidateTransactionFailed {
		t.Fatalf("receipt failure=%+v", failed)
	}
	if _, err = db.Exec(`DROP TRIGGER fail_wpb6_receipt ON palette_assistant_submissions; DROP FUNCTION fail_wpb6_receipt()`); err != nil {
		t.Fatal(err)
	}
	if tableCount(t, db, "palette_assistant_submissions") != beforeSubmissions || tableCount(t, db, "palettes") != beforePalettes || tableCount(t, db, "palette_preview_cases") != beforePreviews {
		t.Fatal("receipt failure left partial aggregate")
	}
}

type snapshotBarrier struct {
	repo      *SQLRepository
	mu        sync.Mutex
	remaining int
	ready     chan struct{}
}

func newSnapshotBarrier(repo *SQLRepository, count int) *snapshotBarrier {
	return &snapshotBarrier{repo: repo, remaining: count, ready: make(chan struct{})}
}
func (b *snapshotBarrier) Replay(ctx context.Context, a, k, i string) (*pa.CandidateReceipt, Outcome, error) {
	return b.repo.Replay(ctx, a, k, i)
}
func (b *snapshotBarrier) Create(ctx context.Context, a, k, i, d, f string, draft pa.AssistantDraft, findings []pa.ProtocolFinding) (*pa.CandidateReceipt, Outcome, error) {
	return b.repo.Create(ctx, a, k, i, d, f, draft, findings)
}
func (b *snapshotBarrier) Snapshot(ctx context.Context) ([]Comparison, error) {
	snapshot, err := b.repo.Snapshot(ctx)
	b.mu.Lock()
	b.remaining--
	if b.remaining == 0 {
		close(b.ready)
	}
	b.mu.Unlock()
	<-b.ready
	return snapshot, err
}

func assertAggregate(t *testing.T, db *sql.DB, id string, colorCount, previewCount int) {
	t.Helper()
	var status, visibility, source, origin string
	var owner sql.NullString
	var colors []byte
	var exact string
	var version int
	if err := db.QueryRow(`SELECT status,visibility,source_type,origin,owner_user_id,colors,exact_fingerprint,exact_fingerprint_version FROM palettes WHERE id=$1`, id).Scan(&status, &visibility, &source, &origin, &owner, &colors, &exact, &version); err != nil {
		t.Fatal(err)
	}
	var decoded []palette.PaletteColor
	if json.Unmarshal(colors, &decoded) != nil {
		t.Fatal("invalid colors")
	}
	if status != "candidate" || visibility != "public" || source != "figure_extracted" || origin != "curated" || owner.Valid || len(decoded) != colorCount || len(exact) != 64 || version != 1 {
		t.Fatalf("palette state status=%s visibility=%s source=%s origin=%s owner=%v colors=%s exact=%s version=%d", status, visibility, source, origin, owner.Valid, colors, exact, version)
	}
	var previews int
	db.QueryRow(`SELECT count(*) FROM palette_preview_cases WHERE palette_id=$1 AND status='draft' AND is_primary=false`, id).Scan(&previews)
	if previews != previewCount {
		t.Fatalf("previews=%d", previews)
	}
	var public int
	db.QueryRow(`SELECT count(*) FROM palettes WHERE id=$1 AND owner_user_id IS NULL AND visibility='public' AND status='published'`, id).Scan(&public)
	if public != 0 {
		t.Fatal("candidate entered public catalog scope")
	}
}
func tableCount(t *testing.T, db *sql.DB, table string) int {
	t.Helper()
	allowed := map[string]bool{"palette_assistant_submissions": true, "palettes": true, "palette_preview_cases": true}
	if !allowed[table] {
		t.Fatal("invalid table")
	}
	var count int
	if err := db.QueryRow(`SELECT count(*) FROM ` + table).Scan(&count); err != nil {
		t.Fatal(err)
	}
	return count
}
