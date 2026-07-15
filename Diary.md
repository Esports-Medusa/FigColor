# Decision Diary

This file records project decisions and the reasons behind them. Add a new entry whenever we make a choice that may affect future implementation, product behavior, maintenance, or user experience.

## Entry Template

```md
## YYYY-MM-DD - Decision Title

- Decision:
- Context:
- Reason:
- Alternatives considered:
- Trade-offs:
- Follow-up:
```

## 2026-07-07 - Start Decision Diary

- Decision: Add `Diary.md` at the project root as the shared place to record decision rationale.
- Context: The project already has planning and development notes, but decisions can become hard to reconstruct later.
- Reason: Keeping decision reasons close to the codebase helps future contributors understand why a direction was chosen, not only what changed.
- Alternatives considered: Use README or existing docs, but those files already serve broader documentation purposes.
- Trade-offs: This adds one more file to maintain, but keeps decision history focused and easy to scan.
- Follow-up: Add new entries whenever a meaningful technical or product decision is made.

## 2026-07-07 - Vite and Vue Plugin Version Compatibility

- Decision: Use `@vitejs/plugin-vue` `^6.0.7` with `vite` `^8.0.16` in `devDependencies`.
- Context: The frontend build stack depends on Vite and the Vue plugin working as a compatible pair.
- Reason: Keeping the Vue plugin on the matching major generation reduces compatibility risk with Vite 8 APIs and avoids build/dev-server issues caused by an older plugin version.
- Alternatives considered: Keep `@vitejs/plugin-vue` on `^5.0.0`, but that leaves the project on a plugin generation intended for older Vite versions.
- Trade-offs: Upgrading the plugin may require refreshing `package-lock.json` and local `node_modules` with `npm install`.
- Follow-up: After dependency installation, run `npm run build` or `vue-tsc --noEmit` to catch any API or type compatibility issues.

## 2026-07-08 - Separate Palette Data from Chart-Specific Preview Cases

- Decision: Keep existing palette fields as the canonical source of palette metadata and colours. Introduce structured chart type applicability and separate chart-specific preview cases. Each preview case will contain its own chart type, color role mapping, preview configuration, deterministic mock-data settings, and renderer selection.
- Context: The scientific preview system initially planned to place `chart_family`, `functional_roles`, `preview_template`, `exported_core_colors`, and `copy_blocks` directly on each palette. That would tightly couple a palette to one preview structure, even though the same palette may suit several chart types and require different colour assignments in different scientific visualisation contexts.
- Reason: A palette describes a reusable colour resource, while a preview describes one concrete use of that palette. Separating these concerns preserves existing palette information, supports multiple chart types per palette, allows chart-specific role mapping, and makes future chart types easier to add without redesigning the palette schema. `palette.colors` remains the canonical colour source, and preview roles reference colours through `color_id`.
- Alternatives considered:
  1. Store one `chart_family` and one `functional_roles` object directly on each palette.
  2. Redesign every palette record around a single chart type.
  3. Store separate hex values inside each role mapping.
  4. Store generated `exported_core_colors` and full `copy_blocks` as independently editable database fields.
- Trade-offs: The design introduces a `palette_preview_cases` entity and more validation logic. Admin editing becomes slightly more complex because chart applicability, color roles, and preview configuration must be managed separately. However, it avoids schema duplication, prevents palette data from being locked to one renderer, and provides a scalable path for future chart types.
- Follow-up:
  1. Update `figcolor-scientific-preview-system-plan.md` to use the new architecture.
  2. Add `chart_applicability` to palette data.
  3. Create a `palette_preview_cases` database table.
  4. Build a chart type registry.
  5. Implement `bar_error` as the first complete vertical slice.
  6. Generate `exported_core_colors` and copy blocks from palette colours and color role mappings instead of maintaining them as separate editable sources.

## 2026-07-10 - Non-Blocking Follow-Up: Tighten Bar Error Replacement Archive Controls

- Decision: Record a non-blocking UX follow-up for the `bar_error_v1` admin replacement workflow.
- Context: In `editing_unsaved_revision`, `replacing_published`, and `replacement_create_failed` modes, the ordinary Archive action may still be visible and clickable. An admin could therefore archive the source published preview separately instead of using the dedicated replacement confirmation path.
- Reason: The retained local revision is not lost, and replacement archive behavior is expected to be idempotent, so this is not a WP4C blocker. Still, hiding or disabling the ordinary Archive action in these modes would reduce accidental lifecycle actions and keep the replacement flow clearer.
- Alternatives considered: Leave the current behavior as-is for WP4C because it is functionally safe; immediately patch the editor controls, but that would expand the current request beyond recording the follow-up.
- Trade-offs: Deferring keeps the current lifecycle correction scope stable, while leaving a small UX footgun to address later.
- Follow-up: Disable or hide ordinary Archive when `mode === 'editing_unsaved_revision'`, `mode === 'replacing_published'`, or `mode === 'replacement_create_failed'`.

