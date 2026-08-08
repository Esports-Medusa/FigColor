package imagecolor

import (
	"bytes"
	"image"
	"image/color"
	"image/gif"
	"image/jpeg"
	"image/png"
	"os"
	"path/filepath"
	"testing"
)

func encodePNG(t *testing.T, im image.Image) []byte {
	t.Helper()
	var b bytes.Buffer
	if err := png.Encode(&b, im); err != nil {
		t.Fatal(err)
	}
	return b.Bytes()
}
func basicFixture(t *testing.T) []byte {
	im := image.NewNRGBA(image.Rect(0, 0, 80, 60))
	fill(im, color.NRGBA{248, 248, 244, 255})
	for x := 8; x < 72; x++ {
		im.Set(x, 50, color.NRGBA{40, 40, 40, 255})
	}
	cs := []color.NRGBA{{32, 120, 180, 255}, {230, 90, 60, 255}, {80, 170, 100, 255}}
	for i, c := range cs {
		rect(im, 12+i*20, 15, 22+i*20, 48, c)
	}
	return encodePNG(t, im)
}

func TestAlphaCompositingUsesStraightChannelsAndConfiguredBackdrop(t *testing.T) {
	im := image.NewNRGBA(image.Rect(0, 0, 3, 3))
	fill(im, color.NRGBA{0, 0, 0, 255})
	im.SetNRGBA(1, 1, color.NRGBA{255, 0, 0, 128})
	b := encodePNG(t, im)
	cfg := DefaultConfig
	cfg.QuantizeStep = 1
	cfg.MinPixels = 1
	cfg.AlphaBackdrop = [3]uint8{0, 0, 255}
	r := Extract(bytes.NewReader(b), int64(len(b)), ".png", cfg)
	if !r.Success || !r.Decoder.HasTransparency {
		t.Fatalf("%#v", r)
	}
	if len(r.Candidates) != 1 || r.Candidates[0].Hex != "#80007F" {
		t.Fatalf("want exact red-50%% over blue #80007F, got %#v", r.Candidates)
	}
	if len(r.Warnings) != 1 || r.Warnings[0] != "TRANSPARENCY_COMPOSITED_TO_CONFIGURED_BACKDROP" {
		t.Fatalf("missing evidence: %#v", r.Warnings)
	}
	white := cfg
	white.AlphaBackdrop = [3]uint8{255, 255, 255}
	rw := Extract(bytes.NewReader(b), int64(len(b)), ".png", white)
	if len(rw.Candidates) != 1 || rw.Candidates[0].Hex != "#FF7F7F" {
		t.Fatalf("want #FF7F7F, got %#v", rw.Candidates)
	}
}

func TestOutputHashBindsCompleteConfiguration(t *testing.T) {
	b := basicFixture(t)
	a := Extract(bytes.NewReader(b), int64(len(b)), ".png", DefaultConfig)
	again := Extract(bytes.NewReader(b), int64(len(b)), ".png", DefaultConfig)
	if !a.Success || a.OutputHash != again.OutputHash {
		t.Fatal("same bytes/config not stable")
	}
	cfg := DefaultConfig
	cfg.MaxPixels--
	different := Extract(bytes.NewReader(b), int64(len(b)), ".png", cfg)
	if !different.Success || a.OutputHash == different.OutputHash {
		t.Fatal("effective configuration not bound to identity")
	}
	cfg = DefaultConfig
	cfg.Version = "feasibility-v2-test"
	versioned := Extract(bytes.NewReader(b), int64(len(b)), ".png", cfg)
	if a.OutputHash == versioned.OutputHash {
		t.Fatal("version not bound to identity")
	}
}

