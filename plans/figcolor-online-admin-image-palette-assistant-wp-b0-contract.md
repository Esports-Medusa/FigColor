# FigColor Online Admin Image Palette Assistant — WP-B0 Contract and Threat Model

**Status:** Frozen WP-B0 boundary; implementation is deferred

**Contract:** `palette-assistant.v1`

**Plan:** [FigColor Online Admin Image Palette Assistant Plan](figcolor-online-admin-image-palette-assistant-plan.md), v1.1

**Production DTO owner:** `backend/internal/paletteassistant/contract.go`

The labels used below are normative: **Verified repository fact**, **Frozen WP-B0 decision**, **Proposed for WP-B1**, and **Deferred**.

## 1. Repository dependencies and preflight

- **Verified repository fact:** WP-B0 was prepared on `main` at `99d70b9`, equal to synchronized `origin/main`; the only pre-existing worktree change was the intended untracked v1.1 Plan.
- **Verified repository fact:** Direct `sed -n '1,30l'` inspection of both repository files shows valid headings, emphasis, lists, tables, blockquotes, inline code, and fences with no literal transport escapes. The attachment copies are escaped; the repository files are unaffected, so no mechanical cleanup was made.
- **Verified repository fact:** Go Palette models and migrations persist ordered colors, authored chart applicability, metadata, source fields, lifecycle fields, and server ownership/audit fields. New Palette types are `categorical`, `sequential`, `diverging`, or `mixed`; Palette source types are `manual`, `figure_extracted`, or `curated`.
- **Verified repository fact:** `tasks` and `user_suitability` are not Palette, ingestion, Admin Review, public DTO, schema, or controlled-vocabulary fields.
- **Verified repository fact:** Preview Cases have `chart_type`, template/schema versions, `color_roles`, `preview_config`, seed strategy/value, `is_primary`, and lifecycle status. Backend validation is registry/schema/domain validation; Vue/TypeScript owns renderer construction.
- **Verified repository fact:** Authentication resolves the current database user and role; `/api/admin` routes apply authentication before `AdminRequired`, returning 401 for unauthenticated callers and 403 for non-Admins.
- **Verified repository fact:** `POST /api/admin/palette-candidates` is the offline canonical-ingestion route. Its proposal identity, hashes, ingestion records, leases, checkpoints, recovery, receipts, and idempotency are inseparable from that contract.
- **Verified repository fact:** Offline candidate creation and related Preview Case creation share a transaction. It creates status `candidate`; existing Admin Review owns later Publish/Reject transitions.
- **Verified repository fact:** Offline exact duplication uses canonical normalized content identity and a database unique constraint. Perceptual similarity is offline evidence, not a database Palette invariant.
- **Verified repository fact:** The feasibility extractor supports Go PNG/JPEG decoding, config-decodes before full decode, composites alpha onto white, and uses 2 MiB encoded, 4096×4096, and 8 million pixel limits. It is explicitly disconnected from production.
- **Verified repository fact:** The database Preview Case chart-type constraint predates the Go/TypeScript registry expansion and currently omits `scatter_grouped` and `violin_distribution`. A focused WP-B5 prerequisite must resolve that existing drift before online creation of those Preview Case types; WP-B0 does not change the schema.

## 2. Goals, non-goals, states, and trust boundaries

- **Frozen WP-B0 decision:** The product path is Image → Assistant Suggestions → editable `AssistantDraft` → Admin Confirmation → Online Validation → Create Candidate → existing Admin Review → Publish or Reject.
- **Frozen WP-B0 decision:** The distinct states are Uploaded image, `AssistantAnalysis`, editable `AssistantDraft`, confirmed Draft revision, validated Draft revision, Candidate, and Published/Rejected/Archived.
- **Frozen WP-B0 decision:** Image, analysis, Draft, confirmation, and validation are not formal Palette states. No Palette or Preview Case row exists before successful Create Candidate; abandonment and failed analysis create no formal record.
- **Frozen WP-B0 decision:** Candidate is the first formal persisted state. Candidate creation cannot publish. Existing Admin Review remains the publication gate.
- **Frozen WP-B0 decision:** The uploaded image is request-scoped, memory-owned, and non-persistent. Draft state is browser/in-memory only.
- **Deferred:** Recoverable Draft sessions require a separate short-lived model and privacy/expiry design. They are not database-backed Draft persistence in MVP.
- **Frozen WP-B0 decision:** Trust boundaries are: untrusted multipart bytes; untrusted browser Draft/confirmation/acknowledgments/idempotency headers; authenticated Admin identity from middleware; trusted server validators/registries/vocabularies; and the database transaction boundary.
- **Frozen WP-B0 decision:** Analysis suggestions and frontend renderer results are advisory. Receipt verification, reject-or-accept validation of canonical Draft values, actor binding, duplicate checks, and persistence are authoritative server actions.
- **Frozen WP-B0 decision:** WP-B0 does not implement extraction, handlers, UI, migrations, Candidate integration, signing, storage, or any offline-ingestion behavior change.

