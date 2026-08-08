# WP8 End-to-End Hardening and Regression Acceptance

## Scope and evidence vocabulary

Tested base: `815a2c49f524b27c0c28b018588a88705667ecb5` (parents `f8a7d78082dfc4068aefb421c8b2671b39905daf` and `91113b525f3f2b63567d99949fddfa9993c81f6e`). The supported source boundary is the version 1 `manual_colors` package contract. No image extraction, OCR, AI/provider, crawler, unsupported source, taxonomy, chart type, fallback, or automatic merge/publication capability is claimed.

Evidence labels used below are: **direct executable** (the named command crosses every stated boundary), **integration** (real HTTP/service/repository/database boundaries), **service/database**, **executable frontend**, **structural/source assertion**, **manual browser**, and **not tested**. Structural assertions are not described as E2E.

## Authoritative regression matrix

| Matrix | Start and pipeline result | Transition and canonical outcome | Admin/public/evidence outcome | Retry or rollback | Evidence |
|---|---|---|---|---|---|
| A — valid source | Valid `submission-first` `manual_colors`; deterministic prepare/validate; stable proposal/content/request hashes | Authenticated CLI POST creates exactly one curated, public, ownerless `candidate`; ordered stable-ID colors, applicability, and draft non-primary preview persist | Candidate is in Admin filter and absent from public list/detail/preview; receipt/checkpoint bind the same palette | Same key/request returns the identical receipt and resume performs no HTTP/write | **direct executable**: `backend/migrations/test_020_cli_http.sh`; **integration**: `TestIngestionHTTPPostgresEndToEnd`; pipeline: `wp1`, `wp4`, `wp6-submission` |
| B — edit/save | Imported candidate from A | Admin PATCH changes the supported editable name; canonical reload remains candidate/public/ownerless; accepted frontend suites cover color order, metadata, applicability and draft preview editing/validation | Updated Admin state is returned; public detail remains 404; ingestion row/receipt linkage and draft non-primary state remain | Backend validation tests prove invalid aggregate edits fail; no publication occurs on save | **direct executable** for real name save: `test_020_cli_http.sh`; **service/database**: `TestCandidatePublicationPostgres`; **executable frontend**: `AdminCandidateReview`, `AdminPreviewCaseEditor`; description is not a current Palette field |
| C — Publish | Independently imported valid candidate, Admin-edited, with ingestion-created preview promoted through the accepted preview lifecycle | Authenticated Admin preview Publish/set-primary, then candidate Publish; same palette becomes `published` with one published primary preview | Public list/detail resolves only after Publish; selector returns that preview; ingestion-only keys are absent from public detail | CLI response-loss/replay and same-key retry do not duplicate; accepted Publish/Publish and Publish/Reject locking remains passing | **direct executable**: `test_020_cli_http.sh`; **service/database**: `TestCandidatePublicationPostgres`, `TestCandidateRejectionPostgres`; **executable frontend**: Candidate Publication/Transition suites |
| D — Reject | Independently imported candidate recovered after lost submit response | Authenticated Admin Reject changes existing lifecycle to `archived`; preview row is preserved/archived and primary cleared | Public detail remains 404; ingestion row and receipt linkage remain; repeat/manual/private/owned exclusions pass | Lost response reconciliation, Reject/Reject, Publish/Reject, and forced aggregate rollback pass | **direct executable**: `test_020_cli_http.sh`; **service/database**: `TestCandidateRejectionPostgres`; **executable frontend**: Candidate Rejection/Transition suites |
| E — trust failures | Missing/invalid auth, non-admin, unknown/server-owned fields, malformed/oversized payload, invalid HEX/order/vocabulary/applicability/preview references/lifecycle/hash, unsupported source and unsafe path | Typed 400/401/403/409/413/415/422 results at their established boundaries; no candidate aggregate for rejected input | No success receipt/evidence; independent packages continue unless fail-fast | Tampered binding/checkpoint is not reused; terminal and unresolved outcomes retain distinct checkpoint states | **integration**: ingestion handler/PostgreSQL HTTP tests; **direct executable pipeline**: `wp1`, `wp4-preview-validation`, `wp6-submission` |
| F — evidence boundary | Supported warning, exact/perceptual duplicate finding, source reference, versions, hashes, receipt and draft preview | Evidence persists in `palette_ingestion_records` through edit and both terminal outcomes; no auto-merge/publication | Admin database/API evidence is inspectable where implemented; public DTO/preview and public detail omit ingestion-only keys | Evidence participates in request fingerprint, so changed evidence conflicts | **service/database** and **direct executable**: PostgreSQL suites plus `test_020_cli_http.sh`; **structural/source assertion** for rendered page object flow. Paper/DOI/journal/author/raw-model categories are outside v1 contract |
| G — batch recovery | Mixed independent packages and locally invalid/remote-failed packages; deterministic checkpoints per source | Default continues; fail-fast stops at first unsuccessful submit; completed stages resume; corrupt/version/hash-mismatched artifacts are regenerated or rejected | Per-package structured state and summary counts use current CLI vocabulary | Response loss reuses the durable key/body; corrected input can be prepared/validated again without changing unrelated artifacts | **direct executable pipeline**: `wp1` checkpoint/isolation tests, `wp5` report-resume tests, `wp6-submission` batch/fail-fast/lost-response tests; real response-loss recovery in `test_020_cli_http.sh` |
| H — rollback/isolation | Injected failures after palette/preview inserts, receipt binding, commit ambiguity, Publish, and Reject | Aggregate transaction rolls back palette/preview/applicability children; succeeded record is never falsely bound; independent committed aggregates survive | Nothing becomes public; no orphan preview; retry/recovery follows authoritative ingestion state | Same proposal is retryable/recoverable; Reject fixture restores exact palette/preview/evidence state | **service/database**: guarded `test_candidate_publication.sh` covering ingestion, Publication and Rejection |
| I — regressions | Existing manual/admin, public catalog, project-private/default, renderer and chart flows | Public remains published+public+ownerless; private/owned palettes stay outside ingestion/Admin imported candidates; project IDs and assignments retain meaning | Draft/candidate/archived/non-primary preview cases do not enter public DTOs/selectors; Admin drafts remain usable | Existing compatibility behavior is unchanged | **executable frontend/backend**: `npm test`, `go test ./...`; **service/database** ownership/public DTO tests |

