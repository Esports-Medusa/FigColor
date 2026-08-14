package paletteassistant

import (
	"encoding/json"
	"fmt"
	"os"
	"reflect"
	"sort"
	"strings"
	"testing"
	"time"

	figjcs "github.com/qiqi/figcolor/backend/internal/jcs"
)

func minimalDraft() AssistantDraft {
	return AssistantDraft{ContractVersion: ContractVersion, Revision: 1, Name: "A", Type: "categorical", Accessibility: DraftAccessibility{}, SourceType: OnlineSourceType}
}

func TestFrozenProtocolConstants(t *testing.T) {
	if AnalyzePath != "/api/admin/palette-assistant/analyze" || ValidatePath != "/api/admin/palette-assistant/validate" || CreateCandidatePath != "/api/admin/palette-assistant/candidates" || AnalyzeImageField != "image" {
		t.Fatal("endpoint or multipart contract drifted")
	}
	if SupportedImageFormats != [2]string{"png", "jpeg"} {
		t.Fatalf("image allowlist = %#v", SupportedImageFormats)
	}
	if MultipartBodyLimit != 8*1024*1024 || EncodedImageLimit != 6*1024*1024 || MaximumImageWidth != 4096 || MaximumImageHeight != 4096 || MaximumImagePixels != 8_000_000 || AnalysisTimeout != 5*time.Second || ReceiptLifetime != 15*time.Minute || PreviewJSONByteLimit != 32*1024 {
		t.Fatal("resource or lifetime contract drifted")
	}
	if OnlineSourceType != "figure_extracted" {
		t.Fatalf("new source type introduced: %q", OnlineSourceType)
	}
	if !RejectMissingRequiredFields || !RejectNullRequiredFields || !RejectUnknownFields || !RejectDuplicateJSONKeys {
		t.Fatal("strict inbound JSON requirements drifted")
	}
}

func TestSuggestionVocabulary(t *testing.T) {
	if got := []SuggestionSource{SourceAssistant, SourceAdmin}; !reflect.DeepEqual(got, []SuggestionSource{"assistant", "admin"}) {
		t.Fatal(got)
	}
	if got := []SuggestionState{StateUnconfirmed, StateAccepted, StateModified, StateCleared}; !reflect.DeepEqual(got, []SuggestionState{"unconfirmed", "accepted", "modified", "cleared"}) {
		t.Fatal(got)
	}
}

func TestMinimalDraftGoldenAndNonNullArrays(t *testing.T) {
	want := `{"contract_version":"palette-assistant.v1","revision":1,"name":"A","type":"categorical","colors":[],"chart_applicability":[],"disciplines":[],"use_cases":[],"avoid_cases":[],"tags":[],"accessibility":{"colorblind_safe":false,"print_friendly":false,"dark_background":false},"source_type":"figure_extracted","source_note":"","preview_cases":[],"provenance":[]}`
	assertJSONGolden(t, minimalDraft(), want)
}

func TestFullDraftPreviewGolden(t *testing.T) {
	draft := minimalDraft()
	draft.Colors = []DraftColor{{ID: "draft-color-1", Hex: "#112233", Label: "Data", Order: 0, Source: SourceAssistant, State: StateAccepted}}
	draft.PreviewCases = []DraftPreviewCase{{ChartType: "bar_error", TemplateID: "bar_error_v1", TemplateVersion: 1, SchemaVersion: 1, ColorRoles: json.RawMessage(`{"fill":{"source":"palette","color_id":"draft-color-1"}}`), PreviewConfig: json.RawMessage(`{"orientation":"vertical"}`), SeedStrategy: "fixed", SeedValue: intPtr(42)}}
	b := marshal(t, draft)
	want := `{"contract_version":"palette-assistant.v1","revision":1,"name":"A","type":"categorical","colors":[{"id":"draft-color-1","hex":"#112233","label":"Data","order":0,"source":"assistant","state":"accepted"}],"chart_applicability":[],"disciplines":[],"use_cases":[],"avoid_cases":[],"tags":[],"accessibility":{"colorblind_safe":false,"print_friendly":false,"dark_background":false},"source_type":"figure_extracted","source_note":"","preview_cases":[{"chart_type":"bar_error","template_id":"bar_error_v1","template_version":1,"schema_version":1,"color_roles":{"fill":{"source":"palette","color_id":"draft-color-1"}},"preview_config":{"orientation":"vertical"},"seed_strategy":"fixed","seed_value":42}],"provenance":[]}`
	if string(b) != want {
		t.Fatalf("full Draft JSON\n got: %s\nwant: %s", b, want)
	}
	assertTopLevelKeys(t, b, "accessibility", "avoid_cases", "chart_applicability", "colors", "contract_version", "disciplines", "name", "preview_cases", "provenance", "revision", "source_note", "source_type", "tags", "type", "use_cases")
	assertContainsNone(t, string(b), "warnings", "rgb", "formal_color_id", "owner_user_id", "status", "tasks", "user_suitability", "journal_style")
	if !strings.Contains(string(b), `"color_id":"draft-color-1"`) {
		t.Fatal("Draft Preview must reference Draft-local color ID")
	}
}

