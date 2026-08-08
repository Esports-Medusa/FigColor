# Deterministic image colour extraction feasibility

## Decision and boundary

Corrected feasibility checkpoint tested on 2026-08-08 from the accepted WP9 parent `fd6c3dd99e283fd570ce771f988b24f1844b4a89`. The v1 ingestion contract still supports only `manual_colors`. The harness under `backend/internal/feasibility/imagecolor` is experimental and remains disconnected from the CLI, schemas, backend services, APIs, DTOs and database. No source type, dependency, OCR, AI, crawler, real-source evaluation or production integration is added.

The worktree contained unrelated user changes before this checkpoint; they were preserved. Only repository-owned generated graphics are used.

## Corrected corpus

Six runtime-generated fixtures now contain geometry representative of each registered chart contract rather than generic bars:

| Fixture | Geometry | Type / colours | Transformation | Semantic order observable |
|---|---|---|---|---|
| bar-error | bars, capped error bars, axes/grid | categorical / 3 | native raster | yes, left-to-right fixture convention |
| boxplot-jitter | boxes, whiskers, caps, median and jitter points | categorical / 5 | small overlapping jitter | no |
| line-downsampled | six thin piecewise-linear paths | categorical / 6 | render at 2× then 2×2 box downsample | no |
| heatmap-annotated | filled cells and contrasting plus-shaped annotations | diverging / 5 | native raster | yes, left-to-right scale convention |
| scatter-alpha | grouped small circular points and explicit overlap | categorical / 3 | one group at alpha 128 | no |
| violin-filled | symmetric density-shaped filled regions and medians | sequential / 5 | native raster | no |

The exact ground truth and structural colours are in `testdata/corpus-manifest.json`. `TestCorpusManifestMatchesExecutableCorpus` reads that file and compares its fixture count, unique IDs, ordered fixture IDs, chart types, palette types, ordered expected HEX colours, transformation labels and order-observable flags with the executable Go corpus. This makes manifest drift a test failure. The downsample is a real averaging transformation and produces genuine boundary blend colours. The corpus does not claim font-renderer anti-aliasing, because its annotations are raster primitives rather than text glyphs. Existing deterministic Vue renderers were inspected, but direct reuse would require a browser/SVG rasterization dependency; repository-native Go primitives keep decoder evidence bounded and dependency-free.

## Safe decoding and configuration boundary

PNG and JPEG are accepted only when the decoded signature matches `.png`, `.jpg` or `.jpeg`. Valid GIF bytes are decoded at the header boundary and rejected as `UNSUPPORTED_FORMAT`; this is distinct from extension mismatch. The harness rejects absolute/traversing/outside-root paths, symlinks, non-files, invalid bytes, truncated PNG and JPEG, signature/extension mismatch, excessive file size, width, height or decoded pixel count, and malformed configuration. Decode failures return `success=false`, a blocking issue, and no candidates/output hash.

Effective configuration `feasibility-v2`:

```text
max_bytes=2097152
max_width=4096
max_height=4096
max_pixels=8000000
quantize_step=8
min_pixels=8
neutral_spread=12
background_distance=8
alpha_backdrop=#FFFFFF
ranking=pixel_count_desc,hex_asc
```

All effective fields and the version are emitted in the result and included in `OutputHash`. Tests prove identical bytes/configuration reproduce the hash, while changing a limit or configuration version changes the hash even when extracted candidates remain identical.

Header inspection enforces dimension/pixel limits before full decode. Go decoders ignore metadata for this pixel-only harness; EXIF is not interpreted. Peak resident memory is not instrumented. At the eight-million-pixel ceiling, a single RGBA-sized image is about 32 MiB before decoder and histogram overhead, so a production slice would still need process resource limits and fuzzing. No new image dependency was required.

## Alpha correction

The original checkpoint incorrectly treated values returned by `color.Color.RGBA()` as straight channels and multiplied them by alpha a second time. For the synthetic green `(44,160,44,128)` over white it effectively targeted approximately `(139,167,139)` before quantization instead of the correct `(149,207,149)`.

The corrected implementation converts each pixel through `color.NRGBAModel`, obtaining straight non-premultiplied channels, then performs integer source-over composition against the explicit `alpha_backdrop`. Exact executable cases prove:

```text
RGBA(255,0,0,128) over #0000FF = #80007F
RGBA(255,0,0,128) over #FFFFFF = #FF7F7F
```

Any transparency sets `decoder.has_transparency=true` and emits `TRANSPARENCY_COMPOSITED_TO_CONFIGURED_BACKDROP`. This is experimental evidence: the configured backdrop may differ from the intended visual backdrop, so a curator must confirm transparent-source colour interpretation.

## Algorithm and classification semantics

The baseline counts pixels after configurable channel quantization. It estimates background from the four corner mode, then:

1. excludes low-frequency evidence (`pixels < min_pixels`);
2. excludes colours within `background_distance` of the estimated background—this is **near-background exclusion**;
3. classifies remaining low-channel-spread colours as **structural candidates**;
4. classifies the remainder as data candidates and ranks by coverage then HEX.

