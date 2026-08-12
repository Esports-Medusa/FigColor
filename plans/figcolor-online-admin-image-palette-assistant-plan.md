# FigColor Online Admin Image Palette Assistant Plan

**Document status:** Repository-aligned implementation plan; WP-B0–B3 complete; WP-B4A backend committed at `395fbfa`, frontend completion implemented with independent review pending
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
- return the validated canonical Draft without silently normalizing Palette or Preview Case data;
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

### WP-B4A — Analyze-only transport bridge (frontend completion implemented; independent review pending)

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

#### WP-B5.4 — Reusable authoritative backend Draft validation

WP-B5.4 is the transport- and persistence-independent backend validation work
package. It follows the completed B5.2/B5.3 Draft Preview work and the decisions
in the [WP-B0 contract](./figcolor-online-admin-image-palette-assistant-wp-b0-contract.md).
It does not implement either online endpoint or any Candidate write.

##### Authority, input, and reusable result

The only validation target is
`paletteassistant.AssistantDraft`, owned by
`backend/internal/paletteassistant`. Validate and Create already carry this
complete Draft, including its revision and optional Preview. It excludes
persistence-controlled fields and requires neither fabricated offline
provenance/hashes nor persisted identity, so it can be validated without HTTP,
Gin, SQL, a repository, or a database. An HTTP request DTO, persisted Palette or
Preview Case model, `CandidateAggregateInput`, offline ingestion request/package,
database row, and repository model are not validator authority.

The single exported reusable seam is:

```go
ValidateAssistantDraft(draft AssistantDraft) DraftValidationResult
```

`DraftValidationResult` expresses `ValidatedDraft` and `Issues`. The validator
is deterministic and pure with respect to caller-visible state: it does not
mutate its input, allocate identity, create a Candidate, assign persistence
lifecycle, or depend on HTTP, a database, or a repository. For valid input,
`Issues` is empty and `ValidatedDraft` is present as a fully detached deep copy
whose semantic and serialized fields equal the input. For invalid input,
`Issues` is non-empty and `ValidatedDraft` is not usable for persistence.
Ordinary validation failure is returned, not thrown, and internal parser,
registry, repository, or database details are never exposed. The concrete Go
presence representation may use a pointer or boolean, but these semantics are
fixed. There is no second Create-only validator, mode, or bypass flag.

Frontend-only `classification` remains workbench state. It is not added to the
Go `AssistantDraft` wire contract or persistence, and the backend does not rely
on it. Colors submitted in the Draft are the final retained data colors.

##### Reject-or-accept canonical boundary

WP-B5.4 performs no silent normalization. It does not trim and accept strings,
uppercase HEX, reorder colors, fill order, deduplicate, remove unknown values,
add applicability, choose `best_fit`, change a chart/template, add Preview
defaults, convert seed strategy, or repair Preview references. Non-canonical
input receives a field issue; constructing the detached copy must preserve all
values. In this plan and the WP-B0 Validate contract, a "validated/normalized
Draft" therefore means an already-canonical accepted Draft and its detached
copy, not a transformed input.

WP-B6 remains responsible for strict wire decoding, including duplicate JSON
keys, unknown top-level fields, missing/null required fields, and decode errors.
WP-B5.4 begins only after successful decoding and validates domain semantics.

##### Stable field issues and deterministic aggregation

Issues use `paletteassistant.FieldIssue` with contract-stable `path` and `code`
and a safe displayable `message` that is not a machine compatibility key.
`path` is an RFC 6901 JSON Pointer; the empty string (`""`) is the root pointer,
array indices are numeric segments, and `~` and `/` are escaped as `~0` and
`~1`. Existing persisted-validator dot/bracket paths are not exposed. Examples
include `/colors/0/hex`, `/chart_applicability/1/chart_type`,
`/preview_cases/0/seed_value`, and
`/preview_cases/0/color_roles/groups/0/fill/color_id`.