func TestResponseAndRequestSerialization(t *testing.T) {
	stamp := time.Date(2026, 8, 8, 12, 34, 56, 0, time.UTC)
	draftJSON := `{"contract_version":"palette-assistant.v1","revision":1,"name":"A","type":"categorical","colors":[],"chart_applicability":[],"disciplines":[],"use_cases":[],"avoid_cases":[],"tags":[],"accessibility":{"colorblind_safe":false,"print_friendly":false,"dark_background":false},"source_type":"figure_extracted","source_note":"","preview_cases":[],"provenance":[]}`
	cases := []struct {
		name    string
		value   any
		keys    []string
		omitted []string
		want    string
	}{
		{"analyze", AnalyzeResponse{ContractVersion: ContractVersion, Draft: minimalDraft()}, []string{"algorithm_version", "analysis_id", "color_suggestions", "contract_version", "draft", "image", "structural_color_suggestions", "warnings"}, []string{"filename", "path", "exif", "image_bytes"}, `{"contract_version":"palette-assistant.v1","analysis_id":"","image":{"format":"","encoded_bytes":0,"width":0,"height":0,"pixel_count":0,"has_transparency":false,"alpha_backdrop":"","sha256":""},"color_suggestions":[],"structural_color_suggestions":[],"draft":` + draftJSON + `,"warnings":[],"algorithm_version":""}`},
		{"validate", ValidateResponse{ContractVersion: ContractVersion, NormalizedDraft: minimalDraft(), ReceiptExpiresAt: stamp}, []string{"contract_version", "draft_digest", "duplicates", "normalized_draft", "receipt_expires_at", "registry_version", "similarities", "validated_revision", "validation_policy", "validation_receipt", "vocabulary_version", "warnings"}, nil, `{"contract_version":"palette-assistant.v1","normalized_draft":` + draftJSON + `,"validated_revision":0,"draft_digest":"","validation_policy":"","registry_version":"","vocabulary_version":"","warnings":[],"duplicates":[],"similarities":[],"validation_receipt":"","receipt_expires_at":"2026-08-08T12:34:56Z"}`},
		{"create", CreateCandidateRequest{Draft: minimalDraft()}, []string{"confirmed_revision", "draft", "validation_receipt", "warning_acknowledgments"}, []string{"proposal_id", "source_hash", "normalized_content_hash", "checkpoint", "ingestion_record"}, `{"draft":` + draftJSON + `,"confirmed_revision":0,"validation_receipt":"","warning_acknowledgments":[]}`},
		{"receipt", CandidateReceipt{ContractVersion: ContractVersion, CreatedAt: stamp}, []string{"admin_review_path", "candidate_id", "contract_version", "created_at", "preview_case_ids", "receipt_id", "replay", "status"}, []string{"publish", "reject"}, `{"contract_version":"palette-assistant.v1","receipt_id":"","candidate_id":"","status":"","preview_case_ids":[],"admin_review_path":"","created_at":"2026-08-08T12:34:56Z","replay":false}`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			b := marshal(t, tc.value)
			if string(b) != tc.want {
				t.Fatalf("%s JSON\n got: %s\nwant: %s", tc.name, b, tc.want)
			}
			assertTopLevelKeys(t, b, tc.keys...)
			assertContainsNone(t, string(b), tc.omitted...)
			assertNoNullArrays(t, b)
			if (tc.name == "validate" || tc.name == "receipt") && !strings.Contains(string(b), `"2026-08-08T12:34:56Z"`) {
				t.Fatal("RFC3339 UTC time missing")
			}
		})
	}
}

