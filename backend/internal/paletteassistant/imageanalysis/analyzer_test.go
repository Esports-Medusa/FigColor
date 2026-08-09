package imageanalysis

import (
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"hash/crc32"
	"image"
	"image/color"
	"image/gif"
	"image/jpeg"
	"image/png"
	"os"
	"reflect"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/qiqi/figcolor/backend/internal/paletteassistant"
)

func TestValidPNGAndJPEGAreStable(t *testing.T) {
	imageValue := syntheticImage(false)
	for _, fixture := range []struct {
		name, mime string
		encoded    []byte
	}{{"png", "image/png", encodePNG(t, imageValue)}, {"jpeg", "image/jpeg", encodeJPEG(t, imageValue)}} {
		t.Run(fixture.name, func(t *testing.T) {
			analyzer := newTestAnalyzer(t, DefaultConfig(), 1)
			first := mustAnalyze(t, analyzer, fixture.encoded, fixture.mime)
			canonical, err := json.Marshal(first)
			if err != nil {
				t.Fatal(err)
			}
			for run := 0; run < 25; run++ {
				next, err := analyzer.Analyze(context.Background(), fixture.encoded, fixture.mime)
				if err != nil {
					t.Fatal(err)
				}
				encoded, _ := json.Marshal(next)
				if !bytes.Equal(encoded, canonical) {
					t.Fatalf("run %d was nondeterministic", run)
				}
			}
			if first.Image.Format != fixture.name || first.Image.EncodedBytes != int64(len(fixture.encoded)) || first.Image.Width != 48 || first.Image.Height != 32 || first.Image.PixelCount != 1536 || first.Image.AlphaBackdrop != "#FFFFFF" {
				t.Fatalf("facts=%+v", first.Image)
			}
			if len(first.ColorSuggestions) < 2 || first.ColorSuggestions[0].PixelCount < first.ColorSuggestions[1].PixelCount {
				t.Fatalf("unstable color ordering: %+v", first.ColorSuggestions)
			}
			for _, candidate := range first.ColorSuggestions {
				if candidate.Hex != strings.ToUpper(candidate.Hex) || len(candidate.ReasonCodes) == 0 || candidate.AlgorithmVersion != AlgorithmVersion {
					t.Fatalf("non-canonical evidence: %+v", candidate)
				}
			}
		})
	}
}

func TestEncodedBytesBoundary(t *testing.T) {
	cfg := DefaultConfig()
	cfg.MaxEncodedBytes = 64
	analyzer := newTestAnalyzer(t, cfg, 1)
	assertCode(t, analyzeError(analyzer, context.Background(), make([]byte, 65), "image/png"), ErrorEncodedSizeExceeded)
	assertCode(t, analyzeError(analyzer, context.Background(), nil, "image/png"), ErrorEmptyInput)
	// Exactly the configured byte boundary is allowed through the length check;
	// these deliberately malformed bytes fail only at format validation.
	assertCode(t, analyzeError(analyzer, context.Background(), make([]byte, 64), "image/png"), ErrorUnsupportedFormat)
}

func TestMIMEAndFormatAgreement(t *testing.T) {
	pngBytes := encodePNG(t, syntheticImage(false))
	jpegBytes := encodeJPEG(t, syntheticImage(false))
	var gifBuffer bytes.Buffer
	if err := gif.Encode(&gifBuffer, syntheticImage(false), nil); err != nil {
		t.Fatal(err)
	}
	analyzer := newTestAnalyzer(t, DefaultConfig(), 1)
	for _, tc := range []struct {
		name, mime string
		data       []byte
		code       ErrorCode
	}{
		{"unsupported_mime", "image/gif", pngBytes, ErrorUnsupportedMIME},
		{"mime_parameters_rejected", "image/png; charset=binary", pngBytes, ErrorUnsupportedMIME},
		{"png_as_jpeg", "image/jpeg", pngBytes, ErrorSignatureMismatch},
		{"jpeg_as_png", "image/png", jpegBytes, ErrorSignatureMismatch},
		{"gif", "image/png", gifBuffer.Bytes(), ErrorUnsupportedFormat},
		{"svg", "image/png", []byte(`<svg xmlns="http://www.w3.org/2000/svg"/>`), ErrorUnsupportedFormat},
		{"random", "image/png", []byte("not an image"), ErrorUnsupportedFormat},
	} {
		t.Run(tc.name, func(t *testing.T) {
			assertCode(t, analyzeError(analyzer, context.Background(), tc.data, tc.mime), tc.code)
		})
	}
	if formatsAgree("png", "png", "jpeg") || formatsAgree("png", "jpeg", "jpeg") || !formatsAgree("png", "png", "png") {
		t.Fatal("declared MIME, signature, and authoritative config format agreement drifted")
	}
}

