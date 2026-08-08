# FigColor WP-B1 — Shared Candidate Aggregate Service Implementation Record

**Status:** Complete

**Scope:** Shared Candidate persistence extraction and offline characterization only

**Architecture:** [WP-B0 contract](figcolor-online-admin-image-palette-assistant-wp-b0-contract.md)

## 1. Preflight

WP-B1 began on `main` at `99d70b9`, equal to `main` and `origin/main`. The only initial worktree changes were the intentional untracked WP-B0 Go package and Plan/contract files. No applicable `AGENTS.md` exists. Direct raw inspection confirmed that repository Markdown was valid; attachment escaping did not affect repository files.

## 2. Production call path before extraction

```text
POST /api/admin/palette-candidates
  → IngestionHandler.IngestCandidate
  → strict canonical request decode and IngestionService.Ingest
  → prepareIngestion
      offline metadata/evidence validation
      canonical normalized-content hash verification
      Palette/color/applicability/Preview validation
  → IngestionRepository.ClaimOrRecover
      idempotency, proposal/content duplicate, replay/recovery classification
  → IngestionService.runAggregate
  → sqlIngestionAggregateFactory.BeginAggregate (opens sql.Tx)
  → Repository.CreateCandidateTx
  → Repository.CreatePreviewCaseTx (zero or more)
  → construct offline ingestionReceipt
  → IngestionRepository.BindSuccessTx
  → sql.Tx.Commit
```

The ingestion service owned commit/rollback and ambiguous-outcome recovery. Candidate, draft non-primary Preview Cases, and succeeded ingestion linkage were in the same SQL transaction. Claim creation occurred before the aggregate transaction and was marked failed or recovered by existing orchestration after rollback.

## 3. Characterized behavior and baseline

Before production extraction, `candidate_aggregate_characterization_test.go` froze the offline adapter's successful write sequence and canonical values: Candidate status; offline `curated` source; provisional color IDs and contiguous order; authored chart applicability; Preview role references; stable seed behavior; normalized-content hash and request fingerprint in the receipt; ingestion binding; and one commit with no rollback. Existing service tests already characterized validation-before-claim, exact/replay classification, rollback/error translation, bind failure, panic safety, retries, checkpoints, receipts, and ambiguous recovery.

The pre-extraction focused baseline passed:

```text
go test ./internal/palette -run 'TestOfflineCandidateAggregateCharacterization|TestIngestionService' -count=1
```

PostgreSQL-backed tests additionally cover runtime row counts, Palette/Preview/ingestion linkage, failures after Palette or Preview insertion, bind rejection, stale recovery, ambiguous commit/rollback, HTTP replay, and Admin visibility. They require `FIGCOLOR_INGESTION_TEST_DSN`; that variable was unavailable during WP-B1, so those tests were skipped rather than claimed as executed runtime evidence.

Chart applicability is JSON persisted on the Palette insert, not a separate repository write. An applicability failure therefore occurs during pre-write validation or Candidate Palette insertion; there is no independent applicability record that can partially persist.

## 4. Extracted boundary

The shared service is `palette.CandidateAggregateService` in `backend/internal/palette/candidate_aggregate.go`. The Palette package already owns Palette and Preview domain models, validators, repositories, and transaction adapters; placing the service there avoids transport, ingestion, Assistant, HTTP, and frontend dependencies.

Its canonical input contains exactly:

```text
CandidateAggregateInput
├── Palette CandidatePaletteInput
├── PreviewCases []CreatePreviewCaseRequest
└── ActorUserID
```

`CandidatePaletteInput` is a dedicated canonical domain type that excludes owner, visibility, origin, status, creator, and timestamps as well as entry-specific data. The shared service supplies Candidate status and the existing repository primitive supplies public/curated/ownerless persistence invariants. Preview requests remain repository-domain write models. The shared input contains no proposal, package, path, filename, image, checkpoint, offline/online receipt, revision, acknowledgment, browser, or HTTP fields. The result contains the created Palette ID/slug and ordered Preview Case IDs.

`CandidateAggregateService.Create` validates and clones canonical colors and Preview data, verifies color IDs/order/HEX/RGB, validates every Preview role against those persisted color identities, writes the Candidate Palette, writes each draft Preview Case, and returns identifiers. It propagates the first failure without continuing.

Existing offline provisional color IDs are preserved exactly because that behavior participates in offline hashes, Preview references, and receipts. This characterization does not make future browser Draft IDs authoritative. A future online adapter must resolve Draft IDs to server-authoritative formal IDs before constructing shared canonical input.

## 5. Transaction ownership and atomic ingestion linkage

`CandidateAggregateService` receives `CandidateAggregateTx`, a narrow caller-owned writer with no `Commit` or `Rollback`. The offline `IngestionService` still:

1. claims/recover-classifies the offline operation;
2. opens the SQL transaction through `ingestionAggregateFactory`;
3. calls the shared service using that transaction writer;
4. constructs the unchanged offline receipt;
5. calls `BindSuccessTx` on the same transaction;
6. commits, rolls back, marks failure, or resolves ambiguity using the existing logic.

Thus one transaction still yields the complete Candidate + Preview Cases + succeeded ingestion linkage, or no partial aggregate. Offline claim/checkpoint/retry state remains outside the shared service without weakening atomic linkage.

## 6. Responsibility boundary

The shared service owns canonical aggregate reference safety, Candidate Palette persistence orchestration, ordered colors already resolved by the adapter, chart applicability as Palette data, required draft Preview persistence, stable created identifiers, and failure propagation.

The offline adapter retains canonical ingestion decoding, source/proposal identities, validation evidence, normalized-content hash and request fingerprint, claim/replay/duplicate/recovery decisions, ingestion record metadata, receipt construction, bind/error translation, retryability, checkpoints, and commit/rollback ownership.

No second aggregate orchestration remains in production: `IngestionService.runAggregate` delegates Palette/Preview creation to `CandidateAggregateService.Create`; repository `CreateCandidateTx` and `CreatePreviewCaseTx` remain narrow primitive writes used by the transaction adapter.

## 7. Verification and limitations

New service tests cover canonical write order/result, defensive cloning, Candidate and Preview failure propagation, unresolved Preview color rejection before any write, and absence of entry-specific shared input fields. The pre-extraction characterization test is retained as a regression test and passes through the extracted path.

The in-memory writer tests prove orchestration and failure propagation, not SQL rollback. Existing PostgreSQL tests are the runtime transactional evidence, but were skipped locally because `FIGCOLOR_INGESTION_TEST_DSN` was not configured. No new database framework or migration was introduced.

Maintenance note: shared aggregate validation currently calls the existing pure Preview domain method through `(&Service{}).validatePreviewCaseCandidate(...)`. This is safe with the current implementation because that method uses no `Service` fields, but the call is structurally brittle if dependencies are added later. A future Preview-domain maintenance change should extract an explicit package-level validator or inject a formally constructed validator into `CandidateAggregateService`. This is not WP-B2 work and does not change the accepted WP-B1 boundary.

## 8. Deferred work

- WP-B2: production image decoding and deterministic extraction.
- WP-B3: rule-based suggestions.
- WP-B4: browser-local Admin Draft workbench.
- WP-B5: Draft Preview integration and the focused Preview database registry drift prerequisite.
- WP-B6: strict online decoding, Draft mapping, validation receipts/findings, online duplicate/idempotency policy, handlers, and online Candidate adapter.

WP-B1 adds no decoder, extraction, suggestion logic, UI, online handler, signing, online idempotency, migration, Publish/Reject transition, offline contract/schema/artifact change, or Admin Review behavior change.
