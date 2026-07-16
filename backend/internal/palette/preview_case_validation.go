package palette

import (
	"encoding/json"
	"fmt"
	"strings"
)

var allowedPreviewCaseSeedStrategies = map[string]bool{
	PreviewCaseSeedStrategyStableID: true,
	PreviewCaseSeedStrategyFixed:    true,
}

func validateCreatePreviewCaseRequest(req *CreatePreviewCaseRequest) error {
	if req == nil {
		return NewValidationError([]ValidationIssue{
			validationIssue("preview_case", "PREVIEW_CASE_REQUIRED", "Preview case request is required."),
		})
	}

	req.ChartType = strings.TrimSpace(req.ChartType)
	req.TemplateID = strings.TrimSpace(req.TemplateID)
	req.SeedStrategy = strings.TrimSpace(req.SeedStrategy)
	if req.SeedStrategy == "" {
		req.SeedStrategy = PreviewCaseSeedStrategyStableID
	}
	issues := validatePreviewCaseStorageFields(
		req.ChartType,
		req.TemplateID,
		req.TemplateVersion,
		req.SchemaVersion,
		req.ColorRoles,
		req.PreviewConfig,
		req.SeedStrategy,
		req.SeedValue,
		"preview_case",
		true,
	)
	if len(issues) > 0 {
		return NewValidationError(issues)
	}
	return nil
}

func validateUpdatePreviewCaseRequest(req *UpdatePreviewCaseRequest) error {
	if req == nil {
		return NewValidationError([]ValidationIssue{
			validationIssue("preview_case", "PREVIEW_CASE_REQUIRED", "Preview case request is required."),
		})
	}

	// This is patch-shape validation only. The lifecycle service must merge the
	// patch with the existing row and validate the complete candidate state.
	issues := make([]ValidationIssue, 0)
	if req.ChartType != nil {
		*req.ChartType = strings.TrimSpace(*req.ChartType)
		if !allowedChartTypes[*req.ChartType] {
			issues = append(issues, validationIssue("preview_case.chart_type", "INVALID_CHART_TYPE", "Chart type is not part of the Phase 1 scientific preview set."))
		}
	}
	if req.TemplateID != nil {
		*req.TemplateID = strings.TrimSpace(*req.TemplateID)
		if *req.TemplateID == "" {
			issues = append(issues, validationIssue("preview_case.template_id", "TEMPLATE_ID_REQUIRED", "Template ID is required."))
		}
	}
	if req.TemplateVersion != nil && *req.TemplateVersion <= 0 {
		issues = append(issues, validationIssue("preview_case.template_version", "INVALID_TEMPLATE_VERSION", "Template version must be greater than 0."))
	}
	if req.SchemaVersion != nil && *req.SchemaVersion <= 0 {
		issues = append(issues, validationIssue("preview_case.schema_version", "INVALID_SCHEMA_VERSION", "Schema version must be greater than 0."))
	}
	if req.ColorRoles != nil {
		issues = append(issues, validateJSONObject(req.ColorRoles, "preview_case.color_roles", "MALFORMED_COLOR_ROLES", "INVALID_COLOR_ROLES_SHAPE")...)
	}
	if req.PreviewConfig != nil {
		issues = append(issues, validateJSONObject(req.PreviewConfig, "preview_case.preview_config", "MALFORMED_PREVIEW_CONFIG", "INVALID_PREVIEW_CONFIG_SHAPE")...)
	}
	if req.SeedStrategy != nil {
		*req.SeedStrategy = strings.TrimSpace(*req.SeedStrategy)
		if !allowedPreviewCaseSeedStrategies[*req.SeedStrategy] {
			issues = append(issues, validationIssue("preview_case.seed_strategy", "INVALID_SEED_STRATEGY", "Seed strategy must be stable_id or fixed."))
		}
	}
	if len(issues) > 0 {
		return NewValidationError(issues)
	}
	return nil
}

