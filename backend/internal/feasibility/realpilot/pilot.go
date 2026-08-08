// Package realpilot prepares and runs the evidence-only real scientific-figure pilot.
// It is deliberately disconnected from production ingestion, HTTP, and databases.
package realpilot

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/qiqi/figcolor/backend/internal/feasibility/imagecolor"
)

var chartTypes = map[string]bool{"bar_error": true, "boxplot_jitter": true, "line_multiseries": true, "heatmap_annotated": true, "scatter_grouped": true, "violin_distribution": true, "unsupported": true}

type Manifest struct {
	SchemaVersion      int       `json:"schema_version"`
	PilotID            string    `json:"pilot_id"`
	AnnotationProtocol string    `json:"annotation_protocol"`
	Fixtures           []Fixture `json:"fixtures"`
}
type Fixture struct {
	ID, Path, SHA256, ChartType, Format, PaletteType, AnnotationMethod, Transformation, ProvenanceCategory, PermissionStatus string
	Width, Height                                                                                                            int
	EncodedBytes                                                                                                             int64
	MayCommit, OrderObservable                                                                                               bool
	ExpectedOrdered, ExpectedUnordered, Structural, Ambiguous                                                                []string
	ContinuousGradient                                                                                                       bool
	Notes                                                                                                                    string
}

func (f *Fixture) UnmarshalJSON(b []byte) error {
	type alias Fixture
	var x struct {
		alias
		ID                 string   `json:"id"`
		Path               string   `json:"path"`
		SHA256             string   `json:"sha256"`
		ChartType          string   `json:"chart_type"`
		Format             string   `json:"format"`
		PaletteType        string   `json:"palette_type"`
		AnnotationMethod   string   `json:"annotation_method"`
		Transformation     string   `json:"transformation"`
		ProvenanceCategory string   `json:"provenance_category"`
		PermissionStatus   string   `json:"permission_status"`
		Width              int      `json:"width"`
		Height             int      `json:"height"`
		EncodedBytes       int64    `json:"encoded_bytes"`
		MayCommit          bool     `json:"may_commit"`
		OrderObservable    bool     `json:"order_observable"`
		ExpectedOrdered    []string `json:"expected_ordered_data_colors"`
		ExpectedUnordered  []string `json:"expected_unordered_data_colors"`
		Structural         []string `json:"expected_structural_colors"`
		Ambiguous          []string `json:"ambiguous_colors"`
		ContinuousGradient bool     `json:"continuous_gradient"`
		Notes              string   `json:"notes"`
	}
	if err := json.Unmarshal(b, &x); err != nil {
		return err
	}
	*f = Fixture{ID: x.ID, Path: x.Path, SHA256: x.SHA256, ChartType: x.ChartType, Format: x.Format, PaletteType: x.PaletteType, AnnotationMethod: x.AnnotationMethod, Transformation: x.Transformation, ProvenanceCategory: x.ProvenanceCategory, PermissionStatus: x.PermissionStatus, Width: x.Width, Height: x.Height, EncodedBytes: x.EncodedBytes, MayCommit: x.MayCommit, OrderObservable: x.OrderObservable, ExpectedOrdered: x.ExpectedOrdered, ExpectedUnordered: x.ExpectedUnordered, Structural: x.Structural, Ambiguous: x.Ambiguous, ContinuousGradient: x.ContinuousGradient, Notes: x.Notes}
	return nil
}

type Issue struct{ FixtureID, Code, Message string }
type FixtureResult struct {
	ID, Status               string
	Extraction               imagecolor.Result
	TP, FP, FN, StructuralFN int
	Perceptual               []Match
}
type Match struct {
	Expected, Candidate string
	DeltaE76            float64
}
type Summary struct {
	Status                                               string
	Results                                              []FixtureResult
	Issues                                               []Issue
	TP, FP, FN, StructuralFN, EligibleFigures, ExactSets int
	ThresholdMatches                                     map[string]int
}