## 3. Exact online DTOs

- **Frozen WP-B0 decision:** Server-output JSON names, required/optional encoding, integer/number representation, and online-only types are frozen by `backend/internal/paletteassistant/contract.go` and golden serialization tests. Required output arrays are present (possibly empty), not `null`; fields tagged `omitempty` alone may be absent. Go structs and `MarshalJSON` do not by themselves enforce inbound JSON.
- **Frozen WP-B0 decision:** Inbound requests must reject missing required fields, `null` for required fields, unknown fields, and duplicate JSON object keys. These requirements are executable constants today. WP-B4A owns strict multipart parsing for Analyze; WP-B6 owns the strict JSON decoder/schema layer for Validate/Create. Ordinary `json.Unmarshal` is explicitly insufficient and is not claimed as enforcement.
- **Frozen WP-B0 decision:** `revision`, `confirmed_revision`, and `validated_revision` are positive JSON integers represented as Go `uint64`. Dimensions/counts are JSON integers. Fractions and similarity scores are finite JSON numbers in `[0,1]`; hashes/digests are lowercase 64-character hexadecimal SHA-256 strings.
- **Frozen WP-B0 decision:** Narrow `MarshalJSON` methods make every required slice encode as `[]`, never `null`, including zero-value test fixtures. Times use RFC 3339 JSON strings in UTC at the protocol boundary.
- **Frozen WP-B0 decision:** `color_roles`, `preview_config`, and finding `params` are non-null JSON objects. Nil, empty bytes, `null`, arrays, malformed JSON, and values over 32 KiB per object are rejected. Registry schemas govern member shapes/unknown fields; RFC 8785 canonical object bytes participate in Draft/finding digests, so property spelling/order cannot alter identity.

### 3.1 Analyze

- **Frozen WP-B0 decision:** `POST /api/admin/palette-assistant/analyze` requires Admin authentication and `multipart/form-data` with exactly one non-empty file part named `image`; form fields, duplicate `image` parts, additional parts, missing boundary, and missing image are rejected.
- **Frozen WP-B0 decision:** The declared part MIME must be exactly `image/png` or `image/jpeg`. Authoritative magic-byte/config decoding must agree with it; filenames/extensions are ignored and never returned or logged.
- **Frozen WP-B0 decision:** Analyze response is `AnalyzeResponse`: contract version, a fresh random request-scoped UUID `analysis_id`, safe image facts, deterministic data/structural color suggestions, a seeded Draft, warnings, and algorithm version. It is an intentional bounded wire projection of richer same-request WP-B2/WP-B3 internal results; the normative warning catalog, finding identity, and complete seeded-Draft projection are frozen by WP-B4A without reopening this Go DTO.
- **Frozen WP-B0 decision:** Analyze never returns image bytes/thumbnails, filenames/paths/EXIF, Palette/Candidate/offline IDs, ingestion material, extraction-correctness evidence, inferred paper identity/DOI/authors/journal, `tasks`, or `user_suitability`.
- **Frozen WP-B0 decision:** `analysis_id` is correlation within the response/UI only, is not persisted, is not accepted by validate/create, and confers no authority. Independent requests may and should receive different UUIDs; deterministic Analyze semantics compare every other wire-visible field under identical input/version/policy/config and never require complete cross-request JSON byte equality.

### 3.2 AssistantDraft and stable color identity

