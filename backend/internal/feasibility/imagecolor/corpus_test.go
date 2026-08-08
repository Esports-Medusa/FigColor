package imagecolor

import (
	"bytes"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"math"
	"os"
	"runtime"
	"sort"
	"strings"
	"testing"
	"time"
)

type corpusCase struct {
	name, chart, palette, transform string
	colors                          []color.NRGBA
	bg                              color.NRGBA
	ordered                         bool
}

var corpus = []corpusCase{
	{"bar-error", "bar_error", "categorical", "native-raster", rgb("2878B8", "E0583C", "50A868"), rgb1("F8F8F4"), true},
	{"boxplot-jitter", "boxplot_jitter", "categorical", "small-overlapping-jitter", rgb("6A51A3", "D95F8D", "E6AB02", "1B9E77", "4D4D4D"), rgb1("FCFAF2"), false},
	{"line-downsampled", "line_multiseries", "categorical", "render at 2x then 2x2 box-filter downsample", rgb("1F77B4", "FF7F0E", "2CA02C", "D62728", "9467BD", "17BECF"), rgb1("FAFAFA"), false},
	{"heatmap-annotated", "heatmap_annotated", "diverging", "cell-text-annotations", rgb("2166AC", "67A9CF", "F7F7F7", "EF8A62", "B2182B"), rgb1("FFFFFF"), true},
	{"scatter-alpha", "scatter_grouped", "categorical", "small-overlapping-points-alpha; transparent pixels composited to configured #FFFFFF backdrop", []color.NRGBA{{31, 119, 180, 255}, {255, 127, 14, 255}, {44, 160, 44, 128}}, rgb1("F7F7F5"), false},
	{"violin-filled", "violin_distribution", "sequential", "violin-shaped-filled-regions", rgb("E8F1F8", "9ECAE1", "6BAED6", "3182BD", "08519C"), rgb1("FFFDFC"), false},
}

func rgb(values ...string) []color.NRGBA {
	r := make([]color.NRGBA, len(values))
	for i, v := range values {
		fmt.Sscanf(v, "%02X%02X%02X", &r[i].R, &r[i].G, &r[i].B)
		r[i].A = 255
	}
	return r
}
func rgb1(v string) color.NRGBA { return rgb(v)[0] }
func fill(im *image.NRGBA, c color.NRGBA) {
	for y := im.Bounds().Min.Y; y < im.Bounds().Max.Y; y++ {
		for x := im.Bounds().Min.X; x < im.Bounds().Max.X; x++ {
			im.SetNRGBA(x, y, c)
		}
	}
}
func rect(im *image.NRGBA, x0, y0, x1, y1 int, c color.NRGBA) {
	for y := y0; y < y1; y++ {
		for x := x0; x < x1; x++ {
			if image.Pt(x, y).In(im.Bounds()) {
				im.SetNRGBA(x, y, c)
			}
		}
	}
}
func line(im *image.NRGBA, x0, y0, x1, y1, w int, c color.NRGBA) {
	dx := int(math.Abs(float64(x1 - x0)))
	sx := -1
	if x0 < x1 {
		sx = 1
	}
	dy := -int(math.Abs(float64(y1 - y0)))
	sy := -1
	if y0 < y1 {
		sy = 1
	}
	err := dx + dy
	for {
		rect(im, x0-w/2, y0-w/2, x0-w/2+w, y0-w/2+w, c)
		if x0 == x1 && y0 == y1 {
			break
		}
		e2 := 2 * err
		if e2 >= dy {
			err += dy
			x0 += sx
		}
		if e2 <= dx {
			err += dx
			y0 += sy
		}
	}
}
func circle(im *image.NRGBA, cx, cy, r int, c color.NRGBA) {
	for y := -r; y <= r; y++ {
		for x := -r; x <= r; x++ {
			if x*x+y*y <= r*r && image.Pt(cx+x, cy+y).In(im.Bounds()) {
				im.SetNRGBA(cx+x, cy+y, c)
			}
		}
	}
}
func downsample2(src *image.NRGBA) *image.NRGBA {
	dst := image.NewNRGBA(image.Rect(0, 0, src.Bounds().Dx()/2, src.Bounds().Dy()/2))
	for y := 0; y < dst.Bounds().Dy(); y++ {
		for x := 0; x < dst.Bounds().Dx(); x++ {
			var r, g, b, a int
			for yy := 0; yy < 2; yy++ {
				for xx := 0; xx < 2; xx++ {
					p := src.NRGBAAt(2*x+xx, 2*y+yy)
					r += int(p.R)
					g += int(p.G)
					b += int(p.B)
					a += int(p.A)
				}
			}
			dst.SetNRGBA(x, y, color.NRGBA{uint8((r + 2) / 4), uint8((g + 2) / 4), uint8((b + 2) / 4), uint8((a + 2) / 4)})
		}
	}
	return dst
}