func validatePreviewCaseStorageFields(
	chartType string,
	templateID string,
	templateVersion int,
	schemaVersion int,
	colorRoles json.RawMessage,
	previewConfig json.RawMessage,
	seedStrategy string,
	seedValue *int,
	path string,
	requireJSON bool,
) []ValidationIssue {
	issues := make([]ValidationIssue, 0)
	if !allowedChartTypes[chartType] {
		issues = append(issues, validationIssue(path+".chart_type", "INVALID_CHART_TYPE", "Chart type is not part of the Phase 1 scientific preview set."))
	}
	if templateID == "" {
		issues = append(issues, validationIssue(path+".template_id", "TEMPLATE_ID_REQUIRED", "Template ID is required."))
	}
	if templateVersion <= 0 {
		issues = append(issues, validationIssue(path+".template_version", "INVALID_TEMPLATE_VERSION", "Template version must be greater than 0."))
	}
	if schemaVersion <= 0 {
		issues = append(issues, validationIssue(path+".schema_version", "INVALID_SCHEMA_VERSION", "Schema version must be greater than 0."))
	}
	if requireJSON || colorRoles != nil {
		issues = append(issues, validateJSONObject(colorRoles, path+".color_roles", "MALFORMED_COLOR_ROLES", "INVALID_COLOR_ROLES_SHAPE")...)
	}
	if requireJSON || previewConfig != nil {
		issues = append(issues, validateJSONObject(previewConfig, path+".preview_config", "MALFORMED_PREVIEW_CONFIG", "INVALID_PREVIEW_CONFIG_SHAPE")...)
	}
	if !allowedPreviewCaseSeedStrategies[seedStrategy] {
		issues = append(issues, validationIssue(path+".seed_strategy", "INVALID_SEED_STRATEGY", "Seed strategy must be stable_id or fixed."))
	}
	if seedStrategy == PreviewCaseSeedStrategyFixed && seedValue == nil {
		issues = append(issues, validationIssue(path+".seed_value", "FIXED_SEED_VALUE_REQUIRED", "Fixed seed strategy requires a seed value."))
	}
	return issues
}

func validatePreviewCaseTemplateContract(candidate *previewCaseCandidate) []ValidationIssue {
	if candidate.TemplateID == "bar_error_v1" && candidate.ChartType != ChartTypeBarError {
		return []ValidationIssue{
			validationIssue("preview_case.template_id", "TEMPLATE_CHART_TYPE_MISMATCH", "bar_error_v1 belongs to bar_error."),
		}
	}
	if candidate.ChartType != ChartTypeBarError {
		return nil
	}

	issues := make([]ValidationIssue, 0)
	if candidate.TemplateID != "bar_error_v1" {
		issues = append(issues, validationIssue("preview_case.template_id", "UNKNOWN_TEMPLATE_ID", "bar_error preview cases must use bar_error_v1."))
	}
	if candidate.TemplateVersion != 1 {
		issues = append(issues, validationIssue("preview_case.template_version", "UNSUPPORTED_TEMPLATE_VERSION", "bar_error_v1 requires template_version 1."))
	}
	if candidate.SchemaVersion != 1 {
		issues = append(issues, validationIssue("preview_case.schema_version", "UNSUPPORTED_SCHEMA_VERSION", "bar_error_v1 requires schema_version 1."))
	}
	issues = append(issues, validateBarErrorV1Roles(candidate.ColorRoles)...)
	issues = append(issues, validateBarErrorV1Config(candidate.PreviewConfig)...)
	return issues
}

