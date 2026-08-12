package paletteassistant

import (
	"errors"
	"go/parser"
	"go/token"
	"math"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"sync"
	"testing"
)

func TestGeneratedSimilarityVectorsMatchGo(t *testing.T) {
	policy, err := loadSimilarityProjection()
	if err != nil {
		t.Fatal(err)
	}
	var maxPair, maxMean, maxMaximum float64
	for _, vector := range policy.Vectors {
		t.Run(vector.ID, func(t *testing.T) {
			left, right := append([]string(nil), vector.Left...), append([]string(nil), vector.Right...)
			beforeLeft, beforeRight := append([]string(nil), left...), append([]string(nil), right...)
			got, err := EvaluatePaletteSimilarity(left, right)
			if err != nil {
				t.Fatal(err)
			}
			if got.Comparable != vector.Comparable || got.Similar != vector.Similar || got.PolicyVersion != policy.PolicyVersion || len(got.PairDistances) != len(vector.PairDistances) {
				t.Fatalf("parity: %+v want %+v", got, vector)
			}
			for i := range got.PairDistances {
				difference := math.Abs(got.PairDistances[i] - vector.PairDistances[i])
				if difference > maxPair {
					maxPair = difference
				}
				if difference > policy.NumericalTolerance {
					t.Fatalf("pair %d difference %.17g", i, difference)
				}
			}
			meanDifference := math.Abs(got.MeanDistance - vector.MeanDistance)
			if meanDifference > maxMean {
				maxMean = meanDifference
			}
			maximumDifference := math.Abs(got.MaximumPairDistance - vector.MaximumPairDistance)
			if maximumDifference > maxMaximum {
				maxMaximum = maximumDifference
			}
			if meanDifference > policy.NumericalTolerance || maximumDifference > policy.NumericalTolerance {
				t.Fatalf("aggregate differences mean=%g max=%g", meanDifference, maximumDifference)
			}
			if !reflect.DeepEqual(left, beforeLeft) || !reflect.DeepEqual(right, beforeRight) {
				t.Fatal("input mutated")
			}
			for _, value := range append(append([]float64{}, got.PairDistances...), got.MeanDistance, got.MaximumPairDistance) {
				if !finiteNonnegative(value) {
					t.Fatal("non-finite result")
				}
			}
		})
	}
	t.Logf("maximum parity differences pair=%g mean=%g maximum=%g", maxPair, maxMean, maxMaximum)
}

func TestPaletteSimilarityInputCardinalityOrderingAndMetamorphicProperties(t *testing.T) {
	for _, invalid := range []string{"#ffffff", "#FFF", "FFFFFF", "#GGGGGG"} {
		if _, err := EvaluatePaletteSimilarity([]string{invalid}, []string{"#FFFFFF"}); !errors.Is(err, ErrSimilarityInput) {
			t.Fatalf("accepted %q", invalid)
		}
	}
	for _, pair := range []struct{ left, right []string }{{nil, nil}, {[]string{}, []string{}}, {[]string{"#112233"}, nil}, {[]string{"#112233"}, []string{"#112233", "#445566"}}} {
		got, err := EvaluatePaletteSimilarity(pair.left, pair.right)
		if err != nil || got.Comparable || got.Similar || len(got.PairDistances) != 0 {
			t.Fatalf("cardinality: %+v %v", got, err)
		}
	}
	colors := []string{"#FF0000", "#00FF00", "#0000FF"}
	identity, _ := EvaluatePaletteSimilarity(colors, colors)
	if !identity.Similar || identity.MeanDistance != 0 || identity.MaximumPairDistance != 0 {
		t.Fatal(identity)
	}
	reversed, _ := EvaluatePaletteSimilarity(colors, []string{"#0000FF", "#00FF00", "#FF0000"})
	if reversed.MeanDistance == 0 {
		t.Fatal("one-sided permutation was rematched")
	}
	leftRight, _ := EvaluatePaletteSimilarity([]string{"#112233", "#445566"}, []string{"#112234", "#455667"})
	rightLeft, _ := EvaluatePaletteSimilarity([]string{"#112234", "#455667"}, []string{"#112233", "#445566"})
	if !reflect.DeepEqual(leftRight.PairDistances, rightLeft.PairDistances) || leftRight.MeanDistance != rightLeft.MeanDistance || leftRight.MaximumPairDistance != rightLeft.MaximumPairDistance {
		t.Fatal("symmetry drift")
	}
}

func TestPaletteSimilarityConcurrentDeterminism(t *testing.T) {
	want, _ := EvaluatePaletteSimilarity([]string{"#4477AA", "#EE6677"}, []string{"#4578AB", "#ED6878"})
	var wg sync.WaitGroup
	for i := 0; i < 64; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			got, err := EvaluatePaletteSimilarity([]string{"#4477AA", "#EE6677"}, []string{"#4578AB", "#ED6878"})
			if err != nil || !reflect.DeepEqual(got, want) {
				t.Errorf("nondeterministic: %+v %v", got, err)
			}
		}()
	}
	wg.Wait()
}

func TestSimilarityArchitectureBoundary(t *testing.T) {
	fset := token.NewFileSet()
	file, err := parser.ParseFile(fset, "similarity.go", nil, parser.ImportsOnly)
	if err != nil {
		t.Fatal(err)
	}
	for _, spec := range file.Imports {
		path := strings.Trim(spec.Path.Value, `"`)
		if path == "net/http" || path == "database/sql" || path == "os/exec" || strings.Contains(path, "gin") || strings.Contains(path, "repository") || strings.Contains(path, "internal/palette") {
			t.Fatalf("forbidden import %s", path)
		}
	}
	source, err := os.ReadFile(filepath.Join("similarity.go"))
	if err != nil {
		t.Fatal(err)
	}
	for _, forbidden := range []string{"node", "exec.Command", "Candidate", "Finding", "Idempotency", "Receipt"} {
		if strings.Contains(string(source), forbidden) {
			t.Fatalf("forbidden runtime concern %s", forbidden)
		}
	}
}
