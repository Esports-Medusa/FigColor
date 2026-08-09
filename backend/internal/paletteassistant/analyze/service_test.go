package analyze

import (
	"bytes"
	"context"
	"encoding/json"
	"image"
	"image/color"
	"image/png"
	"reflect"
	"regexp"
	"testing"

	"github.com/google/uuid"
	"github.com/qiqi/figcolor/backend/internal/paletteassistant"
	"github.com/qiqi/figcolor/backend/internal/paletteassistant/imageanalysis"
	"github.com/qiqi/figcolor/backend/internal/paletteassistant/palettesuggestion"
)

const vectorImageSHA = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

func TestWarningCatalogGoldenVectorsAndDuplicateOrder(t *testing.T) {
	vectors := []struct {
		name       string
		code       string
		definition warningDefinition
		want       string
	}{
		{"wpb2_transparency", imageanalysis.WarningTransparency, imageWarningCatalog[imageanalysis.WarningTransparency], "528ef80e640b07175b66da18ac98ac9348666dd04ccd282921c1846cd223c1e1"},
		{"wpb2_no_usable", imageanalysis.WarningNoUsableDataColor, imageWarningCatalog[imageanalysis.WarningNoUsableDataColor], "01a4c0bb7b7b7b139dd87ff49785360335924ac25bfd61b49b79e8c9ce749341"},
		{"wpb3_heuristic", palettesuggestion.WarningHeuristic, suggestionWarningCatalog[palettesuggestion.WarningHeuristic], "e4460a068dd58fd623166a95a3bc603844eeba409061159c4716987685d11ca3"},
		{"wpb3_no_usable", palettesuggestion.WarningNoUsable, suggestionWarningCatalog[palettesuggestion.WarningNoUsable], "6b7d31b5d7bdfa91f35c12bfe187dc8da2eb2d91883c827da9613fd98e3d2ef7"},
		{"wpb3_insufficient", palettesuggestion.WarningInsufficient, suggestionWarningCatalog[palettesuggestion.WarningInsufficient], "23f0aa7f2d971c11f1281ad47c8aa44b8ce0be0bd7744c20fb05f1c62ef14a45"},
		{"wpb3_truncated", palettesuggestion.WarningTruncated, suggestionWarningCatalog[palettesuggestion.WarningTruncated], "cef93768f5f204633a68399d5018340a495b1cf7e3afa3816ea2592aaa609b5a"},
	}
	hex64 := regexp.MustCompile(`^[0-9a-f]{64}$`)
	for _, vector := range vectors {
		t.Run(vector.name, func(t *testing.T) {
			first, err := projectWarning(vector.code, vector.definition)
			if err != nil {
				t.Fatal(err)
			}
			second, err := projectWarning(vector.code, vector.definition)
			if err != nil {
				t.Fatal(err)
			}
			if first.ID != vector.want || second.ID != vector.want || len(first.ID) != 64 || !hex64.MatchString(first.ID) {
				t.Fatalf("finding ID got %q / %q, want %q", first.ID, second.ID, vector.want)
			}
			if first.Path != "" || first.PaletteID != "" || first.RequiresAcknowledgment || string(first.Params) != `{"producer":"`+vector.definition.producer+`"}` {
				t.Fatalf("warning shape drifted: %#v", first)
			}
		})
	}
	warnings, err := projectWarnings(
		[]string{imageanalysis.WarningTransparency, imageanalysis.WarningTransparency},
		[]string{palettesuggestion.WarningHeuristic, palettesuggestion.WarningHeuristic},
	)
	if err != nil {
		t.Fatal(err)
	}
	if len(warnings) != 4 || warnings[0].ID != warnings[1].ID || warnings[2].ID != warnings[3].ID || warnings[0].Code != imageanalysis.WarningTransparency || warnings[2].Code != palettesuggestion.WarningHeuristic {
		t.Fatalf("duplicates/order not preserved: %#v", warnings)
	}
}

