// Package imagecolor is a feasibility-only deterministic image colour extractor.
// It is intentionally disconnected from palette ingestion and production APIs.
package imagecolor

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"image"
	"image/color"
	_ "image/gif" // register so valid unsupported bytes are identified as unsupported
	_ "image/jpeg"
	_ "image/png"
	"io"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

type Config struct {
	Version                                                    string
	MaxBytes                                                   int64
	MaxWidth, MaxHeight, MaxPixels                             int
	QuantizeStep, MinPixels, NeutralSpread, BackgroundDistance int
	AlphaBackdrop                                              [3]uint8
}

var DefaultConfig = Config{"feasibility-v2", 2 << 20, 4096, 4096, 8_000_000, 8, 8, 12, 8, [3]uint8{255, 255, 255}}

type Candidate struct {
	Hex            string  `json:"hex"`
	Pixels         int     `json:"pixels"`
	Fraction       float64 `json:"fraction"`
	Classification string  `json:"classification"`
}
type DecoderFacts struct {
	Format                string `json:"format"`
	Width, Height, Pixels int
	Bytes                 int64 `json:"bytes"`
	HasTransparency       bool  `json:"has_transparency"`
}
type EffectiveConfig struct {
	Version                                                    string `json:"version"`
	MaxBytes                                                   int64  `json:"max_bytes"`
	MaxWidth, MaxHeight, MaxPixels                             int
	QuantizeStep, MinPixels, NeutralSpread, BackgroundDistance int
	AlphaBackdrop                                              string `json:"alpha_backdrop"`
}
type Result struct {
	Success                  bool         `json:"success"`
	InputSHA256              string       `json:"input_sha256,omitempty"`
	Decoder                  DecoderFacts `json:"decoder"`
	Background               string       `json:"background,omitempty"`
	Candidates, Structural   []Candidate
	Warnings, BlockingIssues []string
	Configuration            EffectiveConfig `json:"configuration"`
	OutputHash               string          `json:"output_hash,omitempty"`
}

func effective(cfg Config) EffectiveConfig {
	return EffectiveConfig{cfg.Version, cfg.MaxBytes, cfg.MaxWidth, cfg.MaxHeight, cfg.MaxPixels, cfg.QuantizeStep, cfg.MinPixels, cfg.NeutralSpread, cfg.BackgroundDistance, hexColor(cfg.AlphaBackdrop)}
}
func validateConfig(c Config) string {
	if c.Version == "" || c.MaxBytes < 1 || c.MaxWidth < 1 || c.MaxHeight < 1 || c.MaxPixels < 1 || c.QuantizeStep < 1 || c.QuantizeStep > 255 || c.MinPixels < 1 || c.NeutralSpread < 0 || c.NeutralSpread > 255 || c.BackgroundDistance < 0 || c.BackgroundDistance > 255 {
		return "CONFIG_INVALID"
	}
	return ""
}

func ExtractFile(root, relative string, cfg Config) Result {
	if code := validateConfig(cfg); code != "" {
		return failure(code, cfg)
	}
	if relative == "" || filepath.IsAbs(relative) {
		return failure("UNSAFE_PATH", cfg)
	}
	rootReal, err := filepath.EvalSymlinks(root)
	if err != nil {
		return failure("UNSAFE_ROOT", cfg)
	}
	target := filepath.Join(rootReal, filepath.Clean(relative))
	rel, err := filepath.Rel(rootReal, target)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return failure("UNSAFE_PATH", cfg)
	}
	info, err := os.Lstat(target)
	if err != nil || !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 {
		return failure("UNSAFE_PATH", cfg)
	}
	real, err := filepath.EvalSymlinks(target)
	if err != nil || real != target {
		return failure("UNSAFE_PATH", cfg)
	}
	f, err := os.Open(real)
	if err != nil {
		return failure("READ_FAILED", cfg)
	}
	defer f.Close()
	return Extract(f, info.Size(), strings.ToLower(filepath.Ext(real)), cfg)
}

