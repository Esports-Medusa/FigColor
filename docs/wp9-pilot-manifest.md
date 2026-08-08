# WP9 Manual Colors Pilot Decision Record

- Pilot ID: `wp9-manual-colors-2026-08-08`
- Date: 2026-08-08
- Product owner, primary operator, and sign-off owner: Jackie
- Technical execution: Codex under Jackie's explicit authorization
- Tested base: `4a343494b7996efe26a538161f2cdcbbae6ac276`
- Source contract: schema version 1, pipeline version recorded from generated artifacts
- Target: fresh disposable local PostgreSQL database prefixed `figcolor_wp9_pilot_`, pilot-only application and Admin identity
- Package rule: one `manual_colors` package creates at most one Palette candidate

## Composition and intended outcomes

| Package | Structure | Colors | Applicability | Evidence condition | Intended outcome |
|---|---:|---:|---|---|---|
| P1 `wp9-p1-edit-publish` | categorical | 5 | `scatter_grouped` | deliberately provisional name | Admin name correction, preview Publish/primary, Candidate Publish |
| P2 `wp9-p2-warning-publish` | sequential | 6 | `heatmap_annotated` | use a genuine importable warning if the unchanged v1 contract emits one | preview Publish/primary, Candidate Publish |
| P3 `wp9-p3-duplicate-reject` | diverging | 5 | `boxplot_jitter` | colors deliberately near P1 to exercise v1 perceptual evidence | imported-candidate Reject |
| P4 `wp9-p4-blocking-invalid` | categorical | 5 supplied entries | `scatter_grouped` | invalid HEX | blocking failure; never submit |

P2 must not be given an invented warning. If the accepted contract emits none, the pilot records this as an implementation boundary. P3 uses the frozen v1 similarity policy unchanged; it is not an exact replay and its approved pilot disposition is Reject, not a general duplicate policy.

## Approved thresholds and stopping rules

- Deterministic proposal identity and normalized hash: 4/4.
- P4 structured rejection: 1/1, with zero database writes and zero success receipt.
- P1–P3 candidate creation, Admin discovery, ordered HEX/stable-ID preservation, and traceability: 3/3.
- Pre-publication public leakage: 0/3.
- Idempotent replay: 3/3 with zero duplicate aggregates.
- P1 edit/save: 1/1 while still candidate and non-public.
- P1/P2 Publish, public detail, and published-primary selection: 2/2; ingestion leakage: zero.
- P3 duplicate-risk evidence: 1/1; automatic merge/publication/rejection: zero; Reject: 1/1.
- Public ingestion-evidence leakage, unauthorized writes, and partial aggregates: zero.
- Admin review time: at most 15 minutes per candidate; report median and maximum.
- Stop immediately for nondeterminism, unauthorized/public evidence exposure, partial writes, or a required contract/schema/lifecycle expansion.

Image recall, false extracted-color rate, OCR accuracy, AI field accuracy, and prompt correction rate are not applicable.

## Evidence, retention, and rollback

Protected inputs, validation details, checkpoints, raw receipts, logs, Admin-only screenshots, and any necessary database dump stay under ignored local artifacts, accessible only to Jackie and the isolated pilot Admin context. Retention is 90 days after sign-off; Jackie alone authorizes archival or deletion. No secrets, DSNs, tokens, restricted source identity, or raw protected evidence may be committed or exposed publicly.

The pilot uses no direct SQL ingestion or lifecycle transition. Rollback is disposal of the uniquely named pilot database after evidence is verified; business outcomes use only the accepted Admin Publish or imported-candidate Reject actions. The pipeline never publishes automatically.

Second-human handoff is deferred and non-blocking for this individual MSc technical pilot. It must be reported as not run, not simulated by Codex.
