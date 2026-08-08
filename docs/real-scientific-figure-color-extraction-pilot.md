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

The harness writes only the explicitly selected local result file. It performs no HTTP or database operation. Unit tests use temporary generated images solely to test harness mechanics; they are not pilot inputs and produce no claimed real evidence.

Prepared command:

```bash
cd backend
GOCACHE=/tmp/figcolor-realpilot-go-cache go run ./cmd/realfigurepilot \
  -manifest internal/feasibility/realpilot/testdata/pilot-manifest.template.json \
  -input-root ../artifacts/palette-ingestion/real-figure-pilot/inputs \
  -output ../artifacts/palette-ingestion/real-figure-pilot/results/preflight.json
```

With the empty template this deterministically reports `prepared_no_inputs`; it is not a pilot run.

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

Tests cover malformed/unknown manifest fields, duplicate IDs, traversal, missing inputs, hash mismatch, unsupported chart type, ordered/unordered annotation, ambiguous/continuous denominator exclusion, deterministic ordering, one-to-one matching without candidate reuse and aggregate arithmetic. When inputs exist, the report must add per-figure and aggregate TP/FP/FN, precision/recall, exact sets, structural and near-background FNs, deterministic reruns, ΔE76 assignments and thresholds 1/2/5/10, semantic order where observable, and manually reviewed failure taxonomy.

No decision-gate option A–F is selected. Current outcome is **G. Pilot evidence is insufficient; expand or improve annotation first**, specifically because eligible real inputs are absent rather than because extraction failed.

## Limitations

No eligible images, real extraction results, annotation review, chart/format composition, real failure taxonomy, semantic-order results, runtime or memory evidence exist for this checkpoint. Harness unit fixtures cannot answer the pilot question. The single-annotator protocol cannot establish inter-rater agreement.

## Verification

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
