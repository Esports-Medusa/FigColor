// Package imageanalysis provides production-owned, transport-independent image
// decoding and deterministic colour evidence for the Palette Assistant.
package imageanalysis

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"image/color"
	_ "image/jpeg"
	_ "image/png"
	"runtime"
	"sort"
	"time"

	"github.com/qiqi/figcolor/backend/internal/paletteassistant"
)

const (
	AlgorithmVersion = "deterministic-image-analysis.v1"
	Producer         = "deterministic_extractor"

	ReasonPixelSupport       = "DETERMINISTIC_PIXEL_SUPPORT"
	ReasonNearBackground     = "NEAR_BACKGROUND_COLOR"
	ReasonLikelyStructural   = "LIKELY_NEUTRAL_STRUCTURAL_COLOR"
	ReasonBelowSupport       = "BELOW_MINIMUM_PIXEL_SUPPORT"
	WarningTransparency      = "TRANSPARENCY_COMPOSITED_TO_WHITE"
	WarningNoUsableDataColor = "NO_USABLE_DATA_COLOR"
)

type ErrorCode string

const (
	ErrorEmptyInput           ErrorCode = "EMPTY_IMAGE"
	ErrorEncodedSizeExceeded  ErrorCode = "ENCODED_IMAGE_SIZE_EXCEEDED"
	ErrorUnsupportedMIME      ErrorCode = "UNSUPPORTED_DECLARED_MIME"
	ErrorUnsupportedFormat    ErrorCode = "UNSUPPORTED_DETECTED_FORMAT"
	ErrorSignatureMismatch    ErrorCode = "IMAGE_SIGNATURE_MISMATCH"
	ErrorDecodeFailed         ErrorCode = "IMAGE_DECODE_FAILED"
	ErrorInvalidDimensions    ErrorCode = "IMAGE_DIMENSIONS_INVALID"
	ErrorWidthExceeded        ErrorCode = "IMAGE_WIDTH_EXCEEDED"
	ErrorHeightExceeded       ErrorCode = "IMAGE_HEIGHT_EXCEEDED"
	ErrorPixelLimitExceeded   ErrorCode = "IMAGE_PIXEL_LIMIT_EXCEEDED"
	ErrorCancelled            ErrorCode = "REQUEST_CANCELLED"
	ErrorDeadlineExceeded     ErrorCode = "ANALYSIS_TIMEOUT"
	ErrorCapacityUnavailable  ErrorCode = "ANALYSIS_OVERLOADED"
	ErrorInvalidConfiguration ErrorCode = "ANALYSIS_CONFIGURATION_INVALID"
	ErrorInternal             ErrorCode = "INTERNAL_ANALYSIS_FAILURE"
)

// AnalysisError deliberately exposes only a stable category, never decoder
// internals or input content.
type AnalysisError struct{ Code ErrorCode }

func (e *AnalysisError) Error() string { return string(e.Code) }

func ErrorCodeOf(err error) (ErrorCode, bool) {
	var target *AnalysisError
	if errors.As(err, &target) {
		return target.Code, true
	}
	return "", false
}

type Config struct {
	AlgorithmVersion   string        `json:"algorithm_version"`
	MaxEncodedBytes    int64         `json:"max_encoded_bytes"`
	MaxWidth           int           `json:"max_width"`
	MaxHeight          int           `json:"max_height"`
	MaxPixels          int64         `json:"max_pixels"`
	AnalysisTimeout    time.Duration `json:"analysis_timeout_ns"`
	CapacityWait       time.Duration `json:"capacity_wait_ns"`
	QuantizeStep       uint8         `json:"quantize_step"`
	MinimumPixelCount  int64         `json:"minimum_pixel_count"`
	NeutralSpread      uint8         `json:"neutral_spread"`
	BackgroundDistance uint8         `json:"background_distance"`
	AlphaBackdrop      string        `json:"alpha_backdrop"`
}

func DefaultConfig() Config {
	return Config{
		AlgorithmVersion: AlgorithmVersion, MaxEncodedBytes: paletteassistant.EncodedImageLimit,
		MaxWidth: paletteassistant.MaximumImageWidth, MaxHeight: paletteassistant.MaximumImageHeight,
		MaxPixels: paletteassistant.MaximumImagePixels, AnalysisTimeout: paletteassistant.AnalysisTimeout,
		CapacityWait: 250 * time.Millisecond, QuantizeStep: 8, MinimumPixelCount: 8,
		NeutralSpread: 12, BackgroundDistance: 8, AlphaBackdrop: "#FFFFFF",
	}
}

type ColorEvidence struct {
	Hex            string   `json:"hex"`
	PixelCount     int64    `json:"pixel_count"`
	Fraction       float64  `json:"fraction"`
	Classification string   `json:"classification"`
	ReasonCodes    []string `json:"reason_codes"`
}

