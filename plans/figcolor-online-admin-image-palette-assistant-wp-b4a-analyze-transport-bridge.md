# FigColor WP-B4A — Analyze-Only Transport Bridge Contract

**Status:** Contract frozen; backend committed at `395fbfa`; frontend completion implemented, independent review pending

**Scope:** Production Analyze transport and client boundary only

**Architecture:** [Main Plan](figcolor-online-admin-image-palette-assistant-plan.md) and [WP-B0 contract](figcolor-online-admin-image-palette-assistant-wp-b0-contract.md)

## 1. Dependency closure

The WP-B4 workbench requires a real production source for WP-B2 evidence and
WP-B3 suggestions, but those packages are server-side Go packages and the
previous allocation placed every online transport in WP-B6. A production WP-B4
could therefore be built only by inventing a fixture, parallel DTO, fake API,
browser reimplementation, or by prematurely implementing part of WP-B6.

This contract resolves that dependency conflict by freezing the order:

```text
WP-B1 → WP-B2 → WP-B3 → WP-B4A → WP-B4 → WP-B5 → WP-B6
```

WP-B4A is a production dependency, not a fixture or temporary adapter. It
extracts only Analyze transport from WP-B6. No production or test code is part
of this contract-closure change.

The completed WP-B2 and WP-B3 implementation records accurately describe the
allocation that existed when those packages were delivered. Their references
to a future WP-B6 Analyze adapter are historical; this later contract closure
supersedes only that future-work allocation and changes none of their production
behavior, DTOs, policies, identities, limits, or verification results.

## 2. Frozen data flow

```text
Admin-authenticated bounded image request
        ↓
strict Analyze multipart transport parsing
        ↓
existing WP-B2 imageanalysis.Analyzer
        ↓ exact typed in-memory imageanalysis.Result in the same request
existing WP-B3 palettesuggestion.Engine
        ↓
frozen paletteassistant.AnalyzeResponse
        ↓
WP-B4 frontend Analyze client
```

WP-B1 remains an upstream architectural prerequisite for eventual Candidate
creation, but its Candidate aggregate service is not invoked by Analyze. The
bridge must not route image analysis through Candidate or ingestion code.

The server must pass the exact typed `imageanalysis.Result` produced by WP-B2
in that request to WP-B3. It must never accept a client-supplied analysis result
and trust it because its embedded digest verifies. `imageanalysis.VerifyResult`
detects result mutation; it is neither source authentication nor a signature.

## 3. Existing protocol authority

WP-B4A reuses without duplication:

- `POST /api/admin/palette-assistant/analyze`;
- `multipart/form-data` with exactly one non-empty `image` part and no other
  fields or parts;
- `paletteassistant.AnalyzeResponse` and the frozen `Problem` envelope;
- exact `image/png` and `image/jpeg` declarations with signature/config match;
- 8 MiB multipart, 6 MiB encoded image, 4096 width, 4096 height, 8,000,000
  pixels, five-second analysis deadline, 250 ms capacity wait, and
  `min(4, GOMAXPROCS)` process capacity;
- existing Analyze-applicable HTTP statuses and safe problem codes in WP-B0.

The existing Go contract and golden tests remain the sole online DTO owner.
WP-B4A must not introduce another endpoint or a parallel server DTO. The exact
frontend generated/manual type-sharing mechanism is an implementation decision;
it must be drift-tested against the Go wire contract and must not redefine its
business semantics.

Already frozen: path, multipart name and shape, response DTO, image types,
limits, deadlines/capacity behavior, applicable status/error mapping, and
request-scoped `analysis_id`. Still to be chosen during implementation: handler
and frontend-client file locations and the contract-drift mechanism. These
choices may not change the frozen wire behavior.

### 3.1 Normative internal-to-wire projection

The Go `paletteassistant.AnalyzeResponse` remains the sole wire contract owner.
The richer server-internal `imageanalysis.Result` and
`palettesuggestion.Result` are not wire DTOs:

