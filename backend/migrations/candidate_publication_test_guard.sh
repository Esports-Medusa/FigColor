#!/usr/bin/env bash

figcolor_guard_candidate_publication_target() {
  local database_name="${FIGCOLOR_TEST_DB_NAME:-}"
  local host="${PGHOST:-}"
  local port="${PGPORT:-}"
  local prefix="figcolor_candidate_publication_test_"
  local suffix=""

  [[ "${FIGCOLOR_ALLOW_DESTRUCTIVE_TEST_DB:-}" == "1" ]] || {
    echo "refusing candidate publication test database: FIGCOLOR_ALLOW_DESTRUCTIVE_TEST_DB=1 is required" >&2
    return 64
  }
  [[ "${FIGCOLOR_TEST_CLUSTER_CONFIRMED_TEMPORARY:-}" == "1" ]] || {
    echo "refusing candidate publication test database: temporary cluster confirmation is required" >&2
    return 64
  }
  [[ -n "$host" && -n "$port" ]] || {
    echo "refusing candidate publication test database: explicit PGHOST and PGPORT are required" >&2
    return 64
  }
  case "$host" in
    localhost|127.0.0.1|::1)
      echo "refusing candidate publication test database: ambiguous loopback host is not allowed" >&2
      return 64
      ;;
  esac
  [[ "$port" =~ ^[0-9]+$ && "$port" != "5432" ]] || {
    echo "refusing candidate publication test database: explicit non-default numeric PGPORT is required" >&2
    return 64
  }
  [[ -n "$database_name" ]] || {
    echo "refusing candidate publication test database: database name is empty" >&2
    return 64
  }
  case "$database_name" in
    postgres|template0|template1|figcolor)
      echo "refusing candidate publication test database: protected database name" >&2
      return 64
      ;;
  esac
  [[ "$database_name" == "$prefix"* ]] || {
    echo "refusing candidate publication test database: dedicated prefix is required" >&2
    return 64
  }
  suffix="${database_name#"$prefix"}"
  [[ "$suffix" =~ ^[A-Za-z0-9][A-Za-z0-9_-]{5,}$ ]] || {
    echo "refusing candidate publication test database: unique suffix of at least six safe characters is required" >&2
    return 64
  }
  [[ -z "${FIGCOLOR_DEV_DB_NAME:-}" || "$database_name" != "$FIGCOLOR_DEV_DB_NAME" ]] || {
    echo "refusing candidate publication test database: target matches development database" >&2
    return 64
  }

  printf '%s\n' \
    "Candidate publication PostgreSQL target:" \
    "  Host: $host" \
    "  Port: $port" \
    "  Database: $database_name" \
    "  Destructive opt-in: confirmed" \
    "  Temporary-cluster confirmation: confirmed" \
    "  Matched prefix: $prefix" \
    "  Unique suffix present: yes"
}
