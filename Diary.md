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

## 2026-07-18 - Keep Project Default Palettes Out of the Public Catalog

- Decision: Store official and user/project palettes in the shared `palettes` table, but separate them with `owner_user_id`, `visibility`, `origin`, and `source_palette_id`. Public catalog reads must require `visibility = 'public'` and `status = 'published'`. Project-created Default Palettes are user-owned private palettes linked through `project_palettes`.
- Context: Project creation generated a "Default Palette" row in `palettes` with `published` status. Because public browsing only filtered by status, user/project defaults appeared in Browse Palettes and public detail routes.
- Reason: A single palette table keeps renderer, preview, Figure, and project association logic simple, while explicit ownership and visibility prevent private project data from leaking into public catalog views. The database default for `visibility` is private so future missed INSERT fields fail closed.
- Alternatives considered: Move user palettes to a separate `user_palettes` table, or hide Default Palette by name in the frontend. A separate table would complicate foreign keys and rendering with polymorphic palette references; frontend name filtering would mask symptoms while leaving public API leakage.
- Trade-offs: Shared storage requires every public repository/service path to carry visibility filters and needs migration guards for historical project-generated rows. In return, the data model avoids duplicate palette schemas and remains compatible with current project and Figure references.
- Follow-up: Implement full fork editing and palette versioning later; keep `created_by` as audit metadata and `owner_user_id` as the permission boundary.

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

## 2026-07-17 - Phase 1 local acceptance/debug palette seed

### Context

After Phase 1 scientific preview verification, a local database seed was requested to support manual acceptance and debugging of the four Phase 1 chart types:

- `bar_error`
- `boxplot_jitter`
- `line_multiseries`
- `heatmap_annotated`

### Decision

Created `backend/dev/seed_phase1_preview_palettes.sql` as a development seed script, not a production migration.

These 40 generated palette records are only for local acceptance checks and debugging. They must not be treated as curated production palette data, product content, or a required production migration.

### Seed Contents

The script creates or refreshes 40 published palettes:

| Chart type | Count | Slug range |
|------------|------:|------------|
| `bar_error` | 10 | `phase1-bar-error-mock-01` to `phase1-bar-error-mock-10` |
| `boxplot_jitter` | 10 | `phase1-boxplot-jitter-mock-01` to `phase1-boxplot-jitter-mock-10` |
| `line_multiseries` | 10 | `phase1-line-multiseries-mock-01` to `phase1-line-multiseries-mock-10` |
| `heatmap_annotated` | 10 | `phase1-heatmap-annotated-mock-01` to `phase1-heatmap-annotated-mock-10` |

Each generated palette has:

- `status = published`
- 5 stable `colors[].id` values
- `chart_applicability` covering Phase 1 chart filters
- one published primary preview case
- Phase 1 template metadata
- preview `color_roles` that reference palette `color_id` values

### Execution

The seed was applied locally with:

```bash
psql 'postgres://localhost:5432/figcolor?sslmode=disable' -f backend/dev/seed_phase1_preview_palettes.sql
```

### Verification

The seed output confirmed 10 published primary preview cases for each Phase 1 chart type.

Additional local verification checked preview role references:

- total preview role `color_id` references: 170
- missing palette color references: 0

### Notes

- The script is intentionally idempotent and can be re-run to refresh the local acceptance/debug dataset.
- The data uses deterministic slugs and stable color IDs.
- This seed should remain under `backend/dev/` unless a separate production-content decision is made.

## 2026-07-17 - Palette Browse backend paging/filtering fix

### Context

The public Palette Browse page exposed two related issues during Phase 1 acceptance:

- The dev seed contains 40 published scientific preview palettes, but Browse only displayed 20 because the public list endpoint was paginated.
- Chart filters such as `line`, `bar`, `boxplot`, `violin`, and `heatmap` were being applied on the already-loaded client-side page, so the UI did not reliably reflect filtering across the complete dataset.

### Fix

Implemented formal server-side filtering and pagination for the public palettes list.

- Public query params now include search, chart type, journal style, color count, use case, discipline, and tag filters.
- Repository listing applies all filters in SQL before `COUNT`, `LIMIT`, and `OFFSET`.
- Public chart filters map legacy broad UI values to Phase 1 chart applicability values, for example `line` to `line_multiseries`.
- Browse now calls a paged palette API helper and renders pagination from response metadata instead of using a fixed large page-size request and filtering locally.

### Verification

Added tests covering:

- Public handler parsing of paging and filter query params.
- Public chart filter SQL condition generation for broad and Phase 1 chart-type targets.
- Frontend paged loading across more than 40 palettes.
- Filter totals being computed before pagination.

Local verification commands:

```bash
npm test
cd backend && go test ./internal/palette
```

### Follow-up: Empty Results vs Load Failure

After reviewing the paged palette loader, we identified an important UX distinction:

- A successful request can legitimately return zero palettes.
- A failed request can also leave the UI with zero palettes.

These states must not be collapsed into the same "No palettes found" experience.

The frontend palette data layer now keeps load failure state separate from the palette array:

- `PalettePageResult.error` is `null` for successful responses, including successful empty responses.
- Failed page loads return an empty palette array plus an error message instead of rejecting.
- `loadPalettes()` still resolves safely, but records the last failure through `getPalettesLoadError()`.
- Browse renders a dedicated load failure state with retry instead of showing the empty-results message.

Additional tests cover:

- Numeric pagination metadata parsing from API responses.
- Missing `total_pages` fallback behavior.
- Failed `loadPalettes()` calls resolving without unhandled promise rejection while preserving error state.
- Successful empty responses staying distinct from failed responses.

Verified with:

```bash
npm test
npm run build
cd backend && go test ./internal/palette
```

## 2026-07-18 - My Projects figure palette ID fix

### Context

Creating a Figure from My Projects failed with a database error:

```text
figure_assignments_palette_id_fkey
```

The root cause was an ID semantics mismatch. A project palette object contains both:

- `id`: the `project_palettes` association record ID.
- `basePaletteId`: the real `palettes.id` catalog palette ID.

The running database constraint for `figure_assignments.palette_id` targets `palettes.id`, but the Figure creation flow was sending the project palette association ID.

### Fix

- Figure creation now submits `ProjectPalette.basePaletteId` as `CreateFigureRequest.paletteId`.
- The backend validates before writing that the base palette exists and is available in the current project.
- Misusing a project palette ID now returns a clear 422 instead of falling through to a database 500.
- Custom project palettes without `basePaletteId` are explicitly rejected for Figure creation and recorded as a later design item.
- Add Palette now persists selected catalog palettes through a real project palette API instead of only pushing a local temporary object.
- Figure creation success refreshes the project detail and closes the modal; failures display backend errors inside the modal instead of using `alert`.
- Added migration `016_figure_assignments_base_palette_fk.sql` to backfill old project palettes, convert existing Figure assignments to base palette IDs, and enforce `figure_assignments.palette_id -> palettes(id)`.

### Verification

Local database migration was applied successfully:

- Backfilled 7 project palettes with base palette IDs.
- Converted 3 existing Figure assignments from project palette IDs to base palette IDs.
- Confirmed `figure_assignments_palette_id_fkey` now references `palettes(id)`.
- Confirmed no project palettes are missing `base_palette_id` locally.
- Confirmed no Figure assignments point to a missing base palette locally.

Verified with:

```bash
npm test
npx vue-tsc --noEmit
npm run build
cd backend && go test ./internal/project ./internal/palette
```

Follow-up note: custom project palette persistence still needs a separate data-model design before custom palettes can be used for Figures.

## 2026-07-19 - Isolate Default Palettes from Admin Review

- Decision: Treat Admin Palette Review as an official public-catalog management surface only. Admin list, edit, publish, unpublish, archive, and delete operations must be limited to palettes where `visibility = 'public'` and `owner_user_id IS NULL`. Project-created Default Palettes and other user-owned palettes are private resources and must not enter the Admin Review workflow, even when their lifecycle `status` is `published`.
- Context: Project creation stores a reusable "Default Palette" row in the shared `palettes` table so Figures and project palette roles can reference normal palette records. Some historical Default Palette rows had `status = 'published'`, which made them appear in Admin Review when Admin queries treated `published` as the main public-management boundary.
- Reason: `status` describes publication lifecycle, not ownership or visibility. A private user-owned palette can be published in the sense of being usable inside its owner's project, but it is still not an official catalog palette. Admin Review needs an ownership/visibility boundary so private project data is neither visible nor mutable through public catalog management tools.
- Alternatives considered: Hide rows named "Default Palette" in the frontend, split project palettes into a separate table, or only add a service-layer filter. Name filtering was rejected because it is brittle and does not protect API access. A separate table would duplicate palette storage and complicate renderer/figure references. Service-only filtering was strengthened with repository-level SQL guards for Admin writes.
- Trade-offs: The shared `palettes` table remains simple for rendering and project references, but every catalog-management path must consistently apply the public-catalog boundary. Repository SQL guards duplicate service intent, but provide defense in depth for publish/unpublish/delete style mutations.
- Follow-up: Keep Default Palette creation private by default: `owner_user_id = project owner`, `visibility = 'private'`, `origin = 'custom'`, `status = 'draft'`, and `published_at = NULL`. Future user palette features should continue to use `owner_user_id` and `visibility` as permission boundaries instead of relying on `status`.