func Extract(r io.Reader, size int64, extension string, cfg Config) Result {
	if code := validateConfig(cfg); code != "" {
		return failure(code, cfg)
	}
	if size < 1 || size > cfg.MaxBytes {
		return failure("FILE_SIZE_REJECTED", cfg)
	}
	b, err := io.ReadAll(io.LimitReader(r, cfg.MaxBytes+1))
	if err != nil || int64(len(b)) != size {
		return failure("READ_FAILED", cfg)
	}
	sum := sha256.Sum256(b)
	identity := hex.EncodeToString(sum[:])
	c, format, err := image.DecodeConfig(bytes.NewReader(b))
	if err != nil {
		return failureWithID("INVALID_IMAGE", identity, cfg)
	}
	if format != "png" && format != "jpeg" {
		return failureWithID("UNSUPPORTED_FORMAT", identity, cfg)
	}
	want := map[string]string{".png": "png", ".jpg": "jpeg", ".jpeg": "jpeg"}[extension]
	if want == "" || want != format {
		return failureWithID("SIGNATURE_EXTENSION_MISMATCH", identity, cfg)
	}
	if c.Width < 1 || c.Height < 1 || c.Width > cfg.MaxWidth || c.Height > cfg.MaxHeight || c.Width > cfg.MaxPixels/c.Height {
		return failureWithID("DIMENSIONS_REJECTED", identity, cfg)
	}
	img, format2, err := image.Decode(bytes.NewReader(b))
	if err != nil || format2 != format {
		return failureWithID("DECODE_FAILED", identity, cfg)
	}
	counts := map[[3]uint8]int{}
	alpha := false
	quant := func(v uint8) uint8 { return uint8(int(v) / cfg.QuantizeStep * cfg.QuantizeStep) }
	pixel := func(x, y int) [3]uint8 {
		// NRGBAModel converts premultiplied RGBA() channels back to straight colour.
		n := color.NRGBAModel.Convert(img.At(x, y)).(color.NRGBA)
		if n.A < 255 {
			alpha = true
		}
		a := uint32(n.A)
		compose := func(src, bg uint8) uint8 { return uint8((uint32(src)*a + uint32(bg)*(255-a) + 127) / 255) }
		return [3]uint8{quant(compose(n.R, cfg.AlphaBackdrop[0])), quant(compose(n.G, cfg.AlphaBackdrop[1])), quant(compose(n.B, cfg.AlphaBackdrop[2]))}
	}
	for y := 0; y < c.Height; y++ {
		for x := 0; x < c.Width; x++ {
			counts[pixel(x, y)]++
		}
	}
	corners := [][2]int{{0, 0}, {c.Width - 1, 0}, {0, c.Height - 1}, {c.Width - 1, c.Height - 1}}
	cornerCounts := map[[3]uint8]int{}
	for _, p := range corners {
		cornerCounts[pixel(p[0], p[1])]++
	}
	bg := [3]uint8{}
	for k, v := range cornerCounts {
		if v > cornerCounts[bg] {
			bg = k
		}
	}
	total := c.Width * c.Height
	var data, structural []Candidate
	for rgb, n := range counts {
		if n < cfg.MinPixels || distance(rgb, bg) <= cfg.BackgroundDistance {
			continue
		}
		class := "data"
		if int(max3(rgb)-min3(rgb)) <= cfg.NeutralSpread {
			class = "structural"
		}
		item := Candidate{hexColor(rgb), n, float64(n) / float64(total), class}
		if class == "data" {
			data = append(data, item)
		} else {
			structural = append(structural, item)
		}
	}
	order := func(a []Candidate) {
		sort.Slice(a, func(i, j int) bool {
			if a[i].Pixels != a[j].Pixels {
				return a[i].Pixels > a[j].Pixels
			}
			return a[i].Hex < a[j].Hex
		})
	}
	order(data)
	order(structural)
	warnings := []string{}
	if alpha {
		warnings = append(warnings, "TRANSPARENCY_COMPOSITED_TO_CONFIGURED_BACKDROP")
	}
	res := Result{true, identity, DecoderFacts{format, c.Width, c.Height, total, size, alpha}, hexColor(bg), data, structural, warnings, nil, effective(cfg), ""}
	res.OutputHash = hashResult(res)
	return res
}
func failure(code string, cfg Config) Result {
	return Result{Success: false, BlockingIssues: []string{code}, Configuration: effective(cfg)}
}
func failureWithID(code, id string, cfg Config) Result {
	r := failure(code, cfg)
	r.InputSHA256 = id
	return r
}
func distance(a, b [3]uint8) int {
	d := 0
	for i := range a {
		x := int(a[i]) - int(b[i])
		if x < 0 {
			x = -x
		}
		if x > d {
			d = x
		}
	}
	return d
}
func min3(v [3]uint8) uint8 {
	m := v[0]
	if v[1] < m {
		m = v[1]
	}
	if v[2] < m {
		m = v[2]
	}
	return m
}
func max3(v [3]uint8) uint8 {
	m := v[0]
	if v[1] > m {
		m = v[1]
	}
	if v[2] > m {
		m = v[2]
	}
	return m
}
func hexColor(v [3]uint8) string { return fmt.Sprintf("#%02X%02X%02X", v[0], v[1], v[2]) }
func DeltaE76(a, b [3]uint8) float64 {
	toLab := func(v [3]uint8) [3]float64 {
		linear := func(x uint8) float64 {
			n := float64(x) / 255
			if n <= .04045 {
				return n / 12.92
			}
			return math.Pow((n+.055)/1.055, 2.4)
		}
		r, g, bl := linear(v[0]), linear(v[1]), linear(v[2])
		x := (.4124*r + .3576*g + .1805*bl) / .95047
		y := .2126*r + .7152*g + .0722*bl
		z := (.0193*r + .1192*g + .9505*bl) / 1.08883
		f := func(q float64) float64 {
			if q > .008856 {
				return math.Cbrt(q)
			}
			return 7.787*q + 16.0/116
		}
		return [3]float64{116*f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))}
	}
	x, y := toLab(a), toLab(b)
	return math.Sqrt((x[0]-y[0])*(x[0]-y[0]) + (x[1]-y[1])*(x[1]-y[1]) + (x[2]-y[2])*(x[2]-y[2]))
}
func hashResult(r Result) string {
	h := sha256.New()
	c := r.Configuration
	fmt.Fprintf(h, "input=%s|format=%s|background=%s|version=%s|max_bytes=%d|max_width=%d|max_height=%d|max_pixels=%d|quantize=%d|min_pixels=%d|neutral=%d|background_distance=%d|alpha_backdrop=%s|", r.InputSHA256, r.Decoder.Format, r.Background, c.Version, c.MaxBytes, c.MaxWidth, c.MaxHeight, c.MaxPixels, c.QuantizeStep, c.MinPixels, c.NeutralSpread, c.BackgroundDistance, c.AlphaBackdrop)
	for _, w := range r.Warnings {
		fmt.Fprintf(h, "warning=%s|", w)
	}
	for _, v := range append(append([]Candidate{}, r.Candidates...), r.Structural...) {
		fmt.Fprintf(h, "%s:%d:%s|", v.Hex, v.Pixels, v.Classification)
	}
	return hex.EncodeToString(h.Sum(nil))
}