The validator collects every issue that can be decided safely and independently,
then sorts by ascending `path`, then ascending `code`; identical path/code pairs
retain stable production order. Go map iteration order must never affect output.
If an opaque JSON subtree cannot be parsed, the validator emits one controlled
parse/shape issue for that subtree, does not guess at its children, and continues
with other independently interpretable Draft fields.

##### Core Draft rules

Validation covers `contract_version`, positive `revision`, `name`, Palette
`type`, colors, chart applicability, metadata vocabularies, accessibility,
`source_type`, `source_note`, Preview Cases, and provenance structure. Existing
WP-B0/Plan B authorities and limits are reused rather than copied or changed.

- `name` is required, must contain at least one non-whitespace Unicode code
  point, and contains at most 100 Unicode code points. Counting uses Unicode
  code points (Go semantics equivalent to `utf8.RuneCountInString`), not UTF-8
  bytes, UTF-16 code units, or grapheme clusters. Exactly 100 is valid and 101
  receives `/name` code `NAME_TOO_LONG`. The validator neither trims nor
  truncates and preserves the actual input string; existing sanitizer and
  control-character rules continue unchanged.
- `type` is exactly one of `categorical`, `sequential`, `diverging`, or `mixed`.
- `source_type` is exactly `figure_extracted`. Client input never chooses
  persisted origin, status, or visibility.
- `source_note` remains bounded free text under the existing online sanitizer:
  at most 500 Unicode code points, with the existing trim/control-character
  rejection semantics and no corrective mutation.
- `accessibility` retains the frozen boolean shape; the validator does not infer
  or upgrade any claim. At the typed validator boundary all eight combinations
  of `colorblind_safe`, `print_friendly`, and `dark_background` are valid and
  preserved unchanged. Strict wire-type rejection and Admin confirmation remain
  outside WP-B5.4.

There are 1..64 retained Draft colors. Zero is invalid, 1 and 64 satisfy this
general count boundary, and 65 receives `/colors` code `TOO_MANY_COLORS`.
There is no palette-type-specific minimum in B5.4; all four types use this same
general boundary. The Analyze suggestion maximum remains 12: an Admin may grow
the editable Draft from 12 to 64 manually, but Analyze does not emit more than
12 suggestions. The online value 64 is an independently authorized product
limit, not inheritance from the numerically equal offline `manual_colors` limit,
and changes no offline contract. Preview defaults retain their existing
chart-specific 2/3/5-color behavior, and a Preview may reference only the subset
it needs rather than every Draft color. Validation never truncates or mutates
the array. Each ID is a canonical lowercase hyphenated UUID and is unique. HEX is
canonical uppercase six-digit `#[0-9A-F]{6}` and unique; duplicate HEX is an
issue, never deduplicated. Each `order` equals its array position, producing a
zero-based contiguous sequence. Identity is never substituted by HEX, index,
order, or similarity. Preview membership uses only color UUID. B5.4 creates no
UUID; existing Analyze UUIDv5 and Admin UUIDv4 rules remain unchanged.

Chart applicability contains at least one item, has registered and unique
`chart_type` values, and uses exactly `best_fit`, `recommended`, `compatible`,
or `limited`. Exactly one item is `best_fit`; the validator never selects or
changes it. A supplied Preview's `chart_type` must appear in the Draft's chart
applicability.
Its effective maximum is the number of chart types in the generated registry:
each item must be registered and chart types must be unique, so no separately
maintained numeric maximum is introduced.

Metadata field semantics are explicit:

| Field | Semantics and authority |
|---|---|
| `disciplines` | Closed vocabulary from `contracts/palette-ingestion/v1/controlled-vocabularies.json` |
| `use_cases` | Closed vocabulary from the same authority |
| `avoid_cases` | Closed vocabulary from the same authority |
| `tags` | Closed vocabulary from the same authority |
| `source_note` | Bounded free text under the online sanitizer |
| Palette `name` | Bounded free text; required non-whitespace content and maximum 100 Unicode code points |

