# FigColor WP-B3 — Deterministic Rule-Based Palette Suggestions

**Status:** Complete

**Scope:** Production-owned deterministic palette proposals over verified WP-B2 evidence only

## 1. Preflight and authority

WP-B3 began on `main` at `8870221aa31a70d95a186d48990dd1cbc3d90c27`, equal to `main`; `origin/main` remained `99d70b9bd669dca9d58dad5f9b89e76e7142c6a1`. The worktree/index were clean, no merge/rebase/cherry-pick was active, and `8870221..HEAD` was empty. No applicable `AGENTS.md` existed.

Authority order was the current Plan and frozen WP-B0 contract, then WP-B1/WP-B2 records, production DTOs/tests, Palette/Candidate/Preview rules, and lastly feasibility/pilot history. Before WP-B3, production stopped at WP-B2 typed evidence; no rule engine existed. The prepared real pilot still has no eligible corpus and contributes no production dependency or accuracy claim.

## 2. Frozen contract matrix

| Concern | WP-B3 contract |
|---|---|
| Input | Complete production `imageanalysis.Result`; no image decode or JSON copy schema |
| Output | Complete effective policy snapshot, source identity, selected and omitted colors, facts, warnings, unresolved fields, completeness/reviewability, type proposal, stable ID/digest |
| Eligible colors | WP-B2 retained `data` suggestions only |
| Ordering | Preserve authoritative WP-B2 count-descending/HEX-ascending order |
| Limits | Minimum 2, maximum 12; immutable v1 policy |
| Metadata | Only non-authoritative `categorical` when 2+ retained colors exist |
| Forbidden inference | chart/family/series/group/role, name, discipline, use/avoid/tags, accessibility, source/publication identity, Preview semantics |
| Persistence | None; no Candidate/Preview/database writes |

## 3. Package, trust boundary, and validation

Production code is `backend/internal/paletteassistant/palettesuggestion`; dependency direction is `palettesuggestion → imageanalysis → paletteassistant`. It imports only context, hashing/JSON/number helpers, the frozen DTO package, and WP-B2 contracts. It has no Gin/HTTP, filesystem/URL, SQL/repository, Candidate aggregate, frontend, feasibility, AI, OCR, network, or external process dependency.

`Engine.Suggest(context.Context, imageanalysis.Result)` rejects nil context, zero/invalid engines, cancellation, unsupported analyzer/config versions, and malformed/tampered evidence. Validation covers authoritative format and image dimensions/counts; lowercase SHA-256 form; default frozen analyzer configuration; canonical uppercase HEX; positive support; exact fraction; producer/version/reason/ID consistency; unique IDs/HEX across retained, structural, and excluded sets; retained evidence correspondence and ordering; classifications; and WP-B2 output digest. WP-B2 exposes only the minimal read-only `VerifyResult` integrity helper; hashing remains private and extraction algorithm, limits, thresholds, DTOs, and semantics are unchanged.

`VerifyResult` detects accidental or adversarial mutation relative to the embedded digest; it is not source authentication, a signature, or proof that a client supplied genuine analyzer output. WP-B6 must invoke WP-B3 only with the typed in-memory result produced by WP-B2 in the same trusted request flow. It must never accept a client-supplied `imageanalysis.Result` merely because its digest verifies.

Invalid evidence returns stable sentinel errors and no partial result. Valid evidence with zero or one usable color is a reviewable domain outcome, not an internal error. The pure synchronous engine checks cancellation before validation/work and contains no goroutine or panic-prone plugin boundary; invariant-only JSON failure remains an internal panic because all members are closed finite production types.

## 4. Versioned deterministic policy

Policy `deterministic-palette-suggestion.v1` freezes:

1. Select WP-B2 retained data colors unchanged and in their authoritative order.
2. Select at most 12; record every remaining data color as omitted with `ABOVE_MAXIMUM_PALETTE_COLORS`.
3. Never promote WP-B2 structural colors; record each with `WP_B2_STRUCTURAL_COLOR_NOT_PROMOTED`.
4. Never promote excluded/background colors; preserve their WP-B2 reasons and add `WP_B2_EXCLUDED_COLOR_NOT_PROMOTED`.
5. With zero selected colors return `no_usable_colors`; with one return `needs_review`; both stay reviewable and fabricate nothing.
6. With 2–12 selected colors return `complete` plus a non-authoritative `categorical` proposal. This describes an unordered discrete proposal, not true chart/palette semantics.
7. Emit explicit unresolved entries for name, palette type, chart applicability, discipline, use/avoid cases, tags, accessibility, and Preview Cases. Remove `/palette_type` only when the deterministic categorical proposal is actually emitted.

Every result contains the complete effective `Policy` snapshot (`version`, `minimum_colors`, and `maximum_colors`), and every selected HEX/support value is copied exactly from WP-B2. Stable color IDs bind policy version, selection rule, source evidence digest, source suggestion ID, HEX, pixel count, and exact fraction representation. The suggestion-set ID binds the complete policy snapshot, source evidence digest, and complete semantic result. `output_sha256` binds the complete ordered output—including the policy snapshot and suggestion-set ID—with only its own field blanked. Policy replacement or threshold drift is rejected by the closed production constructor; tests also prove the snapshot changes the digest and that version/rule metadata cannot split from the per-color ID preimage.

## 5. Facts, warnings, and semantics

Facts contain only authoritative source pixel count and retained-data-color count. Suggestions carry producer, policy version, rule ID, reason codes, source support, and `authoritative:false`. Warnings explicitly state heuristic review, insufficient/no colors, or truncation. Unresolved decisions are separate from warnings and proposals. No confidence probability is emitted.

WP-B3 does not infer chart type, series/group count, role mapping, paper identity, DOI, journal, author, year, discipline, palette name, source, chart applicability, Preview configuration, accessibility, or scientific meaning. It creates no `AssistantDraft`; WP-B4 owns browser authoring and WP-B6 owns Analyze response assembly, strict transport decoding, authoritative validation, receipts, idempotency, and Candidate mapping.

## 6. Verification and isolation

Programmatic PNGs exercise production WP-B2 before WP-B3 without filesystem fixtures. Tests cover multi-color selection; 50 identical full results and JSON encodings; stable count/HEX ties; exact HEX traceability; complete policy snapshot and digest participation; version/rule/source/support-bound per-color IDs; complete facts/reasons; zero/one-color `/palette_type` unresolved behavior and proposal-time removal; minimum, maximum and over-maximum behavior; explicit structural/background/excluded handling; tampered digest/version/HEX/support/fraction/duplicates/order; and independently exercised structural validation for invalid background, retained/evidence mismatch, invalid source suggestion identity, cross-classification duplicate HEX, malformed image SHA-256, and reason/classification mismatch. Nil context, zero/changed-policy engine, and cancellation are also covered. No network, database, filesystem fixture, external process, or goroutine scheduling is involved.

WP-B1 Candidate aggregate, ingestion service/repository, transactions, and Preview persistence have zero WP-B3 diff. WP-B2's only diff is the backward-compatible read-only digest verifier plus its regression test; extraction core, policy, limits, and output remain unchanged.

Deferred unchanged: WP-B4 Draft UI/workbench; WP-B5 Preview editing/render integration and registry drift prerequisite; WP-B6 HTTP/multipart, strict JSON, validation receipts, duplicate/idempotency policy and Candidate persistence; WP-B7 AI/CV. No online closed loop, migration, image storage, Candidate creation, Preview persistence, Publish/Reject, or offline ingestion change is implemented.