func TestMalformedAndTruncatedImages(t *testing.T) {
	analyzer := newTestAnalyzer(t, DefaultConfig(), 1)
	pngBytes := encodePNG(t, syntheticImage(false))
	jpegBytes := encodeJPEG(t, syntheticImage(false))
	for _, tc := range []struct {
		name, mime string
		data       []byte
	}{
		{"png_config", "image/png", pngBytes[:20]},
		{"png_full", "image/png", pngBytes[:len(pngBytes)-8]},
		{"jpeg_config", "image/jpeg", jpegBytes[:10]},
		{"jpeg_full", "image/jpeg", jpegBytes[:len(jpegBytes)-20]},
	} {
		t.Run(tc.name, func(t *testing.T) {
			assertCode(t, analyzeError(analyzer, context.Background(), tc.data, tc.mime), ErrorDecodeFailed)
		})
	}
}

func TestDimensionLimitsAreCheckedFromConfigBeforeFullDecode(t *testing.T) {
	base := encodePNG(t, image.NewNRGBA(image.Rect(0, 0, 1, 1)))
	for _, tc := range []struct {
		name          string
		width, height uint32
		code          ErrorCode
	}{
		{"zero", 0, 1, ErrorDecodeFailed},
		{"width", 4097, 1, ErrorWidthExceeded},
		{"height", 1, 4097, ErrorHeightExceeded},
		{"pixels", 4000, 3000, ErrorPixelLimitExceeded},
	} {
		t.Run(tc.name, func(t *testing.T) {
			mutated := mutatePNGDimensions(base, tc.width, tc.height)
			assertCode(t, analyzeError(newTestAnalyzer(t, DefaultConfig(), 1), context.Background(), mutated, "image/png"), tc.code)
		})
	}
	cfg := DefaultConfig()
	cfg.MaxWidth, cfg.MaxHeight, cfg.MaxPixels = int(^uint(0)>>1), int(^uint(0)>>1), 8_000_000
	if err := validateDimensions(int(^uint(0)>>1), int(^uint(0)>>1), cfg); code(err) != ErrorPixelLimitExceeded {
		t.Fatalf("overflow-safe check returned %v", err)
	}
	if decodedBoundsAgree(nil, 1, 1) || decodedBoundsAgree(image.NewNRGBA(image.Rect(0, 0, 2, 1)), 1, 1) || !decodedBoundsAgree(image.NewNRGBA(image.Rect(5, 7, 7, 8)), 2, 1) {
		t.Fatal("full-decode/config bounds agreement drifted")
	}
}

func TestAlphaCompositesStraightChannelsOntoWhite(t *testing.T) {
	im := image.NewNRGBA(image.Rect(0, 0, 4, 4))
	fill(im, color.NRGBA{255, 0, 0, 128})
	im.SetNRGBA(0, 0, color.NRGBA{0, 0, 0, 0})
	cfg := DefaultConfig()
	cfg.QuantizeStep = 1
	cfg.MinimumPixelCount = 1
	cfg.BackgroundDistance = 0
	result := mustAnalyze(t, newTestAnalyzer(t, cfg, 1), encodePNG(t, im), "image/png")
	if !result.Image.HasTransparency || !contains(result.Evidence.Warnings, WarningTransparency) {
		t.Fatalf("transparency evidence=%+v", result)
	}
	if !hasEvidenceHex(result, "#FF7F7F") || !hasEvidenceHex(result, "#FFFFFF") {
		t.Fatalf("straight alpha composition missing: %+v", result.Evidence)
	}
}

