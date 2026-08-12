package paletteassistant

import (
	"crypto/sha256"
	"encoding/hex"
	"strings"
	"testing"
)

func TestSimilarityGeneratedArtifactIntegrity(t *testing.T) {
	policy, err := loadSimilarityProjection()
	if err != nil {
		t.Fatal(err)
	}
	digest := sha256.Sum256([]byte(similarityPolicyProjectionJSON))
	if hex.EncodeToString(digest[:]) != SimilarityPolicyFingerprint || policy.ProjectionFormatVersion != 1 || policy.PolicyVersion != 1 || len(policy.Vectors) < 20 {
		t.Fatal("generated authority drift")
	}
	if strings.Contains(similarityPolicyProjectionJSON, "/Users/") || strings.Contains(similarityPolicyProjectionJSON, "normalized_score") {
		t.Fatal("generated artifact contains prohibited material")
	}
}
