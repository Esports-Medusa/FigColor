# FigColor WP-B2 — Safe Deterministic Image Analysis Implementation Record

**Status:** Complete

**Scope:** Production-safe deterministic image decoding, pixel normalization, color extraction, structural-color evidence, and stable analysis failures only

**Architecture:** [WP-B0 contract](figcolor-online-admin-image-palette-assistant-wp-b0-contract.md)

## 1. Preflight and authority

WP-B2 began on `main` at `34efdfd260d81b0571945f252693a14a732458e4`; `main` and `HEAD` matched that accepted WP-B0/WP-B1 checkpoint, while `origin/main` remained `99d70b9bd669dca9d58dad5f9b89e76e7142c6a1`. The worktree and index were clean, no merge/rebase/cherry-pick operation was active, and no applicable `AGENTS.md` existed.

Implementation followed, in order, the frozen WP-B0 contract, the main Plan's WP-B2 requirements, the established WP-B1 aggregate boundary, current domain invariants, and feasibility material as non-authoritative evidence. The complete Plan, WP-B0 contract, WP-B1 record, `paletteassistant` DTO/tests, Palette color and Candidate/Preview code, feasibility extractor/tests, synthetic benchmark report, and prepared real-pilot report were inspected.

## 2. State before implementation

The only image-color implementation was `internal/feasibility/imagecolor`. It intentionally supported filesystem-based experiment entry, used a 2 MiB experimental byte limit, and carried pilot output and thresholds. Its corrected synthetic benchmark demonstrated deterministic behavior and useful native PNG extraction, but also documented anti-alias false positives, neutral and near-background false negatives, weak JPEG results, no semantic ordering, no real-corpus evidence, and no production authorization.

No production decoder, cancellation/deadline/capacity boundary, or WP-B2 evidence model existed. The accepted WP-B1 Candidate service had no image dependency.

## 3. Production boundary and data flow

Production code is in `backend/internal/paletteassistant/imageanalysis`. Its public boundary accepts only:

```text
trusted context.Context
+ caller-provided complete in-memory []byte
+ exact declared MIME
        ↓
encoded length check (maximum 6 MiB) and defensive copy
        ↓
signature and MIME allowlist agreement
        ↓
image.DecodeConfig and authoritative format agreement
        ↓
positive/width/height/overflow-safe pixel validation
        ↓
single full standard-library decode
        ↓
canonical opaque pixels and deterministic extraction
        ↓
ImageFacts + suggestions + machine-readable Evidence
```

The analyzer has no HTTP/Gin, multipart parser, filesystem, URL, shell, external process, database, Candidate service, offline ingestion, frontend, feasibility, OCR, AI, or network dependency. It deliberately does not accept an arbitrary `io.Reader`, because a reader may block forever and cannot be safely cancelled by Go. The future WP-B6 adapter owns the 8 MiB multipart limit, exact-one-part parsing, and a transport `limit+1` read into finite memory. WP-B2 independently and synchronously rejects any supplied byte slice larger than 6 MiB before copying or decoding; it does not claim to enforce transport size.

## 4. Decoder threat model and exact limits

`DefaultConfig` executes the frozen production limits:

| Control | Value | Enforcement |
|---|---:|---|
| Multipart request | 8 MiB | Frozen adapter requirement; deferred to WP-B6 |
| Encoded image | 6 MiB | Analyzer checks complete `[]byte` length before copy/config/full decode; WP-B6 must use `limit+1` while constructing it |
| Width | 4096 | Authoritative config result before full decode |
| Height | 4096 | Authoritative config result before full decode |
| Decoded pixels | 8,000,000 | Division-based overflow-safe check before full decode |
| Analysis deadline | 5 seconds | Analyzer returns at deadline while a finite-byte worker retains its global slot until termination |
| Capacity wait | 250 ms | Analyzer-owned timer; exhaustion is stable overload |
| Concurrent analyses | `min(4, GOMAXPROCS)` | Process-local buffered capacity gate |

Only exact `image/png` and `image/jpeg` declarations are accepted. Magic bytes must identify the same allowlisted format, `image.DecodeConfig` must report that same format, and the full decode must remain consistent. GIF, SVG, WebP, TIFF, HEIC, PDF, archives, paths, URLs, multiple images, and arbitrary MIME parameters are outside the boundary and rejected.

