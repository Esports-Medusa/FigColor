package palettesuggestion

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"reflect"
	"testing"

	"github.com/qiqi/figcolor/backend/internal/paletteassistant"
	"github.com/qiqi/figcolor/backend/internal/paletteassistant/imageanalysis"
)

func TestSuggestValidDeterministicAndConservative(t *testing.T) {
	in := analyzed(t, []pixel{{"#FFFFFF", 80}, {"#CC1808", 20}, {"#0848C8", 20}, {"#202020", 10}})
	engine := New()
	first, err := engine.Suggest(context.Background(), in)
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 50; i++ {
		got, err := engine.Suggest(context.Background(), in)
		if err != nil || !reflect.DeepEqual(got, first) {
			t.Fatalf("run %d differs: %v", i, err)
		}
		b1, _ := json.Marshal(first)
		b2, _ := json.Marshal(got)
		if string(b1) != string(b2) {
			t.Fatal("JSON differs")
		}
	}
	if first.Policy != (Policy{Version: PolicyVersion, MinimumColors: MinimumColors, MaximumColors: MaximumColors}) || first.SourceAnalyzerVersion != imageanalysis.AlgorithmVersion || first.SourceEvidenceSHA256 != in.Evidence.OutputSHA256 || first.SuggestionSetID == "" || first.OutputSHA256 == "" {
		t.Fatalf("identity incomplete: %+v", first)
	}
	changedSnapshot := first
	changedSnapshot.Policy.MinimumColors++
	if semanticHash(changedSnapshot) == first.OutputSHA256 {
		t.Fatal("policy snapshot did not participate in digest")
	}
	for i, color := range first.SelectedColors {
		if color.ID != selectedColorID(first.Policy, first.SourceEvidenceSHA256, in.ColorSuggestions[i]) || color.RuleID != RuleSelectRetained {
			t.Fatalf("color identity metadata split: %+v", color)
		}
	}
	if first.State != StateComplete || !first.Reviewable || len(first.SelectedColors) != 2 || first.SelectedColors[0].Hex != "#0848C8" || first.SelectedColors[1].Hex != "#C81808" {
		t.Fatalf("unexpected selection: %+v", first)
	}
	if first.PaletteType == nil || first.PaletteType.Value != "categorical" || first.PaletteType.Authoritative {
		t.Fatalf("unsafe type: %+v", first.PaletteType)
	}
	if len(first.UnresolvedDecisions) == 0 || len(first.Facts) == 0 || len(first.Warnings) == 0 {
		t.Fatalf("audit fields missing: %+v", first)
	}
	allowed := map[string]bool{}
	for _, c := range in.ColorSuggestions {
		allowed[c.Hex] = true
	}
	for _, c := range first.SelectedColors {
		if !allowed[c.Hex] {
			t.Fatalf("fabricated %s", c.Hex)
		}
	}
}