func TestStructuralAndBackgroundColorsAreNotPromoted(t *testing.T) {
	im := image.NewNRGBA(image.Rect(0, 0, 40, 30))
	fill(im, color.NRGBA{248, 248, 248, 255})
	for x := 0; x < 40; x++ {
		im.SetNRGBA(x, 15, color.NRGBA{40, 40, 40, 255})
	}
	for y := 5; y < 15; y++ {
		for x := 5; x < 17; x++ {
			im.SetNRGBA(x, y, color.NRGBA{32, 120, 184, 255})
		}
	}
	result := mustAnalyze(t, newTestAnalyzer(t, DefaultConfig(), 1), encodePNG(t, im), "image/png")
	if !hasSuggestion(result.ColorSuggestions, "#2078B8") || hasSuggestion(result.ColorSuggestions, "#282828") || hasSuggestion(result.ColorSuggestions, "#F8F8F8") {
		t.Fatalf("data suggestions=%+v", result.ColorSuggestions)
	}
	if !hasSuggestion(result.StructuralColors, "#282828") || !hasClass(result.Evidence.Excluded, "background") {
		t.Fatalf("structural/excluded evidence=%+v %+v", result.StructuralColors, result.Evidence.Excluded)
	}
}

func TestTieBreakingIsPixelCountThenHex(t *testing.T) {
	im := image.NewNRGBA(image.Rect(0, 0, 20, 20))
	fill(im, color.NRGBA{255, 255, 255, 255})
	for i := 0; i < 16; i++ {
		im.SetNRGBA(2+i%4, 2+i/4, color.NRGBA{200, 40, 40, 255})
		im.SetNRGBA(10+i%4, 2+i/4, color.NRGBA{40, 40, 200, 255})
	}
	result := mustAnalyze(t, newTestAnalyzer(t, DefaultConfig(), 1), encodePNG(t, im), "image/png")
	if len(result.ColorSuggestions) != 2 || result.ColorSuggestions[0].Hex != "#2828C8" || result.ColorSuggestions[1].Hex != "#C82828" {
		t.Fatalf("tie order=%+v", result.ColorSuggestions)
	}
}

func TestCancellationDeadlineCapacityAndPanicSafety(t *testing.T) {
	analyzer := newTestAnalyzer(t, DefaultConfig(), 1)
	cancelled, cancel := context.WithCancel(context.Background())
	cancel()
	assertCode(t, analyzeError(analyzer, cancelled, []byte("ignored"), "image/png"), ErrorCancelled)
	cfg := DefaultConfig()
	cfg.AnalysisTimeout = time.Nanosecond
	assertCode(t, analyzeError(newTestAnalyzer(t, cfg, 1), context.Background(), encodePNG(t, syntheticImage(false)), "image/png"), ErrorDeadlineExceeded)

	busy := newTestAnalyzer(t, DefaultConfig(), 1)
	busy.slots <- struct{}{}
	busy.config.CapacityWait = time.Millisecond
	assertCode(t, analyzeError(busy, context.Background(), []byte("ignored"), "image/png"), ErrorCapacityUnavailable)
	<-busy.slots

	panicAnalyzer := newTestAnalyzer(t, DefaultConfig(), 1)
	panicAnalyzer.work = func(context.Context, []byte, string) (Result, error) { panic("decoder panic") }
	_, err := panicAnalyzer.Analyze(context.Background(), []byte("bounded"), "image/png")
	assertCode(t, err, ErrorInternal)

	ctx, cancelDuringPixels := context.WithCancel(context.Background())
	trigger := &cancellingImage{Image: syntheticImage(false), after: 100, cancel: cancelDuringPixels}
	_, err = analyzer.extract(ctx, []byte("bounded"), trigger, "png", 48, 64)
	assertCode(t, err, ErrorCancelled)
}