func TestWarningCatalogMessagesAndUnknownFailClosed(t *testing.T) {
	checks := []struct {
		code       string
		message    string
		definition warningDefinition
	}{
		{imageanalysis.WarningTransparency, "Transparency was composited onto white before analysis.", imageWarningCatalog[imageanalysis.WarningTransparency]},
		{imageanalysis.WarningNoUsableDataColor, "No usable data color was detected.", imageWarningCatalog[imageanalysis.WarningNoUsableDataColor]},
		{palettesuggestion.WarningHeuristic, "Assistant suggestions are heuristic and require Admin review.", suggestionWarningCatalog[palettesuggestion.WarningHeuristic]},
		{palettesuggestion.WarningNoUsable, "No usable data color was available for the seeded Draft.", suggestionWarningCatalog[palettesuggestion.WarningNoUsable]},
		{palettesuggestion.WarningInsufficient, "Fewer than two usable data colors were available.", suggestionWarningCatalog[palettesuggestion.WarningInsufficient]},
		{palettesuggestion.WarningTruncated, "Usable data colors were limited to the first 12 suggestions.", suggestionWarningCatalog[palettesuggestion.WarningTruncated]},
	}
	for _, check := range checks {
		finding, err := projectWarning(check.code, check.definition)
		if err != nil || finding.Message != check.message {
			t.Fatalf("%s: %#v %v", check.code, finding, err)
		}
	}
	if _, err := projectWarnings([]string{"FUTURE_WARNING"}, nil); err != errProjection {
		t.Fatalf("unknown warning error = %v", err)
	}
}

func TestDraftColorUUIDv5GoldenVectorsAndOccurrence(t *testing.T) {
	vectors := []struct {
		hex        string
		occurrence int
		want       string
	}{
		{"#112233", 0, "92577f0d-979f-5951-9998-a5cc99072583"},
		{"#445566", 0, "12e24b16-efcb-57ef-999c-9eeacf1df92b"},
		{"#112233", 1, "5946067e-654f-5e48-af90-089adf284479"},
	}
	for _, vector := range vectors {
		got, err := draftColorID(imageanalysis.AlgorithmVersion, vectorImageSHA, vector.hex, vector.occurrence)
		if err != nil || got != vector.want {
			t.Fatalf("%s/%d = %q, %v", vector.hex, vector.occurrence, got, err)
		}
		parsed := uuid.MustParse(got)
		if parsed.Version() != 5 || parsed.Variant() != uuid.RFC4122 {
			t.Fatalf("UUID bits drifted: %s", got)
		}
	}
	selected := []palettesuggestion.SuggestedColor{{Hex: "#112233"}, {Hex: "#445566"}, {Hex: "#112233"}}
	colors, err := projectDraftColors(imageanalysis.AlgorithmVersion, vectorImageSHA, selected)
	if err != nil {
		t.Fatal(err)
	}
	for i, want := range vectors {
		if colors[i].ID != want.want || colors[i].Order != i || colors[i].Hex != selected[i].Hex || colors[i].Label != "" || colors[i].Source != paletteassistant.SourceAssistant || colors[i].State != paletteassistant.StateUnconfirmed {
			t.Fatalf("color %d drifted: %#v", i, colors[i])
		}
	}
}

func TestAssistantDraftProjectionFieldsProvenanceAndOmissions(t *testing.T) {
	analysis := projectionAnalysis()
	suggestion := projectionSuggestion()
	draft, err := projectDraft(analysis, suggestion)
	if err != nil {
		t.Fatal(err)
	}
	if draft.ContractVersion != paletteassistant.ContractVersion || draft.Revision != 1 || draft.Name != "" || draft.Type != "categorical" || len(draft.Colors) != 2 || len(draft.ChartApplicability) != 0 || len(draft.Disciplines) != 0 || len(draft.UseCases) != 0 || len(draft.AvoidCases) != 0 || len(draft.Tags) != 0 || draft.Accessibility != (paletteassistant.DraftAccessibility{}) || draft.SourceType != paletteassistant.OnlineSourceType || draft.SourceNote != "" || len(draft.PreviewCases) != 0 || len(draft.Provenance) != 1 {
		t.Fatalf("15-field projection drifted: %#v", draft)
	}
	provenance := draft.Provenance[0]
	if provenance.Path != "/type" || provenance.Source != paletteassistant.SourceAssistant || provenance.State != paletteassistant.StateUnconfirmed || provenance.Producer != palettesuggestion.Producer || provenance.AlgorithmVersion != palettesuggestion.PolicyVersion || !reflect.DeepEqual(provenance.ReasonCodes, []string{"MULTIPLE_UNORDERED_RETAINED_DATA_COLORS"}) || string(provenance.SuggestedValue) != `"categorical"` || provenance.AmbiguityGroup != "" {
		t.Fatalf("provenance drifted: %#v", provenance)
	}
	raw, err := json.Marshal(draft)
	if err != nil {
		t.Fatal(err)
	}
	for _, required := range []string{`"chart_applicability":[]`, `"disciplines":[]`, `"use_cases":[]`, `"avoid_cases":[]`, `"tags":[]`, `"preview_cases":[]`} {
		if !bytes.Contains(raw, []byte(required)) {
			t.Fatalf("required empty array absent: %s", raw)
		}
	}
	for _, forbidden := range []string{"omitted_colors", "facts", "unresolved_decisions", "output_sha256", "source_evidence_sha256", "suggestion_set_id", "ambiguity_group", `"label"`} {
		if bytes.Contains(raw, []byte(forbidden)) {
			t.Fatalf("internal/omitempty field leaked: %s", forbidden)
		}
	}
	suggestion.PaletteType = nil
	draft, err = projectDraft(analysis, suggestion)
	if err != nil || draft.Type != "" || len(draft.Provenance) != 0 {
		t.Fatalf("absent type drifted: %#v %v", draft, err)
	}
}