Config decode and dimension checks occur before the expensive full decode. Empty, oversized, malformed, truncated, disguised, dimension-excessive, cancelled, timed-out, overloaded, and internal failures return only stable category codes. Decoder text, stack traces, bytes, paths, and metadata are not exposed. A recovery boundary converts panics to `INTERNAL_ANALYSIS_FAILURE`.

## 5. Pixel normalization

Go's standard PNG/JPEG decoders provide one in-process pixel path. `color.NRGBAModel` obtains straight 8-bit channels. Every channel is composited with integer round-to-nearest arithmetic onto the frozen opaque white `#FFFFFF`, then deterministically floor-quantized to the configured channel step. Default quantization is 8.

Any alpha below 255 sets `has_transparency` and emits `TRANSPARENCY_COMPOSITED_TO_WHITE`. Fully transparent pixels become white and cannot silently become a source data color. JPEG is canonical opaque input. EXIF, ICC, filenames, and other metadata are never parsed; no EXIF orientation is applied. Tests show injected JPEG EXIF payload does not alter normalized color evidence.

The analyzer retains only the bounded encoded buffer, decoded image, and bounded pixel-count maps for the request lifetime. It writes no file and persists nothing.

## 6. Deterministic extraction and configuration

Algorithm version `deterministic-image-analysis.v1` freezes this minimal evidence policy:

1. Count normalized quantized RGB pixels.
2. Estimate background from the four-corner mode.
3. Break equal corner counts by ascending canonical uppercase `#RRGGBB`.
4. Exclude colors below eight pixels with `BELOW_MINIMUM_PIXEL_SUPPORT`.
5. Exclude colors within per-channel maximum distance 8 of background with `NEAR_BACKGROUND_COLOR`.
6. Mark remaining colors with channel spread at most 12 as structural suggestions using `LIKELY_NEUTRAL_STRUCTURAL_COLOR`.
7. Mark other colors as data suggestions using `DETERMINISTIC_PIXEL_SUPPORT`.
8. Order each list by pixel count descending, then canonical HEX ascending.

Exact HEX is derived only from normalized sampled pixels and uses the repository's canonical uppercase six-digit form. Suggestion IDs are stable hashes of algorithm version, classification, and HEX. Output evidence has a deterministic SHA-256 over the result with the digest field blanked, binding image facts, effective configuration, ordered evidence, and warnings.

The thresholds are minimal explainable defaults informed by the feasibility-v2 synthetic experiment, not claims of semantic truth or quality targets. They are explicit in `Config`, returned in evidence, boundary-tested, and bound to the algorithm output. Production `New()` accepts no caller configuration and always uses this immutable v1 policy. Non-default configuration construction is package-private test machinery. Any production threshold/policy change requires a new implementation version and code change; a mismatched configured version is rejected. Suggestion identity hashes the effective version passed by the analyzer, classification, and HEX rather than a separate compile-time version path.

## 7. Structural-color semantics and evidence

Structural classification means only “likely neutral structural color under this versioned global heuristic.” It does not prove background, axis, grid, text, border, chart role, or scientific meaning. Near-background and low-support colors remain explicit excluded evidence rather than disappearing. `NO_USABLE_DATA_COLOR` is emitted when the heuristic finds no data suggestion.

`Result` contains frozen `paletteassistant.ImageFacts`, ordered `ColorSuggestion` data/structural lists, and `Evidence` containing:

- algorithm version and complete effective configuration;
- authoritative decoded format, encoded bytes, width, height, pixel count, alpha fact, white backdrop, and input SHA-256 through `ImageFacts`;
- background estimate with pixel count, fraction, classification, and reason;
- every retained color and every excluded/downweighted color with canonical HEX, pixel count, fraction, classification, and reason codes;
- safe warning codes;
- deterministic output SHA-256.

It contains no bytes/base64, path, URL, filename, bibliographic identity, semantic claim, receipt, Candidate/Preview/database identity, or persistence data.

## 8. Error taxonomy and resource control

Stable domain codes cover empty input, encoded-size excess, unsupported declared MIME, unsupported detected format, signature/config disagreement, decode failure, invalid dimensions, width excess, height excess, pixel excess, cancellation, deadline, unavailable capacity, invalid configuration, and contained internal failure. `AnalysisError.Error` exposes only its code.