func TestDeadlineReturnsWhileFiniteWorkerRetainsCapacity(t *testing.T) {
	cfg := DefaultConfig()
	cfg.AnalysisTimeout = 10 * time.Millisecond
	cfg.CapacityWait = 2 * time.Millisecond
	slots := make(chan struct{}, 1)
	release := make(chan struct{})
	started := make(chan struct{})
	first := &Analyzer{config: cfg, slots: slots, work: func(context.Context, []byte, string) (Result, error) {
		close(started)
		<-release
		return Result{}, nil
	}}
	begin := time.Now()
	assertCode(t, analyzeError(first, context.Background(), []byte("finite"), "image/png"), ErrorDeadlineExceeded)
	if elapsed := time.Since(begin); elapsed > 250*time.Millisecond {
		t.Fatalf("deadline return took %s", elapsed)
	}
	<-started
	if len(slots) != 1 {
		t.Fatal("timed-out worker released capacity before terminating")
	}
	second := &Analyzer{config: cfg, slots: slots}
	assertCode(t, analyzeError(second, context.Background(), []byte("finite"), "image/png"), ErrorCapacityUnavailable)
	close(release)
	deadline := time.Now().Add(time.Second)
	for len(slots) != 0 && time.Now().Before(deadline) {
		runtime.Gosched()
	}
	if len(slots) != 0 {
		t.Fatal("completed timed-out worker did not release capacity")
	}
}

func TestProductionConstructorsShareProcessCapacity(t *testing.T) {
	first, second := New(), New()
	if first.slots != second.slots || first.slots != productionSlots || cap(first.slots) != productionCapacity() {
		t.Fatal("production analyzers do not share the process capacity gate")
	}
	for i := 0; i < cap(productionSlots); i++ {
		productionSlots <- struct{}{}
	}
	defer func() {
		for i := 0; i < cap(productionSlots); i++ {
			<-productionSlots
		}
	}()
	second.config.CapacityWait = time.Millisecond
	assertCode(t, analyzeError(second, context.Background(), []byte("finite"), "image/png"), ErrorCapacityUnavailable)
}

func TestSuggestionIdentityBindsEffectiveAlgorithmVersion(t *testing.T) {
	v1 := suggestionID(AlgorithmVersion, "data", "#112233")
	v2 := suggestionID("deterministic-image-analysis.v2", "data", "#112233")
	if v1 == v2 {
		t.Fatal("suggestion identity ignored algorithm version")
	}
	result := mustAnalyze(t, newTestAnalyzer(t, DefaultConfig(), 1), encodePNG(t, syntheticImage(false)), "image/png")
	for _, suggestion := range append(append([]paletteassistant.ColorSuggestion{}, result.ColorSuggestions...), result.StructuralColors...) {
		classification := "data"
		if contains(suggestion.ReasonCodes, ReasonLikelyStructural) {
			classification = "structural"
		}
		if suggestion.ID != suggestionID(suggestion.AlgorithmVersion, classification, suggestion.Hex) {
			t.Fatalf("suggestion metadata/identity split: %+v", suggestion)
		}
	}
}

func TestJPEGMetadataDoesNotAffectNormalizedPixelEvidence(t *testing.T) {
	original := encodeJPEG(t, syntheticImage(false))
	metadata := []byte("Exif\x00\x00not-authoritative-or-parsed")
	segment := append([]byte{0xff, 0xe1, byte((len(metadata) + 2) >> 8), byte(len(metadata) + 2)}, metadata...)
	withMetadata := append(append(append([]byte{}, original[:2]...), segment...), original[2:]...)
	analyzer := newTestAnalyzer(t, DefaultConfig(), 1)
	plain := mustAnalyze(t, analyzer, original, "image/jpeg")
	decorated := mustAnalyze(t, analyzer, withMetadata, "image/jpeg")
	if !reflect.DeepEqual(plain.ColorSuggestions, decorated.ColorSuggestions) || !reflect.DeepEqual(plain.StructuralColors, decorated.StructuralColors) || !reflect.DeepEqual(plain.Evidence.Colors, decorated.Evidence.Colors) {
		t.Fatal("JPEG metadata changed normalized pixel evidence")
	}
}