## 2026-07-14 - Repository Hygiene and Dependency Baseline

### Context

This entry records the repository hygiene pass performed after WP4 final acceptance and regression audit. The goal was to separate intentional WP1-WP4 implementation work from dependency churn, generated artifacts, tracked `node_modules` changes, backend migrations, and unresolved local changes.

This pass intentionally avoided product features, new chart types, new APIs, UI redesign, schema changes, unrelated refactors, commits, pushes, history rewrites, and broad destructive cleanup commands.

### Initial Repository State

Initial branch state:

- Branch: `main`
- Remote tracking: up to date with `origin/main`
- Tracked modified/deleted files: 30 paths
- Untracked files/directories: 51 paths
- `git diff --stat`: 6042 insertions, 7187 deletions across tracked files
- Tracked `node_modules` files: 1337
- Tracked migrations before this work: `001_init.sql` through `011_add_avoid_case.sql`
- Files present in `backend/migrations`: tracked `001`-`011` plus untracked `012`-`015`
- Recent commit history: one visible commit, `4e51445 Descriptive commit message`
- `.gitignore`: absent before this pass

Important tracked changes at the start:

- WP preview/backend/frontend implementation files were modified or untracked.
- `package.json` had a new `test` script and a dependency range change for `@vitejs/plugin-vue`.
- `package-lock.json` had the matching plugin-vue lockfile upgrade.
- Several tracked files under `node_modules` were modified or deleted by dependency installation.
- `dist` was clean at the start of this maintenance pass because WP4 generated assets had already been restored/removed.

### Actions Performed

1. Captured repository state with:
   - `git status --short`
   - `git status --branch`
   - `git diff --stat`
   - `git diff --name-status`
   - `git diff -- package.json package-lock.json .gitignore`
   - `git ls-files node_modules | sed -n '1,120p'`
   - `git ls-files node_modules | wc -l`
   - `git ls-files 'backend/migrations/*'`
   - `find backend/migrations -maxdepth 1 -type f | sort`
   - `git log --oneline -10`
   - `git diff --name-only`
   - `git ls-files --others --exclude-standard`
2. Inspected the Phase 1 scientific preview plan and the existing root `Diary.md` decision convention.
3. Initially restored `package-lock.json` and tracked `node_modules` to test whether the committed dependency baseline was sufficient.
4. Ran a temporary-directory `npm ci` reproducibility check. It failed with a peer dependency conflict between Vite 8.0.16 and `@vitejs/plugin-vue` 5.2.4.
5. Re-applied the dependency baseline change to `@vitejs/plugin-vue` `^6.0.7` with `npm install @vitejs/plugin-vue@^6.0.7`.
6. Kept the intentional `npm test` script in `package.json`.
7. Added a minimal `.gitignore` for future generated/dependency noise.
8. Cleaned generated `dist` churn after validation.
9. Left all WP source files, backend migrations, backend source files, and unknown local files untouched.

### Decision Table

| Decision | Outcome | Reason |
|---|---|---|
| Vite version | Kept `^8.0.16` / installed `8.0.16` | Existing root dependency; tests, typecheck, build, and temp `npm ci` pass with plugin-vue 6 |
| `@vitejs/plugin-vue` version | Kept changed baseline `^6.0.7` / installed `6.0.7` | Plugin-vue 5.2.4 peer range excludes Vite 8 and causes `npm ci` failure |
| `package-lock.json` | Updated / retained | Lockfile now matches package manifest and passes temp `npm ci` |
| Tracked `node_modules` | Preserved temporarily | 1337 files are tracked; untracking is a separate repository policy change |
| `dist` | Restored after build | `dist` is tracked historically and build hashes create churn |
| Backend migrations | Preserved / unresolved | `013`-`015` are referenced by current code/tests; `012` needs production-intent review |

### Decision: Keep the WP test script in `package.json`

**Reason:** The test runner is part of the WP validation surface and was used by WP4 acceptance.

**Evidence:**

- `package.json` now includes `"test": "node scripts/run-tests.mjs"`.
- `scripts/run-tests.mjs` is present as an untracked WP test harness.
- `npm test` passed during WP4 audit.

**Alternatives considered:**

- Remove the `test` script to match the committed manifest exactly.
- Leave all manifest changes untouched.

**Consequences:**

- Reviewers can run the WP frontend regression suite with a standard `npm test` command.
- The manifest diff is limited to an intentional script addition.

**Revisit when:**

- The project adopts a different formal test runner or moves frontend tests into a framework-specific command.

### Decision: Keep `@vitejs/plugin-vue` at `^6.0.7`

**Reason:** The committed `@vitejs/plugin-vue` 5.x baseline is not reproducible with the current Vite 8 dependency. A temporary `npm ci` check failed with a peer dependency conflict. The `^6.0.7` baseline matches Vite 8's peer range, installs cleanly, and passes validation.

**Evidence:**