```text
server-internal WP-B3 Result ≠ frozen AnalyzeResponse wire projection
```

The following projection table is normative for WP-B4A implementation. It
covers every top-level field in both internal results and the nested semantics
that affect the workbench. A destination containing a subfield names the actual
Go DTO field reached by the deterministic assembly.

| WP-B2/WP-B3 source | `AnalyzeResponse` destination | Wire status | Normative projection |
|---|---|---|---|
| `imageanalysis.Result.Image` | `Image` | transmitted unchanged | Copy the complete `paletteassistant.ImageFacts` value. |
| `imageanalysis.Result.ColorSuggestions` | `ColorSuggestions` | transmitted unchanged | Preserve order and every `ColorSuggestion` field; this is the wire-visible retained data-color evidence. |
| `imageanalysis.Result.StructuralColors` | `StructuralColors` | transmitted unchanged | Preserve order and every `ColorSuggestion` field; these remain non-authoritative structural evidence. |
| `imageanalysis.Result.Evidence.AlgorithmVersion` | `AlgorithmVersion` | represented by a narrower wire field | Copy the analyzer version string; the containing `Evidence` object is not transmitted. |
| `imageanalysis.Result.Evidence.Warnings` | `Warnings` | deterministically transformed | Convert through the normative warning catalog and finding-identity rule in §3.2. |
| `imageanalysis.Result.Evidence.Configuration` | none | intentionally omitted from Analyze wire response | The complete effective analyzer configuration remains internal; the wire exposes only `AlgorithmVersion` and result semantics already represented above. |
| `imageanalysis.Result.Evidence.Background` | none | intentionally omitted from Analyze wire response | No dedicated background-evidence field exists in `AnalyzeResponse`; structural suggestions remain available only through `StructuralColors`. |
| `imageanalysis.Result.Evidence.Colors` | none as an evidence collection | intentionally omitted from Analyze wire response | Retained data/structural colors are already exposed through the two narrower suggestion arrays; the complete classified evidence collection is not transmitted. |
| `imageanalysis.Result.Evidence.Excluded` | none | intentionally omitted from Analyze wire response | Excluded/background/downweighted color evidence has no wire field. |
| `imageanalysis.Result.Evidence.OutputSHA256` | none | intentionally omitted from Analyze wire response | The integrity digest is used only inside the same-request typed flow and is not client authority. |
| `palettesuggestion.Result.Policy.Version` | `Draft.Provenance[].AlgorithmVersion` and transformed `Warnings[].Policy` where applicable | represented by narrower wire fields | Preserve the policy version only on emitted WP-B3-derived Draft provenance and warnings; do not serialize the complete policy snapshot. |
| `palettesuggestion.Result.Policy.MinimumColors`, `MaximumColors` | none | intentionally omitted from Analyze wire response | The complete policy snapshot remains server-internal. |
| `palettesuggestion.Result.SourceAnalyzerVersion` | none as a separate field | represented by a narrower wire field | It is verified against and already represented by `AlgorithmVersion`; do not duplicate it. |
| `palettesuggestion.Result.SourceEvidenceSHA256` | none | intentionally omitted from Analyze wire response | It remains an internal integrity/input identity and is not browser authority. |
| `palettesuggestion.Result.SuggestionSetID` | none | intentionally omitted from Analyze wire response | It remains an internal result identity, not `analysis_id`, Draft identity, or Candidate identity. |
| `palettesuggestion.Result.State` | none | intentionally omitted from Analyze wire response | Completeness state has no frozen wire field; the Draft and its local validation determine workbench edit requirements. |
| `palettesuggestion.Result.Reviewable` | none | intentionally omitted from Analyze wire response | The boolean is internal; all transmitted suggestions remain non-authoritative and reviewable by product rule. |
| `palettesuggestion.Result.SelectedColors` | `Draft.Colors` | deterministically transformed | Convert through the normative seeded-Draft, `DraftColor`, and identity rules in §3.3. Internal selected-color IDs, source IDs, support, `RuleID`, and `Authoritative` are not copied into unrelated Draft fields; wire-visible support remains in `ColorSuggestions`. |
| `palettesuggestion.Result.OmittedColors` | none | intentionally omitted from Analyze wire response | The WP-B3 omission collection and its combined reasons have no wire field. Do not hide them in Draft, warnings, or reason strings. |
| `palettesuggestion.Result.PaletteType` | `Draft.Type` and `Draft.Provenance` | deterministically transformed | Convert through the normative seeded-Draft and `SuggestionProvenance` rules in §3.3. `RuleID` and `Authoritative` have no corresponding Draft provenance fields and are intentionally not inserted elsewhere. |
| `palettesuggestion.Result.Facts` | none | intentionally omitted from Analyze wire response | The internal fact list has no wire field; source pixel facts already represented by `Image` remain available there. |
| `palettesuggestion.Result.Warnings` | `Warnings` | deterministically transformed | Convert through the normative warning catalog and finding-identity rule in §3.2. |
| `palettesuggestion.Result.UnresolvedDecisions` | none | intentionally omitted from Analyze wire response | The explicit internal list has no wire field. Unseeded Draft fields remain for WP-B4 editing and local validation, but that state is not a serialization of the internal list. |
| `palettesuggestion.Result.OutputSHA256` | none | intentionally omitted from Analyze wire response | The internal output digest is neither transmitted nor converted into another identity. |
| WP-B0 response constants | `ContractVersion`, `Draft.ContractVersion`, `Draft.Revision`, `Draft.SourceType` and seeded Draft fields | deterministically transformed | Assemble every field through the normative seeded-Draft table in §3.3; no unspecified default or Preview Case invention is permitted. |
| Per-request correlation generation | `AnalysisID` | deterministically transformed | Generate a fresh random UUID for this request; only its required UUID shape and request binding are deterministic contract semantics, while its value is the sole currently frozen request-scoped non-deterministic response field. |

