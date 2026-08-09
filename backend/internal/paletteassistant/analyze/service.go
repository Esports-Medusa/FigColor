package analyze

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/google/uuid"
	figjcs "github.com/qiqi/figcolor/backend/internal/jcs"
	"github.com/qiqi/figcolor/backend/internal/paletteassistant"
	"github.com/qiqi/figcolor/backend/internal/paletteassistant/imageanalysis"
	"github.com/qiqi/figcolor/backend/internal/paletteassistant/palettesuggestion"
)

var errProjection = errors.New("analyze projection failed")

var draftColorNamespace = uuid.MustParse("b8264e96-9bca-4f49-a795-12397ba69e22")

type imageAnalyzer interface {
	Analyze(context.Context, []byte, string) (imageanalysis.Result, error)
}

type paletteSuggester interface {
	Suggest(context.Context, imageanalysis.Result) (palettesuggestion.Result, error)
}

type Service struct {
	analyzer  imageAnalyzer
	suggester paletteSuggester
	newID     func() string
}

func NewService() *Service {
	return &Service{analyzer: imageanalysis.New(), suggester: palettesuggestion.New(), newID: uuid.NewString}
}

func (s *Service) Analyze(ctx context.Context, encoded []byte, declaredMIME string) (paletteassistant.AnalyzeResponse, error) {
	if s == nil || s.analyzer == nil || s.suggester == nil || s.newID == nil {
		return paletteassistant.AnalyzeResponse{}, errProjection
	}
	analysis, err := s.analyzer.Analyze(ctx, encoded, declaredMIME)
	if err != nil {
		return paletteassistant.AnalyzeResponse{}, err
	}
	suggestion, err := s.suggester.Suggest(ctx, analysis)
	if err != nil {
		return paletteassistant.AnalyzeResponse{}, err
	}
	return assembleResponse(analysis, suggestion, s.newID())
}

type warningDefinition struct {
	message  string
	policy   string
	producer string
}

var imageWarningCatalog = map[string]warningDefinition{
	imageanalysis.WarningTransparency: {
		message:  "Transparency was composited onto white before analysis.",
		policy:   imageanalysis.AlgorithmVersion,
		producer: "imageanalysis",
	},
	imageanalysis.WarningNoUsableDataColor: {
		message:  "No usable data color was detected.",
		policy:   imageanalysis.AlgorithmVersion,
		producer: "imageanalysis",
	},
}

var suggestionWarningCatalog = map[string]warningDefinition{
	palettesuggestion.WarningHeuristic: {
		message:  "Assistant suggestions are heuristic and require Admin review.",
		policy:   palettesuggestion.PolicyVersion,
		producer: "palettesuggestion",
	},
	palettesuggestion.WarningNoUsable: {
		message:  "No usable data color was available for the seeded Draft.",
		policy:   palettesuggestion.PolicyVersion,
		producer: "palettesuggestion",
	},
	palettesuggestion.WarningInsufficient: {
		message:  "Fewer than two usable data colors were available.",
		policy:   palettesuggestion.PolicyVersion,
		producer: "palettesuggestion",
	},
	palettesuggestion.WarningTruncated: {
		message:  "Usable data colors were limited to the first 12 suggestions.",
		policy:   palettesuggestion.PolicyVersion,
		producer: "palettesuggestion",
	},
}

func assembleResponse(analysis imageanalysis.Result, suggestion palettesuggestion.Result, analysisID string) (paletteassistant.AnalyzeResponse, error) {
	if _, err := uuid.Parse(analysisID); err != nil || suggestion.SourceAnalyzerVersion != analysis.Evidence.AlgorithmVersion {
		return paletteassistant.AnalyzeResponse{}, errProjection
	}
	warnings, err := projectWarnings(analysis.Evidence.Warnings, suggestion.Warnings)
	if err != nil {
		return paletteassistant.AnalyzeResponse{}, err
	}
	draft, err := projectDraft(analysis, suggestion)
	if err != nil {
		return paletteassistant.AnalyzeResponse{}, err
	}
	return paletteassistant.AnalyzeResponse{
		ContractVersion:  paletteassistant.ContractVersion,
		AnalysisID:       analysisID,
		Image:            analysis.Image,
		ColorSuggestions: append([]paletteassistant.ColorSuggestion(nil), analysis.ColorSuggestions...),
		StructuralColors: append([]paletteassistant.ColorSuggestion(nil), analysis.StructuralColors...),
		Draft:            draft,
		Warnings:         warnings,
		AlgorithmVersion: analysis.Evidence.AlgorithmVersion,
	}, nil
}

