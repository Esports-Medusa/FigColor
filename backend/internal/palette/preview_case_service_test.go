package palette

import (
	"encoding/json"
	"errors"
	"testing"
)

func testPaletteWithColors(t *testing.T) *Palette {
	t.Helper()
	colors, err := json.Marshal([]PaletteColor{
		{ID: "color-1", Hex: "#112233", RGB: [3]int{17, 34, 51}, Order: 0},
		{ID: "color-2", Hex: "#445566", RGB: [3]int{68, 85, 102}, Order: 1},
	})
	if err != nil {
		t.Fatalf("marshal colors: %v", err)
	}
	return &Palette{
		ID:     "palette-1",
		Colors: colors,
	}
}

func validPreviewCaseCandidate() *previewCaseCandidate {
	seed := 17
	return &previewCaseCandidate{
		PaletteID:       "palette-1",
		ChartType:       ChartTypeBarError,
		TemplateID:      "bar_error_v1",
		TemplateVersion: 1,
		SchemaVersion:   1,
		ColorRoles:      validBarErrorColorRolesJSON(),
		PreviewConfig:   validBarErrorPreviewConfigJSON(),
		SeedStrategy:    PreviewCaseSeedStrategyFixed,
		SeedValue:       &seed,
	}
}

func TestPreviewCaseCandidateValidationAcceptsPersistedPaletteColorIDs(t *testing.T) {
	service := NewService(NewRepository())

	err := service.validatePreviewCaseCandidate(testPaletteWithColors(t), validPreviewCaseCandidate())
	if err != nil {
		t.Fatalf("validatePreviewCaseCandidate returned error: %v", err)
	}
}

func TestPreviewCaseCandidateValidationRejectsMissingPaletteColorID(t *testing.T) {
	service := NewService(NewRepository())
	candidate := validPreviewCaseCandidate()
	candidate.ColorRoles = json.RawMessage(`{
		"groups": [
			{"key":"control","label":"Control","fill":{"source":"palette"}},
			{"key":"treated","label":"Treated","fill":{"source":"palette","color_id":"color-2"}},
			{"key":"rescue","label":"Rescue","fill":{"source":"palette","color_id":"color-1"}}
		],
		"elements": {
			"axis":{"source":"theme","token":"foreground"},
			"grid":{"source":"theme","token":"grid"},
			"text":{"source":"theme","token":"muted_foreground"},
			"error_bar":{"source":"theme","token":"foreground"},
			"background":{"source":"theme","token":"background"}
		}
	}`)

	err := service.validatePreviewCaseCandidate(testPaletteWithColors(t), candidate)
	if err == nil {
		t.Fatal("expected validation error")
	}
	validationErr, ok := IsValidationError(err)
	if !ok {
		t.Fatalf("error type = %T, want validation error", err)
	}
	assertValidationIssue(t, validationErr.Issues, "preview_case.color_roles.groups[0].fill.color_id", "COLOR_ID_REQUIRED")
}

func TestPreviewCaseCandidateValidationRejectsUnknownPaletteColorID(t *testing.T) {
	service := NewService(NewRepository())
	candidate := validPreviewCaseCandidate()
	candidate.ColorRoles = json.RawMessage(`{
		"groups": [
			{"key":"control","label":"Control","fill":{"source":"palette","color_id":"missing-color"}},
			{"key":"treated","label":"Treated","fill":{"source":"palette","color_id":"color-2"}},
			{"key":"rescue","label":"Rescue","fill":{"source":"palette","color_id":"color-1"}}
		],
		"elements": {
			"axis":{"source":"theme","token":"foreground"},
			"grid":{"source":"theme","token":"grid"},
			"text":{"source":"theme","token":"muted_foreground"},
			"error_bar":{"source":"theme","token":"foreground"},
			"background":{"source":"theme","token":"background"}
		}
	}`)

	err := service.validatePreviewCaseCandidate(testPaletteWithColors(t), candidate)
	if err == nil {
		t.Fatal("expected validation error")
	}
	validationErr, ok := IsValidationError(err)
	if !ok {
		t.Fatalf("error type = %T, want validation error", err)
	}
	assertValidationIssue(t, validationErr.Issues, "preview_case.color_roles.groups[0].fill.color_id", "COLOR_NOT_FOUND")
}

