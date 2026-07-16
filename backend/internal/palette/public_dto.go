package palette

// PublicPaletteDTO is the public palette response shape. The primary preview
// case is also included in preview_cases so clients can either access it
// directly or preserve repository order for future multi-preview surfaces.
type PublicPaletteDTO struct {
	Palette
	PrimaryPreviewCase *PublicPalettePreviewCase  `json:"primary_preview_case"`
	PreviewCases       []PublicPalettePreviewCase `json:"preview_cases"`
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

	publicPreviewCases := make([]PublicPalettePreviewCase, 0, len(previewCases))
	var primary *PublicPalettePreviewCase
	for _, previewCase := range previewCases {
		if previewCase == nil || previewCase.Status != PreviewCaseStatusPublished {
			continue
		}

		publicPreviewCase := publicPalettePreviewCaseDTO(previewCase)
		publicPreviewCases = append(publicPreviewCases, publicPreviewCase)
		if publicPreviewCase.IsPrimary && primary == nil {
			primary = &publicPreviewCases[len(publicPreviewCases)-1]
		}
	}

	return &PublicPaletteDTO{
		Palette:            *palette,
		PrimaryPreviewCase: primary,
		PreviewCases:       publicPreviewCases,
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