func Load(path string) (Manifest, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return Manifest{}, err
	}
	var m Manifest
	d := json.NewDecoder(bytes.NewReader(b))
	d.DisallowUnknownFields()
	if err = d.Decode(&m); err != nil {
		return Manifest{}, err
	}
	return m, nil
}
func Validate(m Manifest) []Issue {
	var out []Issue
	if m.SchemaVersion != 1 {
		out = append(out, Issue{"", "SCHEMA_VERSION", "schema_version must be 1"})
	}
	if m.PilotID == "" {
		out = append(out, Issue{"", "PILOT_ID_REQUIRED", "pilot_id is required"})
	}
	seen := map[string]bool{}
	for _, f := range m.Fixtures {
		add := func(code, msg string) { out = append(out, Issue{f.ID, code, msg}) }
		if f.ID == "" || seen[f.ID] {
			add("FIXTURE_ID_INVALID", "fixture IDs must be non-empty and unique")
		}
		seen[f.ID] = true
		if !chartTypes[f.ChartType] {
			add("CHART_TYPE_INVALID", "chart_type must be registered or unsupported")
		}
		if f.Path == "" || filepath.IsAbs(f.Path) || strings.HasPrefix(filepath.Clean(f.Path), ".."+string(filepath.Separator)) || filepath.Clean(f.Path) == ".." {
			add("PATH_UNSAFE", "path must be a contained relative path")
		}
		if f.Format != "png" && f.Format != "jpeg" {
			add("FORMAT_INVALID", "format must be png or jpeg")
		}
		if f.ProvenanceCategory == "" || f.PermissionStatus == "" {
			add("PROVENANCE_REQUIRED", "provenance and permission status are required")
		}
		if f.OrderObservable {
			if len(f.ExpectedOrdered) == 0 || len(f.ExpectedUnordered) > 0 {
				add("ORDER_ANNOTATION_INVALID", "observable order requires only ordered colours")
			}
		} else if len(f.ExpectedOrdered) > 0 {
			add("ORDER_ANNOTATION_INVALID", "ordered colours require observable order")
		}
		for _, set := range [][]string{f.ExpectedOrdered, f.ExpectedUnordered, f.Structural, f.Ambiguous} {
			for _, v := range set {
				if !validHex(v) {
					add("HEX_INVALID", "annotations require canonical #RRGGBB")
				}
			}
		}
		if f.ContinuousGradient && (len(f.ExpectedOrdered) > 0 || len(f.ExpectedUnordered) > 0) {
			add("CONTINUOUS_DISCRETE_CONFLICT", "continuous gradients cannot enter the discrete gold denominator")
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].FixtureID != out[j].FixtureID {
			return out[i].FixtureID < out[j].FixtureID
		}
		return out[i].Code < out[j].Code
	})
	return out
}
func validHex(v string) bool {
	if len(v) != 7 || v[0] != '#' {
		return false
	}
	_, err := hex.DecodeString(v[1:])
	return err == nil && v == strings.ToUpper(v)
}

