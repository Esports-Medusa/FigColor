# Real Scientific-Figure Colour Extraction Pilot — preparation checkpoint

## Status and authorization boundary

Starting checkpoint: `e22591c756c3758bf8185e0bc400e4202f97f09a`. Repository and supplied-attachment inspection found no eligible real scientific-figure images. The request attachment contains only the work-package specification, and the repository contains no PNG/JPEG resources documented for this pilot. Synthetic substitution is prohibited. Therefore the real pilot is prepared but not executed and no real-corpus metrics, failure counts, or algorithm recommendation are claimed.

The frozen `imagecolor.DefaultConfig` extractor is called unchanged by a new feasibility-only harness. Nothing is connected to production ingestion, proposal v1, HTTP, Admin Review, or a database. No algorithm threshold, decoder rule, output hash, candidate ordering or classifier changed.

## Local input, provenance and storage protocol

Eligible images must be placed locally under:

```text
artifacts/palette-ingestion/real-figure-pilot/inputs/
```

Generated machine results go under:

```text
artifacts/palette-ingestion/real-figure-pilot/results/
```

The existing `artifacts/palette-ingestion/` ignore rule covers both. Images and generated results must remain uncommitted unless per-image permission explicitly allows committing. Committed manifests must contain relative paths only and the minimum non-identifying provenance category/status; do not record paper title, DOI, author, journal or publication year.

The manifest template is `backend/internal/feasibility/realpilot/testdata/pilot-manifest.template.json`; the per-fixture annotation template is `fixture-annotation.template.json`. Each fixture records stable ID, relative path, SHA-256, chart type or `unsupported`, format, dimensions/bytes, palette type, ordered or unordered discrete data colours, structural and ambiguous colours, continuous-gradient status, annotation method, existing transformation, provenance/permission, commit permission and non-identifying ambiguity notes.

## Annotation protocol

One human annotator performs two passes separated by a review interval:

1. Inventory the figure without extractor output: data colours, structural colours, background, ambiguous colours, continuous gradients, supported/unsupported chart structure and whether semantic order is directly observable.
2. Reopen the frozen image and first-pass record, verify every category/HEX and resolve only visually supportable transcription mistakes. Record unresolved ambiguity rather than forcing a discrete colour.

Accepted HEX is uppercase `#RRGGBB`. Use ordered colours only when order is observable; otherwise use the unordered field. Ambiguous and continuous colours are excluded from the exact-discrete denominator. Transparency/compression that prevents a defensible single HEX must be recorded as ambiguity. With one annotator, this is self-consistency review, not inter-rater agreement.

## Prepared harness

`backend/cmd/realfigurepilot` loads strict JSON, validates unique IDs, safe relative paths, registered/unsupported chart types, PNG/JPEG format, provenance fields, canonical HEX, ordered/unordered semantics and continuous/discrete separation. It verifies recorded SHA-256 values, rejects symlinks/outside-root paths, calls the frozen extractor, sorts results by fixture ID, separates unavailable/hash-mismatch/unsupported/excluded/failed/eligible states, computes exact confusion only for eligible discrete annotations, and performs deterministic one-to-one greedy ΔE76 matching without candidate reuse.

The `prepare` subcommand scans only the strict layout `inputs/<safe-fixture-id>/figure.png|jpg|jpeg`. It rejects symlinks, unsafe IDs, unexpected entries, multiple/missing images, signature/extension mismatch, and inputs outside the frozen decoder size/dimension limits. It deterministically fills only fixture ID, relative path, SHA-256, actual format, width, height, encoded bytes and `may_commit=false`. Chart type, palette type, annotations, provenance, permission and transformation remain empty so the draft cannot pass pilot validation until a human completes them. Existing manifest files are never overwritten.

The harness writes only the explicitly selected local result file. It performs no HTTP or database operation. Unit tests use temporary generated images solely to test harness mechanics; they are not pilot inputs and produce no claimed real evidence.

Manifest preparation command, run after adding or changing the complete intended input batch:

