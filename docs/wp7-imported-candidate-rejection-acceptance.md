# WP7 Imported Candidate Rejection Acceptance

The focused Reject contract is:

```text
succeeded ingestion record + candidate/public/ownerless
→ Admin-only POST /api/admin/palettes/:id/reject
→ archived/public/ownerless
```

`archived` is the existing terminal palette status. No `rejected` status, reason schema, hard deletion, general Archive UI, Unpublish, Republish, or audit subsystem is introduced. Reject is imported-candidate-only: a succeeded `palette_ingestion_records` row bound to the palette is required.

The service starts a transaction, locks and rereads the palette with `FOR UPDATE`, checks ownership/status and succeeded ingestion identity, archives linked active preview cases while clearing the primary flag, conditionally archives the palette, rereads the canonical result, and commits. Palette ID, ingestion record, immutable receipt/source hashes, authored applicability, and preview rows/FKs remain intact. Any failure rolls back both palette and preview changes.

Publish and Reject lock the same palette row. Concurrent Reject/Reject and Publish/Reject tests prove exactly one transition succeeds and the loser receives a typed conflict. Public APIs remain restricted to `published + public + ownerless`, so candidates are non-public before rejection and archived results remain non-public.

Frontend Reject eligibility requires the Admin-only eligibility endpoint to confirm an imported canonical candidate. Publish and Reject share one coordinator scoped to the mounted Admin palette form. Each controller acquires that lock synchronously before its first `await` and before confirmation; the coordinator is authoritative across both actions while the existing controller-local guards remain as same-action protection. Publish→Reject and Reject→Publish same-tick executable tests each prove one confirmation and one transition request, with the competing attempt returning `duplicate`. The common `finally` release is exercised for cancellation, successful Publish, successful Reject, failed Publish, failed Reject, successful lost-response reconciliation, and failed reconciliation. The form observes the coordinator immediately, so the competing button is disabled throughout confirmation and request windows.

After a successful Reject response or canonical `archived` lost-response reconciliation, the controller awaits the form's canonical application callback. That callback reloads the full Admin preview-case aggregate with archived rows included; a failed load clears the local list through the existing loader. Therefore pre-Reject `published` or primary preview state cannot remain locally visible or actionable after Reject completes. Executable controller coverage proves both direct and reconciled Reject wait for this preview reconciliation, while the Admin form behavior test verifies the shared coordinator and reload wiring.

The injected PostgreSQL failure fixture now creates, publishes, and makes primary a real preview case before Reject. A trigger fails the later palette update after the preview update statement. Post-failure assertions compare the full pre-transition aggregate: palette remains `candidate` with null `archived_at`; the preview row remains `published`, primary, and linked to the same palette; and ingestion record ID, palette linkage, and receipt are unchanged. This directly proves palette and earlier preview mutations roll back in one transaction.

Executable evidence includes frontend controller behavior, API/handler tests, guarded PostgreSQL ingestion/publication/rejection integration, concurrency and injected rollback, full frontend/backend regressions, and clean-checkout verification. The commands and final results for this closure checkpoint are recorded after execution below. Admin list/detail assertions in PostgreSQL tests are service/database integration, not browser UI E2E.

## WP7 closure verification

The closure checkpoint passed `npm test` (all registered frontend behavior modules, including Publication, Rejection, shared-transition and Admin editor coverage), `npm run build`, and `npm run test:palette-ingest` (94/94). The first ingestion attempt inside the filesystem sandbox reached 93/94 because its redirect test could not bind `127.0.0.1` (`EPERM`); the permitted rerun passed 94/94. `go test ./internal/palette -count=1` and `go test ./... -count=1` passed. The guarded fresh PostgreSQL aggregate harness (`backend/migrations/test_candidate_publication.sh`) passed all three stages: ingestion integration (10.143s), Candidate Publication (0.343s), and Candidate Rejection (0.334s). The Rejection stage includes Reject/Reject and Publish/Reject concurrency, ingestion/receipt/applicability preservation, public exclusion, manually created candidate exclusion, and the strengthened aggregate rollback test. A clean-checkout rerun is recorded in the final checkpoint handoff after committing.

Manual browser acceptance remains not run because the prior browser-runtime limitation remains. WP8, deployment, bulk operations, general Archive, Unpublish, Republish, and hard deletion remain excluded.