func render(c corpusCase) []byte {
	scale := 1
	if c.chart == "line_multiseries" {
		scale = 2
	}
	im := image.NewNRGBA(image.Rect(0, 0, 180*scale, 120*scale))
	fill(im, c.bg)
	axis := color.NRGBA{45, 45, 45, 255}
	grid := color.NRGBA{205, 205, 205, 255}
	line(im, 15*scale, 102*scale, 168*scale, 102*scale, scale, axis)
	line(im, 15*scale, 18*scale, 15*scale, 102*scale, scale, axis)
	line(im, 15*scale, 62*scale, 168*scale, 62*scale, scale, grid)
	switch c.chart {
	case "bar_error":
		for i, v := range c.colors {
			x := 28 + i*45
			top := 45 - i*7
			rect(im, x, top, x+24, 102, v)
			line(im, x+12, top-9, x+12, top+9, 1, axis)
			line(im, x+6, top-9, x+18, top-9, 1, axis)
		}
	case "boxplot_jitter":
		for i, v := range c.colors {
			x := 25 + i*29
			top := 35 + (i%2)*6
			bottom := 78 - (i%3)*4
			line(im, x+9, top-12, x+9, bottom+12, 1, axis)
			line(im, x+3, top-12, x+15, top-12, 1, axis)
			line(im, x+3, bottom+12, x+15, bottom+12, 1, axis)
			rect(im, x, top, x+18, bottom, v)
			line(im, x, bottom-(bottom-top)/2, x+18, bottom-(bottom-top)/2, 1, axis)
			for p := 0; p < 7; p++ {
				circle(im, x+3+(p*7)%18, 88+(p%3)*3, 2, v)
			}
		}
	case "line_multiseries":
		for i, v := range c.colors {
			pts := [][2]int{{18 * scale, (28 + i*11) * scale}, {55 * scale, (35 + i*8) * scale}, {95 * scale, (24 + i*10) * scale}, {135 * scale, (38 + i*7) * scale}, {166 * scale, (30 + i*9) * scale}}
			for p := 1; p < len(pts); p++ {
				line(im, pts[p-1][0], pts[p-1][1], pts[p][0], pts[p][1], 2, v)
			}
		}
	case "heatmap_annotated":
		for i, v := range c.colors {
			x := 22 + i*30
			for row := 0; row < 3; row++ {
				rect(im, x, 24+row*24, x+28, 46+row*24, v)
				tc := axis
				if i == 0 || i == 4 {
					tc = color.NRGBA{245, 245, 245, 255}
				}
				line(im, x+8, 34+row*24, x+19, 34+row*24, 1, tc)
				line(im, x+13, 30+row*24, x+13, 38+row*24, 1, tc)
			}
		}
	case "scatter_grouped":
		for i, v := range c.colors {
			for p := 0; p < 18; p++ {
				cx := 34 + i*48 + (p%5)*4
				cy := 35 + (p/5)*12 + (i%2)*5
				circle(im, cx, cy, 2, v)
			}
		}
		circle(im, 82, 58, 3, c.colors[0])
		circle(im, 84, 58, 3, c.colors[1])
	case "violin_distribution":
		for i, v := range c.colors {
			cx := 30 + i*30
			for y := 24; y < 94; y++ {
				phase := float64(y-24) / 70
				width := int(2 + 10*math.Sin(math.Pi*phase)*(.65+.35*math.Sin(2*math.Pi*phase)*math.Sin(2*math.Pi*phase)))
				rect(im, cx-width, y, cx+width+1, y+1, v)
			}
			line(im, cx-7, 60, cx+7, 60, 1, axis)
		}
	}
	if scale == 2 {
		im = downsample2(im)
	}
	var b bytes.Buffer
	_ = png.Encode(&b, im)
	return b.Bytes()
}

