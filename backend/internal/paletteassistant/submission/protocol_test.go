package submission

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	pa "github.com/qiqi/figcolor/backend/internal/paletteassistant"
)

func TestReceiptIssueVerifyAndBoundaries(t *testing.T) {
	secret := bytes.Repeat([]byte("s"), 32)
	now := time.Unix(1786195200, 0).UTC()
	p := pa.ValidationReceiptPayload{Version: 1, DraftDigest: strings.Repeat("a", 64), ActorUserID: "actor", RegistryFingerprint: pa.PreviewRegistryFingerprint, FindingSetDigest: strings.Repeat("b", 64), DuplicatePolicyVersion: 1, SimilarityPolicyVersion: 1, IssuedAt: now.Unix(), ExpiresAt: now.Add(pa.ReceiptLifetime).Unix()}
	token, err := issueReceipt(p, secret)
	if err != nil {
		t.Fatal(err)
	}
	got, err := verifyReceipt(token, secret, now.Add(pa.ReceiptLifetime))
	if err != nil || !reflect.DeepEqual(got, p) {
		t.Fatalf("got=%+v err=%v", got, err)
	}
	cases := []struct {
		name   string
		token  string
		secret []byte
		at     time.Time
		want   error
	}{{"short secret", token, []byte("x"), now, errReceiptInvalid}, {"wrong secret", token, bytes.Repeat([]byte("x"), 32), now, errReceiptInvalid}, {"malformed", "x", secret, now, errReceiptInvalid}, {"expired", token, secret, now.Add(pa.ReceiptLifetime + time.Second), errReceiptExpired}, {"future", token, secret, now.Add(-time.Second), errReceiptExpired}}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := verifyReceipt(tc.token, tc.secret, tc.at)
			if !errors.Is(err, tc.want) {
				t.Fatalf("err=%v want=%v", err, tc.want)
			}
		})
	}
}

func TestCanonicalDigestsAndAcknowledgmentOrder(t *testing.T) {
	d := digestDraft()
	a, err := draftDigest(d)
	if err != nil {
		t.Fatal(err)
	}
	d.PreviewCases[0].ColorRoles = json.RawMessage(`{"color_id":"11111111-1111-4111-8111-111111111111","source":"palette"}`)
	b, _ := draftDigest(d)
	if a != b {
		t.Fatal("semantic RawMessage property order changed digest")
	}
	d.Name = "other"
	c, _ := draftDigest(d)
	if c == a {
		t.Fatal("Draft mutation did not change digest")
	}
	one, _ := createIntentDigest("actor", a, 1, []string{"b", "a"}, strings.Repeat("f", 64))
	two, _ := createIntentDigest("actor", a, 1, []string{"a", "b"}, strings.Repeat("f", 64))
	if one != two {
		t.Fatal("acknowledgment order changed intent")
	}
	three, _ := createIntentDigest("other", a, 1, []string{"a", "b"}, strings.Repeat("f", 64))
	if three == one {
		t.Fatal("actor did not bind intent")
	}
}

func TestStrictDecoderRejectsTransportMatrix(t *testing.T) {
	gin.SetMode(gin.TestMode)
	cases := []struct{ name, body, content string }{{"empty", "", "application/json"}, {"malformed", "{", "application/json"}, {"trailing", `{"draft":{},"confirmed_revision":1} {}`, "application/json"}, {"duplicate root", `{"draft":{},"draft":{},"confirmed_revision":1}`, "application/json"}, {"duplicate nested", `{"draft":{"name":"a","name":"b"},"confirmed_revision":1}`, "application/json"}, {"unknown", `{"draft":{},"confirmed_revision":1,"owner":"x"}`, "application/json"}, {"null", `{"draft":null,"confirmed_revision":1}`, "application/json"}, {"wrong type", `{"draft":{},"confirmed_revision":"1"}`, "application/json"}, {"media", `{}`, "text/plain"}}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(tc.body))
			r.Header.Set("Content-Type", tc.content)
			c, _ := gin.CreateTestContext(httptest.NewRecorder())
			c.Request = r
			var req pa.ValidateRequest
			if p := decodeStrict(c, &req, []string{"draft", "confirmed_revision"}); p == nil {
				t.Fatal("accepted invalid transport")
			}
		})
	}
}

