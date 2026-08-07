package palette

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/qiqi/figcolor/backend/internal/database"
)

func TestClaimOrRecoverCreatesAttemptAndPreservesCallerJSON(t *testing.T) {
	input := ingestionClaimFixture()
	issues := append([]byte(nil), input.ValidationIssues...)
	evidence := append([]byte(nil), input.DuplicateEvidence...)
	processing := ingestionRecordRows(IngestionStateProcessing, 1, testLeaseToken, nil, nil)
	cleanup := installScriptedDB(t, []scriptedDBOp{
		queryOp("INSERT INTO palette_ingestion_records", "ON CONFLICT DO NOTHING", processing),
		execOp("INSERT INTO palette_ingestion_attempts", "recovery_mode"),
	})
	defer cleanup()

	result, err := NewIngestionRepository().ClaimOrRecover(context.Background(), input)
	if err != nil {
		t.Fatalf("ClaimOrRecover() error = %v", err)
	}
	if result.Outcome != IngestionClaimed || result.LeaseToken != testLeaseToken {
		t.Fatalf("result = %#v", result)
	}
	if string(input.ValidationIssues) != string(issues) || string(input.DuplicateEvidence) != string(evidence) {
		t.Fatal("caller JSON mutated")
	}
	assertScriptedEvents(t, "begin", "query INSERT INTO palette_ingestion_records", "exec INSERT INTO palette_ingestion_attempts", "commit")
}

func TestBindSuccessAcceptsAttemptFourAndClosesAudit(t *testing.T) {
	processing := ingestionRecordRows(IngestionStateProcessing, 4, testLeaseToken, nil, nil)
	succeeded := ingestionRecordRows(IngestionStateSucceeded, 4, "", stringPointer("palette-1"), []byte(validReceiptJSON()))
	cleanup := installScriptedDB(t, []scriptedDBOp{
		queryOp("lease_expires_at>clock_timestamp()", "FOR UPDATE", processing),
		queryOp("SELECT slug,status FROM palettes", "FOR UPDATE", paletteIdentityRows("palette", "candidate")),
		queryOp("UPDATE palette_ingestion_records", "processing_state='succeeded'", succeeded),
		execOp("UPDATE palette_ingestion_attempts", "outcome='processing'"),
	})
	defer cleanup()
	tx, err := databaseDBForTest().Begin()
	if err != nil {
		t.Fatal(err)
	}
	record, err := NewIngestionRepository().BindSuccessTx(context.Background(), tx, "record-1", 4, testLeaseToken, "palette-1", json.RawMessage(validReceiptJSON()))
	if err != nil {
		t.Fatalf("BindSuccessTx() error = %v", err)
	}
	if record.ProcessingState != IngestionStateSucceeded || record.AttemptCount != 4 {
		t.Fatalf("record = %#v", record)
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
}

func TestBindSuccessFailureLeavesTransactionToCaller(t *testing.T) {
	cleanup := installScriptedDB(t, nil)
	defer cleanup()
	tx, err := databaseDBForTest().Begin()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := NewIngestionRepository().BindSuccessTx(context.Background(), tx, "record", 1, testLeaseToken, "palette", json.RawMessage(`{}`)); !errors.Is(err, ErrIngestionReceipt) {
		t.Fatalf("BindSuccessTx() error = %v", err)
	}
	if err := tx.Rollback(); err != nil {
		t.Fatalf("caller rollback after bind failure = %v", err)
	}
}

func TestFailureEvidenceValidationFailsClosed(t *testing.T) {
	valid := IngestionFailureInput{Code: "AGGREGATE_TRANSACTION_RETRYABLE", Summary: "temporary database availability", Retryable: true}
	if err := validateFailureInput(valid); err != nil {
		t.Fatalf("valid failure rejected: %v", err)
	}
	for _, failure := range []IngestionFailureInput{
		{Code: "lowercase", Summary: "safe"},
		{Code: "SAFE_CODE", Summary: "Authorization: Bearer secret"},
		{Code: "SAFE_CODE", Summary: strings.Repeat("x", 513)},
		{Code: "SAFE_CODE", Summary: "SELECT * FROM secret"},
	} {
		if !errors.Is(validateFailureInput(failure), ErrIngestionFailureData) {
			t.Fatalf("unsafe failure accepted: %#v", failure)
		}
	}
}

func TestAuthoritativeLookupDoesNotInferOutcomeWhenDatabaseUnavailable(t *testing.T) {
	repository := newIngestionRepository(failingIngestionDB{})
	result, err := repository.Lookup(context.Background(), "actor", IngestionOperationPaletteCandidate, "key")
	if result != nil || err == nil {
		t.Fatalf("Lookup() = (%#v,%v), want unconfirmed error", result, err)
	}
}

type failingIngestionDB struct{}

func (failingIngestionDB) BeginTx(context.Context, *sql.TxOptions) (*sql.Tx, error) {
	return nil, fmt.Errorf("database unavailable")
}

const testLeaseToken = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"

func ingestionClaimFixture() IngestionClaimInput {
	return IngestionClaimInput{ProposalID: "batch/proposal", SourceKey: "proposal", SourceHash: repeat("a", 64), NormalizedContentHash: repeat("c", 64), Operation: IngestionOperationPaletteCandidate, IdempotencyKey: "123e4567-e89b-42d3-a456-426614174000", RequestFingerprint: repeat("d", 64), PipelineVersion: "pipeline", SchemaVersion: 1, ValidationIssues: json.RawMessage(`[{"code":"WARN"}]`), DuplicateEvidence: json.RawMessage(`[]`), ActorUserID: "11111111-1111-4111-8111-111111111111"}
}
func repeat(value string, count int) string { return strings.Repeat(value, count) }
func stringPointer(value string) *string    { return &value }
func validReceiptJSON() string {
	return `{"proposal_id":"batch/proposal","normalized_content_hash":"` + repeat("c", 64) + `","request_fingerprint":"` + repeat("d", 64) + `","palette_id":"palette-1","slug":"palette","status":"candidate","preview_case_ids":[]}`
}
func paletteIdentityRows(slug, status string) *scriptedRows {
	return &scriptedRows{columns: []string{"slug", "status"}, values: [][]driver.Value{{slug, status}}}
}
func ingestionRecordRows(state string, attempt int, leaseToken string, paletteID *string, receipt []byte) *scriptedRows {
	now := time.Now()
	var token, leaseStart, leaseExpiry, palette driver.Value
	if leaseToken != "" {
		token = leaseToken
		leaseStart = now
		leaseExpiry = now.Add(time.Minute)
	}
	if paletteID != nil {
		palette = *paletteID
	}
	return &scriptedRows{columns: ingestionColumns(), values: [][]driver.Value{{"record-1", "batch/proposal", repeat("c", 64), IngestionOperationPaletteCandidate, "123e4567-e89b-42d3-a456-426614174000", repeat("d", 64), state, int64(attempt), token, leaseStart, leaseExpiry, palette, receipt, nil, nil, nil, nil, "11111111-1111-4111-8111-111111111111", now, now}}}
}
func ingestionColumns() []string {
	return []string{"id", "proposal_id", "normalized_content_hash", "operation", "idempotency_key", "request_fingerprint", "processing_state", "attempt_count", "lease_token", "lease_started_at", "lease_expires_at", "palette_id", "receipt", "failure_code", "failure_retryable", "failure_summary", "retry_eligible_at", "actor_user_id", "created_at", "updated_at"}
}
func databaseDBForTest() *sql.DB { return database.DB }