func TestProblemGoldenWithAndWithoutIssues(t *testing.T) {
	assertJSONGolden(t, Problem{Code: ErrInvalidDraft, Message: "Invalid.", Retryable: false}, `{"code":"INVALID_DRAFT","message":"Invalid.","retryable":false}`)
	assertJSONGolden(t, Problem{Code: ErrInvalidDraft, Message: "Invalid.", Issues: []FieldIssue{{Path: "/colors/0/hex", Code: "INVALID_HEX", Message: "Invalid."}}}, `{"code":"INVALID_DRAFT","message":"Invalid.","retryable":false,"issues":[{"path":"/colors/0/hex","code":"INVALID_HEX","message":"Invalid."}]}`)
}

func TestWarningIdentityAndServerOwnership(t *testing.T) {
	typ := reflect.TypeOf(WarningFinding{})
	assertJSONTags(t, typ, "id", "code", "path", "message", "policy", "palette_id", "params", "requires_acknowledgment")
	draftType := reflect.TypeOf(AssistantDraft{})
	for i := 0; i < draftType.NumField(); i++ {
		if jsonName(draftType.Field(i)) == "warnings" {
			t.Fatal("warnings must not be Draft-owned")
		}
	}
	requestType := reflect.TypeOf(CreateCandidateRequest{})
	field, _ := requestType.FieldByName("WarningAcknowledgments")
	if field.Type != reflect.TypeOf([]string{}) {
		t.Fatal("acknowledgments must be exact server finding IDs")
	}
}

func TestSuggestionEvidenceGolden(t *testing.T) {
	color := ColorSuggestion{ID: "suggestion-1", Hex: "#112233", PixelCount: 12, Fraction: 0.25, Producer: "deterministic_extractor", AlgorithmVersion: "v1", ReasonCodes: []string{"DOMINANT_NON_STRUCTURAL_COLOR"}, AmbiguityGroup: "group-1"}
	assertJSONGolden(t, color, `{"id":"suggestion-1","hex":"#112233","pixel_count":12,"fraction":0.25,"producer":"deterministic_extractor","algorithm_version":"v1","reason_codes":["DOMINANT_NON_STRUCTURAL_COLOR"],"ambiguity_group":"group-1"}`)
	provenance := SuggestionProvenance{Path: "/type", Source: SourceAssistant, State: StateUnconfirmed, Producer: "rule_engine", AlgorithmVersion: "rules-v1", ReasonCodes: []string{"AMBIGUOUS_PALETTE_TYPE"}, SuggestedValue: json.RawMessage(`"categorical"`), AmbiguityGroup: "type-choice-1"}
	assertJSONGolden(t, provenance, `{"path":"/type","source":"assistant","state":"unconfirmed","producer":"rule_engine","algorithm_version":"rules-v1","reason_codes":["AMBIGUOUS_PALETTE_TYPE"],"suggested_value":"categorical","ambiguity_group":"type-choice-1"}`)
}

func TestFindingGoldenAndParamsEnforcement(t *testing.T) {
	warning := WarningFinding{ID: strings.Repeat("a", 64), Code: "NEAR_DUPLICATE", Path: "/colors", Message: "Review.", Policy: "similarity-v1", PaletteID: "palette-1", Params: json.RawMessage(`{"score":0.5}`), RequiresAcknowledgment: true}
	assertJSONGolden(t, warning, `{"id":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","code":"NEAR_DUPLICATE","path":"/colors","message":"Review.","policy":"similarity-v1","palette_id":"palette-1","params":{"score":0.5},"requires_acknowledgment":true}`)
	similarity := SimilarityFinding{ID: strings.Repeat("b", 64), PaletteID: "palette-1", Score: 0.5, Policy: "similarity-v1", Params: json.RawMessage(`{"mean_distance":0.02,"maximum_pair_distance":0.04}`)}
	assertJSONGolden(t, similarity, `{"id":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","palette_id":"palette-1","score":0.5,"policy":"similarity-v1","params":{"mean_distance":0.02,"maximum_pair_distance":0.04}}`)
	for _, params := range []json.RawMessage{nil, json.RawMessage(`null`), json.RawMessage(`{}`), json.RawMessage(`[]`), json.RawMessage(`{`), json.RawMessage(`{"x":"` + strings.Repeat("x", PreviewJSONByteLimit) + `"}`)} {
		if _, err := json.Marshal(WarningFinding{Params: params}); err == nil {
			t.Fatalf("WarningFinding accepted invalid params of %d bytes: %.20q", len(params), params)
		}
		if _, err := json.Marshal(SimilarityFinding{Params: params}); err == nil {
			t.Fatalf("SimilarityFinding accepted invalid params of %d bytes", len(params))
		}
	}
}