func TestStrictDecoderClassifiesSyntaxFailures(t *testing.T) {
	cases := []struct{ name, body, code, path string }{{"duplicate root", `{"draft":{},"draft":{},"confirmed_revision":1}`, "DUPLICATE_JSON_MEMBER", "/draft"}, {"duplicate deep", `{"draft":{"colors":[{"id":"a","id":"b"}]},"confirmed_revision":1}`, "DUPLICATE_JSON_MEMBER", "/draft/colors/0/id"}, {"malformed", `{"draft":`, "MALFORMED_JSON", "/draft"}, {"trailing object", `{"draft":{},"confirmed_revision":1} {}`, "TRAILING_JSON_VALUE", "/"}, {"trailing primitive", `{"draft":{},"confirmed_revision":1} 1`, "TRAILING_JSON_VALUE", "/"}}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			p := decodeValidateBody(tc.body)
			if p == nil || len(p.Issues) != 1 || p.Issues[0].Code != tc.code || p.Issues[0].Path != tc.path {
				t.Fatalf("problem=%+v", p)
			}
		})
	}
}

func TestStrictDecoderRejectsNestedNullsAndAllowsFrozenNullableJSON(t *testing.T) {
	base := validDraft()
	request := pa.ValidateRequest{Draft: base, ConfirmedRevision: 1}
	raw, _ := json.Marshal(request)
	var root map[string]any
	if json.Unmarshal(raw, &root) != nil {
		t.Fatal("fixture")
	}
	mutations := []struct {
		name, path string
		mutate     func(map[string]any)
	}{{"accessibility bool", "/draft/accessibility/colorblind_safe", func(r map[string]any) { draftMap(r)["accessibility"].(map[string]any)["colorblind_safe"] = nil }}, {"color id", "/draft/colors/0/id", func(r map[string]any) { draftMap(r)["colors"].([]any)[0].(map[string]any)["id"] = nil }}, {"color order", "/draft/colors/0/order", func(r map[string]any) { draftMap(r)["colors"].([]any)[0].(map[string]any)["order"] = nil }}, {"applicability", "/draft/chart_applicability/0/chart_type", func(r map[string]any) {
		draftMap(r)["chart_applicability"].([]any)[0].(map[string]any)["chart_type"] = nil
	}}, {"metadata element", "/draft/disciplines/0", func(r map[string]any) { draftMap(r)["disciplines"].([]any)[0] = nil }}, {"provenance field", "/draft/provenance/0/producer", func(r map[string]any) { draftMap(r)["provenance"].([]any)[0].(map[string]any)["producer"] = nil }}, {"reason code", "/draft/provenance/0/reason_codes/0", func(r map[string]any) {
		draftMap(r)["provenance"].([]any)[0].(map[string]any)["reason_codes"].([]any)[0] = nil
	}}, {"preview version", "/draft/preview_cases/0/template_version", func(r map[string]any) {
		draftMap(r)["preview_cases"].([]any)[0].(map[string]any)["template_version"] = nil
	}}, {"confirmation", "/confirmed_revision", func(r map[string]any) { r["confirmed_revision"] = nil }}}
	for _, tc := range mutations {
		t.Run(tc.name, func(t *testing.T) {
			var clone map[string]any
			encoded, _ := json.Marshal(root)
			json.Unmarshal(encoded, &clone)
			tc.mutate(clone)
			body, _ := json.Marshal(clone)
			p := decodeValidateBody(string(body))
			if p == nil || len(p.Issues) != 1 || p.Issues[0].Code != "NULL_NOT_ALLOWED" && p.Issues[0].Code != "REQUIRED_FIELD" || p.Issues[0].Path != tc.path {
				t.Fatalf("problem=%+v", p)
			}
		})
	}
	for _, test := range []struct {
		name   string
		mutate func(map[string]any)
	}{{"stable omitted", func(r map[string]any) {
		preview := draftMap(r)["preview_cases"].([]any)[0].(map[string]any)
		preview["seed_strategy"] = "stable_id"
		delete(preview, "seed_value")
	}}, {"stable explicit null", func(r map[string]any) {
		preview := draftMap(r)["preview_cases"].([]any)[0].(map[string]any)
		preview["seed_strategy"] = "stable_id"
		preview["seed_value"] = nil
	}}, {"suggested clear", func(r map[string]any) { draftMap(r)["provenance"].([]any)[0].(map[string]any)["suggested_value"] = nil }}} {
		t.Run(test.name, func(t *testing.T) {
			var clone map[string]any
			encoded, _ := json.Marshal(root)
			json.Unmarshal(encoded, &clone)
			test.mutate(clone)
			body, _ := json.Marshal(clone)
			if p := decodeValidateBody(string(body)); p != nil {
				t.Fatalf("problem=%+v", p)
			}
		})
	}
}