The warning catalog, finding identity rule, seeded Draft field table,
`DraftColor` table, `SuggestionProvenance` table, and deterministic identity
rules below are normative for WP-B4A implementation.

Internal fields marked intentionally omitted may remain in the same request's
trusted typed values, but they are not part of the Analyze wire response. WP-B4
must not assume that it receives or displays them. WP-B4A must not smuggle them
into Draft fields, warnings, reason strings, or another existing field; create
an undocumented extension or parallel response; or treat their omission as
Candidate persistence or recoverable state. WP-B4A must not expand the DTO
during implementation merely to expose an omitted internal field. Any future
product need for one requires a separate contract change that explicitly
reopens WP-B0 and the Go DTO.

### 3.2 Normative Analyze warning projection

The production sources are closed string vocabularies, not free text. WP-B2
appends transparency first when present and appends no-usable-color after
extraction when applicable. WP-B3 starts with heuristic-review, then appends
exactly one of no-usable or insufficient when applicable, and finally appends
truncation when applicable. These are the only current production emissions.

| Source | Source code and emission condition | Wire `Code` | Exact `Message` | `Policy` | `Params` | `Path` | `PaletteID` | `RequiresAcknowledgment` |
|---|---|---|---|---|---|---|---|---:|
| WP-B2 `imageanalysis` | `TRANSPARENCY_COMPOSITED_TO_WHITE` when any decoded pixel has alpha below 255 | same as source | `Transparency was composited onto white before analysis.` | `deterministic-image-analysis.v1` | `{"producer":"imageanalysis"}` | empty Go string; omitted from JSON | empty Go string; omitted from JSON | `false` |
| WP-B2 `imageanalysis` | `NO_USABLE_DATA_COLOR` when extraction retains no data color | same as source | `No usable data color was detected.` | `deterministic-image-analysis.v1` | `{"producer":"imageanalysis"}` | empty Go string; omitted from JSON | empty Go string; omitted from JSON | `false` |
| WP-B3 `palettesuggestion` | `HEURISTIC_SUGGESTION_REQUIRES_ADMIN_REVIEW`, always first for a successful suggestion result | same as source | `Assistant suggestions are heuristic and require Admin review.` | `deterministic-palette-suggestion.v1` | `{"producer":"palettesuggestion"}` | empty Go string; omitted from JSON | empty Go string; omitted from JSON | `false` |
| WP-B3 `palettesuggestion` | `NO_USABLE_DATA_COLOR` when zero colors are selected | same as source | `No usable data color was available for the seeded Draft.` | `deterministic-palette-suggestion.v1` | `{"producer":"palettesuggestion"}` | empty Go string; omitted from JSON | empty Go string; omitted from JSON | `false` |
| WP-B3 `palettesuggestion` | `INSUFFICIENT_USABLE_COLORS` when exactly one color is selected | same as source | `Fewer than two usable data colors were available.` | `deterministic-palette-suggestion.v1` | `{"producer":"palettesuggestion"}` | empty Go string; omitted from JSON | empty Go string; omitted from JSON | `false` |
| WP-B3 `palettesuggestion` | `USABLE_COLORS_TRUNCATED` when more than 12 data colors are available | same as source | `Usable data colors were limited to the first 12 suggestions.` | `deterministic-palette-suggestion.v1` | `{"producer":"palettesuggestion"}` | empty Go string; omitted from JSON | empty Go string; omitted from JSON | `false` |

