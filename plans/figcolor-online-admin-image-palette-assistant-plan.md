# FigColor Online Admin Image Palette Assistant Plan

**Document status:** Repository-aligned implementation plan; WP-B0–B3 complete; WP-B4A contract frozen
**Plan version:** v1.3
**Date:** 2026-08-09
**Working branch:** `main`
**Primary product path:** `Image → Assistant Suggestions → Editable AssistantDraft → Admin Confirmation → Online Validation → Create Candidate → Existing Admin Review → Publish or Reject`

**WP-B0 contract:** [FigColor Online Admin Image Palette Assistant — WP-B0 Contract and Threat Model](figcolor-online-admin-image-palette-assistant-wp-b0-contract.md)

**WP-B1 implementation:** [Shared Candidate Aggregate Service Implementation Record](figcolor-online-admin-image-palette-assistant-wp-b1-shared-candidate-service.md)

**WP-B2 implementation:** [Safe Deterministic Image Analysis Implementation Record](figcolor-online-admin-image-palette-assistant-wp-b2-safe-deterministic-image-analysis.md)

**WP-B3 implementation:** [Deterministic Rule-Based Palette Suggestions Implementation Record](figcolor-online-admin-image-palette-assistant-wp-b3-deterministic-rule-based-palette-suggestions.md)

**WP-B4A contract:** [Analyze-Only Transport Bridge Contract](figcolor-online-admin-image-palette-assistant-wp-b4a-analyze-transport-bridge.md)

> **v1.1 revision note:** This revision incorporates the completed repository review and WP-B0/WP-B1 closure. It separates Palette fields from Preview Case fields, removes unsupported `tasks` and `user_suitability` persistence, distinguishes backend Preview validation from frontend rendering, and defines separate online/offline entry semantics converging only at the shared Candidate aggregate service extracted in WP-B1.

---

## 1. Purpose and Product Boundary

Plan B is an **Admin-only online semi-automated Candidate authoring workbench** for FigColor. An Admin uploads one scientific figure or screenshot, receives non-authoritative system suggestions, edits an in-memory `AssistantDraft`, confirms an exact Draft revision, and explicitly creates a Candidate after authoritative online validation. The Candidate then enters the existing Admin Review and Publish/Reject lifecycle.

The approved main path is:

```text
Image
→ Assistant Suggestions
→ Editable AssistantDraft
→ Admin Confirmation
→ Online Validation
→ Create Candidate
→ Existing Admin Review
→ Publish or Reject
```

Plan B is not:

- a graphical wrapper around the offline CLI ingestion pipeline;
- a package-export workflow;
- a new offline ingestion `source_type`;
- an automatic publishing system;
- a mechanism for presenting inferred metadata as verified facts.

Package export may later support debugging, backup, or batch operations, but it is not part of the normal Admin workflow.

## 2. Verified Repository Facts

This section records current repository behavior. Proposed Plan B behavior is identified separately in later sections.

### 2.1 Persisted Palette aggregate

The current Go `Palette` model and database schema persist these relevant fields, using the repository's exact JSON names:

- `id`, `slug`, `name`;
- `colors`, `color_count`, `type`;
- legacy/derived `chart_types` and authoritative authored `chart_applicability`;
- `journal_style`, `discipline`, `use_case`, `avoid_case`, `tags`;
- `accessibility`;
- `source_type`, `source_image`, `source_note`;
- `visibility`, `origin`, `owner_user_id`, `source_palette_id`;
- `status`, `version`, `created_by` and lifecycle timestamps.

Plan B must not persist the uploaded image in `source_image`. The field exists, but MVP image content, file paths, filenames, thumbnails, and EXIF remain non-persistent.

The current database accepts Palette `source_type` values `manual`, `figure_extracted`, and `curated`. This Palette metadata is distinct from the frozen offline source-package contract, whose only supported `source_type` remains `manual_colors`. WP-B0 must decide which existing Palette source value accurately represents the online Candidate; it must not add a new value implicitly.

### 2.2 Unsupported formal fields

`tasks` and `user_suitability` do not exist as formal fields in the current:

- Go Palette or request models;
- palettes database schema;
- ingestion source-package, proposal, or canonical request contracts;
- controlled vocabularies;
- Admin Review form/API;
- public Palette API.

They are therefore not MVP persistence fields, Candidate aggregate requirements, or mandatory Admin confirmations. They may appear only as non-persistent assistant reasoning/evidence. They must not be smuggled into `tags`, `use_case`, `source_note`, `preview_config`, or any unrelated field.

