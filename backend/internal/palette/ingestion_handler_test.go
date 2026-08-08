package palette

import (
	"bytes"
	"context"
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/qiqi/figcolor/backend/internal/authctx"
	figjwt "github.com/qiqi/figcolor/backend/internal/jwt"
	figmiddleware "github.com/qiqi/figcolor/backend/internal/middleware"
	"github.com/qiqi/figcolor/backend/internal/user"
)

type ingestionHTTPServiceStub struct {
	result *IngestionServiceResult
	calls  int
	input  CandidateIngestionSubmission
}

func (s *ingestionHTTPServiceStub) Ingest(_ context.Context, input CandidateIngestionSubmission) *IngestionServiceResult {
	s.calls++
	s.input = input
	return s.result
}

func TestIngestionHandlerAcceptsRawCanonicalRequestAndStableSuccesses(t *testing.T) {
	for _, tc := range []struct {
		name, outcome string
		status        int
	}{
		{"created", IngestionServiceCreated, http.StatusCreated},
		{"replayed", IngestionServiceReplayed, http.StatusOK},
		{"recovered", IngestionServiceRecoveredUnknown, http.StatusOK},
	} {
		t.Run(tc.name, func(t *testing.T) {
			raw := validServiceSubmission(t, false).CanonicalRequest
			receipt := validHTTPReceipt()
			service := &ingestionHTTPServiceStub{result: &IngestionServiceResult{Outcome: tc.outcome, Receipt: receipt}}
			recorder := serveIngestion(t, service, raw, "application/json", []string{"123e4567-e89b-42d3-a456-426614174099"})
			if recorder.Code != tc.status || !bytes.Equal(recorder.Body.Bytes(), receipt) || service.calls != 1 {
				t.Fatalf("status=%d body=%s calls=%d", recorder.Code, recorder.Body.String(), service.calls)
			}
			if !bytes.Equal(service.input.CanonicalRequest, raw) || service.input.ActorUserID != "11111111-1111-4111-8111-111111111111" || len(service.input.ValidationIssues) != 0 || len(service.input.DuplicateEvidence) != 0 || service.input.SourceReference != nil {
				t.Fatalf("handler changed raw request or injected side-channel evidence: %+v", service.input)
			}
			if strings.Contains(recorder.Body.String(), "outcome") || strings.Contains(recorder.Body.String(), "receipt") {
				t.Fatal("service wrapper leaked")
			}
		})
	}
}