type Evidence struct {
	AlgorithmVersion string          `json:"algorithm_version"`
	Configuration    Config          `json:"configuration"`
	Background       ColorEvidence   `json:"background"`
	Colors           []ColorEvidence `json:"colors"`
	Excluded         []ColorEvidence `json:"excluded"`
	Warnings         []string        `json:"warnings"`
	OutputSHA256     string          `json:"output_sha256"`
}

type Result struct {
	Image            paletteassistant.ImageFacts        `json:"image"`
	ColorSuggestions []paletteassistant.ColorSuggestion `json:"color_suggestions"`
	StructuralColors []paletteassistant.ColorSuggestion `json:"structural_color_suggestions"`
	Evidence         Evidence                           `json:"evidence"`
}

type Analyzer struct {
	config Config
	slots  chan struct{}
	work   func(context.Context, []byte, string) (Result, error)
}

var productionSlots = make(chan struct{}, productionCapacity())

func productionCapacity() int {
	capacity := runtime.GOMAXPROCS(0)
	if capacity > 4 {
		capacity = 4
	}
	if capacity < 1 {
		capacity = 1
	}
	return capacity
}

// New returns an analyzer with the immutable production-v1 policy and the
// package-wide capacity gate shared by every production instance.
func New() *Analyzer {
	return &Analyzer{config: DefaultConfig(), slots: productionSlots}
}

func validConfig(c Config) bool {
	return c.AlgorithmVersion == AlgorithmVersion && c.MaxEncodedBytes > 0 && c.MaxWidth > 0 && c.MaxHeight > 0 && c.MaxPixels > 0 &&
		c.AnalysisTimeout > 0 && c.CapacityWait > 0 && c.QuantizeStep > 0 && c.MinimumPixelCount > 0 &&
		c.AlphaBackdrop == "#FFFFFF"
}

// Analyze accepts only complete in-memory bytes. The future transport adapter
// must perform its own multipart limit+1 read; this boundary independently
// enforces the frozen encoded-image length before copying or decoding.
func (a *Analyzer) Analyze(parent context.Context, encoded []byte, declaredMIME string) (Result, error) {
	if a == nil || a.slots == nil || !validConfig(a.config) || parent == nil {
		return Result{}, &AnalysisError{Code: ErrorInvalidConfiguration}
	}
	if len(encoded) == 0 {
		return Result{}, &AnalysisError{Code: ErrorEmptyInput}
	}
	if int64(len(encoded)) > a.config.MaxEncodedBytes {
		return Result{}, &AnalysisError{Code: ErrorEncodedSizeExceeded}
	}
	if _, ok := mimeFormat(declaredMIME); !ok {
		return Result{}, &AnalysisError{Code: ErrorUnsupportedMIME}
	}
	// The worker may outlive the caller until a finite standard-library decode
	// returns, so it must not observe caller mutation after Analyze returns.
	data := append([]byte(nil), encoded...)
	ctx, cancel := context.WithTimeout(parent, a.config.AnalysisTimeout)
	defer cancel()
	if err := a.acquire(ctx); err != nil {
		return Result{}, err
	}
	type outcome struct {
		result Result
		err    error
	}
	done := make(chan outcome, 1)
	go func() {
		defer func() { <-a.slots }()
		var value outcome
		defer func() {
			if recover() != nil {
				value = outcome{err: &AnalysisError{Code: ErrorInternal}}
			}
			done <- value
		}()
		if a.work != nil {
			value.result, value.err = a.work(ctx, data, declaredMIME)
		} else {
			value.result, value.err = a.analyze(ctx, data, declaredMIME)
		}
	}()
	select {
	case value := <-done:
		return value.result, value.err
	case <-ctx.Done():
		// A finite-byte decoder cannot be interrupted internally. Its worker keeps
		// the global slot until it exits; this bounds post-timeout work and prevents
		// timed-out requests from spawning an unbounded number of goroutines.
		return Result{}, contextError(ctx.Err())
	}
}

func (a *Analyzer) acquire(ctx context.Context) error {
	timer := time.NewTimer(a.config.CapacityWait)
	defer timer.Stop()
	select {
	case a.slots <- struct{}{}:
		return nil
	case <-ctx.Done():
		return contextError(ctx.Err())
	case <-timer.C:
		return &AnalysisError{Code: ErrorCapacityUnavailable}
	}
}