func TestSubmissionProtocolKnownVectorsAndIdentityBoundaries(t *testing.T) {
	draft := minimalDraft()
	draft.Colors = []DraftColor{{ID: "11111111-1111-4111-8111-111111111111", Hex: "#112233", Order: 0}, {ID: "22222222-2222-4222-8222-222222222222", Hex: "#AABBCC", Order: 1}}
	exact, err := exactFingerprint(draft)
	if err != nil {
		t.Fatal(err)
	}
	if exact != "5467606b7a5203a8f5cb2fce27bb0c3b0c496c37c61cbd1db8fab3c48016d6a5" {
		t.Fatalf("exact vector = %s", exact)
	}
	reordered := draft
	reordered.Colors = []DraftColor{draft.Colors[1], draft.Colors[0]}
	reordered.Colors[0].Order, reordered.Colors[1].Order = 0, 1
	other, _ := exactFingerprint(reordered)
	if other == exact {
		t.Fatal("ordered HEX identity ignored order")
	}
	metadata := draft
	metadata.Name, metadata.Type, metadata.Tags = "Different", "mixed", []string{"clean"}
	if got, _ := exactFingerprint(metadata); got != exact {
		t.Fatal("non-identity metadata changed exact fingerprint")
	}

	digest, err := draftDigest(draft)
	if err != nil {
		t.Fatal(err)
	}
	if digest != "02199becb3750267b357672b0376300bce60613945d5e711409a3feb71686b02" {
		t.Fatalf("draft vector = %s", digest)
	}
	preview := draft
	preview.PreviewCases = []DraftPreviewCase{{ColorRoles: json.RawMessage(`{"z":1,"a":2}`), PreviewConfig: json.RawMessage(`{"b":true,"a":false}`)}}
	previewReordered := preview
	previewReordered.PreviewCases = []DraftPreviewCase{{ColorRoles: json.RawMessage(`{"a":2,"z":1}`), PreviewConfig: json.RawMessage(`{"a":false,"b":true}`)}}
	a, _ := draftDigest(preview)
	b, _ := draftDigest(previewReordered)
	if a != b {
		t.Fatal("RawMessage object member order changed Draft digest")
	}

	intent := createIntentProjection{ActorUserID: "actor-1", DraftDigest: digest, ConfirmedRevision: 1, AcknowledgedFindingIDs: []string{"b", "a"}, FindingSetDigest: strings.Repeat("c", 64), DuplicatePolicyVersion: 1, SimilarityPolicyVersion: 1, RegistryFingerprint: PreviewRegistryFingerprint}
	intentDigest, err := createIntentDigest(intent)
	if err != nil {
		t.Fatal(err)
	}
	if intentDigest != "659380ce64c22a731ba5db4fcbc6f51f9a6ae33fa491fce682fbd73655307c39" {
		t.Fatalf("intent vector = %s", intentDigest)
	}
	intent.AcknowledgedFindingIDs = []string{"a", "b"}
	if got, _ := createIntentDigest(intent); got != intentDigest {
		t.Fatal("acknowledgment order changed intent")
	}
	for name, mutate := range map[string]func(*createIntentProjection){
		"actor":          func(p *createIntentProjection) { p.ActorUserID = "actor-2" },
		"confirmation":   func(p *createIntentProjection) { p.ConfirmedRevision++ },
		"acknowledgment": func(p *createIntentProjection) { p.AcknowledgedFindingIDs = []string{"a"} },
		"finding":        func(p *createIntentProjection) { p.FindingSetDigest = strings.Repeat("d", 64) },
		"policy":         func(p *createIntentProjection) { p.SimilarityPolicyVersion++ },
		"registry":       func(p *createIntentProjection) { p.RegistryFingerprint = strings.Repeat("e", 64) },
	} {
		t.Run(name, func(t *testing.T) {
			changed := intent
			mutate(&changed)
			if got, _ := createIntentDigest(changed); got == intentDigest {
				t.Fatal("identity mutation did not change intent")
			}
		})
	}
}