Verification evidence:

```text
SELECT COUNT(*) FILTER (WHERE name = 'Default Palette') AS defaults,
       COUNT(*) FILTER (
         WHERE name = 'Default Palette'
           AND visibility = 'public'
           AND owner_user_id IS NULL
       ) AS admin_visible_defaults
FROM palettes;

defaults = 9
admin_visible_defaults = 0
```

Local API verification for the Admin Review boundary:

```text
GET /api/admin/palettes?page=1&page_size=100
defaultPalettes = 0

POST /api/admin/palettes/:defaultPaletteId/publish
404 {"error":"palette not found"}

POST /api/admin/palettes/:defaultPaletteId/unpublish
404 {"error":"palette not found"}
```

Regression checks:

```bash
cd backend && go test ./...
npm test
npm run build
```

## 2026-08-04 - Freeze WP6 Candidate-Ingestion HTTP Contracts

- Decision: Keep the canonical request as the three-field top-level object and place required `validation_issues` and `duplicate_evidence` arrays plus optional `source_reference` inside `ingestion_metadata`. All present evidence participates in the complete-request RFC 8785 JCS SHA-256 fingerprint. Freeze `palette-ingest-wp5-reporting.1` as the sole v1 pipeline version, require `request_fingerprint` in the stable receipt, return the raw receipt on success, and use strict `{code,message}` error bodies.
- Context: The HTTP implementation could not start while evidence transport, receipt shape, error mapping, and version compatibility were ambiguous. The Node builder and Go strict decoder also needed a narrow compatibility change before the Schema could make evidence required.
- Reason: One canonical body and one fingerprint prevent side-channel evidence drift. Raw stable receipts make replay byte-stable, and exact version allowlisting fails closed when the producer contract changes.
- Alternatives considered: Add a transport envelope, pass evidence in headers, default evidence in the future handler, retain arbitrary non-empty pipeline versions, or expose the service-result wrapper. Each would create a second identity boundary or an unstable public contract.
- Trade-offs: Evidence-only changes now intentionally produce idempotency fingerprint conflicts. Node and Go retain small language-specific version adapters, so the shared complete-request fixture is the mandatory drift guard.
- Follow-up: Implement the separately authorized authenticated/admin-only HTTP boundary from these frozen Schemas. Do not alter evidence identity, raw receipt semantics, or the status/code/Retry-After table in that implementation slice.

## 2026-08-06 - Freeze WP6 Ingestion HTTP Transport and Auth Exception

- Decision: Limit `POST /api/admin/palette-candidates` bodies to exactly 262144 bytes, accept only `application/json` with no parameters or one UTF-8 charset parameter, and retain the shared Auth/AdminRequired `{error: ...}` response as the explicit pre-handler 401/403 exception to the post-auth ingestion `{code,message}` Schema.
- Context: Handler implementation was blocked because the byte limit, media-type parameter behavior, and relationship between shared auth responses and the ingestion error Schema were not uniquely defined.
- Reason: Bounded reads protect memory independently of Content-Length, standard media parsing avoids ambiguous prefix logic, and preserving the shared middleware contract avoids changing unrelated APIs or creating a second admin stack.
- Alternatives considered: Reuse an unrelated upload limit, accept all JSON-like media types, add ingestion-only authentication codes, wrap shared middleware responses, or globally change Auth/AdminRequired. Each would weaken the frozen boundary or expand scope.
- Trade-offs: Ingestion 401/403 bodies intentionally differ from post-auth ingestion errors. Tests must assert the boundary explicitly and prove rejected identities never reach the handler or persistence.
- Follow-up: Keep the future Node client out of this slice and require it to pass the final authoritative validation report explicitly to `buildIngestionRequest(proposal, vocabularies, validationReport)` so duplicate findings cannot be omitted.

## 2026-08-07 - Freeze WP6 Node Submission Transport