The combined `Warnings` array contains every WP-B2 source occurrence in its
source-slice order followed by every WP-B3 source occurrence in its source-slice
order. There is no merging or deduplication, including for
`NO_USABLE_DATA_COLOR`. A repeated occurrence from the same source is preserved
at the next zero-based occurrence position. Occurrence position controls array
order only; semantically identical same-source occurrences have the same
finding ID because occurrence is not part of finding identity. No warning is
created to carry an intentionally omitted field.

An internal warning string absent from this catalog must not be returned raw or
guessed. Assembly fails closed through the existing retryable
`INTERNAL_ANALYSIS_FAILURE` Problem with HTTP 500. A new WP-B2/WP-B3 warning
requires a prior contract change to this catalog plus assembly golden tests and
frontend contract-drift fixtures. Raw errors, decoder diagnostics, filenames,
bytes, stacks, and internal policy dumps are never warning content.

#### Analyze warning finding identity

No applicable executable helper exists today. `WarningFinding.ID` is the
lowercase 64-character hexadecimal SHA-256 digest of the UTF-8 bytes of the RFC
8785 JCS-canonical JSON object with exactly these properties:

```json
{
  "kind": "analyze_warning",
  "code": "<wire Code>",
  "path": "",
  "palette_id": "",
  "policy": "<wire Policy>",
  "params": {"producer":"<catalog producer>"}
}
```

Property ordering in the displayed example is illustrative; JCS determines the
bytes. The schema has no nulls, arrays, or optional properties: `path` and
`palette_id` are identity input as empty strings even though their wire fields
are omitted, and `params` is the exact non-empty catalog object. No occurrence,
`analysis_id`, request time, message, or random value participates. WP-B2/WP-B3
source distinction is bound by both `policy` and `params.producer`. Any identity
algorithm or schema evolution requires an explicit contract revision and a new
literal `kind`; it cannot silently change existing IDs.

Normative catalog vectors are:

| Source/code | JCS SHA-256 `ID` |
|---|---|
| WP-B2 `TRANSPARENCY_COMPOSITED_TO_WHITE` | `528ef80e640b07175b66da18ac98ac9348666dd04ccd282921c1846cd223c1e1` |
| WP-B2 `NO_USABLE_DATA_COLOR` | `01a4c0bb7b7b7b139dd87ff49785360335924ac25bfd61b49b79e8c9ce749341` |
| WP-B3 `HEURISTIC_SUGGESTION_REQUIRES_ADMIN_REVIEW` | `e4460a068dd58fd623166a95a3bc603844eeba409061159c4716987685d11ca3` |
| WP-B3 `NO_USABLE_DATA_COLOR` | `6b7d31b5d7bdfa91f35c12bfe187dc8da2eb2d91883c827da9613fd98e3d2ef7` |
| WP-B3 `INSUFFICIENT_USABLE_COLORS` | `23f0aa7f2d971c11f1281ad47c8aa44b8ce0be0bd7744c20fb05f1c62ef14a45` |
| WP-B3 `USABLE_COLORS_TRUNCATED` | `cef93768f5f204633a68399d5018340a495b1cf7e3afa3816ea2592aaa609b5a` |

The first row's exact Go-DTO JSON is:

```json
{"id":"528ef80e640b07175b66da18ac98ac9348666dd04ccd282921c1846cd223c1e1","code":"TRANSPARENCY_COMPOSITED_TO_WHITE","message":"Transparency was composited onto white before analysis.","policy":"deterministic-image-analysis.v1","params":{"producer":"imageanalysis"},"requires_acknowledgment":false}
```

The normative two-source ordering vector is a WP-B2 transparency occurrence
followed by the WP-B3 heuristic-review occurrence. Repeating either source
occurrence twice yields two adjacent array elements with identical JSON and ID.
Tests must freeze every catalog row's exact JSON, including absent optional
`path`/`palette_id`, and at least: one warning from each package; WP-B2 then
WP-B3 combined order; two identical source occurrences preserved with the same
ID; and unknown-string fail-closed behavior.

### 3.3 Normative seeded Draft projection

The initial `AssistantDraft` has exactly the following 15 Go/wire fields. Empty
Analyze-stage authored fields are intentionally editable starting state; they
do not claim Validate/Create validity or encode omitted internal results.

| Go field / JSON name | Source/default and exact value | JSON nil/empty behavior | Ordering | Editable in WP-B4 |
|---|---|---|---|:---:|
| `ContractVersion` / `contract_version` | `paletteassistant.ContractVersion`, exactly `palette-assistant.v1` | required non-empty string | n/a | No |
| `Revision` / `revision` | frozen initial positive integer `1` | required JSON integer | n/a | Incremented by WP-B4 edits |
| `Name` / `name` | exactly empty string `""`; no inferred title or identity | required `""`, never missing/null | n/a | Yes |
| `Type` / `type` | `PaletteType.Value` exactly when non-nil (currently only `categorical`); otherwise exactly `""` | required string; absent proposal is `""`, never missing/null | n/a | Yes |
| `Colors` / `colors` | transformed `SelectedColors` only under the `DraftColor` table below | required non-nil array; zero colors serializes `[]` | selected source order | Yes |
| `ChartApplicability` / `chart_applicability` | no source; exactly empty | required non-nil `[]` | empty | Yes |
| `Disciplines` / `disciplines` | no source; exactly empty | required non-nil `[]` | empty | Yes |
| `UseCases` / `use_cases` | no source; exactly empty | required non-nil `[]` | empty | Yes |
| `AvoidCases` / `avoid_cases` | no source; exactly empty | required non-nil `[]` | empty | Yes |
| `Tags` / `tags` | no source; exactly empty | required non-nil `[]` | empty | Yes |
| `Accessibility` / `accessibility` | `ColorblindSafe:false`, `PrintFriendly:false`, `DarkBackground:false`; no automatic accessibility claim | required object with all three boolean members; never missing/null/empty object | struct field order frozen by Go DTO | Yes |
| `SourceType` / `source_type` | `paletteassistant.OnlineSourceType`, exactly `figure_extracted` | required non-empty string | n/a | No |
| `SourceNote` / `source_note` | exactly empty string `""`; no filename, DOI, citation, or inferred identity | required `""`, never missing/null | n/a | Yes |
| `PreviewCases` / `preview_cases` | Analyze creates none | required non-nil `[]` | empty | WP-B5, not WP-B4 |
| `Provenance` / `provenance` | zero or one palette-type entry under the table below; selected colors use inline provenance | required non-nil array; absent type serializes `[]` | palette-type entry only | Read-only initial evidence; WP-B4 updates review state under its contract |

