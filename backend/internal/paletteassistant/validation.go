package paletteassistant

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"
)

const (
	maximumDraftNameRunes        = 100
	maximumDraftColors           = 64
	maximumSourceNoteRunes       = 500
	maximumApplicabilityRunes    = 1000
	validationAuthorityIssueCode = "VALIDATION_AUTHORITY_INVALID"
)

var (
	canonicalUUID = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)
	canonicalHEX  = regexp.MustCompile(`^#[0-9A-F]{6}$`)
)

type DraftValidationResult struct {
	ValidatedDraft *AssistantDraft
	Issues         []FieldIssue
}

type orderedIssue struct {
	FieldIssue
	order int
}
type draftValidator struct {
	issues    []orderedIssue
	next      int
	authority *generatedRegistry
}

func ValidateAssistantDraft(draft AssistantDraft) DraftValidationResult {
	v := &draftValidator{}
	authority, err := loadGeneratedRegistry()
	if err != nil {
		v.add("", validationAuthorityIssueCode, "Draft validation authority is unavailable.")
	} else {
		v.authority = authority
	}
	v.validateCore(draft)
	v.validatePreviewCases(draft)
	sort.SliceStable(v.issues, func(i, j int) bool {
		if v.issues[i].Path != v.issues[j].Path {
			return v.issues[i].Path < v.issues[j].Path
		}
		if v.issues[i].Code != v.issues[j].Code {
			return v.issues[i].Code < v.issues[j].Code
		}
		return v.issues[i].order < v.issues[j].order
	})
	issues := make([]FieldIssue, len(v.issues))
	for i := range v.issues {
		issues[i] = v.issues[i].FieldIssue
	}
	if len(issues) != 0 {
		return DraftValidationResult{Issues: issues}
	}
	copy := cloneAssistantDraft(draft)
	return DraftValidationResult{ValidatedDraft: &copy, Issues: []FieldIssue{}}
}

func (v *draftValidator) add(path, code, message string) {
	v.issues = append(v.issues, orderedIssue{FieldIssue: FieldIssue{Path: path, Code: code, Message: message}, order: v.next})
	v.next++
}

func (v *draftValidator) validateCore(d AssistantDraft) {
	if d.ContractVersion != ContractVersion {
		v.add("/contract_version", "UNSUPPORTED_CONTRACT_VERSION", "Draft contract version is unsupported.")
	}
	if d.Revision == 0 {
		v.add("/revision", "REVISION_REQUIRED", "Draft revision must be positive.")
	}
	if !containsNonWhitespace(d.Name) {
		v.add("/name", "NAME_REQUIRED", "Name must contain a non-whitespace character.")
	}
	if utf8.RuneCountInString(d.Name) > maximumDraftNameRunes {
		v.add("/name", "NAME_TOO_LONG", "Name must contain at most 100 Unicode code points.")
	}
	if containsControl(d.Name) {
		v.add("/name", "NAME_INVALID", "Name contains unsupported control characters.")
	}
	if !oneOf(d.Type, "categorical", "sequential", "diverging", "mixed") {
		v.add("/type", "INVALID_PALETTE_TYPE", "Palette type is unsupported.")
	}
	if len(d.Colors) == 0 {
		v.add("/colors", "COLORS_REQUIRED", "Draft must contain at least one color.")
	}
	if len(d.Colors) > maximumDraftColors {
		v.add("/colors", "TOO_MANY_COLORS", "Draft may contain at most 64 colors.")
	}
	v.validateColors(d.Colors)
	v.validateApplicability(d.ChartApplicability)
	if v.authority != nil {
		v.validateVocabulary("/disciplines", d.Disciplines, v.authority.Vocabularies.Disciplines)
		v.validateVocabulary("/use_cases", d.UseCases, v.authority.Vocabularies.UseCases)
		v.validateVocabulary("/avoid_cases", d.AvoidCases, v.authority.Vocabularies.AvoidCases)
		v.validateVocabulary("/tags", d.Tags, v.authority.Vocabularies.Tags)
	}
	if d.SourceType != OnlineSourceType {
		v.add("/source_type", "INVALID_SOURCE_TYPE", "Source type must be figure_extracted.")
	}
	if utf8.RuneCountInString(d.SourceNote) > maximumSourceNoteRunes {
		v.add("/source_note", "SOURCE_NOTE_TOO_LONG", "Source note must contain at most 500 Unicode code points.")
	}
	if strings.TrimSpace(d.SourceNote) != d.SourceNote || containsControl(d.SourceNote) {
		v.add("/source_note", "SOURCE_NOTE_INVALID", "Source note contains unsupported whitespace or control characters.")
	}
	v.validateProvenance(d.Provenance)
}