func TestBoundariesTruncationAndNoPromotion(t *testing.T) {
	tests := []struct {
		name     string
		in       imageanalysis.Result
		state    CompletenessState
		selected int
	}{
		{"none", analyzed(t, []pixel{{"#FFFFFF", 80}, {"#202020", 20}}), StateNoUsableColors, 0},
		{"one", analyzed(t, []pixel{{"#FFFFFF", 80}, {"#CC1808", 20}}), StateNeedsReview, 1},
		{"two", analyzed(t, []pixel{{"#FFFFFF", 80}, {"#CC1808", 20}, {"#0848C8", 20}}), StateComplete, 2},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := New().Suggest(context.Background(), tc.in)
			if err != nil {
				t.Fatal(err)
			}
			if got.State != tc.state || len(got.SelectedColors) != tc.selected || !got.Reviewable {
				t.Fatalf("%+v", got)
			}
			unresolvedType := hasUnresolved(got.UnresolvedDecisions, "/palette_type")
			if tc.selected < MinimumColors && (got.PaletteType != nil || !unresolvedType) {
				t.Fatalf("incomplete palette type audit: %+v", got)
			}
			if tc.selected >= MinimumColors && (got.PaletteType == nil || unresolvedType) {
				t.Fatalf("complete palette type audit: %+v", got)
			}
		})
	}
	in := analyzed(t, manyPixels(14))
	got, err := New().Suggest(context.Background(), in)
	if err != nil {
		t.Fatal(err)
	}
	if len(got.SelectedColors) != MaximumColors || len(got.OmittedColors) < 2 {
		t.Fatalf("truncation missing: %+v", got)
	}
	for _, c := range got.OmittedColors {
		if c.ReasonCodes[0] == "" {
			t.Fatal("missing omission reason")
		}
	}
	exactMaximum, err := New().Suggest(context.Background(), analyzed(t, manyPixels(MaximumColors)))
	if err != nil {
		t.Fatal(err)
	}
	if len(exactMaximum.SelectedColors) != MaximumColors || containsString(exactMaximum.Warnings, WarningTruncated) {
		t.Fatalf("exact maximum truncated: %+v", exactMaximum)
	}
}

func TestValidEvidenceRejectsSelfConsistentContradictions(t *testing.T) {
	base := analyzed(t, []pixel{{"#FFFFFF", 80}, {"#CC1808", 20}, {"#0848C8", 20}, {"#202020", 10}})
	cases := map[string]func(*imageanalysis.Result){
		"background": func(r *imageanalysis.Result) {
			r.Evidence.Background.ReasonCodes = []string{imageanalysis.ReasonPixelSupport}
		},
		"retained mismatch":              func(r *imageanalysis.Result) { r.Evidence.Colors = r.Evidence.Colors[1:] },
		"duplicate retained evidence":    func(r *imageanalysis.Result) { r.Evidence.Colors = append(r.Evidence.Colors, r.Evidence.Colors[0]) },
		"suggestion identity":            func(r *imageanalysis.Result) { r.ColorSuggestions[0].ID = "color-deadbeefdeadbeef" },
		"cross classification duplicate": func(r *imageanalysis.Result) { r.StructuralColors[0].Hex = r.ColorSuggestions[0].Hex },
		"image digest":                   func(r *imageanalysis.Result) { r.Image.SHA256 = "ABC" },
		"reason classification": func(r *imageanalysis.Result) {
			r.ColorSuggestions[0].ReasonCodes = []string{imageanalysis.ReasonLikelyStructural}
		},
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			in := cloneResult(t, base)
			mutate(&in)
			if validEvidence(in) {
				t.Fatal("contradictory evidence accepted")
			}
		})
	}
}

func TestRejectsTamperingAndInvalidBoundaries(t *testing.T) {
	valid := analyzed(t, []pixel{{"#FFFFFF", 80}, {"#CC1808", 20}, {"#0848C8", 20}})
	cases := map[string]func(*imageanalysis.Result){
		"digest":       func(r *imageanalysis.Result) { r.Image.Width++ },
		"version":      func(r *imageanalysis.Result) { r.Evidence.AlgorithmVersion = "v2" },
		"hex":          func(r *imageanalysis.Result) { r.ColorSuggestions[0].Hex = "red" },
		"rgb mismatch": func(r *imageanalysis.Result) { r.ColorSuggestions[0].Hex = "#CC1809" },
		"support":      func(r *imageanalysis.Result) { r.ColorSuggestions[0].PixelCount = 0 },
		"fraction":     func(r *imageanalysis.Result) { r.ColorSuggestions[0].Fraction = 2 },
		"duplicate":    func(r *imageanalysis.Result) { r.ColorSuggestions = append(r.ColorSuggestions, r.ColorSuggestions[0]) },
		"order": func(r *imageanalysis.Result) {
			r.ColorSuggestions[0], r.ColorSuggestions[1] = r.ColorSuggestions[1], r.ColorSuggestions[0]
		},
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			in := valid
			in.ColorSuggestions = append([]paletteassistant.ColorSuggestion(nil), valid.ColorSuggestions...)
			mutate(&in)
			_, err := New().Suggest(context.Background(), in)
			if !errors.Is(err, ErrInvalidEvidence) && !errors.Is(err, ErrUnsupportedAnalyzer) {
				t.Fatalf("err=%v", err)
			}
		})
	}
	if _, err := New().Suggest(nil, valid); !errors.Is(err, ErrInvalidContext) {
		t.Fatalf("nil context: %v", err)
	}
	var zero Engine
	if _, err := zero.Suggest(context.Background(), valid); !errors.Is(err, ErrInvalidEngine) {
		t.Fatalf("zero engine: %v", err)
	}
	changed := New()
	changed.policy.Version = "deterministic-palette-suggestion.v2"
	if _, err := changed.Suggest(context.Background(), valid); !errors.Is(err, ErrInvalidEngine) {
		t.Fatalf("replacement version accepted: %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := New().Suggest(ctx, valid); !errors.Is(err, ErrCancelled) {
		t.Fatalf("cancel: %v", err)
	}
}