Closed values require canonical exact matches: no trim/case conversion is used
to accept them, collections contain no duplicates, and the frozen cardinalities
below apply. Unknown values are issues. No vocabulary is recopied
by hand into this validator; generated authority material is used where needed.
The online Draft cardinalities are `disciplines` 0..8, `use_cases` 0..8,
`avoid_cases` 0..8, and `tags` 0..16. Because these are closed canonical
vocabularies, accepted item lengths are bounded by the vocabulary itself and no
independent item-length rule is added.

##### Draft Preview validation and registry authority

The existing TypeScript chart/template registry is the sole authoritative
Preview registry. Existing generation/tooling must deterministically project it
into a committed Go validation artifact with an explicit version/fingerprint
derived from that canonical projection. Parity/drift tests prove the Go artifact
matches TypeScript, and implementation verification regenerates it and proves a
clean diff. File modification time, current time, randomness, and separately
hand-maintained version strings are forbidden. Go does not import or execute
TypeScript at runtime, generation never occurs per HTTP request, and the
handwritten persisted Preview registry is not promoted to authority. If the
existing generation seam cannot safely produce this artifact, implementation
stops rather than creating a handwritten mirror. Controlled-vocabulary material
needed by this validator participates in the same deterministic generation and
parity approach without changing its existing JSON authority.

Preview cardinality remains 0..1, with no fake or persisted identity. When
present, `chart_type`, `template_id`, `template_version`, `schema_version`,
`color_roles`, `preview_config`, Draft color membership, `seed_strategy`, and
`seed_value` are validated against the generated registry/schema artifact.
Malformed roles/config, unknown members, template/version mismatch, and unknown
color references fail closed. References use Draft color UUID only, never HEX,
index, order, or another fallback.

For `stable_id`, `seed_value` is omitted. For `fixed`, it is present and within
the inclusive signed 32-bit range `-2147483648..2147483647`; zero is valid. The
validator does not default `stable_id`, delete a supplied stable seed, truncate
64-bit input, reinterpret signedness, generate persisted identity, or derive a
seed from HEX/order/index/time. These rules preserve the B5.2/B5.3 contract; the
WP-B0 restriction on pre-create visual equivalence remains in force.

The validator uses the generated registry fingerprint to establish compatibility
with the current Draft Preview. B6 may expose or record that version and must
bind it into its receipt/digest strategy, but HTTP encoding and persisted
registry migration/version acceptance are outside WP-B5.4.

##### Provenance and persistence boundaries

For `provenance`, WP-B5.4 validates contract structure, required fields,
allowed source/state values, bounded strings/collections, JSON Pointer path and
suggested-value shape, and reports deterministic issues. It does not claim that
provenance came from the current Analyze call, that a producer ran, that a
suggestion matches the image, that an analysis ID relates to an image hash, or
that persistence audit evidence is authentic. A pure validator has no Analyze
session/database authority, and client provenance is never trusted as Candidate
publication or audit authority. Analysis provenance remains Draft/receipt
evidence and does not enter Candidate persistence; B6 may include it in the
canonical digest/receipt.

The frozen structural limits are 0..128 provenance entries; 1..100 Unicode code
points for required `producer` and `algorithm_version`; 1..16 unique reason
codes, each 1..100 Unicode code points; and an absent/empty or 1..100 Unicode
code-point `ambiguity_group`. Required text contains non-whitespace and all
these text fields reject control characters without normalization. The required
`suggested_value` may be any valid JSON value up to 32 KiB encoded bytes.

WP-B5.4 neither accepts nor trusts Palette ID, Preview Case ID, slug,
`owner_user_id`, visibility, origin, status, `is_primary`, timestamps, or
publication state. B6 and database constraints own these values. Database
uniqueness, foreign keys, repository state, and actor authorization are not
validated here.