func (v *draftValidator) validateColors(colors []DraftColor) {
	ids, hexes := map[string]int{}, map[string]int{}
	for i, color := range colors {
		base := "/colors/" + strconv.Itoa(i)
		if !canonicalUUID.MatchString(color.ID) {
			v.add(base+"/id", "INVALID_COLOR_ID", "Color ID must be a canonical UUID.")
		}
		if first, ok := ids[color.ID]; ok {
			v.add(base+"/id", "DUPLICATE_COLOR_ID", fmt.Sprintf("Color ID duplicates /colors/%d/id.", first))
		} else {
			ids[color.ID] = i
		}
		if !canonicalHEX.MatchString(color.Hex) {
			v.add(base+"/hex", "INVALID_HEX", "Color HEX must use canonical uppercase #RRGGBB form.")
		}
		if first, ok := hexes[color.Hex]; ok {
			v.add(base+"/hex", "DUPLICATE_HEX", fmt.Sprintf("Color HEX duplicates /colors/%d/hex.", first))
		} else {
			hexes[color.Hex] = i
		}
		if color.Order != i {
			v.add(base+"/order", "INVALID_COLOR_ORDER", "Color order must equal its array position.")
		}
		if !oneOf(string(color.Source), string(SourceAssistant), string(SourceAdmin)) {
			v.add(base+"/source", "INVALID_SUGGESTION_SOURCE", "Color source is unsupported.")
		}
		if !oneOf(string(color.State), string(StateUnconfirmed), string(StateAccepted), string(StateModified)) {
			v.add(base+"/state", "INVALID_SUGGESTION_STATE", "Active color state is unsupported.")
		}
	}
}

func (v *draftValidator) validateApplicability(items []DraftChartApplicability) {
	if len(items) == 0 {
		v.add("/chart_applicability", "APPLICABILITY_REQUIRED", "At least one chart applicability is required.")
	}
	seen := map[string]int{}
	best := 0
	for i, item := range items {
		base := "/chart_applicability/" + strconv.Itoa(i)
		if v.authority != nil && v.authority.chart(item.ChartType) == nil {
			v.add(base+"/chart_type", "UNSUPPORTED_CHART_TYPE", "Chart type is not registered.")
		}
		if first, ok := seen[item.ChartType]; ok {
			v.add(base+"/chart_type", "DUPLICATE_CHART_TYPE", fmt.Sprintf("Chart type duplicates /chart_applicability/%d/chart_type.", first))
		} else {
			seen[item.ChartType] = i
		}
		if !oneOf(item.Suitability, "best_fit", "recommended", "compatible", "limited") {
			v.add(base+"/suitability", "INVALID_SUITABILITY", "Chart suitability is unsupported.")
		}
		if item.Suitability == "best_fit" {
			best++
		}
		if utf8.RuneCountInString(item.Notes) > maximumApplicabilityRunes || containsControl(item.Notes) {
			v.add(base+"/notes", "INVALID_APPLICABILITY_NOTES", "Applicability notes are invalid.")
		}
	}
	if best != 1 {
		v.add("/chart_applicability", "BEST_FIT_CARDINALITY", "Exactly one chart applicability must be best_fit.")
	}
}