func (a *Analyzer) analyze(ctx context.Context, data []byte, declaredMIME string) (Result, error) {
	wantFormat, ok := mimeFormat(declaredMIME)
	if !ok {
		return Result{}, &AnalysisError{Code: ErrorUnsupportedMIME}
	}
	detected := signatureFormat(data)
	if detected == "" {
		return Result{}, &AnalysisError{Code: ErrorUnsupportedFormat}
	}
	if detected != wantFormat {
		return Result{}, &AnalysisError{Code: ErrorSignatureMismatch}
	}
	decodedConfig, configFormat, decodeErr := image.DecodeConfig(bytes.NewReader(data))
	if decodeErr != nil {
		return Result{}, &AnalysisError{Code: ErrorDecodeFailed}
	}
	if !formatsAgree(wantFormat, detected, configFormat) {
		return Result{}, &AnalysisError{Code: ErrorSignatureMismatch}
	}
	if err := validateDimensions(decodedConfig.Width, decodedConfig.Height, a.config); err != nil {
		return Result{}, err
	}
	if err := contextError(ctx.Err()); err != nil {
		return Result{}, err
	}
	decoded, fullFormat, decodeErr := image.Decode(bytes.NewReader(data))
	if decodeErr != nil {
		return Result{}, &AnalysisError{Code: ErrorDecodeFailed}
	}
	if fullFormat != detected {
		return Result{}, &AnalysisError{Code: ErrorSignatureMismatch}
	}
	if !decodedBoundsAgree(decoded, decodedConfig.Width, decodedConfig.Height) {
		return Result{}, &AnalysisError{Code: ErrorDecodeFailed}
	}
	return a.extract(ctx, data, decoded, detected, decodedConfig.Width, decodedConfig.Height)
}

func decodedBoundsAgree(decoded image.Image, width, height int) bool {
	if decoded == nil {
		return false
	}
	actual := decoded.Bounds()
	return actual.Dx() == width && actual.Dy() == height
}

func formatsAgree(declared, signature, configured string) bool {
	return declared == signature && signature == configured
}

func mimeFormat(mime string) (string, bool) {
	switch mime {
	case "image/png":
		return paletteassistant.ImageFormatPNG, true
	case "image/jpeg":
		return paletteassistant.ImageFormatJPEG, true
	default:
		return "", false
	}
}

func signatureFormat(data []byte) string {
	if len(data) >= 8 && bytes.Equal(data[:8], []byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'}) {
		return paletteassistant.ImageFormatPNG
	}
	if len(data) >= 3 && data[0] == 0xff && data[1] == 0xd8 && data[2] == 0xff {
		return paletteassistant.ImageFormatJPEG
	}
	return ""
}

func validateDimensions(width, height int, config Config) error {
	if width <= 0 || height <= 0 {
		return &AnalysisError{Code: ErrorInvalidDimensions}
	}
	if width > config.MaxWidth {
		return &AnalysisError{Code: ErrorWidthExceeded}
	}
	if height > config.MaxHeight {
		return &AnalysisError{Code: ErrorHeightExceeded}
	}
	if int64(width) > config.MaxPixels/int64(height) {
		return &AnalysisError{Code: ErrorPixelLimitExceeded}
	}
	return nil
}

func contextError(err error) error {
	switch {
	case err == nil:
		return nil
	case errors.Is(err, context.DeadlineExceeded):
		return &AnalysisError{Code: ErrorDeadlineExceeded}
	default:
		return &AnalysisError{Code: ErrorCancelled}
	}
}