Near-background exclusion and structural classification are separate operations. A missed near-white heatmap centre is an exclusion failure; a neutral box colour placed in `Structural` is a classification failure. Neither by itself proves an inherent impossibility, although identical data and structural colours cannot be separated using global colour alone.

Quantization is limited deduplication, not perceptual clustering. Delta E 76 remains available only for threshold reporting; no clustering or connected-component next slice is implemented here.

## Corrected package metrics

Exact matching compares expected post-alpha, post-quantization observed colours with data candidates. `TP` is an expected data colour in candidates; `FP` is a candidate not in expected data colours; `FN` is expected but absent from candidates. `structural FN` identifies the subset misclassified as structural.

| Fixture | TP | FP | FN | Structural FN | Recall | Precision | Exact set |
|---|---:|---:|---:|---:|---:|---:|---|
| bar-error | 3 | 0 | 0 | 0 | 100% | 100% | yes |
| boxplot-jitter | 4 | 0 | 1 | 1 | 80% | 100% | no |
| line-downsampled | 6 | 18 | 0 | 0 | 100% | 25% | no |
| heatmap-annotated | 4 | 0 | 1 | 0 | 80% | 100% | no |
| scatter-alpha | 3 | 0 | 0 | 0 | 100% | 100% | yes |
| violin-filled | 5 | 0 | 0 | 0 | 100% | 100% | yes |
| **Aggregate** | **25** | **18** | **2** | **1** | **92.6%** | **58.1%** | **3/6** |

These integer fixture and aggregate confusion counts, aggregate structural FN=1, exact recovery=3/6 and deterministic reruns=6/6 are executable regression assertions. They are locked as the `feasibility-v2` synthetic benchmark baseline, not a production acceptance threshold. Recall and precision are derived from the asserted integers rather than compared as formatted floating-point strings.

The 18 line false positives are real downsampled boundary blends. They are an implementation limitation of frequency/quantization without component or perceptual grouping, not evidence that thin-line colours are inherently unrecoverable. The neutral box false negative is caused by the current global neutral heuristic. The pale heatmap centre is removed by near-background exclusion. Transparent scatter now recovers the three correctly composited observed colours; this does not recover the original uncomposited semantic palette without alpha/backdrop evidence.

Colour-count errors (`candidate count - expected count`) are `0, -1, +18, -1, 0, 0`, total absolute error 20 and mean absolute error 3.33. Background false inclusion is 0/6. Expected axis/grid false inclusion is 0/6; line blends account for all 18 candidate false positives. Exact output hashes were stable on two runs for every package (6/6).

At quantization steps 4, 8 and 16 the aggregate candidate count remained 43; this corpus does not justify selecting a coarser threshold. The controlled quality-90 JPEG bar transformation produced TP=3, FP=41, FN=0 (44 candidates and 9 structural candidates), again showing that frequency plus quantization is not adequate for lossy output.

## Perceptual-distance evidence

Perceptual evidence is secondary to the exact confusion baseline. Expected colours are first transformed by the same explicit alpha backdrop and quantization used by extraction. The test constructs every expected/data-candidate pair, orders pairs by ΔE76 then expected index and candidate index, and greedily consumes each expected and candidate at most once. This prevents one candidate satisfying several expected colours and is deterministic. It is simpler than Hungarian assignment and does not guarantee globally minimum total cost; that limitation is acceptable here because all 25 assigned baseline pairs are exact and have ΔE76=0. Perceptual clustering is not implemented.

| Fixture | Assigned / expected | Unmatched expected | Mean matched ΔE76 | Maximum | ≤1 | ≤2 | ≤5 | ≤10 |
|---|---:|---|---:|---:|---:|---:|---:|---:|
| bar-error | 3/3 | none | 0 | 0 | 3 | 3 | 3 | 3 |
| boxplot-jitter | 4/5 | `#484848` after quantization | 0 | 0 | 4 | 4 | 4 | 4 |
| line-downsampled | 6/6 | none | 0 | 0 | 6 | 6 | 6 | 6 |
| heatmap-annotated | 4/5 | `#F0F0F0` after quantization | 0 | 0 | 4 | 4 | 4 | 4 |
| scatter-alpha | 3/3 | none | 0 | 0 | 3 | 3 | 3 | 3 |
| violin-filled | 5/5 | none | 0 | 0 | 5 | 5 | 5 | 5 |
| **Aggregate** | **25/27** | **2** | **0** | **0** | **25** | **25** | **25** | **25** |

Assigned expected→candidate pairs (all ΔE76=0) are: bar `#2878B8`, `#50A868`, `#E05838`; boxplot `#189870`, `#6850A0`, `#D85888`, `#E0A800`; line `#10B8C8`, `#1870B0`, `#28A028`, `#9060B8`, `#D02028`, `#F87808`; heatmap `#2060A8`, `#60A8C8`, `#B01828`, `#E88860`; scatter `#1870B0`, `#90C890`, `#F87808`; violin `#085098`, `#3080B8`, `#68A8D0`, `#98C8E0`, `#E8F0F8`. In each case the candidate is the identical quantized HEX.

