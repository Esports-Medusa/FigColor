package submission

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"sort"
	"strings"
	"time"

	figjcs "github.com/qiqi/figcolor/backend/internal/jcs"
	pa "github.com/qiqi/figcolor/backend/internal/paletteassistant"
)

var errReceiptInvalid = errors.New("validation receipt invalid")
var errReceiptExpired = errors.New("validation receipt expired")

func canonicalHash(value any) (string, error) {
	raw, err := json.Marshal(value)
	if err != nil {
		return "", err
	}
	_, digest, err := figjcs.Hash(raw)
	return digest, err
}
func draftDigest(draft pa.AssistantDraft) (string, error) { return canonicalHash(draft) }
func exactFingerprint(draft pa.AssistantDraft) (string, error) {
	hexes := make([]string, len(draft.Colors))
	for i := range draft.Colors {
		hexes[i] = draft.Colors[i].Hex
	}
	return canonicalHash(pa.ExactFingerprintProjectionValue(hexes))
}
func findingID(f pa.ProtocolFinding) (string, error) {
	f = pa.SetProtocolFindingID(f, "")
	return canonicalHash(f)
}
func findingSetDigest(findings []pa.ProtocolFinding) (string, error) {
	ordered := append([]pa.ProtocolFinding(nil), findings...)
	sort.Slice(ordered, func(i, j int) bool {
		a, _, _, _, _, _, _, _ := pa.ProtocolFindingFields(ordered[i])
		b, _, _, _, _, _, _, _ := pa.ProtocolFindingFields(ordered[j])
		return a < b
	})
	return canonicalHash(pa.FindingEnvelopeValue(ordered))
}
func createIntentDigest(actor, draft string, revision uint64, acks []string, finding string) (string, error) {
	ordered := append([]string(nil), acks...)
	sort.Strings(ordered)
	return canonicalHash(pa.CreateIntentProjectionValue(actor, draft, revision, ordered, finding))
}
func newProtocolFinding(kind, severity, path, code, message string, version int, paletteID string, evidence json.RawMessage) (pa.ProtocolFinding, error) {
	f := pa.NewProtocolFindingValue(kind, severity, path, code, message, version, paletteID, evidence)
	id, err := findingID(f)
	return pa.SetProtocolFindingID(f, id), err
}
func issueReceipt(payload pa.ValidationReceiptPayload, secret []byte) (string, error) {
	if len(secret) < pa.ValidationReceiptMinSecretBytes {
		return "", errReceiptInvalid
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	canonical, err := figjcs.Canonicalize(raw)
	if err != nil {
		return "", err
	}
	mac := hmac.New(sha256.New, secret)
	_, _ = mac.Write(canonical)
	return base64.RawURLEncoding.EncodeToString(canonical) + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil)), nil
}
func verifyReceipt(token string, secret []byte, now time.Time) (pa.ValidationReceiptPayload, error) {
	var p pa.ValidationReceiptPayload
	if len(secret) < pa.ValidationReceiptMinSecretBytes {
		return p, errReceiptInvalid
	}
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return p, errReceiptInvalid
	}
	raw, e := base64.RawURLEncoding.DecodeString(parts[0])
	if e != nil {
		return p, errReceiptInvalid
	}
	sig, e := base64.RawURLEncoding.DecodeString(parts[1])
	if e != nil || len(sig) != sha256.Size {
		return p, errReceiptInvalid
	}
	canonical, e := figjcs.Canonicalize(raw)
	if e != nil || !hmac.Equal(canonical, raw) {
		return p, errReceiptInvalid
	}
	mac := hmac.New(sha256.New, secret)
	_, _ = mac.Write(raw)
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if !hmac.Equal(sig, mac.Sum(nil)) || decoder.Decode(&p) != nil || decoder.Decode(&struct{}{}) != io.EOF {
		return p, errReceiptInvalid
	}
	if p.Version != pa.ValidationReceiptVersion || p.ActorUserID == "" || p.DuplicatePolicyVersion <= 0 || p.SimilarityPolicyVersion <= 0 || len(p.DraftDigest) != 64 || len(p.FindingSetDigest) != 64 || len(p.RegistryFingerprint) != 64 {
		return p, errReceiptInvalid
	}
	for _, digest := range []string{p.DraftDigest, p.FindingSetDigest, p.RegistryFingerprint} {
		if _, e = hex.DecodeString(digest); e != nil || strings.ToLower(digest) != digest {
			return p, errReceiptInvalid
		}
	}
	n := now.UTC().Unix()
	if p.IssuedAt > n || p.ExpiresAt < n || p.ExpiresAt-p.IssuedAt != int64(pa.ReceiptLifetime/time.Second) {
		return p, errReceiptExpired
	}
	return p, nil
}
