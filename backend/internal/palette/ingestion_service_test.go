package palette

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/qiqi/figcolor/backend/internal/config"
	figjcs "github.com/qiqi/figcolor/backend/internal/jcs"
)

type serviceClaimRepo struct {
	claim       *IngestionClaimResult
	claimErr    error
	lookup      *IngestionClaimResult
	lookupErr   error
	claimCalls  int
	lookupCalls int
	markCalls   int
	marked      IngestionFailureInput
	markCtxErr  error
	events      *[]string
	lastInput   IngestionClaimInput
}

func (r *serviceClaimRepo) ClaimOrRecover(_ context.Context, input IngestionClaimInput) (*IngestionClaimResult, error) {
	r.claimCalls++
	r.lastInput = input
	return r.claim, r.claimErr
}
func (r *serviceClaimRepo) Lookup(context.Context, string, string, string) (*IngestionClaimResult, error) {
	r.lookupCalls++
	recordServiceEvent(r.events, "lookup")
	return r.lookup, r.lookupErr
}
func (r *serviceClaimRepo) MarkFailed(ctx context.Context, _ string, _ int, _ string, failure IngestionFailureInput) (*IngestionRecord, error) {
	r.markCalls++
	recordServiceEvent(r.events, "mark_failed")
	r.marked = failure
	r.markCtxErr = ctx.Err()
	return &IngestionRecord{ProcessingState: IngestionStateFailed, FailureCode: &failure.Code, FailureRetryable: &failure.Retryable}, nil
}

type serviceAggregateFactory struct {
	tx    *serviceAggregateTx
	calls int
	err   error
}

func (f *serviceAggregateFactory) BeginAggregate(context.Context) (ingestionAggregateTx, error) {
	f.calls++
	return f.tx, f.err
}

type serviceAggregateTx struct {
	createErr                                    error
	previewErr                                   error
	bindErr                                      error
	commitErr                                    error
	rollbackErr                                  error
	commitActuallySucceeded                      bool
	panicCreate                                  bool
	created, previews, binds, commits, rollbacks int
	events                                       *[]string
}

