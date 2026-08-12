package submission

import (
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
	required := []string{"BEGIN;", "COMMIT;", "exact_fingerprint_version", "idx_palette_active_public_exact_fingerprint", "owner_user_id IS NULL", "visibility = 'public'", "status IN ('candidate', 'published')", "palette_assistant_submissions", "UNIQUE(actor_user_id, operation, idempotency_key)", "candidate_receipt JSONB", "REFERENCES palettes(id)"}
	for _, fragment := range required {
		if !strings.Contains(sql, fragment) {
			t.Fatalf("migration missing %q", fragment)
		}
	}
}