Making either field persisted or searchable requires a separate approved product/data-model decision covering vocabulary, schema and migration, backend model/API, Admin Review, public presentation/filtering, compatibility, and tests.

### 2.3 Preview Case ownership

The repository stores the following on `palette_preview_cases`, not on Palette:

- `chart_type`;
- `template_id` and `template_version`;
- `schema_version`;
- `color_roles`;
- `preview_config`;
- `seed_strategy` and optional `seed_value`;
- Preview Case lifecycle fields such as `is_primary` and `status`.

The current backend supports `stable_id` and `fixed` seed strategies. A fixed seed requires `seed_value`.

### 2.4 Preview validation and rendering

Current Go code performs backend domain/registry validation for:

- registered Phase 1 chart types;
- template ownership, known template ID, template version, and schema version;
- JSON object shape for `color_roles` and `preview_config`;
- chart-specific role and config contracts;
- palette/theme/visual color references and palette color ID existence;
- seed strategy and fixed-seed requirements;
- lifecycle compatibility where the applicable service invokes full candidate validation.

The Go backend does not execute Vue components or prove that Vue/SVG/canvas output rendered. Actual renderer construction and the live scientific Preview exist in the frontend Preview System.

### 2.5 Frozen offline ingestion boundary

The existing offline entry remains:

```http
POST /api/admin/palette-candidates
```

It accepts the frozen canonical ingestion request and owns offline-specific validation and recovery semantics, including proposal/source identity, canonical content hashes, request fingerprinting, durable idempotency, checkpoints, receipts, ambiguous-outcome recovery, and ingestion audit records. Plan B must not change this HTTP DTO, fabricate its provenance, or weaken its behavior.

### 2.6 Candidate transaction and shared service

The existing ingestion service already prepares a validated Candidate aggregate and transactionally creates a curated, public, ownerless Candidate plus optional draft Preview Cases and receipt linkage. The transaction rolls back related writes on failure.

WP-B1 extracted the Palette and Preview write orchestration into `palette.CandidateAggregateService`. The offline ingestion adapter remains coupled only to its own claims, hashes, receipts, binding, commit/rollback, and recovery responsibilities, and invokes the shared service through caller-owned `palette.CandidateAggregateTx` inside the existing transaction.

## 3. Authoritative State Semantics

| State | Persisted Palette? | Meaning |
|---|---:|---|
| Uploaded image | No | Untrusted request-scoped analysis input |
| Assistant Suggestions | No | Non-authoritative machine output |
| Editable `AssistantDraft` | No for MVP | Admin working state |
| Confirmed Draft revision | No | Admin confirmation bound to one exact revision |
| Validated Draft revision | No | Validation result bound to one exact revision |
| Candidate | Yes | Formal Palette aggregate awaiting Admin Review |
| Published or rejected/archived | Yes | Existing Admin Review outcome |

No formal Palette or Preview Case record may exist before explicit, successful `Create Candidate`.

If draft recovery is later approved, it must use a separate short-lived assistant-session model. It must not represent a Palette, Candidate, or formal Preview Case.

## 4. Formal AssistantDraft Model

The analysis result, editable `AssistantDraft`, and persisted Candidate are separate concepts.

### 4.1 Analysis result

The analysis response contains the bounded wire projection frozen by WP-B0 and
WP-B4A: decoder facts, wire-visible suggestions/provenance, and warnings. Richer
server-internal WP-B2/WP-B3 fields intentionally omitted by that projection are
not a browser audit record. The response contains no formal Palette/Candidate
identifiers and performs no database write.

The linked WP-B4A contract is the single normative owner for Analyze warning
catalog/messages/IDs and every seeded `AssistantDraft`, `DraftColor`, and
`SuggestionProvenance` construction rule; this Plan does not duplicate them.

Historical conceptual illustration; the linked WP-B0 contract and Go DTOs supersede this shape:

```json
{
  "assistant_version": "image-palette-assistant/v1",
  "analysis_id": "request-scoped-opaque-id",
  "image_facts": {
    "sha256": "...",
    "format": "png",
    "encoded_bytes": 123456,
    "width": 1600,
    "height": 900,
    "pixel_count": 1440000
  },
  "color_suggestions": [],
  "preview_case_suggestions": [],
  "metadata_suggestions": {},
  "warnings": []
}
```

WP-B0 has frozen exact output fields, limits, number semantics, forbidden content, and strict inbound rejection requirements in the linked contract.

### 4.2 Palette-level Draft fields

The Palette portion of the Draft may model only currently persistable equivalents:

- `name`;
- stable ordered `colors` and derived `color_count`;
- `type`;
- `journal_style` if included in the approved MVP vocabulary boundary;
- `discipline`;
- `use_case`;
- `avoid_case`;
- `tags`;
- `chart_applicability`;
- `accessibility`;
- `source_type` and sanitized `source_note` if WP-B0 approves their exact semantics.

System-controlled Candidate ownership, origin, visibility, status, slug, actor, and timestamps are not client-authoritative Draft fields.

### 4.3 Stable Draft colors

Each Draft color has a stable Draft color ID, normalized HEX, derived RGB, and order. The following invariants apply:

- reordering colors does not change stable IDs;
- editing a HEX preserves the ID unless the Admin explicitly replaces the color;
- deleting a color invalidates every Draft Preview Case reference to that ID;
- invalid or missing references are blocking validation errors;
- the server re-normalizes HEX, derives RGB, and verifies contiguous order.

Draft IDs are scoped to one `AssistantDraft`; they are not authoritative persisted Palette color IDs. Candidate creation validates every Draft reference, creates server-authoritative formal color IDs under repository conventions, builds a transaction-local Draft-ID-to-formal-ID mapping, and rewrites Preview role references before persistence. Any unresolved mapping rolls back the aggregate transaction.

Assistant classification such as `data` or `structural`, pixel proportion, and reason codes are suggestion evidence, not persisted Palette truth unless an existing formal field explicitly owns the value.

Every emitted suggestion identifies its producer and algorithm version and carries one or more stable reason codes. No suggestion is represented by no entry; suggesting an empty value is an explicit entry with a clear reason code. Ambiguous alternatives share an ambiguity-group identity, while ambiguity with no safe alternative uses an explicit ambiguity reason. Provider-specific provenance is deferred to WP-B7.

### 4.4 Draft Preview Case suggestions

Preview data is optional and separate from the Palette-level Draft:

```text
Palette Draft
└── Draft Preview Case
    ├── registered chart_type
    ├── template_id and template_version
    ├── schema_version
    ├── color_roles
    ├── preview_config
    ├── seed_strategy
    └── optional seed_value
```

`color_roles` must reference stable Draft color IDs rather than bare HEX values. A Draft Preview Case remains non-persistent until Candidate creation succeeds; successful creation stores it as a draft, non-primary Preview Case unless WP-B0 documents a stricter repository-supported policy.

### 4.5 Suggestion state

Suggested fields should track business value separately from provenance and review state:

```text
value
suggestion source and reason/evidence
state: unconfirmed | accepted | modified | cleared
validation state and bound revision
```

System-generated content remains non-authoritative even when confidence or evidence exists. Prefer precisely defined values such as `pixel_proportion`, `support_score`, or `ranking_score` over an undefined correctness confidence.

Active color objects use `unconfirmed`, `accepted`, or `modified`; deleted colors are absent rather than retained as `cleared`. Path-addressed non-color provenance may use `cleared` to represent explicit removal. Server warning findings are response-owned and are not part of `AssistantDraft` or its digest.

The Go DTOs and golden tests freeze server-output serialization. Inbound requests additionally require rejection of missing/null required fields, unknown fields, and duplicate JSON keys. WP-B4A owns strict Analyze multipart parsing; WP-B6 owns strict Validate/Create JSON decoding because ordinary Go unmarshaling does not enforce the complete inbound contract.

### 4.6 Revision and confirmation

`AssistantDraft` has a monotonically increasing `revision`:

1. Initial analysis creates the first revision.
2. Any automated update or Admin edit increments it.
3. Confirmation is an explicit business/UI assertion applying to exactly one revision; it does not prove human visual inspection.
4. Any subsequent edit invalidates confirmation.
5. Validation reports bind to one revision.
6. `Create Candidate` repeats validation and verifies that the current revision is the explicitly confirmed revision.

WP-B0 must freeze whether the server signs or otherwise binds the validated revision. A client-provided revision alone is not authoritative security evidence.

## 5. Analysis Layers

### 5.1 Safe deterministic color evidence

The deterministic layer may suggest:

- normalized candidate HEX values and stable ranking;
- approximate pixel proportions;
- likely data colors;
- likely background, text, axis, and grid structural colors;
- anti-alias/noise consolidation;
- warnings and deterministic algorithm version.

All results remain suggestions requiring Admin review.

### 5.2 Chart and Preview Case suggestions

MVP may offer an Admin-selected or limited rule-suggested registered chart type. It may propose series/groups and compatible `color_roles`, but must return no mapping rather than coerce an unsupported or ambiguous image.