func decodeValidateBody(body string) *pa.Problem {
	r := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = r
	var req pa.ValidateRequest
	return decodeStrict(c, &req, []string{"draft", "confirmed_revision"})
}
func draftMap(root map[string]any) map[string]any { return root["draft"].(map[string]any) }

func TestDraftColorMappingOnlyRewritesPaletteReferences(t *testing.T) {
	ids := map[string]string{"draft": "persisted"}
	raw, err := mapReferences(json.RawMessage(`{"fill":{"source":"palette","color_id":"draft","hex":"#000000","index":9},"theme":{"source":"theme","token":"foreground"}}`), ids)
	if err != nil {
		t.Fatal(err)
	}
	if string(raw) != `{"fill":{"color_id":"persisted","hex":"#000000","index":9,"source":"palette"},"theme":{"source":"theme","token":"foreground"}}` {
		t.Fatalf("mapped=%s", raw)
	}
	if _, err := mapReferences(json.RawMessage(`{"source":"palette","color_id":"unknown"}`), ids); err == nil {
		t.Fatal("unknown reference used fallback")
	}
}

type countingRepo struct{ calls int }

func (r *countingRepo) Snapshot(context.Context) ([]Comparison, error) { r.calls++; return nil, nil }
func (r *countingRepo) Replay(context.Context, string, string, string) (*pa.CandidateReceipt, Outcome, error) {
	return nil, "", nil
}
func (r *countingRepo) Create(context.Context, string, string, string, string, string, pa.AssistantDraft, []pa.ProtocolFinding) (*pa.CandidateReceipt, Outcome, error) {
	r.calls++
	return nil, "", nil
}
func TestInvalidDraftDoesNotQueryRepository(t *testing.T) {
	repo := &countingRepo{}
	service, _ := NewService(repo, bytes.Repeat([]byte("s"), 32), time.Now)
	result := service.Validate(context.Background(), "actor", pa.ValidateRequest{})
	if result.Problem == nil || result.Problem.Code != pa.ErrInvalidDraft || repo.calls != 0 {
		t.Fatalf("result=%+v calls=%d", result, repo.calls)
	}
}

func TestPreviewRawMessageNullUsesGeneratedSchemaValidation(t *testing.T) {
	repo := &countingRepo{}
	service, _ := NewService(repo, bytes.Repeat([]byte("s"), 32), time.Now)
	draft := validDraft()
	draft.PreviewCases[0].ColorRoles = json.RawMessage(`{"groups":[{"key":null,"label":"A","fill":{"source":"palette","color_id":"11111111-1111-4111-8111-111111111111"}}],"elements":{"axis":{"source":"theme","token":"foreground"},"grid":{"source":"theme","token":"grid"},"text":{"source":"theme","token":"foreground"},"error_bar":{"source":"theme","token":"foreground"},"background":{"source":"theme","token":"background"}}}`)
	raw, _ := json.Marshal(pa.ValidateRequest{Draft: draft, ConfirmedRevision: 1})
	if p := decodeValidateBody(string(raw)); p != nil {
		t.Fatalf("transport duplicated Preview schema: %+v", p)
	}
	result := service.Validate(context.Background(), "actor", pa.ValidateRequest{Draft: draft, ConfirmedRevision: 1})
	if result.Problem == nil || result.Problem.Code != pa.ErrInvalidDraft || repo.calls != 0 {
		t.Fatalf("result=%+v calls=%d", result, repo.calls)
	}
	found := false
	for _, issue := range result.Problem.Issues {
		if issue.Path == "/preview_cases/0/color_roles/groups/0/key" {
			found = true
		}
	}
	if !found {
		t.Fatalf("missing generated-schema pointer: %+v", result.Problem.Issues)
	}
}

