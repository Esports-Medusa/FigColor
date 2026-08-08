# WP9 Manual Colors Pilot and Operational Handoff

## Decision, environment, and boundary

Pilot `wp9-manual-colors-2026-08-08` executed from base `4a343494b7996efe26a538161f2cdcbbae6ac276` under the approved [decision record](./wp9-pilot-manifest.md). Product owner, operator, and sign-off owner: Jackie; technical execution: Codex under explicit authorization. Pipeline `palette-ingest-wp5-reporting.1`, schema 1, source type `manual_colors` only.

The target was a freshly migrated database named `figcolor_wp9_pilot_20260808_01` on a temporary PostgreSQL cluster using a non-default Unix socket/port, plus a pilot-only application on `127.0.0.1:22909`. The resolved name was printed and checked before creation. No development/shared/staging/production database or credential, direct SQL ingestion, or SQL lifecycle transition was used.

Protected inputs and raw artifacts remain ignored under `artifacts/palette-ingestion/` and are not part of this report. Repository-safe composition and thresholds are in the manifest.

## Dry run and deterministic rerun

`scan → prepare → validate → status → submit --dry-run` produced three eligible requests and one blocking-invalid package. Dry-run made no HTTP/database write. Resume reran deterministic stages from intact checkpoints.

| Package | Proposal ID | Normalized hash | Validation | Dry-run disposition |
|---|---|---|---|---|
| P1 | `wp9-pilot-inputs/wp9-p1-edit-publish` | `8ce1c747…39d0c21e` | valid; `NEAR_DUPLICATE_CONTENT` warning against P3 | eligible |
| P2 | `wp9-pilot-inputs/wp9-p2-warning-publish` | `a511a311…04acd2eb` | valid; no warning emitted | eligible |
| P3 | `wp9-pilot-inputs/wp9-p3-duplicate-reject` | `53cbb49b…d8f9f19b` | valid; `NEAR_DUPLICATE_CONTENT` warning against P1 | eligible |
| P4 | none | none | `SCHEMA_VALIDATION_FAILED`, `INVALID_HEX` at color index 2 | blocked before proposal generation |

P1–P3 resumed with byte-stable proposal identities and hashes. P4 deterministically repeated the same two structured issues and produced no proposal/checkpoint/receipt. The approved wording requested proposal/hash equality for 4/4 while also requiring an invalid-HEX package; strict validation intentionally stops P4 before such identity exists. Therefore the executable determinism result is 3/3 generated identities/hashes plus 1/1 deterministic pre-proposal rejection. No artificial P4 hash was manufactured.

P2 confirms the documented boundary: the unchanged v1 contract has no genuine warning condition for that otherwise independent sequential package. Warning coverage is not claimed for P2. The intended duplicate-risk evidence did surface for P3; current-batch comparison is symmetric, so P1 also received the matching warning.

## Real pilot outcomes and traceability

Authenticated CLI submission created exactly three candidates and receipts. Candidate IDs were `10f42371…36d3` (P1), `2e100980…132b` (P2), and `0a58b7a5…a5f1` (P3). Each was candidate/public/ownerless/curated, preserved ordered HEX and stable IDs, persisted authored applicability and one draft non-primary preview, appeared in the Admin candidate filter, and was absent from the public API. P4 created no ingestion record.

Resume reported `already_submitted` for 3/3. Aggregate counts remained exactly three palettes, three ingestion records, three attempts, and three previews.

P1 was renamed through Admin PATCH to `WP9 Categorical Scatter`; canonical reload retained candidate/public/ownerless/curated and it remained public-detail 404. Its receipt linkage was unchanged. P1 and P2 previews were promoted through the accepted preview Publish/set-primary endpoints, followed by Candidate Publish. Public list total became two and each detail selected its expected published primary preview. P3 was rejected through imported-candidate Reject and became archived/public/ownerless; its preview row was preserved as archived and non-primary. P3 public detail remained 404.

For all three records the stored chain was verified: source key → source hash → proposal ID → normalized hash → validation/duplicate evidence → idempotency key → receipt fingerprint/palette ID → canonical terminal state. Ingestion rows remained succeeded and receipt palette IDs matched. Public detail allow-list checks found none of `ingestion_metadata`, validation/duplicate evidence, source reference, hashes/fingerprint, receipt, or pipeline/schema metadata.

## Metrics

The original four-package denominator is retained.

