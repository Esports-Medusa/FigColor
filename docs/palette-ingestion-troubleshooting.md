# Palette Ingestion Troubleshooting

| Symptom | Safe response |
|---|---|
| Malformed manifest or unknown field | Use the structured path/code; correct the source manifest after recording the failure. Do not loosen strict decoding. |
| Invalid HEX/order | Supply unique valid 6-digit HEX values in intended order; rerun prepare/validate. |
| Unregistered chart/applicability | Choose only a registered chart and suitability; do not add a fallback mapping. |
| Invalid preview color role | Reference generated `color-N` IDs required by the registered template, never raw HEX. |
| Hash/checkpoint mismatch or corruption | Do not trust it. Rerun deterministic stages from retained source; preserve any uncertain submission binding. |
| Idempotency conflict | Same key with changed content is forbidden. Inspect the original checkpoint/receipt; do not rotate identities to bypass it. |
| 401/403 | Verify pilot-only Admin authentication and environment. No write should exist. Never log the token. |
| Restricted environment `listen EPERM` | Record the environmental failure and rerun only with approved local-loopback permission. |
| PostgreSQL guard refusal | Stop; resolve explicit non-default host/port and uniquely prefixed disposable database. |
| Interrupted batch | Resume from intact checkpoints; completed stages should be reused and incomplete/corrupt stages safely regenerated. |
| Lost HTTP response | Treat outcome as unknown; resume with identical durable key/body and reconcile the canonical receipt. |
| Candidate missing from Admin filter | Check authenticated Admin context, candidate status, public/ownerless boundary, receipt linkage, and filter/paging. Do not query public APIs as a substitute. |
| Candidate unexpectedly public | Stop immediately. Capture sanitized evidence, prevent further transitions, and investigate the published+public+ownerless boundary. |
| Preview Publish/primary failure | Reload canonical preview state, resolve structured validation, ensure one published primary, then retry the accepted action. |
| Repeat Publish/Reject conflict | Reload canonical state; a completed terminal transition is not retried as a new action. |

Never use destructive SQL, direct SQL ingestion, hard deletion, automatic merge/publication, or a new lifecycle state as troubleshooting.