func expectedHex(c corpusCase, v color.NRGBA, cfg Config) string {
	a := uint32(v.A)
	blend := func(src, bg uint8) uint8 { return uint8((uint32(src)*a + uint32(bg)*(255-a) + 127) / 255) }
	q := func(x uint8) uint8 { return uint8(int(x) / cfg.QuantizeStep * cfg.QuantizeStep) }
	return hexColor([3]uint8{q(blend(v.R, cfg.AlphaBackdrop[0])), q(blend(v.G, cfg.AlphaBackdrop[1])), q(blend(v.B, cfg.AlphaBackdrop[2]))})
}
func confusion(c corpusCase, r Result, cfg Config) (tp, fp, fn, structuralFN int) {
	expected := map[string]bool{}
	for _, v := range c.colors {
		expected[expectedHex(c, v, cfg)] = true
	}
	got := map[string]bool{}
	for _, v := range r.Candidates {
		got[v.Hex] = true
		if expected[v.Hex] {
			tp++
		} else {
			fp++
		}
	}
	for x := range expected {
		if !got[x] {
			fn++
			for _, v := range r.Structural {
				if v.Hex == x {
					structuralFN++
				}
			}
		}
	}
	return
}
func TestSyntheticCorpusBenchmark(t *testing.T) {
	type baseline struct{ tp, fp, fn, structuralFN int }
	expectedBaseline := map[string]baseline{
		"bar-error": {3, 0, 0, 0}, "boxplot-jitter": {4, 0, 1, 1},
		"line-downsampled": {6, 18, 0, 0}, "heatmap-annotated": {4, 0, 1, 0},
		"scatter-alpha": {3, 0, 0, 0}, "violin-filled": {5, 0, 0, 0},
	}
	atp, afp, afn, aggregateStructuralFN, exact, deterministic := 0, 0, 0, 0, 0, 0
	for _, c := range corpus {
		t.Run(c.name, func(t *testing.T) {
			b := render(c)
			r := Extract(bytes.NewReader(b), int64(len(b)), ".png", DefaultConfig)
			if !r.Success {
				t.Fatal(r.BlockingIssues)
			}
			again := Extract(bytes.NewReader(b), int64(len(b)), ".png", DefaultConfig)
			if r.OutputHash != again.OutputHash {
				t.Fatal("nondeterministic")
			}
			deterministic++
			tp, fp, fn, sfn := confusion(c, r, DefaultConfig)
			want := expectedBaseline[c.name]
			if tp != want.tp || fp != want.fp || fn != want.fn || sfn != want.structuralFN {
				t.Fatalf("feasibility baseline drift: got TP=%d FP=%d FN=%d structuralFN=%d; want %+v", tp, fp, fn, sfn, want)
			}
			atp += tp
			afp += fp
			afn += fn
			aggregateStructuralFN += sfn
			if fp == 0 && fn == 0 {
				exact++
			}
			t.Logf("chart=%s TP=%d FP=%d FN=%d structural_FN=%d candidates=%d structural=%d order_observable=%v hash=%s", c.chart, tp, fp, fn, sfn, len(r.Candidates), len(r.Structural), c.ordered, r.OutputHash)
		})
	}
	if atp != 25 || afp != 18 || afn != 2 || aggregateStructuralFN != 1 || exact != 3 || deterministic != 6 {
		t.Fatalf("aggregate feasibility baseline drift: TP=%d FP=%d FN=%d structuralFN=%d exact=%d deterministic=%d", atp, afp, afn, aggregateStructuralFN, exact, deterministic)
	}
	t.Logf("aggregate TP=%d FP=%d FN=%d recall=%.3f precision=%.3f exact=%d/%d", atp, afp, afn, float64(atp)/float64(atp+afn), float64(atp)/float64(atp+afp), exact, len(corpus))
}

type corpusManifest struct {
	Fixtures []struct {
		ID                        string   `json:"id"`
		ChartType                 string   `json:"chart_type"`
		PaletteType               string   `json:"palette_type"`
		Transformation            string   `json:"transformation"`
		ExpectedOrderedDataColors []string `json:"expected_ordered_data_colors"`
		SemanticOrderObservable   bool     `json:"semantic_order_observable"`
	} `json:"fixtures"`
}