func validateBarErrorV1Roles(raw json.RawMessage) []ValidationIssue {
	var roles map[string]interface{}
	if err := json.Unmarshal(raw, &roles); err != nil {
		return []ValidationIssue{
			validationIssue("preview_case.color_roles", "MALFORMED_COLOR_ROLES", "Color roles must be valid JSON."),
		}
	}

	issues := make([]ValidationIssue, 0)
	groups, ok := roles["groups"].([]interface{})
	if !ok {
		issues = append(issues, validationIssue("preview_case.color_roles.groups", "INVALID_COLOR_ROLES", "color_roles.groups must be an array."))
	} else {
		for index, rawGroup := range groups {
			path := fmt.Sprintf("preview_case.color_roles.groups[%d]", index)
			group, ok := rawGroup.(map[string]interface{})
			if !ok {
				issues = append(issues, validationIssue(path, "INVALID_COLOR_ROLES", path+" must be an object."))
				continue
			}
			if !nonEmptyString(group["key"]) {
				issues = append(issues, validationIssue(path+".key", "INVALID_COLOR_ROLES", path+".key must be a non-empty string."))
			}
			if !nonEmptyString(group["label"]) {
				issues = append(issues, validationIssue(path+".label", "INVALID_COLOR_ROLES", path+".label must be a non-empty string."))
			}
			if _, ok := group["fill"].(map[string]interface{}); !ok {
				issues = append(issues, validationIssue(path+".fill", "INVALID_COLOR_ROLES", path+".fill must be an object."))
			}
		}
	}

	elements, ok := roles["elements"].(map[string]interface{})
	if !ok {
		issues = append(issues, validationIssue("preview_case.color_roles.elements", "INVALID_COLOR_ROLES", "color_roles.elements must be an object."))
	} else {
		for _, key := range []string{"axis", "grid", "text", "error_bar", "background"} {
			if _, ok := elements[key].(map[string]interface{}); !ok {
				issues = append(issues, validationIssue("preview_case.color_roles.elements."+key, "INVALID_COLOR_ROLES", "Required bar_error_v1 element role must be an object."))
			}
		}
	}
	return issues
}

func validateBarErrorV1Config(raw json.RawMessage) []ValidationIssue {
	var config map[string]interface{}
	if err := json.Unmarshal(raw, &config); err != nil {
		return []ValidationIssue{
			validationIssue("preview_case.preview_config", "MALFORMED_PREVIEW_CONFIG", "Preview config must be valid JSON."),
		}
	}

	issues := make([]ValidationIssue, 0)
	if !oneOfString(config["orientation"], "vertical", "horizontal") {
		issues = append(issues, validationIssue("preview_case.preview_config.orientation", "INVALID_PREVIEW_CONFIG", "orientation must be vertical or horizontal."))
	}
	if !positiveInteger(config["sample_size"]) {
		issues = append(issues, validationIssue("preview_case.preview_config.sample_size", "INVALID_PREVIEW_CONFIG", "sample_size must be a positive integer."))
	}
	if !oneOfString(config["error_type"], "sd", "sem", "ci") {
		issues = append(issues, validationIssue("preview_case.preview_config.error_type", "INVALID_PREVIEW_CONFIG", "error_type must be sd, sem, or ci."))
	}
	if !oneOfString(config["data_pattern"], "treatment_higher", "treatment_lower", "dose_response", "mixed") {
		issues = append(issues, validationIssue("preview_case.preview_config.data_pattern", "INVALID_PREVIEW_CONFIG", "data_pattern is not supported."))
	}
	return issues
}

func nonEmptyString(value interface{}) bool {
	text, ok := value.(string)
	return ok && strings.TrimSpace(text) != ""
}

func oneOfString(value interface{}, allowed ...string) bool {
	text, ok := value.(string)
	if !ok {
		return false
	}
	for _, candidate := range allowed {
		if text == candidate {
			return true
		}
	}
	return false
}

func positiveInteger(value interface{}) bool {
	number, ok := value.(float64)
	return ok && number > 0 && number == float64(int(number))
}

func validateJSONObject(raw json.RawMessage, path, malformedCode, shapeCode string) []ValidationIssue {
	if len(raw) == 0 || strings.TrimSpace(string(raw)) == "" {
		return []ValidationIssue{
			validationIssue(path, malformedCode, "Value must be a JSON object."),
		}
	}

	var value interface{}
	if err := json.Unmarshal(raw, &value); err != nil {
		return []ValidationIssue{
			validationIssue(path, malformedCode, "Value must be valid JSON."),
		}
	}
	if _, ok := value.(map[string]interface{}); !ok {
		return []ValidationIssue{
			validationIssue(path, shapeCode, "Value must be a JSON object."),
		}
	}
	return nil
}