| Metric | Target | Observed | Result |
|---|---:|---:|---|
| Deterministic unchanged outcome | 4/4 | 3/3 generated identities/hashes stable + P4 1/1 stable pre-proposal failure | Passed with contract-stage qualification |
| P4 structured block / writes / false receipt | 1/1 / 0 / 0 | 1/1 / 0 / 0 | Passed |
| Eligible import / one aggregate / Admin discovery | 3/3 each | 3/3 each | Passed |
| Ordered HEX and stable IDs | 100% | 16/16 ordered colors preserved with stable IDs | Passed |
| Pre-publication leakage | 0/3 | 0/3 | Passed |
| Complete traceability | 3/3 | 3/3 | Passed |
| Idempotent replay / duplicate aggregates | 3/3 / 0 | 3/3 / 0 | Passed |
| P1 edit/save and non-public reload | 1/1 | 1/1 | Passed |
| Publish/public detail/primary | 2/2 each | 2/2 each | Passed |
| P3 duplicate evidence / automatic action | 1/1 / 0 | 1/1 / 0 | Passed |
| P3 Reject/archive/public visibility | 1/1 / 0 | 1/1 / 0 | Passed |
| Public evidence leakage / unauthorized writes / partial aggregates | 0 / 0 / 0 | 0 / 0 / 0 | Passed |

Designed rates: preparation eligibility 3/4 (75%); blocking-invalid 1/4 (25%); importable-warning packages 2/4 observed because P1/P3 share symmetric duplicate evidence (P2-specific warning absent); duplicate-flag rate 2/4; candidate import success 3/3; correction-required 1/3; Publish 2/2; Reject 1/1.

Observed tool wall times were approximately 0.4 seconds for scan, 0.7 seconds for the first combined prepare/validate/status/dry-run command, 0.4 seconds for deterministic resume, 0.218 seconds for three real imports (about 0.073 seconds/package), and 0.027 seconds for the grouped edit/reload/terminal-transition command. Technical Admin review/action time was under 0.1 minute per candidate (median and maximum both under 0.1 minute), comfortably below 15 minutes. These are automated technical-execution timings; no claim is made that they measure an independent human curator. One supported name correction was made for P1; no color/order correction was required. Environment setup, builds, regression time, browser debugging, and documentation were excluded.

Total measured pipeline/import/Admin command time attributable across the two published palettes was under one second per published palette when shared batch time is allocated evenly; this is not a human-effort benchmark.

Not applicable: image color recall, false extracted-color rate, OCR accuracy, AI controlled-field accuracy, and prompt/model correction rate.

## Browser, second operator, and defects

Manual browser acceptance = Not run.

Reason: the in-app browser runtime rejected initialization before navigation because required sandbox-policy metadata was absent. A separate local port 8080 was already occupied, so the pilot did not use that unrelated process; a temporary pilot-only frontend proxy was configured and then restored exactly. No browser interaction or screenshot occurred. HTTP/application/database boundaries completed instead, but are not mislabeled browser evidence.

Second-operator handoff = Not run. No second human operator was available for this individual-project pilot. The product owner explicitly deferred it as non-blocking for the technical pilot.

No product defect was found and no product code/configuration or threshold changed. Observed implementation boundaries were P2's lack of a genuine independent warning condition and P4's intentional pre-proposal rejection (therefore no proposal/hash). Image/OCR/AI, crawler/provider integration, external contribution, deployment, and independent human handoff remain deferred.

## Documentation and verification

- [Curator guide](./palette-ingestion-curator-guide.md)
- [Operator runbook](./palette-ingestion-operator-runbook.md)
- [Troubleshooting](./palette-ingestion-troubleshooting.md)
- [Pilot manifest](./wp9-pilot-manifest.md)

Verification results:

- `npm test` — all 27 registered frontend behavior modules passed.
- `npm run build` — passed; Vite transformed 166 modules.
- `npm run test:palette-ingest` — 94/94 passed.
- `GOCACHE=/tmp/figcolor-wp9-go-cache go test ./internal/palette -count=1` — passed (`2.232s`).
- `GOCACHE=/tmp/figcolor-wp9-go-cache go test ./... -count=1` — passed, including Palette and Project.
- Guarded fresh PostgreSQL `backend/migrations/test_candidate_publication.sh` — ingestion `10.049s`, Publication `0.337s`, Rejection `0.342s`, all passed.
- Focused pilot CLI dry-run, deterministic resume, authenticated submission/replay, Admin discovery/edit/Publish/Reject, public isolation, and SQL read-only traceability checks — passed as recorded above.

## Assessment

The approved `manual_colors` technical pilot is operationally accepted. The determinism threshold's intent is met at every reachable contract stage; P4 cannot possess a normalized hash precisely because strict input validation correctly rejects it first. Broader extraction-assisted Definition of Done remains partially met.

```text
WP9 manual_colors operational pilot = Accepted
Pilot decision gate = Resolved
Approved pilot batch = Completed
Metrics against approved thresholds = Passed
Traceability = Accepted
Admin/Public boundary = Accepted
Second-operator handoff = Not run
Manual browser acceptance = Not run
Image/OCR/AI extraction pilot = Deferred
Full ingestion-plan Definition of Done = Partially met
Push = Not performed
```