func (v *draftValidator) validateVocabulary(path string, values, allowed []string) {
	set := map[string]bool{}
	for _, value := range allowed {
		set[value] = true
	}
	seen := map[string]int{}
	for i, value := range values {
		p := path + "/" + strconv.Itoa(i)
		if !set[value] {
			v.add(p, "UNKNOWN_VOCABULARY_VALUE", "Value is not in the controlled vocabulary.")
		}
		if first, ok := seen[value]; ok {
			v.add(p, "DUPLICATE_VOCABULARY_VALUE", fmt.Sprintf("Value duplicates %s/%d.", path, first))
		} else {
			seen[value] = i
		}
	}
}

func (v *draftValidator) validateProvenance(items []SuggestionProvenance) {
	ambiguityCounts := map[string]int{}
	for _, p := range items {
		if p.AmbiguityGroup != "" {
			ambiguityCounts[p.AmbiguityGroup]++
		}
	}
	for i, p := range items {
		base := "/provenance/" + strconv.Itoa(i)
		if !validJSONPointer(p.Path) {
			v.add(base+"/path", "INVALID_JSON_POINTER", "Provenance path must be an RFC 6901 JSON Pointer.")
		}
		if !oneOf(string(p.Source), string(SourceAssistant), string(SourceAdmin)) {
			v.add(base+"/source", "INVALID_SUGGESTION_SOURCE", "Provenance source is unsupported.")
		}
		if !oneOf(string(p.State), string(StateUnconfirmed), string(StateAccepted), string(StateModified), string(StateCleared)) {
			v.add(base+"/state", "INVALID_SUGGESTION_STATE", "Provenance state is unsupported.")
		}
		if !containsNonWhitespace(p.Producer) {
			v.add(base+"/producer", "PRODUCER_REQUIRED", "Producer is required.")
		}
		if !containsNonWhitespace(p.AlgorithmVersion) {
			v.add(base+"/algorithm_version", "ALGORITHM_VERSION_REQUIRED", "Algorithm version is required.")
		}
		if len(p.ReasonCodes) == 0 {
			v.add(base+"/reason_codes", "REASON_CODES_REQUIRED", "At least one reason code is required.")
		}
		seen := map[string]bool{}
		for j, code := range p.ReasonCodes {
			at := base + "/reason_codes/" + strconv.Itoa(j)
			if !containsNonWhitespace(code) {
				v.add(at, "INVALID_REASON_CODE", "Reason code must be non-empty.")
			}
			if seen[code] {
				v.add(at, "DUPLICATE_REASON_CODE", "Reason code is duplicated.")
			}
			seen[code] = true
		}
		if len(p.SuggestedValue) == 0 || !json.Valid(p.SuggestedValue) {
			v.add(base+"/suggested_value", "INVALID_SUGGESTED_VALUE", "Suggested value must be valid JSON.")
		}
		if containsControl(p.Producer) || containsControl(p.AlgorithmVersion) || containsControl(p.AmbiguityGroup) {
			v.add(base, "INVALID_PROVENANCE_TEXT", "Provenance contains unsupported control characters.")
		}
		if p.AmbiguityGroup != "" && ambiguityCounts[p.AmbiguityGroup] < 2 && !containsAmbiguityReason(p.ReasonCodes) {
			v.add(base+"/ambiguity_group", "INVALID_AMBIGUITY_GROUP", "Ambiguity group must identify alternatives or carry an ambiguity reason.")
		}
	}
}