func TestCorpusManifestMatchesExecutableCorpus(t *testing.T) {
	b, err := os.ReadFile("testdata/corpus-manifest.json")
	if err != nil {
		t.Fatal(err)
	}
	var manifest corpusManifest
	if err := json.Unmarshal(b, &manifest); err != nil {
		t.Fatal(err)
	}
	if len(manifest.Fixtures) != len(corpus) {
		t.Fatalf("manifest fixtures=%d corpus=%d", len(manifest.Fixtures), len(corpus))
	}
	seen := map[string]bool{}
	for i, m := range manifest.Fixtures {
		c := corpus[i]
		if m.ID == "" || seen[m.ID] {
			t.Fatalf("duplicate/empty fixture ID %q", m.ID)
		}
		seen[m.ID] = true
		if m.ID != c.name || m.ChartType != c.chart || m.PaletteType != c.palette || m.Transformation != c.transform || m.SemanticOrderObservable != c.ordered {
			t.Fatalf("manifest drift at %d: %#v versus %#v", i, m, c)
		}
		if len(m.ExpectedOrderedDataColors) != len(c.colors) {
			t.Fatalf("%s colour count drift", m.ID)
		}
		for j, v := range c.colors {
			want := strings.ToUpper(m.ExpectedOrderedDataColors[j])
			got := fmt.Sprintf("#%02X%02X%02X", v.R, v.G, v.B)
			if want != got {
				t.Fatalf("%s colour %d: %s != %s", m.ID, j, want, got)
			}
		}
	}
}

type perceptualPair struct {
	expected  string
	candidate string
	delta     float64
}

func parseHex(s string) [3]uint8 {
	var r, g, b uint8
	fmt.Sscanf(s, "#%02X%02X%02X", &r, &g, &b)
	return [3]uint8{r, g, b}
}

// greedyPerceptualPairs sorts every possible expected/candidate pair by DeltaE,
// then consumes each colour at most once. It is deterministic and one-to-one,
// but unlike a Hungarian assignment it does not guarantee the minimum total cost.
func greedyPerceptualPairs(c corpusCase, r Result) ([]perceptualPair, []string) {
	type edge struct {
		ei, ci int
		d      float64
	}
	var edges []edge
	expected := make([]string, len(c.colors))
	for i, v := range c.colors {
		expected[i] = expectedHex(c, v, DefaultConfig)
		for j, g := range r.Candidates {
			edges = append(edges, edge{i, j, DeltaE76(parseHex(expected[i]), parseHex(g.Hex))})
		}
	}
	sort.Slice(edges, func(i, j int) bool {
		if edges[i].d != edges[j].d {
			return edges[i].d < edges[j].d
		}
		if edges[i].ei != edges[j].ei {
			return edges[i].ei < edges[j].ei
		}
		return edges[i].ci < edges[j].ci
	})
	usedE, usedC := map[int]bool{}, map[int]bool{}
	var pairs []perceptualPair
	for _, e := range edges {
		if !usedE[e.ei] && !usedC[e.ci] {
			usedE[e.ei], usedC[e.ci] = true, true
			pairs = append(pairs, perceptualPair{expected[e.ei], r.Candidates[e.ci].Hex, e.d})
		}
	}
	var unmatched []string
	for i, v := range expected {
		if !usedE[i] {
			unmatched = append(unmatched, v)
		}
	}
	sort.Slice(pairs, func(i, j int) bool { return pairs[i].expected < pairs[j].expected })
	return pairs, unmatched
}

func TestPerceptualEvidence(t *testing.T) {
	thresholds := []float64{1, 2, 5, 10}
	totals := make([]int, len(thresholds))
	matchedTotal := 0
	unmatchedTotal := 0
	for _, c := range corpus {
		b := render(c)
		r := Extract(bytes.NewReader(b), int64(len(b)), ".png", DefaultConfig)
		pairs, unmatched := greedyPerceptualPairs(c, r)
		matchedTotal += len(pairs)
		unmatchedTotal += len(unmatched)
		mean, max := 0.0, 0.0
		for _, p := range pairs {
			mean += p.delta
			if p.delta > max {
				max = p.delta
			}
			t.Logf("fixture=%s expected=%s assigned=%s deltaE76=%.6f", c.name, p.expected, p.candidate, p.delta)
			for i, x := range thresholds {
				if p.delta <= x {
					totals[i]++
				}
			}
		}
		if len(pairs) > 0 {
			mean /= float64(len(pairs))
		}
		for _, missing := range unmatched {
			nearest, nearestDelta := "<none>", math.Inf(1)
			for _, candidate := range r.Candidates {
				d := DeltaE76(parseHex(missing), parseHex(candidate.Hex))
				if d < nearestDelta || (d == nearestDelta && candidate.Hex < nearest) {
					nearest, nearestDelta = candidate.Hex, d
				}
			}
			reason := "not-a-data-candidate"
			for _, candidate := range r.Structural {
				if candidate.Hex == missing {
					reason = "structural-classification"
				}
			}
			if distance(parseHex(missing), parseHex(r.Background)) <= DefaultConfig.BackgroundDistance {
				reason = "near-background-exclusion"
			}
			t.Logf("fixture=%s expected=%s unmatched reason=%s nearest_data_candidate=%s nearest_deltaE76=%.6f", c.name, missing, reason, nearest, nearestDelta)
			if c.name == "boxplot-jitter" && reason != "structural-classification" {
				t.Fatalf("box exclusion evidence drift: %s", reason)
			}
			if c.name == "heatmap-annotated" && reason != "near-background-exclusion" {
				t.Fatalf("heatmap exclusion evidence drift: %s", reason)
			}
		}
		t.Logf("fixture=%s matched=%d unmatched=%v mean=%.6f max=%.6f", c.name, len(pairs), unmatched, mean, max)
	}
	if matchedTotal != 25 || unmatchedTotal != 2 {
		t.Fatalf("matching baseline drift: matched=%d unmatched=%d", matchedTotal, unmatchedTotal)
	}
	for i, n := range totals {
		if n != 25 {
			t.Fatalf("threshold %.0f: got %d want 25", thresholds[i], n)
		}
	}
	t.Logf("thresholds <=1:%d <=2:%d <=5:%d <=10:%d; unmatched=%d", totals[0], totals[1], totals[2], totals[3], unmatchedTotal)
}

