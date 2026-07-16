package palette

import (
	"encoding/json"
	"time"
)

const (
	PreviewCaseSeedStrategyStableID = "stable_id"
	PreviewCaseSeedStrategyFixed    = "fixed"

	PreviewCaseStatusDraft     = "draft"
	PreviewCaseStatusPublished = "published"
	PreviewCaseStatusArchived  = "archived"
)

type PalettePreviewCase struct {
	ID              string          `json:"id"`
	PaletteID       string          `json:"palette_id"`
	ChartType       string          `json:"chart_type"`
	TemplateID      string          `json:"template_id"`
	TemplateVersion int             `json:"template_version"`
	SchemaVersion   int             `json:"schema_version"`
	ColorRoles      json.RawMessage `json:"color_roles"`
	PreviewConfig   json.RawMessage `json:"preview_config"`
	SeedStrategy    string          `json:"seed_strategy"`
	SeedValue       *int            `json:"seed_value,omitempty"`
	IsPrimary       bool            `json:"is_primary"`
	Status          string          `json:"status"`
	CreatedAt       time.Time       `json:"created_at"`
	UpdatedAt       time.Time       `json:"updated_at"`
}

type CreatePreviewCaseRequest struct {
	ChartType       string          `json:"chart_type"`
	TemplateID      string          `json:"template_id"`
	TemplateVersion int             `json:"template_version"`
	SchemaVersion   int             `json:"schema_version"`
	ColorRoles      json.RawMessage `json:"color_roles"`
	PreviewConfig   json.RawMessage `json:"preview_config"`
	SeedStrategy    string          `json:"seed_strategy"`
	SeedValue       *int            `json:"seed_value"`
}

type UpdatePreviewCaseRequest struct {
	ChartType       *string         `json:"chart_type,omitempty"`
	TemplateID      *string         `json:"template_id,omitempty"`
	TemplateVersion *int            `json:"template_version,omitempty"`
	SchemaVersion   *int            `json:"schema_version,omitempty"`
	ColorRoles      json.RawMessage `json:"color_roles,omitempty"`
	PreviewConfig   json.RawMessage `json:"preview_config,omitempty"`
	SeedStrategy    *string         `json:"seed_strategy,omitempty"`
	SeedValue       OptionalInt     `json:"seed_value,omitempty"`
}

type OptionalInt struct {
	Present bool
	Null    bool
	Value   int
}

func (o *OptionalInt) UnmarshalJSON(data []byte) error {
	o.Present = true
	if string(data) == "null" {
		o.Null = true
		o.Value = 0
		return nil
	}

	var value int
	if err := json.Unmarshal(data, &value); err != nil {
		return err
	}
	o.Null = false
	o.Value = value
	return nil
}
