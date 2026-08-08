#!/usr/bin/env bash
set -euo pipefail

PSQL_BIN="${PSQL_BIN:-psql}"
GO_BIN="${GO_BIN:-go}"
ADMIN_DB="${PGDATABASE:-postgres}"
test_db="figcolor_repository_020_${$}"
root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

admin() { "$PSQL_BIN" -X -v ON_ERROR_STOP=1 -d "$ADMIN_DB" "$@"; }
db() { "$PSQL_BIN" -X -v ON_ERROR_STOP=1 -d "$test_db" "$@"; }
cleanup() { admin -q -c "DROP DATABASE IF EXISTS ${test_db} WITH (FORCE)" || true; }
trap cleanup EXIT

migrations=(001_init 002_figure_selected_roles 003_create_users 004_create_auth_providers 005_create_favorite_palettes 006_add_user_id_to_paper_projects 007_handle_existing_projects 008_add_role_to_users 009_create_palettes_table 010_seed_admin_user 011_add_avoid_case 013_persist_palette_color_ids 014_add_chart_applicability 015_create_palette_preview_cases 016_figure_assignments_base_palette_fk 017_add_palette_ownership_visibility 018_expand_palette_preview_chart_types 019_create_palette_ingestion_records 020_add_palette_ingestion_recovery)

cleanup
admin -q -c "CREATE DATABASE ${test_db}"
for migration in "${migrations[@]}"; do
  db -q -f "$root_dir/backend/migrations/${migration}.sql"
done

(
  cd "$root_dir/backend"
  FIGCOLOR_INGESTION_TEST_DSN="dbname=${test_db} sslmode=disable" \
    GOCACHE="${GOCACHE:-/tmp/figcolor-go-cache}" \
    "$GO_BIN" test ./internal/palette -run '^TestIngestion(RepositoryPostgres|ServicePostgresAggregate)$' -count=1
)

echo 'repository/service 020 PostgreSQL recovery and aggregate integration: PASS'