```bash
cd backend
GOCACHE=/tmp/figcolor-realpilot-go-cache go run ./cmd/realfigurepilot prepare \
  -input-root ../artifacts/palette-ingestion/real-figure-pilot/inputs \
  -manifest ../artifacts/palette-ingestion/real-figure-pilot/pilot-manifest.json \
  -pilot-id real-scientific-figure-pilot
```

If a draft already exists, choose a new output filename or deliberately remove/archive the old local draft first; `prepare` has no overwrite flag. After preparation, complete two-pass human annotation in that draft.

Pilot execution command:

```bash
cd backend
GOCACHE=/tmp/figcolor-realpilot-go-cache go run ./cmd/realfigurepilot run \
  -manifest ../artifacts/palette-ingestion/real-figure-pilot/pilot-manifest.json \
  -input-root ../artifacts/palette-ingestion/real-figure-pilot/inputs \
  -output ../artifacts/palette-ingestion/real-figure-pilot/results/baseline.json
```

## Missing-input checklist

Before execution, the owner must supply at least eight eligible figures (preferred 12–18) and, for each:

- confirm user-supplied, repository-owned or explicitly permitted internal-study provenance;
- confirm whether the image itself may be committed (default false);
- copy bytes unchanged into the approved local root and calculate SHA-256;
- record format, dimensions and encoded bytes;
- assign a registered chart type or explicitly `unsupported` without remapping;
- complete both annotation passes and preserve ambiguity/gradient exclusions;
- ensure the corpus includes meaningful available variation and document chart/format imbalance;
- have a human review the manifest for identifying bibliographic material before any summary is committed.

The complete pilot must not run with fewer than eight eligible images. If fewer are available, retain `Pilot evidence is insufficient; expand or improve annotation first` rather than selecting an algorithm outcome.

## Prepared tests and future metrics

Tests cover deterministic preparation, factual metadata and explicit empty annotation fields, no-overwrite behavior, unsafe IDs/layouts, symlinks, multiple images, signature mismatch, malformed/unknown manifest fields, duplicate IDs, traversal, missing inputs, hash mismatch, unsupported chart type, ordered/unordered annotation, ambiguous/continuous denominator exclusion, deterministic ordering, one-to-one matching without candidate reuse and aggregate arithmetic. When inputs exist, the report must add per-figure and aggregate TP/FP/FN, precision/recall, exact sets, structural and near-background FNs, deterministic reruns, ΔE76 assignments and thresholds 1/2/5/10, semantic order where observable, and manually reviewed failure taxonomy.

No decision-gate option A–F is selected. Current outcome is **G. Pilot evidence is insufficient; expand or improve annotation first**, specifically because eligible real inputs are absent rather than because extraction failed.

## Limitations

No eligible images, real extraction results, annotation review, chart/format composition, real failure taxonomy, semantic-order results, runtime or memory evidence exist for this checkpoint. Harness unit fixtures cannot answer the pilot question. The single-annotator protocol cannot establish inter-rater agreement.

## Verification

- `prepare` command against the empty approved input root — passed and wrote a deterministic zero-fixture draft without running extraction;
- prepared pilot command — returned `prepared_no_inputs`; ignored preflight JSON contained zero results and zero metrics;
- `GOCACHE=/tmp/figcolor-realpilot-go-cache go test ./internal/feasibility/imagecolor -count=1` — passed;
- `GOCACHE=/tmp/figcolor-realpilot-go-cache go test ./internal/feasibility/realpilot -count=1` — passed;
- `GOCACHE=/tmp/figcolor-realpilot-go-cache go test ./... -count=1` — passed;
- `npm test` — passed, all 26 registered frontend behaviour modules;
- `npm run build` — passed, 166 modules transformed;
- `npm run test:palette-ingest` — sandbox run 93/94 because loopback bind returned `EPERM`; permitted rerun passed 94/94.

Whitespace, staged-diff and post-commit checks are recorded in the final handoff.

```text
Real scientific-figure pilot = Prepared but not executed
Eligible pilot inputs = Missing
Pilot harness and annotation protocol = Prepared
Real-corpus metrics = Not claimed
Synthetic extractor = Unchanged
Production integration authorization = Not granted
Proposal v1 extension = Not authorized
Database / Admin Review writes = Not performed
Push = Not performed
```