func TestIngestionHandlerStrictTransportBoundary(t *testing.T) {
	valid := validServiceSubmission(t, false).CanonicalRequest
	tests := []struct {
		name, contentType string
		body              []byte
		headers           []string
		status            int
		code              string
	}{
		{"missing content type", "", valid, []string{validKey()}, 415, "UNSUPPORTED_MEDIA_TYPE"},
		{"wrong content type", "text/json", valid, []string{validKey()}, 415, "UNSUPPORTED_MEDIA_TYPE"},
		{"json suffix content type", "application/vnd.figcolor+json", valid, []string{validKey()}, 415, "UNSUPPORTED_MEDIA_TYPE"},
		{"malformed content type", "application/json; charset", valid, []string{validKey()}, 415, "UNSUPPORTED_MEDIA_TYPE"},
		{"empty charset", "application/json; charset=", valid, []string{validKey()}, 415, "UNSUPPORTED_MEDIA_TYPE"},
		{"non utf8 charset", "application/json; charset=utf-16", valid, []string{validKey()}, 415, "UNSUPPORTED_MEDIA_TYPE"},
		{"extra parameter", "application/json; charset=utf-8; profile=x", valid, []string{validKey()}, 415, "UNSUPPORTED_MEDIA_TYPE"},
		{"duplicate charset", "application/json; charset=utf-8; charset=utf-8", valid, []string{validKey()}, 415, "UNSUPPORTED_MEDIA_TYPE"},
		{"empty", "application/json", nil, []string{validKey()}, 400, "INVALID_JSON"},
		{"malformed", "application/json", []byte(`{"x":`), []string{validKey()}, 400, "INVALID_JSON"},
		{"trailing document", "application/json", []byte(`{} {}`), []string{validKey()}, 400, "INVALID_JSON"},
		{"duplicate top key", "application/json", []byte(`{"a":1,"a":2}`), []string{validKey()}, 400, "INVALID_JSON"},
		{"duplicate nested key", "application/json", []byte(`{"a":{"x":1,"x":2}}`), []string{validKey()}, 400, "INVALID_JSON"},
		{"invalid utf8", "application/json", []byte{'{', '"', 'x', '"', ':', '"', 0xff, '"', '}'}, []string{validKey()}, 400, "INVALID_JSON"},
		{"lone surrogate", "application/json", []byte(`{"x":"\ud800"}`), []string{validKey()}, 400, "INVALID_JSON"},
		{"overflow number", "application/json", []byte(`{"x":1e400}`), []string{validKey()}, 400, "INVALID_JSON"},
		{"missing key", "application/json", valid, nil, 400, "INVALID_IDEMPOTENCY_KEY"},
		{"blank key", "application/json", valid, []string{""}, 400, "INVALID_IDEMPOTENCY_KEY"},
		{"malformed key", "application/json", valid, []string{"not-a-uuid"}, 400, "INVALID_IDEMPOTENCY_KEY"},
		{"duplicate key header", "application/json", valid, []string{validKey(), validKey()}, 400, "INVALID_IDEMPOTENCY_KEY"},
		{"comma key header", "application/json", valid, []string{validKey() + "," + validKey()}, 400, "INVALID_IDEMPOTENCY_KEY"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			service := &ingestionHTTPServiceStub{result: &IngestionServiceResult{Outcome: IngestionServiceCreated, Receipt: validHTTPReceipt()}}
			recorder := serveIngestion(t, service, tc.body, tc.contentType, tc.headers)
			assertIngestionProblem(t, recorder, tc.status, tc.code)
			if service.calls != 0 {
				t.Fatalf("service calls=%d", service.calls)
			}
		})
	}
}

func TestIngestionHandlerContentTypeAndBodyLimitEdges(t *testing.T) {
	valid := validServiceSubmission(t, false).CanonicalRequest
	for _, contentType := range []string{"application/json", "APPLICATION/JSON", "application/json; charset=utf-8", "application/json ; CHARSET=UtF-8"} {
		service := &ingestionHTTPServiceStub{result: &IngestionServiceResult{Outcome: IngestionServiceCreated, Receipt: validHTTPReceipt()}}
		recorder := serveIngestion(t, service, valid, contentType, []string{validKey()})
		if recorder.Code != http.StatusCreated {
			t.Fatalf("content-type %q status=%d body=%s", contentType, recorder.Code, recorder.Body.String())
		}
	}
	exact := append(append([]byte(nil), valid...), bytes.Repeat([]byte{' '}, int(IngestionRequestBodyLimit)-len(valid))...)
	service := &ingestionHTTPServiceStub{result: &IngestionServiceResult{Outcome: IngestionServiceCreated, Receipt: validHTTPReceipt()}}
	if recorder := serveIngestion(t, service, exact, "application/json", []string{validKey()}); recorder.Code != http.StatusCreated || service.calls != 1 {
		t.Fatalf("exact limit status=%d calls=%d", recorder.Code, service.calls)
	}
	over := append(exact, ' ')
	service = &ingestionHTTPServiceStub{result: &IngestionServiceResult{Outcome: IngestionServiceCreated, Receipt: validHTTPReceipt()}}
	recorder := serveIngestion(t, service, over, "application/json", []string{validKey()})
	assertIngestionProblem(t, recorder, 413, "REQUEST_BODY_TOO_LARGE")
	if service.calls != 0 {
		t.Fatal("oversized request called service")
	}
	service = &ingestionHTTPServiceStub{result: &IngestionServiceResult{Outcome: IngestionServiceCreated, Receipt: validHTTPReceipt()}}
	handler, _ := NewIngestionHandler(service)
	router := gin.New()
	router.POST("/api/admin/palette-candidates", func(c *gin.Context) { authctx.SetUser(c, "11111111-1111-4111-8111-111111111111", "admin") }, handler.IngestCandidate)
	req := httptest.NewRequest(http.MethodPost, "/api/admin/palette-candidates", bytes.NewReader(over))
	req.ContentLength = -1
	req.TransferEncoding = []string{"chunked"}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(idempotencyHeader, validKey())
	recorder = httptest.NewRecorder()
	router.ServeHTTP(recorder, req)
	assertIngestionProblem(t, recorder, 413, "REQUEST_BODY_TOO_LARGE")
	if service.calls != 0 {
		t.Fatal("oversized chunked request called service")
	}
}