func containsString(items []string, want string) bool {
	for _, item := range items {
		if item == want {
			return true
		}
	}
	return false
}
func hasUnresolved(items []UnresolvedDecision, field string) bool {
	for _, item := range items {
		if item.Field == field {
			return true
		}
	}
	return false
}
func cloneResult(t *testing.T, in imageanalysis.Result) imageanalysis.Result {
	t.Helper()
	b, err := json.Marshal(in)
	if err != nil {
		t.Fatal(err)
	}
	var out imageanalysis.Result
	if err := json.Unmarshal(b, &out); err != nil {
		t.Fatal(err)
	}
	return out
}

type pixel struct {
	hex   string
	count int
}

func manyPixels(n int) []pixel {
	p := []pixel{{"#FFFFFF", 100}}
	for i := 0; i < n; i++ {
		p = append(p, pixel{hex: "#" + []string{"C81808", "08C818", "0818C8", "C87808", "7808C8", "08C878", "C83848", "38C848", "4838C8", "C89818", "9818C8", "18C898", "C85828", "58C828"}[i], count: 30 - i})
	}
	return p
}
func analyzed(t *testing.T, pixels []pixel) imageanalysis.Result {
	t.Helper()
	width := 0
	for _, p := range pixels {
		width += p.count
	}
	img := makeTestPNG(t, width, pixels)
	r, err := imageanalysis.New().Analyze(context.Background(), img, "image/png")
	if err != nil {
		t.Fatal(err)
	}
	return r
}
func makeTestPNG(t *testing.T, width int, pixels []pixel) []byte {
	t.Helper()
	img := image.NewNRGBA(image.Rect(0, 0, width, 1))
	x := 0
	for _, p := range pixels {
		var r, g, b uint8
		if _, err := fmt.Sscanf(p.hex, "#%02X%02X%02X", &r, &g, &b); err != nil {
			t.Fatal(err)
		}
		for i := 0; i < p.count; i++ {
			img.SetNRGBA(x, 0, color.NRGBA{R: r, G: g, B: b, A: 255})
			x++
		}
	}
	// Keep the declared counts while making all one-row corner samples use the
	// first (background) colour.
	if len(pixels) > 1 {
		background := img.NRGBAAt(0, 0)
		img.SetNRGBA(width-1, 0, background)
		var r, g, b uint8
		if _, err := fmt.Sscanf(pixels[len(pixels)-1].hex, "#%02X%02X%02X", &r, &g, &b); err != nil {
			t.Fatal(err)
		}
		img.SetNRGBA(pixels[0].count-1, 0, color.NRGBA{R: r, G: g, B: b, A: 255})
	}
	var out bytes.Buffer
	if err := png.Encode(&out, img); err != nil {
		t.Fatal(err)
	}
	return out.Bytes()
}
