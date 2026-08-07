#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "$0")/../.." && pwd)"
test_db="figcolor_candidate_publication_test"
PSQL_BIN="${PSQL_BIN:-psql}"
GO_BIN="${GO_BIN:-go}"

db() { "$PSQL_BIN" -v ON_ERROR_STOP=1 -d "$test_db" "$@"; }
"$PSQL_BIN" -v ON_ERROR_STOP=1 -d postgres -c "DROP DATABASE IF EXISTS $test_db" >/dev/null
"$PSQL_BIN" -v ON_ERROR_STOP=1 -d postgres -c "CREATE DATABASE $test_db" >/dev/null
trap '"$PSQL_BIN" -d postgres -c "DROP DATABASE IF EXISTS '"$test_db"'" >/dev/null' EXIT

migrations=(001_init 002_figure_selected_roles 003_create_users 004_create_auth_providers 005_create_favorite_palettes 006_add_user_id_to_paper_projects 007_handle_existing_projects 008_add_role_to_users 009_create_palettes_table 010_seed_admin_user 011_add_avoid_case 013_persist_palette_color_ids 014_add_chart_applicability 015_create_palette_preview_cases 016_figure_assignments_base_palette_fk 017_add_palette_ownership_visibility 018_expand_palette_preview_chart_types 019_create_palette_ingestion_records 020_add_palette_ingestion_recovery)
for migration in "${migrations[@]}"; do
  db -q -f "$root_dir/backend/migrations/${migration}.sql"
done

(cd "$root_dir/backend" && FIGCOLOR_PUBLICATION_TEST_DSN="dbname=$test_db sslmode=disable" "$GO_BIN" test ./internal/palette -run '^TestCandidatePublicationPostgres$' -count=1)