func (t *serviceAggregateTx) CreateCandidate(req *CreatePaletteRequest, _ string) (*Palette, error) {
	t.created++
	if t.panicCreate {
		panic("secret panic")
	}
	if t.createErr != nil {
		return nil, t.createErr
	}
	return &Palette{ID: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", Slug: req.Slug, Status: "candidate"}, nil
}
func (t *serviceAggregateTx) CreatePreview(id string, _ *CreatePreviewCaseRequest) (*PalettePreviewCase, error) {
	t.previews++
	if t.previewErr != nil {
		return nil, t.previewErr
	}
	return &PalettePreviewCase{ID: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", PaletteID: id}, nil
}
func (t *serviceAggregateTx) BindSuccess(context.Context, string, int, string, string, json.RawMessage) (*IngestionRecord, error) {
	t.binds++
	recordServiceEvent(t.events, "bind")
	return &IngestionRecord{}, t.bindErr
}
func (t *serviceAggregateTx) Commit() error { t.commits++; return t.commitErr }
func (t *serviceAggregateTx) Rollback() error {
	t.rollbacks++
	recordServiceEvent(t.events, "rollback")
	return t.rollbackErr
}

func recordServiceEvent(events *[]string, event string) {
	if events != nil {
		*events = append(*events, event)
	}
}

func TestIngestionServiceValidatesBeforeClaimAndPreservesInput(t *testing.T) {
	repo := &serviceClaimRepo{}
	service := newIngestionService(repo, &serviceAggregateFactory{}, 5)
	input := validServiceSubmission(t, false)
	before := append([]byte(nil), input.CanonicalRequest...)
	input.CanonicalRequest = json.RawMessage(`{"unexpected":true}`)
	result := service.Ingest(context.Background(), input)
	if result.Code != IngestionServiceValidationFailed || repo.claimCalls != 0 {
		t.Fatalf("result=%+v claim calls=%d", result, repo.claimCalls)
	}
	input = validServiceSubmission(t, false)
	before = append(before[:0], input.CanonicalRequest...)
	record := serviceRecord(input, IngestionStateSucceeded)
	record.Receipt = json.RawMessage(`{"stable":true}`)
	repo.claim = &IngestionClaimResult{Outcome: IngestionReplay, Record: record}
	result = service.Ingest(context.Background(), input)
	if result.Outcome != IngestionServiceReplayed || !reflect.DeepEqual(before, []byte(input.CanonicalRequest)) {
		t.Fatalf("result=%+v input mutated", result)
	}
}

func TestPrepareIngestionStrictEvidenceMappingAndFingerprint(t *testing.T) {
	input := validServiceSubmission(t, false)
	issue := `[{"path":"$.palette.tags","code":"REVIEW_TAGS","message":"Review tags.","severity":"warning","source":"domain"}]`
	finding := `[{"kind":"canonical_content","fingerprint_type":"normalized_content_hash","fingerprint_version":1,"fingerprint":"` + repeat("a", 64) + `","current_identity":"batch/service-proposal","matched_identity":"catalog/palette-1","scope":"catalog_snapshot","path":"$.normalized_content_hash","code":"EXACT_CATALOG_CONTENT_MATCH","message":"Exact match.","severity":"warning","source":"duplicate"}]`
	input.CanonicalRequest = mutateCanonicalRequest(t, input.CanonicalRequest, func(metadata map[string]interface{}) {
		metadata["validation_issues"] = mustJSONValue(t, issue)
		metadata["duplicate_evidence"] = mustJSONValue(t, finding)
		metadata["source_reference"] = "protected://figure/1"
	})
	prepared, err := prepareIngestion(input)
	if err != nil {
		t.Fatal(err)
	}
	if !jsonSemanticallyEqual(prepared.claim.ValidationIssues, []byte(issue)) || !jsonSemanticallyEqual(prepared.claim.DuplicateEvidence, []byte(finding)) || prepared.claim.SourceReference == nil || *prepared.claim.SourceReference != "protected://figure/1" {
		t.Fatalf("evidence mapping lost data: %+v", prepared.claim)
	}
	want, err := canonicalJSONHash(input.CanonicalRequest)
	if err != nil || prepared.claim.RequestFingerprint != want {
		t.Fatalf("fingerprint=%s want=%s err=%v", prepared.claim.RequestFingerprint, want, err)
	}
	withoutSource := validServiceSubmission(t, false)
	preparedWithout, err := prepareIngestion(withoutSource)
	if err != nil || preparedWithout.claim.SourceReference != nil {
		t.Fatalf("omitted source_reference: claim=%+v err=%v", preparedWithout, err)
	}
}

func TestPrepareIngestionRejectsMalformedOrMissingEvidenceAndVersion(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(map[string]interface{})
	}{
		{"missing-validation", func(m map[string]interface{}) { delete(m, "validation_issues") }},
		{"null-validation", func(m map[string]interface{}) { m["validation_issues"] = nil }},
		{"wrong-validation-type", func(m map[string]interface{}) { m["validation_issues"] = map[string]interface{}{} }},
		{"missing-duplicate", func(m map[string]interface{}) { delete(m, "duplicate_evidence") }},
		{"null-duplicate", func(m map[string]interface{}) { m["duplicate_evidence"] = nil }},
		{"unknown-issue-field", func(m map[string]interface{}) {
			m["validation_issues"] = []interface{}{map[string]interface{}{"path": "$", "code": "BAD", "message": "Bad.", "severity": "error", "source": "domain", "secret": "x"}}
		}},
		{"null-source", func(m map[string]interface{}) { m["source_reference"] = nil }},
		{"unsupported-pipeline", func(m map[string]interface{}) { m["pipeline_version"] = "palette-ingest-wp5-reporting.2" }},
		{"unknown-metadata", func(m map[string]interface{}) { m["actor_user_id"] = "forged" }},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			input := validServiceSubmission(t, false)
			input.CanonicalRequest = mutateCanonicalRequest(t, input.CanonicalRequest, tc.mutate)
			if _, err := prepareIngestion(input); err == nil {
				t.Fatal("expected strict preparation failure")
			}
		})
	}
}