type serviceRepo struct {
	snapshot    []Comparison
	createCalls int
}

func (r *serviceRepo) Snapshot(context.Context) ([]Comparison, error) {
	return append([]Comparison(nil), r.snapshot...), nil
}
func (r *serviceRepo) Replay(context.Context, string, string, string) (*pa.CandidateReceipt, Outcome, error) {
	return nil, "", nil
}
func (r *serviceRepo) Create(_ context.Context, actor, key, intent, draftDigest, findingDigest string, draft pa.AssistantDraft, findings []pa.ProtocolFinding) (*pa.CandidateReceipt, Outcome, error) {
	r.createCalls++
	return &pa.CandidateReceipt{ContractVersion: pa.ContractVersion, ReceiptID: "receipt", CandidateID: "candidate", Status: "candidate", PreviewCaseIDs: []string{}, AdminReviewPath: "/admin/palettes/candidate", CreatedAt: time.Unix(1, 0)}, OutcomeCreated, nil
}

func TestValidateCreateReceiptFindingAndAcknowledgmentBinding(t *testing.T) {
	now := time.Unix(1786195200, 0).UTC()
	secret := bytes.Repeat([]byte("s"), 32)
	repo := &serviceRepo{}
	service, _ := NewService(repo, secret, func() time.Time { return now })
	draft := validDraft()
	validated := service.Validate(context.Background(), "actor", pa.ValidateRequest{Draft: draft, ConfirmedRevision: 1})
	if validated.Response == nil || validated.Response.ValidationReceipt == "" || len(validated.Response.Warnings) != 0 {
		t.Fatalf("validate=%+v", validated)
	}
	created := service.Create(context.Background(), "actor", "11111111-1111-4111-8111-111111111111", pa.CreateCandidateRequest{Draft: draft, ConfirmedRevision: 1, ValidationReceipt: validated.Response.ValidationReceipt, WarningAcknowledgments: []string{}})
	if created.Receipt == nil || repo.createCalls != 1 {
		t.Fatalf("create=%+v calls=%d", created, repo.createCalls)
	}
	crossActor := service.Create(context.Background(), "other", "22222222-2222-4222-8222-222222222222", pa.CreateCandidateRequest{Draft: draft, ConfirmedRevision: 1, ValidationReceipt: validated.Response.ValidationReceipt, WarningAcknowledgments: []string{}})
	if crossActor.Problem == nil || crossActor.Problem.Code != pa.ErrValidationActorMismatch {
		t.Fatalf("cross actor=%+v", crossActor)
	}
	repo.snapshot = []Comparison{{ID: "similar", Status: "published", HEX: []string{"#112234", "#AABBCC"}}}
	warned := service.Validate(context.Background(), "actor", pa.ValidateRequest{Draft: draft, ConfirmedRevision: 1})
	if warned.Response == nil || len(warned.Response.Warnings) != 1 {
		t.Fatalf("warnings=%+v", warned)
	}
	missing := service.Create(context.Background(), "actor", "33333333-3333-4333-8333-333333333333", pa.CreateCandidateRequest{Draft: draft, ConfirmedRevision: 1, ValidationReceipt: warned.Response.ValidationReceipt, WarningAcknowledgments: []string{}})
	if missing.Problem == nil || missing.Problem.Code != pa.ErrWarningAcknowledgmentRequired {
		t.Fatalf("missing ack=%+v", missing)
	}
	accepted := service.Create(context.Background(), "actor", "44444444-4444-4444-8444-444444444444", pa.CreateCandidateRequest{Draft: draft, ConfirmedRevision: 1, ValidationReceipt: warned.Response.ValidationReceipt, WarningAcknowledgments: []string{warned.Response.Warnings[0].ID}})
	if accepted.Receipt == nil {
		t.Fatalf("accepted=%+v", accepted)
	}
	repo.snapshot = []Comparison{{ID: "exact", Status: "candidate", HEX: []string{"#112233", "#AABBCC"}}}
	blocked := service.Validate(context.Background(), "actor", pa.ValidateRequest{Draft: draft, ConfirmedRevision: 1})
	if blocked.Response == nil || len(blocked.Response.Duplicates) != 1 || len(blocked.Response.Similarities) != 0 {
		t.Fatalf("exact validate=%+v", blocked)
	}
	createBlocked := service.Create(context.Background(), "actor", "55555555-5555-4555-8555-555555555555", pa.CreateCandidateRequest{Draft: draft, ConfirmedRevision: 1, ValidationReceipt: blocked.Response.ValidationReceipt, WarningAcknowledgments: []string{}})
	if createBlocked.Problem == nil || createBlocked.Problem.Code != pa.ErrExactDuplicateCandidate {
		t.Fatalf("exact create=%+v", createBlocked)
	}
}