func (v *draftValidator) validatePreviewCases(d AssistantDraft) {
	if len(d.PreviewCases) > 1 {
		v.add("/preview_cases", "TOO_MANY_PREVIEW_CASES", "Draft supports at most one Preview Case.")
	}
	colorIDs := map[string]bool{}
	for _, c := range d.Colors {
		if canonicalUUID.MatchString(c.ID) {
			colorIDs[c.ID] = true
		}
	}
	applicable := map[string]bool{}
	for _, a := range d.ChartApplicability {
		applicable[a.ChartType] = true
	}
	for i, p := range d.PreviewCases {
		base := "/preview_cases/" + strconv.Itoa(i)
		if !applicable[p.ChartType] {
			v.add(base+"/chart_type", "PREVIEW_CHART_NOT_APPLICABLE", "Preview chart type is absent from Draft applicability.")
		}
		if v.authority == nil {
			continue
		}
		chart := v.authority.chart(p.ChartType)
		if chart == nil {
			v.add(base+"/chart_type", "UNSUPPORTED_CHART_TYPE", "Preview chart type is not registered.")
			continue
		}
		template, owner := v.authority.template(p.TemplateID)
		if template == nil {
			v.add(base+"/template_id", "UNKNOWN_TEMPLATE_ID", "Preview template is unknown.")
			continue
		}
		if owner.ChartType != p.ChartType {
			v.add(base+"/template_id", "TEMPLATE_CHART_TYPE_MISMATCH", "Preview template belongs to another chart type.")
		}
		if p.TemplateVersion != template.TemplateVersion {
			v.add(base+"/template_version", "UNSUPPORTED_TEMPLATE_VERSION", "Preview template version is unsupported.")
		}
		if p.SchemaVersion != template.SchemaVersion {
			v.add(base+"/schema_version", "UNSUPPORTED_SCHEMA_VERSION", "Preview schema version is unsupported.")
		}
		roles, rolesOK := v.decodeObject(p.ColorRoles, base+"/color_roles")
		config, configOK := v.decodeObject(p.PreviewConfig, base+"/preview_config")
		if rolesOK {
			refs, err := v.validateSchema(roles, template.RolesSchema, base+"/color_roles", "INVALID_COLOR_ROLES")
			if err != nil {
				v.add(base+"/color_roles", validationAuthorityIssueCode, "Preview validation authority is unavailable.")
			} else {
				for _, ref := range refs {
					if !canonicalUUID.MatchString(ref.id) || !colorIDs[ref.id] {
						v.add(ref.path, "UNKNOWN_DRAFT_COLOR_REFERENCE", "Palette reference must use an existing Draft color UUID.")
					}
				}
			}
		}
		if configOK {
			if _, err := v.validateSchema(config, template.ConfigSchema, base+"/preview_config", "INVALID_PREVIEW_CONFIG"); err != nil {
				v.add(base+"/preview_config", validationAuthorityIssueCode, "Preview validation authority is unavailable.")
			}
		}
		switch p.SeedStrategy {
		case "stable_id":
			if p.SeedValue != nil {
				v.add(base+"/seed_value", "STABLE_SEED_VALUE_FORBIDDEN", "stable_id seed_value must be omitted.")
			}
		case "fixed":
			if p.SeedValue == nil {
				v.add(base+"/seed_value", "FIXED_SEED_VALUE_REQUIRED", "fixed seed_value is required.")
			} else if int64(*p.SeedValue) < math.MinInt32 || int64(*p.SeedValue) > math.MaxInt32 {
				v.add(base+"/seed_value", "FIXED_SEED_OUT_OF_RANGE", "fixed seed_value must be a signed 32-bit integer.")
			}
		default:
			v.add(base+"/seed_strategy", "INVALID_SEED_STRATEGY", "Preview seed strategy is unsupported.")
		}
	}
}

func (v *draftValidator) decodeObject(raw json.RawMessage, path string) (map[string]any, bool) {
	if len(raw) == 0 || len(raw) > PreviewJSONByteLimit {
		code := "INVALID_JSON_OBJECT"
		if len(raw) > PreviewJSONByteLimit {
			code = "JSON_OBJECT_TOO_LARGE"
		}
		v.add(path, code, "Preview value must be a non-null JSON object within the size limit.")
		return nil, false
	}
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.UseNumber()
	var value any
	if dec.Decode(&value) != nil {
		v.add(path, "INVALID_JSON_OBJECT", "Preview value must be a valid JSON object.")
		return nil, false
	}
	if err := dec.Decode(new(any)); err != io.EOF {
		v.add(path, "INVALID_JSON_OBJECT", "Preview value must contain exactly one JSON object.")
		return nil, false
	}
	object, ok := value.(map[string]any)
	if !ok {
		v.add(path, "INVALID_JSON_OBJECT", "Preview value must be a non-null JSON object.")
		return nil, false
	}
	return object, true
}