func Run(m Manifest, inputRoot string) Summary {
	issues := Validate(m)
	if len(issues) > 0 {
		return Summary{Status: "invalid_manifest", Issues: issues}
	}
	rootReal, err := filepath.EvalSymlinks(inputRoot)
	if err != nil {
		return Summary{Status: "inputs_missing", Issues: []Issue{{"", "INPUT_ROOT_MISSING", err.Error()}}}
	}
	results := make([]FixtureResult, 0, len(m.Fixtures))
	for _, f := range m.Fixtures {
		r := FixtureResult{ID: f.ID, Status: "unavailable"}
		path := filepath.Join(rootReal, filepath.Clean(f.Path))
		rel, _ := filepath.Rel(rootReal, path)
		info, err := os.Lstat(path)
		if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) || info.Mode()&os.ModeSymlink != 0 || !info.Mode().IsRegular() {
			results = append(results, r)
			continue
		}
		b, err := os.ReadFile(path)
		if err != nil {
			results = append(results, r)
			continue
		}
		sum := sha256.Sum256(b)
		if f.SHA256 != "" && hex.EncodeToString(sum[:]) != strings.ToLower(f.SHA256) {
			r.Status = "hash_mismatch"
			results = append(results, r)
			continue
		}
		ext := "." + f.Format
		if f.Format == "jpeg" {
			ext = ".jpg"
		}
		r.Extraction = imagecolor.Extract(bytes.NewReader(b), int64(len(b)), ext, imagecolor.DefaultConfig)
		if !r.Extraction.Success {
			r.Status = "failed"
		} else if f.ChartType == "unsupported" {
			r.Status = "unsupported"
		} else if f.ContinuousGradient || len(f.Ambiguous) > 0 && (len(f.ExpectedOrdered)+len(f.ExpectedUnordered) == 0) {
			r.Status = "excluded"
		} else {
			r.Status = "eligible"
			gold := append(append([]string{}, f.ExpectedOrdered...), f.ExpectedUnordered...)
			r.TP, r.FP, r.FN, r.StructuralFN = confusion(gold, r.Extraction)
			r.Perceptual = GreedyMatch(gold, r.Extraction.Candidates)
		}
		results = append(results, r)
	}
	sort.Slice(results, func(i, j int) bool { return results[i].ID < results[j].ID })
	s := Aggregate(results)
	s.Results = results
	if len(results) == 0 {
		s.Status = "prepared_no_inputs"
	} else {
		s.Status = "completed"
		for _, r := range results {
			if r.Status == "unavailable" {
				s.Status = "inputs_missing"
				break
			}
		}
	}
	return s
}
func confusion(gold []string, r imagecolor.Result) (tp, fp, fn, sfn int) {
	g := map[string]bool{}
	for _, v := range gold {
		g[v] = true
	}
	seen := map[string]bool{}
	for _, v := range r.Candidates {
		seen[v.Hex] = true
		if g[v.Hex] {
			tp++
		} else {
			fp++
		}
	}
	for v := range g {
		if !seen[v] {
			fn++
			for _, x := range r.Structural {
				if x.Hex == v {
					sfn++
				}
			}
		}
	}
	return
}
func GreedyMatch(expected []string, candidates []imagecolor.Candidate) []Match {
	type edge struct {
		e, c int
		d    float64
	}
	var edges []edge
	for i, e := range expected {
		for j, c := range candidates {
			edges = append(edges, edge{i, j, imagecolor.DeltaE76(rgb(e), rgb(c.Hex))})
		}
	}
	sort.Slice(edges, func(i, j int) bool {
		if edges[i].d != edges[j].d {
			return edges[i].d < edges[j].d
		}
		if edges[i].e != edges[j].e {
			return edges[i].e < edges[j].e
		}
		return edges[i].c < edges[j].c
	})
	ue, uc := map[int]bool{}, map[int]bool{}
	var out []Match
	for _, x := range edges {
		if !ue[x.e] && !uc[x.c] {
			ue[x.e], uc[x.c] = true, true
			out = append(out, Match{expected[x.e], candidates[x.c].Hex, x.d})
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Expected < out[j].Expected })
	return out
}
func rgb(s string) [3]uint8 {
	var v [3]uint8
	fmt.Sscanf(s, "#%02X%02X%02X", &v[0], &v[1], &v[2])
	return v
}
func Aggregate(results []FixtureResult) Summary {
	s := Summary{ThresholdMatches: map[string]int{"1": 0, "2": 0, "5": 0, "10": 0}}
	for _, r := range results {
		if r.Status != "eligible" {
			continue
		}
		s.EligibleFigures++
		s.TP += r.TP
		s.FP += r.FP
		s.FN += r.FN
		s.StructuralFN += r.StructuralFN
		if r.FP == 0 && r.FN == 0 {
			s.ExactSets++
		}
		for _, m := range r.Perceptual {
			for _, x := range []float64{1, 2, 5, 10} {
				if m.DeltaE76 <= x {
					s.ThresholdMatches[fmt.Sprint(x)]++
				}
			}
		}
	}
	return s
}
func WriteSummary(path string, s Summary) error {
	if path == "" {
		return errors.New("output path required")
	}
	b, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(b, '\n'), 0600)
}