func TestMergePreviewCaseUpdateReusesExistingFixedSeedValue(t *testing.T) {
	existing := &PalettePreviewCase{
		PaletteID:       "palette-1",
		ChartType:       ChartTypeBarError,
		TemplateID:      "bar_error_v1",
		TemplateVersion: 1,
		SchemaVersion:   1,
		ColorRoles:      validBarErrorColorRolesJSON(),
		PreviewConfig:   validBarErrorPreviewConfigJSON(),
		SeedStrategy:    PreviewCaseSeedStrategyFixed,
		SeedValue:       intPtr(44),
		Status:          PreviewCaseStatusDraft,
	}
	req := &UpdatePreviewCaseRequest{}

	candidate := previewCaseCandidateFromExisting(existing)
	mergePreviewCaseUpdate(candidate, req)

	if candidate.SeedValue == nil || *candidate.SeedValue != 44 {
		t.Fatalf("merged seed value = %#v, want existing fixed seed 44", candidate.SeedValue)
	}
	service := NewService(NewRepository())
	if err := service.validatePreviewCaseCandidate(testPaletteWithColors(t), candidate); err != nil {
		t.Fatalf("merged candidate should remain valid: %v", err)
	}
}

func TestMergePreviewCaseUpdateRejectsClearingFixedSeedValue(t *testing.T) {
	existing := &PalettePreviewCase{
		PaletteID:       "palette-1",
		ChartType:       ChartTypeBarError,
		TemplateID:      "bar_error_v1",
		TemplateVersion: 1,
		SchemaVersion:   1,
		ColorRoles:      validBarErrorColorRolesJSON(),
		PreviewConfig:   validBarErrorPreviewConfigJSON(),
		SeedStrategy:    PreviewCaseSeedStrategyFixed,
		SeedValue:       intPtr(44),
		Status:          PreviewCaseStatusDraft,
	}
	req := &UpdatePreviewCaseRequest{
		SeedValue: OptionalInt{Present: true, Null: true},
	}

	candidate := previewCaseCandidateFromExisting(existing)
	mergePreviewCaseUpdate(candidate, req)
	err := NewService(NewRepository()).validatePreviewCaseCandidate(testPaletteWithColors(t), candidate)
	if err == nil {
		t.Fatal("expected validation error")
	}
	validationErr, ok := IsValidationError(err)
	if !ok {
		t.Fatalf("error type = %T, want validation error", err)
	}
	assertValidationIssue(t, validationErr.Issues, "preview_case.seed_value", "FIXED_SEED_VALUE_REQUIRED")
}

func TestPublishedUpdateValidatesFullReplacementCandidate(t *testing.T) {
	existing := &PalettePreviewCase{
		PaletteID:       "palette-1",
		ChartType:       ChartTypeBarError,
		TemplateID:      "bar_error_v1",
		TemplateVersion: 1,
		SchemaVersion:   1,
		ColorRoles:      validBarErrorColorRolesJSON(),
		PreviewConfig:   validBarErrorPreviewConfigJSON(),
		SeedStrategy:    PreviewCaseSeedStrategyStableID,
		Status:          PreviewCaseStatusPublished,
	}
	req := &UpdatePreviewCaseRequest{
		ColorRoles: json.RawMessage(`{
			"groups": [
				{"key":"control","label":"Control","fill":{"source":"palette","color_id":"missing-color"}},
				{"key":"treated","label":"Treated","fill":{"source":"palette","color_id":"color-2"}},
				{"key":"rescue","label":"Rescue","fill":{"source":"palette","color_id":"color-1"}}
			],
			"elements": {
				"axis":{"source":"theme","token":"foreground"},
				"grid":{"source":"theme","token":"grid"},
				"text":{"source":"theme","token":"muted_foreground"},
				"error_bar":{"source":"theme","token":"foreground"},
				"background":{"source":"theme","token":"background"}
			}
		}`),
	}

	candidate := previewCaseCandidateFromExisting(existing)
	mergePreviewCaseUpdate(candidate, req)
	err := NewService(NewRepository()).validatePreviewCaseCandidate(testPaletteWithColors(t), candidate)
	if err == nil {
		t.Fatal("expected validation error")
	}
	validationErr, ok := IsValidationError(err)
	if !ok {
		t.Fatalf("error type = %T, want validation error", err)
	}
	assertValidationIssue(t, validationErr.Issues, "preview_case.color_roles.groups[0].fill.color_id", "COLOR_NOT_FOUND")
}