type generatedRegistry struct {
	ProjectionFormatVersion int              `json:"projection_format_version"`
	Charts                  []generatedChart `json:"charts"`
	Vocabularies            struct {
		Disciplines []string `json:"disciplines"`
		UseCases    []string `json:"use_cases"`
		AvoidCases  []string `json:"avoid_cases"`
		Tags        []string `json:"tags"`
	} `json:"vocabularies"`
}
type generatedChart struct {
	ChartType string              `json:"chart_type"`
	Templates []generatedTemplate `json:"templates"`
}
type generatedTemplate struct {
	TemplateID      string     `json:"template_id"`
	TemplateVersion int        `json:"template_version"`
	SchemaVersion   int        `json:"schema_version"`
	RolesSchema     schemaNode `json:"roles_schema"`
	ConfigSchema    schemaNode `json:"config_schema"`
}
type schemaField struct {
	Required bool       `json:"required"`
	Schema   schemaNode `json:"schema"`
}
type schemaRule struct {
	Kind               string         `json:"kind"`
	Field              string         `json:"field"`
	IssueCode          string         `json:"issueCode"`
	ArrayField         string         `json:"arrayField"`
	DiscriminatorField string         `json:"discriminatorField"`
	Cases              map[string]int `json:"cases"`
}
type schemaNode struct {
	Kind           string                 `json:"kind"`
	Exact          *bool                  `json:"exact"`
	Fields         map[string]schemaField `json:"fields"`
	Items          *schemaNode            `json:"items"`
	MinItems       *int                   `json:"minItems"`
	MaxItems       *int                   `json:"maxItems"`
	Rules          []schemaRule           `json:"rules"`
	NonWhitespace  bool                   `json:"nonWhitespace"`
	Enum           []string               `json:"enum"`
	Integer        bool                   `json:"integer"`
	Min            *float64               `json:"min"`
	Max            *float64               `json:"max"`
	ThemeTokens    []string               `json:"themeTokens"`
	UnknownMembers string                 `json:"unknownMembers"`
}

func loadGeneratedRegistry() (*generatedRegistry, error) {
	var r generatedRegistry
	digest := sha256.Sum256([]byte(previewRegistryProjectionJSON))
	if json.Unmarshal([]byte(previewRegistryProjectionJSON), &r) != nil || r.ProjectionFormatVersion != PreviewRegistryProjectionFormatVersion || len(r.Charts) != 6 || hex.EncodeToString(digest[:]) != PreviewRegistryFingerprint {
		return nil, fmt.Errorf("invalid authority")
	}
	seenC, seenT := map[string]bool{}, map[string]bool{}
	for _, c := range r.Charts {
		if c.ChartType == "" || seenC[c.ChartType] || len(c.Templates) == 0 {
			return nil, fmt.Errorf("invalid chart")
		}
		seenC[c.ChartType] = true
		for _, t := range c.Templates {
			if t.TemplateID == "" || seenT[t.TemplateID] || validateAuthorityNode(t.RolesSchema) != nil || validateAuthorityNode(t.ConfigSchema) != nil {
				return nil, fmt.Errorf("invalid template")
			}
			seenT[t.TemplateID] = true
		}
	}
	return &r, nil
}
func (r *generatedRegistry) chart(id string) *generatedChart {
	for i := range r.Charts {
		if r.Charts[i].ChartType == id {
			return &r.Charts[i]
		}
	}
	return nil
}
func (r *generatedRegistry) template(id string) (*generatedTemplate, *generatedChart) {
	for i := range r.Charts {
		for j := range r.Charts[i].Templates {
			if r.Charts[i].Templates[j].TemplateID == id {
				return &r.Charts[i].Templates[j], &r.Charts[i]
			}
		}
	}
	return nil, nil
}

