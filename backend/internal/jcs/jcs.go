package jcs

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"unicode/utf8"

	"github.com/cyberphone/json-canonicalization/go/src/webpki.org/jsoncanonicalizer"
)

// Canonicalize returns the RFC 8785 JCS UTF-8 representation of raw JSON.
func Canonicalize(raw []byte) ([]byte, error) {
	if !utf8.Valid(raw) {
		return nil, fmt.Errorf("JCS input must be valid UTF-8")
	}
	if !json.Valid(raw) {
		return nil, fmt.Errorf("JCS input must be valid JSON")
	}
	canonical, err := jsoncanonicalizer.Transform(raw)
	if err != nil {
		return nil, fmt.Errorf("canonicalize RFC 8785 JSON: %w", err)
	}
	return canonical, nil
}

func Hash(raw []byte) (canonical []byte, hash string, err error) {
	canonical, err = Canonicalize(raw)
	if err != nil {
		return nil, "", err
	}
	sum := sha256.Sum256(canonical)
	return canonical, hex.EncodeToString(sum[:]), nil
}
