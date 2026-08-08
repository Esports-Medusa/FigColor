package palette

import (
	"encoding/json"
	"errors"
	"fmt"
)

// ErrCandidateAggregateInput marks an invalid already-canonical aggregate.
// Entry adapters remain responsible for their transport/provenance validation.
var ErrCandidateAggregateInput = errors.New("invalid candidate aggregate input")

// CandidateAggregateInput contains only canonical persistence data shared by
// Candidate entry paths. The caller has already resolved color identities and
// Preview Case references according to its trusted entry-specific rules.
type CandidateAggregateInput struct {
	Palette      CandidatePaletteInput
	PreviewCases []CreatePreviewCaseRequest
	ActorUserID  string
}

// CandidatePaletteInput excludes server-owned lifecycle and ownership fields.
// CandidateAggregateService supplies those invariants through the existing
// Candidate repository primitive.
type CandidatePaletteInput struct {
	Name               string
	Slug               string
	Colors             json.RawMessage
	ColorCount         int
	Type               string
	ChartTypes         []string
	ChartApplicability OptionalChartApplicability
	JournalStyle       []string
	Discipline         []string
	UseCase            []string
	AvoidCase          []string
	Tags               []string
	Accessibility      *Accessibility
	SourceType         string
	SourceImage        string
	SourceNote         string
	Version            string
}

type CandidateAggregateResult struct {
	PaletteID      string
	Slug           string
	PreviewCaseIDs []string
}

// CandidateAggregateTx is a caller-owned transaction writer. It deliberately
// has no Commit or Rollback method: CandidateAggregateService writes the shared
// aggregate, while the entry adapter owns the wider transaction lifecycle.
type CandidateAggregateTx interface {
	CreateCandidate(*CreatePaletteRequest, string) (*Palette, error)
	CreatePreview(string, *CreatePreviewCaseRequest) (*PalettePreviewCase, error)
}

// CandidateAggregateService is the single production orchestration for
// persisting a Candidate Palette and its required draft Preview Cases.
type CandidateAggregateService struct{}

func NewCandidateAggregateService() *CandidateAggregateService {
	return &CandidateAggregateService{}
}

func (s *CandidateAggregateService) Create(tx CandidateAggregateTx, input CandidateAggregateInput) (*CandidateAggregateResult, error) {
	if tx == nil {
		return nil, fmt.Errorf("%w: transaction writer is required", ErrCandidateAggregateInput)
	}
	canonical, err := validateAndCloneCandidateAggregate(input)
	if err != nil {
		return nil, err
	}
	request := createPaletteRequestFromCandidateInput(canonical.Palette)
	created, err := tx.CreateCandidate(&request, canonical.ActorUserID)
	if err != nil {
		return nil, err
	}
	if created == nil || created.ID == "" {
		return nil, fmt.Errorf("%w: Candidate persistence returned no Palette identity", ErrCandidateAggregateInput)
	}
	result := &CandidateAggregateResult{PaletteID: created.ID, Slug: created.Slug, PreviewCaseIDs: make([]string, 0, len(canonical.PreviewCases))}
	for i := range canonical.PreviewCases {
		preview, createErr := tx.CreatePreview(created.ID, &canonical.PreviewCases[i])
		if createErr != nil {
			return nil, createErr
		}
		if preview == nil || preview.ID == "" {
			return nil, fmt.Errorf("%w: Preview Case persistence returned no identity", ErrCandidateAggregateInput)
		}
		result.PreviewCaseIDs = append(result.PreviewCaseIDs, preview.ID)
	}
	return result, nil
}

func validateAndCloneCandidateAggregate(input CandidateAggregateInput) (*CandidateAggregateInput, error) {
	if input.ActorUserID == "" {
		return nil, fmt.Errorf("%w: actor is required", ErrCandidateAggregateInput)
	}
	var colors []PaletteColor
	if err := json.Unmarshal(input.Palette.Colors, &colors); err != nil || len(colors) == 0 || input.Palette.ColorCount != len(colors) {
		return nil, fmt.Errorf("%w: canonical colors are required", ErrCandidateAggregateInput)
	}
	seen := make(map[string]bool, len(colors))
	for i, color := range colors {
		if color.ID == "" || seen[color.ID] || color.Order != i || NormalizeHex(color.Hex) != color.Hex || HexToRGB(color.Hex) != color.RGB {
			return nil, fmt.Errorf("%w: canonical color identity, value, or order is invalid", ErrCandidateAggregateInput)
		}
		seen[color.ID] = true
	}
	paletteModel := &Palette{Colors: append(json.RawMessage(nil), input.Palette.Colors...)}
	cloned := CandidateAggregateInput{Palette: cloneCandidatePaletteInput(input.Palette), PreviewCases: make([]CreatePreviewCaseRequest, len(input.PreviewCases)), ActorUserID: input.ActorUserID}
	for i := range input.PreviewCases {
		preview := clonePreviewRequest(input.PreviewCases[i])
		if err := validateCreatePreviewCaseRequest(&preview); err != nil {
			return nil, err
		}
		candidate := previewCaseCandidateFromCreate("", &preview)
		if err := (&Service{}).validatePreviewCaseCandidate(paletteModel, candidate); err != nil {
			return nil, err
		}
		cloned.PreviewCases[i] = preview
	}
	return &cloned, nil
}

func cloneCandidatePaletteInput(input CandidatePaletteInput) CandidatePaletteInput {
	output := input
	output.Colors = append(json.RawMessage(nil), input.Colors...)
	output.ChartTypes = append([]string(nil), input.ChartTypes...)
	output.ChartApplicability.Raw = append(json.RawMessage(nil), input.ChartApplicability.Raw...)
	output.ChartApplicability.Value = append([]ChartTypeApplicability(nil), input.ChartApplicability.Value...)
	output.JournalStyle = append([]string(nil), input.JournalStyle...)
	output.Discipline = append([]string(nil), input.Discipline...)
	output.UseCase = append([]string(nil), input.UseCase...)
	output.AvoidCase = append([]string(nil), input.AvoidCase...)
	output.Tags = append([]string(nil), input.Tags...)
	if input.Accessibility != nil {
		copy := *input.Accessibility
		output.Accessibility = &copy
	}
	return output
}

func createPaletteRequestFromCandidateInput(input CandidatePaletteInput) CreatePaletteRequest {
	return CreatePaletteRequest{
		Name: input.Name, Slug: input.Slug, Colors: input.Colors, ColorCount: input.ColorCount, Type: input.Type,
		ChartTypes: input.ChartTypes, ChartApplicability: input.ChartApplicability, JournalStyle: input.JournalStyle,
		Discipline: input.Discipline, UseCase: input.UseCase, AvoidCase: input.AvoidCase, Tags: input.Tags,
		Accessibility: input.Accessibility, SourceType: input.SourceType, SourceImage: input.SourceImage,
		SourceNote: input.SourceNote, Version: input.Version, Status: "candidate",
	}
}
