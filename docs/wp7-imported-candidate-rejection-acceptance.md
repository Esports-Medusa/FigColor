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

Frontend Reject eligibility requires the Admin-only eligibility endpoint to confirm an imported canonical candidate. A controller-local synchronous lock is acquired before confirmation, dirty forms are ineligible, conflicting Publish/Reject actions disable each other, structured errors are retained, and uncertain responses reconcile through canonical Admin detail before success is claimed.

Executable evidence includes frontend controller behavior, API/handler tests, guarded PostgreSQL ingestion/publication/rejection integration, concurrency and injected rollback, full frontend/backend regressions, and clean-checkout verification. Admin list/detail assertions in PostgreSQL tests are service/database integration, not browser UI E2E.

Manual browser acceptance remains not run because the prior browser-runtime limitation remains. WP8, deployment, bulk operations, general Archive, Unpublish, Republish, and hard deletion remain excluded.