func TestAnalyzeResponseDeterminismExceptAnalysisID(t *testing.T) {
	analysis, suggestion := projectionAnalysis(), projectionSuggestion()
	first, err := assembleResponse(analysis, suggestion, "11111111-1111-4111-8111-111111111111")
	if err != nil {
		t.Fatal(err)
	}
	second, err := assembleResponse(analysis, suggestion, "22222222-2222-4222-8222-222222222222")
	if err != nil {
		t.Fatal(err)
	}
	if first.AnalysisID == second.AnalysisID {
		t.Fatal("analysis IDs must be request scoped")
	}
	first.AnalysisID, second.AnalysisID = "", ""
	if !reflect.DeepEqual(first, second) {
		t.Fatalf("non-ID projection is nondeterministic\n%#v\n%#v", first, second)
	}
}

func TestProductionServiceExecutesRealAnalyzerAndSuggester(t *testing.T) {
	img := image.NewNRGBA(image.Rect(0, 0, 4, 4))
	for y := 0; y < 4; y++ {
		for x := 0; x < 4; x++ {
			img.SetNRGBA(x, y, color.NRGBA{R: 16, G: 32, B: 48, A: 255})
		}
	}
	var encoded bytes.Buffer
	if err := png.Encode(&encoded, img); err != nil {
		t.Fatal(err)
	}
	response, err := NewService().Analyze(context.Background(), encoded.Bytes(), "image/png")
	if err != nil {
		t.Fatal(err)
	}
	_, idErr := uuid.Parse(response.AnalysisID)
	if response.ContractVersion != paletteassistant.ContractVersion || response.AlgorithmVersion != imageanalysis.AlgorithmVersion || response.Image.Format != "png" || idErr != nil || len(response.Warnings) < 2 {
		t.Fatalf("real flow incomplete: %#v", response)
	}
}

func projectionAnalysis() imageanalysis.Result {
	return imageanalysis.Result{
		Image:            paletteassistant.ImageFacts{Format: "png", EncodedBytes: 100, Width: 2, Height: 1, PixelCount: 2, AlphaBackdrop: "#FFFFFF", SHA256: vectorImageSHA},
		ColorSuggestions: []paletteassistant.ColorSuggestion{{ID: "color-1", Hex: "#112233", PixelCount: 1, Fraction: .5, Producer: imageanalysis.Producer, AlgorithmVersion: imageanalysis.AlgorithmVersion, ReasonCodes: []string{imageanalysis.ReasonPixelSupport}}},
		StructuralColors: []paletteassistant.ColorSuggestion{},
		Evidence:         imageanalysis.Evidence{AlgorithmVersion: imageanalysis.AlgorithmVersion, Warnings: []string{imageanalysis.WarningTransparency}},
	}
}

func projectionSuggestion() palettesuggestion.Result {
	return palettesuggestion.Result{
		Policy:                palettesuggestion.Policy{Version: palettesuggestion.PolicyVersion, MinimumColors: 2, MaximumColors: 12},
		SourceAnalyzerVersion: imageanalysis.AlgorithmVersion,
		SelectedColors:        []palettesuggestion.SuggestedColor{{Hex: "#112233"}, {Hex: "#445566"}},
		OmittedColors:         []palettesuggestion.OmittedColor{{Hex: "#FFFFFF"}},
		PaletteType: &palettesuggestion.PaletteTypeSuggestion{Value: "categorical", Producer: palettesuggestion.Producer, AlgorithmVersion: palettesuggestion.PolicyVersion,
			ReasonCodes: []string{"MULTIPLE_UNORDERED_RETAINED_DATA_COLORS"}},
		Warnings:            []string{palettesuggestion.WarningHeuristic},
		Facts:               []palettesuggestion.Fact{{Code: "INTERNAL", Value: "not-wire"}},
		UnresolvedDecisions: []palettesuggestion.UnresolvedDecision{{Field: "/name", ReasonCode: "INTERNAL"}},
		OutputSHA256:        vectorImageSHA,
	}
}