func TestFindingEnvelopeAcknowledgmentsAndReceiptContract(t *testing.T) {
	exactEvidence := json.RawMessage(`{"comparison_palette_id":"palette-1","comparison_status":"candidate","fingerprint_version":1}`)
	similarEvidence := json.RawMessage(`{"color_count":2,"color_space":"oklab_d65","comparison_palette_id":"palette-2","comparison_status":"published","matching":"canonical_index_order_preserving_one_to_one","maximum_pair_distance":0.04,"maximum_pair_distance_threshold":0.06,"mean_distance":0.02,"mean_distance_threshold":0.035,"policy_version":1}`)
	findings := []protocolFinding{
		{Kind: "exact_duplicate", Severity: "blocking", Path: "/colors", Code: "EXACT_DUPLICATE_CANDIDATE", Message: "An exact Palette already exists.", PolicyVersion: 1, ComparisonPaletteID: "palette-1", Evidence: exactEvidence},
		{Kind: "similar_palette", Severity: "warning", Path: "/colors", Code: "SIMILAR_PALETTE", Message: "A similar Palette requires review.", PolicyVersion: 1, ComparisonPaletteID: "palette-2", Evidence: similarEvidence},
	}
	for i := range findings {
		findings[i].ID, _ = protocolFindingID(findings[i])
	}
	envelope := findingEnvelope{Version: FindingEnvelopeVersion, Findings: findings}
	encoded := marshal(t, envelope)
	assertTopLevelKeys(t, encoded, "findings", "version")
	for _, key := range []string{"id", "kind", "severity", "path", "code", "message", "policy_version", "comparison_palette_id", "evidence"} {
		if !strings.Contains(string(encoded), `"`+key+`"`) {
			t.Fatalf("finding envelope missing %s", key)
		}
	}
	assertContainsNone(t, string(encoded), "owner_user_id", "sql", "filename", "image_metadata", "assistant_reasoning", "normalized_score")
	if findings[0].ID == findings[1].ID || !validateAcknowledgmentSet([]string{findings[1].ID}, findings) {
		t.Fatal("finding identity or exact warning acknowledgment failed")
	}
	for _, invalid := range [][]string{nil, {findings[0].ID}, {findings[1].ID, findings[1].ID}, {findings[1].ID, "unknown"}} {
		if validateAcknowledgmentSet(invalid, findings) {
			t.Fatalf("accepted acknowledgment set %#v", invalid)
		}
	}
	first, _ := findingSetDigest(findings)
	reversed := []protocolFinding{findings[1], findings[0]}
	second, _ := findingSetDigest(reversed)
	if first != second {
		t.Fatal("finding order changed set digest")
	}

	payload := ValidationReceiptPayload{Version: 1, DraftDigest: strings.Repeat("a", 64), ActorUserID: "actor-1", RegistryFingerprint: PreviewRegistryFingerprint, FindingSetDigest: first, DuplicatePolicyVersion: 1, SimilarityPolicyVersion: 1, IssuedAt: 1_786_195_200, ExpiresAt: 1_786_196_100}
	assertJSONGolden(t, payload, `{"version":1,"draft_digest":"`+strings.Repeat("a", 64)+`","actor_user_id":"actor-1","registry_fingerprint":"`+PreviewRegistryFingerprint+`","finding_set_digest":"`+first+`","duplicate_policy_version":1,"similarity_policy_version":1,"issued_at":1786195200,"expires_at":1786196100}`)
	if ValidationReceiptSecretEnv != "PALETTE_ASSISTANT_VALIDATION_RECEIPT_SECRET" || ValidationReceiptMinSecretBytes != 32 || ReceiptLifetime != 15*time.Minute {
		t.Fatal("receipt configuration contract drifted")
	}
	assertStructExcludes(t, reflect.TypeOf(ValidationReceiptPayload{}), "draft", "candidate_id", "idempotency_key", "image", "filename", "path", "provenance")
	assertStructExcludes(t, reflect.TypeOf(CandidateReceipt{}), "draft_digest", "actor_user_id", "idempotency_key", "registry_fingerprint", "color_mapping")
	if reflect.TypeOf(submissionRecordProjection{}).NumField() < 10 {
		t.Fatal("internal submission record lost replay bindings")
	}
}