func validateAuthorityNode(n schemaNode) error {
	switch n.Kind {
	case "object":
		if n.Exact == nil || n.Fields == nil {
			return fmt.Errorf("object")
		}
		for _, f := range n.Fields {
			if validateAuthorityNode(f.Schema) != nil {
				return fmt.Errorf("field")
			}
		}
		for _, r := range n.Rules {
			if r.Kind != "conditional_min_items" || r.ArrayField == "" || r.DiscriminatorField == "" || len(r.Cases) == 0 {
				return fmt.Errorf("rule")
			}
		}
	case "array":
		if n.Items == nil || (n.MinItems != nil && *n.MinItems < 0) || (n.MaxItems != nil && *n.MaxItems < 0) || (n.MinItems != nil && n.MaxItems != nil && *n.MinItems > *n.MaxItems) {
			return fmt.Errorf("array")
		}
		if validateAuthorityNode(*n.Items) != nil {
			return fmt.Errorf("items")
		}
		for _, r := range n.Rules {
			if !oneOf(r.Kind, "unique_by", "strictly_increasing") || r.Field == "" {
				return fmt.Errorf("rule")
			}
		}
	case "string":
	case "number":
		if n.Min != nil && n.Max != nil && *n.Min > *n.Max {
			return fmt.Errorf("range")
		}
	case "boolean":
	case "palette_reference":
		if !oneOf(n.UnknownMembers, "allow", "reject") {
			return fmt.Errorf("reference")
		}
	case "visual_reference":
		if !oneOf(n.UnknownMembers, "allow", "reject") || len(n.ThemeTokens) == 0 {
			return fmt.Errorf("visual")
		}
	default:
		return fmt.Errorf("kind")
	}
	return nil
}

type paletteRef struct{ id, path string }

