package jcs

import (
	"encoding/json"
	"os"
	"testing"
)

type fixtureCorpus struct {
	Valid []struct {
		Name, Raw, Canonical, Hash string
	} `json:"valid"`
	Invalid []struct {
		Name, Raw string
	} `json:"invalid"`
}

func TestRFC8785SharedFixtures(t *testing.T) {
	raw, err := os.ReadFile("../../../contracts/palette-ingestion/v1/jcs-cross-language-fixtures.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixtures fixtureCorpus
	if err := json.Unmarshal(raw, &fixtures); err != nil {
		t.Fatal(err)
	}
	for _, fixture := range fixtures.Valid {
		t.Run(fixture.Name, func(t *testing.T) {
			canonical, hash, err := Hash([]byte(fixture.Raw))
			if err != nil || string(canonical) != fixture.Canonical || hash != fixture.Hash {
				t.Fatalf("canonical=%q hash=%s err=%v", canonical, hash, err)
			}
			second, secondHash, err := Hash([]byte(fixture.Raw))
			if err != nil || string(second) != string(canonical) || secondHash != hash {
				t.Fatal("canonicalization is not deterministic")
			}
		})
	}
	for _, fixture := range fixtures.Invalid {
		t.Run("reject-"+fixture.Name, func(t *testing.T) {
			if _, _, err := Hash([]byte(fixture.Raw)); err == nil {
				t.Fatal("invalid input accepted")
			}
		})
	}
}

func TestRFC8785RejectsInvalidUTF8(t *testing.T) {
	if _, _, err := Hash([]byte{'{', '"', 'x', '"', ':', '"', 0xff, '"', '}'}); err == nil {
		t.Fatal("invalid UTF-8 accepted")
	}
}