func TestDraftDigestMutationMatrixAndLifecycleScope(t *testing.T) {
	seed := 7
	base := minimalDraft()
	base.Revision = 2
	base.Colors = []DraftColor{{ID: "11111111-1111-4111-8111-111111111111", Hex: "#112233", Label: "A", Order: 0, Source: SourceAssistant, State: StateAccepted}}
	base.ChartApplicability = []DraftChartApplicability{{ChartType: "bar_error", Suitability: "best_fit", Notes: "note"}}
	base.Disciplines, base.UseCases, base.AvoidCases, base.Tags = []string{"general"}, []string{"publication"}, []string{"small_print"}, []string{"clean"}
	base.SourceNote = "source"
	base.PreviewCases = []DraftPreviewCase{{ChartType: "bar_error", TemplateID: "bar_error_v1", TemplateVersion: 1, SchemaVersion: 1, ColorRoles: json.RawMessage(`{"x":1}`), PreviewConfig: json.RawMessage(`{"x":true}`), SeedStrategy: "fixed", SeedValue: &seed}}
	base.Provenance = []SuggestionProvenance{{Path: "/name", Source: SourceAssistant, State: StateAccepted, Producer: "p", AlgorithmVersion: "v", ReasonCodes: []string{"R"}, SuggestedValue: json.RawMessage(`"A"`)}}
	want, _ := draftDigest(base)
	mutations := map[string]func(*AssistantDraft){
		"contract": func(d *AssistantDraft) { d.ContractVersion = "v2" }, "revision": func(d *AssistantDraft) { d.Revision++ },
		"name": func(d *AssistantDraft) { d.Name += "x" }, "type": func(d *AssistantDraft) { d.Type = "mixed" },
		"color id": func(d *AssistantDraft) { d.Colors[0].ID = "22222222-2222-4222-8222-222222222222" }, "color hex": func(d *AssistantDraft) { d.Colors[0].Hex = "#112234" },
		"color label": func(d *AssistantDraft) { d.Colors[0].Label = "B" }, "color source": func(d *AssistantDraft) { d.Colors[0].Source = SourceAdmin }, "color state": func(d *AssistantDraft) { d.Colors[0].State = StateModified },
		"applicability": func(d *AssistantDraft) { d.ChartApplicability[0].Notes += "x" }, "disciplines": func(d *AssistantDraft) { d.Disciplines = []string{"clinical"} },
		"use cases": func(d *AssistantDraft) { d.UseCases = []string{"poster"} }, "avoid cases": func(d *AssistantDraft) { d.AvoidCases = nil }, "tags": func(d *AssistantDraft) { d.Tags = nil },
		"accessibility": func(d *AssistantDraft) { d.Accessibility.ColorblindSafe = true }, "source type": func(d *AssistantDraft) { d.SourceType = "other" }, "source note": func(d *AssistantDraft) { d.SourceNote += "x" },
		"preview": func(d *AssistantDraft) { d.PreviewCases[0].SeedValue = intPtr(8) }, "provenance": func(d *AssistantDraft) { d.Provenance[0].Producer = "q" },
	}
	for name, mutate := range mutations {
		t.Run(name, func(t *testing.T) {
			changed := cloneAssistantDraft(base)
			mutate(&changed)
			if got, _ := draftDigest(changed); got == want {
				t.Fatal("mutation did not change digest")
			}
		})
	}
	for _, tc := range []struct {
		owner              bool
		visibility, status string
		eligible           bool
	}{
		{false, "public", "candidate", true}, {false, "public", "published", true}, {false, "public", "rejected", false}, {false, "public", "archived", false}, {false, "private", "published", false}, {true, "public", "published", false},
	} {
		if got := onlineComparisonEligible(tc.owner, tc.visibility, tc.status); got != tc.eligible {
			t.Fatalf("scope %+v = %v", tc, got)
		}
	}
}

func onlineComparisonEligible(hasOwner bool, visibility, status string) bool {
	return !hasOwner && visibility == "public" && (status == "candidate" || status == "published")
}

