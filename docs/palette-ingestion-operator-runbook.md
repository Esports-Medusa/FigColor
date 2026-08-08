# Palette Ingestion Operator Runbook

## Preconditions and safety

Use Node/npm and the repository Go/PostgreSQL prerequisites. Resolve the batch path, ignored artifact root, API base URL, and authenticated Admin token before submission. For any disposable database, print and verify its unique approved name and target first; never use an ordinary development, shared, staging, or production database. Tokens belong only in `FIGCOLOR_ADMIN_TOKEN` and must not be placed in commands, logs, manifests, or committed files.

## Deterministic and non-writing flow

```sh
node scripts/palette-ingest/cli.mjs scan --batch <batch> --artifacts <artifacts> --json
node scripts/palette-ingest/cli.mjs prepare --batch <batch> --artifacts <artifacts> --json
node scripts/palette-ingest/cli.mjs validate --batch <batch> --artifacts <artifacts> --json
node scripts/palette-ingest/cli.mjs status --batch <batch> --artifacts <artifacts> --json
node scripts/palette-ingest/cli.mjs submit --batch <batch> --artifacts <artifacts> --api-base-url <url> --dry-run --json
```

Repeat prepare/validate with `--resume` and compare proposal IDs, normalized hashes, issue codes, and checkpoint/report bindings. Dry-run builds canonical requests but performs no HTTP or database write. Invalid packages remain in metrics and must have no success receipt.

## Submission and recovery

```sh
FIGCOLOR_ADMIN_TOKEN='<protected>' node scripts/palette-ingest/cli.mjs submit \
  --batch <batch> --artifacts <artifacts> --api-base-url <url> --json

FIGCOLOR_ADMIN_TOKEN='<protected>' node scripts/palette-ingest/cli.mjs submit \
  --batch <batch> --artifacts <artifacts> --api-base-url <url> --resume --json
```

Default batch behavior isolates failures and continues; `--fail-fast` stops after the first unsuccessful package without undoing completed packages. On a lost response, retain the request/checkpoint and resume with the same idempotency binding. Never rotate the key or delete evidence to guess the result. A submitted checkpoint must skip HTTP; a canonical backend replay must return the existing receipt and never create another aggregate.

Verify receipt proposal/hash/fingerprint/palette linkage, forced candidate/public/ownerless/curated fields, ordered colors and stable IDs, applicability, draft non-primary previews, Admin candidate discovery, and absence from public list/detail/preview.

## Admin handoff and terminal outcomes

Review warnings/evidence and the canonical aggregate. Save only supported edits, reload, and confirm it remains candidate/non-public with receipt linkage intact. For Publish, first publish and select exactly one valid primary preview, then use Candidate Publish and verify public list/detail/primary selection and evidence exclusion. For Reject, use imported-candidate Reject and verify archived/public/ownerless, preserved archived previews with no primary flag, public absence, and retained ingestion linkage.

There is no SQL rollback procedure. Before Publish, correct or Reject through Admin Review. Pilot-environment rollback is disposal of the explicitly identified disposable database only after evidence/report completion and with the approved authority.

## Retention and cleanup

Retain protected manifests, reports, checkpoints, canonical requests, receipts, and necessary sanitized logs for the approved duration. Proposals/reports may be regenerated from unchanged retained inputs, but canonical receipts and terminal traceability evidence must be retained. Inputs, evidence, logs, screenshots with Admin data, dumps, secrets, and DSNs must never be committed or exposed publicly. The WP9 policy is Jackie-only access, protected local storage, 90 days after sign-off, and archival/deletion only by Jackie.
