package palette

import (
	"encoding/json"
	"reflect"
	"testing"
)

func validCreatePreviewCaseRequest() *CreatePreviewCaseRequest {
	return &CreatePreviewCaseRequest{
		ChartType:       ChartTypeBarError,
		TemplateID:      "bar_error_v1",
		TemplateVersion: 1,
		SchemaVersion:   1,
		ColorRoles:      validBarErrorColorRolesJSON(),
		PreviewConfig:   validBarErrorPreviewConfigJSON(),
		SeedStrategy:    PreviewCaseSeedStrategyStableID,
	}
}

func TestValidateCreatePreviewCaseAllowsStableID(t *testing.T) {
	req := validCreatePreviewCaseRequest()

	if err := validateCreatePreviewCaseRequest(req); err != nil {
		t.Fatalf("validateCreatePreviewCaseRequest returned error: %v", err)
	}
	if req.SeedStrategy != PreviewCaseSeedStrategyStableID {
		t.Fatalf("seed strategy = %q, want stable_id", req.SeedStrategy)
	}
}

func TestValidateCreatePreviewCaseAllowsFixedSeed(t *testing.T) {
	seed := 42
	req := validCreatePreviewCaseRequest()
	req.SeedStrategy = PreviewCaseSeedStrategyFixed
	req.SeedValue = &seed

	if err := validateCreatePreviewCaseRequest(req); err != nil {
		t.Fatalf("validateCreatePreviewCaseRequest returned error: %v", err)
	}
}

func TestValidateCreatePreviewCaseDefaultsSeedStrategyOnly(t *testing.T) {
	req := validCreatePreviewCaseRequest()
	req.SeedStrategy = ""

	if err := validateCreatePreviewCaseRequest(req); err != nil {
		t.Fatalf("validateCreatePreviewCaseRequest returned error: %v", err)
	}
	if req.SeedStrategy != PreviewCaseSeedStrategyStableID {
		t.Fatalf("seed strategy = %q, want stable_id", req.SeedStrategy)
	}
}

func TestValidateCreatePreviewCaseRejectsStorageShapeIssues(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*CreatePreviewCaseRequest)
		code   string
	}{
		{
			name: "fixed seed missing value",
			mutate: func(req *CreatePreviewCaseRequest) {
				req.SeedStrategy = PreviewCaseSeedStrategyFixed
				req.SeedValue = nil
			},
			code: "FIXED_SEED_VALUE_REQUIRED",
		},
		{
			name: "invalid chart type",
			mutate: func(req *CreatePreviewCaseRequest) {
				req.ChartType = "scatter"
			},
			code: "INVALID_CHART_TYPE",
		},
		{
			name: "empty template ID",
			mutate: func(req *CreatePreviewCaseRequest) {
				req.TemplateID = " "
			},
			code: "TEMPLATE_ID_REQUIRED",
		},
		{
			name: "zero template version",
			mutate: func(req *CreatePreviewCaseRequest) {
				req.TemplateVersion = 0
			},
			code: "INVALID_TEMPLATE_VERSION",
		},
		{
			name: "zero schema version",
			mutate: func(req *CreatePreviewCaseRequest) {
				req.SchemaVersion = 0
			},
			code: "INVALID_SCHEMA_VERSION",
		},
		{
			name: "malformed color roles",
			mutate: func(req *CreatePreviewCaseRequest) {
				req.ColorRoles = json.RawMessage(`{"series":`)
			},
			code: "MALFORMED_COLOR_ROLES",
		},
		{
			name: "non-object color roles",
			mutate: func(req *CreatePreviewCaseRequest) {
				req.ColorRoles = json.RawMessage(`[]`)
			},
			code: "INVALID_COLOR_ROLES_SHAPE",
		},
		{
			name: "malformed preview config",
			mutate: func(req *CreatePreviewCaseRequest) {
				req.PreviewConfig = json.RawMessage(`{"show":`)
			},
			code: "MALFORMED_PREVIEW_CONFIG",
		},
		{
			name: "non-object preview config",
			mutate: func(req *CreatePreviewCaseRequest) {
				req.PreviewConfig = json.RawMessage(`[]`)
			},
			code: "INVALID_PREVIEW_CONFIG_SHAPE",
		},
		{
			name: "invalid seed strategy",
			mutate: func(req *CreatePreviewCaseRequest) {
				req.SeedStrategy = "random"
			},
			code: "INVALID_SEED_STRATEGY",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := validCreatePreviewCaseRequest()
			tt.mutate(req)

			err := validateCreatePreviewCaseRequest(req)
			if err == nil {
				t.Fatal("expected validation error")
			}
			validationErr, ok := IsValidationError(err)
			if !ok {
				t.Fatalf("error type = %T, want *ValidationError", err)
			}
			if !hasValidationCode(validationErr.Issues, tt.code) {
				t.Fatalf("issues = %#v, missing code %s", validationErr.Issues, tt.code)
			}
		})
	}
}