Reliable automatic chart-structure recognition, CV/VLM series/group inference, and advanced role inference belong to MVP-B2 and WP-B7 unless separately approved.

### 5.3 Controlled Palette metadata suggestions

Rule-based suggestions may select only from authoritative approved values for:

- `type`;
- `discipline`;
- `use_case`;
- `avoid_case`;
- `tags`;
- `chart_applicability` suitability;
- other current Palette fields only if WP-B0 verifies their vocabulary and semantics.

When evidence is insufficient, the field remains empty for Admin selection. The assistant must not invent arbitrary values or infer paper identity/scientific subject from unsupported visual speculation.

`tasks` and `user_suitability` may appear only in non-persistent reasoning/evidence and are not part of Candidate creation.

## 6. Online and Offline Convergence Architecture

The two entries do not share HTTP DTOs or provenance semantics:

```text
Offline canonical ingestion request
        │
        ├── validate offline provenance, hashes,
        │   checkpoints and idempotency
        │
        └── map to ConfirmedCandidateAggregate
                                      │
                                      ▼
                         CandidateAggregateService
                                      ▲
                                      │
Online confirmed AssistantDraft
        │
        ├── validate Admin confirmation revision
        ├── validate online idempotency
        └── map to ConfirmedCandidateAggregate
```

The online path must not create fake offline proposals, normalized/source hashes, filesystem checkpoints, canonical ingestion requests, submission receipts, or ingestion records.

The offline endpoint remains unchanged. WP-B0 froze these separate online endpoint contracts:

```http
POST /api/admin/palette-assistant/analyze
POST /api/admin/palette-assistant/validate
POST /api/admin/palette-assistant/candidates
```

### 6.1 Established shared Candidate aggregate boundary

WP-B1 established this non-HTTP, non-ingestion boundary:

```text
ConfirmedCandidateAggregate
├── Palette fields
├── stable ordered colors
├── chart applicability
├── optional draft Preview Cases
└── authenticated actor user ID
```

WP-B1 established `palette.CandidateAggregateService`, `palette.CandidateAggregateInput`, and caller-owned `palette.CandidateAggregateTx` in the existing Palette domain package.

There is no independent shared `creation_provenance` field. Approved persistable provenance is expressed only through canonical Palette fields such as `SourceType`, `SourceImage`, and `SourceNote`; entry-specific provenance remains with its adapter and never enters the shared input.

`CandidateAggregateService` owns:

- Palette domain validation;
- HEX/RGB/order normalization;
- controlled-vocabulary validation;
- applicability validation;
- Preview Case registry/schema validation;
- color-reference validation;
- Candidate Palette and related Preview writes through a caller-owned transaction writer;
- stable created Palette and Preview Case identifiers;
- transactional failure propagation to the caller.

The caller owns transaction begin, commit, rollback, and any entry-specific persistence in the same transaction. Each entry adapter owns its receipt construction; the shared service does not produce offline or online receipts.

Entry-specific validation remains outside it:

| Offline entry | Online assistant entry |
|---|---|
| Canonical ingestion request | Confirmed `AssistantDraft` |
| Proposal/source/hash checks | Confirmation revision binding |
| Checkpoint and recovery binding | Online idempotency binding |
| Offline ingestion provenance | Assistant/Admin provenance |

## 7. Frozen Online API Responsibilities

Endpoint names and transport responsibilities were frozen by WP-B0. The
Analyze-only transport is now allocated to WP-B4A as a production dependency
of WP-B4; Validate and Create remain allocated to WP-B6.

### 7.1 Analyze

```http
POST /api/admin/palette-assistant/analyze
Content-Type: multipart/form-data
```

- obtain Admin identity through existing Auth + AdminRequired middleware;
- accept and safely decode exactly one image;
- return non-authoritative suggestions and safe decoder facts;
- create no Palette, Preview Case, Candidate, or ingestion record.

### 7.2 Validate

```http
POST /api/admin/palette-assistant/validate
Content-Type: application/json
```

- validate the complete current Draft revision;
- normalize Palette and Preview Case data;
- return field-addressable errors, warnings, exact duplicates, and similarity findings;
- bind results to the validated revision;
- issue stable finding identities for warnings requiring acknowledgment;
- perform no formal data write.

### 7.3 Create Candidate

```http
POST /api/admin/palette-assistant/candidates
Content-Type: application/json
Idempotency-Key: <UUID>
```