func TestIngestionServiceReturnsTypedUnsupportedVersionOutcomes(t *testing.T) {
	for _, tc := range []struct {
		name, field string
		value       interface{}
		code        string
	}{
		{"schema", "schema_version", float64(2), IngestionServiceUnsupportedSchemaVersion},
		{"pipeline", "pipeline_version", "palette-ingest-wp5-reporting.2", IngestionServiceUnsupportedPipelineVersion},
	} {
		t.Run(tc.name, func(t *testing.T) {
			input := validServiceSubmission(t, false)
			input.CanonicalRequest = mutateCanonicalRequest(t, input.CanonicalRequest, func(metadata map[string]interface{}) { metadata[tc.field] = tc.value })
			repo := &serviceClaimRepo{}
			result := newIngestionService(repo, &serviceAggregateFactory{}, 5).Ingest(context.Background(), input)
			if result.Code != tc.code || repo.claimCalls != 0 {
				t.Fatalf("result=%+v claims=%d", result, repo.claimCalls)
			}
		})
	}
}

func TestEvidenceOnlyChangesAlterRequestFingerprint(t *testing.T) {
	base := validServiceSubmission(t, false)
	first, err := prepareIngestion(base)
	if err != nil {
		t.Fatal(err)
	}
	for _, mutate := range []func(map[string]interface{}){
		func(m map[string]interface{}) {
			m["validation_issues"] = []interface{}{map[string]interface{}{"path": "$", "code": "REVIEW", "message": "Review.", "severity": "warning", "source": "domain"}}
		},
		func(m map[string]interface{}) { m["source_reference"] = "protected://figure/1" },
	} {
		changed := base
		changed.CanonicalRequest = mutateCanonicalRequest(t, base.CanonicalRequest, mutate)
		next, err := prepareIngestion(changed)
		if err != nil {
			t.Fatal(err)
		}
		if next.claim.RequestFingerprint == first.claim.RequestFingerprint {
			t.Fatal("evidence change did not alter fingerprint")
		}
	}
}

func mutateCanonicalRequest(t *testing.T, raw json.RawMessage, mutate func(map[string]interface{})) json.RawMessage {
	t.Helper()
	var request map[string]interface{}
	if err := json.Unmarshal(raw, &request); err != nil {
		t.Fatal(err)
	}
	metadata := request["ingestion_metadata"].(map[string]interface{})
	mutate(metadata)
	result, err := json.Marshal(request)
	if err != nil {
		t.Fatal(err)
	}
	return result
}

func mustJSONValue(t *testing.T, raw string) interface{} {
	t.Helper()
	var value interface{}
	if err := json.Unmarshal([]byte(raw), &value); err != nil {
		t.Fatal(err)
	}
	return value
}

func jsonSemanticallyEqual(left, right []byte) bool {
	var a, b interface{}
	return json.Unmarshal(left, &a) == nil && json.Unmarshal(right, &b) == nil && reflect.DeepEqual(a, b)
}

func TestIngestionServiceExhaustivelyClassifiesClaimOutcomes(t *testing.T) {
	input := validServiceSubmission(t, false)
	for _, tc := range []struct {
		claim, want string
		retry       int64
	}{
		{IngestionInProgress, IngestionInProgress, 7},
		{IngestionIdempotencyPayloadMismatch, IngestionIdempotencyPayloadMismatch, 0},
		{IngestionProposalIDConflict, IngestionProposalIDConflict, 0},
		{IngestionExactContentDuplicate, IngestionExactContentDuplicate, 0},
		{IngestionRetryableFailure, IngestionServiceRetryNotReady, 5},
		{IngestionFailed, IngestionFailed, 0},
	} {
		t.Run(tc.claim, func(t *testing.T) {
			record := serviceRecord(input, IngestionStateProcessing)
			if tc.claim == IngestionFailed {
				record.ProcessingState = IngestionStateFailed
				code := "SAFE_FAILURE"
				record.FailureCode = &code
			}
			repo := &serviceClaimRepo{claim: &IngestionClaimResult{Outcome: tc.claim, Record: record, RetryAfterSeconds: tc.retry}}
			factory := &serviceAggregateFactory{}
			result := newIngestionService(repo, factory, 5).Ingest(context.Background(), input)
			if result.Outcome != tc.want || factory.calls != 0 {
				t.Fatalf("result=%+v aggregate calls=%d", result, factory.calls)
			}
		})
	}
}

