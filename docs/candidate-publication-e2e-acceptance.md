# Candidate Publication E2E Acceptance

Date: 2026-08-08

This checkpoint hardens and accepts the existing ingestion-to-publication MVP. It does not add a new publication API or business workflow.

## Accepted chain

```text
source package scan → prepare → validate → atomic candidate submission
→ Admin candidate discovery/detail/shared preview → edit persistence
→ confirmed payload-free publication → same palette in public list/detail
```

The frozen WP6 schemas, JCS/fingerprint behavior, ingestion receipt contract, publication endpoint, and public query boundary are unchanged.

## Executable frontend evidence

Candidate publication orchestration is isolated in `CandidatePublication.logic.ts`. Behavior tests execute eligibility, dirty-form rejection, confirmation cancellation, one-request concurrency, canonical response validation, inline 422 issues, 401/403/409 status preservation, lost-response reconciliation, explicit retry, and the final published state. `.vue?raw` tests remain only for component wiring and structure.

## PostgreSQL evidence

- Harness: Postgres.app temporary `initdb`, PostgreSQL 16.14.
- Host: unique Unix socket `/tmp/figcolor-publication-e2e-pg.<unique>`.
- Port: non-default `35483`.
- Databases: `figcolor_candidate_publication_test_<unique-suffix>` only.
- Migrations: `001` through `020`, excluding the repository's intentionally absent `012`.
- Target classification: temporary and isolated; not the development, system/default, staging, or production cluster.

The aggregate harness runs PostgreSQL ingestion repository/service/HTTP tests before publication integration. Publication integration proves Admin filtered discovery, canonical detail data, edit persistence, publication-time validation, same palette ID, authored applicability and preview/receipt linkage preservation, public exclusion before commit, public list/detail visibility after commit, repeat conflict, private exclusion, validation rollback, injected SQL rollback, and one-success/one-conflict concurrency.

The CLI ingestion suite separately executes real source-package scan, prepare, validation, deterministic proposal generation, request/receipt contracts, and submission behavior.

## Destructive-target safety

The harness now refuses to run before the first `psql` invocation unless both destructive opt-in and temporary-cluster confirmation are present. It also requires explicit non-default host/port data and a unique database name under `figcolor_candidate_publication_test_`. Protected, development, ambiguous, empty, fixed-prefix-only, and ordinary database names are rejected. The printed target summary excludes passwords and DSNs.

Focused tests prove guard rejection does not reach destructive SQL.

## Manual browser result

Manual browser acceptance was not run because the available in-app browser runtime could not establish its sandbox session. Local backend/frontend processes and a dedicated browser fixture database were prepared, but no UI interaction or screenshot was claimed as passed.

## Remaining boundaries

- Browser screenshots remain pending an available browser runtime.
- Reject, Archive, Unpublish, Republish, bulk publication, deployment, and WP7 were not started.