- obtain the actor only from authenticated server context;
- require explicit idempotency;
- verify the confirmed current revision;
- revalidate the complete Draft instead of trusting prior validation or client claims;
- map to `ConfirmedCandidateAggregate`;
- create the Candidate and related records transactionally;
- return a stable Candidate receipt and Admin Review location;
- never Publish.

## 8. Validation and Preview Responsibilities

### 8.1 Backend authoritative validation

The backend validates, according to current repository capability and WP-B0/WP-B1 sharing decisions:

- Palette fields, normalized colors, derived RGB, IDs, and order;
- controlled vocabulary membership;
- chart applicability and suitability;
- registered Preview chart type;
- template ID/version/schema;
- `color_roles` structure and referenced Draft color IDs;
- `preview_config` contracts;
- seed strategy/value constraints;
- domain and registry compatibility;
- exact duplicate policy and perceptual-similarity findings;
- confirmation revision and online idempotency at the online entry.

Backend schema/domain validation must not be described as actual Vue, SVG, or canvas rendering.

### 8.2 Frontend renderer smoke test

The existing Vue Preview System:

- constructs renderer input from the current Draft Preview Case;
- invokes the registered renderer;
- detects client-side rendering failure;
- displays the live scientific Preview to the Admin.

Frontend rendering success is not a substitute for backend validation. Candidate creation must not trust a client-supplied `rendered successfully` flag as authoritative security evidence. WP-B0 must define the exact pre-Candidate UX for renderer failure, while the backend remains authoritative only for registry/schema/domain validation.

### 8.3 Blocking conditions

Candidate creation must block on invalid HEX, duplicate IDs/colors where forbidden, non-contiguous order, unsupported vocabulary values, invalid applicability, unknown Preview templates, invalid role/config shape, missing referenced color IDs, invalid seed configuration, stale confirmation, or a backend domain/registry error.

Exact duplicates may block according to existing policy. Perceptual similarity remains evidence/warning unless a separately frozen issue policy says otherwise; it must never trigger automatic merging.

## 9. Image Security, Privacy, and Lifetime

WP-B0 must confirm or amend the following proposed MVP baseline:

| Control | Proposed policy |
|---|---|
| Formats | PNG and JPEG only |
| Encoded bytes | Maximum 2 MiB |
| Width/height | Maximum 4096 each |
| Pixel count | Maximum 8,000,000 |
| Format authority | Magic bytes/decoder format, with declared-type policy frozen in WP-B0 |
| Decode order | Header/config and dimensions before full decode |
| Alpha | Fixed documented backdrop |
| SVG, archives, URLs | Reject |
| Decoder | In-process; no shell/ImageMagick/browser decoder on backend |
| Lifetime | Request-scoped and non-persistent |
| Timeout/concurrency | Explicit bounded limits |

Additional requirements:

- limit total multipart body and file size;
- reject missing or multiple image fields;
- fail closed on malformed, truncated, oversized, and decompression-bomb inputs;
- honor cancellation;
- do not log image bytes, thumbnails, filenames, local paths, EXIF, or raw Draft payloads by default;
- do not persist the original image or its metadata in MVP;
- treat SHA-256 as a processing/correlation fact, not validation evidence.

External provider submission and required VLM use remain deferred pending separate privacy, retention, regional processing, reliability, cost, and fallback approval.

## 10. Admin Workbench UX

Preferred entry:

```text
Admin → New Palette
├── Create from Image
└── Enter Manually
```

The workbench must:

- show the browser-local source preview alongside suggested/edited colors;
- separate accepted data colors from excluded/structural suggestions;
- allow add, delete, edit, restore, and keyboard/drag reorder;
- preserve stable color IDs across reorder and HEX edit;
- allow complete manual override;
- edit Palette fields separately from optional Draft Preview Cases;
- use only registered chart types and authoritative controlled choices;
- show suggestion source, state, reasons, warnings, and validation errors;
- render the current Draft, not hidden assistant values;
- invalidate confirmation after every edit;
- warn rather than silently discard incompatible role edits after chart changes;
- require explicit confirmation of the current revision before Create Candidate.

Safe UI terms include **System suggestion**, **Suggested Draft**, **Likely structural color**, **Unverified suggestion**, **Review required**, and **Create Candidate**. Avoid “recognized true palette”, “official paper colors”, “AI-confirmed”, “publication-ready”, or “automatically approved”.

## 11. MVP and Deferred Scope

### 11.1 MVP-B1