func TestIngestionHandlerRejectsRequestContractBeforeService(t *testing.T) {
	tests := []struct {
		name, field string
		value       interface{}
		code        string
	}{
		{"unsupported schema", "schema_version", float64(2), "UNSUPPORTED_SCHEMA_VERSION"},
		{"unsupported pipeline", "pipeline_version", "palette-ingest-wp5-reporting.2", "UNSUPPORTED_PIPELINE_VERSION"},
		{"null evidence", "validation_issues", nil, "INVALID_INGESTION_REQUEST"},
		{"wrong evidence", "duplicate_evidence", map[string]interface{}{}, "INVALID_INGESTION_REQUEST"},
		{"null source", "source_reference", nil, "INVALID_INGESTION_REQUEST"},
		{"unknown field", "actor_user_id", "forged", "INVALID_INGESTION_REQUEST"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			input := validServiceSubmission(t, false)
			input.CanonicalRequest = mutateCanonicalRequest(t, input.CanonicalRequest, func(metadata map[string]interface{}) { metadata[tc.field] = tc.value })
			service := &ingestionHTTPServiceStub{}
			recorder := serveIngestion(t, service, input.CanonicalRequest, "application/json", []string{validKey()})
			assertIngestionProblem(t, recorder, 422, tc.code)
			if service.calls != 0 {
				t.Fatal("invalid request called service")
			}
		})
	}
}

func TestIngestionHandlerRejectsStableIDSeedValueBeforeService(t *testing.T) {
	values := []int{42, 0}
	for _, value := range values {
		t.Run(fmt.Sprintf("seed-%d", value), func(t *testing.T) {
			input := serviceSubmissionWithSeed(t, PreviewCaseSeedStrategyStableID, &value)
			service := &ingestionHTTPServiceStub{}
			recorder := serveIngestion(t, service, input.CanonicalRequest, "application/json", []string{validKey()})
			assertIngestionProblem(t, recorder, http.StatusUnprocessableEntity, "INVALID_INGESTION_REQUEST")
			if service.calls != 0 {
				t.Fatalf("stable_id seed %d reached ingestion service", value)
			}
		})
	}
}

