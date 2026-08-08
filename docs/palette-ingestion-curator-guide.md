# Palette Ingestion Curator Guide

## Supported input

Each package is one directory containing `manifest.json`; one package represents one Palette. Version 1 supports only `source_type: "manual_colors"`. Colors are ordered 6-digit HEX values (an optional leading `#` is accepted), RGB is derived, and the manifest must supply one of `categorical`, `sequential`, `diverging`, or `mixed` plus controlled metadata and at least one registered chart-applicability entry.

```json
{
  "source_key": "study-a-palette-1",
  "source_type": "manual_colors",
  "supplied_fields": {
    "colors": ["#3366AA", "#DC6B2F", "#58A65C"],
    "type": "categorical",
    "disciplines": ["general"],
    "use_cases": ["publication"],
    "avoid_cases": [],
    "tags": ["professional"],
    "chart_applicability": [
      {"chart_type": "scatter_grouped", "suitability": "best_fit", "source": "curated"}
    ]
  }
}
```

Registered chart types are `bar_error`, `boxplot_jitter`, `line_multiseries`, `heatmap_annotated`, `scatter_grouped`, and `violin_distribution`. Applicability describes suitability; it does not configure rendering. A supplied preview is optional and must use the matching registered template, persisted color IDs such as `color-1`, valid roles/config, and `stable_id` or valid fixed-seed behavior. Ingestion always stores it as draft and non-primary.

## Evidence and review

Captions, curator notes, internal paths/source references, validation evidence, hashes, duplicate findings, checkpoints, and receipts are internal. Never copy paper identity or restricted evidence into public Palette names, tags, or notes. Keep protected inputs and run artifacts under the ignored `artifacts/palette-ingestion/` boundary.

Errors block import; warnings are review evidence and do not automatically merge, Publish, or Reject. `NEAR_DUPLICATE_CONTENT` means inspect the matched ordered colors and context. Exact canonical duplicates are blocked. A deterministic generated name marked for review may be corrected through the Admin editor.

Correct the source manifest only after recording the original failure. Rerun prepare and validate; never edit generated proposals/checkpoints to force success. Stop and escalate on unsupported source/chart types, uncertain rights/access, unexpected public visibility, hash/checkpoint mismatch, authentication failure, or any request to bypass Admin Review.

Unsupported: images, OCR, AI/provider extraction, crawling, new taxonomies/chart types, automatic merge/publication, project-private/default palettes, and direct SQL ingestion.