- Committed `package.json` uses `@vitejs/plugin-vue` `^5.0.0`.
- Committed `package-lock.json` resolves `@vitejs/plugin-vue` `5.2.4`.
- `npm ci` in `/private/tmp/figcolor-npmci.bVyip1` with the 5.x baseline failed with `ERESOLVE could not resolve`; plugin-vue 5.2.4 requires peer `vite@"^5.0.0 || ^6.0.0"` while the project uses Vite 8.0.16.
- `npm install @vitejs/plugin-vue@^6.0.7` completed successfully.
- `npm ls vite @vitejs/plugin-vue vue typescript --depth=0` reports Vite 8.0.16, plugin-vue 6.0.7, Vue 3.5.34, and TypeScript 5.9.3 without dependency errors.
- A second temporary `npm ci` with the 6.0.7 lockfile passed.
- `npm test`, `vue-tsc --noEmit`, `npm run build`, and backend `go test ./...` passed.
- The root `Diary.md` contains a prior compatibility decision favoring 6.0.7, and this pass confirmed it with reproducibility evidence.

**Alternatives considered:**

- Restore `@vitejs/plugin-vue` to `^5.0.0`; rejected because `npm ci` fails.
- Keep `@vitejs/plugin-vue` `^6.0.7` but restore tracked `node_modules`; rejected because the installed dependency tree would no longer match the manifest baseline in a repository that currently tracks `node_modules`.
- Perform a broader dependency upgrade; rejected because this work package is not a general upgrade.

**Consequences:**

- The dependency baseline includes an intentional manifest and lockfile change.
- Because `node_modules` is tracked, the dependency baseline also produces a seven-file tracked `node_modules` diff for plugin-vue package contents.
- The project requires Node compatible with plugin-vue 6.0.7's engine range: `^20.19.0 || >=22.12.0`.

**Revisit when:**

- Vite is downgraded, plugin-vue publishes a new compatible major, or a dedicated dependency-upgrade work package is opened.

### Decision: Preserve tracked `node_modules` temporarily

**Reason:** `node_modules` is already tracked in the repository, and untracking 1337 files would be a large repository policy change. Option A was chosen: preserve tracked `node_modules` temporarily, keep tracking policy unchanged, and record a follow-up to untrack it separately. The remaining `node_modules` diff is intentional dependency-vendor churn caused by the required plugin-vue 6 baseline, not unrelated source work.

**Evidence:**

- `git ls-files node_modules | wc -l` reported 1337 tracked dependency files.
- `git log --oneline -- node_modules | head -20` shows the current history contains `4e51445 Descriptive commit message`, so vendored dependencies exist in repository history.
- `git check-ignore -v node_modules node_modules/.package-lock.json || true` produced no output because tracked files are not treated as ignored by default.
- `git check-ignore -v --no-index node_modules node_modules/.package-lock.json || true` confirms the new `.gitignore` rule would ignore future untracked `node_modules` paths.
- Final `git diff --stat -- node_modules` shows seven tracked plugin-vue-related paths changed after the intentional dependency install.

**Alternatives considered:**

- Option A: preserve tracked `node_modules` temporarily and keep the dependency-vendor diff that matches the required manifest baseline.
- Option B: stop tracking `node_modules` with `git rm -r --cached node_modules`; rejected because this would create a large unrelated policy diff and should be its own review.

**Consequences:**

- The repository remains internally consistent for the chosen dependency baseline.
- Reviewers will still see a small tracked `node_modules` diff for plugin-vue 6.
- A future dedicated hygiene commit is still recommended to remove vendored dependencies from the Git index.

**Revisit when:**

- The project agrees to stop tracking `node_modules`; then run a focused untracking change such as `git rm --cached -r node_modules` and review it separately.

### Decision: Add a minimal `.gitignore`

**Reason:** The repository had no `.gitignore`, allowing generated dependency/build noise to reappear as untracked files.

**Evidence:**

- `.gitignore` was absent before this pass.
- WP4 build generated new `dist/assets` files that had to be manually removed.
- Dependency installation changed tracked and generated files under `node_modules`.

**Alternatives considered:**

- Do not add `.gitignore`.
- Add a broad template covering many editors, operating systems, and language tools.

**Consequences:**

- Future untracked `node_modules`, `dist`, and common npm log noise are ignored.
- Already tracked files are not affected by `.gitignore`.

**Revisit when:**

- The project adds new build outputs, coverage reports, or tool caches.

### Decision: Leave backend migrations and untracked backend files untouched

**Reason:** Their ownership and intent are tied to WP1-WP4 implementation work, and this pass was not allowed to discard user work or alter migrations unless confirmed accidental.

**Evidence:**

- Existing tracked migrations are `001`-`011`.
- Current filesystem also contains untracked `012_seed_test_users.sql`, `013_persist_palette_color_ids.sql`, `014_add_chart_applicability.sql`, and `015_create_palette_preview_cases.sql`.
- Backend preview-case source and tests are untracked but required by the WP preview implementation.

**Alternatives considered:**

- Delete or restore untracked migrations.
- Rename or renumber migrations.
- Stage all backend files as intentional.