func TestIngestionHTTPAdapterExhaustivePublicMapping(t *testing.T) {
	receipt := validHTTPReceipt()
	tests := []struct {
		name   string
		result *IngestionServiceResult
		status int
		code   string
		retry  int64
		raw    bool
	}{
		{"created", &IngestionServiceResult{Outcome: IngestionServiceCreated, Receipt: receipt}, 201, "", 0, true},
		{"replay", &IngestionServiceResult{Outcome: IngestionServiceReplayed, Receipt: receipt}, 200, "", 0, true},
		{"recovered", &IngestionServiceResult{Outcome: IngestionServiceRecoveredUnknown, Receipt: receipt}, 200, "", 0, true},
		{"processing", &IngestionServiceResult{Outcome: IngestionInProgress, RetryAfterSeconds: 3}, 409, IngestionInProgress, 3, false},
		{"processing minimum", &IngestionServiceResult{Outcome: IngestionInProgress}, 409, IngestionInProgress, 1, false},
		{"payload", &IngestionServiceResult{Outcome: IngestionIdempotencyPayloadMismatch}, 409, IngestionIdempotencyPayloadMismatch, 0, false},
		{"proposal", &IngestionServiceResult{Outcome: IngestionProposalIDConflict}, 409, IngestionProposalIDConflict, 0, false},
		{"exact", &IngestionServiceResult{Outcome: IngestionExactContentDuplicate}, 409, IngestionExactContentDuplicate, 0, false},
		{"retryable", &IngestionServiceResult{Outcome: IngestionServiceRetryNotReady, Code: IngestionServiceAggregateRetryableFailure, RetryAfterSeconds: 5}, 503, IngestionRetryableFailure, 5, false},
		{"terminal integrity", &IngestionServiceResult{Outcome: IngestionFailed, Code: IngestionServiceAggregateIntegrityFailure}, 409, IngestionFailed, 0, false},
		{"validation", &IngestionServiceResult{Outcome: IngestionServiceValidationFailed, Message: "secret"}, 422, "INVALID_INGESTION_REQUEST", 0, false},
		{"schema", &IngestionServiceResult{Outcome: IngestionServiceUnsupportedSchemaVersion}, 422, "UNSUPPORTED_SCHEMA_VERSION", 0, false},
		{"pipeline", &IngestionServiceResult{Outcome: IngestionServiceUnsupportedPipelineVersion}, 422, "UNSUPPORTED_PIPELINE_VERSION", 0, false},
		{"internal", &IngestionServiceResult{Outcome: IngestionServiceInternalError, Message: "SELECT secret"}, 500, "INTERNAL_ERROR", 0, false},
		{"unknown", &IngestionServiceResult{Outcome: IngestionServiceOutcomeUnknown}, 503, IngestionServiceOutcomeUnknown, 5, false},
		{"future", &IngestionServiceResult{Outcome: "FUTURE", Message: "driver secret"}, 503, IngestionServiceOutcomeUnknown, 5, false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			response := adaptIngestionServiceResult(tc.result)
			if response.status != tc.status || response.retryAfter != tc.retry {
				t.Fatalf("response=%+v", response)
			}
			if tc.raw {
				if !bytes.Equal(response.receipt, receipt) || response.problem != nil {
					t.Fatalf("response=%+v", response)
				}
			} else if response.problem == nil || response.problem.Code != tc.code || strings.Contains(strings.ToLower(response.problem.Message), "secret") {
				t.Fatalf("unsafe response=%+v", response)
			}
		})
	}
	invalid := adaptIngestionServiceResult(&IngestionServiceResult{Outcome: IngestionServiceCreated, Receipt: json.RawMessage(`{"proposal_id":"x"}`)})
	if invalid.status != 500 || invalid.problem.Code != "INTERNAL_ERROR" {
		t.Fatalf("invalid receipt=%+v", invalid)
	}
}

func TestIngestionRouteUsesAuthoritativeAuthAndAdminChain(t *testing.T) {
	const secret = "ingestion-auth-secret"
	valid := validServiceSubmission(t, false).CanonicalRequest
	tests := []struct {
		name       string
		token      func(*testing.T) string
		dbRole     string
		dbUser     bool
		wantStatus int
		wantCalls  int
		wantError  string
	}{
		{"anonymous", nil, "", false, 401, 0, "authorization header required"},
		{"malformed token", func(*testing.T) string { return "invalid" }, "", false, 401, 0, "invalid or expired token"},
		{"expired token", func(t *testing.T) string { return testJWT(t, secret, -time.Minute) }, "", false, 401, 0, "invalid or expired token"},
		{"missing subject", func(t *testing.T) string { return testJWT(t, secret, time.Hour) }, "", false, 401, 0, "user not found"},
		{"database user", func(t *testing.T) string { return testJWT(t, secret, time.Hour) }, "user", true, 403, 0, "access denied"},
		{"database admin", func(t *testing.T) string { return testJWT(t, secret, time.Hour) }, "admin", true, 201, 1, ""},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			ops := []scriptedDBOp{}
			if tc.token != nil && tc.name != "malformed token" && tc.name != "expired token" {
				ops = append(ops, queryOp("FROM users", "WHERE id = $1", authUserRows(tc.dbUser, tc.dbRole)))
			}
			restore := installScriptedDB(t, ops)
			defer restore()
			service := &ingestionHTTPServiceStub{result: &IngestionServiceResult{Outcome: IngestionServiceCreated, Receipt: validHTTPReceipt()}}
			handler, err := NewIngestionHandler(service)
			if err != nil {
				t.Fatal(err)
			}
			gin.SetMode(gin.TestMode)
			router := gin.New()
			api := router.Group("/api")
			handler.RegisterRoutes(api, figmiddleware.Auth(secret, user.NewRepository()), figmiddleware.AdminRequired())
			req := httptest.NewRequest(http.MethodPost, "/api/admin/palette-candidates", bytes.NewReader(valid))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set(idempotencyHeader, validKey())
			if tc.token != nil {
				req.Header.Set(figmiddleware.AuthorizationHeader, figmiddleware.BearerPrefix+tc.token(t))
			}
			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, req)
			if recorder.Code != tc.wantStatus || service.calls != tc.wantCalls {
				t.Fatalf("status=%d body=%s calls=%d", recorder.Code, recorder.Body.String(), service.calls)
			}
			if tc.wantStatus == 401 || tc.wantStatus == 403 {
				var body map[string]interface{}
				if json.Unmarshal(recorder.Body.Bytes(), &body) != nil || len(body) != 1 || body["error"] != tc.wantError {
					t.Fatalf("auth exception body=%s", recorder.Body.String())
				}
			}
		})
	}

	service := &ingestionHTTPServiceStub{}
	handler, _ := NewIngestionHandler(service)
	router := gin.New()
	api := router.Group("/api")
	handler.RegisterRoutes(api, func(c *gin.Context) { c.AbortWithStatus(401) }, func(c *gin.Context) { c.Next() })
	for _, target := range []string{"/api/palette-candidates", "/api/admin/palette-candidates/"} {
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, target, nil))
		if recorder.Code == http.StatusCreated || service.calls != 0 {
			t.Fatalf("alias %s status=%d calls=%d", target, recorder.Code, service.calls)
		}
	}
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/api/admin/palette-candidates", nil))
	if recorder.Code != 404 || service.calls != 0 {
		t.Fatalf("wrong method status=%d calls=%d", recorder.Code, service.calls)
	}
}

