package palette

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"reflect"
	"sync"
	"testing"

	_ "github.com/lib/pq"
)

const ingestionTestActorID = "11111111-1111-4111-8111-111111111111"

func TestIngestionRepositoryPostgres(t *testing.T) {
	dsn := os.Getenv("FIGCOLOR_INGESTION_TEST_DSN")
	if dsn == "" {
		t.Skip("FIGCOLOR_INGESTION_TEST_DSN is required")
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	ctx := context.Background()
	if err := db.PingContext(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ExecContext(ctx, `INSERT INTO users(id,email,email_verified,status,role) VALUES($1,'repository-020@figcolor.local',true,'active','user')`, ingestionTestActorID); err != nil {
		t.Fatal(err)
	}
	repo := newIngestionRepositoryWithLease(db, 1)

	t.Run("concurrent first claim, active processing, JSONB, success and replay", func(t *testing.T) {
		input := pgClaimInput(10)
		results := concurrentClaims(t, ctx, repo, input)
		claimed := requireOutcomes(t, results, IngestionClaimed, IngestionInProgress)
		if claimed.LeaseToken == "" || claimed.Record.AttemptCount != 1 {
			t.Fatalf("claimed = %#v", claimed)
		}
		var raw []byte
		if err := db.QueryRowContext(ctx, `SELECT validation_issues FROM palette_ingestion_records WHERE id=$1`, claimed.Record.ID).Scan(&raw); err != nil {
			t.Fatal(err)
		}
		var value any
		if err := json.Unmarshal(raw, &value); err != nil || !reflect.DeepEqual(value, []any{map[string]any{"code": "DATABASE_EVIDENCE"}}) {
			t.Fatalf("JSONB=%s err=%v", raw, err)
		}
		lookup, err := repo.Lookup(ctx, input.ActorUserID, input.Operation, input.IdempotencyKey)
		if err != nil || lookup.Outcome != IngestionInProgress {
			t.Fatalf("active lookup=%#v err=%v", lookup, err)
		}
		bindClaim(t, ctx, db, repo, input, claimed, pgUUID(200), "candidate-10")
		replay, err := repo.ClaimOrRecover(ctx, input)
		if err != nil || replay.Outcome != IngestionReplay || replay.LeaseToken != "" {
			t.Fatalf("replay=%#v err=%v", replay, err)
		}
		lookup, err = repo.Lookup(ctx, input.ActorUserID, input.Operation, input.IdempotencyKey)
		if err != nil || lookup.Outcome != IngestionReplay || !equalJSON(lookup.Record.Receipt, replay.Record.Receipt) {
			t.Fatalf("succeeded lookup=%#v err=%v", lookup, err)
		}
	})

	t.Run("identity conflicts never mutate attempts", func(t *testing.T) {
		input := pgClaimInput(11)
		claim := mustClaim(t, ctx, repo, input)
		mismatch := input
		mismatch.RequestFingerprint = repeat("f", 64)
		result, err := repo.ClaimOrRecover(ctx, mismatch)
		if err != nil || result.Outcome != IngestionIdempotencyPayloadMismatch {
			t.Fatalf("mismatch=%#v err=%v", result, err)
		}
		proposalConflict := input
		proposalConflict.IdempotencyKey = pgKey(12)
		proposalConflict.RequestFingerprint = repeat("e", 64)
		result, err = repo.ClaimOrRecover(ctx, proposalConflict)
		if err != nil || result.Outcome != IngestionProposalIDConflict {
			t.Fatalf("proposal=%#v err=%v", result, err)
		}
		contentConflict := input
		contentConflict.IdempotencyKey = pgKey(13)
		contentConflict.ProposalID = "batch/other-11"
		contentConflict.RequestFingerprint = repeat("d", 64)
		result, err = repo.ClaimOrRecover(ctx, contentConflict)
		if err != nil || result.Outcome != IngestionExactContentDuplicate {
			t.Fatalf("content=%#v err=%v", result, err)
		}
		if countAttempts(t, ctx, db, claim.Record.ID) != 1 {
			t.Fatal("conflict changed attempts")
		}
	})

	t.Run("expired recovery has one winner and old lease cannot bind or fail", func(t *testing.T) {
		input := pgClaimInput(14)
		first := mustClaim(t, ctx, repo, input)
		waitLease(t, ctx, db)
		lookup, err := repo.Lookup(ctx, input.ActorUserID, input.Operation, input.IdempotencyKey)
		if err != nil || lookup.Outcome != IngestionInProgress {
			t.Fatalf("stale lookup=%#v err=%v", lookup, err)
		}
		results := concurrentClaims(t, ctx, repo, input)
		recovered := requireOutcomes(t, results, IngestionRecovered, IngestionInProgress)
		if recovered.Record.AttemptCount != 2 || countAttempts(t, ctx, db, recovered.Record.ID) != 2 {
			t.Fatalf("recovered=%#v", recovered)
		}
		assertAttemptOutcome(t, ctx, db, recovered.Record.ID, 1, "lease_expired", "")
		if _, err := repo.MarkFailed(ctx, recovered.Record.ID, 1, first.LeaseToken, IngestionFailureInput{Code: "OLD_WORKER", Retryable: false}); !errors.Is(err, ErrIngestionClaimState) {
			t.Fatalf("old MarkFailed err=%v", err)
		}
		paletteID := pgUUID(214)
		tx, err := db.BeginTx(ctx, nil)
		if err != nil {
			t.Fatal(err)
		}
		insertCandidatePalette(t, ctx, tx, paletteID, "old-lease", "candidate")
		receipt := postgresReceipt(input, paletteID, "old-lease", []string{})
		if record, err := repo.BindSuccessTx(ctx, tx, recovered.Record.ID, 1, first.LeaseToken, paletteID, receipt); record != nil || !errors.Is(err, ErrIngestionClaimState) {
			t.Fatalf("old bind=(%#v,%v)", record, err)
		}
		if err := tx.Rollback(); err != nil {
			t.Fatalf("service-owned rollback after old bind: %v", err)
		}
		assertNoPalette(t, ctx, db, paletteID)
	})

	t.Run("invalid receipt and foreign preview roll back the aggregate", func(t *testing.T) {
		foreignPaletteID, foreignPreviewID := pgUUID(230), pgUUID(330)
		foreignTx, err := db.BeginTx(ctx, nil)
		if err != nil {
			t.Fatal(err)
		}
		insertCandidatePalette(t, ctx, foreignTx, foreignPaletteID, "foreign-preview-owner", "candidate")
		insertPreview(t, ctx, foreignTx, foreignPreviewID, foreignPaletteID)
		if err := foreignTx.Commit(); err != nil {
			t.Fatal(err)
		}
		for index, previewIDs := range [][]string{{}, {foreignPreviewID}} {
			input := pgClaimInput(24 + index)
			claim := mustClaim(t, ctx, repo, input)
			paletteID := pgUUID(224 + index)
			tx, err := db.BeginTx(ctx, nil)
			if err != nil {
				t.Fatal(err)
			}
			insertCandidatePalette(t, ctx, tx, paletteID, fmt.Sprintf("candidate-%d", 24+index), "candidate")
			slug := fmt.Sprintf("candidate-%d", 24+index)
			if index == 0 {
				slug = "wrong-slug"
			}
			receipt := postgresReceipt(input, paletteID, slug, previewIDs)
			if record, err := repo.BindSuccessTx(ctx, tx, claim.Record.ID, 1, claim.LeaseToken, paletteID, receipt); record != nil || !errors.Is(err, ErrIngestionReceipt) {
				t.Fatalf("invalid bind=(%#v,%v)", record, err)
			}
			if err := tx.Rollback(); err != nil {
				t.Fatalf("service-owned rollback after invalid bind: %v", err)
			}
			assertNoPalette(t, ctx, db, paletteID)
		}
	})

	t.Run("retryable failure backoff and automatic recovery below attempt three", func(t *testing.T) {
		input := pgClaimInput(15)
		claim := mustClaim(t, ctx, repo, input)
		failed, err := repo.MarkFailed(ctx, claim.Record.ID, 1, claim.LeaseToken, IngestionFailureInput{Code: "AGGREGATE_TRANSACTION_RETRYABLE", Summary: "temporary database availability", Retryable: true})
		if err != nil || failed.ProcessingState != IngestionStateFailed || failed.FailureRetryable == nil || !*failed.FailureRetryable {
			t.Fatalf("failed=%#v err=%v", failed, err)
		}
		result, err := repo.ClaimOrRecover(ctx, input)
		if err != nil || result.Outcome != IngestionRetryableFailure || result.RetryAfterSeconds < 1 {
			t.Fatalf("backoff=%#v err=%v", result, err)
		}
		if _, err := db.ExecContext(ctx, `SELECT pg_sleep(5.1)`); err != nil {
			t.Fatal(err)
		}
		result, err = repo.ClaimOrRecover(ctx, input)
		if err != nil || result.Outcome != IngestionRecovered || result.Record.AttemptCount != 2 {
			t.Fatalf("retry=%#v err=%v", result, err)
		}
	})

	t.Run("attempt three expiry exhausts once without attempt four", func(t *testing.T) {
		input := pgClaimInput(16)
		current := advanceOperator(t, ctx, repo, mustClaim(t, ctx, repo, input), 3)
		waitLease(t, ctx, db)
		results := concurrentClaims(t, ctx, repo, input)
		for _, result := range results {
			if result.Outcome != IngestionFailed {
				t.Fatalf("exhaustion=%#v", result)
			}
		}
		assertLogicalFailure(t, ctx, db, current.Record.ID, IngestionFailureAttemptLimit, false, 3)
		assertAttemptOutcome(t, ctx, db, current.Record.ID, 3, "lease_expired", "")
		if countAttempts(t, ctx, db, current.Record.ID) != 3 {
			t.Fatal("automatic attempt 4 created")
		}
	})

	t.Run("attempt three retryable failure separates logical exhaustion from audit evidence", func(t *testing.T) {
		input := pgClaimInput(17)
		current := advanceOperator(t, ctx, repo, mustClaim(t, ctx, repo, input), 3)
		_, err := repo.MarkFailed(ctx, current.Record.ID, 3, current.LeaseToken, IngestionFailureInput{Code: "AGGREGATE_TRANSACTION_RETRYABLE", Summary: "safe transient failure", Retryable: true})
		if err != nil {
			t.Fatal(err)
		}
		assertLogicalFailure(t, ctx, db, current.Record.ID, IngestionFailureAttemptLimit, false, 3)
		assertAttemptOutcome(t, ctx, db, current.Record.ID, 3, "failed", "AGGREGATE_TRANSACTION_RETRYABLE")
	})

	t.Run("attempt three with a valid lease can succeed", func(t *testing.T) {
		input := pgClaimInput(23)
		third := advanceOperator(t, ctx, repo, mustClaim(t, ctx, repo, input), 3)
		bindClaim(t, ctx, db, repo, input, third, pgUUID(223), "candidate-23")
		assertAttemptOutcome(t, ctx, db, third.Record.ID, 3, "succeeded", "")
	})

	t.Run("nonretryable failure preserves actual code", func(t *testing.T) {
		input := pgClaimInput(18)
		current := advanceOperator(t, ctx, repo, mustClaim(t, ctx, repo, input), 3)
		_, err := repo.MarkFailed(ctx, current.Record.ID, 3, current.LeaseToken, IngestionFailureInput{Code: "INGESTION_INTEGRITY_FAILURE", Summary: "safe integrity mismatch", Retryable: false})
		if err != nil {
			t.Fatal(err)
		}
		assertLogicalFailure(t, ctx, db, current.Record.ID, "INGESTION_INTEGRITY_FAILURE", false, 3)
		assertAttemptOutcome(t, ctx, db, current.Record.ID, 3, "failed", "INGESTION_INTEGRITY_FAILURE")
	})

	t.Run("operator attempt four succeeds and stores audit", func(t *testing.T) {
		input := pgClaimInput(19)
		third := advanceOperator(t, ctx, repo, mustClaim(t, ctx, repo, input), 3)
		if _, err := repo.MarkFailed(ctx, third.Record.ID, 3, third.LeaseToken, IngestionFailureInput{Code: "INGESTION_INTEGRITY_FAILURE", Retryable: false}); err != nil {
			t.Fatal(err)
		}
		fourth, err := repo.OperatorRequeue(ctx, third.Record.ID, ingestionTestActorID, "approved recovery attempt four")
		if err != nil {
			t.Fatal(err)
		}
		if fourth.Record.AttemptCount != 4 {
			t.Fatalf("fourth=%#v", fourth)
		}
		assertOperatorAttempt(t, ctx, db, fourth.Record.ID, 4, "approved recovery attempt four")
		bindClaim(t, ctx, db, repo, input, fourth, pgUUID(219), "candidate-19")
		assertAttemptOutcome(t, ctx, db, fourth.Record.ID, 4, "succeeded", "")
	})

	for _, mode := range []string{"retryable", "nonretryable", "expired"} {
		t.Run("operator attempt four "+mode+" does not create attempt five", func(t *testing.T) {
			seed := 20
			if mode == "nonretryable" {
				seed = 21
			} else if mode == "expired" {
				seed = 22
			}
			input := pgClaimInput(seed)
			third := advanceOperator(t, ctx, repo, mustClaim(t, ctx, repo, input), 3)
			if _, err := repo.MarkFailed(ctx, third.Record.ID, 3, third.LeaseToken, IngestionFailureInput{Code: "INGESTION_INTEGRITY_FAILURE", Retryable: false}); err != nil {
				t.Fatal(err)
			}
			fourth, err := repo.OperatorRequeue(ctx, third.Record.ID, ingestionTestActorID, "approved fourth attempt")
			if err != nil {
				t.Fatal(err)
			}
			switch mode {
			case "retryable":
				_, err = repo.MarkFailed(ctx, fourth.Record.ID, 4, fourth.LeaseToken, IngestionFailureInput{Code: "AGGREGATE_TRANSACTION_RETRYABLE", Summary: "safe transient", Retryable: true})
				assertLogicalFailure(t, ctx, db, fourth.Record.ID, IngestionFailureAttemptLimit, false, 4)
				assertAttemptOutcome(t, ctx, db, fourth.Record.ID, 4, "failed", "AGGREGATE_TRANSACTION_RETRYABLE")
			case "nonretryable":
				_, err = repo.MarkFailed(ctx, fourth.Record.ID, 4, fourth.LeaseToken, IngestionFailureInput{Code: "INGESTION_INTEGRITY_FAILURE", Retryable: false})
				assertLogicalFailure(t, ctx, db, fourth.Record.ID, "INGESTION_INTEGRITY_FAILURE", false, 4)
			case "expired":
				waitLease(t, ctx, db)
				var result *IngestionClaimResult
				result, err = repo.ClaimOrRecover(ctx, input)
				if err == nil && result.Outcome != IngestionFailed {
					t.Fatalf("expired=%#v", result)
				}
				assertLogicalFailure(t, ctx, db, fourth.Record.ID, IngestionFailureAttemptLimit, false, 4)
				assertAttemptOutcome(t, ctx, db, fourth.Record.ID, 4, "lease_expired", "")
			}
			if err != nil {
				t.Fatal(err)
			}
			if countAttempts(t, ctx, db, fourth.Record.ID) != 4 {
				t.Fatal("attempt five created")
			}
		})
	}
}

func concurrentClaims(t *testing.T, ctx context.Context, repo *IngestionRepository, input IngestionClaimInput) []*IngestionClaimResult {
	t.Helper()
	start := make(chan struct{})
	results := make(chan *IngestionClaimResult, 2)
	errs := make(chan error, 2)
	var wg sync.WaitGroup
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); <-start; r, e := repo.ClaimOrRecover(ctx, input); results <- r; errs <- e }()
	}
	close(start)
	wg.Wait()
	close(results)
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatalf("concurrent claim: %v", err)
		}
	}
	var out []*IngestionClaimResult
	for result := range results {
		out = append(out, result)
	}
	return out
}
func requireOutcomes(t *testing.T, results []*IngestionClaimResult, wantA, wantB string) *IngestionClaimResult {
	t.Helper()
	counts := map[string]int{}
	var lease *IngestionClaimResult
	for _, r := range results {
		counts[r.Outcome]++
		if r.LeaseToken != "" {
			lease = r
		}
	}
	if counts[wantA] != 1 || counts[wantB] != 1 {
		t.Fatalf("outcomes=%#v", counts)
	}
	return lease
}
func mustClaim(t *testing.T, ctx context.Context, repo *IngestionRepository, input IngestionClaimInput) *IngestionClaimResult {
	t.Helper()
	r, e := repo.ClaimOrRecover(ctx, input)
	if e != nil || r.Outcome != IngestionClaimed {
		t.Fatalf("claim=%#v err=%v", r, e)
	}
	return r
}
func advanceOperator(t *testing.T, ctx context.Context, repo *IngestionRepository, current *IngestionClaimResult, target int) *IngestionClaimResult {
	t.Helper()
	for current.Record.AttemptCount < target {
		_, e := repo.MarkFailed(ctx, current.Record.ID, current.Record.AttemptCount, current.LeaseToken, IngestionFailureInput{Code: "INGESTION_INTEGRITY_FAILURE", Retryable: false})
		if e != nil {
			t.Fatal(e)
		}
		current, e = repo.OperatorRequeue(ctx, current.Record.ID, ingestionTestActorID, fmt.Sprintf("approved attempt %d", current.Record.AttemptCount+1))
		if e != nil {
			t.Fatal(e)
		}
	}
	return current
}
func waitLease(t *testing.T, ctx context.Context, db *sql.DB) {
	t.Helper()
	if _, e := db.ExecContext(ctx, `SELECT pg_sleep(1.1)`); e != nil {
		t.Fatal(e)
	}
}
func countAttempts(t *testing.T, ctx context.Context, db *sql.DB, id string) int {
	t.Helper()
	var n int
	if e := db.QueryRowContext(ctx, `SELECT count(*) FROM palette_ingestion_attempts WHERE ingestion_record_id=$1`, id).Scan(&n); e != nil {
		t.Fatal(e)
	}
	return n
}
func assertAttemptOutcome(t *testing.T, ctx context.Context, db *sql.DB, id string, attempt int, outcome, code string) {
	t.Helper()
	var got string
	var actual sql.NullString
	if e := db.QueryRowContext(ctx, `SELECT outcome,actual_failure_code FROM palette_ingestion_attempts WHERE ingestion_record_id=$1 AND attempt_number=$2`, id, attempt).Scan(&got, &actual); e != nil {
		t.Fatal(e)
	}
	if got != outcome || actual.String != code {
		t.Fatalf("attempt outcome=(%s,%s)", got, actual.String)
	}
}
func assertOperatorAttempt(t *testing.T, ctx context.Context, db *sql.DB, id string, attempt int, reason string) {
	t.Helper()
	var mode, actor, storedReason string
	if err := db.QueryRowContext(ctx, `SELECT recovery_mode,operator_actor_user_id,operator_reason FROM palette_ingestion_attempts WHERE ingestion_record_id=$1 AND attempt_number=$2`, id, attempt).Scan(&mode, &actor, &storedReason); err != nil {
		t.Fatal(err)
	}
	if mode != "operator_requeue" || actor != ingestionTestActorID || storedReason != reason {
		t.Fatalf("operator audit=(%s,%s,%s)", mode, actor, storedReason)
	}
}
func assertLogicalFailure(t *testing.T, ctx context.Context, db *sql.DB, id, code string, retryable bool, attempt int) {
	t.Helper()
	var state, got string
	var retry bool
	var eligible sql.NullTime
	var count int
	if e := db.QueryRowContext(ctx, `SELECT processing_state,failure_code,failure_retryable,retry_eligible_at,attempt_count FROM palette_ingestion_records WHERE id=$1`, id).Scan(&state, &got, &retry, &eligible, &count); e != nil {
		t.Fatal(e)
	}
	if state != IngestionStateFailed || got != code || retry != retryable || eligible.Valid || count != attempt {
		t.Fatalf("logical=(%s,%s,%v,%v,%d)", state, got, retry, eligible, count)
	}
}
func bindClaim(t *testing.T, ctx context.Context, db *sql.DB, repo *IngestionRepository, input IngestionClaimInput, claim *IngestionClaimResult, paletteID, slug string) {
	t.Helper()
	tx, e := db.BeginTx(ctx, nil)
	if e != nil {
		t.Fatal(e)
	}
	insertCandidatePalette(t, ctx, tx, paletteID, slug, "candidate")
	receipt := postgresReceipt(input, paletteID, slug, []string{})
	if _, e = repo.BindSuccessTx(ctx, tx, claim.Record.ID, claim.Record.AttemptCount, claim.LeaseToken, paletteID, receipt); e != nil {
		t.Fatal(e)
	}
	if e = tx.Commit(); e != nil {
		t.Fatal(e)
	}
}
func assertNoPalette(t *testing.T, ctx context.Context, db *sql.DB, id string) {
	t.Helper()
	var n int
	if e := db.QueryRowContext(ctx, `SELECT count(*) FROM palettes WHERE id=$1`, id).Scan(&n); e != nil || n != 0 {
		t.Fatalf("palette count=%d err=%v", n, e)
	}
}
func pgClaimInput(seed int) IngestionClaimInput {
	hex := "0123456789abcdef"
	a := string(hex[seed%16])
	b := string(hex[(seed+1)%16])
	return IngestionClaimInput{ProposalID: fmt.Sprintf("batch/proposal-%d", seed), SourceKey: fmt.Sprintf("proposal-%d", seed), SourceHash: repeat("a", 64), NormalizedContentHash: repeat(a, 64), Operation: IngestionOperationPaletteCandidate, IdempotencyKey: pgKey(seed), RequestFingerprint: repeat(b, 64), PipelineVersion: "pipeline-v1", SchemaVersion: 1, ValidationIssues: json.RawMessage(`[{"code":"DATABASE_EVIDENCE"}]`), DuplicateEvidence: json.RawMessage(`[]`), ActorUserID: ingestionTestActorID}
}
func pgKey(seed int) string  { return fmt.Sprintf("123e4567-e89b-42d3-a456-%012d", seed) }
func pgUUID(seed int) string { return fmt.Sprintf("22222222-2222-4222-8222-%012d", seed) }
func postgresReceipt(input IngestionClaimInput, paletteID, slug string, previewIDs []string) json.RawMessage {
	raw, _ := json.Marshal(ingestionReceipt{ProposalID: input.ProposalID, NormalizedContentHash: input.NormalizedContentHash, RequestFingerprint: input.RequestFingerprint, PaletteID: paletteID, Slug: slug, Status: "candidate", PreviewCaseIDs: previewIDs})
	return raw
}
func insertCandidatePalette(t *testing.T, ctx context.Context, tx *sql.Tx, id, slug, status string) {
	t.Helper()
	_, e := tx.ExecContext(ctx, `INSERT INTO palettes(id,slug,name,colors,color_count,type,accessibility,source_type,status,visibility,origin,created_by,owner_user_id,published_at) VALUES($1,$2,'Repository Candidate','[{"id":"color-1","hex":"#112233","rgb":[17,34,51],"order":0}]',1,'categorical','{}','curated',$3::varchar,'public','curated',$4,NULL,CASE WHEN $3::text='published' THEN clock_timestamp() ELSE NULL END)`, id, slug, status, ingestionTestActorID)
	if e != nil {
		t.Fatal(e)
	}
}
func insertPreview(t *testing.T, ctx context.Context, tx *sql.Tx, id, paletteID string) {
	t.Helper()
	if _, err := tx.ExecContext(ctx, `INSERT INTO palette_preview_cases(id,palette_id,chart_type,template_id,color_roles,preview_config,status,is_primary) VALUES($1,$2,'bar_error','bar_error_v1','{}','{}','draft',false)`, id, paletteID); err != nil {
		t.Fatal(err)
	}
}
func equalJSON(left, right json.RawMessage) bool {
	var a, b any
	return json.Unmarshal(left, &a) == nil && json.Unmarshal(right, &b) == nil && reflect.DeepEqual(a, b)
}