- **Frozen WP-B0 decision:** `AssistantDraft` contains contract version, revision, Palette-authored fields, ordered colors, chart applicability, optional Preview Cases, and path-addressed suggestion provenance. It excludes server warning findings as well as actor, owner, visibility, origin, slug, status, timestamps, Candidate ID, publication state, `source_image`, and `journal_style`.
- **Frozen WP-B0 decision:** Analysis color IDs are deterministic UUIDv5 values derived from `(algorithm_version, image_sha256, normalized_hex, deterministic_occurrence_index)`. WP-B4A freezes the literal namespace, exact JCS name schema, occurrence rule, encoding, and vectors. Admin-added colors use client-generated UUIDv4. All IDs use canonical lowercase hyphenated UUID text and are unique within a Draft.
- **Frozen WP-B0 decision:** Reorder and HEX/label edit preserve ID. Explicit replacement deletes the old ID and adds a fresh UUIDv4. Deletion is blocked while any Preview role references that ID; the Admin must first remove/replace every reference. Duplicate IDs are errors.
- **Frozen WP-B0 decision:** Draft HEX must already be uppercase `#RRGGBB`; RGB is absent from the Draft and derived by the server. Draft order must already be contiguous zero-based integers matching array position. Authoritative validation rejects non-canonical values rather than silently rewriting them. Preview roles reference Draft color UUIDs, never bare HEX.
- **Frozen WP-B0 decision:** Draft IDs are scoped only to one `AssistantDraft` and are never authoritative persisted identity. Candidate creation validates every Draft role reference, generates or derives formal Palette color IDs under existing server conventions, builds a transaction-local Draft-ID-to-formal-ID map, and rewrites persisted Preview roles to formal IDs. An unresolved reference rolls back the complete aggregate transaction.
- **Frozen WP-B0 decision:** Color provenance is inline `source` (`assistant|admin`) and `state` (`unconfirmed|accepted|modified`; active colors do not use `cleared`). Other suggestions use JSON Pointer entries with `unconfirmed|accepted|modified|cleared`. `unconfirmed` is an untouched assistant suggestion; `accepted` is an unchanged Admin acceptance or manual authoritative value; `modified` retains but changes a suggestion; `cleared` records an explicitly cleared path suggestion. Deleted colors are absent because Draft history is non-persistent.
- **Frozen WP-B0 decision:** Every color and non-color suggestion carries `producer`, `algorithm_version`, and non-null `reason_codes`. Non-color provenance additionally carries the exact JSON `suggested_value`. No suggestion means no suggestion/provenance entry; a suggested clear is an entry whose `suggested_value` is JSON `null` with an explicit clear reason code. Ambiguity is represented by two or more alternatives sharing a non-empty `ambiguity_group`, or by an explicit ambiguity reason code when no safe alternatives exist. Provider-specific provenance is deferred to WP-B7 and is not implied by this contract.
- **Frozen WP-B0 decision:** Every semantic edit increments revision and clears the UI confirmation assertion, validation receipt, and acknowledgments. Confirmation records an explicit business/UI claim for the exact current revision; it cannot prove that a human inspected the content or preview. The signed receipt proves server validation and actor/content binding, not human review.

### 3.3 Validate

- **Frozen WP-B0 decision:** `POST /api/admin/palette-assistant/validate` requires Admin authentication and `application/json`. Its exact request is `{draft, confirmed_revision}`. `draft.revision` must equal `confirmed_revision`.
- **Frozen WP-B0 decision:** A successful response returns the validated canonical Draft (a detached copy with no silent value transformation), validated revision/digest, policy/registry/vocabulary versions, server-owned warnings/findings, an opaque receipt, and expiry. Validation performs no Palette, Preview Case, Candidate, ingestion, or Draft-session write. Analyze warnings belong only to `AnalyzeResponse`; validation warnings only to `ValidateResponse`; Create recomputes current findings.
- **Frozen WP-B0 decision:** Validation errors use JSON Pointer field paths. The authoritative Draft validator performs no silent normalization: any non-canonical semantic value or formatting receives a field issue and requires Admin correction, a new revision, and reconfirmation. The digest binds the accepted canonical Draft without value transformation.

### 3.4 Create Candidate

- **Frozen WP-B0 decision:** `POST /api/admin/palette-assistant/candidates` requires Admin authentication, `application/json`, and exactly one `Idempotency-Key` header containing a canonical lowercase UUIDv4.
- **Frozen WP-B0 decision:** Its exact body is `{draft, confirmed_revision, validation_receipt, warning_acknowledgments}`. `draft.revision == confirmed_revision`; the body contains no offline proposal/package/hash/checkpoint/ingestion fields.
- **Frozen WP-B0 decision:** Success returns stable `CandidateReceipt`: contract/receipt IDs, Candidate ID, `candidate` status, Preview Case IDs, `/admin/palettes/{candidate_id}/edit`, creation time, and replay boolean. First success is 201 with `replay:false`; same actor/key/digest replay is 200 with the original receipt and `replay:true`.

