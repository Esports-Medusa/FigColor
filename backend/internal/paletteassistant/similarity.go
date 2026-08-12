package paletteassistant

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"math"
	"regexp"
)

var ErrSimilarityInput = errors.New("palette similarity input is invalid")

type SimilarityEvaluation struct {
	Comparable          bool
	PairDistances       []float64
	MeanDistance        float64
	MaximumPairDistance float64
	Similar             bool
	PolicyVersion       int
}

type similarityProjection struct {
	ProjectionFormatVersion      int                `json:"projection_format_version"`
	PolicyVersion                int                `json:"policy_version"`
	ColorSpace                   string             `json:"color_space"`
	DistanceMetric               string             `json:"distance_metric"`
	Matching                     string             `json:"matching"`
	ColorCountPolicy             string             `json:"color_count_policy"`
	MeanDistanceThreshold        float64            `json:"mean_distance_threshold"`
	MaximumPairDistanceThreshold float64            `json:"maximum_pair_distance_threshold"`
	ThresholdInclusive           bool               `json:"threshold_inclusive"`
	HEXFormat                    string             `json:"hex_format"`
	NumericalTolerance           float64            `json:"numerical_tolerance"`
	Vectors                      []similarityVector `json:"vectors"`
}

type similarityVector struct {
	ID                  string    `json:"id"`
	Left                []string  `json:"left"`
	Right               []string  `json:"right"`
	Comparable          bool      `json:"comparable"`
	PairDistances       []float64 `json:"pair_distances"`
	MeanDistance        float64   `json:"mean_distance"`
	MaximumPairDistance float64   `json:"maximum_pair_distance"`
	Similar             bool      `json:"similar"`
}

var similarityCanonicalHEX = regexp.MustCompile(`^#[0-9A-F]{6}$`)

func EvaluatePaletteSimilarity(left, right []string) (SimilarityEvaluation, error) {
	policy, err := loadSimilarityProjection()
	if err != nil {
		return SimilarityEvaluation{}, ErrSimilarityInput
	}
	for _, values := range [][]string{left, right} {
		for _, value := range values {
			if !similarityCanonicalHEX.MatchString(value) {
				return SimilarityEvaluation{}, ErrSimilarityInput
			}
		}
	}
	result := SimilarityEvaluation{PairDistances: []float64{}, PolicyVersion: policy.PolicyVersion}
	if len(left) == 0 || len(left) != len(right) {
		return result, nil
	}
	result.Comparable = true
	result.PairDistances = make([]float64, len(left))
	for i := range left {
		distance := deltaEOk(hexToOKLab(left[i]), hexToOKLab(right[i]))
		if !finiteNonnegative(distance) {
			return SimilarityEvaluation{}, ErrSimilarityInput
		}
		result.PairDistances[i] = distance
		result.MeanDistance += distance
		if distance > result.MaximumPairDistance {
			result.MaximumPairDistance = distance
		}
	}
	result.MeanDistance /= float64(len(result.PairDistances))
	result.Similar = result.MeanDistance <= policy.MeanDistanceThreshold && result.MaximumPairDistance <= policy.MaximumPairDistanceThreshold
	return result, nil
}

func SimilarityPolicyThresholds() (float64, float64, error) {
	policy, err := loadSimilarityProjection()
	if err != nil {
		return 0, 0, ErrSimilarityInput
	}
	return policy.MeanDistanceThreshold, policy.MaximumPairDistanceThreshold, nil
}

type okLab struct{ l, a, b float64 }

func hexToOKLab(value string) okLab {
	channels := [3]float64{}
	for i, start := range []int{1, 3, 5} {
		parsed, _ := hex.DecodeString(value[start : start+2])
		channels[i] = decodeSRGB(float64(parsed[0]) / 255)
	}
	r, g, b := channels[0], channels[1], channels[2]
	l := math.Cbrt(0.4122214708*r + 0.5363325363*g + 0.0514459929*b)
	m := math.Cbrt(0.2119034982*r + 0.6806995451*g + 0.1073969566*b)
	s := math.Cbrt(0.0883024619*r + 0.2817188376*g + 0.6299787005*b)
	return okLab{0.2104542553*l + 0.793617785*m - 0.0040720468*s, 1.9779984951*l - 2.428592205*m + 0.4505937099*s, 0.0259040371*l + 0.7827717662*m - 0.808675766*s}
}

func decodeSRGB(value float64) float64 {
	if value <= 0.04045 {
		return value / 12.92
	}
	return math.Pow((value+0.055)/1.055, 2.4)
}

func deltaEOk(left, right okLab) float64 {
	return math.Hypot(math.Hypot(left.l-right.l, left.a-right.a), left.b-right.b)
}
func finiteNonnegative(value float64) bool {
	return value >= 0 && !math.IsNaN(value) && !math.IsInf(value, 0)
}

func loadSimilarityProjection() (*similarityProjection, error) {
	digest := sha256.Sum256([]byte(similarityPolicyProjectionJSON))
	if hex.EncodeToString(digest[:]) != SimilarityPolicyFingerprint {
		return nil, ErrSimilarityInput
	}
	var policy similarityProjection
	if json.Unmarshal([]byte(similarityPolicyProjectionJSON), &policy) != nil || policy.ProjectionFormatVersion != SimilarityProjectionFormatVersion || policy.PolicyVersion != 1 || policy.ColorSpace != "oklab_d65" || policy.DistanceMetric != "euclidean_delta_e_ok" || policy.Matching != "canonical_index_order_preserving_one_to_one" || policy.ColorCountPolicy != "equal_count_required" || policy.MeanDistanceThreshold != 0.035 || policy.MaximumPairDistanceThreshold != 0.06 || !policy.ThresholdInclusive || policy.HEXFormat != "canonical_uppercase_rrggbb" || policy.NumericalTolerance != 1e-12 || len(policy.Vectors) < 20 {
		return nil, ErrSimilarityInput
	}
	seen := map[string]bool{}
	for _, vector := range policy.Vectors {
		if vector.ID == "" || seen[vector.ID] || vector.Comparable != (len(vector.Left) > 0 && len(vector.Left) == len(vector.Right)) || len(vector.PairDistances) != map[bool]int{true: len(vector.Left)}[vector.Comparable] || !finiteNonnegative(vector.MeanDistance) || !finiteNonnegative(vector.MaximumPairDistance) {
			return nil, ErrSimilarityInput
		}
		seen[vector.ID] = true
		for _, value := range append(append([]string{}, vector.Left...), vector.Right...) {
			if !similarityCanonicalHEX.MatchString(value) {
				return nil, ErrSimilarityInput
			}
		}
		for _, value := range vector.PairDistances {
			if !finiteNonnegative(value) {
				return nil, ErrSimilarityInput
			}
		}
		if vector.Comparable {
			var sum, maximum float64
			for _, value := range vector.PairDistances {
				sum += value
				if value > maximum {
					maximum = value
				}
			}
			mean := sum / float64(len(vector.PairDistances))
			if math.Abs(mean-vector.MeanDistance) > policy.NumericalTolerance || math.Abs(maximum-vector.MaximumPairDistance) > policy.NumericalTolerance || vector.Similar != (mean <= policy.MeanDistanceThreshold && maximum <= policy.MaximumPairDistanceThreshold) {
				return nil, ErrSimilarityInput
			}
		} else if vector.MeanDistance != 0 || vector.MaximumPairDistance != 0 || vector.Similar {
			return nil, ErrSimilarityInput
		}
	}
	return &policy, nil
}