**Consequences:**

- Backend WP implementation remains intact.
- Migration ownership remains visible for review instead of being silently changed.

**Revisit when:**

- A reviewer confirms which migrations are intentional and whether `012_seed_test_users.sql` belongs in production migration history.

### Dependency Baseline

Current dependency baseline after cleanup:

- `package-lock.json`: updated to match the intentional plugin-vue 6 baseline.
- `@vitejs/plugin-vue`: `^6.0.7` in `package.json`, resolved as `6.0.7` in `package-lock.json`.
- `vite`: `^8.0.16`.
- `vue-tsc`: `^2.0.0`.
- `typescript`: `^5.3.0`.
- `vue`: `^3.4.0`.
- `vue-router`: `^4.3.0`.
- New script retained: `"test": "node scripts/run-tests.mjs"`.

### Tracked node_modules Decision

Decision option chosen: **Option A - Preserve tracked `node_modules` temporarily**.

`node_modules` remains tracked because untracking 1337 files would be a large repository policy change. This pass added `.gitignore` to prevent future untracked dependency noise, but it did not remove already tracked files from the index. The remaining tracked `node_modules` diff corresponds to the required plugin-vue 6 dependency baseline.

Recommended future boundary:

1. Open a dedicated dependency/vendor hygiene change.
2. Decide whether this repository should track `node_modules`.
3. If not, remove it from the index in that dedicated change and keep it ignored.

### Backend Migration and Untracked File Audit

Migration audit:

| Path | Classification | Action |
|---|---|---|
| `backend/migrations/001_init.sql` - `011_add_avoid_case.sql` | Existing tracked migrations | Left untouched |
| `backend/migrations/012_seed_test_users.sql` | E. Backend migration / unresolved production intent | Left untouched |
| `backend/migrations/013_persist_palette_color_ids.sql` | E. Backend migration / WP color ID work | Left untouched |
| `backend/migrations/014_add_chart_applicability.sql` | E. Backend migration / WP applicability work | Left untouched |
| `backend/migrations/015_create_palette_preview_cases.sql` | E. Backend migration / WP preview-case work | Left untouched |

Migration details:

| Migration | Purpose | Referenced by current WP code/tests | Duplicate numbering | Tracked | Applied locally |
|---|---|---:|---:|---:|---|
| `012_seed_test_users.sql` | Seeds local development test users with password `test1234` | Not found in WP preview code references | No duplicate number found | No | Not verified |
| `013_persist_palette_color_ids.sql` | Backfills stable `palettes.colors[].id` values so preview color roles can use `color_id` | Yes, backend validation and preview-case tests rely on stable palette color IDs | No duplicate number found | No | Not verified |
| `014_add_chart_applicability.sql` | Adds `palettes.chart_applicability` JSONB column | Yes, backend model/repository/validation reference `chart_applicability` | No duplicate number found | No | Not verified |
| `015_create_palette_preview_cases.sql` | Creates `palette_preview_cases` table, constraints, and indexes | Yes, preview-case repository/service/tests query `palette_preview_cases` | No duplicate number found | No | Not verified |

Reverting `013`-`015` would break current backend code paths that read/write stable color IDs, chart applicability, and preview cases. `012` appears to be local development data and remains unresolved.

Changed and untracked file classification:

| Classification | Paths / Summary | Action |
|---|---|---|
| A. Intentional WP1-WP4 source change | `src/components/palettes/PaletteChartPreview.vue`, `PaletteChartPreview.logic.ts`, preview integration/tests, `src/lib/chart-types/**`, `src/lib/renderers/**`, deterministic helpers, palette color/reference helpers, exports, admin preview UI | Left untouched |
| B. Dependency manifest or lockfile change | `package.json`, `package-lock.json` | Kept `test` script and plugin-vue 6 baseline; lockfile updated |
| C. Tracked `node_modules` change | 7 dirty paths under `node_modules` after final dependency install; 1337 tracked dependency files total | Preserved temporarily as dependency-vendor diff |
| D. Generated build artifact | `dist/**` tracked historical assets; WP4 generated assets previously removed | Left clean; added `.gitignore` |
| E. Backend migration or backend source change | `backend/internal/palette/*.go`, preview-case backend files/tests, migrations `012`-`015` | Left untouched |
| F. Documentation or plan change | `docs/figcolor-scientific-preview-system-plan.md`, `README.md`, root `Diary.md`, this diary | Left existing docs untouched; added this diary |
| G. Unknown / requires user decision | `Diary.md` untracked status and whether `012_seed_test_users.sql` belongs in production migration history | Left untouched and recorded |

### Validation Evidence

Validation was run after cleanup because the dependency baseline changed.

Results:

| Command | Result | Evidence |
|---|---|---|
| `node --version` | Passed | `v24.15.0` |
| `npm --version` | Passed | `11.12.1` |
| `go version` | Passed | `go version go1.26.3 darwin/arm64` |
| `npm ls vite @vitejs/plugin-vue vue typescript --depth=0` | Passed | Vite 8.0.16, plugin-vue 6.0.7, Vue 3.5.34, TypeScript 5.9.3 |
| `npm explain vite` | Passed | Vite 8.0.16 is a root dev dependency |
| `npm explain @vitejs/plugin-vue` | Passed | plugin-vue 6.0.7 is a root dev dependency |
| Temporary `npm ci` with 5.x plugin baseline | Failed as expected | `ERESOLVE`; plugin-vue 5.2.4 peer range does not include Vite 8 |
| Temporary `npm ci` with 6.0.7 plugin baseline | Passed | Added 54 packages, audited 55 packages, found 0 vulnerabilities |
| `npm test` | Passed | All 12 frontend test modules reported `ok` |
| `./node_modules/.bin/vue-tsc --noEmit` | Passed | Command exited successfully with no diagnostics |
| `npm run build` | Passed | Vite built successfully with `@vitejs/plugin-vue` 6.0.7 |
| `go test ./...` from `backend/` | Passed | Backend packages passed; palette package reported `ok` |

Generated build cleanup:

- `npm run build` rewrote tracked `dist` files and produced new hashed assets.
- Tracked `dist` files were restored.
- The generated ignored assets `index-B-fuSchr.js` and `index-BejFsKOd.css` were removed.
- Final `dist/assets` contains only the tracked baseline assets: `index-C-x0xMSm.css` and `index-CdCsfwbg.js`.

### Remaining Risks and Unresolved Items

- `node_modules` is still tracked by Git. This is intentionally not solved in this pass because it should be reviewed as a separate repository policy change.
- The current dependency baseline requires `@vitejs/plugin-vue` `^6.0.7` for reproducible Vite 8 installs.
- `backend/migrations/012_seed_test_users.sql` may be test/development data. It was not modified because its intent was not confirmed.
- Many WP implementation files remain untracked. That is expected for the current work-in-progress state, but they should be committed in clear boundaries.
- `dist` is tracked historically even though `.gitignore` now ignores future generated `dist` output. A future policy change should decide whether built assets belong in the repository.

### Final Repository State

After cleanup:

- `package-lock.json`: modified intentionally for plugin-vue 6.0.7.
- `node_modules`: modified intentionally for the tracked plugin-vue 6 vendor baseline.
- `dist`: clean.
- `package.json`: modified for the intentional `test` script and plugin-vue 6.0.7 baseline.
- `.gitignore`: added.
- WP source/backend/docs changes: preserved.
- Backend migrations `012`-`015`: preserved and untracked.
- Final focused status for hygiene paths: `package.json`, `package-lock.json`, and seven plugin-vue-related `node_modules` paths modified; `.gitignore` untracked; `dist` clean.

### Recommended Commit Boundaries

1. **Repository hygiene baseline**
   - `.gitignore`
   - `Diary.md`

2. **Dependency baseline**
   - `package.json`
   - `package-lock.json`
   - `node_modules/.package-lock.json`
   - `node_modules/@vitejs/plugin-vue/**`

3. **Backend preview persistence and validation**
   - Backend palette source changes
   - Preview-case backend files/tests
   - Confirmed backend migrations

4. **Frontend preview pipeline and admin integration**
   - Palette normalization/types/schema changes
   - Chart-type registry and validation
   - Admin preview editor/API helpers
   - Public preview component integration

5. **Renderer implementation and tests**
   - Deterministic helpers
   - Renderer files
   - Renderer tests

6. **Documentation updates**
   - Scientific preview system plan
   - README updates
   - Root diary updates

Actual path groups from the current worktree:

| Proposed group | Paths |
|---|---|
| Repository hygiene baseline | `.gitignore`, `Diary.md` |
| Dependency baseline | `package.json`, `package-lock.json`, `node_modules/.package-lock.json`, `node_modules/@vitejs/plugin-vue/dist/index.cjs`, `node_modules/@vitejs/plugin-vue/dist/index.d.cts`, `node_modules/@vitejs/plugin-vue/dist/index.d.mts`, `node_modules/@vitejs/plugin-vue/dist/index.d.ts`, `node_modules/@vitejs/plugin-vue/dist/index.mjs`, `node_modules/@vitejs/plugin-vue/package.json` |
| Backend preview persistence and validation | `backend/internal/palette/handler.go`, `model.go`, `repository.go`, `service.go`, preview-case backend files/tests, `validation.go`, `validation_test.go`, migrations `013`-`015`; review `012_seed_test_users.sql` separately |
| Frontend preview pipeline and admin integration | `src/App.vue`, `src/api/admin.ts`, `src/components/PaletteCard.vue`, `src/components/palettes/PaletteChartPreview.vue`, `src/components/palettes/PaletteChartPreview.logic.ts`, `src/components/palettes/PaletteChartPreview.test.ts`, `src/components/palettes/PalettePreviewIntegration.test.ts`, `src/components/admin/previews/**`, `src/lib/api/**`, palette schema/type/helper changes, public/admin view changes |
| Renderer implementation and tests | `scripts/run-tests.mjs`, `src/lib/chart-types/**`, `src/lib/deterministic/**`, `src/lib/renderers/**`, renderer/chart-type tests |
| Exports and docs | `src/lib/exports/**`, `README.md`, `docs/figcolor-scientific-preview-system-plan.md`, root `Diary.md` |