## 4. Stateless validation binding

- **Frozen WP-B0 decision:** Option A, a stateless signed validation receipt, fits the browser-only Draft and avoids inventing Draft persistence. The opaque authenticated token binds actor user ID, canonical Draft SHA-256 digest, exact revision, validation/registry/vocabulary versions, exact finding IDs requiring acknowledgment, issued-at, expiry, token ID, and signing key ID.
- **Frozen WP-B0 decision:** Receipt lifetime is 15 minutes. Signing keys come from shared deployment secrets, support current plus previous key IDs during rotation, and work across instances. Raw tokens and signing material are never logged. The receipt binds the exact required finding IDs, not warning codes.
- **Frozen WP-B0 decision:** Create recomputes canonical JSON/digest from the complete accepted canonical Draft, verifies signature/actor/revision/expiry/version bindings, checks exact required finding-ID acknowledgments, then reruns authoritative validation and repository-dependent duplicate/similarity checks before one transaction.
- **Frozen WP-B0 decision:** A finding ID is lowercase SHA-256 over finding kind/code, normalized JSON Pointer path, authorized matched Palette ID if disclosure is allowed, policy/version, and RFC 8785-canonical normalized parameters. WP-B4A freezes the exact JCS object schema and golden vectors for Analyze warnings; WP-B6 must separately freeze endpoint-applicable finding schemas before implementation. Similarity parameters include the exact score and policy inputs, so changed score, policy, or Palette identity changes `SimilarityFinding.id`. Duplicate codes at different paths and multiple similar Palettes therefore have different IDs. Unauthorized callers receive no Palette ID; Admin responses may include only IDs already authorized by Admin access.
- **Frozen WP-B0 decision:** `WarningFinding.params` and `SimilarityFinding.params` must be non-empty, non-null JSON objects of at most 32 KiB. Their custom marshalers reject absent, empty-object, array, malformed, and oversized values; golden and negative tests freeze this output constraint. WP-B6 applies the same rules on inbound/recomputed material.
- **Frozen WP-B0 decision:** Missing, malformed, invented, or duplicate acknowledgment IDs fail. Disappeared findings require no acknowledgment. A new finding, changed score/parameters, changed matched identity, or changed policy produces a different ID and forces revalidation; acknowledging one ID never authorizes a future finding that reuses its code.
- **Frozen WP-B0 decision:** A receipt is replayable only as part of a correctly idempotent Create request. Receipt possession alone creates nothing. Cross-Admin use fails actor binding.
- **Frozen WP-B0 decision:** Registry/vocabulary/policy version changes make the receipt stale and require validation again. Any post-confirmation edit increments revision and changes digest, invalidating it.
- **Deferred:** WP-B6 should use an authenticated compact receipt with constant-time verification and explicit key IDs; the exact signing primitive remains an implementation decision based on the deployment secret facility.

## 5. Palette field and vocabulary ownership