##### Required B6 parity and explicit exclusions

Future WP-B6 flow is fixed as:

```text
Validate: strict decode
  → confirmation/revision entry checks
  → ValidateAssistantDraft
  → repository-dependent findings
  → receipt/digest response

Create: strict decode
  → confirmation/revision/receipt/idempotency checks
  → ValidateAssistantDraft again
  → repository-dependent findings again where required
  → Draft-to-formal-ID mapping
  → Candidate transaction
```

Both paths call the same exported function. Create reruns it and never trusts a
client success flag or old Validate result; clients cannot submit validator
results. WP-B5.4 does not implement HTTP, Gin binding, Problem mapping,
confirmation binding, receipt/digest encoding, idempotency, repository queries,
duplicate/similarity search, transactions, Candidate persistence,
Draft-to-formal-ID mapping, or publication.

##### Future implementation scope

Future implementation must modify `backend/internal/paletteassistant/**`. It may
modify existing registry generation tooling, generated registry artifacts, and
cross-language parity tests/fixtures only when generator evidence requires it.
It must not by default modify backend HTTP routes/handlers, repositories/write
services, `backend/migrations/**`, application/runtime behavior under `src`, the
public catalog, Admin Review persistence, offline ingestion DTOs/contracts,
`package.json`, or `package-lock.json`. If generation requires exposing a `src`
registry surface, a later implementation prompt must separately authorize the
smallest non-behavioral exposure and require frontend registry regression tests.

##### Acceptance and completion boundary

WP-B5.4 is complete only when tests prove the pure `AssistantDraft` contract,
absence of HTTP/database/repository dependencies, input immutability, detached
valid output, no silent normalization, deterministic RFC 6901 issues, safe
aggregation of independent failures, all core/color/applicability/metadata and
Preview cardinality/registry/schema/reference/seed rules, deterministic generated
registry fingerprint, and TypeScript/Go parity/drift protection. Tests require no
PostgreSQL. Both future Validate and Create are designated to use the one
validator, while no API, database, or persistence behavior is implemented.
Migration runtime acceptance remains separate verification debt.

The future boundary test matrix includes:

- name: empty, whitespace-only, one code point, exactly 100 code points, 101
  code points, multibyte Unicode counted by code point, and input immutability;
- colors: counts 0, 1, 12, 13, 64, and 65; an Analyze-seeded 12-color Draft;
  an Admin-expanded 64-color Draft; a Preview referencing only a color subset;
  and proof the input is neither truncated nor mutated.

Completion does not mean the Validate endpoint, Create endpoint, Candidate
persistence, or migration runtime acceptance is complete. Required order is:

```text
B5.4 decision freeze
→ B5.4 implementation
→ independent B5.4 review
→ B6 scope-freeze
→ B6 implementation
```

### WP-B6a — Frozen online submission protocol

WP-B6a freezes the remaining transport-independent protocol. Exact identity
version 1 hashes the RFC 8785 projection `{version:1,ordered_hex:[...]}` with
SHA-256 lowercase hexadecimal; order and count participate and all other Draft
fields do not. Comparison and database uniqueness cover only ownerless public
Palettes in `candidate` or `published` status. The future partial unique index
stores fingerprint/version in the Candidate transaction, blocks concurrent
duplicates, and releases mechanically when rows leave that lifecycle scope.

Similarity policy version 1 is the existing Node authority unchanged: OKLab
D65 Euclidean ΔEOK, same color count, index-to-index order-preserving pairs,
inclusive mean `0.035` and maximum `0.06` thresholds, and six-decimal evidence.
It compares the same lifecycle scope after exact exclusion and is an
acknowledgeable warning, never a normalized score or blocking publication
claim. WP-B6b must add deterministic language-neutral policy/parity vectors and
a parity-constrained Go implementation before WP-B6 runtime; request handling
must not execute Node or parse JavaScript.