func canonicalContractHash(value any) (string, error) {
	raw, err := json.Marshal(value)
	if err != nil {
		return "", err
	}
	_, hash, err := figjcs.Hash(raw)
	return hash, err
}
func exactFingerprint(draft AssistantDraft) (string, error) {
	hexes := make([]string, len(draft.Colors))
	for i := range draft.Colors {
		hexes[i] = draft.Colors[i].Hex
	}
	return canonicalContractHash(exactFingerprintProjection{Version: ExactFingerprintVersion, OrderedHEX: hexes})
}
func draftDigest(draft AssistantDraft) (string, error) {
	return canonicalContractHash(struct {
		Version int            `json:"version"`
		Draft   AssistantDraft `json:"draft"`
	}{DraftDigestVersion, draft})
}
func protocolFindingID(finding protocolFinding) (string, error) {
	finding.ID = ""
	return canonicalContractHash(finding)
}
func findingSetDigest(findings []protocolFinding) (string, error) {
	ordered := append([]protocolFinding(nil), findings...)
	sort.Slice(ordered, func(i, j int) bool { return ordered[i].ID < ordered[j].ID })
	return canonicalContractHash(findingEnvelope{Version: FindingEnvelopeVersion, Findings: ordered})
}
func validateAcknowledgmentSet(acknowledged []string, findings []protocolFinding) bool {
	want := make([]string, 0, len(findings))
	for _, finding := range findings {
		if finding.Severity == "warning" {
			want = append(want, finding.ID)
		}
	}
	got := append([]string(nil), acknowledged...)
	sort.Strings(want)
	sort.Strings(got)
	if len(got) != len(want) {
		return false
	}
	for i := range got {
		if got[i] == "" || got[i] != want[i] || i > 0 && got[i] == got[i-1] {
			return false
		}
	}
	return true
}
func createIntentDigest(projection createIntentProjection) (string, error) {
	projection.Version, projection.ConfirmationVersion = CreateIntentDigestVersion, ConfirmationVersion
	projection.AcknowledgedFindingIDs = append([]string(nil), projection.AcknowledgedFindingIDs...)
	sort.Strings(projection.AcknowledgedFindingIDs)
	for i := 1; i < len(projection.AcknowledgedFindingIDs); i++ {
		if projection.AcknowledgedFindingIDs[i] == projection.AcknowledgedFindingIDs[i-1] {
			return "", fmt.Errorf("duplicate acknowledgment")
		}
	}
	return canonicalContractHash(projection)
}

func TestDraftAndCreateExcludeProhibitedFields(t *testing.T) {
	forbidden := []string{"actor_user_id", "owner_user_id", "visibility", "origin", "slug", "status", "candidate_id", "created_at", "updated_at", "source_image", "journal_style", "tasks", "user_suitability", "warnings", "formal_color_id"}
	assertStructExcludes(t, reflect.TypeOf(AssistantDraft{}), forbidden...)
	assertStructExcludes(t, reflect.TypeOf(DraftColor{}), "rgb", "palette_color_id", "formal_color_id")
	b := string(marshal(t, CreateCandidateRequest{Draft: minimalDraft()}))
	assertContainsNone(t, b, "proposal_id", "source_package", "source_hash", "normalized_content_hash", "checkpoint", "ingestion_record")
}

func TestPreviewJSONContract(t *testing.T) {
	preview := DraftPreviewCase{ColorRoles: json.RawMessage(`{"z":1,"a":2}`), PreviewConfig: json.RawMessage(`{"x":true}`)}
	b := marshal(t, preview)
	if strings.Contains(string(b), `"color_roles":null`) || strings.Contains(string(b), `"preview_config":null`) {
		t.Fatal("valid Preview JSON must be objects")
	}
	for _, invalid := range []json.RawMessage{nil, {}, json.RawMessage(`null`), json.RawMessage(`[]`), json.RawMessage(`{`)} {
		if validPreviewObject(invalid) {
			t.Fatalf("accepted invalid Preview JSON %q", invalid)
		}
	}
	if !validPreviewObject(json.RawMessage(`{}`)) {
		t.Fatal("empty object is structurally legal; registry validation may reject content")
	}
}