func projectWarnings(imageWarnings, suggestionWarnings []string) ([]paletteassistant.WarningFinding, error) {
	out := make([]paletteassistant.WarningFinding, 0, len(imageWarnings)+len(suggestionWarnings))
	for _, source := range []struct {
		warnings []string
		catalog  map[string]warningDefinition
	}{{imageWarnings, imageWarningCatalog}, {suggestionWarnings, suggestionWarningCatalog}} {
		for _, code := range source.warnings {
			definition, ok := source.catalog[code]
			if !ok {
				return nil, errProjection
			}
			finding, err := projectWarning(code, definition)
			if err != nil {
				return nil, err
			}
			out = append(out, finding)
		}
	}
	return out, nil
}

func projectWarning(code string, definition warningDefinition) (paletteassistant.WarningFinding, error) {
	params, err := json.Marshal(struct {
		Producer string `json:"producer"`
	}{definition.producer})
	if err != nil {
		return paletteassistant.WarningFinding{}, errProjection
	}
	preimage, err := json.Marshal(struct {
		Kind      string          `json:"kind"`
		Code      string          `json:"code"`
		Path      string          `json:"path"`
		PaletteID string          `json:"palette_id"`
		Policy    string          `json:"policy"`
		Params    json.RawMessage `json:"params"`
	}{"analyze_warning", code, "", "", definition.policy, params})
	if err != nil {
		return paletteassistant.WarningFinding{}, errProjection
	}
	_, id, err := figjcs.Hash(preimage)
	if err != nil {
		return paletteassistant.WarningFinding{}, errProjection
	}
	return paletteassistant.WarningFinding{ID: id, Code: code, Message: definition.message, Policy: definition.policy, Params: params}, nil
}

func projectDraft(analysis imageanalysis.Result, suggestion palettesuggestion.Result) (paletteassistant.AssistantDraft, error) {
	colors, err := projectDraftColors(suggestion.SourceAnalyzerVersion, analysis.Image.SHA256, suggestion.SelectedColors)
	if err != nil {
		return paletteassistant.AssistantDraft{}, err
	}
	draft := paletteassistant.AssistantDraft{
		ContractVersion:    paletteassistant.ContractVersion,
		Revision:           1,
		Colors:             colors,
		ChartApplicability: []paletteassistant.DraftChartApplicability{},
		Disciplines:        []string{},
		UseCases:           []string{},
		AvoidCases:         []string{},
		Tags:               []string{},
		SourceType:         paletteassistant.OnlineSourceType,
		PreviewCases:       []paletteassistant.DraftPreviewCase{},
		Provenance:         []paletteassistant.SuggestionProvenance{},
	}
	if suggestion.PaletteType == nil {
		return draft, nil
	}
	rawValue, err := json.Marshal(suggestion.PaletteType.Value)
	if err != nil {
		return paletteassistant.AssistantDraft{}, errProjection
	}
	draft.Type = suggestion.PaletteType.Value
	draft.Provenance = append(draft.Provenance, paletteassistant.SuggestionProvenance{
		Path:             "/type",
		Source:           paletteassistant.SourceAssistant,
		State:            paletteassistant.StateUnconfirmed,
		Producer:         suggestion.PaletteType.Producer,
		AlgorithmVersion: suggestion.PaletteType.AlgorithmVersion,
		ReasonCodes:      append([]string(nil), suggestion.PaletteType.ReasonCodes...),
		SuggestedValue:   rawValue,
	})
	return draft, nil
}

func projectDraftColors(algorithmVersion, imageSHA256 string, selected []palettesuggestion.SuggestedColor) ([]paletteassistant.DraftColor, error) {
	colors := make([]paletteassistant.DraftColor, 0, len(selected))
	occurrences := make(map[string]int, len(selected))
	for order, source := range selected {
		occurrence := occurrences[source.Hex]
		id, err := draftColorID(algorithmVersion, imageSHA256, source.Hex, occurrence)
		if err != nil {
			return nil, err
		}
		colors = append(colors, paletteassistant.DraftColor{ID: id, Hex: source.Hex, Order: order, Source: paletteassistant.SourceAssistant, State: paletteassistant.StateUnconfirmed})
		occurrences[source.Hex] = occurrence + 1
	}
	return colors, nil
}

func draftColorID(algorithmVersion, imageSHA256, normalizedHex string, occurrence int) (string, error) {
	name, err := json.Marshal(struct {
		AlgorithmVersion string `json:"algorithm_version"`
		ImageSHA256      string `json:"image_sha256"`
		NormalizedHex    string `json:"normalized_hex"`
		OccurrenceIndex  int    `json:"occurrence_index"`
	}{algorithmVersion, imageSHA256, normalizedHex, occurrence})
	if err != nil {
		return "", errProjection
	}
	canonical, err := figjcs.Canonicalize(name)
	if err != nil {
		return "", errProjection
	}
	return uuid.NewSHA1(draftColorNamespace, canonical).String(), nil
}