## 2026-07-14 - Repository Policy and Commit Plan

### Context

This entry supersedes the unresolved repository-policy items from the repository hygiene baseline. The project now uses the root `Diary.md` as the single decision diary; no `docs/diary` file is maintained.

This pass resolved three policy questions:

1. Whether `node_modules` should remain tracked.
2. Whether `dist` should remain tracked.
3. Whether `backend/migrations/012_seed_test_users.sql` belongs in the production migration chain.

No commits or pushes were performed.

### Initial State

Captured state:

- `node_modules` tracked files before policy change: 1337.
- `dist` tracked files before policy change: 3.
- Tracked migrations before policy change: `001`-`011`.
- Untracked migrations before policy change: `012_seed_test_users.sql`, `013_persist_palette_color_ids.sql`, `014_add_chart_applicability.sql`, `015_create_palette_preview_cases.sql`.
- `git log --oneline -- node_modules | head -20`: only `4e51445 Descriptive commit message`.
- `git log --oneline -- dist | head -20`: only `4e51445 Descriptive commit message`.
- `git log --oneline -- backend/migrations/012_seed_test_users.sql`: no history because the file was untracked.
- `.gitignore` already contains `node_modules/` and `dist/`.
- `npm ci` passes with `package.json` and `package-lock.json`.

### Decision 1: node_modules Tracking Policy

**Decision:** Stop tracking `node_modules`.

**Reason:** No explicit vendoring policy exists, `package.json` and `package-lock.json` are the dependency source of truth, and `npm ci` reproducibly restores dependencies. Tracking `node_modules` creates large platform-specific churn and made a small dependency baseline update appear as vendor-file noise.

**Evidence:**

- 1337 files were tracked under `node_modules`.
- `.gitignore` contains `node_modules/`.
- `npm ci` passed after untracking.
- `npm test`, `vue-tsc --noEmit`, and `npm run build` passed after untracking.
- `git ls-files node_modules | wc -l` now reports `0`.
- Local directory still exists: `test -d node_modules` passed.

**Alternatives considered:**

- Keep tracked temporarily. Rejected because no repository evidence showed intentional vendoring, and the dependency baseline is reproducible.
- Keep only plugin-vue vendor files. Rejected because this would create a confusing partial-vendor policy.

**Consequences:**

- The dedicated policy commit will show 1337 tracked dependency files removed from the Git index.
- Local `node_modules` remains available but ignored.
- Future dependency changes should review only `package.json` and `package-lock.json`.

**Revisit trigger:**

- Revisit only if the project intentionally adopts a vendored dependency policy.

### Decision 2: dist Tracking Policy

**Decision:** Stop tracking `dist`.

**Reason:** `dist` is generated by `npm run build`, contains hashed Vite output, and no repository deployment convention was found that requires committed frontend assets. Tracking it causes build hash churn and forced manual restore after validation builds.

**Evidence:**

- 3 files were tracked under `dist`.
- `.gitignore` contains `dist/`.
- `package.json` defines `build` as `vue-tsc && vite build`.
- Search for deployment/static-asset usage found no `.github` directory and no explicit deploy process requiring committed `dist`.
- `npm run build` passed after untracking.
- `git ls-files dist | wc -l` now reports `0`.
- Local directory still exists: `test -d dist` passed.

**Alternatives considered:**

- Keep `dist` tracked. Rejected because no deployment evidence requires it.
- Keep only `dist/index.html`. Rejected because the asset references point to hashed generated files.

**Consequences:**

- The dedicated policy commit will remove the three generated `dist` files from the Git index.
- Builds no longer leave hash churn in Git status.
- Deployment must build assets from source or use a future explicit release-artifact process.

**Revisit trigger:**

- Revisit if deployment is changed to consume committed frontend assets directly.

### Decision 3: Migration 012 Policy

**Decision:** Classify `012_seed_test_users.sql` as a development seed script and move it to `backend/dev/seed_test_users.sql`.

**Reason:** The file creates fixed local test users with a documented shared password `test1234`. That is useful for local development but inappropriate for an always-run production migration chain.

**Evidence:**

- File header says `FigColor local development test users`.
- The file contains fixed emails: `test1@figcolor.local`, `test2@figcolor.local`, and `test3@figcolor.local`.
- The file documents fixed password `test1234`.
- Searches found README references to these local accounts and plan references that treated migration 012 as unresolved.
- No application code or tests require the file to live under `backend/migrations`.
- Migration discovery code was not found in the backend; README describes applying migrations manually with `psql`.
- Moving it out of `backend/migrations` does not require renumbering `013`-`015`.

**Alternatives considered:**