func TestIngestionServiceCreatedAndKnownFailureRules(t *testing.T) {
	input := validServiceSubmission(t, true)
	record := serviceRecord(input, IngestionStateProcessing)
	t.Run("created", func(t *testing.T) {
		repo := &serviceClaimRepo{claim: &IngestionClaimResult{Outcome: IngestionClaimed, Record: record, LeaseToken: "secret-lease"}}
		tx := &serviceAggregateTx{}
		result := newIngestionService(repo, &serviceAggregateFactory{tx: tx}, 5).Ingest(context.Background(), input)
		if result.Outcome != IngestionServiceCreated || tx.created != 1 || tx.previews != 1 || tx.binds != 1 || tx.commits != 1 || repo.markCalls != 0 {
			t.Fatalf("result=%+v tx=%+v", result, tx)
		}
		encoded, _ := json.Marshal(result)
		if strings.Contains(string(encoded), "secret-lease") {
			t.Fatal("lease leaked")
		}
	})
	t.Run("confirmed rollback marks retryable", func(t *testing.T) {
		repo := &serviceClaimRepo{claim: &IngestionClaimResult{Outcome: IngestionClaimed, Record: record, LeaseToken: "secret-lease"}}
		tx := &serviceAggregateTx{previewErr: fmt.Errorf("preview: %w", ErrIngestionAggregateTransient)}
		result := newIngestionService(repo, &serviceAggregateFactory{tx: tx}, 5).Ingest(context.Background(), input)
		if result.Outcome != IngestionServiceRetryNotReady || result.RetryAfterSeconds != IngestionRetryBackoffSeconds || repo.markCalls != 1 || !repo.marked.Retryable || tx.rollbacks != 1 {
			t.Fatalf("result=%+v mark=%+v", result, repo.marked)
		}
	})
	t.Run("lost lease resolves and never marks", func(t *testing.T) {
		stable := serviceRecord(input, IngestionStateSucceeded)
		stable.Receipt = json.RawMessage(`{"stable":true}`)
		repo := &serviceClaimRepo{claim: &IngestionClaimResult{Outcome: IngestionClaimed, Record: record, LeaseToken: "secret-lease"}, lookup: &IngestionClaimResult{Outcome: IngestionReplay, Record: stable}}
		tx := &serviceAggregateTx{bindErr: ErrIngestionClaimState}
		result := newIngestionService(repo, &serviceAggregateFactory{tx: tx}, 5).Ingest(context.Background(), input)
		if result.Outcome != IngestionServiceReplayed || repo.markCalls != 0 || repo.lookupCalls != 1 {
			t.Fatalf("result=%+v", result)
		}
	})
}

func TestIngestionServiceBindFailureRollbackDecisionTable(t *testing.T) {
	input := validServiceSubmission(t, false)
	base := serviceRecord(input, IngestionStateProcessing)
	stable := serviceRecord(input, IngestionStateSucceeded)
	stable.Receipt = json.RawMessage(`{"stable":true}`)
	tests := []struct {
		name          string
		bindErr       error
		rollbackErr   error
		lookup        *IngestionClaimResult
		lookupErr     error
		wantOutcome   string
		wantMark      int
		wantRetryable bool
		wantEvents    []string
	}{
		{"lost lease confirmed", ErrIngestionClaimState, nil, &IngestionClaimResult{Outcome: IngestionReplay, Record: stable}, nil, IngestionServiceReplayed, 0, false, []string{"bind", "rollback", "lookup"}},
		{"lost lease rollback unconfirmed", ErrIngestionClaimState, errors.New("connection lost"), nil, errors.New("lookup unavailable"), IngestionServiceOutcomeUnknown, 0, false, []string{"bind", "rollback", "lookup"}},
		{"validation confirmed", ErrIngestionReceipt, nil, nil, nil, IngestionFailed, 1, false, []string{"bind", "rollback", "mark_failed"}},
		{"validation rollback unconfirmed", ErrIngestionReceipt, sql.ErrTxDone, &IngestionClaimResult{Outcome: IngestionInProgress, Record: base, RetryAfterSeconds: 3}, nil, IngestionInProgress, 0, false, []string{"bind", "rollback", "lookup"}},
		{"transient confirmed", fmt.Errorf("bind: %w", ErrIngestionAggregateTransient), nil, nil, nil, IngestionServiceRetryNotReady, 1, true, []string{"bind", "rollback", "mark_failed"}},
		{"transient rollback unconfirmed", fmt.Errorf("bind: %w", ErrIngestionAggregateTransient), context.Canceled, &IngestionClaimResult{Outcome: IngestionInProgress, Record: base, RetryAfterSeconds: 2}, nil, IngestionInProgress, 0, false, []string{"bind", "rollback", "lookup"}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			events := []string{}
			repo := &serviceClaimRepo{claim: &IngestionClaimResult{Outcome: IngestionClaimed, Record: base, LeaseToken: "secret-lease"}, lookup: tc.lookup, lookupErr: tc.lookupErr, events: &events}
			tx := &serviceAggregateTx{bindErr: tc.bindErr, rollbackErr: tc.rollbackErr, events: &events}
			result := newIngestionService(repo, &serviceAggregateFactory{tx: tx}, 5).Ingest(context.Background(), input)
			if result.Outcome != tc.wantOutcome || repo.markCalls != tc.wantMark || !reflect.DeepEqual(events, tc.wantEvents) {
				t.Fatalf("result=%+v mark=%d events=%v", result, repo.markCalls, events)
			}
			if tc.wantMark == 1 && repo.marked.Retryable != tc.wantRetryable {
				t.Fatalf("marked=%+v", repo.marked)
			}
			encoded, _ := json.Marshal(result)
			if strings.Contains(string(encoded), "secret-lease") || strings.Contains(string(encoded), "connection lost") {
				t.Fatalf("unsafe result=%s", encoded)
			}
		})
	}
}

