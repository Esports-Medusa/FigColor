package palette

// PublicPaletteDTO is the public palette response shape. Public consumers only
// receive the published primary preview case; draft, archived and secondary
// preview cases remain admin-only.
type PublicPaletteDTO struct {
	Palette
	PrimaryPreviewCase *PublicPalettePreviewCase `json:"primary_preview_case"`
}

type PublicPalettePreviewCase struct {
	ID              string      `json:"id"`
	PaletteID       string      `json:"palette_id"`
	ChartType       string      `json:"chart_type"`
	TemplateID      string      `json:"template_id"`
	TemplateVersion int         `json:"template_version"`
	SchemaVersion   int         `json:"schema_version"`
	ColorRoles      interface{} `json:"color_roles"`
	PreviewConfig   interface{} `json:"preview_config"`
	SeedStrategy    string      `json:"seed_strategy"`
	SeedValue       *int        `json:"seed_value"`
	IsPrimary       bool        `json:"is_primary"`
	Status          string      `json:"status"`
}

func buildPublicPaletteDTO(palette *Palette, previewCases []*PalettePreviewCase) *PublicPaletteDTO {
	if palette == nil {
		return nil
	}

	var primary *PublicPalettePreviewCase
	for _, previewCase := range previewCases {
		if previewCase == nil ||
			previewCase.Status != PreviewCaseStatusPublished ||
			!previewCase.IsPrimary {
			continue
		}

		publicPreviewCase := publicPalettePreviewCaseDTO(previewCase)
		primary = &publicPreviewCase
		break
	}

	return &PublicPaletteDTO{
		Palette:            *palette,
		PrimaryPreviewCase: primary,
	}
}

func publicPalettePreviewCaseDTO(previewCase *PalettePreviewCase) PublicPalettePreviewCase {
	return PublicPalettePreviewCase{
		ID:              previewCase.ID,
		PaletteID:       previewCase.PaletteID,
		ChartType:       previewCase.ChartType,
		TemplateID:      previewCase.TemplateID,
		TemplateVersion: previewCase.TemplateVersion,
		SchemaVersion:   previewCase.SchemaVersion,
		ColorRoles:      previewCase.ColorRoles,
		PreviewConfig:   previewCase.PreviewConfig,
		SeedStrategy:    previewCase.SeedStrategy,
		SeedValue:       previewCase.SeedValue,
		IsPrimary:       previewCase.IsPrimary,
		Status:          previewCase.Status,
	}
}