func TestDecoderRejections(t *testing.T) {
	pngBytes := basicFixture(t)
	im := image.NewNRGBA(image.Rect(0, 0, 20, 20))
	fill(im, color.NRGBA{20, 30, 40, 255})
	var jb bytes.Buffer
	if err := jpeg.Encode(&jb, im, nil); err != nil {
		t.Fatal(err)
	}
	var gb bytes.Buffer
	if err := gif.Encode(&gb, im, nil); err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		name      string
		b         []byte
		ext, code string
		cfg       Config
	}{
		{"invalid", []byte("no"), ".png", "INVALID_IMAGE", DefaultConfig},
		{"truncated_png", pngBytes[:len(pngBytes)-12], ".png", "DECODE_FAILED", DefaultConfig},
		{"truncated_jpeg", jb.Bytes()[:jb.Len()-12], ".jpg", "DECODE_FAILED", DefaultConfig},
		{"valid_unsupported_gif", gb.Bytes(), ".gif", "UNSUPPORTED_FORMAT", DefaultConfig},
		{"misleading_extension", pngBytes, ".jpg", "SIGNATURE_EXTENSION_MISMATCH", DefaultConfig},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			r := Extract(bytes.NewReader(tc.b), int64(len(tc.b)), tc.ext, tc.cfg)
			if r.Success || len(r.BlockingIssues) != 1 || r.BlockingIssues[0] != tc.code {
				t.Fatalf("%#v", r)
			}
		})
	}
}

func TestDimensionAndPixelLimits(t *testing.T) {
	for _, tc := range []struct {
		name   string
		w, h   int
		mutate func(*Config)
	}{{"width", 11, 2, func(c *Config) { c.MaxWidth = 10 }}, {"height", 2, 11, func(c *Config) { c.MaxHeight = 10 }}, {"pixels", 8, 8, func(c *Config) { c.MaxPixels = 63 }}} {
		t.Run(tc.name, func(t *testing.T) {
			im := image.NewNRGBA(image.Rect(0, 0, tc.w, tc.h))
			b := encodePNG(t, im)
			cfg := DefaultConfig
			tc.mutate(&cfg)
			r := Extract(bytes.NewReader(b), int64(len(b)), ".png", cfg)
			if r.Success || r.BlockingIssues[0] != "DIMENSIONS_REJECTED" {
				t.Fatalf("%#v", r)
			}
		})
	}
}

func TestMalformedConfiguration(t *testing.T) {
	mutations := []func(*Config){func(c *Config) { c.Version = "" }, func(c *Config) { c.MaxBytes = 0 }, func(c *Config) { c.MaxWidth = 0 }, func(c *Config) { c.MaxHeight = 0 }, func(c *Config) { c.MaxPixels = 0 }, func(c *Config) { c.QuantizeStep = 0 }, func(c *Config) { c.MinPixels = 0 }, func(c *Config) { c.NeutralSpread = -1 }, func(c *Config) { c.BackgroundDistance = -1 }}
	for i, m := range mutations {
		cfg := DefaultConfig
		m(&cfg)
		r := Extract(bytes.NewReader([]byte("x")), 1, ".png", cfg)
		if r.Success || r.BlockingIssues[0] != "CONFIG_INVALID" {
			t.Fatalf("case %d: %#v", i, r)
		}
	}
}

func TestFileSizePathAndSymlink(t *testing.T) {
	if r := Extract(bytes.NewReader([]byte("x")), DefaultConfig.MaxBytes+1, ".png", DefaultConfig); r.Success || r.BlockingIssues[0] != "FILE_SIZE_REJECTED" {
		t.Fatal(r)
	}
	d := t.TempDir()
	b := basicFixture(t)
	if err := os.WriteFile(filepath.Join(d, "ok.png"), b, 0600); err != nil {
		t.Fatal(err)
	}
	if !ExtractFile(d, "ok.png", DefaultConfig).Success {
		t.Fatal("valid path rejected")
	}
	if ExtractFile(d, "../outside.png", DefaultConfig).Success {
		t.Fatal("traversal accepted")
	}
	if err := os.Symlink(filepath.Join(d, "ok.png"), filepath.Join(d, "link.png")); err == nil && ExtractFile(d, "link.png", DefaultConfig).Success {
		t.Fatal("symlink accepted")
	}
}

func TestPerceptualDistance(t *testing.T) {
	if DeltaE76([3]uint8{40, 120, 184}, [3]uint8{40, 120, 184}) != 0 || DeltaE76([3]uint8{40, 120, 184}, [3]uint8{230, 80, 60}) < 20 {
		t.Fatal("unexpected Delta E behavior")
	}
}