The unmatched boxplot `#484848` is present exactly in structural candidates and remains a structural FN; its nearest data candidate is `#6850A0` at ΔE76 50.099659. The unmatched heatmap `#F0F0F0` falls within the configured near-background exclusion band; its nearest data candidate is `#60A8C8` at ΔE76 39.842987. Neither proximity is counted as recovery. The 18 downsample boundary blends remain false-positive candidates even where perceptually near a line colour.

## Runtime observation

Runtime was measured separately from normal tests with fixture generation and PNG encoding completed before timing. Each fixture received five untimed warm-ups followed by 101 extraction runs; extraction includes bounded input reading, header/full decode, pixel analysis and result hashing. No runtime assertion or performance threshold exists.

Command:

```text
FIGCOLOR_RUNTIME_OBSERVATION=1 GOCACHE=/tmp/figcolor-feasibility-go-cache go test ./internal/feasibility/imagecolor -run '^TestRuntimeObservations$' -count=1 -v
```

Environment: Go `go1.26.3`, `darwin/arm64`. All fixtures decoded to 180×120 pixels.

| Fixture | Encoded bytes | Median | p95 |
|---|---:|---:|---:|
| bar-error | 618 | 746.208 µs | 1.038125 ms |
| boxplot-jitter | 1,223 | 681.500 µs | 801.959 µs |
| line-downsampled | 1,916 | 711.541 µs | 817.375 µs |
| heatmap-annotated | 751 | 671.500 µs | 779.334 µs |
| scatter-alpha | 858 | 519.958 µs | 618.292 µs |
| violin-filled | 1,089 | 672.833 µs | 790.416 µs |

Across 606 samples, median was 676.500 µs and p95 was 846.542 µs. Mean total time for one six-fixture batch was 4.109315 ms. These are current-machine feasibility observations, not portable guarantees. Peak memory remains unmeasured.

## Negative/stress results

Executable tests cover invalid bytes; truncated PNG/JPEG; valid unsupported GIF; misleading extension; file-size rejection; independent width, height and pixel-count rejection; malformed configuration; traversal; symlink; transparency warning/evidence; exact alpha/backdrop outcomes; and configuration-bound deterministic hashes. Stress geometry covers darker structural gray, a neutral data colour, a near-background heatmap colour, thin downsampled lines, small/overlapping scatter points, transparency, cell annotations, filled regions and lossy JPEG.

## Decision gate and curator boundary

Deterministic extraction remains sufficient to justify only a future, separately authorized candidate/evidence implementation slice. Native opaque bars and filled violins recover cleanly in this synthetic corpus. Box/heatmap heuristics and downsampled or lossy output remain unreliable. Correct alpha composition recovers observed composited pixels but cannot infer the intended underlying palette/backdrop.

Canonical semantic order cannot generally be inferred from pixel frequency. Only a separately established observable rule—such as a detected left-to-right scale—could support an order suggestion. Where no such mechanism exists: `Color-order recovery = Not applicable; pixel evidence alone does not establish canonical semantic order.` This harness does not implement order detection.

Curators must confirm inclusion, data/structural status, near-background colours, alpha/backdrop meaning, colour count/order, palette/chart type and all semantic roles or metadata. OCR is unnecessary for the next deterministic correction and remains deferred. Optional AI remains unjustified without a separately approved protected real-source study.

The smallest future experimental result remains input hash, decoder facts, complete effective configuration, background estimate, candidates and structural candidates with pixel evidence, transparency/composition evidence, warnings/blocking issues, runtime and output hash. It must not extend proposal v1 or submit anything.

## Verification and limitations

Focused benchmark command:

```text
GOCACHE=/tmp/figcolor-feasibility-go-cache go test ./internal/feasibility/imagecolor -count=1 -v
```

Regression results on the preserved dirty worktree:

- focused feasibility package — passed, including six-package metrics, alpha/config identity and all decoder/path negatives;
- `npm test` — passed, all 26 registered frontend behaviour modules;
- `npm run build` — passed, 166 modules transformed;
- `npm run test:palette-ingest` — sandbox run 93/94 because loopback bind returned `EPERM`; permitted rerun passed 94/94;
- `GOCACHE=/tmp/figcolor-feasibility-go-cache go test ./internal/palette -count=1` — passed;
- `GOCACHE=/tmp/figcolor-feasibility-go-cache go test ./... -count=1` — passed, including feasibility, middleware, palette and project packages.

Whitespace, staged-diff and post-amend checks are recorded in the correction handoff.

Remaining limitations: small synthetic-only corpus; no real fonts or browser renderer; no colour-profile evaluation; no animation; no fuzz corpus; no direct peak-memory measurement; white alpha backdrop is configuration rather than inferred intent; global corner background estimation; global neutral heuristic; no component evidence or perceptual clustering; no real scientific figures. Success here is not evidence that arbitrary published figures are solved.

```text
Deterministic extraction feasibility = Partially accepted
Safe decoder boundary = Defined
Synthetic benchmark = Completed
Production integration authorization = Not granted
Real scientific-figure pilot = Not run
Connected components = Not started
Perceptual clustering = Not started
OCR = Deferred
AI/multimodal integration = Deferred
Peak memory = Not measured
```
