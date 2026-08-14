#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

PSQL_BIN="${PSQL_BIN:-psql}"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
migrations_dir="$(cd "$script_dir/../migrations" && pwd)"

"$PSQL_BIN" -X -v ON_ERROR_STOP=1 "$DATABASE_URL" <<'SQL'
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename TEXT PRIMARY KEY,
  checksum CHAR(64) NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SQL

for migration in "$migrations_dir"/[0-9][0-9][0-9]_*.sql; do
  filename="$(basename "$migration")"
  checksum="$(shasum -a 256 "$migration" | awk '{print $1}')"
  recorded_checksum="$($PSQL_BIN -X -v ON_ERROR_STOP=1 -At "$DATABASE_URL" \
    -c "SELECT checksum FROM schema_migrations WHERE filename = '$filename'")"

  if [[ -n "$recorded_checksum" ]]; then
    if [[ "$recorded_checksum" != "$checksum" ]]; then
      echo "Migration checksum mismatch: $filename" >&2
      exit 1
    fi
    echo "skip $filename"
    continue
  fi

  echo "apply $filename"
  "$PSQL_BIN" -X -v ON_ERROR_STOP=1 "$DATABASE_URL" -f "$migration"
  "$PSQL_BIN" -X -v ON_ERROR_STOP=1 "$DATABASE_URL" \
    -c "INSERT INTO schema_migrations(filename, checksum) VALUES ('$filename', '$checksum')"
done