- Admin-only single-image workbench;
- safe deterministic PNG/JPEG analysis;
- deterministic colors and structural-color suggestions;
- Admin-selected or limited rule-suggested registered chart type;
- controlled Palette metadata suggestions;
- stable Draft colors and revision confirmation;
- editable Draft Preview Case;
- frontend live Preview and renderer smoke test;
- backend schema/domain/registry validation;
- exact duplicate and similarity findings;
- idempotent transactional Candidate creation;
- redirect to existing Admin Review;
- no image persistence and no automatic Publish.

The deterministic path must work without CV/VLM or an external provider.

### 11.2 MVP-B2 / later assisted analysis

- separately approved CV/VLM chart-structure suggestions;
- series/group inference;
- richer color-role suggestions;
- improved evidence and ambiguity handling.

### 11.3 Deferred

- formal persisted/searchable `tasks`;
- formal persisted/searchable `user_suitability`;
- VLM as a required dependency;
- external provider image submission;
- automatic chart recognition presented as reliable fact;
- OCR;
- paper/DOI/site acquisition, crawling, scraping, or remote URLs;
- multi-image/batch workflow;
- original-image/thumbnail/EXIF persistence;
- PDF, SVG, GIF, WebP, TIFF, or HEIC;
- automatic duplicate merging;
- unsupported chart types or vocabulary expansion;
- automatic Preview Case publication;
- automatic Candidate creation or Publish;
- offline contract changes;
- package export as the primary path;
- long-lived Draft persistence.

## 12. Work Packages

### WP-B0 — Boundary, contracts, and threat model

Design and contract work only. Freeze:

- `AssistantDraft` and stable color identity;
- suggestion provenance/state and revision confirmation;
- proposed analyze/validate/create DTOs and errors;
- image lifetime, privacy, and resource limits;
- frontend/backend Preview responsibility;
- `ConfirmedCandidateAggregate` boundary;
- online/offline entry-specific semantics;
- exact MVP/deferred scope.

WP-B0 implements no decoder, endpoint, UI, migration, or Candidate behavior.

### WP-B1 — Shared Candidate domain service (complete)

Implemented `palette.CandidateAggregateService` with canonical `CandidateAggregateInput` and caller-owned `CandidateAggregateTx`. Offline ingestion now delegates Candidate Palette and Preview creation to this single shared orchestration while retaining the same transaction for ingestion receipt binding, commit/rollback, hashes, checkpoints, recovery, Admin Review, and Publish/Reject behavior. See the linked WP-B1 record.

### WP-B2 — Safe deterministic image analysis (complete)

Implemented the transport-independent `paletteassistant/imageanalysis` production package: complete bounded-byte PNG/JPEG input, encoded-length enforcement, MIME/signature/config agreement, pre-decode dimension and pixel checks, white alpha compositing, a real returning deadline boundary, process-shared capacity controls, deterministic color extraction, structural/background evidence, stable safe errors, and configuration-bound output evidence. The package does not depend on or promote the feasibility package and performs no HTTP parsing, persistence, or Candidate orchestration. See the linked WP-B2 record.

### WP-B3 — Rule-based suggestions (complete)

Implemented `paletteassistant/palettesuggestion`, a transport-independent deterministic policy over verified WP-B2 evidence. It selects only retained data colors, explicitly records truncation and all structural/background/excluded colors, reports insufficient/no-usable outcomes without fabricating colors, and emits only a conservative non-authoritative `categorical` type proposal when at least two colors survive. Chart/Preview and unsupported metadata remain explicitly unresolved because color evidence cannot establish those semantics. See the linked WP-B3 record.

### WP-B4A — Analyze-only transport bridge (contract frozen; not implemented)

Implement the already-frozen Admin-only Analyze endpoint and frontend Analyze
client as the production input dependency for WP-B4. In one authenticated,
request-scoped server flow, parse the bounded image transport, invoke the
existing WP-B2 analyzer, pass that exact typed in-memory result to the existing
WP-B3 suggestion engine, and assemble only the normative bounded projection into
the frozen `AnalyzeResponse`. Wire-visible semantics are deterministic for
identical input/version/policy/config except that each request receives a fresh
random `analysis_id`; full cross-request JSON byte equality is not required. WP-B4A
performs no Draft editing, Preview integration, validation receipt, Candidate
creation, persistence, transaction, idempotency, Publish, or Reject. See the
linked WP-B4A contract.

### WP-B4 — Admin Draft workbench