| Label | Draft field | Type | Authority | Suggest? | Confirm? | Candidate required? | Persisted? | Editable? | Default / behavior |
|---|---|---|---|---:|---:|---:|---:|---:|---|
| Frozen WP-B0 decision | `name` | bounded string | Palette validation | yes | yes | yes | yes | yes | blocking if blank/invalid |
| Frozen WP-B0 decision | `type` | enum | Go Palette validation | yes | yes | yes | yes | yes | blocking; four canonical values |
| Frozen WP-B0 decision | `colors` | ordered objects | Go color validation | yes | yes | yes | yes | yes | canonical HEX/order required; invalid values block rather than being silently normalized |
| Frozen WP-B0 decision | `chart_applicability` | array | Go preview vocabulary | yes | yes | yes, ≥1 | yes | yes | source persisted as server-derived `curated`; blocking |
| Frozen WP-B0 decision | `disciplines` | string array | `contracts/palette-ingestion/v1/controlled-vocabularies.json` | yes | yes | yes, may be empty | yes | yes | unknown value blocks |
| Frozen WP-B0 decision | `use_cases` | string array | same file | yes | yes | yes, may be empty | yes as `use_case` | yes | unknown value blocks |
| Frozen WP-B0 decision | `avoid_cases` | string array | same file | yes | yes | yes, may be empty | yes as `avoid_case` | yes | unknown value blocks |
| Frozen WP-B0 decision | `tags` | string array | same file | yes | yes | yes, may be empty | yes | yes | unknown value blocks |
| Frozen WP-B0 decision | `accessibility` | booleans | Palette schema | no automatic claims | yes | yes | yes | yes | all false; claims require Admin confirmation |
| Frozen WP-B0 decision | `source_type` | enum | Palette DB/Go | fixed, not inferred | yes | yes | yes | no | `figure_extracted`; blocking if changed |
| Frozen WP-B0 decision | `source_note` | bounded string | online sanitizer | no | yes if non-empty | yes, may be empty | yes | yes | max 500 Unicode code points; trim/control-char rejection |
| Frozen WP-B0 decision | Preview Cases | 0..1 object | preview registries | yes | yes | optional | yes on create | yes | invalid Preview blocks only when supplied |
| Frozen WP-B0 decision | actor/owner/visibility/origin/status/slug/times | absent | server | no | no | server-owned | yes | no | actor=current Admin; owner=null; visibility=`public`; origin=`curated`; status=`candidate`; slug generated; public APIs still exclude non-published status |
| Deferred | `journal_style` | absent | ownership/drift unclear | no | no | no | no via Assistant | no | no new vocabulary in WP-B0 |
| Deferred | `tasks`, `user_suitability` | absent | none | no | no | no | no | no | not mapped elsewhere |

- **Frozen WP-B0 decision:** `figure_extracted` accurately describes an Admin-confirmed palette derived from a figure even though the request-scoped image is not retained. It is distinct from offline package `manual_colors`.
- **Frozen WP-B0 decision:** `source_image` is the database empty string for online Candidates. `source_note` never contains filename/path, DOI/inferred identity, assistant reasoning, hidden metadata, or raw evidence.
- **Verified repository fact:** Controlled vocabulary JSON is currently consumed by Node/offline code, while Go duplicates chart/type rules and TypeScript owns chart registries. There is no single generated cross-language owner today.
- **Frozen WP-B5.4 allocation:** WP-B5.4 loads the existing controlled-vocabulary authority into its deterministic generated validation material and adds the applicable cross-language parity/drift tests without forking a vocabulary. WP-B6 consumes and binds that validator vocabulary version in online Validate/Create receipts and retains endpoint/database drift checks that require its transport or persistence scope.

## 6. Preview Case ownership and lifecycle

- **Frozen WP-B0 decision:** MVP accepts zero or one `DraftPreviewCase`; it is optional even for the primary/best-fit chart applicability because current renderers do not cover every compatibility path uniformly.
- **Frozen WP-B0 decision:** Draft Preview shape is exactly chart/template/schema versions, color roles/config, seed strategy, and optional seed. Lifecycle fields, IDs, Palette ID, `is_primary`, and status are absent and server-controlled.
- **Frozen WP-B0 decision:** A supplied Preview Case is transactionally created as `draft`, non-primary. Admin Review may validate/publish/set-primary through existing lifecycle routes; Candidate creation never does so.
- **Frozen WP-B0 decision:** Draft Preview roles use Draft-local IDs. Candidate creation rewrites them through the transaction-local Draft-to-formal color-ID map before persisted Preview validation/insertion. Chart-type change clears roles/config/template selection rather than attempting unsafe preservation.
- **Frozen WP-B0 decision:** Pre-persistence `stable_id` is not deterministic because the renderer seed derives from persisted identity. Assistant Draft previews use `fixed` with an explicit signed 32-bit seed; Candidate persistence retains that fixed seed. `stable_id` is permitted only when no pre-create visual equivalence is promised.
- **Frozen WP-B0 decision:** Backend validates registry/schema/domain semantics. Frontend constructs the renderer, performs smoke tests, and presents live preview. Renderer failure blocks UI confirmation/Create affordances for a supplied Preview Case, but no client success flag is accepted as authoritative server evidence.
- **Deferred:** WP-B5 must expose shared registry version material and apply a focused existing-schema drift fix before enabling affected Preview Cases.

## 7. Duplicate, similarity, idempotency, and aggregate convergence

