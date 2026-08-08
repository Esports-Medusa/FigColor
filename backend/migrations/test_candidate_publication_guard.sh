#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "$0")/../.." && pwd)"
guard="$root_dir/backend/migrations/candidate_publication_test_guard.sh"
main="$root_dir/backend/migrations/test_candidate_publication.sh"
fake_psql="$root_dir/backend/migrations/testdata/fail_if_called_psql.sh"
valid_name="figcolor_candidate_publication_test_guard123"

run_guard() {
  env -i PATH="$PATH" HOME="${HOME:-/tmp}" \
    FIGCOLOR_ALLOW_DESTRUCTIVE_TEST_DB="${ALLOW:-1}" \
    FIGCOLOR_TEST_CLUSTER_CONFIRMED_TEMPORARY="${TEMPORARY:-1}" \
    FIGCOLOR_TEST_DB_NAME="${DB_NAME-$valid_name}" \
    FIGCOLOR_DEV_DB_NAME="${DEV_DB_NAME:-figcolor_dev}" \
    PGHOST="${TEST_HOST:-/tmp/figcolor-guard-cluster}" \
    PGPORT="${TEST_PORT:-35481}" \
    bash -c 'source "$1"; figcolor_guard_candidate_publication_target' bash "$guard"
}

expect_rejected() {
  local name="$1"
  shift
  local output
  if output=$("$@" 2>&1); then
    echo "expected guard rejection: $name" >&2
    exit 1
  fi
  [[ "$output" != *"secret-password"* && "$output" != *"postgresql://"* ]] || {
    echo "guard leaked sensitive connection material: $name" >&2
    exit 1
  }
}

ALLOW=0 expect_rejected "missing destructive opt-in" run_guard
TEMPORARY=0 expect_rejected "missing temporary confirmation" run_guard
DB_NAME='' expect_rejected "empty database" run_guard
for protected in postgres template0 template1 figcolor ordinary_database figcolor_candidate_publication_test_; do
  DB_NAME="$protected" expect_rejected "$protected" run_guard
done
DEV_DB_NAME="$valid_name" expect_rejected "development database match" run_guard
TEST_HOST=localhost expect_rejected "ambiguous localhost" run_guard
TEST_PORT=5432 expect_rejected "default port" run_guard

output=$(PGPASSWORD=secret-password DATABASE_URL='postgresql://user:secret-password@example/db' run_guard)
[[ "$output" == *"Database: $valid_name"* && "$output" == *"Unique suffix present: yes"* ]] || {
  echo "valid unique test target was not accepted" >&2
  exit 1
}
[[ "$output" != *"secret-password"* && "$output" != *"postgresql://"* ]] || {
  echo "valid guard summary leaked sensitive connection material" >&2
  exit 1
}

set +e
output=$(env -i PATH="$PATH" HOME="${HOME:-/tmp}" PSQL_BIN="$fake_psql" \
  FIGCOLOR_TEST_DB_NAME="$valid_name" PGHOST=/tmp/figcolor-guard-cluster PGPORT=35481 \
  bash "$main" 2>&1)
status=$?
set -e
[[ $status -ne 0 && $status -ne 99 && "$output" != *"DESTRUCTIVE_SQL_WAS_CALLED"* ]] || {
  echo "main harness reached destructive SQL before guard rejection" >&2
  exit 1
}

echo "candidate publication destructive-target guard tests passed"