func TestIngestionServiceUnknownCommitAndPanicAreBounded(t *testing.T) {
	input := validServiceSubmission(t, false)
	record := serviceRecord(input, IngestionStateProcessing)
	t.Run("ambiguous commit finds success", func(t *testing.T) {
		stable := serviceRecord(input, IngestionStateSucceeded)
		stable.Receipt = json.RawMessage(`{"stable":true}`)
		repo := &serviceClaimRepo{claim: &IngestionClaimResult{Outcome: IngestionClaimed, Record: record, LeaseToken: "lease"}, lookup: &IngestionClaimResult{Outcome: IngestionReplay, Record: stable}}
		result := newIngestionService(repo, &serviceAggregateFactory{tx: &serviceAggregateTx{commitErr: errors.New("connection lost")}}, 5).Ingest(context.Background(), input)
		if result.Outcome != IngestionServiceRecoveredUnknown || repo.markCalls != 0 || repo.lookupCalls != 1 {
			t.Fatalf("result=%+v", result)
		}
	})
	t.Run("unconfirmed lookup", func(t *testing.T) {
		repo := &serviceClaimRepo{claim: &IngestionClaimResult{Outcome: IngestionClaimed, Record: record, LeaseToken: "lease"}, lookupErr: errors.New("down")}
		result := newIngestionService(repo, &serviceAggregateFactory{tx: &serviceAggregateTx{commitErr: errors.New("connection lost")}}, 5).Ingest(context.Background(), input)
		if result.Outcome != IngestionServiceOutcomeUnknown || result.RetryAfterSeconds != 5 || repo.markCalls != 0 {
			t.Fatalf("result=%+v", result)
		}
	})
	t.Run("panic rolls back without unsafe evidence", func(t *testing.T) {
		repo := &serviceClaimRepo{claim: &IngestionClaimResult{Outcome: IngestionClaimed, Record: record, LeaseToken: "lease"}}
		tx := &serviceAggregateTx{panicCreate: true}
		result := newIngestionService(repo, &serviceAggregateFactory{tx: tx}, 5).Ingest(context.Background(), input)
		if result.Outcome != IngestionServiceInternalError || tx.rollbacks != 1 || repo.markCalls != 0 {
			t.Fatalf("result=%+v", result)
		}
	})
	t.Run("panic with unconfirmed rollback resolves authoritatively", func(t *testing.T) {
		repo := &serviceClaimRepo{claim: &IngestionClaimResult{Outcome: IngestionClaimed, Record: record, LeaseToken: "lease"}, lookupErr: errors.New("down")}
		tx := &serviceAggregateTx{panicCreate: true, rollbackErr: sql.ErrTxDone}
		result := newIngestionService(repo, &serviceAggregateFactory{tx: tx}, 5).Ingest(context.Background(), input)
		if result.Outcome != IngestionServiceOutcomeUnknown || repo.markCalls != 0 || repo.lookupCalls != 1 {
			t.Fatalf("result=%+v", result)
		}
	})
}