func (v *draftValidator) validateSchema(value any, n schemaNode, path, code string) ([]paletteRef, error) {
	refs := []paletteRef{}
	if err := validateAuthorityNode(n); err != nil {
		return nil, err
	}
	switch n.Kind {
	case "object":
		obj, ok := value.(map[string]any)
		if !ok {
			v.add(path, code, "Value must be an object.")
			return refs, nil
		}
		if *n.Exact {
			keys := make([]string, 0, len(obj))
			for key := range obj {
				keys = append(keys, key)
			}
			sort.Strings(keys)
			for _, key := range keys {
				if _, ok := n.Fields[key]; !ok {
					v.add(path+"/"+escapePointer(key), code, "Member is not supported.")
				}
			}
		}
		fieldNames := make([]string, 0, len(n.Fields))
		for key := range n.Fields {
			fieldNames = append(fieldNames, key)
		}
		sort.Strings(fieldNames)
		for _, key := range fieldNames {
			field := n.Fields[key]
			child, ok := obj[key]
			if !ok || child == nil {
				if field.Required {
					v.add(path+"/"+escapePointer(key), code, "Required member is missing.")
				}
				continue
			}
			nested, err := v.validateSchema(child, field.Schema, path+"/"+escapePointer(key), code)
			if err != nil {
				return nil, err
			}
			refs = append(refs, nested...)
		}
		for _, rule := range n.Rules {
			array, _ := obj[rule.ArrayField].([]any)
			discriminator, _ := obj[rule.DiscriminatorField].(string)
			if minimum, ok := rule.Cases[discriminator]; ok && len(array) < minimum {
				v.add(path+"/"+escapePointer(rule.ArrayField), code, "Array does not meet the conditional minimum.")
			}
		}
	case "array":
		items, ok := value.([]any)
		if !ok {
			v.add(path, code, "Value must be an array.")
			return refs, nil
		}
		if n.MinItems != nil && len(items) < *n.MinItems || n.MaxItems != nil && len(items) > *n.MaxItems {
			v.add(path, code, "Array cardinality is invalid.")
		}
		for i, item := range items {
			nested, err := v.validateSchema(item, *n.Items, path+"/"+strconv.Itoa(i), code)
			if err != nil {
				return nil, err
			}
			refs = append(refs, nested...)
		}
		for _, rule := range n.Rules {
			seen := map[string]bool{}
			var previous float64
			have := false
			for i, item := range items {
				obj, _ := item.(map[string]any)
				switch rule.Kind {
				case "unique_by":
					key := scalarKey(obj[rule.Field])
					if key != "" && seen[key] {
						issueCode := code
						if rule.IssueCode != "" {
							issueCode = rule.IssueCode
						}
						v.add(path+"/"+strconv.Itoa(i)+"/"+escapePointer(rule.Field), issueCode, "Value must be unique.")
					}
					if key != "" {
						seen[key] = true
					}
				case "strictly_increasing":
					current, ok := numberValue(obj[rule.Field])
					if ok && have && current <= previous {
						v.add(path+"/"+strconv.Itoa(i)+"/"+escapePointer(rule.Field), code, "Value must be greater than the previous value.")
					}
					if ok {
						previous = current
						have = true
					}
				}
			}
		}
	case "string":
		s, ok := value.(string)
		if !ok {
			v.add(path, code, "Value must be a string.")
		} else if n.NonWhitespace && !containsNonWhitespace(s) {
			v.add(path, code, "Value must be non-empty.")
		} else if len(n.Enum) > 0 && !contains(n.Enum, s) {
			v.add(path, code, "Value is outside the allowed enum.")
		}
	case "number":
		number, ok := numberValue(value)
		if !ok || n.Integer && math.Trunc(number) != number {
			v.add(path, code, "Value must be a valid number.")
		} else if n.Min != nil && number < *n.Min || n.Max != nil && number > *n.Max {
			v.add(path, code, "Number is outside the allowed range.")
		}
	case "boolean":
		if _, ok := value.(bool); !ok {
			v.add(path, code, "Value must be a boolean.")
		}
	case "palette_reference":
		ref, issues := v.validateReference(value, n, path, code, false)
		refs = append(refs, ref...)
		_ = issues
	case "visual_reference":
		ref, issues := v.validateReference(value, n, path, code, true)
		refs = append(refs, ref...)
		_ = issues
	}
	return refs, nil
}

func (v *draftValidator) validateReference(value any, n schemaNode, path, code string, themeAllowed bool) ([]paletteRef, int) {
	obj, ok := value.(map[string]any)
	if !ok {
		v.add(path, code, "Value must be a color reference.")
		return nil, 1
	}
	source, _ := obj["source"].(string)
	if source == "palette" {
		id, _ := obj["color_id"].(string)
		if !containsNonWhitespace(id) {
			v.add(path, code, "Palette reference requires color_id.")
			return nil, 1
		}
		if n.UnknownMembers == "reject" {
			v.rejectReferenceUnknown(obj, []string{"source", "color_id", "opacity"}, path, code)
		}
		v.validateOpacity(obj, path, code)
		return []paletteRef{{id: id, path: path + "/color_id"}}, 0
	}
	if themeAllowed && source == "theme" {
		token, _ := obj["token"].(string)
		if !contains(n.ThemeTokens, token) {
			v.add(path, code, "Theme token is unsupported.")
			return nil, 1
		}
		if n.UnknownMembers == "reject" {
			v.rejectReferenceUnknown(obj, []string{"source", "token", "opacity"}, path, code)
		}
		v.validateOpacity(obj, path, code)
		return nil, 0
	}
	v.add(path, code, "Color reference source is unsupported.")
	return nil, 1
}
func (v *draftValidator) rejectReferenceUnknown(obj map[string]any, allowed []string, path, code string) {
	set := map[string]bool{}
	for _, k := range allowed {
		set[k] = true
	}
	keys := make([]string, 0, len(obj))
	for k := range obj {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		if !set[k] {
			v.add(path+"/"+escapePointer(k), code, "Reference member is unsupported.")
		}
	}
}
func (v *draftValidator) validateOpacity(obj map[string]any, path, code string) {
	if raw, ok := obj["opacity"]; ok {
		number, valid := numberValue(raw)
		if !valid || number < 0 || number > 1 {
			v.add(path+"/opacity", code, "Opacity must be between 0 and 1.")
		}
	}
}