- Decision: The Node ingestion submit client uses a 30000 ms request timeout, accepts at most 65536 raw response bytes while reading at most 65537 bytes for overflow detection, disables automatic redirects and rejects every 3xx, and requires HTTPS except for exact loopback hostnames `localhost`, `127.0.0.1`, and `[::1]`. Parsed URLs containing username or password are rejected.
- Context: HTTP submission implementation could not safely choose timeout, response bound, redirect, or local-development cleartext behavior without making a new public transport contract.
- Reason: A finite timeout and bounded body prevent indefinite resource use; rejecting redirects prevents Bearer credential forwarding; exact parsed-host checks prevent fake-loopback suffixes; and durable pre-request idempotency binding makes every ambiguous transport result safely replayable.
- Trade-offs: Same-origin redirects are also rejected, and malformed/truncated/oversized responses remain unresolved even when the server may have committed. Operators must resume with the same key and canonical body rather than infer success.
- Follow-up: Implement these values as submission-specific named constants, never reuse manifest limits, and keep token material out of artifacts, logs, JSON output, URLs, and receipts.

### Implementation audit blocker

The isolated Node CLI → authenticated Go HTTP → PostgreSQL test found that a Schema-valid `stable_id` preview cannot cross the current Go normalized-hash boundary. Node omits `seed_value` as required by the request Schema, but Go's typed `CreatePreviewCaseRequest` re-marshals its nil `SeedValue` as `"seed_value":null` while reconstructing normalized content. That changes the hash input and produces `422 INVALID_INGESTION_REQUEST`. A fixed-seed-only E2E fixture would hide the compatibility defect and is rejected as an acceptance workaround. WP6 submission remains blocked pending explicit authorization for the minimal Go hash/DTO compatibility correction and a stable-id cross-language regression.

### Preview-hash compatibility resolution and WP6 acceptance

- Decision: Keep `CreatePreviewCaseRequest.SeedValue` as `*int` and add `omitempty` only to its ingestion/create JSON tag. Add a raw canonical-request boundary check that rejects an explicitly present `seed_value: null` before normalized hashing or claim. Do not alter the frozen request Schema, Node output, fingerprint algorithm, preview persistence representation, or transaction/recovery model.
- Reason: A nil pointer now serializes as omission for `stable_id`; a non-nil pointer preserves both ordinary fixed seed values and legal zero. The separate raw check retains the Schema distinction between an omitted optional field and explicit null, which typed pointer decoding alone cannot preserve.
- Drift evidence: The shared Node/Go JCS corpus adds stable-id omission, fixed seed 42, and fixed seed 0 normalized-content fixtures. Go reconstructs them through the typed ingestion DTO and matches the fixture canonical bytes/hashes; actual Node and Go JCS processes match the same corpus. Complete evidence-bearing request fingerprint tests remain unchanged and pass.
- End-to-end evidence: The isolated migrations-001–020 CLI→authenticated HTTP→PostgreSQL harness proves stable-id first submit (201), direct same-key replay (200), CLI already-submitted resume, response-loss pending/unknown recovery with the original key/body, evidence-only payload mismatch (409), explicit-null rejection (422) with zero new claim, user 403, invalid/expired 401, stable receipt/fingerprint/checkpoint binding, no duplicate Palette/preview/ingestion record, Admin Candidate visibility, and public catalog/detail/preview invisibility.
- Scope: WP6 is locally accepted. Admin UI integration, publication workflow, WP7, and target/staging/production migration application remain outside this decision and unstarted/unverified.

### WP6 documentation and contract-hardening closure

- Decision: Remove the unimplemented `--validated-only` command example, document the actual Node CLI submit invocation, and replace the stale pre-Go-ingestion seed-boundary description with the implemented Schema → HTTP → `prepareIngestion` behavior.
- Defensive contract: `prepareIngestion` now rejects a present stable-id `seed_value` before claim, including ordinary integers and zero; explicit null remains independently rejected. Illegal input is never normalized by deleting the field. Valid omitted stable-id, fixed seed 42, and fixed seed 0 behavior is unchanged.
- Evidence: Focused service tests prove stable-id values 42 and 0 return the stable validation outcome with zero claim and zero aggregate calls. Focused HTTP tests return `422 INVALID_INGESTION_REQUEST` without invoking the ingestion service. Preview/ingestion, cross-language JCS, full Go, and palette-ingest regressions pass.
- Closure: WP6 is passed and frozen locally. Admin UI integration is ready for a separately authorized work package but remains not started; publication, WP7, and target/staging/production migration application remain outside this closure.
