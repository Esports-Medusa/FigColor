package submission

import (
	"crypto/sha256"
	"encoding/hex"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSubmissionDependencyAndMigrationArchitecture(t *testing.T) {
	files := map[string][]string{"handler.go": {"database/sql", "internal/database", "lib/pq"}, "repository.go": {"gin-gonic/gin", "net/http"}, "protocol.go": {"gin-gonic/gin", "database/sql", "internal/database"}}
	for file, forbidden := range files {
		parsed, err := parser.ParseFile(token.NewFileSet(), file, nil, parser.ImportsOnly)
		if err != nil {
			t.Fatal(err)
		}
		for _, item := range parsed.Imports {
			path := strings.Trim(item.Path.Value, "\"")
			for _, bad := range forbidden {
				if strings.Contains(path, bad) {
					t.Fatalf("%s imports forbidden dependency %s", file, path)
				}
			}
		}
	}
	migration := filepath.Join("..", "..", "..", "migrations", "021_create_palette_assistant_submissions.sql")
	raw, err := os.ReadFile(migration)
	if err != nil {
		t.Fatal(err)
	}
	sql := string(raw)
	required := []string{"BEGIN;", "COMMIT;", "jsonb_typeof(palette_row.colors)", "jsonb_typeof(color_row.value)", "^#[0-9A-F]{6}$", "jsonb_typeof(color_row.value->'order')", "count(DISTINCT", "generate_series(0, color_total - 1)", "legacy palette color shape is invalid", "legacy palette color order is invalid", "active public Palette exact fingerprint could not be computed", "active public Palette exact fingerprints must be unique", "exact_fingerprint_version", "idx_palette_active_public_exact_fingerprint", "owner_user_id IS NULL", "visibility = 'public'", "status IN ('candidate', 'published')", "palette_assistant_submissions", "UNIQUE(actor_user_id, operation, idempotency_key)", "candidate_receipt JSONB", "REFERENCES palettes(id)"}
	for _, fragment := range required {
		if !strings.Contains(sql, fragment) {
			t.Fatalf("migration missing %q", fragment)
		}
	}
	projection := `{"ordered_hex":["#112233","#AABBCC"],"version":1}`
	sum := sha256.Sum256([]byte(projection))
	draft := validDraft()
	got, err := exactFingerprint(draft)
	if err != nil {
		t.Fatal(err)
	}
	if got != hex.EncodeToString(sum[:]) {
		t.Fatalf("Go/JCS exact projection mismatch: %s", got)
	}
	if !strings.Contains(sql, `'{"ordered_hex":['`) || !strings.Contains(sql, `|| '],"version":1}'`) {
		t.Fatal("SQL exact projection shape drifted from Go/JCS authority")
	}
}
