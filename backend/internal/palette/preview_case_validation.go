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
	templateChartTypes := map[string]string{
		"bar_error_v1":           ChartTypeBarError,
		"boxplot_jitter_v1":      ChartTypeBoxplotJitter,
		"line_multiseries_v1":    ChartTypeLineMultiseries,
		"heatmap_annotated_v1":   ChartTypeHeatmapAnnotated,
		"scatter_grouped_v1":     ChartTypeScatterGrouped,
		"violin_distribution_v1": ChartTypeViolinDistribution,
	}
	if owner, ok := templateChartTypes[candidate.TemplateID]; ok && owner != candidate.ChartType {
		return []ValidationIssue{
			validationIssue("preview_case.template_id", "TEMPLATE_CHART_TYPE_MISMATCH", candidate.TemplateID+" belongs to "+owner+"."),
		}
	}

	issues := make([]ValidationIssue, 0)
	expectedTemplateID, ok := map[string]string{
		ChartTypeBarError:           "bar_error_v1",
		ChartTypeBoxplotJitter:      "boxplot_jitter_v1",
		ChartTypeLineMultiseries:    "line_multiseries_v1",
		ChartTypeHeatmapAnnotated:   "heatmap_annotated_v1",
		ChartTypeScatterGrouped:     "scatter_grouped_v1",
		ChartTypeViolinDistribution: "violin_distribution_v1",
	}[candidate.ChartType]
	if !ok || candidate.TemplateID != expectedTemplateID {
		issues = append(issues, validationIssue("preview_case.template_id", "UNKNOWN_TEMPLATE_ID", "Unknown Phase 1 template for chart type."))
	}
	if candidate.TemplateVersion != 1 {
		issues = append(issues, validationIssue("preview_case.template_version", "UNSUPPORTED_TEMPLATE_VERSION", "Phase 1 templates require template_version 1."))
	}
	if candidate.SchemaVersion != 1 {
		issues = append(issues, validationIssue("preview_case.schema_version", "UNSUPPORTED_SCHEMA_VERSION", "Phase 1 templates require schema_version 1."))
	}
	if len(issues) > 0 {
		return issues
	}

	switch candidate.ChartType {
	case ChartTypeBarError:
		issues = append(issues, validateBarErrorV1Roles(candidate.ColorRoles)...)
		issues = append(issues, validateBarErrorV1Config(candidate.PreviewConfig)...)
	case ChartTypeBoxplotJitter:
		issues = append(issues, validateBoxplotJitterV1Roles(candidate.ColorRoles)...)
		issues = append(issues, validateBoxplotJitterV1Config(candidate.PreviewConfig)...)
	case ChartTypeLineMultiseries:
		issues = append(issues, validateLineMultiseriesV1Roles(candidate.ColorRoles)...)
		issues = append(issues, validateLineMultiseriesV1Config(candidate.PreviewConfig)...)
	case ChartTypeHeatmapAnnotated:
		issues = append(issues, validateHeatmapAnnotatedV1Roles(candidate.ColorRoles)...)
		issues = append(issues, validateHeatmapAnnotatedV1Config(candidate.PreviewConfig)...)
	case ChartTypeScatterGrouped:
		issues = append(issues, validateScatterGroupedV1Roles(candidate.ColorRoles)...)
		issues = append(issues, validateScatterGroupedV1Config(candidate.PreviewConfig)...)
	case ChartTypeViolinDistribution:
		issues = append(issues, validateViolinDistributionV1Roles(candidate.ColorRoles)...)
		issues = append(issues, validateViolinDistributionV1Config(candidate.PreviewConfig)...)
	}
	return issues
}