func TestPreviewCaseLifecycleTransitionRules(t *testing.T) {
	draft := &PalettePreviewCase{Status: PreviewCaseStatusDraft}
	published := &PalettePreviewCase{Status: PreviewCaseStatusPublished}
	archived := &PalettePreviewCase{Status: PreviewCaseStatusArchived}

	if err := canDeleteDraftPreviewCase(draft); err != nil {
		t.Fatalf("draft delete rejected: %v", err)
	}
	if err := canDeleteDraftPreviewCase(published); !errors.Is(err, ErrInvalidPreviewCaseLifecycleTransition) {
		t.Fatalf("published delete error = %v, want lifecycle transition error", err)
	}
	if err := canDeleteDraftPreviewCase(archived); !errors.Is(err, ErrInvalidPreviewCaseLifecycleTransition) {
		t.Fatalf("archived delete error = %v, want lifecycle transition error", err)
	}

	unchanged, err := canPublishPreviewCase(draft)
	if err != nil || unchanged {
		t.Fatalf("draft publish = unchanged %v err %v, want transition", unchanged, err)
	}
	unchanged, err = canPublishPreviewCase(published)
	if err != nil || !unchanged {
		t.Fatalf("published publish = unchanged %v err %v, want idempotent unchanged", unchanged, err)
	}
	if _, err := canPublishPreviewCase(archived); !errors.Is(err, ErrInvalidPreviewCaseLifecycleTransition) {
		t.Fatalf("archived publish error = %v, want lifecycle transition error", err)
	}

	unchanged, err = canArchivePreviewCase(draft)
	if err != nil || unchanged {
		t.Fatalf("draft archive = unchanged %v err %v, want transition", unchanged, err)
	}
	unchanged, err = canArchivePreviewCase(published)
	if err != nil || unchanged {
		t.Fatalf("published archive = unchanged %v err %v, want transition", unchanged, err)
	}
	unchanged, err = canArchivePreviewCase(archived)
	if err != nil || !unchanged {
		t.Fatalf("archived archive = unchanged %v err %v, want idempotent unchanged", unchanged, err)
	}

	if err := canSetPrimaryPreviewCase(published); err != nil {
		t.Fatalf("published set primary rejected: %v", err)
	}
	if err := canSetPrimaryPreviewCase(draft); !errors.Is(err, ErrInvalidPreviewCaseLifecycleTransition) {
		t.Fatalf("draft set primary error = %v, want lifecycle transition error", err)
	}
	if err := canSetPrimaryPreviewCase(archived); !errors.Is(err, ErrInvalidPreviewCaseLifecycleTransition) {
		t.Fatalf("archived set primary error = %v, want lifecycle transition error", err)
	}
}

func intPtr(value int) *int {
	return &value
}

func assertValidationIssue(t *testing.T, issues []ValidationIssue, path string, code string) {
	t.Helper()
	for _, issue := range issues {
		if issue.Path == path && issue.Code == code {
			return
		}
	}
	t.Fatalf("issues = %#v, missing %s at %s", issues, code, path)
}