func (a *Analyzer) extract(ctx context.Context, encoded []byte, decoded image.Image, format string, width, height int) (Result, error) {
	counts := make(map[[3]uint8]int64)
	cornerCounts := make(map[[3]uint8]int64)
	quantize := func(value uint8) uint8 { return value / a.config.QuantizeStep * a.config.QuantizeStep }
	transparent := false
	for y := 0; y < height; y++ {
		if y&31 == 0 {
			if err := contextError(ctx.Err()); err != nil {
				return Result{}, err
			}
		}
		for x := 0; x < width; x++ {
			n := color.NRGBAModel.Convert(decoded.At(x, y)).(color.NRGBA)
			if n.A < 255 {
				transparent = true
			}
			a := uint32(n.A)
			compose := func(channel uint8) uint8 { return uint8((uint32(channel)*a + 255*(255-a) + 127) / 255) }
			rgb := [3]uint8{quantize(compose(n.R)), quantize(compose(n.G)), quantize(compose(n.B))}
			counts[rgb]++
			if (x == 0 || x == width-1) && (y == 0 || y == height-1) {
				cornerCounts[rgb]++
			}
		}
	}
	background := selectBackground(cornerCounts)
	total := int64(width) * int64(height)
	colors := make([]ColorEvidence, 0, len(counts))
	excluded := make([]ColorEvidence, 0)
	for rgb, count := range counts {
		item := ColorEvidence{Hex: canonicalHex(rgb), PixelCount: count, Fraction: float64(count) / float64(total)}
		switch {
		case count < a.config.MinimumPixelCount:
			item.Classification, item.ReasonCodes = "excluded", []string{ReasonBelowSupport}
			excluded = append(excluded, item)
		case maxDistance(rgb, background) <= a.config.BackgroundDistance:
			item.Classification, item.ReasonCodes = "background", []string{ReasonNearBackground}
			excluded = append(excluded, item)
		case channelSpread(rgb) <= a.config.NeutralSpread:
			item.Classification, item.ReasonCodes = "structural", []string{ReasonLikelyStructural}
			colors = append(colors, item)
		default:
			item.Classification, item.ReasonCodes = "data", []string{ReasonPixelSupport}
			colors = append(colors, item)
		}
	}
	stableOrder(colors)
	stableOrder(excluded)
	warnings := make([]string, 0, 2)
	if transparent {
		warnings = append(warnings, WarningTransparency)
	}
	result := Result{
		Image:            paletteassistant.ImageFacts{Format: format, EncodedBytes: int64(len(encoded)), Width: width, Height: height, PixelCount: total, HasTransparency: transparent, AlphaBackdrop: "#FFFFFF", SHA256: sha256Hex(encoded)},
		ColorSuggestions: make([]paletteassistant.ColorSuggestion, 0), StructuralColors: make([]paletteassistant.ColorSuggestion, 0),
		Evidence: Evidence{AlgorithmVersion: a.config.AlgorithmVersion, Configuration: a.config, Background: ColorEvidence{Hex: canonicalHex(background), PixelCount: counts[background], Fraction: float64(counts[background]) / float64(total), Classification: "background", ReasonCodes: []string{ReasonNearBackground}}, Colors: colors, Excluded: excluded, Warnings: warnings},
	}
	for _, item := range colors {
		suggestion := paletteassistant.ColorSuggestion{ID: suggestionID(a.config.AlgorithmVersion, item.Classification, item.Hex), Hex: item.Hex, PixelCount: item.PixelCount, Fraction: item.Fraction, Producer: Producer, AlgorithmVersion: a.config.AlgorithmVersion, ReasonCodes: append([]string(nil), item.ReasonCodes...)}
		if item.Classification == "structural" {
			result.StructuralColors = append(result.StructuralColors, suggestion)
		} else {
			result.ColorSuggestions = append(result.ColorSuggestions, suggestion)
		}
	}
	if len(result.ColorSuggestions) == 0 {
		result.Evidence.Warnings = append(result.Evidence.Warnings, WarningNoUsableDataColor)
	}
	result.Evidence.OutputSHA256 = outputHash(result)
	return result, nil
}

func selectBackground(counts map[[3]uint8]int64) [3]uint8 {
	keys := make([][3]uint8, 0, len(counts))
	for key := range counts {
		keys = append(keys, key)
	}
	sort.Slice(keys, func(i, j int) bool {
		if counts[keys[i]] != counts[keys[j]] {
			return counts[keys[i]] > counts[keys[j]]
		}
		return canonicalHex(keys[i]) < canonicalHex(keys[j])
	})
	return keys[0]
}

func stableOrder(items []ColorEvidence) {
	sort.Slice(items, func(i, j int) bool {
		if items[i].PixelCount != items[j].PixelCount {
			return items[i].PixelCount > items[j].PixelCount
		}
		return items[i].Hex < items[j].Hex
	})
}

func canonicalHex(rgb [3]uint8) string { return fmt.Sprintf("#%02X%02X%02X", rgb[0], rgb[1], rgb[2]) }
func suggestionID(version, classification, value string) string {
	sum := sha256.Sum256([]byte(version + "|" + classification + "|" + value))
	return "color-" + hex.EncodeToString(sum[:8])
}
func sha256Hex(value []byte) string { sum := sha256.Sum256(value); return hex.EncodeToString(sum[:]) }
func outputHash(result Result) string {
	copy := result
	copy.Evidence.OutputSHA256 = ""
	// Result contains only finite numbers, strings, slices, and structs; no
	// custom marshaler or unsupported JSON value can enter this internal type.
	encoded, err := json.Marshal(copy)
	if err != nil {
		panic("imageanalysis: invariant result encoding failed")
	}
	return sha256Hex(encoded)
}
func maxDistance(a, b [3]uint8) uint8 {
	var result uint8
	for i := range a {
		d := a[i]
		if b[i] > a[i] {
			d = b[i] - a[i]
		} else {
			d = a[i] - b[i]
		}
		if d > result {
			result = d
		}
	}
	return result
}
func channelSpread(rgb [3]uint8) uint8 {
	minimum, maximum := rgb[0], rgb[0]
	for _, value := range rgb[1:] {
		if value < minimum {
			minimum = value
		}
		if value > maximum {
			maximum = value
		}
	}
	return maximum - minimum
}