func TestProblemSpecsAreUniqueCompleteAndApplicable(t *testing.T) {
	seen := map[ProblemCode]bool{}
	for _, spec := range ProblemSpecs {
		if spec.Code == "" || seen[spec.Code] {
			t.Fatalf("duplicate/empty error code %q", spec.Code)
		}
		seen[spec.Code] = true
		if spec.HTTPStatus < 400 || spec.HTTPStatus > 599 || (!spec.Analyze && !spec.Validate && !spec.Create) {
			t.Fatalf("incomplete mapping: %+v", spec)
		}
	}
	if len(seen) != 32 {
		t.Fatalf("mapped errors = %d, want 32", len(seen))
	}
	for _, code := range []ProblemCode{ErrAnalysisTimeout, ErrAnalysisOverloaded, ErrRequestCancelled, ErrValidationReceiptExpired, ErrValidationPolicyChanged, ErrIdempotencyInProgress, ErrCandidateTransactionFailed, ErrInternalAnalysisFailure, ErrInternal} {
		if !findSpec(t, code).Retryable {
			t.Fatalf("%s must be retryable", code)
		}
	}
	if findSpec(t, ErrMissingImage).Validate || findSpec(t, ErrMissingImage).Create {
		t.Fatal("image errors apply only to analyze")
	}
	if findSpec(t, ErrValidationReceiptInvalid).HTTPStatus != 400 || findSpec(t, ErrValidationActorMismatch).HTTPStatus != 403 || findSpec(t, ErrValidationReceiptExpired).HTTPStatus != 409 {
		t.Fatal("validation receipt status classes drifted")
	}
}

func TestDependencyBoundary(t *testing.T) {
	source := readContractSource(t)
	for _, prohibited := range []string{"internal/database", "internal/palette", "gin-gonic", "image/", "net/http", "palette-ingest", "frontend"} {
		if strings.Contains(source, `"`+prohibited) {
			t.Fatalf("contract imports prohibited dependency %q", prohibited)
		}
	}
	assertContainsNone(t, source, "PublishPath", "RejectPath", "CreateCandidate(", "RegisterRoutes", "image.Decode", "sql.")
}

func validPreviewObject(raw json.RawMessage) bool {
	var value any
	if len(raw) == 0 || len(raw) > PreviewJSONByteLimit || json.Unmarshal(raw, &value) != nil {
		return false
	}
	_, ok := value.(map[string]any)
	return ok
}
func intPtr(v int) *int { return &v }
func marshal(t *testing.T, value any) []byte {
	t.Helper()
	b, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return b
}
func assertJSONGolden(t *testing.T, value any, want string) {
	t.Helper()
	if got := string(marshal(t, value)); got != want {
		t.Fatalf("JSON\n got: %s\nwant: %s", got, want)
	}
}
func assertTopLevelKeys(t *testing.T, b []byte, want ...string) {
	t.Helper()
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(b, &obj); err != nil {
		t.Fatal(err)
	}
	got := make([]string, 0, len(obj))
	for key := range obj {
		got = append(got, key)
	}
	sort.Strings(got)
	sort.Strings(want)
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("keys = %v, want %v", got, want)
	}
}
func assertNoNullArrays(t *testing.T, b []byte) {
	t.Helper()
	for _, key := range []string{"colors", "chart_applicability", "disciplines", "use_cases", "avoid_cases", "tags", "preview_cases", "provenance", "warnings", "duplicates", "similarities", "warning_acknowledgments", "preview_case_ids", "color_suggestions", "structural_color_suggestions"} {
		if strings.Contains(string(b), `"`+key+`":null`) {
			t.Fatalf("%s encoded null: %s", key, b)
		}
	}
}
func assertContainsNone(t *testing.T, source string, values ...string) {
	t.Helper()
	for _, value := range values {
		if value != "" && strings.Contains(source, value) {
			t.Fatalf("unexpected %q in %s", value, source)
		}
	}
}
func assertStructExcludes(t *testing.T, typ reflect.Type, names ...string) {
	t.Helper()
	forbidden := map[string]bool{}
	for _, n := range names {
		forbidden[n] = true
	}
	for i := 0; i < typ.NumField(); i++ {
		if forbidden[jsonName(typ.Field(i))] {
			t.Fatalf("%s exposes %q", typ.Name(), jsonName(typ.Field(i)))
		}
	}
}
func assertJSONTags(t *testing.T, typ reflect.Type, want ...string) {
	t.Helper()
	got := []string{}
	for i := 0; i < typ.NumField(); i++ {
		got = append(got, jsonName(typ.Field(i)))
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("tags = %v, want %v", got, want)
	}
}
func jsonName(field reflect.StructField) string { return strings.Split(field.Tag.Get("json"), ",")[0] }
func findSpec(t *testing.T, code ProblemCode) ProblemSpec {
	t.Helper()
	for _, spec := range ProblemSpecs {
		if spec.Code == code {
			return spec
		}
	}
	t.Fatalf("missing spec %s", code)
	return ProblemSpec{}
}
func readContractSource(t *testing.T) string {
	t.Helper()
	b, err := os.ReadFile("contract.go")
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}