func validateBarErrorV1Roles(raw json.RawMessage) []ValidationIssue {
	roles, issues := decodeObject(raw, "preview_case.color_roles", "MALFORMED_COLOR_ROLES")
	if len(issues) > 0 {
		return issues
	}

	issues = append(issues, validateNamedColorRoleArray(roles, "groups", "fill", "preview_case.color_roles.groups", 1)...)
	issues = append(issues, validateArrayMaximum(roles["groups"], "preview_case.color_roles.groups", 5)...)
	elements, ok := roles["elements"].(map[string]interface{})
	if !ok {
		issues = append(issues, validationIssue("preview_case.color_roles.elements", "INVALID_COLOR_ROLES", "color_roles.elements must be an object."))
	} else {
		for _, key := range []string{"axis", "grid", "text", "error_bar", "background"} {
			if _, ok := elements[key]; !ok {
				issues = append(issues, validationIssue("preview_case.color_roles.elements."+key, "INVALID_COLOR_ROLES", "Required bar_error_v1 element role must be an object."))
				continue
			}
			issues = append(issues, validateVisualReference(elements[key], "preview_case.color_roles.elements."+key)...)
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

func validateBoxplotJitterV1Roles(raw json.RawMessage) []ValidationIssue {
	roles, issues := decodeObject(raw, "preview_case.color_roles", "MALFORMED_COLOR_ROLES")
	if len(issues) > 0 {
		return issues
	}
	issues = append(issues, validateNamedColorRoleArray(roles, "groups", "color", "preview_case.color_roles.groups", 1)...)
	issues = append(issues, validateArrayMaximum(roles["groups"], "preview_case.color_roles.groups", 5)...)
	issues = append(issues, validateOptionalElements(roles["elements"], "preview_case.color_roles.elements", map[string]bool{
		"jitter_point": true, "median_line": true, "whisker": true, "outline": true,
		"axis": true, "grid": true, "text": true, "box_stroke": true, "median": true,
		"jitter": true, "outlier": true, "background": true,
	})...)
	return issues
}

func validateBoxplotJitterV1Config(raw json.RawMessage) []ValidationIssue {
	config, issues := decodeObject(raw, "preview_case.preview_config", "MALFORMED_PREVIEW_CONFIG")
	if len(issues) > 0 {
		return issues
	}
	issues = append(issues, requireOneOf(config, "jitter_density", "preview_case.preview_config.jitter_density", "INVALID_PREVIEW_CONFIG", "low", "medium", "high")...)
	issues = append(issues, requireBoolean(config, "show_outliers", "preview_case.preview_config.show_outliers")...)
	issues = append(issues, optionalString(config, "y_axis_label", "preview_case.preview_config.y_axis_label", "INVALID_PREVIEW_CONFIG")...)
	return issues
}

func validateLineMultiseriesV1Roles(raw json.RawMessage) []ValidationIssue {
	roles, issues := decodeObject(raw, "preview_case.color_roles", "MALFORMED_COLOR_ROLES")
	if len(issues) > 0 {
		return issues
	}
	issues = append(issues, validateLineSeriesArray(roles["series"], "preview_case.color_roles.series")...)
	issues = append(issues, validateOptionalElements(roles["elements"], "preview_case.color_roles.elements", map[string]bool{
		"axis": true, "grid": true, "reference_line": true, "text": true, "marker_stroke": true, "background": true,
	})...)
	return issues
}

func validateLineMultiseriesV1Config(raw json.RawMessage) []ValidationIssue {
	config, issues := decodeObject(raw, "preview_case.preview_config", "MALFORMED_PREVIEW_CONFIG")
	if len(issues) > 0 {
		return issues
	}
	issues = append(issues, requireIntegerRange(config, "point_count", "preview_case.preview_config.point_count", 6, 12)...)
	issues = append(issues, requireOneOf(config, "curve_shape", "preview_case.preview_config.curve_shape", "INVALID_PREVIEW_CONFIG", "increasing", "decreasing", "sigmoid", "peak", "mixed")...)
	issues = append(issues, optionalString(config, "x_axis_label", "preview_case.preview_config.x_axis_label", "INVALID_PREVIEW_CONFIG")...)
	issues = append(issues, optionalString(config, "y_axis_label", "preview_case.preview_config.y_axis_label", "INVALID_PREVIEW_CONFIG")...)
	return issues
}

func validateHeatmapAnnotatedV1Roles(raw json.RawMessage) []ValidationIssue {
	roles, issues := decodeObject(raw, "preview_case.color_roles", "MALFORMED_COLOR_ROLES")
	if len(issues) > 0 {
		return issues
	}
	scale, ok := roles["scale"].(map[string]interface{})
	if !ok {
		issues = append(issues, validationIssue("preview_case.color_roles.scale", "INVALID_COLOR_ROLES", "scale must be an object."))
		return issues
	}
	issues = append(issues, requireOneOf(scale, "type", "preview_case.color_roles.scale.type", "INVALID_COLOR_ROLES", "sequential", "diverging")...)
	stops, ok := scale["stops"].([]interface{})
	if !ok {
		issues = append(issues, validationIssue("preview_case.color_roles.scale.stops", "INVALID_COLOR_ROLES", "scale.stops must be an array."))
	} else {
		minStops := 2
		if scale["type"] == "diverging" {
			minStops = 3
		}
		if len(stops) < minStops {
			issues = append(issues, validationIssue("preview_case.color_roles.scale.stops", "INVALID_HEATMAP_STOPS", "Heatmap scale has too few stops."))
		}
		var previous *float64
		for index, rawStop := range stops {
			path := fmt.Sprintf("preview_case.color_roles.scale.stops[%d]", index)
			stop, ok := rawStop.(map[string]interface{})
			if !ok {
				issues = append(issues, validationIssue(path, "INVALID_COLOR_ROLES", path+" must be an object."))
				continue
			}
			position, ok := stop["position"].(float64)
			if !ok || position < 0 || position > 1 {
				issues = append(issues, validationIssue(path+".position", "INVALID_HEATMAP_STOPS", "Stop position must be between 0 and 1."))
			}
			if previous != nil && ok && position <= *previous {
				issues = append(issues, validationIssue(path+".position", "INVALID_HEATMAP_STOPS", "Stop positions must be strictly increasing."))
			}
			if ok {
				previous = &position
			}
			issues = append(issues, requireColorReferenceObject(stop, "color", path+".color")...)
			issues = append(issues, optionalString(stop, "label", path+".label", "INVALID_COLOR_ROLES")...)
		}
	}
	if annotations, exists := roles["annotations"]; exists {
		issues = append(issues, validateNamedColorRoleArray(map[string]interface{}{"annotations": annotations}, "annotations", "color", "preview_case.color_roles.annotations", 0)...)
	}
	issues = append(issues, validateOptionalElements(roles["elements"], "preview_case.color_roles.elements", map[string]bool{
		"missing_value": true, "text": true, "border": true, "grid": true, "background": true, "annotation_text": true,
	})...)
	return issues
}

func validateHeatmapAnnotatedV1Config(raw json.RawMessage) []ValidationIssue {
	config, issues := decodeObject(raw, "preview_case.preview_config", "MALFORMED_PREVIEW_CONFIG")
	if len(issues) > 0 {
		return issues
	}
	for _, key := range []string{"rows", "columns"} {
		issues = append(issues, requireIntegerRange(config, key, "preview_case.preview_config."+key, 4, 8)...)
	}
	for _, key := range []string{"cluster_rows", "cluster_columns", "show_row_labels", "show_column_labels", "show_values"} {
		issues = append(issues, requireBoolean(config, key, "preview_case.preview_config."+key)...)
	}
	issues = append(issues, requireOneOf(config, "data_pattern", "preview_case.preview_config.data_pattern", "INVALID_PREVIEW_CONFIG", "two_clusters", "three_clusters", "gradient", "mixed")...)
	return issues
}

func validateScatterGroupedV1Roles(raw json.RawMessage) []ValidationIssue {
	roles, issues := decodeObject(raw, "preview_case.color_roles", "MALFORMED_COLOR_ROLES")
	if len(issues) > 0 {
		return issues
	}
	issues = append(issues, validateNamedColorRoleArray(roles, "groups", "color", "preview_case.color_roles.groups", 1)...)
	issues = append(issues, validateArrayMaximum(roles["groups"], "preview_case.color_roles.groups", 5)...)
	issues = append(issues, validateRequiredElements(roles["elements"], "preview_case.color_roles.elements", []string{"axis", "muted_foreground", "grid", "background"})...)
	return issues
}

func validateScatterGroupedV1Config(raw json.RawMessage) []ValidationIssue {
	config, issues := decodeObject(raw, "preview_case.preview_config", "MALFORMED_PREVIEW_CONFIG")
	if len(issues) > 0 {
		return issues
	}
	issues = append(issues, requireIntegerRange(config, "point_count", "preview_case.preview_config.point_count", 8, 30)...)
	issues = append(issues, requireOneOf(config, "data_pattern", "preview_case.preview_config.data_pattern", "INVALID_PREVIEW_CONFIG", "clusters", "positive", "negative", "mixed")...)
	issues = append(issues, requireOneOf(config, "point_size", "preview_case.preview_config.point_size", "INVALID_PREVIEW_CONFIG", "small", "medium", "large")...)
	issues = append(issues, optionalNumberRange(config, "point_opacity", "preview_case.preview_config.point_opacity", 0.25, 1)...)
	return issues
}

func validateViolinDistributionV1Roles(raw json.RawMessage) []ValidationIssue {
	roles, issues := decodeObject(raw, "preview_case.color_roles", "MALFORMED_COLOR_ROLES")
	if len(issues) > 0 {
		return issues
	}
	issues = append(issues, validateNamedColorRoleArray(roles, "groups", "fill", "preview_case.color_roles.groups", 1)...)
	issues = append(issues, validateArrayMaximum(roles["groups"], "preview_case.color_roles.groups", 5)...)
	issues = append(issues, validateRequiredElements(roles["elements"], "preview_case.color_roles.elements", []string{"outline", "median", "axis", "grid", "background"})...)
	return issues
}

func validateViolinDistributionV1Config(raw json.RawMessage) []ValidationIssue {
	config, issues := decodeObject(raw, "preview_case.preview_config", "MALFORMED_PREVIEW_CONFIG")
	if len(issues) > 0 {
		return issues
	}
	issues = append(issues, requireIntegerRange(config, "sample_count", "preview_case.preview_config.sample_count", 16, 48)...)
	issues = append(issues, requireOneOf(config, "distribution_shape", "preview_case.preview_config.distribution_shape", "INVALID_PREVIEW_CONFIG", "normal", "skewed", "bimodal", "mixed")...)
	issues = append(issues, requireOneOf(config, "bandwidth", "preview_case.preview_config.bandwidth", "INVALID_PREVIEW_CONFIG", "narrow", "medium", "wide")...)
	issues = append(issues, requireBoolean(config, "show_summary", "preview_case.preview_config.show_summary")...)
	return issues
}

func validateRequiredElements(value interface{}, path string, keys []string) []ValidationIssue {
	elements, ok := value.(map[string]interface{})
	if !ok {
		return []ValidationIssue{validationIssue(path, "INVALID_ROLE_STRUCTURE", path+" must be an object.")}
	}
	issues := make([]ValidationIssue, 0)
	for _, key := range keys {
		reference, exists := elements[key]
		if !exists {
			issues = append(issues, validationIssue(path+"."+key, "INVALID_COLOR_ROLES", path+"."+key+" is required."))
			continue
		}
		issues = append(issues, validateVisualReference(reference, path+"."+key)...)
	}
	return issues
}

func validateArrayMaximum(value interface{}, path string, max int) []ValidationIssue {
	items, ok := value.([]interface{})
	if ok && len(items) > max {
		return []ValidationIssue{validationIssue(path, "INVALID_ROLE_STRUCTURE", fmt.Sprintf("%s must contain at most %d entries.", path, max))}
	}
	return nil
}

func optionalNumberRange(object map[string]interface{}, key string, path string, min float64, max float64) []ValidationIssue {
	value, exists := object[key]
	if !exists {
		return nil
	}
	number, ok := value.(float64)
	if !ok || number < min || number > max {
		return []ValidationIssue{validationIssue(path, "INVALID_PREVIEW_CONFIG", fmt.Sprintf("%s must be between %g and %g.", path, min, max))}
	}
	return nil
}

func decodeObject(raw json.RawMessage, path string, malformedCode string) (map[string]interface{}, []ValidationIssue) {
	var object map[string]interface{}
	if err := json.Unmarshal(raw, &object); err != nil {
		return nil, []ValidationIssue{validationIssue(path, malformedCode, "Value must be valid JSON object.")}
	}
	if object == nil {
		return nil, []ValidationIssue{validationIssue(path, malformedCode, "Value must be a JSON object.")}
	}
	return object, nil
}

func validateNamedColorRoleArray(roles map[string]interface{}, key string, colorField string, path string, minItems int) []ValidationIssue {
	rawItems, ok := roles[key].([]interface{})
	if !ok {
		return []ValidationIssue{validationIssue(path, "INVALID_ROLE_STRUCTURE", path+" must be an array.")}
	}
	if len(rawItems) < minItems {
		return []ValidationIssue{validationIssue(path, "INVALID_ROLE_STRUCTURE", path+" has too few entries.")}
	}
	issues := make([]ValidationIssue, 0)
	seen := map[string]int{}
	for index, rawItem := range rawItems {
		itemPath := fmt.Sprintf("%s[%d]", path, index)
		item, ok := rawItem.(map[string]interface{})
		if !ok {
			issues = append(issues, validationIssue(itemPath, "INVALID_ROLE_STRUCTURE", itemPath+" must be an object."))
			continue
		}
		issues = append(issues, requireNonEmptyString(item, "key", itemPath+".key", "INVALID_ROLE_STRUCTURE")...)
		if keyText, ok := item["key"].(string); ok {
			if first, exists := seen[keyText]; exists {
				issues = append(issues, validationIssue(itemPath+".key", "DUPLICATE_ROLE_KEY", fmt.Sprintf("Role key duplicates %s[%d].key.", path, first)))
			}
			seen[keyText] = index
		}
		issues = append(issues, requireNonEmptyString(item, "label", itemPath+".label", "INVALID_ROLE_STRUCTURE")...)
		issues = append(issues, requirePaletteColorReferenceObject(item, colorField, itemPath+"."+colorField)...)
	}
	return issues
}

func validateLineSeriesArray(value interface{}, path string) []ValidationIssue {
	roles := map[string]interface{}{"series": value}
	issues := validateNamedColorRoleArray(roles, "series", "line", path, 1)
	issues = append(issues, validateArrayMaximum(value, path, 5)...)
	items, _ := value.([]interface{})
	for index, rawItem := range items {
		item, ok := rawItem.(map[string]interface{})
		if !ok {
			continue
		}
		itemPath := fmt.Sprintf("%s[%d]", path, index)
		for _, key := range []string{"confidence_band", "marker"} {
			if _, exists := item[key]; exists {
				issues = append(issues, validateVisualReference(item[key], itemPath+"."+key)...)
			}
		}
	}
	return issues
}

func validateOptionalElements(value interface{}, path string, allowed map[string]bool) []ValidationIssue {
	if value == nil {
		return nil
	}
	elements, ok := value.(map[string]interface{})
	if !ok {
		return []ValidationIssue{validationIssue(path, "INVALID_ROLE_STRUCTURE", path+" must be an object.")}
	}
	issues := make([]ValidationIssue, 0)
	for key, rawReference := range elements {
		if !allowed[key] {
			continue
		}
		issues = append(issues, validateVisualReference(rawReference, path+"."+key)...)
	}
	return issues
}

func requireColorReferenceObject(item map[string]interface{}, key string, path string) []ValidationIssue {
	rawReference, ok := item[key]
	if !ok {
		return []ValidationIssue{validationIssue(path, "INVALID_ROLE_STRUCTURE", path+" is required.")}
	}
	return validateVisualReference(rawReference, path)
}

func requirePaletteColorReferenceObject(item map[string]interface{}, key string, path string) []ValidationIssue {
	rawReference, ok := item[key]
	if !ok {
		return []ValidationIssue{validationIssue(path, "INVALID_ROLE_STRUCTURE", path+" is required.")}
	}
	return validatePaletteReference(rawReference, path)
}

func validateVisualReference(value interface{}, path string) []ValidationIssue {
	reference, ok := value.(map[string]interface{})
	if !ok {
		return []ValidationIssue{validationIssue(path, "INVALID_ROLE_STRUCTURE", path+" must be a color reference object.")}
	}
	source, _ := reference["source"].(string)
	switch source {
	case "palette":
		if issues := validatePaletteReference(value, path); len(issues) > 0 {
			return issues
		}
	case "theme":
		token, ok := reference["token"].(string)
		if !ok || !map[string]bool{"foreground": true, "muted_foreground": true, "grid": true, "background": true}[token] {
			return []ValidationIssue{validationIssue(path+".token", "INVALID_COLOR_REFERENCE", "Theme color reference must use an approved token.")}
		}
	default:
		return []ValidationIssue{validationIssue(path+".source", "INVALID_COLOR_REFERENCE", "Color reference source must be palette or theme.")}
	}
	if opacity, exists := reference["opacity"]; exists {
		number, ok := opacity.(float64)
		if !ok || number < 0 || number > 1 {
			return []ValidationIssue{validationIssue(path+".opacity", "INVALID_OPACITY", "Opacity must be between 0 and 1.")}
		}
	}
	return nil
}

func validatePaletteReference(value interface{}, path string) []ValidationIssue {
	reference, ok := value.(map[string]interface{})
	if !ok {
		return []ValidationIssue{validationIssue(path, "INVALID_ROLE_STRUCTURE", path+" must be a color reference object.")}
	}
	if source, _ := reference["source"].(string); source != "palette" {
		return []ValidationIssue{validationIssue(path+".source", "INVALID_COLOR_REFERENCE", "Color reference source must be palette.")}
	}
	colorID, ok := reference["color_id"].(string)
	if !ok || strings.TrimSpace(colorID) == "" {
		return []ValidationIssue{validationIssue(path+".color_id", "COLOR_ID_REQUIRED", "Palette color references must include a non-empty color_id.")}
	}
	if opacity, exists := reference["opacity"]; exists {
		number, ok := opacity.(float64)
		if !ok || number < 0 || number > 1 {
			return []ValidationIssue{validationIssue(path+".opacity", "INVALID_OPACITY", "Opacity must be between 0 and 1.")}
		}
	}
	return nil
}

func requireNonEmptyString(object map[string]interface{}, key string, path string, code string) []ValidationIssue {
	if !nonEmptyString(object[key]) {
		return []ValidationIssue{validationIssue(path, code, path+" must be a non-empty string.")}
	}
	return nil
}

func requireOneOf(object map[string]interface{}, key string, path string, code string, allowed ...string) []ValidationIssue {
	if !oneOfString(object[key], allowed...) {
		return []ValidationIssue{validationIssue(path, code, path+" is not supported.")}
	}
	return nil
}

func requireBoolean(object map[string]interface{}, key string, path string) []ValidationIssue {
	if _, ok := object[key].(bool); !ok {
		return []ValidationIssue{validationIssue(path, "INVALID_PREVIEW_CONFIG", path+" must be a boolean.")}
	}
	return nil
}

func optionalBoolean(object map[string]interface{}, key string, path string) []ValidationIssue {
	if _, exists := object[key]; !exists {
		return nil
	}
	return requireBoolean(object, key, path)
}

func optionalString(object map[string]interface{}, key string, path string, code string) []ValidationIssue {
	if _, exists := object[key]; !exists {
		return nil
	}
	if _, ok := object[key].(string); !ok {
		return []ValidationIssue{validationIssue(path, code, path+" must be a string.")}
	}
	return nil
}

func requireIntegerRange(object map[string]interface{}, key string, path string, min int, max int) []ValidationIssue {
	value, ok := object[key].(float64)
	if !ok || value != float64(int(value)) || int(value) < min || int(value) > max {
		return []ValidationIssue{validationIssue(path, "INVALID_PREVIEW_CONFIG", fmt.Sprintf("%s must be an integer between %d and %d.", path, min, max))}
	}
	return nil
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