Blank `name`/`type` and empty applicability may be invalid at later validation;
WP-B4 local validation exposes that work. No default derives scientific subject,
chart semantics, accessibility, DOI, journal, paper title, citation, omitted
facts, warning content, completeness, or internal unresolved decisions.

#### `DraftColor` projection and identity

| Go field / JSON name | Source | Exact construction and JSON behavior | Ordering |
|---|---|---|---|
| `ID` / `id` | analyzer version, image SHA-256, selected normalized HEX, occurrence index | UUIDv5 rule below; required canonical lowercase hyphenated UUID | selected source order |
| `Hex` / `hex` | `SuggestedColor.Hex` | copy canonical uppercase `#RRGGBB`; required string | selected source order |
| `Label` / `label` | no Analyze source | Go empty string, therefore omitted by `omitempty`; never emit null | n/a |
| `Order` / `order` | selected array index | exact zero-based contiguous integer equal to array position | selected source order |
| `Source` / `source` | frozen constant | exactly `assistant` | selected source order |
| `State` / `state` | frozen initial state | exactly `unconfirmed` | selected source order |

Every `palettesuggestion.Result.SelectedColors` entry is preserved in order;
`OmittedColors` never enters `Draft.Colors`. The occurrence index is the number
of earlier selected entries with the same normalized HEX. Thus the first is 0,
the second is 1, independent of unrelated colors. Current verified WP-B3 output
has unique HEX values, but the identity rule remains total and deterministic if
that policy later changes. No map iteration controls order.

The Draft color namespace is the literal UUID
`b8264e96-9bca-4f49-a795-12397ba69e22`. Apply UUIDv5 as specified by RFC 9562
using that namespace and the UTF-8 bytes of this exact RFC 8785
JCS-canonical object as the name:

```json
{
  "algorithm_version": "<palettesuggestion.Result.SourceAnalyzerVersion>",
  "image_sha256": "<imageanalysis.Result.Image.SHA256>",
  "normalized_hex": "<DraftColor.Hex>",
  "occurrence_index": 0
}
```

The object has exactly those four property names and types. The analyzer
version must equal `imageanalysis.Result.Evidence.AlgorithmVersion`; the policy
version is not substituted. UUIDv5 uses namespace bytes followed by canonical
name bytes, SHA-1, version bits 5, and RFC variant bits; output is lowercase
hyphenated text. `analysis_id`, request time, array memory, and map order never
participate. Changing the namespace, schema, or algorithm requires a new WP-B0
contract version.

For image SHA-256
`0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef`
and analyzer version `deterministic-image-analysis.v1`, normative vectors are:

| HEX / occurrence | UUIDv5 |
|---|---|
| `#112233` / `0` | `92577f0d-979f-5951-9998-a5cc99072583` |
| `#445566` / `0` | `12e24b16-efcb-57ef-999c-9eeacf1df92b` |
| `#112233` / `1` | `5946067e-654f-5e48-af90-089adf284479` |

#### `SuggestionProvenance` projection

`SuggestionProvenance` has no ID or separate policy field in the Go DTO.
Selected colors produce no entry because `DraftColor.Source` and
`DraftColor.State` are their frozen inline provenance. Exactly one entry is
emitted only when `PaletteType` is non-nil:

| Go field / JSON name | Exact value and behavior |
|---|---|
| `Path` / `path` | exact JSON Pointer `/type` |
| `Source` / `source` | exactly `assistant` |
| `State` / `state` | exactly `unconfirmed` |
| `Producer` / `producer` | copy `PaletteType.Producer`, currently `deterministic_rule_engine` |
| `AlgorithmVersion` / `algorithm_version` | copy `PaletteType.AlgorithmVersion`, equal to `Policy.Version`, currently `deterministic-palette-suggestion.v1` |
| `ReasonCodes` / `reason_codes` | copy the non-empty source slice unchanged and in order, currently `MULTIPLE_UNORDERED_RETAINED_DATA_COLORS` |
| `SuggestedValue` / `suggested_value` | JSON string encoding of `PaletteType.Value`, exactly `"categorical"` under v1; never null |
| `AmbiguityGroup` / `ambiguity_group` | Go empty string, omitted by `omitempty`; never emit null |

With no `PaletteType`, `Draft.Type` is `""` and `Draft.Provenance` is `[]`.
With a type, this is the sole provenance entry, so its index is 0. No color,
omitted color, fact, warning, completeness state, reviewability state, or
internal unresolved decision creates provenance. The provenance has no separate
identity beyond its exact ordered value and does not depend on `analysis_id`.

Implementation golden tests must freeze: zero, one, and multiple selected-color
order; the duplicate-HEX occurrence vectors above; available and absent palette
type; all required arrays as `[]`; false accessibility members; empty required
text; omitted `label` and `ambiguity_group`; provenance ordering; UUID
repeatability; identical Draft bytes across independent requests; no
`analysis_id` dependency; and absence of every intentionally omitted internal
field from Draft/provenance.

### 3.4 Semantic determinism and `analysis_id`

Deterministic response semantics do not mean byte-identical complete
`AnalyzeResponse` JSON across independent requests. `analysis_id` is a fresh
random correlation UUID for every request. Identical images submitted in two
independent requests may and should receive different values. It is
request-scoped, non-authoritative, non-persisted, and is not a Candidate ID,
Draft ID, receipt, digest, authentication token, or scientific identity.

Except for `analysis_id` (the only response field currently marked by the
repository contract as request-scoped and non-deterministic), identical input
under the same analyzer version and policy/config must produce the same
wire-visible semantic projection. Determinism tests must compare the projection
field by field or first exclude/normalize `analysis_id`; they must not require
cross-request byte equality of the complete JSON. Tests must separately verify
that every `analysis_id` is a valid UUID generated for its corresponding
request.

## 4. Scope

WP-B4A may implement:

- backend Admin authentication and authorization for Analyze;
- bounded strict multipart parsing and transport-level type/size checks;
- calls to the existing WP-B2 and WP-B3 production packages;
- same-request typed result flow and deterministic wire-visible semantic
  assembly under the normative projection table and `analysis_id` exception;
- the frontend Analyze client/adapter consumed by WP-B4;
- cancellation, timeouts, overload handling, and safe error mapping;
- request-scoped resource cleanup with no persistence.

WP-B4A must not implement:

- `AssistantDraft` editing UI or browser object URL ownership;
- scientific Preview or Preview Case behavior;
- Validate or Create endpoints;
- Candidate creation, repository/database access, or transactions;
- receipts, acknowledgments, or idempotent Candidate orchestration;
- Publish/Reject or changes to Admin Review;
- source image, thumbnail, Draft, or evidence persistence;
- URL/filesystem ingestion, offline ingestion artifacts, external AI/CV/OCR,
  or any external image service.

```text
AnalyzeResponse ≠ Candidate
AnalyzeResponse ≠ persisted Draft
AnalyzeResponse ≠ publication
AnalyzeResponse ≠ scientific ground truth
```

## 5. Work-package ownership

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

WP-B4 owns user interaction, its selected `File`, browser-local preview and
object URL revocation, display and immutable audit copies, mutable local Draft,
unresolved decisions, authoritative local validation, revision/dirty/reset,
confirmation invalidation, accessibility, and disabled future actions. WP-B4A
owns only the authenticated request/response bridge. WP-B5 remains unchanged.
WP-B6 retains authoritative server validation and Candidate creation.