func cloneAssistantDraft(d AssistantDraft) AssistantDraft {
	out := d
	out.Colors = cloneSlice(d.Colors)
	out.ChartApplicability = cloneSlice(d.ChartApplicability)
	out.Disciplines = cloneSlice(d.Disciplines)
	out.UseCases = cloneSlice(d.UseCases)
	out.AvoidCases = cloneSlice(d.AvoidCases)
	out.Tags = cloneSlice(d.Tags)
	out.PreviewCases = cloneSlice(d.PreviewCases)
	for i := range out.PreviewCases {
		out.PreviewCases[i].ColorRoles = cloneSlice(d.PreviewCases[i].ColorRoles)
		out.PreviewCases[i].PreviewConfig = cloneSlice(d.PreviewCases[i].PreviewConfig)
		if d.PreviewCases[i].SeedValue != nil {
			x := *d.PreviewCases[i].SeedValue
			out.PreviewCases[i].SeedValue = &x
		}
	}
	out.Provenance = cloneSlice(d.Provenance)
	for i := range out.Provenance {
		out.Provenance[i].ReasonCodes = cloneSlice(d.Provenance[i].ReasonCodes)
		out.Provenance[i].SuggestedValue = cloneSlice(d.Provenance[i].SuggestedValue)
	}
	return out
}

func cloneSlice[T any](values []T) []T {
	if values == nil {
		return nil
	}
	out := make([]T, len(values))
	copy(out, values)
	return out
}
func oneOf(value string, allowed ...string) bool {
	for _, candidate := range allowed {
		if value == candidate {
			return true
		}
	}
	return false
}
func contains(values []string, value string) bool {
	for _, candidate := range values {
		if candidate == value {
			return true
		}
	}
	return false
}
func containsNonWhitespace(value string) bool {
	for _, r := range value {
		if !unicode.IsSpace(r) {
			return true
		}
	}
	return false
}
func containsControl(value string) bool {
	for _, r := range value {
		if unicode.IsControl(r) {
			return true
		}
	}
	return false
}
func validJSONPointer(value string) bool {
	if value == "" {
		return true
	}
	if !strings.HasPrefix(value, "/") {
		return false
	}
	for i := 0; i < len(value); i++ {
		if value[i] == '~' && (i+1 >= len(value) || (value[i+1] != '0' && value[i+1] != '1')) {
			return false
		} else if value[i] == '~' {
			i++
		}
	}
	return true
}
func containsAmbiguityReason(values []string) bool {
	for _, value := range values {
		if strings.Contains(value, "AMBIGU") {
			return true
		}
	}
	return false
}
func escapePointer(value string) string {
	return strings.ReplaceAll(strings.ReplaceAll(value, "~", "~0"), "/", "~1")
}
func scalarKey(value any) string {
	switch x := value.(type) {
	case string:
		return "s:" + x
	case json.Number:
		return "n:" + x.String()
	case float64:
		return "n:" + strconv.FormatFloat(x, 'g', -1, 64)
	}
	return ""
}
func numberValue(value any) (float64, bool) {
	switch x := value.(type) {
	case json.Number:
		n, err := x.Float64()
		return n, err == nil && !math.IsNaN(n) && !math.IsInf(n, 0)
	case float64:
		return x, !math.IsNaN(x) && !math.IsInf(x, 0)
	case int:
		return float64(x), true
	}
	return 0, false
}