func TestIngestionHandlerDependencyIsRequired(t *testing.T) {
	if handler, err := NewIngestionHandler(nil); err == nil || handler != nil {
		t.Fatalf("handler=%v err=%v", handler, err)
	}
}

func authUserRows(exists bool, role string) *scriptedRows {
	rows := &scriptedRows{columns: []string{"id", "email", "email_verified", "name", "avatar_url", "role", "status", "created_at", "updated_at"}}
	if exists {
		now := time.Now()
		rows.values = [][]driver.Value{{"11111111-1111-4111-8111-111111111111", "admin@example.test", true, nil, nil, role, "active", now, now}}
	}
	return rows
}

func testJWT(t *testing.T, secret string, expiry time.Duration) string {
	t.Helper()
	token, err := figjwt.GenerateToken("11111111-1111-4111-8111-111111111111", "admin@example.test", secret, expiry)
	if err != nil {
		t.Fatal(err)
	}
	return token
}

func serveIngestion(t *testing.T, service *ingestionHTTPServiceStub, body []byte, contentType string, keys []string) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	handler, err := NewIngestionHandler(service)
	if err != nil {
		t.Fatal(err)
	}
	router := gin.New()
	router.POST("/api/admin/palette-candidates", func(c *gin.Context) {
		authctx.SetUser(c, "11111111-1111-4111-8111-111111111111", "admin")
		c.Next()
	}, handler.IngestCandidate)
	req := httptest.NewRequest(http.MethodPost, "/api/admin/palette-candidates", bytes.NewReader(body))
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	for _, key := range keys {
		req.Header.Add(idempotencyHeader, key)
	}
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)
	return recorder
}

func assertIngestionProblem(t *testing.T, recorder *httptest.ResponseRecorder, status int, code string) {
	t.Helper()
	if recorder.Code != status {
		t.Fatalf("status=%d want=%d body=%s", recorder.Code, status, recorder.Body.String())
	}
	var body map[string]interface{}
	if err := json.Unmarshal(recorder.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["code"] != code || body["message"] == "" || len(body) != 2 {
		t.Fatalf("body=%v", body)
	}
	if retry := recorder.Header().Get("Retry-After"); retry != "" {
		t.Fatalf("unexpected Retry-After=%s", retry)
	}
}

func validHTTPReceipt() json.RawMessage {
	return json.RawMessage(`{"proposal_id":"batch/service-proposal","normalized_content_hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","request_fingerprint":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","palette_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","slug":"service-palette","status":"candidate","preview_case_ids":[]}`)
}

func validKey() string { return "123e4567-e89b-42d3-a456-426614174099" }