- **Verified repository fact:** Offline normalized-content identity includes provisional colors, Palette fields, chart applicability, and Preview Cases. Its database uniqueness applies only to `palette_ingestion_records.normalized_content_hash`, not globally to Palette rows. Existing offline catalog comparison considers Candidate/Published snapshot records. Private/custom Palette duplication is not globally prohibited.
- **Frozen WP-B0 decision:** Idempotent request equality, exact Palette duplication, perceptual similarity, and offline normalized-content identity are distinct digests/policies. Online Create reruns its then-current duplicate detection; duplicates never auto-merge or Publish.
- **Deferred:** Repository evidence does not establish whether an online exact Palette duplicate includes labels, type, applicability, metadata, accessibility, source fields, or Preview content, nor whether scope is Candidate/Published public catalog only. Including `source_note` or Preview content could let identical colors evade detection. WP-B1 may expose an interface, but WP-B6 must freeze the product policy and race-safe enforcement without imposing global uniqueness on private/custom Palettes.
- **Frozen WP-B0 decision:** Similarity uses the existing offline OKLab ordered one-to-one policy (mean distance ≤ 0.035 and maximum pair distance ≤ 0.06, same color count) as initial versioned evidence. It is warning-only, requires acknowledgment by exact finding ID, and never merges/overwrites/publishes/rejects. WP-B6 must select the online comparison scope without altering private/custom Palette semantics.
- **Frozen WP-B0 decision:** Repository changes between Validate and Create are authoritative: a new exact match blocks; new similarity warnings require revalidation and acknowledgment.
- **Frozen WP-B0 decision:** Online idempotency scope is `(actor_user_id, operation=palette_assistant_candidate_v1, Idempotency-Key)`. Same key and canonical request digest returns the stable receipt; changed digest returns conflict; concurrent in-progress use returns 409 with retry guidance. Keys/receipts contain no offline ingestion identity.
- **Frozen WP-B0 decision:** Both entry paths eventually map to `ConfirmedCandidateAggregate`: persistable Palette fields, ordered colors, chart applicability, validated Preview Cases, authenticated actor, and approved creation provenance.
- **Frozen WP-B0 decision:** `CandidateAggregateService` owns final aggregate normalization/reference validation, Candidate plus Preview writes inside a caller-owned transaction, server lifecycle defaults, and stable created aggregate identifiers. Entry adapters own their distinct stable receipt construction; the offline receipt must remain ingestion-owned.
- **Frozen WP-B0 decision:** Offline-only material stays outside: source packages/proposals/canonical ingestion DTO, source/normalized hashes, checkpoints, ingestion receipts/records, and ambiguous-outcome recovery. Online-only material stays outside: analysis facts/provenance, revision/confirmation/receipt, online idempotency, and acknowledgments.
- **Proposed for WP-B1:** Extract the shared aggregate behind the existing ingestion behavior with characterization tests; do not alter offline semantics or receipts.

## 8. Image security and lifetime policy

- **Frozen WP-B0 decision:** Production accepts PNG/JPEG only. Multipart body limit is 8 MiB including overhead; encoded image limit is 6 MiB; maximum width/height are 4096 each; maximum pixels are 8,000,000. These retain feasibility dimension/pixel limits while allowing realistic screenshots and bounded multipart overhead.
- **Frozen WP-B0 decision:** Read through a hard limit, magic/config-decode before full decode, check positive dimensions and overflow-safe pixel multiplication, then decode once under request cancellation and a 5-second analysis deadline.
- **Frozen WP-B0 decision:** Alpha is straight-alpha composited onto opaque white `#FFFFFF` before extraction and reported as a fact/warning. EXIF and embedded metadata are ignored; no EXIF orientation is applied. Admin must upload already correctly oriented pixels.
- **Frozen WP-B0 decision:** A process-local weighted semaphore bounds analyses to `min(4, GOMAXPROCS)`; no queue is held longer than 250 ms. Exhaustion returns 503. Memory belongs to the request, buffers are released on every path, and no image/thumbnail/temp file is persisted.
- **Frozen WP-B0 decision:** Malformed, truncated, disguised, unsupported, excessive, timed-out, or cancelled input produces safe codes only. Decoder internals, stack traces, paths, database errors, and secrets are never returned.
- **Frozen WP-B0 decision:** No shell, ImageMagick, browser decoder, URL fetch, redirects, archive extraction, filesystem input, or external metadata lookup is allowed.
- **Frozen WP-B0 decision:** Logs contain request ID, actor ID, endpoint, safe error code, verified format/dimensions/byte count, duration, and algorithm/policy versions. They exclude bytes, hashes by default, filename, MIME parameters, EXIF, Draft content, colors, source note, token, receipt, local path, and inferred identity. Security logs retain per existing service policy; WP-B0 creates no new retention store.
- **Frozen WP-B0 decision:** Candidate audit stores authenticated creator and approved online provenance marker only, not analysis evidence. Uploaded data and abandoned Draft state have zero application retention.