func TestRuntimeObservations(t *testing.T) {
	if os.Getenv("FIGCOLOR_RUNTIME_OBSERVATION") != "1" {
		t.Skip("set FIGCOLOR_RUNTIME_OBSERVATION=1 for environment-specific timing")
	}
	const warmups = 5
	const runs = 101
	var all []time.Duration
	var total time.Duration
	for _, c := range corpus {
		encoded := render(c)
		cfg, _, err := image.DecodeConfig(bytes.NewReader(encoded))
		if err != nil {
			t.Fatal(err)
		}
		for i := 0; i < warmups; i++ {
			Extract(bytes.NewReader(encoded), int64(len(encoded)), ".png", DefaultConfig)
		}
		samples := make([]time.Duration, runs)
		for i := range samples {
			start := time.Now()
			Extract(bytes.NewReader(encoded), int64(len(encoded)), ".png", DefaultConfig)
			samples[i] = time.Since(start)
		}
		sort.Slice(samples, func(i, j int) bool { return samples[i] < samples[j] })
		median, p95 := samples[runs/2], samples[int(math.Ceil(.95*float64(runs)))-1]
		all = append(all, samples...)
		for _, d := range samples {
			total += d
		}
		t.Logf("runtime fixture=%s dimensions=%dx%d bytes=%d runs=%d warmups=%d median=%s p95=%s", c.name, cfg.Width, cfg.Height, len(encoded), runs, warmups, median, p95)
	}
	sort.Slice(all, func(i, j int) bool { return all[i] < all[j] })
	t.Logf("runtime environment go=%s os=%s arch=%s samples=%d aggregate_median=%s aggregate_p95=%s total_batch_mean=%s", runtime.Version(), runtime.GOOS, runtime.GOARCH, len(all), all[len(all)/2], all[int(math.Ceil(.95*float64(len(all))))-1], total/runs)
}
func TestThresholdSensitivityAndLossyJPEG(t *testing.T) {
	for _, step := range []int{4, 8, 16} {
		cfg := DefaultConfig
		cfg.QuantizeStep = step
		n := 0
		for _, c := range corpus {
			b := render(c)
			r := Extract(bytes.NewReader(b), int64(len(b)), ".png", cfg)
			n += len(r.Candidates)
		}
		t.Logf("quantize_step=%d candidates=%d", step, n)
	}
	p := render(corpus[0])
	im, _, _ := image.Decode(bytes.NewReader(p))
	var b bytes.Buffer
	_ = jpeg.Encode(&b, im, &jpeg.Options{Quality: 90})
	a := Extract(bytes.NewReader(b.Bytes()), int64(b.Len()), ".jpg", DefaultConfig)
	again := Extract(bytes.NewReader(b.Bytes()), int64(b.Len()), ".jpg", DefaultConfig)
	if !a.Success || a.OutputHash != again.OutputHash {
		t.Fatal("lossy instability")
	}
	tp, fp, fn, _ := confusion(corpus[0], a, DefaultConfig)
	t.Logf("lossy_jpeg TP=%d FP=%d FN=%d candidates=%d structural=%d hash=%s", tp, fp, fn, len(a.Candidates), len(a.Structural), a.OutputHash)
}