func TestNoUsableDataColorsProducesExplicitEvidence(t *testing.T) {
	im := image.NewNRGBA(image.Rect(0, 0, 16, 16))
	fill(im, color.NRGBA{240, 240, 240, 255})
	result := mustAnalyze(t, newTestAnalyzer(t, DefaultConfig(), 1), encodePNG(t, im), "image/png")
	if len(result.ColorSuggestions) != 0 || !contains(result.Evidence.Warnings, WarningNoUsableDataColor) {
		t.Fatalf("result=%+v", result)
	}
}

func TestDefaultProductionLimitsAndConfiguration(t *testing.T) {
	cfg := DefaultConfig()
	if cfg.MaxEncodedBytes != paletteassistant.EncodedImageLimit || cfg.MaxWidth != 4096 || cfg.MaxHeight != 4096 || cfg.MaxPixels != 8_000_000 || cfg.AnalysisTimeout != 5*time.Second || cfg.CapacityWait != 250*time.Millisecond || cfg.AlphaBackdrop != "#FFFFFF" {
		t.Fatalf("config=%+v", cfg)
	}
	invalid := DefaultConfig()
	invalid.AlgorithmVersion = "deterministic-image-analysis.v2"
	if validConfig(invalid) {
		t.Fatal("production policy accepted a different algorithm version")
	}
}

func TestInvalidAnalyzerConfigurationFailsBeforeWorkerOrCapacity(t *testing.T) {
	valid := DefaultConfig()
	invalidVersion := valid
	invalidVersion.AlgorithmVersion = "deterministic-image-analysis.v2"
	invalidLimit := valid
	invalidLimit.MaxPixels = 0

	type testCase struct {
		name     string
		analyzer *Analyzer
		ctx      context.Context
	}
	cases := []testCase{
		{name: "nil_analyzer", analyzer: nil, ctx: context.Background()},
		{name: "zero_value", analyzer: &Analyzer{}, ctx: context.Background()},
		{name: "nil_context", analyzer: &Analyzer{config: valid, slots: make(chan struct{}, 1)}, ctx: nil},
		{name: "algorithm_version", analyzer: &Analyzer{config: invalidVersion, slots: make(chan struct{}, 1)}, ctx: context.Background()},
		{name: "invalid_limit", analyzer: &Analyzer{config: invalidLimit, slots: make(chan struct{}, 1)}, ctx: context.Background()},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			workerCalled := false
			if tc.analyzer != nil {
				tc.analyzer.work = func(context.Context, []byte, string) (Result, error) {
					workerCalled = true
					return Result{}, nil
				}
			}
			assertCode(t, analyzeError(tc.analyzer, tc.ctx, []byte("finite"), "image/png"), ErrorInvalidConfiguration)
			if workerCalled {
				t.Fatal("invalid analyzer started worker")
			}
			if tc.analyzer != nil && tc.analyzer.slots != nil && len(tc.analyzer.slots) != 0 {
				t.Fatal("invalid analyzer occupied capacity")
			}
		})
	}
}

func TestProductionDependencyBoundary(t *testing.T) {
	source, err := os.ReadFile("analyzer.go")
	if err != nil {
		t.Fatal(err)
	}
	for _, prohibited := range []string{"internal/feasibility", "internal/palette\"", "gin-gonic", "net/http", "database/sql", "os.Open", "os.ReadFile", "exec.Command", "CandidateAggregateService", "ImageMagick", "http://", "https://"} {
		if strings.Contains(string(source), prohibited) {
			t.Fatalf("production analyzer contains prohibited dependency %q", prohibited)
		}
	}
}

type cancellingImage struct {
	image.Image
	after  int
	calls  int
	cancel context.CancelFunc
}

func (i *cancellingImage) At(x, y int) color.Color {
	i.calls++
	if i.calls == i.after {
		i.cancel()
	}
	return i.Image.At(x, y)
}