func TestIngestionServiceCancellationBeforeTransactionDoesNotGuessFailure(t *testing.T) {
	input := validServiceSubmission(t, false)
	record := serviceRecord(input, IngestionStateProcessing)
	repo := &serviceClaimRepo{claim: &IngestionClaimResult{Outcome: IngestionClaimed, Record: record, LeaseToken: "lease"}}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	result := newIngestionService(repo, &serviceAggregateFactory{err: context.Canceled}, 5).Ingest(ctx, input)
	if result.Outcome != IngestionServiceInternalError || repo.markCalls != 0 {
		t.Fatalf("result=%+v mark calls=%d cleanup error=%v", result, repo.markCalls, repo.markCtxErr)
	}
}

func TestLoadIngestionRecoveryConfig(t *testing.T) {
	old, present := os.LookupEnv("PALETTE_INGESTION_LEASE_SECONDS")
	t.Cleanup(func() {
		if present {
			_ = os.Setenv("PALETTE_INGESTION_LEASE_SECONDS", old)
		} else {
			_ = os.Unsetenv("PALETTE_INGESTION_LEASE_SECONDS")
		}
	})
	for _, tc := range []struct {
		raw     string
		want    int
		invalid bool
	}{{"", 300, false}, {"30", 30, false}, {"1800", 1800, false}, {"29", 0, true}, {"1801", 0, true}, {"seconds", 0, true}} {
		if tc.raw == "" {
			_ = os.Unsetenv("PALETTE_INGESTION_LEASE_SECONDS")
		} else {
			_ = os.Setenv("PALETTE_INGESTION_LEASE_SECONDS", tc.raw)
		}
		cfg, err := config.LoadIngestionRecoveryConfig()
		if (err != nil) != tc.invalid || (!tc.invalid && (cfg.LeaseSeconds != tc.want || cfg.AutomaticAttemptLimit != 3 || cfg.RetryBackoffSeconds != 5)) {
			t.Fatalf("raw=%q cfg=%+v err=%v", tc.raw, cfg, err)
		}
	}
}

func TestCanonicalJSONHashMatchesNodeJCSContract(t *testing.T) {
	hash, err := canonicalJSONHash(json.RawMessage(`{"b":[2,1],"a":{"z":"<x>","n":0}}`))
	if err != nil {
		t.Fatal(err)
	}
	if hash != "6c3d48b1f8b2bd4ffadc9a0aadfca47ac52f968cb522d34abb2ca20bea1c26c4" {
		t.Fatalf("hash=%s", hash)
	}
}

func TestNormalizedIngestionContentPreservesPreviewSeedContract(t *testing.T) {
	zero := 0
	ordinary := 42
	tests := []struct {
		name          string
		strategy      string
		seed          *int
		wantSeedBytes string
	}{
		{name: "stable-id-omits-seed-value", strategy: PreviewCaseSeedStrategyStableID},
		{name: "fixed-preserves-seed-value", strategy: PreviewCaseSeedStrategyFixed, seed: &ordinary, wantSeedBytes: `"seed_value":42`},
		{name: "fixed-preserves-zero", strategy: PreviewCaseSeedStrategyFixed, seed: &zero, wantSeedBytes: `"seed_value":0`},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			input := serviceSubmissionWithSeed(t, tc.strategy, tc.seed)
			var request canonicalIngestionRequest
			if err := json.Unmarshal(input.CanonicalRequest, &request); err != nil {
				t.Fatal(err)
			}
			raw, err := json.Marshal(normalizedIngestionContent(request, serviceContentColors()))
			if err != nil {
				t.Fatal(err)
			}
			canonical, err := figjcs.Canonicalize(raw)
			if err != nil {
				t.Fatal(err)
			}
			text := string(canonical)
			if tc.seed == nil && strings.Contains(text, `"seed_value"`) {
				t.Fatalf("stable_id normalized bytes contain seed_value: %s", text)
			}
			if tc.seed != nil && !strings.Contains(text, tc.wantSeedBytes) {
				t.Fatalf("fixed normalized bytes lost %s: %s", tc.wantSeedBytes, text)
			}
			for _, unchanged := range []string{`"template_id":"bar_error_v1"`, `"orientation":"vertical"`, `"sample_size":24`, `"color_id":"color-1"`} {
				if !strings.Contains(text, unchanged) {
					t.Fatalf("normalized bytes lost unrelated preview field %s: %s", unchanged, text)
				}
			}
			if _, err := prepareIngestion(input); err != nil {
				t.Fatalf("valid seed contract rejected: %v", err)
			}
		})
	}
}