WP-B4's evidence display and immutable audit copy are limited to fields actually
present in `AnalyzeResponse`. Its unresolved work is the unseeded/locally
invalid Draft state that the Admin must resolve, not the omitted internal
`UnresolvedDecisions` list. WP-B4 must not infer a complete policy snapshot from
warnings, rerun WP-B2/WP-B3 in the browser, use fixtures or a parallel DTO to
reconstruct omissions, or describe the response as a complete server audit
record.

## 6. Trust, privacy, and lifetime

The frontend Admin route guard is a UX boundary, not authorization. The Analyze
handler must obtain authenticated identity from the existing backend middleware
and enforce Admin authorization before analysis. Client role claims, Draft
content, analysis evidence, digests, and IDs are untrusted.

WP-B2 facts and WP-B3 results remain evidence and non-authoritative heuristic
suggestions. The response creates no Palette, Candidate, Preview Case, receipt,
or durable Draft identity. `analysis_id` is request/UI correlation only.

The source image and decoded buffers are request-scoped and released on every
path. No image, thumbnail, filename, EXIF, base64, full evidence dump, or local
path is persisted. Responses and errors expose no image bytes, internal path,
stack trace, decoder detail, raw payload, or secret. Logs follow the existing
WP-B0 allowlist and exclude image hashes by default, bytes, colors, Draft data,
filenames, and complete evidence.

## 7. Future implementation acceptance contract

WP-B4A implementation must verify:

- real backend Admin authorization and the frozen route/DTO;
- strict exact-one-image multipart parsing and all frozen request limits;
- MIME/signature/config agreement and WP-B2 decoder constraints;
- one-request typed WP-B2 → WP-B3 flow with no client evidence trust;
- the normative WP-B3 → `AnalyzeResponse` projection, preserving every field
  and semantic the frozen wire DTO can express;
- complete deterministic assembly of every transmitted, transformed, or
  narrower field, with intentionally omitted internal fields absent from every
  wire field and extension;
- catalog coverage for every current WP-B2/WP-B3 warning; exact messages,
  params, optional-field shape, combined ordering, JCS/SHA-256 IDs and golden
  vectors; duplicate preservation; and unknown-warning fail-closed behavior;
- a unique source/default and exact nil/empty JSON rule for all 15
  `AssistantDraft` fields, all six `DraftColor` fields, and all eight emitted
  `SuggestionProvenance` fields;
- exact selected-color and provenance ordering, the literal UUIDv5 namespace,
  JCS name schema, occurrence rule and identity vectors, with required arrays
  encoded as `[]` and omitted internals absent from warnings/Draft/provenance;
- a fresh valid request-scoped random `analysis_id`, semantic determinism for
  every other field, and no cross-request full-JSON byte-equality requirement;
- safe Analyze error/status taxonomy, cancellation, deadline, and overload;
- request-end image/resource lifetime and zero persistence;
- no Candidate, Preview, Validate/Create, external service, filesystem/URL, or
  offline-ingestion dependency;
- focused backend handler/service and frontend client/contract-drift tests that
  cover every projection classification and all normative vectors without
  modifying or extending the Go DTO; malformed, tampered, and limit cases;
  scope-isolation assertions; race tests; and Palette/Admin regressions.

Tests must require no database, network service beyond an in-process HTTP test
server, real scientific image, filesystem fixture, or external process. Any
previously unfrozen implementation detail must remain explicit rather than
being promoted to product contract.

## 8. Downstream state

- WP-B4 dependency conflict: resolved in contract.
- WP-B4A Analyze-only transport: backend committed at `395fbfa`; frontend completion implemented, independent review pending.
- WP-B4 Admin Draft Workbench: blocked pending independent WP-B4A frontend completion review and commit.
- WP-B5 Preview integration: unchanged, not implemented.
- WP-B6 Validate/Create persistence: unchanged except Analyze extraction, not
  implemented.