- Keep as production migration. Rejected because it seeds fixed test credentials into every environment.
- Move under test fixtures. Rejected because README describes manual local use, not automated test use.
- Delete it. Rejected because it is useful local-development material and user work should be preserved.

**Consequences:**

- Production migration ordering now skips `012`.
- `013_persist_palette_color_ids.sql`, `014_add_chart_applicability.sql`, and `015_create_palette_preview_cases.sql` remain unchanged.
- README documents manual local execution: `psql "$DATABASE_URL" -f backend/dev/seed_test_users.sql`.

**Revisit trigger:**

- Revisit if a formal migration runner is added and requires contiguous numbering.

### Actual Operations

- Ran `git rm -r --cached node_modules`.
- Ran `git rm -r --cached dist`.
- Moved `backend/migrations/012_seed_test_users.sql` to `backend/dev/seed_test_users.sql`.
- Updated `README.md` with manual local test-user seed instructions.
- Updated `docs/figcolor-scientific-preview-system-plan.md` to mark migration numbering resolved.
- Updated `Diary.md` as the single root decision record.

### Validation Evidence

Commands run after policy changes:

| Command | Result |
|---|---|
| `npm ci` | Passed; added 54 packages |
| `npm test` | Passed; all 12 frontend test modules reported `ok` |
| `./node_modules/.bin/vue-tsc --noEmit` | Passed |
| `npm run build` | Passed |
| `go test ./...` from `backend/` | Passed; palette package reported `ok` |
| `git ls-files node_modules | wc -l` | `0` |
| `git ls-files dist | wc -l` | `0` |
| `git check-ignore -v --no-index node_modules dist` | Both paths ignored by `.gitignore` |
| `test -d node_modules` | Passed |
| `test -d dist` | Passed |

### Commit Boundaries

Recommended commit groups from the current working tree:

1. **Repository policy diary and ignore baseline**
   - Message: `chore: establish repository tracking policy`
   - Paths: `.gitignore`, `Diary.md`

2. **Stop tracking `node_modules`**
   - Message: `chore: stop tracking node_modules`
   - Paths: `node_modules/**` index removals only

3. **Stop tracking generated `dist` assets**
   - Message: `chore: stop tracking generated dist assets`
   - Paths: `dist/**` index removals only

4. **Dependency baseline**
   - Message: `fix: align Vue plugin with Vite 8`
   - Paths: `package.json`, `package-lock.json`

5. **Move local test-user seed out of production migrations**
   - Message: `chore: move test user seed out of production migrations`
   - Paths: `backend/dev/seed_test_users.sql`, `README.md`, `docs/figcolor-scientific-preview-system-plan.md`

6. **Backend preview persistence and migrations**
   - Message: `feat: add palette preview persistence`
   - Paths: backend palette source, backend preview-case tests, migrations `013`-`015`

7. **Frontend preview infrastructure and admin integration**
   - Message: `feat: add palette preview pipeline`
   - Paths: frontend palette normalization, chart-type registry, admin preview API/editor, public preview integration

8. **Renderers, exports, and tests**
   - Message: `feat: add scientific preview renderers`
   - Paths: renderer implementations, deterministic helpers, exports, frontend test harness/tests

### Exact Staging Commands

The current index already contains the `git rm --cached` results for `node_modules` and `dist`. To preserve the recommended commit boundaries, use path-limited commits and avoid `git add .`.

#### Commit 1 - Repository policy diary and ignore baseline

```bash
git add .gitignore Diary.md
git diff --cached --stat -- .gitignore Diary.md
git diff --cached -- .gitignore Diary.md
git commit -m "chore: establish repository tracking policy" -- .gitignore Diary.md
```

#### Commit 2 - Stop tracking node_modules

```bash
git diff --cached --stat -- node_modules
git commit -m "chore: stop tracking node_modules" -- node_modules
```

#### Commit 3 - Stop tracking generated dist assets

```bash
git diff --cached --stat -- dist
git commit -m "chore: stop tracking generated dist assets" -- dist
```

#### Commit 4 - Dependency baseline

```bash
git add package.json package-lock.json
git diff --cached --stat -- package.json package-lock.json
git diff --cached -- package.json package-lock.json
git commit -m "fix: align Vue plugin with Vite 8" -- package.json package-lock.json
```

#### Commit 5 - Move local test-user seed out of production migrations

```bash
git add backend/dev/seed_test_users.sql README.md docs/figcolor-scientific-preview-system-plan.md
git diff --cached --stat -- backend/dev/seed_test_users.sql README.md docs/figcolor-scientific-preview-system-plan.md
git diff --cached -- backend/dev/seed_test_users.sql README.md docs/figcolor-scientific-preview-system-plan.md
git commit -m "chore: move test user seed out of production migrations" -- backend/dev/seed_test_users.sql README.md docs/figcolor-scientific-preview-system-plan.md
```

#### Commit 6 - Backend preview persistence and migrations