## Fixtures and observed outcomes

`contracts/palette-ingestion/v1/fixtures/valid/submission-first/manifest.json` supplies the edited-and-published candidate. `submission-loss/manifest.json` supplies a separate candidate whose first response is deliberately dropped, whose resume returns the canonical receipt, and which is then rejected. Existing invalid fixtures cover source type, traversal/symlink, size, HEX/order, controlled vocabulary, applicability and preview-role/config failures. PostgreSQL fault seams inject failures after palette insert, after preview insert, at receipt binding/commit ambiguity, and inside Publish/Reject transactions.

The real harness proved source package → CLI prepare/validate → authenticated backend endpoint → PostgreSQL candidate/receipt → Admin filter/edit → non-public state, followed by separate Publish and Reject outcomes. Candidate Publish exposed only the published primary preview; Candidate Reject archived the preview and cleared its primary flag. Both retained ingestion identity. The response-loss candidate resumed using the original key and request fingerprint and produced no duplicate palette, preview, record or attempt.

## Verification record

- `npm test` — passed all 27 registered frontend behavior modules.
- `npm run build` — passed (`vue-tsc`; Vite 166 modules transformed).
- `npm run test:palette-ingest` — initial sandbox run 93/94; the redirect-security test alone could not bind `127.0.0.1` (`EPERM`). Permitted rerun passed 94/94.
- `GOCACHE=/tmp/figcolor-wp8-go-cache go test ./internal/palette -count=1` — passed. The first run without the workspace-safe cache failed before tests because the default Go cache was sandbox-inaccessible.
- `GOCACHE=/tmp/figcolor-wp8-go-cache go test ./... -count=1` — passed, including Palette and Project packages. The first run without the workspace-safe cache failed before tests for the same environmental reason.
- Guarded fresh PostgreSQL `backend/migrations/test_candidate_publication.sh` — passed ingestion (`10.019s`), Candidate Publication (`0.340s`), and Candidate Rejection (`0.338s`).
- Fresh PostgreSQL `backend/migrations/test_020_cli_http.sh` — passed CLI → authenticated HTTP → PostgreSQL → Admin edit/Publish/Reject. The first WP8 extension run exposed a test assumption that Palette has a description field; the harness was corrected to test the currently supported name field, without changing product behavior.

Manual browser acceptance = Not run

Reason = No persistent seeded application/browser session was established for this checkpoint; controller/component behavior and real HTTP/database boundaries were executed instead. This is a non-blocking evidence boundary and is not reported as passed.

## Defects and remaining boundaries

No product contract defect was exposed. The only failed new assertion assumed a `description` field that the current Palette contract does not implement; WP8 did not add a field or schema to manufacture coverage. Full scientific-figure extraction, richer bibliographic/research-object evidence, raw model output, browser screenshots, and WP9 pilot/deployment remain outside the implemented slice. The source-rendered public-page boundary has executable normalization/renderer coverage but no browser E2E claim.

## Acceptance

```text
WP8 End-to-End Hardening = Accepted
Supported-source regression matrix = Complete
Admin/Public evidence boundary = Accepted
Batch recovery/isolation = Accepted
Palette/Project/Preview regressions = Accepted
Manual browser acceptance = Not run
WP9 = Not started
Push = Not performed
```
