package palette

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/qiqi/figcolor/backend/internal/database"
	figjwt "github.com/qiqi/figcolor/backend/internal/jwt"
	figmiddleware "github.com/qiqi/figcolor/backend/internal/middleware"
	"github.com/qiqi/figcolor/backend/internal/user"
)

func TestIngestionServicePostgresAggregate(t *testing.T) {
	dsn := os.Getenv("FIGCOLOR_INGESTION_TEST_DSN")
	if dsn == "" {
		t.Skip("FIGCOLOR_INGESTION_TEST_DSN is not configured")
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	ctx, palettes := context.Background(), NewRepository()

	t.Run("first success and stable replay", func(t *testing.T) {
		input := uniqueServiceSubmission(t, 201, true)
		repo := newIngestionRepositoryWithLease(db, 30)
		service := newIngestionService(repo, testSQLAggregateFactory{db: db, claims: repo, palettes: palettes}, 5)
		result := service.Ingest(ctx, input)
		if result.Outcome != IngestionServiceCreated {
			t.Fatalf("result=%+v", result)
		}
		assertAggregateCounts(t, db, input, 1, 1, 1)
		replay := service.Ingest(ctx, input)
		if replay.Outcome != IngestionServiceReplayed || string(replay.Receipt) != string(result.Receipt) {
			t.Fatalf("created=%s replay=%+v", result.Receipt, replay)
		}
		assertAggregateCounts(t, db, input, 1, 1, 1)
	})

	t.Run("canonical evidence persists and evidence-only change conflicts", func(t *testing.T) {
		input := uniqueServiceSubmission(t, 208, false)
		input.CanonicalRequest = mutateCanonicalRequest(t, input.CanonicalRequest, func(metadata map[string]interface{}) {
			metadata["validation_issues"] = []interface{}{map[string]interface{}{"path": "$.palette.tags", "code": "REVIEW_TAGS", "message": "Review tags.", "severity": "warning", "source": "domain"}}
			metadata["source_reference"] = "protected://figure/208"
		})
		repo := newIngestionRepositoryWithLease(db, 30)
		service := newIngestionService(repo, testSQLAggregateFactory{db: db, claims: repo, palettes: palettes}, 5)
		created := service.Ingest(ctx, input)
		if created.Outcome != IngestionServiceCreated {
			t.Fatalf("created=%+v", created)
		}
		var issues string
		var source *string
		var storedFingerprint string
		var receiptFingerprint string
		if err := db.QueryRow(`SELECT validation_issues::text,source_reference,request_fingerprint,receipt->>'request_fingerprint' FROM palette_ingestion_records WHERE proposal_id=$1`, proposalFromSubmission(input)).Scan(&issues, &source, &storedFingerprint, &receiptFingerprint); err != nil {
			t.Fatal(err)
		}
		prepared, err := prepareIngestion(input)
		if err != nil {
			t.Fatal(err)
		}
		if !jsonSemanticallyEqual([]byte(issues), prepared.claim.ValidationIssues) || source == nil || *source != "protected://figure/208" || storedFingerprint != prepared.claim.RequestFingerprint || receiptFingerprint != prepared.claim.RequestFingerprint {
			t.Fatalf("stored evidence/fingerprint mismatch")
		}
		changed := input
		changed.CanonicalRequest = mutateCanonicalRequest(t, input.CanonicalRequest, func(metadata map[string]interface{}) { metadata["source_reference"] = "protected://figure/changed" })
		conflict := service.Ingest(ctx, changed)
		if conflict.Outcome != IngestionIdempotencyPayloadMismatch {
			t.Fatalf("conflict=%+v", conflict)
		}
		assertAggregateCounts(t, db, input, 1, 0, 1)
	})

	t.Run("partial preview failure rolls aggregate back and marks failed", func(t *testing.T) {
		input := uniqueServiceSubmission(t, 202, true)
		repo := newIngestionRepositoryWithLease(db, 30)
		result := newIngestionService(repo, testSQLAggregateFactory{db: db, claims: repo, palettes: palettes, failPreview: true}, 5).Ingest(ctx, input)
		if result.Outcome != IngestionServiceRetryNotReady || result.RetryAfterSeconds != IngestionRetryBackoffSeconds {
			t.Fatalf("result=%+v", result)
		}
		assertAggregateCounts(t, db, input, 0, 0, 0)
		var state, outcome string
		if err := db.QueryRow(`SELECT r.processing_state,a.outcome FROM palette_ingestion_records r JOIN palette_ingestion_attempts a ON a.ingestion_record_id=r.id AND a.attempt_number=r.attempt_count WHERE r.proposal_id=$1`, proposalFromSubmission(input)).Scan(&state, &outcome); err != nil {
			t.Fatal(err)
		}
		if state != IngestionStateFailed || outcome != "failed" {
			t.Fatalf("state=%s outcome=%s", state, outcome)
		}
	})

	for _, tc := range []struct {
		name        string
		seed        int
		failPalette bool
		failBind    bool
		wantOutcome string
	}{
		{name: "failure after palette insert", seed: 204, failPalette: true, wantOutcome: IngestionServiceRetryNotReady},
		{name: "bind rejection", seed: 205, failBind: true, wantOutcome: IngestionFailed},
	} {
		t.Run(tc.name, func(t *testing.T) {
			input := uniqueServiceSubmission(t, tc.seed, tc.failBind)
			repo := newIngestionRepositoryWithLease(db, 30)
			result := newIngestionService(repo, testSQLAggregateFactory{db: db, claims: repo, palettes: palettes, failPalette: tc.failPalette, failBind: tc.failBind}, 5).Ingest(ctx, input)
			if result.Outcome != tc.wantOutcome {
				t.Fatalf("result=%+v", result)
			}
			assertAggregateCounts(t, db, input, 0, 0, 0)
		})
	}

	t.Run("rollback transport ambiguity uses authoritative state without mark failed", func(t *testing.T) {
		input := uniqueServiceSubmission(t, 207, true)
		repo := newIngestionRepositoryWithLease(db, 30)
		result := newIngestionService(repo, testSQLAggregateFactory{db: db, claims: repo, palettes: palettes, failBind: true, ambiguousRollback: true}, 5).Ingest(ctx, input)
		if result.Outcome != IngestionInProgress {
			t.Fatalf("result=%+v", result)
		}
		assertAggregateCounts(t, db, input, 0, 0, 0)
		var state, outcome string
		if err := db.QueryRow(`SELECT r.processing_state,a.outcome FROM palette_ingestion_records r JOIN palette_ingestion_attempts a ON a.ingestion_record_id=r.id AND a.attempt_number=r.attempt_count WHERE r.proposal_id=$1`, proposalFromSubmission(input)).Scan(&state, &outcome); err != nil {
			t.Fatal(err)
		}
		if state != IngestionStateProcessing || outcome != "processing" {
			t.Fatalf("state=%s outcome=%s", state, outcome)
		}
	})

	t.Run("commit succeeds but transport reports ambiguity", func(t *testing.T) {
		input := uniqueServiceSubmission(t, 203, false)
		repo := newIngestionRepositoryWithLease(db, 30)
		result := newIngestionService(repo, testSQLAggregateFactory{db: db, claims: repo, palettes: palettes, ambiguousCommit: true}, 5).Ingest(ctx, input)
		if result.Outcome != IngestionServiceRecoveredUnknown || len(result.Receipt) == 0 {
			t.Fatalf("result=%+v", result)
		}
		assertAggregateCounts(t, db, input, 1, 0, 1)
		replay := newIngestionService(repo, testSQLAggregateFactory{db: db, claims: repo, palettes: palettes}, 5).Ingest(ctx, input)
		if replay.Outcome != IngestionServiceReplayed || string(replay.Receipt) != string(result.Receipt) {
			t.Fatalf("replay=%+v", replay)
		}
	})

	t.Run("stale worker aggregate rolls back and recovered service completes", func(t *testing.T) {
		input := uniqueServiceSubmission(t, 206, false)
		prepared, err := prepareIngestion(input)
		if err != nil {
			t.Fatal(err)
		}
		repo := newIngestionRepositoryWithLease(db, 1)
		first, err := repo.ClaimOrRecover(ctx, prepared.claim)
		if err != nil || first.Outcome != IngestionClaimed {
			t.Fatalf("first=%+v err=%v", first, err)
		}
		oldTx, err := db.BeginTx(ctx, nil)
		if err != nil {
			t.Fatal(err)
		}
		oldPaletteRequest := prepared.palette
		oldPaletteRequest.Slug += "-old-worker"
		oldPalette, err := palettes.CreateCandidateTx(oldTx, &oldPaletteRequest, prepared.claim.ActorUserID)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := db.ExecContext(ctx, `SELECT pg_sleep(1.1)`); err != nil {
			t.Fatal(err)
		}
		result := newIngestionService(repo, testSQLAggregateFactory{db: db, claims: repo, palettes: palettes}, 5).Ingest(ctx, input)
		if result.Outcome != IngestionServiceCreated {
			t.Fatalf("recovered result=%+v", result)
		}
		oldReceipt, _ := json.Marshal(ingestionReceipt{ProposalID: prepared.claim.ProposalID, NormalizedContentHash: prepared.claim.NormalizedContentHash, RequestFingerprint: prepared.claim.RequestFingerprint, PaletteID: oldPalette.ID, Slug: oldPalette.Slug, Status: "candidate", PreviewCaseIDs: []string{}})
		if _, err := repo.BindSuccessTx(ctx, oldTx, first.Record.ID, first.Record.AttemptCount, first.LeaseToken, oldPalette.ID, oldReceipt); !errors.Is(err, ErrIngestionClaimState) {
			t.Fatalf("old bind err=%v", err)
		}
		if err := oldTx.Rollback(); err != nil {
			t.Fatalf("service-owned stale rollback: %v", err)
		}
		var oldCount int
		if err := db.QueryRow(`SELECT COUNT(*) FROM palettes WHERE id=$1`, oldPalette.ID).Scan(&oldCount); err != nil {
			t.Fatal(err)
		}
		if oldCount != 0 {
			t.Fatal("stale worker palette survived rollback")
		}
		assertAggregateCounts(t, db, input, 1, 0, 1)
	})
}

func TestIngestionHTTPPostgresEndToEnd(t *testing.T) {
	dsn := os.Getenv("FIGCOLOR_INGESTION_TEST_DSN")
	if dsn == "" {
		t.Skip("FIGCOLOR_INGESTION_TEST_DSN is not configured")
	}
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	previousDB := database.DB
	database.DB = db
	defer func() { database.DB = previousDB }()
	const secret = "http-postgres-secret"
	if _, err := db.Exec(`INSERT INTO users(id,email,email_verified,status,role) VALUES($1,'http-ingestion@figcolor.local',true,'active','admin') ON CONFLICT(id) DO UPDATE SET role='admin'`, ingestionTestActorID); err != nil {
		t.Fatal(err)
	}
	token, err := figjwt.GenerateToken(ingestionTestActorID, "http-ingestion@figcolor.local", secret, time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	repo := newIngestionRepositoryWithLease(db, 30)
	palettes := NewRepository()
	service := newIngestionService(repo, testSQLAggregateFactory{db: db, claims: repo, palettes: palettes}, 5)
	router := postgresHTTPRouter(t, service, secret)

	t.Run("first success replay and evidence fingerprint conflict", func(t *testing.T) {
		input := uniqueServiceSubmission(t, 401, true)
		created := performHTTPIngestion(t, router, token, input.IdempotencyKey, input.CanonicalRequest)
		if created.Code != 201 {
			t.Fatalf("created status=%d body=%s", created.Code, created.Body.String())
		}
		replay := performHTTPIngestion(t, router, token, input.IdempotencyKey, input.CanonicalRequest)
		if replay.Code != 200 || replay.Body.String() != created.Body.String() {
			t.Fatalf("replay status=%d body=%s", replay.Code, replay.Body.String())
		}
		changed := mutateCanonicalRequest(t, input.CanonicalRequest, func(metadata map[string]interface{}) { metadata["source_reference"] = "protected://changed" })
		conflict := performHTTPIngestion(t, router, token, input.IdempotencyKey, changed)
		assertHTTPProblemCode(t, conflict, 409, IngestionIdempotencyPayloadMismatch)
		assertAggregateCounts(t, db, input, 1, 1, 1)
		var stored, receipt string
		if err := db.QueryRow(`SELECT request_fingerprint,receipt->>'request_fingerprint' FROM palette_ingestion_records WHERE proposal_id=$1`, proposalFromSubmission(input)).Scan(&stored, &receipt); err != nil {
			t.Fatal(err)
		}
		prepared, _ := prepareIngestion(input)
		if stored != prepared.claim.RequestFingerprint || receipt != stored {
			t.Fatalf("fingerprints stored=%s receipt=%s expected=%s", stored, receipt, prepared.claim.RequestFingerprint)
		}
	})

	t.Run("proposal and exact content conflicts have no partial aggregate", func(t *testing.T) {
		original := uniqueServiceSubmission(t, 402, false)
		if response := performHTTPIngestion(t, router, token, original.IdempotencyKey, original.CanonicalRequest); response.Code != 201 {
			t.Fatalf("original=%d %s", response.Code, response.Body.String())
		}
		proposalConflict := original
		proposalConflict.IdempotencyKey = "123e4567-e89b-42d3-a456-426614174902"
		proposalConflict.CanonicalRequest = mutateCanonicalRequest(t, original.CanonicalRequest, func(metadata map[string]interface{}) { metadata["source_reference"] = "protected://proposal-conflict" })
		assertHTTPProblemCode(t, performHTTPIngestion(t, router, token, proposalConflict.IdempotencyKey, proposalConflict.CanonicalRequest), 409, IngestionProposalIDConflict)
		exact := original
		exact.IdempotencyKey = "123e4567-e89b-42d3-a456-426614174903"
		exact.CanonicalRequest = mutateCanonicalRequest(t, original.CanonicalRequest, func(metadata map[string]interface{}) {
			metadata["proposal_id"] = "batch/http-exact-other"
			metadata["source_key"] = "http-exact-other"
			metadata["source_hash"] = repeat("e", 64)
		})
		assertHTTPProblemCode(t, performHTTPIngestion(t, router, token, exact.IdempotencyKey, exact.CanonicalRequest), 409, IngestionExactContentDuplicate)
		assertAggregateCounts(t, db, original, 1, 0, 1)
	})

	t.Run("processing retryable terminal and recovered outcomes", func(t *testing.T) {
		processing := uniqueServiceSubmission(t, 403, false)
		prepared, _ := prepareIngestion(processing)
		if claim, err := repo.ClaimOrRecover(context.Background(), prepared.claim); err != nil || claim.Outcome != IngestionClaimed {
			t.Fatalf("claim=%+v err=%v", claim, err)
		}
		response := performHTTPIngestion(t, router, token, processing.IdempotencyKey, processing.CanonicalRequest)
		assertHTTPProblemCode(t, response, 409, IngestionInProgress)
		if response.Header().Get("Retry-After") == "" {
			t.Fatal("processing Retry-After missing")
		}

		retryable := uniqueServiceSubmission(t, 404, true)
		retryService := newIngestionService(repo, testSQLAggregateFactory{db: db, claims: repo, palettes: palettes, failPreview: true}, 5)
		response = performHTTPIngestion(t, postgresHTTPRouter(t, retryService, secret), token, retryable.IdempotencyKey, retryable.CanonicalRequest)
		assertHTTPProblemCode(t, response, 503, IngestionRetryableFailure)
		if response.Header().Get("Retry-After") != "5" {
			t.Fatalf("retryable Retry-After=%s", response.Header().Get("Retry-After"))
		}
		assertAggregateCounts(t, db, retryable, 0, 0, 0)

		terminal := uniqueServiceSubmission(t, 405, false)
		terminalService := newIngestionService(repo, testSQLAggregateFactory{db: db, claims: repo, palettes: palettes, failBind: true}, 5)
		response = performHTTPIngestion(t, postgresHTTPRouter(t, terminalService, secret), token, terminal.IdempotencyKey, terminal.CanonicalRequest)
		assertHTTPProblemCode(t, response, 409, IngestionFailed)
		assertAggregateCounts(t, db, terminal, 0, 0, 0)

		recovered := uniqueServiceSubmission(t, 406, false)
		recoveredService := newIngestionService(repo, testSQLAggregateFactory{db: db, claims: repo, palettes: palettes, ambiguousCommit: true}, 5)
		response = performHTTPIngestion(t, postgresHTTPRouter(t, recoveredService, secret), token, recovered.IdempotencyKey, recovered.CanonicalRequest)
		if response.Code != 200 {
			t.Fatalf("recovered=%d %s", response.Code, response.Body.String())
		}
		assertAggregateCounts(t, db, recovered, 1, 0, 1)
	})

	t.Run("auth and request failures do not create claims or aggregates", func(t *testing.T) {
		input := uniqueServiceSubmission(t, 407, false)
		anonymous := performHTTPIngestion(t, router, "", input.IdempotencyKey, input.CanonicalRequest)
		if anonymous.Code != 401 {
			t.Fatalf("anonymous=%d %s", anonymous.Code, anonymous.Body.String())
		}
		if _, err := db.Exec(`UPDATE users SET role='user' WHERE id=$1`, ingestionTestActorID); err != nil {
			t.Fatal(err)
		}
		forbidden := performHTTPIngestion(t, router, token, input.IdempotencyKey, input.CanonicalRequest)
		if forbidden.Code != 403 {
			t.Fatalf("forbidden=%d %s", forbidden.Code, forbidden.Body.String())
		}
		if _, err := db.Exec(`UPDATE users SET role='admin' WHERE id=$1`, ingestionTestActorID); err != nil {
			t.Fatal(err)
		}
		invalid := mutateCanonicalRequest(t, input.CanonicalRequest, func(metadata map[string]interface{}) { metadata["pipeline_version"] = "unsupported" })
		assertHTTPProblemCode(t, performHTTPIngestion(t, router, token, input.IdempotencyKey, invalid), 422, "UNSUPPORTED_PIPELINE_VERSION")
		malformed := performHTTPIngestion(t, router, token, input.IdempotencyKey, []byte(`{"ingestion_metadata":`))
		assertHTTPProblemCode(t, malformed, 400, "INVALID_JSON")
		oversized := append(append([]byte(nil), input.CanonicalRequest...), bytes.Repeat([]byte{' '}, int(IngestionRequestBodyLimit)+1-len(input.CanonicalRequest))...)
		assertHTTPProblemCode(t, performHTTPIngestion(t, router, token, input.IdempotencyKey, oversized), 413, "REQUEST_BODY_TOO_LARGE")
		var records int
		if err := db.QueryRow(`SELECT COUNT(*) FROM palette_ingestion_records WHERE proposal_id=$1`, proposalFromSubmission(input)).Scan(&records); err != nil || records != 0 {
			t.Fatalf("records=%d err=%v", records, err)
		}
	})
}

func postgresHTTPRouter(t *testing.T, service ingestionHTTPService, secret string) *gin.Engine {
	t.Helper()
	handler, err := NewIngestionHandler(service)
	if err != nil {
		t.Fatal(err)
	}
	gin.SetMode(gin.TestMode)
	router := gin.New()
	api := router.Group("/api")
	handler.RegisterRoutes(api, figmiddleware.Auth(secret, user.NewRepository()), figmiddleware.AdminRequired())
	return router
}

func performHTTPIngestion(t *testing.T, router http.Handler, token, key string, raw []byte) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/admin/palette-candidates", bytes.NewReader(raw))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(idempotencyHeader, key)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)
	return recorder
}

func assertHTTPProblemCode(t *testing.T, recorder *httptest.ResponseRecorder, status int, code string) {
	t.Helper()
	if recorder.Code != status {
		t.Fatalf("status=%d want=%d body=%s", recorder.Code, status, recorder.Body.String())
	}
	var envelope map[string]interface{}
	if err := json.Unmarshal(recorder.Body.Bytes(), &envelope); err != nil || len(envelope) != 2 {
		t.Fatalf("unsafe body=%s err=%v", recorder.Body.String(), err)
	}
	bodyCode, codeOK := envelope["code"].(string)
	message, messageOK := envelope["message"].(string)
	if !codeOK || !messageOK || bodyCode != code || message == "" {
		t.Fatalf("body=%s", recorder.Body.String())
	}
}

type testSQLAggregateFactory struct {
	db                                                                     *sql.DB
	claims                                                                 *IngestionRepository
	palettes                                                               *Repository
	failPalette, failPreview, failBind, ambiguousCommit, ambiguousRollback bool
}

func (f testSQLAggregateFactory) BeginAggregate(ctx context.Context) (ingestionAggregateTx, error) {
	tx, err := f.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	return &testSQLAggregateTx{sqlIngestionAggregateTx: sqlIngestionAggregateTx{tx: tx, claims: f.claims, palettes: f.palettes}, failPalette: f.failPalette, failPreview: f.failPreview, failBind: f.failBind, ambiguousCommit: f.ambiguousCommit, ambiguousRollback: f.ambiguousRollback}, nil
}

type testSQLAggregateTx struct {
	sqlIngestionAggregateTx
	failPalette, failPreview, failBind, ambiguousCommit, ambiguousRollback bool
}

func (t *testSQLAggregateTx) CreateCandidate(req *CreatePaletteRequest, actor string) (*Palette, error) {
	palette, err := t.sqlIngestionAggregateTx.CreateCandidate(req, actor)
	if err == nil && t.failPalette {
		return nil, fmt.Errorf("after palette insert: %w", ErrIngestionAggregateTransient)
	}
	return palette, err
}

func (t *testSQLAggregateTx) CreatePreview(id string, req *CreatePreviewCaseRequest) (*PalettePreviewCase, error) {
	if t.failPreview {
		if _, err := t.sqlIngestionAggregateTx.CreatePreview(id, req); err != nil {
			return nil, err
		}
		return nil, fmt.Errorf("after preview insert: %w", ErrIngestionAggregateTransient)
	}
	return t.sqlIngestionAggregateTx.CreatePreview(id, req)
}
func (t *testSQLAggregateTx) BindSuccess(ctx context.Context, record string, attempt int, lease, paletteID string, receipt json.RawMessage) (*IngestionRecord, error) {
	if t.failBind {
		return nil, ErrIngestionReceipt
	}
	return t.sqlIngestionAggregateTx.BindSuccess(ctx, record, attempt, lease, paletteID, receipt)
}
func (t *testSQLAggregateTx) Commit() error {
	err := t.sqlIngestionAggregateTx.Commit()
	if err == nil && t.ambiguousCommit {
		return errors.New("injected ambiguous transport result after commit")
	}
	return err
}
func (t *testSQLAggregateTx) Rollback() error {
	err := t.sqlIngestionAggregateTx.Rollback()
	if err == nil && t.ambiguousRollback {
		return errors.New("injected ambiguous transport result after rollback")
	}
	return err
}

func uniqueServiceSubmission(t *testing.T, seed int, preview bool) CandidateIngestionSubmission {
	input := validServiceSubmission(t, preview)
	var request canonicalIngestionRequest
	if err := json.Unmarshal(input.CanonicalRequest, &request); err != nil {
		t.Fatal(err)
	}
	request.IngestionMetadata.ProposalID = fmt.Sprintf("batch/service-pg-%d", seed)
	request.IngestionMetadata.SourceKey = fmt.Sprintf("service-pg-%d", seed)
	request.Palette.Name = fmt.Sprintf("Service Palette %d", seed)
	contentColors := make([]interface{}, len(request.Palette.Colors))
	for i, color := range request.Palette.Colors {
		contentColors[i] = map[string]interface{}{"provisional_id": color.ID, "hex": color.Hex, "order": color.Order}
	}
	hash, err := canonicalValueHash(map[string]interface{}{"schema_version": request.IngestionMetadata.SchemaVersion, "colors": contentColors, "palette": map[string]interface{}{"name": request.Palette.Name, "type": request.Palette.Type, "disciplines": request.Palette.Disciplines, "use_cases": request.Palette.UseCases, "avoid_cases": request.Palette.AvoidCases, "tags": request.Palette.Tags, "chart_applicability": request.Palette.ChartApplicability}, "preview_cases": request.PreviewCases})
	if err != nil {
		t.Fatal(err)
	}
	request.IngestionMetadata.NormalizedContentHash = hash
	raw, err := json.Marshal(request)
	if err != nil {
		t.Fatal(err)
	}
	input.CanonicalRequest, input.IdempotencyKey, input.ActorUserID = raw, fmt.Sprintf("123e4567-e89b-42d3-a456-%012d", seed), ingestionTestActorID
	return input
}

func proposalFromSubmission(input CandidateIngestionSubmission) string {
	var request canonicalIngestionRequest
	_ = json.Unmarshal(input.CanonicalRequest, &request)
	return request.IngestionMetadata.ProposalID
}
func assertAggregateCounts(t *testing.T, db *sql.DB, input CandidateIngestionSubmission, palettes, previews, succeeded int) {
	t.Helper()
	var gotPalettes, gotPreviews, gotSucceeded int
	err := db.QueryRow(`SELECT COUNT(p.id),COUNT(pc.id),COUNT(r.id) FILTER (WHERE r.processing_state='succeeded') FROM palette_ingestion_records r LEFT JOIN palettes p ON p.id=r.palette_id LEFT JOIN palette_preview_cases pc ON pc.palette_id=p.id WHERE r.proposal_id=$1`, proposalFromSubmission(input)).Scan(&gotPalettes, &gotPreviews, &gotSucceeded)
	if err != nil {
		t.Fatal(err)
	}
	if gotPalettes != palettes || gotPreviews != previews || gotSucceeded != succeeded {
		t.Fatalf("counts palette=%d preview=%d succeeded=%d", gotPalettes, gotPreviews, gotSucceeded)
	}
}