func TestValidateUpdatePreviewCaseValidatesMutableFieldsOnly(t *testing.T) {
	chartType := ChartTypeLineMultiseries
	templateID := "line_multiseries_v1"
	templateVersion := 2
	schemaVersion := 1
	seedStrategy := PreviewCaseSeedStrategyFixed
	req := &UpdatePreviewCaseRequest{
		ChartType:       &chartType,
		TemplateID:      &templateID,
		TemplateVersion: &templateVersion,
		SchemaVersion:   &schemaVersion,
		ColorRoles:      json.RawMessage(`{"series":[{"color_id":"color-1"}]}`),
		PreviewConfig:   json.RawMessage(`{"lines":3}`),
		SeedStrategy:    &seedStrategy,
		SeedValue: OptionalInt{
			Present: true,
			Value:   7,
		},
	}

	if err := validateUpdatePreviewCaseRequest(req); err != nil {
		t.Fatalf("validateUpdatePreviewCaseRequest returned error: %v", err)
	}
}

func TestValidateUpdatePreviewCaseAllowsPartialSeedPatch(t *testing.T) {
	seedStrategy := PreviewCaseSeedStrategyFixed
	req := &UpdatePreviewCaseRequest{
		SeedStrategy: &seedStrategy,
	}

	if err := validateUpdatePreviewCaseRequest(req); err != nil {
		t.Fatalf("fixed seed strategy patch without seed_value was rejected: %v", err)
	}

	req = &UpdatePreviewCaseRequest{
		SeedValue: OptionalInt{Present: true, Null: true},
	}
	if err := validateUpdatePreviewCaseRequest(req); err != nil {
		t.Fatalf("seed_value null patch was rejected: %v", err)
	}
}

func TestValidateBarErrorTemplateContractRejectsInvalidRolesAndConfig(t *testing.T) {
	candidate := &previewCaseCandidate{
		PaletteID:       "palette-1",
		ChartType:       ChartTypeBarError,
		TemplateID:      "bar_error_v1",
		TemplateVersion: 1,
		SchemaVersion:   1,
		ColorRoles:      json.RawMessage(`{"groups":[],"elements":{}}`),
		PreviewConfig:   json.RawMessage(`{"orientation":"diagonal","sample_size":0,"error_type":"mad","data_pattern":"random"}`),
		SeedStrategy:    PreviewCaseSeedStrategyStableID,
	}

	issues := validatePreviewCaseTemplateContract(candidate)
	for _, code := range []string{"INVALID_COLOR_ROLES", "INVALID_PREVIEW_CONFIG"} {
		if !hasValidationCode(issues, code) {
			t.Fatalf("issues = %#v, missing code %s", issues, code)
		}
	}
}

func TestPreviewCaseDTOsDoNotExposeLifecycleFields(t *testing.T) {
	for _, dto := range []struct {
		name  string
		value interface{}
	}{
		{name: "create", value: CreatePreviewCaseRequest{}},
		{name: "update", value: UpdatePreviewCaseRequest{}},
	} {
		t.Run(dto.name, func(t *testing.T) {
			typ := reflect.TypeOf(dto.value)
			if _, ok := typ.FieldByName("Status"); ok {
				t.Fatal("DTO exposes Status")
			}
			if _, ok := typ.FieldByName("IsPrimary"); ok {
				t.Fatal("DTO exposes IsPrimary")
			}
		})
	}
}

func TestOptionalIntDistinguishesOmittedNullAndValue(t *testing.T) {
	var omitted OptionalInt
	if omitted.Present {
		t.Fatal("zero OptionalInt should be omitted")
	}

	var explicitNull OptionalInt
	if err := json.Unmarshal([]byte(`null`), &explicitNull); err != nil {
		t.Fatalf("unmarshal null: %v", err)
	}
	if !explicitNull.Present || !explicitNull.Null {
		t.Fatalf("explicit null = %#v, want present null", explicitNull)
	}

	var explicitValue OptionalInt
	if err := json.Unmarshal([]byte(`123`), &explicitValue); err != nil {
		t.Fatalf("unmarshal value: %v", err)
	}
	if !explicitValue.Present || explicitValue.Null || explicitValue.Value != 123 {
		t.Fatalf("explicit value = %#v, want present value 123", explicitValue)
	}
}

func hasValidationCode(issues []ValidationIssue, code string) bool {
	for _, issue := range issues {
		if issue.Code == code {
			return true
		}
	}
	return false
}

func validBarErrorColorRolesJSON() json.RawMessage {
	return json.RawMessage(`{
		"groups": [
			{"key":"control","label":"Control","fill":{"source":"palette","color_id":"color-1"}},
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
}

func validBarErrorPreviewConfigJSON() json.RawMessage {
	return json.RawMessage(`{
		"orientation":"vertical",
		"sample_size":24,
		"error_type":"sem",
		"data_pattern":"mixed"
	}`)
}