## 9. Error and HTTP taxonomy

All messages are category-level and safe; field paths are JSON Pointers where applicable. Internal logs use the code plus a redacted cause class, never raw decoder/database/token data.

| Code | HTTP | Retry? | Endpoints | Safe category / path |
|---|---:|:---:|---|---|
| `AUTHENTICATION_REQUIRED` | 401 | no | all | Sign in required |
| `ADMIN_REQUIRED` | 403 | no | all | Admin access required |
| `MALFORMED_REQUEST` | 400 | no | all | Request syntax/content invalid; optional path |
| `MISSING_IMAGE` | 400 | no | analyze | Image part required; `/image` |
| `MULTIPLE_IMAGES` | 400 | no | analyze | Exactly one image required; `/image` |
| `REQUEST_TOO_LARGE` | 413 | no | analyze | Request/image exceeds limit; `/image` |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | no | all | Required content type/PNG/JPEG only; `/image` when applicable |
| `IMAGE_SIGNATURE_MISMATCH` | 415 | no | analyze | Declared type differs from bytes; `/image` |
| `IMAGE_DECODE_FAILED` | 422 | no | analyze | Image malformed or truncated; `/image` |
| `IMAGE_DIMENSIONS_EXCEEDED` | 422 | no | analyze | Width/height limit exceeded; `/image` |
| `IMAGE_PIXEL_LIMIT_EXCEEDED` | 422 | no | analyze | Pixel limit exceeded; `/image` |
| `ANALYSIS_TIMEOUT` | 504 | yes | analyze | Analysis timed out |
| `ANALYSIS_OVERLOADED` | 503 | yes | analyze | Capacity unavailable |
| `REQUEST_CANCELLED` | 499 | yes | all | Client cancelled; log-only if connection closed |
| `INVALID_DRAFT` | 422 | no | validate/create | Field-addressable validation failed |
| `STALE_REVISION` | 409 | no | validate/create | Reconfirm current revision; `/confirmed_revision` |
| `CONFIRMATION_REQUIRED` | 409 | no | validate/create | Exact Draft confirmation required |
| `VALIDATION_RECEIPT_MISSING` | 400 | no | create | Validation required; `/validation_receipt` |
| `VALIDATION_RECEIPT_INVALID` | 400 | no | create | Receipt malformed/invalid (generic; no cryptographic detail) |
| `VALIDATION_RECEIPT_EXPIRED` | 409 | yes | create | Validate again |
| `VALIDATION_ACTOR_MISMATCH` | 403 | no | create | Receipt belongs to another actor |
| `VALIDATION_POLICY_CHANGED` | 409 | yes | create | Registry/vocabulary/policy changed; validate again |
| `EXACT_DUPLICATE_CANDIDATE` | 409 | no | validate/create | Exact non-archived Palette exists |
| `WARNING_ACKNOWLEDGMENT_REQUIRED` | 422 | no | create | Required warning not acknowledged; `/warning_acknowledgments` |
| `WARNING_ACKNOWLEDGMENT_INVALID` | 422 | no | create | Finding ID is malformed, invented, or duplicated; `/warning_acknowledgments` |
| `IDEMPOTENCY_KEY_MISSING` | 400 | no | create | Header required |
| `IDEMPOTENCY_KEY_INVALID` | 400 | no | create | Canonical UUIDv4 required |
| `IDEMPOTENCY_CONFLICT` | 409 | no | create | Key bound to different request |
| `IDEMPOTENCY_IN_PROGRESS` | 409 | yes | create | Same request still processing |
| `CANDIDATE_TRANSACTION_FAILED` | 503 | yes | create | Candidate could not be safely created |
| `INTERNAL_ANALYSIS_FAILURE` | 500 | yes | analyze | Analysis failed safely |
| `INTERNAL_ERROR` | 500 | yes | validate/create | Request failed safely |

- **Frozen WP-B0 decision:** 499 is an internal/log mapping when the server observes cancellation; a response is not guaranteed after disconnect. Authentication middleware may initially retain its legacy body, but the WP-B4A Analyze handler and WP-B6 Validate/Create handlers adapt it to the stable Problem envelope without changing status policy.