Finding envelope version 1 orders findings by deterministic ID and permits
`exact_duplicate`/`blocking` and `similar_palette`/`warning`. Every item has
`id`, `kind`, `severity`, JSON Pointer `path`, `code`, safe `message`, integer
`policy_version`, safe comparison Palette ID, and non-null structured `evidence`
bounded to 32 KiB. Exact evidence contains fingerprint version, comparison ID
and status. Similarity evidence contains policy version, `oklab_d65`,
`canonical_index_order_preserving_one_to_one`, color count, finite mean/maximum
distances and thresholds, comparison ID and status; no owner, SQL, image data,
reasoning or normalized score is present. Finding IDs are SHA-256 JCS hashes of
the item without `id`; finding-set digest hashes the ID-sorted versioned
envelope. Existing `warning_acknowledgments` must exactly equal the current
warning ID set, ignoring order but rejecting missing, extra, duplicate, unknown
and blocking IDs.

Draft digest version 1 hashes JCS `{version:1,draft:<complete validated Draft>}`.
Create-intent version 1 binds actor, Draft digest, confirmation version 1 and
`confirmed_revision`, sorted warning IDs, finding-set digest, duplicate and
similarity policy versions, and registry fingerprint. It excludes raw receipt,
idempotency key, timestamps, database identities and transport formatting.
`confirmed_revision` is the only confirmation and must equal Draft revision.

The stateless validation receipt is JCS payload plus HMAC-SHA-256 in two
unpadded base64url segments. Version 1 binds Draft, actor, finding set, registry,
policy versions, and UTC Unix-second issue/expiry times for 15 minutes. Runtime
uses only `PALETTE_ASSISTANT_VALIDATION_RECEIPT_SECRET` (minimum 32 bytes), never
JWT fallback, and verifies in constant time. CandidateReceipt remains unchanged.
An internal submission record owns actor/key, intent/Draft/finding digests,
registry/policies, state, Candidate identity, stable response and timestamps.

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
| Local/domain validation | Transport checks only | Yes | Reusable backend Draft domain validation; no transport | Server entry checks, repository findings, and final revalidation through B5.4 |
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
| Exact Palette duplicate fields/scope/enforcement | Decided by WP-B6a | Ordered HEX fingerprint; ownerless public candidate/published scope; future partial unique index |
| Go similarity parity | Blocked with exact missing authority seam | WP-B6b must generate policy/parity vectors from the existing Node implementation before Go runtime work |
| Similarity warnings use exact finding-ID acknowledgment | Frozen by WP-B0 | One warning cannot authorize another finding sharing its code |
| Production image limits are 8 MiB multipart, 6 MiB encoded, 4096×4096, 8 MP, 5 seconds | Frozen by WP-B0 | Bounds memory/CPU while accommodating realistic screenshots |
| Analyze-only transport is a WP-B4A production dependency | Frozen by dependency closure | Breaks the WP-B4/WP-B6 dependency cycle without fixtures, parallel DTOs, or fake APIs |
| Backend Draft validation uses one pure `ValidateAssistantDraft(AssistantDraft)` seam | Frozen by WP-B5.4 decision freeze | Gives future Validate/Create identical reject-or-accept domain semantics without HTTP, repository, or persistence coupling |
| TypeScript Preview registry generates deterministic committed Go validation material | Frozen by WP-B5.4 decision freeze | Prevents a handwritten backend authority fork and makes registry drift testable |

## 17. Immediate Next Step

WP-B0 through WP-B3 are complete. WP-B4A's backend implementation is committed
at `395fbfa`; its production frontend Analyze client and drift tests are implemented
as an uncommitted completion pending independent review. WP-B4 remains blocked
until that review and a separate completion commit. WP-B5.4's implementation
contract, including its online name and color-count bounds, is frozen above.
WP-B6 remains unimplemented and retains Validate/Create transport and
persistence ownership.