func TestTypedPreviewNormalizationMatchesSharedNodeGoSeedFixtures(t *testing.T) {
	fixtureBytes, err := os.ReadFile("../../../contracts/palette-ingestion/v1/jcs-cross-language-fixtures.json")
	if err != nil {
		t.Fatal(err)
	}
	var corpus struct {
		Valid []struct {
			Name      string `json:"name"`
			Raw       string `json:"raw"`
			Canonical string `json:"canonical"`
			Hash      string `json:"hash"`
		} `json:"valid"`
	}
	if err := json.Unmarshal(fixtureBytes, &corpus); err != nil {
		t.Fatal(err)
	}
	checked := 0
	for _, fixture := range corpus.Valid {
		if !strings.HasPrefix(fixture.Name, "normalized-preview-") {
			continue
		}
		var normalized struct {
			SchemaVersion int                        `json:"schema_version"`
			Colors        []interface{}              `json:"colors"`
			Palette       ingestionPaletteInput      `json:"palette"`
			PreviewCases  []CreatePreviewCaseRequest `json:"preview_cases"`
		}
		if err := json.Unmarshal([]byte(fixture.Raw), &normalized); err != nil {
			t.Fatalf("%s decode: %v", fixture.Name, err)
		}
		request := canonicalIngestionRequest{
			IngestionMetadata: ingestionRequestMetadata{SchemaVersion: normalized.SchemaVersion},
			Palette:           normalized.Palette,
			PreviewCases:      normalized.PreviewCases,
		}
		rebuilt, err := json.Marshal(normalizedIngestionContent(request, normalized.Colors))
		if err != nil {
			t.Fatal(err)
		}
		canonical, hash, err := figjcs.Hash(rebuilt)
		if err != nil {
			t.Fatal(err)
		}
		if string(canonical) != fixture.Canonical || hash != fixture.Hash {
			t.Fatalf("%s typed Go normalization drifted from shared Node/Go fixture: canonical=%s hash=%s", fixture.Name, canonical, hash)
		}
		checked++
	}
	if checked != 3 {
		t.Fatalf("checked %d seed fixtures, want 3", checked)
	}
}

func TestPrepareIngestionRejectsExplicitNullPreviewSeedValue(t *testing.T) {
	input := serviceSubmissionWithSeed(t, PreviewCaseSeedStrategyStableID, nil)
	var request map[string]interface{}
	if err := json.Unmarshal(input.CanonicalRequest, &request); err != nil {
		t.Fatal(err)
	}
	previews := request["preview_cases"].([]interface{})
	previews[0].(map[string]interface{})["seed_value"] = nil
	raw, err := json.Marshal(request)
	if err != nil {
		t.Fatal(err)
	}
	input.CanonicalRequest = raw
	if _, err := prepareIngestion(input); err == nil || !strings.Contains(err.Error(), "seed_value must not be null") {
		t.Fatalf("explicit null was not rejected by the canonical request boundary: %v", err)
	}
}

func TestIngestionServiceRejectsStableIDSeedValueBeforeClaim(t *testing.T) {
	values := []int{42, 0}
	for _, value := range values {
		t.Run(fmt.Sprintf("seed-%d", value), func(t *testing.T) {
			input := serviceSubmissionWithSeed(t, PreviewCaseSeedStrategyStableID, &value)
			if _, err := prepareIngestion(input); err == nil || !strings.Contains(err.Error(), "seed_value must be omitted for stable_id") {
				t.Fatalf("prepareIngestion accepted stable_id seed %d: %v", value, err)
			}

			repo := &serviceClaimRepo{}
			factory := &serviceAggregateFactory{}
			result := newIngestionService(repo, factory, 5).Ingest(context.Background(), input)
			if result.Code != IngestionServiceValidationFailed || result.Outcome != IngestionServiceValidationFailed {
				t.Fatalf("seed %d result=%+v", value, result)
			}
			if repo.claimCalls != 0 || factory.calls != 0 {
				t.Fatalf("seed %d crossed claim boundary: claim calls=%d aggregate calls=%d", value, repo.claimCalls, factory.calls)
			}
		})
	}
}