func syntheticImage(alpha bool) *image.NRGBA {
	im := image.NewNRGBA(image.Rect(0, 0, 48, 32))
	fill(im, color.NRGBA{248, 248, 248, 255})
	for y := 6; y < 25; y++ {
		for x := 5; x < 18; x++ {
			im.SetNRGBA(x, y, color.NRGBA{32, 120, 184, 255})
		}
		for x := 26; x < 39; x++ {
			im.SetNRGBA(x, y, color.NRGBA{224, 80, 56, 255})
		}
	}
	for x := 2; x < 46; x++ {
		im.SetNRGBA(x, 27, color.NRGBA{40, 40, 40, 255})
	}
	if alpha {
		im.SetNRGBA(20, 20, color.NRGBA{255, 0, 0, 128})
	}
	return im
}
func fill(im *image.NRGBA, value color.NRGBA) {
	for y := im.Bounds().Min.Y; y < im.Bounds().Max.Y; y++ {
		for x := im.Bounds().Min.X; x < im.Bounds().Max.X; x++ {
			im.SetNRGBA(x, y, value)
		}
	}
}
func TestVerifyResultRejectsMutation(t *testing.T) {
	encoded := encodePNG(t, image.NewNRGBA(image.Rect(0, 0, 2, 2)))
	result := mustAnalyze(t, newTestAnalyzer(t, DefaultConfig(), 1), encoded, "image/png")
	if !VerifyResult(result) {
		t.Fatal("fresh analyzer result did not verify")
	}
	result.Image.Width++
	if VerifyResult(result) {
		t.Fatal("mutated analyzer result verified")
	}
}

func encodePNG(t *testing.T, im image.Image) []byte {
	t.Helper()
	var b bytes.Buffer
	if err := png.Encode(&b, im); err != nil {
		t.Fatal(err)
	}
	return b.Bytes()
}
func encodeJPEG(t *testing.T, im image.Image) []byte {
	t.Helper()
	var b bytes.Buffer
	if err := jpeg.Encode(&b, im, &jpeg.Options{Quality: 95}); err != nil {
		t.Fatal(err)
	}
	return b.Bytes()
}
func mutatePNGDimensions(input []byte, width, height uint32) []byte {
	output := append([]byte(nil), input...)
	binary.BigEndian.PutUint32(output[16:20], width)
	binary.BigEndian.PutUint32(output[20:24], height)
	binary.BigEndian.PutUint32(output[29:33], crc32.ChecksumIEEE(output[12:29]))
	return output
}
func newTestAnalyzer(t *testing.T, cfg Config, capacity int) *Analyzer {
	t.Helper()
	if !validConfig(cfg) || capacity < 1 || capacity > 4 {
		t.Fatal("invalid test analyzer configuration")
	}
	return &Analyzer{config: cfg, slots: make(chan struct{}, capacity)}
}
func mustAnalyze(t *testing.T, analyzer *Analyzer, data []byte, mime string) Result {
	t.Helper()
	result, err := analyzer.Analyze(context.Background(), data, mime)
	if err != nil {
		t.Fatal(err)
	}
	return result
}
func analyzeError(analyzer *Analyzer, ctx context.Context, data []byte, mime string) error {
	_, err := analyzer.Analyze(ctx, data, mime)
	return err
}
func assertCode(t *testing.T, err error, want ErrorCode) {
	t.Helper()
	if got := code(err); got != want {
		t.Fatalf("code=%q want=%q err=%v", got, want, err)
	}
	if err != nil && (strings.Contains(err.Error(), "reader") || strings.Contains(err.Error(), "PNG") || strings.Contains(err.Error(), "JPEG")) {
		t.Fatalf("unsafe error=%q", err)
	}
}
func code(err error) ErrorCode { value, _ := ErrorCodeOf(err); return value }
func hasSuggestion(items []paletteassistant.ColorSuggestion, hex string) bool {
	for _, item := range items {
		if item.Hex == hex {
			return true
		}
	}
	return false
}
func hasEvidenceHex(result Result, hex string) bool {
	for _, item := range append(append([]ColorEvidence{}, result.Evidence.Colors...), result.Evidence.Excluded...) {
		if item.Hex == hex {
			return true
		}
	}
	return false
}
func hasClass(items []ColorEvidence, class string) bool {
	for _, item := range items {
		if item.Classification == class {
			return true
		}
	}
	return false
}
func contains(items []string, value string) bool {
	for _, item := range items {
		if item == value {
			return true
		}
	}
	return false
}