`Analyze` validates the receiver, shared limiter, complete effective configuration, exact implementation version, and non-nil context before inspecting input or acquiring capacity. Nil/zero-value analyzers, nil contexts, invalid limits, and version drift return `ANALYSIS_CONFIGURATION_INVALID` without panic, worker creation, or slot acquisition.

The derived deadline covers capacity acquisition and the caller-visible execution boundary. Decode/extraction runs in one worker after the complete finite bytes are defensively copied. Standard image decode itself cannot be interrupted inside a decoder call, so at deadline `Analyze` returns `ANALYSIS_TIMEOUT` while that worker retains its process-global capacity slot until it terminates; its buffered completion channel cannot block. Consequently timed-out requests cannot create more lingering decode workers than the global capacity, and further requests receive overload rather than spawning unbounded goroutines. Context is also checked before work, after config validation, and periodically during pixel traversal. Capacity acquisition cannot queue beyond 250 ms.

Every production `New()` instance shares one package-level `min(4, GOMAXPROCS)` gate initialized for the process. There is no exported constructor for an independent limiter or alternate policy. Tests construct isolated analyzers only through unexported package test helpers.

## 9. Verification

Focused tests use only small programmatically generated fixtures and crafted headers. They cover PNG/JPEG success and repeated byte-for-byte JSON stability; exact encoded-byte boundaries; MIME/signature/config agreement; GIF/SVG/random rejection; malformed/truncated PNG/JPEG; pre-full-decode width/height/pixel rejection; full-decode/config bounds agreement; overflow-safe arithmetic; alpha including full transparency and white composition; JPEG metadata independence; structural/background separation; deterministic ties; no-usable-color evidence; cancellation before and during extraction; caller-visible deadline return around a blocked test worker; retained capacity until timed-out work terminates; cross-instance process capacity; panic containment; immutable production version/policy; version-bound suggestion IDs; and default limits.

Normal CI needs no network, external process, database, filesystem fixture, or real scientific image. The package race test is also part of WP-B2 verification. PostgreSQL is unrelated to WP-B2; existing integration tests retain their environment-dependent behavior.

Final verification results:

- focused `imageanalysis` tests: passed;
- frozen `paletteassistant` contract tests: passed;
- `go test -race ./internal/paletteassistant/imageanalysis`: passed;
- Palette and middleware regression: passed;
- `go test ./...`: passed;
- `npm run test:palette-ingest`: the sandbox run reached 93/94 because loopback bind was denied with `EPERM`; the permitted rerun passed 94/94;
- explicit PostgreSQL ingestion tests: skipped because `FIGCOLOR_INGESTION_TEST_DSN` was not configured;
- Go/Markdown whitespace and fenced-block checks: passed.

## 10. Feasibility reuse and isolation

WP-B2 reused only reviewed pure ideas: standard-library config-before-full-decode, straight-alpha composition, bounded dimensions, channel quantization, four-corner background estimate, low-support/background/neutral separation, and deterministic count/HEX ordering. Production values were raised to WP-B0 limits and placed in a new versioned configuration.

It did not import, rename, or modify the feasibility package; copy filesystem extraction, manifests, pilot identity/hashes, evaluation metrics, Delta E matching, runtime harnesses, or real-pilot templates; or claim synthetic metrics as production acceptance. The feasibility and prepared real-pilot records remain historical evidence.

## 11. Isolation and deferred scope

WP-B1's `CandidateAggregateService`, input, transaction writer, offline adapter, and tests are unchanged. The analyzer never calls Candidate creation and performs no persistence.

WP-B2 implements no WP-B3 chart/metadata/semantic rules; WP-B4 UI/Draft workbench; WP-B5 Preview integration or migration; WP-B6 endpoint, multipart parsing, strict request decoding, receipt, duplicate/idempotency policy, transaction, or adapter; or WP-B7 AI/CV provider. It also adds no OCR, external service, image retention, batch processing, or new format.

Known limitations remain global corner background estimation, quantization edge shades, neutral data false negatives, anti-alias/JPEG false positives, no connected components or perceptual clustering, no semantic order, no chart/role inference, and no completed real scientific-figure gold pilot. Every output remains a reviewable suggestion.