## 10. Threat model

| Threat | Frozen WP-B0 mitigation |
|---|---|
| Unauthenticated/non-Admin request | Auth then Admin middleware before parsing body |
| Oversized body/file, multiple parts | Transport hard limit; exact one-part parser; bounded read |
| MIME/signature mismatch or disguised format | allowlisted MIME plus authoritative config-decode agreement |
| Malformed/truncated image | config/full decode checks and safe generic failure |
| Dimension/pixel bomb | limits and overflow-safe pre-full-decode calculation |
| CPU/memory exhaustion | byte/pixel/time limits, cancellation, bounded semaphore, no queue buildup |
| Alpha manipulation | deterministic white compositing, transparency fact/warning |
| EXIF/orientation/privacy | metadata ignored, no orientation, no logging/persistence |
| Replay/cross-Admin receipt use | actor/digest/revision/version/expiry signature binding plus scoped idempotency |
| Stale revision/Draft tampering | canonical digest recomputation, equality checks, full revalidation |
| Warning bypass | receipt binds exact finding IDs; Create compares exact IDs and recomputed findings |
| Duplicate race | Create recheck plus WP-B6 race-safe enforcement after exact scope/policy is approved |
| Log leakage | structured allowlist, redaction, no body/token/hash/content logging |
| Accidental persistence | no image/Draft repository; formal transaction begins only at Create |
| SSRF/archive/shell attacks | no URLs, archives, shell, ImageMagick, or filesystem paths |
| Registry/vocabulary drift | version binding, cross-language drift tests, stale-receipt rejection |
| Renderer-success spoofing | server never accepts a success flag as validation evidence |

## 11. Executable coverage and deferred work

- **Frozen WP-B0 decision:** `backend/internal/paletteassistant/contract_test.go` freezes endpoint paths, the multipart name, prohibited Draft fields, and separation from offline ingestion fields. `go test ./internal/paletteassistant` is the WP-B0 executable contract check.
- **Proposed for WP-B1:** Extract only the shared Candidate aggregate/domain service and add offline characterization tests. It may define narrow interfaces needed later, but does not implement decoder, suggestions, UI, handlers, receipts, or online persistence.
- **Deferred:** WP-B2 implements safe production image decoding and deterministic extraction, including multipart-independent decoder boundary tests.
- **Deferred:** WP-B3 implements rule-based suggestions.
- **Frozen dependency closure:** WP-B4A implements the production Analyze-only transport bridge before WP-B4. It owns the frozen Admin-only Analyze endpoint, strict bounded multipart parsing, same-request typed WP-B2-to-WP-B3 execution, frozen `AnalyzeResponse`, frontend Analyze client, cancellation, and safe Analyze error mapping. It owns no Draft editing, Preview, Validate/Create, Candidate, persistence, transaction, idempotency, or external service behavior. WP-B4A is frozen but not implemented.
- **Deferred:** After WP-B4A implementation, WP-B4 implements image selection/upload interaction, browser-local object URL lifetime, the in-memory Admin Draft workbench, immutable inspection of the evidence/suggestions/warnings actually present in the bounded `AnalyzeResponse` projection, local validation of unseeded and edited fields, dirty/reset and confirmation assertion. It does not receive omitted internal WP-B3 fields, reconstruct them with a fixture/parallel DTO, rerun WP-B2/WP-B3 in the browser, implement Analyze transport, or call Validate/Create.
- **Deferred:** WP-B5 implements Draft Preview Case editing and live frontend Preview integration. A focused existing-schema drift fix for `scatter_grouped` and `violin_distribution` is a prerequisite within WP-B5 before online creation of those Preview types is enabled; it is not part of WP-B1.
- **Deferred:** Analyze transport is allocated separately to WP-B4A. WP-B6 implements Validate/Create transport, receipt verification, exact finding acknowledgments, online idempotency, duplicate policy/enforcement, final validation, transaction orchestration, and Candidate integration. This contract allocation does not mark WP-B6 partially complete.
- **Deferred:** Frontend workbench/navigation/live preview, recoverable Draft sessions, multiple Preview Cases, image/thumbnails retention, URL ingestion, EXIF orientation, journal-style vocabulary, `tasks`, `user_suitability`, package export, and any automatic Publish/Reject/merge behavior.
- **Deferred:** Database migrations are explicitly outside WP-B0, including online idempotency/exact-identity storage and resolution of existing Preview Case chart-type constraint drift.