After WP-B4A is implemented, implement Admin image selection/upload interaction and consume its real Analyze client; editable Draft, stable colors, suggestion states, inspection and immutable audit copies of only wire-visible evidence/warnings, resolution of unseeded or locally invalid Draft fields, authoritative local validation, revision confirmation, dirty/reset behavior, browser-local object URL lifetime, accessibility, and abandonment protection. WP-B4 must not depend on intentionally omitted WP-B3 fields, infer a complete policy from warnings, rerun WP-B2/WP-B3 in the browser, or use fixtures/parallel DTOs to reconstruct an internal audit record. WP-B4 owns no Analyze handler or server execution of WP-B2/WP-B3. It creates no Candidate or Preview Case, persists no Draft, performs no scientific Preview integration, and calls neither Validate nor Create.

### WP-B5 — Preview Case and live Preview integration

Implement Draft Preview Case editing, stable color references, frontend renderer smoke tests, and backend registry/schema/domain validation.

### WP-B6 — Online validation and Candidate creation

Analyze transport has been extracted in the contract and allocated to the separate WP-B4A dependency. WP-B6 continues to implement Validate and Create transport, duplicate/similarity findings, authoritative revalidation, online idempotency, atomic Candidate/related-record creation, rollback, stable receipt, and Admin Review redirect. Neither WP-B4A nor any part of WP-B6 is implemented by this allocation change.

### Work-package ownership matrix

| Concern | WP-B4A | WP-B4 | WP-B5 | WP-B6 |
|---|---|---|---|---|
| Image selection UI | No | Yes | No | No |
| Browser object URL lifecycle | No | Yes | No | No |
| Analyze HTTP transport | Yes | Consume only | No | Already extracted |
| WP-B2/WP-B3 execution | Yes | No | No | No |
| Evidence/suggestion display | No | Yes | Optional read-only reuse only if separately frozen | No |
| `AssistantDraft` editing | No | Yes | Consume Draft only | No |
| Local validation | Transport checks only | Yes | Preview-specific only | Server final validation |
| Scientific Preview | No | No | Yes | No |
| Candidate persistence | No | No | No | Yes |
| Database transaction | No | No | No | Yes |

### WP-B7 — Optional CV/VLM analysis

Proceed only after separate approval of privacy, provider, retention, regional processing, reliability, cost, and deterministic fallback policies.

### WP-B8 — Acceptance and operations

Cover malicious images, decoder boundaries, invalid Draft references, frontend renderer regressions, double submission, stale confirmation, transaction failure, non-persistence, and complete Candidate-to-Admin-Review behavior.

## 13. Repository-Aligned Acceptance Criteria

1. No formal Palette or Preview Case record exists before explicit successful Create Candidate.
2. `tasks` and `user_suitability` are not persisted or mapped into unrelated fields.
3. `color_roles` and `preview_config` exist only through optional Draft Preview Cases before creation and formal Preview Cases after successful Candidate creation.
4. Stable Draft color IDs survive reorder and HEX edit; deletion invalidates references and blocks creation until repaired.
5. Backend validation does not claim to execute the Vue renderer.
6. Frontend renderer success does not replace backend validation and is not trusted as authoritative security evidence.
7. Offline `POST /api/admin/palette-candidates` remains contract-compatible.
8. Online flow creates no fake offline proposal, hash, checkpoint, canonical request, receipt, or ingestion record.
9. The entries converge only at the established shared internal Candidate aggregate service extracted in WP-B1.
10. Candidate creation is transactional and idempotent.
11. Candidate creation never publishes.
12. Original image content, filename, thumbnail, EXIF, and metadata remain non-persistent in MVP.
13. The deterministic path works without CV/VLM.
14. Existing Admin Review, Publish, and Reject behavior remains unchanged.
15. Abandoned, failed, or stale Drafts create no formal records.

## 14. Verification Strategy

Later implementation work must cover:

- exact DTO serialization, forbidden fields, revision binding, and idempotency;
- missing/multiple images, byte/dimension/pixel limits, signature mismatches, SVG, malformed/truncated files, cancellation, timeout, and concurrency;
- deterministic extraction and structural suggestions;
- stable color identity and invalid Preview references;
- backend Preview template/role/config/seed validation;
- frontend renderer construction, failure display, and live Preview;
- analysis/validation database non-write assertions;
- transactional rollback and double-submit behavior;
- Candidate invisibility from public APIs before Publish;
- regression tests for offline ingestion and Admin Review.

Each implementation WP must run its affected Go/frontend suites, the palette-ingestion suite when shared behavior is touched, frontend build/typecheck as applicable, and `git diff --check`.

## 15. Decisions Frozen by WP-B0

WP-B0 froze the following in the linked contract and production-owned compile-only DTO package:

- exact `AssistantDraft`, suggestion, confirmation, validation, and receipt DTOs;
- how the server binds a validation/confirmation to an exact Draft revision;
- exact endpoint paths, HTTP codes, request limits, timeouts, and concurrency;
- whether online Candidate creation uses the existing Palette `source_type` value `figure_extracted` or another already supported value;
- whether `journal_style` participates in MVP and which definition is authoritative;
- authoritative vocabulary ownership and drift prevention across Go, TypeScript, Node contracts, and database constraints;
- separation of idempotent equality, offline normalized identity, exact Palette duplication, and similarity; exact finding-ID acknowledgment semantics;
- the precise Candidate aggregate extraction seam and transaction interfaces;
- whether optional Draft Preview Cases are created by MVP and their initial lifecycle fields;
- renderer-failure UX before Candidate creation;
- safe audit fields and retention without storing images or raw Drafts;
- bounded resource and overload behavior.

Feature-flag wiring, rollout metrics, and operational performance targets remain proposed for later work. Exact online Palette-duplicate identity/scope and enforcement remain a WP-B6 policy decision because repository behavior does not justify global Palette uniqueness. The verified database/registry drift for `scatter_grouped` and `violin_distribution` is a focused WP-B5 prerequisite before those online Preview Cases can be created; it is not folded into WP-B1.

## 16. Decision Log

| Decision | Status | Rationale |
|---|---|---|
| Online workbench is Plan B's primary path | Approved | Removes package/CLI round-trip from daily Admin work |
| First formal database state is Candidate | Approved | Prevents abandoned Drafts from polluting Palette data |
| Existing Admin Review remains the final gate | Approved | Preserves publication authority |
| Offline pipeline remains frozen and supported | Approved | Retains auditable operator ingestion |
| Entries share an internal aggregate service, not transport/provenance | Implemented in WP-B1 | `palette.CandidateAggregateService` owns canonical Palette/Preview write orchestration; adapters retain transaction lifecycle and receipts |
| Palette and Preview Case Draft fields remain separate | Approved | Matches current persisted models |
| Stable Draft color IDs back Preview references | Approved | Preserves references across edit/reorder |
| `tasks` and `user_suitability` are non-persistent/deferred | Approved | No current formal field or vocabulary exists |
| Images are request-scoped and non-persistent | Approved for MVP | Minimizes privacy/copyright/retention risk |
| Deterministic single-image MVP works without VLM | Approved | Provides bounded, reliable fallback |
| External CV/VLM provider | Deferred decision | Requires separate privacy/reliability approval |
| Online DTO owner is `backend/internal/paletteassistant` | Frozen by WP-B0 | Separates online transport from persistence, public DTOs, feasibility code, and offline ingestion |
| Analyze/validate/create paths use `/api/admin/palette-assistant/*` | Frozen by WP-B0 | Avoids collision with offline `/api/admin/palette-candidates` |
| Validation binding uses a 15-minute stateless signed receipt | Frozen by WP-B0 | Binds actor, digest, revision, policy and registry/vocabulary versions without Draft persistence |
| Draft color identity uses UUIDv5 for analysis and UUIDv4 for Admin additions | Frozen by WP-B0 | Preserves Draft-local references; Candidate transaction remaps to server-authoritative formal IDs |
| Online Palette source type is `figure_extracted`; image is not `source_image` | Frozen by WP-B0 | Uses an existing Palette value without retaining uploaded content |
| MVP accepts zero or one optional Draft Preview Case | Frozen by WP-B0 | Keeps Palette/Preview ownership separate and avoids requiring unsupported renderer paths |
| Exact Palette duplicate fields/scope/enforcement | Deferred to WP-B6 | Offline normalized identity is ingestion-specific; global uniqueness could break private/custom palettes |
| Similarity warnings use exact finding-ID acknowledgment | Frozen by WP-B0 | One warning cannot authorize another finding sharing its code |
| Production image limits are 8 MiB multipart, 6 MiB encoded, 4096×4096, 8 MP, 5 seconds | Frozen by WP-B0 | Bounds memory/CPU while accommodating realistic screenshots |
| Analyze-only transport is a WP-B4A production dependency | Frozen by dependency closure | Breaks the WP-B4/WP-B6 dependency cycle without fixtures, parallel DTOs, or fake APIs |

## 17. Immediate Next Step

WP-B0 through WP-B3 are complete. The next dependency implementation step is
**WP-B4A: Analyze-only transport bridge**. WP-B4 is unblocked only after WP-B4A
provides its real production Analyze client. WP-B5 and WP-B6 remain unimplemented;
WP-B6 retains Validate/Create and persistence ownership.