func validDraft() pa.AssistantDraft {
	seed := 0
	one := "11111111-1111-4111-8111-111111111111"
	two := "22222222-2222-4222-8222-222222222222"
	roles := json.RawMessage(`{"groups":[{"key":"a","label":"A","fill":{"source":"palette","color_id":"11111111-1111-4111-8111-111111111111"}}],"elements":{"axis":{"source":"theme","token":"foreground"},"grid":{"source":"theme","token":"grid"},"text":{"source":"theme","token":"foreground"},"error_bar":{"source":"theme","token":"foreground"},"background":{"source":"theme","token":"background"}}}`)
	return pa.AssistantDraft{ContractVersion: pa.ContractVersion, Revision: 1, Name: "Palette", Type: "categorical", Colors: []pa.DraftColor{{ID: one, Hex: "#112233", Order: 0, Source: pa.SourceAssistant, State: pa.StateAccepted}, {ID: two, Hex: "#AABBCC", Order: 1, Source: pa.SourceAdmin, State: pa.StateModified}}, ChartApplicability: []pa.DraftChartApplicability{{ChartType: "bar_error", Suitability: "best_fit"}}, Disciplines: []string{"general"}, UseCases: []string{"publication"}, AvoidCases: []string{}, Tags: []string{"clean"}, Accessibility: pa.DraftAccessibility{}, SourceType: pa.OnlineSourceType, SourceNote: "reviewed", PreviewCases: []pa.DraftPreviewCase{{ChartType: "bar_error", TemplateID: "bar_error_v1", TemplateVersion: 1, SchemaVersion: 1, ColorRoles: roles, PreviewConfig: json.RawMessage(`{"orientation":"vertical","sample_size":24,"error_type":"sem","data_pattern":"mixed"}`), SeedStrategy: "fixed", SeedValue: &seed}}, Provenance: []pa.SuggestionProvenance{{Path: "/name", Source: pa.SourceAssistant, State: pa.StateAccepted, Producer: "rules", AlgorithmVersion: "1", ReasonCodes: []string{"SUGGESTED"}, SuggestedValue: json.RawMessage(`"Palette"`)}}}
}

func digestDraft() pa.AssistantDraft {
	seed := 0
	return pa.AssistantDraft{ContractVersion: pa.ContractVersion, Revision: 1, Name: "A", Type: "categorical", Colors: []pa.DraftColor{{ID: "11111111-1111-4111-8111-111111111111", Hex: "#112233", Order: 0, Source: pa.SourceAssistant, State: pa.StateAccepted}}, ChartApplicability: []pa.DraftChartApplicability{}, Disciplines: []string{}, UseCases: []string{}, AvoidCases: []string{}, Tags: []string{}, Accessibility: pa.DraftAccessibility{}, SourceType: pa.OnlineSourceType, PreviewCases: []pa.DraftPreviewCase{{ChartType: "x", TemplateID: "x", TemplateVersion: 1, SchemaVersion: 1, ColorRoles: json.RawMessage(`{"source":"palette","color_id":"11111111-1111-4111-8111-111111111111"}`), PreviewConfig: json.RawMessage(`{}`), SeedStrategy: "fixed", SeedValue: &seed}}, Provenance: []pa.SuggestionProvenance{}}
}
