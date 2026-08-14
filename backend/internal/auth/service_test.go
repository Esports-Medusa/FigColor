package auth

import "testing"

func TestValidatePassword(t *testing.T) {
	tests := []struct{ name, password, confirm, code string }{
		{"minimum length", "abcd1234", "abcd1234", ""},
		{"valid", "science1234", "science1234", ""},
		{"mismatch", "science1234", "science1235", "PASSWORD_MISMATCH"},
		{"short", "abc123", "abc123", "PASSWORD_INVALID"},
		{"no number", "abcdefghij", "abcdefghij", "PASSWORD_INVALID"},
		{"no letter", "1234567890", "1234567890", "PASSWORD_INVALID"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			err := validatePassword(tc.password, tc.confirm)
			if tc.code == "" && err != nil {
				t.Fatal(err)
			}
			if tc.code != "" {
				ae, ok := asAuthError(err)
				if !ok || ae.Code != tc.code {
					t.Fatalf("err=%v", err)
				}
			}
		})
	}
}
func TestEmailNormalization(t *testing.T) {
	if got := normalizeEmail("  Alice@Example.COM "); got != "alice@example.com" {
		t.Fatalf("got %q", got)
	}
}
func TestRawTokenIsHashedAndUnique(t *testing.T) {
	a, ah, err := rawToken()
	if err != nil {
		t.Fatal(err)
	}
	b, bh, err := rawToken()
	if err != nil {
		t.Fatal(err)
	}
	if a == b || ah == bh || a == ah || tokenHash(a) != ah {
		t.Fatal("token generation/hash invariant failed")
	}
}
