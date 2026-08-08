package realpilot

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"github.com/qiqi/figcolor/backend/internal/feasibility/imagecolor"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func validFixture() Fixture {
	return Fixture{ID: "real-001", Path: "real-001.png", ChartType: "bar_error", Format: "png", PaletteType: "categorical", AnnotationMethod: "manual-two-pass", ProvenanceCategory: "user-supplied", PermissionStatus: "internal-pilot-only", ExpectedUnordered: []string{"#2078B0"}}
}
func validManifest() Manifest {
	return Manifest{SchemaVersion: 1, PilotID: "real-pilot", AnnotationProtocol: "manual-two-pass-v1", Fixtures: []Fixture{validFixture()}}
}
func pngFile(t *testing.T, root, name string) []byte {
	t.Helper()
	im := image.NewNRGBA(image.Rect(0, 0, 20, 20))
	for y := 0; y < 20; y++ {
		for x := 0; x < 20; x++ {
			im.SetNRGBA(x, y, color.NRGBA{248, 248, 248, 255})
		}
	}
	for y := 5; y < 15; y++ {
		for x := 5; x < 15; x++ {
			im.SetNRGBA(x, y, color.NRGBA{32, 120, 176, 255})
		}
	}
	var b bytes.Buffer
	if err := png.Encode(&b, im); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, name), b.Bytes(), 0600); err != nil {
		t.Fatal(err)
	}
	return b.Bytes()
}
func hasCode(v []Issue, code string) bool {
	for _, x := range v {
		if x.Code == code {
			return true
		}
	}
	return false
}
func TestLoadRejectsMalformedAndUnknown(t *testing.T) {
	for _, body := range []string{"{", `{"schema_version":1,"pilot_id":"x","annotation_protocol":"x","fixtures":[],"unknown":1}`} {
		p := filepath.Join(t.TempDir(), "m.json")
		if err := os.WriteFile(p, []byte(body), 0600); err != nil {
			t.Fatal(err)
		}
		if _, err := Load(p); err == nil {
			t.Fatalf("accepted %s", body)
		}
	}
}
func TestManifestValidation(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*Manifest)
		code   string
	}{
		{"duplicate", func(m *Manifest) { m.Fixtures = append(m.Fixtures, m.Fixtures[0]) }, "FIXTURE_ID_INVALID"},
		{"unsafe", func(m *Manifest) { m.Fixtures[0].Path = "../x.png" }, "PATH_UNSAFE"},
		{"unsupported-name", func(m *Manifest) { m.Fixtures[0].ChartType = "pie" }, "CHART_TYPE_INVALID"},
		{"ordered-mismatch", func(m *Manifest) { m.Fixtures[0].ExpectedOrdered = []string{"#112233"} }, "ORDER_ANNOTATION_INVALID"},
		{"continuous-discrete", func(m *Manifest) { m.Fixtures[0].ContinuousGradient = true }, "CONTINUOUS_DISCRETE_CONFLICT"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			m := validManifest()
			tc.mutate(&m)
			if issues := Validate(m); !hasCode(issues, tc.code) {
				t.Fatalf("%#v", issues)
			}
		})
	}
}
func TestOrderedAndUnorderedAnnotations(t *testing.T) {
	m := validManifest()
	m.Fixtures[0].OrderObservable = true
	m.Fixtures[0].ExpectedOrdered = m.Fixtures[0].ExpectedUnordered
	m.Fixtures[0].ExpectedUnordered = nil
	if issues := Validate(m); len(issues) != 0 {
		t.Fatal(issues)
	}
	m.Fixtures[0].OrderObservable = false
	if !hasCode(Validate(m), "ORDER_ANNOTATION_INVALID") {
		t.Fatal("ordered data accepted without observable order")
	}
}
func TestMissingAndHashMismatch(t *testing.T) {
	d := t.TempDir()
	m := validManifest()
	s := Run(m, d)
	if s.Status != "inputs_missing" || s.Results[0].Status != "unavailable" {
		t.Fatalf("%#v", s)
	}
	b := pngFile(t, d, "real-001.png")
	m.Fixtures[0].SHA256 = stringsRepeat("0", 64)
	s = Run(m, d)
	if s.Results[0].Status != "hash_mismatch" {
		t.Fatalf("%#v", s)
	}
	sum := sha256.Sum256(b)
	m.Fixtures[0].SHA256 = hex.EncodeToString(sum[:])
	s = Run(m, d)
	if s.Results[0].Status != "eligible" {
		t.Fatalf("%#v", s)
	}
}
func stringsRepeat(s string, n int) string {
	var b bytes.Buffer
	for i := 0; i < n; i++ {
		b.WriteString(s)
	}
	return b.String()
}
func TestUnsupportedAndExcludedDenominators(t *testing.T) {
	d := t.TempDir()
	pngFile(t, d, "real-001.png")
	m := validManifest()
	m.Fixtures[0].ChartType = "unsupported"
	s := Run(m, d)
	if s.Results[0].Status != "unsupported" || s.EligibleFigures != 0 {
		t.Fatalf("%#v", s)
	}
	m = validManifest()
	m.Fixtures[0].ExpectedUnordered = nil
	m.Fixtures[0].Ambiguous = []string{"#2078B0"}
	s = Run(m, d)
	if s.Results[0].Status != "excluded" || s.EligibleFigures != 0 {
		t.Fatalf("%#v", s)
	}
	m = validManifest()
	m.Fixtures[0].ExpectedUnordered = nil
	m.Fixtures[0].ContinuousGradient = true
	s = Run(m, d)
	if s.Results[0].Status != "excluded" || s.EligibleFigures != 0 {
		t.Fatalf("%#v", s)
	}
}
func TestDeterministicResultOrdering(t *testing.T) {
	d := t.TempDir()
	pngFile(t, d, "a.png")
	pngFile(t, d, "b.png")
	a, b := validFixture(), validFixture()
	a.ID, a.Path = "b", "b.png"
	b.ID, b.Path = "a", "a.png"
	m := validManifest()
	m.Fixtures = []Fixture{a, b}
	one, two := Run(m, d), Run(m, d)
	if !reflect.DeepEqual(one, two) || one.Results[0].ID != "a" || one.Results[1].ID != "b" {
		t.Fatalf("%#v %#v", one, two)
	}
}
func TestOneToOneMatchingDoesNotReuseCandidate(t *testing.T) {
	c := []imagecolor.Candidate{{Hex: "#101010"}}
	m := GreedyMatch([]string{"#101010", "#111111"}, c)
	if len(m) != 1 || m[0].Candidate != "#101010" {
		t.Fatalf("%#v", m)
	}
}
func TestAggregateArithmetic(t *testing.T) {
	r := []FixtureResult{{Status: "eligible", TP: 2, FP: 1, FN: 1, StructuralFN: 1, Perceptual: []Match{{DeltaE76: .5}, {DeltaE76: 3}}}, {Status: "eligible", TP: 1, FP: 0, FN: 0, Perceptual: []Match{{DeltaE76: 0}}}, {Status: "excluded", TP: 99}}
	s := Aggregate(r)
	if s.TP != 3 || s.FP != 1 || s.FN != 1 || s.StructuralFN != 1 || s.EligibleFigures != 2 || s.ExactSets != 1 || s.ThresholdMatches["1"] != 2 || s.ThresholdMatches["2"] != 2 || s.ThresholdMatches["5"] != 3 || s.ThresholdMatches["10"] != 3 {
		t.Fatalf("%#v", s)
	}
}