```bash
git add \
  backend/internal/palette/handler.go \
  backend/internal/palette/model.go \
  backend/internal/palette/repository.go \
  backend/internal/palette/service.go \
  backend/internal/palette/preview_case_handler.go \
  backend/internal/palette/preview_case_handler_test.go \
  backend/internal/palette/preview_case_model.go \
  backend/internal/palette/preview_case_repository.go \
  backend/internal/palette/preview_case_repository_test.go \
  backend/internal/palette/preview_case_service_test.go \
  backend/internal/palette/preview_case_transaction_test.go \
  backend/internal/palette/preview_case_validation.go \
  backend/internal/palette/preview_case_validation_test.go \
  backend/internal/palette/public_dto.go \
  backend/internal/palette/public_dto_test.go \
  backend/internal/palette/validation.go \
  backend/internal/palette/validation_test.go \
  backend/migrations/013_persist_palette_color_ids.sql \
  backend/migrations/014_add_chart_applicability.sql \
  backend/migrations/015_create_palette_preview_cases.sql
git diff --cached --stat -- backend/internal/palette backend/migrations/013_persist_palette_color_ids.sql backend/migrations/014_add_chart_applicability.sql backend/migrations/015_create_palette_preview_cases.sql
git commit -m "feat: add palette preview persistence" -- \
  backend/internal/palette \
  backend/migrations/013_persist_palette_color_ids.sql \
  backend/migrations/014_add_chart_applicability.sql \
  backend/migrations/015_create_palette_preview_cases.sql
```

#### Commit 7 - Frontend preview infrastructure and admin integration

```bash
git add \
  src/App.vue \
  src/api/admin.ts \
  src/components/PaletteCard.vue \
  src/components/admin/previews/BarErrorPreviewEditor.vue \
  src/components/admin/previews/PreviewValidationIssues.vue \
  src/components/palettes/PaletteChartPreview.vue \
  src/components/palettes/PaletteChartPreview.logic.ts \
  src/components/palettes/PaletteChartPreview.test.ts \
  src/components/palettes/PalettePreviewIntegration.test.ts \
  src/components/project/AddPaletteModal.vue \
  src/composables/useAuth.ts \
  src/composables/useFavorites.ts \
  src/lib/api/adminPreviewCases.ts \
  src/lib/api/adminPreviewCases.test.ts \
  src/lib/palette.ts \
  src/lib/palette/schema.ts \
  src/lib/palette/applicability.ts \
  src/lib/palette/colorReferences.ts \
  src/lib/palette/resolveColors.ts \
  src/types/palette.ts \
  src/views/FavoritesView.vue \
  src/views/PaletteDetailView.vue \
  src/views/PalettesView.vue \
  src/views/admin/palettes/AdminPaletteForm.vue
git diff --cached --stat -- src/App.vue src/api/admin.ts src/components src/composables src/lib/api src/lib/palette.ts src/lib/palette src/types src/views
git commit -m "feat: add palette preview pipeline" -- \
  src/App.vue \
  src/api/admin.ts \
  src/components \
  src/composables \
  src/lib/api \
  src/lib/palette.ts \
  src/lib/palette \
  src/types \
  src/views
```

#### Commit 8 - Renderers, exports, and tests

```bash
git add \
  scripts/run-tests.mjs \
  src/lib/chart-types.registry.test.ts \
  src/lib/chart-types \
  src/lib/deterministic.test.ts \
  src/lib/deterministic \
  src/lib/exports \
  src/lib/palette.preview-normalization.test.ts \
  src/lib/palette.resolve-colors.test.ts \
  src/lib/renderers.test.ts \
  src/lib/renderers
git diff --cached --stat -- scripts/run-tests.mjs src/lib/chart-types.registry.test.ts src/lib/chart-types src/lib/deterministic.test.ts src/lib/deterministic src/lib/exports src/lib/palette.preview-normalization.test.ts src/lib/palette.resolve-colors.test.ts src/lib/renderers.test.ts src/lib/renderers
git commit -m "feat: add scientific preview renderers" -- \
  scripts/run-tests.mjs \
  src/lib/chart-types.registry.test.ts \
  src/lib/chart-types \
  src/lib/deterministic.test.ts \
  src/lib/deterministic \
  src/lib/exports \
  src/lib/palette.preview-normalization.test.ts \
  src/lib/palette.resolve-colors.test.ts \
  src/lib/renderers.test.ts \
  src/lib/renderers
```

### Remaining Risks

- The current index contains staged deletions for `node_modules` and `dist` because `git rm --cached` is the tracking-policy operation. Use path-limited commits to keep these policy changes isolated.
- `backend/migrations/013`-`015` remain untracked until the backend persistence commit.
- If a future deployment process requires committed `dist`, the dist policy should be revisited.
- If a future migration runner requires contiguous numbering, the migration numbering decision should be revisited before applying migrations to shared environments.

### Final Recommendation

Proceed with policy commits first, especially the `node_modules` and `dist` untracking commits, before reviewing WP functional work. This removes generated churn from later reviews and leaves `package.json` / `package-lock.json` as the dependency baseline.