func validServiceSubmission(t *testing.T, preview bool) CandidateIngestionSubmission {
	t.Helper()
	request := canonicalIngestionRequest{
		IngestionMetadata: ingestionRequestMetadata{ProposalID: "batch/service-proposal", SourceKey: "service-proposal", SourceHash: repeat("a", 64), PipelineVersion: IngestionPipelineVersion, SchemaVersion: 1, ValidationIssues: json.RawMessage(`[]`), DuplicateEvidence: json.RawMessage(`[]`)},
		Palette:           ingestionPaletteInput{Name: "Service Palette", Type: "categorical", Colors: []ingestionPaletteColor{{ID: "color-1", Hex: "#112233", RGB: [3]int{17, 34, 51}, Order: 0}, {ID: "color-2", Hex: "#445566", RGB: [3]int{68, 85, 102}, Order: 1}, {ID: "color-3", Hex: "#778899", RGB: [3]int{119, 136, 153}, Order: 2}}, ColorCount: 3, Disciplines: []string{"general"}, UseCases: []string{"publication"}, AvoidCases: []string{}, Tags: []string{"clean"}, ChartApplicability: []ChartTypeApplicability{{ChartType: ChartTypeBarError, Suitability: ChartSuitabilityBestFit, Source: ChartApplicabilitySourceCurated}}},
		PreviewCases:      []CreatePreviewCaseRequest{},
	}
	if preview {
		request.PreviewCases = []CreatePreviewCaseRequest{{ChartType: ChartTypeBarError, TemplateID: "bar_error_v1", TemplateVersion: 1, SchemaVersion: 1, ColorRoles: validBarErrorColorRolesJSON(), PreviewConfig: validBarErrorPreviewConfigJSON(), SeedStrategy: PreviewCaseSeedStrategyStableID}}
	}
	hash, err := canonicalValueHash(normalizedIngestionContent(request, serviceContentColors()))
	if err != nil {
		t.Fatal(err)
	}
	request.IngestionMetadata.NormalizedContentHash = hash
	raw, err := json.Marshal(request)
	if err != nil {
		t.Fatal(err)
	}
	return CandidateIngestionSubmission{CanonicalRequest: raw, IdempotencyKey: "123e4567-e89b-42d3-a456-426614174099", ActorUserID: "11111111-1111-4111-8111-111111111111", ValidationIssues: json.RawMessage(`[]`), DuplicateEvidence: json.RawMessage(`[]`)}
}

func serviceSubmissionWithSeed(t *testing.T, strategy string, seed *int) CandidateIngestionSubmission {
	t.Helper()
	input := validServiceSubmission(t, true)
	var request canonicalIngestionRequest
	if err := json.Unmarshal(input.CanonicalRequest, &request); err != nil {
		t.Fatal(err)
	}
	request.PreviewCases[0].SeedStrategy = strategy
	request.PreviewCases[0].SeedValue = seed
	hash, err := canonicalValueHash(normalizedIngestionContent(request, serviceContentColors()))
	if err != nil {
		t.Fatal(err)
	}
	request.IngestionMetadata.NormalizedContentHash = hash
	raw, err := json.Marshal(request)
	if err != nil {
		t.Fatal(err)
	}
	input.CanonicalRequest = raw
	return input
}

func serviceContentColors() []interface{} {
	return []interface{}{
		map[string]interface{}{"provisional_id": "color-1", "hex": "#112233", "order": 0},
		map[string]interface{}{"provisional_id": "color-2", "hex": "#445566", "order": 1},
		map[string]interface{}{"provisional_id": "color-3", "hex": "#778899", "order": 2},
	}
}

func serviceRecord(input CandidateIngestionSubmission, state string) *IngestionRecord {
	var request canonicalIngestionRequest
	_ = json.Unmarshal(input.CanonicalRequest, &request)
	fingerprint, _ := canonicalJSONHash(input.CanonicalRequest)
	lease := "secret-lease"
	expiry := time.Now().Add(time.Minute)
	return &IngestionRecord{ID: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", ProposalID: request.IngestionMetadata.ProposalID, NormalizedContentHash: request.IngestionMetadata.NormalizedContentHash, Operation: IngestionOperationPaletteCandidate, IdempotencyKey: input.IdempotencyKey, RequestFingerprint: fingerprint, ProcessingState: state, AttemptCount: 1, LeaseToken: &lease, LeaseExpiresAt: &expiry, ActorUserID: input.ActorUserID}
}

var _ = sql.ErrTxDone