func TestPrepareManifestRecordsOnlyFileFacts(t *testing.T) {
	root := t.TempDir()
	for _, id := range []string{"real-002", "real-001"} {
		d := filepath.Join(root, id)
		if err := os.Mkdir(d, 0700); err != nil {
			t.Fatal(err)
		}
		pngFile(t, d, "figure.png")
	}
	a, err := PrepareManifest(root, "pilot-001")
	if err != nil {
		t.Fatal(err)
	}
	b, err := PrepareManifest(root, "pilot-001")
	if err != nil || !reflect.DeepEqual(a, b) {
		t.Fatal("prepare is not deterministic")
	}
	if len(a.Fixtures) != 2 || a.Fixtures[0].ID != "real-001" || a.Fixtures[1].ID != "real-002" {
		t.Fatalf("%#v", a)
	}
	f := a.Fixtures[0]
	if f.Path != "real-001/figure.png" || f.Format != "png" || f.Width != 20 || f.Height != 20 || f.EncodedBytes < 1 || len(f.SHA256) != 64 {
		t.Fatalf("missing facts: %#v", f)
	}
	if f.ChartType != "" || f.PaletteType != "" || f.AnnotationMethod != "" || f.ProvenanceCategory != "" || f.PermissionStatus != "" || f.MayCommit {
		t.Fatalf("semantic defaults must remain empty: %#v", f)
	}
	encoded, err := json.Marshal(a)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Contains(encoded, []byte(`"expected_unordered_data_colors":[]`)) {
		t.Fatalf("draft arrays must be explicit: %s", encoded)
	}
}
func TestWriteManifestDoesNotOverwrite(t *testing.T) {
	p := filepath.Join(t.TempDir(), "pilot-manifest.json")
	m := Manifest{SchemaVersion: 1, PilotID: "x", AnnotationProtocol: "manual-two-pass-v1", Fixtures: []Fixture{}}
	if err := WriteManifest(p, m); err != nil {
		t.Fatal(err)
	}
	before, err := os.ReadFile(p)
	if err != nil {
		t.Fatal(err)
	}
	if err = WriteManifest(p, m); err == nil {
		t.Fatal("overwrote existing manifest")
	}
	after, _ := os.ReadFile(p)
	if !bytes.Equal(before, after) {
		t.Fatal("existing manifest changed")
	}
}
func TestPrepareManifestRejectsUnsafeLayout(t *testing.T) {
	t.Run("unexpected", func(t *testing.T) {
		root := t.TempDir()
		d := filepath.Join(root, "real-001")
		_ = os.Mkdir(d, 0700)
		pngFile(t, d, "figure.png")
		_ = os.WriteFile(filepath.Join(d, "notes.txt"), []byte("x"), 0600)
		if _, err := PrepareManifest(root, "x"); err == nil {
			t.Fatal("accepted unexpected entry")
		}
	})
	t.Run("multiple", func(t *testing.T) {
		root := t.TempDir()
		d := filepath.Join(root, "real-001")
		_ = os.Mkdir(d, 0700)
		pngFile(t, d, "figure.png")
		_ = os.Rename(filepath.Join(d, "figure.png"), filepath.Join(d, "figure.jpg"))
		pngFile(t, d, "figure.png")
		if _, err := PrepareManifest(root, "x"); err == nil {
			t.Fatal("accepted multiple images")
		}
	})
	t.Run("symlink", func(t *testing.T) {
		root := t.TempDir()
		outside := t.TempDir()
		pngFile(t, outside, "figure.png")
		d := filepath.Join(root, "real-001")
		_ = os.Mkdir(d, 0700)
		if err := os.Symlink(filepath.Join(outside, "figure.png"), filepath.Join(d, "figure.png")); err == nil {
			if _, err := PrepareManifest(root, "x"); err == nil {
				t.Fatal("accepted symlink")
			}
		}
	})
	t.Run("signature", func(t *testing.T) {
		root := t.TempDir()
		d := filepath.Join(root, "real-001")
		_ = os.Mkdir(d, 0700)
		pngFile(t, d, "figure.jpg")
		if _, err := PrepareManifest(root, "x"); err == nil {
			t.Fatal("accepted extension/signature mismatch")
		}
	})
	t.Run("unsafe-id", func(t *testing.T) {
		root := t.TempDir()
		d := filepath.Join(root, "Real 001")
		_ = os.Mkdir(d, 0700)
		pngFile(t, d, "figure.png")
		if _, err := PrepareManifest(root, "x"); err == nil {
			t.Fatal("accepted unsafe ID")
		}
	})
}
