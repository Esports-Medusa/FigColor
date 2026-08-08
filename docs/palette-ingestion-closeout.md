# Offline Palette Ingestion Close-out

## Supported boundary

The completed pipeline is an auditable batch-ingestion foundation for manually structured palette packages:

```text
manual package
→ scan
→ prepare
→ validate
→ report/checkpoint
→ submit
→ backend idempotent candidate import
→ Admin Review
→ Publish or Reject
```

It is not an automatic image palette extraction system. Version 1 accepts only `source_type: "manual_colors"`. The supported CLI commands are `scan`, `prepare`, `validate`, `status`, and `submit`.

## Implemented

- `manual_colors` source packages with strict versioned contracts and controlled vocabularies.
- Deterministic scan, proposal preparation, validation, status reporting, and authenticated submission.
- Proposal normalization, stable identities, canonical serialization, and canonical hashing.
- Validation reports with blocking issues, warnings, exact-duplicate evidence, and perceptual-similarity evidence for human review.
- Durable checkpoints, report bindings, resumable completed stages, and explicit pending-or-unknown submission recovery.
- Canonical submission requests, stable request fingerprints, durable idempotency keys, and replay-safe receipts.
- Authenticated backend validation and transactional import of the Palette, applicability, optional draft preview cases, ingestion record, and receipt linkage as one candidate aggregate.
- Backend idempotency, conflict detection, recovery after ambiguous outcomes, and retained ingestion audit records.
- Admin Review of imported candidates, supported edits, authoritative Publish, and Reject/archive lifecycle behavior. Import never publishes automatically.

Operational details and safety procedures remain in the [operator runbook](palette-ingestion-operator-runbook.md), [curator guide](palette-ingestion-curator-guide.md), and [troubleshooting guide](palette-ingestion-troubleshooting.md).

## Deferred

- Automatic image colour extraction.
- OCR or AI-provider extraction and analysis.
- Paper acquisition, website acquisition, downloading, scraping, or crawling.
- Automatic inference of names, disciplines, use cases, or chart types.
- Automatic Preview Case generation.
- Automatic duplicate merging, including perceptual near-duplicates.
- Automatic publication.
- Support or fallback mappings for unregistered chart types.

These items require a separately approved design and implementation phase. They must not be inferred from historical plans, pilot fixtures, or evaluation material in the repository.
