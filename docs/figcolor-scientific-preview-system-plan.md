# FigColor Scientific Preview System - Phase 1 Implementation Plan

## Goal and Phase 1 Scope

Phase 1 builds FigColor's original scientific chart thumbnail system. The goal is to replace journal screenshot dependency with deterministic, palette-driven SVG previews while preserving the existing palette business model.

Phase 1 implements exactly four chart types:

| Chart family | Chart type | Initial template | Purpose |
|--------------|------------|------------------|---------|
| `bar` | `bar_error` | `bar_error_v1` | Control/treatment bars with error bars |
| `distribution` | `boxplot_jitter` | `boxplot_jitter_v1` | Group comparison and clinical statistics |
| `line` | `line_multiseries` | `line_multiseries_v1` | Time series and dose response |
| `heatmap` | `heatmap_annotated` | `heatmap_annotated_v1` | Annotated heatmap or expression matrix |

The canonical data flow is:

```text
Palette raw data
        ↓
Chart Type Applicability
        ↓
Select Chart Type
        ├── Color Role Mapping
        └── Preview Configuration
                    ↓
        Deterministic Mock Data
                    ↓
                Renderer
```

Phase 1 displays one published primary preview per palette in public contexts, while the backend model supports multiple preview cases for future phases.

## Non-goals

- Do not implement Phase 2 chart types such as `scatter_grouped`, `volcano`, `survival_km`, or `umap_cluster`.
- Do not expose a public multiple-preview switcher in Phase 1.
- Do not implement project-specific role overrides in Phase 1.
- Do not implement canvas renderers unless a Phase 1 SVG renderer is proven impossible.
- Do not make `exported_core_colors` or `copy_blocks` independent editable truth.
- Do not infer scientific roles automatically for published data without admin confirmation.
- Do not remove legacy palette fields during Phase 1.
- Do not redesign Browse Palettes or Paper Project beyond compatibility work required by this plan.
- Do not support separate draft revisions for an already published preview case in Phase 1. Updating a published preview validates the complete replacement payload before committing to the same record.

## Codex Execution Rules

- Execute one Work Package at a time.
- Start with WP0 repository audit. Before WP0 is complete, do not modify domain model, database schema, or API contracts.
- Prefer existing naming, route style, directory layout, API helpers, component patterns, and Go package conventions.
- Do not rename database columns or API response fields without an explicit migration and adapter.
- Do not delete legacy fields in Phase 1.
- Do not add unrelated refactors while implementing a Work Package.
- Do not implement unresolved Open Decisions. Stop and report when one blocks the current package.
- Treat paths, migration numbers, interfaces, and route names in this document as target contracts or provisional examples until verified by WP0.
- Use SVG for all four Phase 1 renderers.
- After each Work Package, report changed files, migrations, tests, commands run, and unresolved issues.
- Every Work Package must stop at its Stop point before starting the next package.

## Stage 0 Repository Audit

WP0 is the formal Stage 0 audit. It checks the real repository before implementation.

Audit these surfaces:

- Current Palette TypeScript interfaces.
- Current frontend palette schema and helpers.
- Current Go palette model, repository, service, and handler shape.
- `palettes` database structure and migrations.
- `colors`, `chart_types`, `discipline` / `disciplines`, `use_case` / `use_cases`, and `avoid_case` / `avoid_cases`.
- Palette Card.
- Palette Detail Page.
- Add/Edit Palette admin flow.
- Browse filter.
- Paper Project palette flow.
- Current preview or journal screenshot components.
- Public palette list/detail API responses.
- Current public API route style.
- Current admin API route style.
- Existing test locations and commands.

Audit deliverables:

- Real file paths.
- Current field names.
- Current API route and DTO names.
- Incompatibilities with this plan.
- Minimal migration plan.
- Backward compatibility requirements.
- Final endpoint names adapted to the audited route style.

Current snapshot hints, to verify in WP0:

- Frontend root appears to be `src/`, not `frontend/src/`.
- Existing frontend files include `src/types/palette.ts`, `src/lib/palette/schema.ts`, `src/components/PaletteCard.vue`, `src/views/PaletteDetailView.vue`, and `src/views/admin/palettes/AdminPaletteForm.vue`.
- Existing preview files include `src/components/palettes/PaletteChartPreview.vue` and `src/components/palettes/previews/...`.
- Existing backend palette handler is `backend/internal/palette/handler.go`.
- Migrations are under `backend/migrations/...`.

## Confirmed Architecture

Palette raw data is the canonical color and metadata source. A palette can be applicable to multiple chart types and can have multiple authored preview cases over time.

Phase 1 decisions:

- Store `chart_applicability` as JSONB.
- Use exactly four Phase 1 theme tokens: `foreground`, `muted_foreground`, `grid`, and `background`.
- Re-evaluate `chart_applicability` normalization after Phase 1.
- Re-evaluate theme token expansion after Phase 1.
- Use one active preview case per palette/chart type/template/template version in Phase 1. Separate draft revision records are deferred.

Confirmed principles:

- `palette.colors` is the canonical color pool, not a legacy fallback.
- Data-encoding colors in previews must reference `palette.colors` through `color_id`.
- Non-data utility colors such as axis, grid, background, and plain text may use approved theme tokens.
- No role mapping may store arbitrary standalone hex values.
- `chart_applicability` is the Phase 1 write source for chart type suitability.
- `chart_types` remains as compatibility and fast filtering data.
- Backend derives and synchronizes `chart_types` from `chart_applicability` in the same transaction.
- Old records without `chart_applicability` continue reading legacy `chart_types`.
- Once `chart_applicability` exists, it is authoritative.
- Unlisted chart types are undeclared / not applicable. Do not store `unsupported`.
- Chart Type Applicability describes suitability. Palette Preview Case describes an authored preview.
- Renderer does not guess roles, decide layout, or generate random data.
- Mock data generator does not handle colors.
- Public runtime must not show auto-generated chart-specific preview cases as original previews.

Public fallback order:

```text
published primary preview case
→ deterministic generic palette preview
→ color-strip fallback
→ placeholder
```

Auto-generated roles/config are allowed only as admin draft suggestions. They must be manually confirmed and published before public display.

Chart hierarchy:

```text
Chart Family
    └── Chart Type
          └── Template
                ├── Preview Configuration
                ├── Deterministic Mock Data Generator
                └── Renderer
```

## Canonical Data Model

### Frontend Data Layers

The frontend has three explicit data layers. New code must not blur these layers:

```text
Raw API DTO
    ↓
normalizePalette()
    ↓
CanonicalPalette
    ↓
explicit compatibility adapters / selectors
    ↓
legacy components
```

`normalizePalette()` is the only supported frontend boundary for converting:

- `chart_types` / `chart_type`
- `discipline` / `disciplines`
- `use_case` / `use_cases`
- `avoid_case` / `avoid_cases`
- legacy color objects
- legacy experimental preview fields

Vue components and unrelated utilities must not independently inspect both singular and plural variants. Existing components may continue reading compatibility fields such as `palette.chart_type` only through explicit adapters/selectors during migration.

### Palette

The formal domain model uses plural canonical field names. Legacy singular/plural variants exist only in DTOs or adapters.

```typescript
type CanonicalPaletteType =
  | 'categorical'
  | 'sequential'
  | 'diverging'
  | 'mixed'

type LegacyPaletteType =
  | 'qualitative'
  | 'heatmap'

type PaletteType =
  | CanonicalPaletteType
  | LegacyPaletteType

interface PaletteColor {
  id: string
  hex: string
  rgb: [number, number, number]
  label?: string
  order: number
}

interface CanonicalPalette {
  id: string
  slug: string
  name: string
  description?: string
  status: 'draft' | 'candidate' | 'published' | 'archived'
  colors: PaletteColor[]
  color_count: number
  type: PaletteType
  chart_types: ChartType[]
  chart_applicability?: ChartTypeApplicability[]
  journal_style: string[]
  disciplines: string[]
  use_cases: string[]
  avoid_cases: string[]
  tags: string[]
  accessibility?: Accessibility
  source_type?: 'manual' | 'figure_extracted' | 'curated'
  source_image?: string
  source_note?: string
  version?: string
  created_by?: string
  created_at: string
  updated_at: string
  published_at?: string
  archived_at?: string
}
```

Rules:

- `hex` is the canonical color value.
- RGB is derived from `hex`; it is not independently edited or trusted when legacy stored RGB disagrees with HEX.
- Persisted color IDs are preferred whenever available.
- Legacy colors without IDs receive deterministic index-derived compatibility IDs.
- Index-derived IDs are transitional only. They are stable only while color order is unchanged and must not be used as permanent persisted references.
- Persisted preview cases cannot safely depend only on `color-0`, `color-1`, or similar index-derived IDs if palette colors may be reordered.
- Before persisted preview cases are introduced, existing palette color JSONB should be migrated to include stable persisted IDs.
- `color_count` is derived from `colors.length`. If kept in the database, backend writes must sync it when `colors` changes.
- `source_image` may remain as provenance/admin metadata in Phase 1, but public Palette Card and Detail Hero must not use it as the preview cover.
- Legacy values `qualitative` and `heatmap` must not be silently coerced into another type. WP1 preserves them as explicit legacy/extended DTO values. Before WP2 persistence constraints change, choose one of: keep a broader DB constraint, migrate existing records to canonical values through an explicit migration, or represent legacy values separately and prevent new creation.
- Palette-level `chart_family`, `functional_roles`, `preview_template`, `exported_core_colors`, and `copy_blocks` are legacy/experimental adapter input only. They are not canonical editable palette truth.

### Raw DTO Normalization and Compatibility

Raw API DTOs reflect currently possible backend/API and legacy frontend payloads. The raw DTO is not the application domain model.

```typescript
interface RawPaletteDTO {
  id: string
  slug: string
  name: string
  description?: string
  status?: string
  colors?: unknown
  color_count?: number
  type?: string
  chart_types?: string[]
  chart_type?: string[]
  journal_style?: string[]
  discipline?: string[]
  disciplines?: string[]
  use_case?: string[]
  use_cases?: string[]
  avoid_case?: string[]
  avoid_cases?: string[]
  tags?: string[]
  chart_family?: unknown
  functional_roles?: unknown
  preview_template?: unknown
  exported_core_colors?: unknown
  copy_blocks?: unknown
  created_at?: string
  updated_at?: string
  published_at?: string
}

interface LegacyPaletteCompatibility {
  chart_type: string[]
  discipline: string[]
  use_case: string[]
  avoid_case?: string[]
  legacy_preview?: unknown
}

type Palette = CanonicalPalette & LegacyPaletteCompatibility

function normalizePalette(input: RawPaletteDTO): Palette {
  const colors = normalizeColors(input.colors)
  const canonical = {
    // canonical frontend fields only
  }

  return withLegacyCompatibility(canonical)
}
```

Compatibility rules:

- `chart_types` is canonical in the frontend domain. Existing `chart_type` access remains available only through an explicit compatibility adapter during migration.
- `disciplines`, `use_cases`, and `avoid_cases` are canonical in the frontend domain. Singular backend fields are converted only in `normalizePalette()`.
- Backend and database renaming are not part of WP1.
- `src/lib/palette/schema.ts` must be reframed, renamed, deprecated, or replaced so it no longer claims the old experimental palette-level preview schema is canonical. Required legacy imports must be preserved deliberately.

### Chart Types and Applicability

```typescript
type ChartFamily =
  | 'bar'
  | 'distribution'
  | 'line'
  | 'heatmap'

type ChartType =
  | 'bar_error'
  | 'boxplot_jitter'
  | 'line_multiseries'
  | 'heatmap_annotated'

type ChartSuitability =
  | 'best_fit'
  | 'recommended'
  | 'compatible'
  | 'limited'

interface ChartTypeApplicability {
  chart_type: ChartType
  suitability: ChartSuitability
  notes?: string
  source?: 'curated' | 'legacy_chart_types'
}

function resolveChartTypes(palette: Palette): ChartType[] {
  if (palette.chart_applicability !== undefined) {
    return palette.chart_applicability.map((item) => item.chart_type)
  }

  return palette.chart_types
}
```

`chart_applicability` nullability semantics:

- `undefined` / database `NULL`: not migrated yet; read legacy `chart_types`.
- `[]`: migrated and explicitly has no declared applicable chart type; do not fall back to legacy `chart_types`.

`chart_applicability` validation and derivation rules:

- Chart applicability answers: which chart types is this palette suitable for?
- Preview cases answer: how should a specific chart preview be rendered?
- Chart applicability may include chart type, suitability level, optional rationale, and provenance indicating whether the value is curated or inferred from legacy `chart_types`.
- Chart applicability must not contain renderer configuration, deterministic mock data, color-role mapping, preview publication state, or preview-specific layout settings.
- Legacy `chart_types` may be converted into inferred compatibility applicability entries, but must not be described as semantically equivalent to curated applicability.
- The same `chart_type` must not appear more than once.
- At most one entry may use `suitability: 'best_fit'`.
- A palette may have zero or one `best_fit` chart type.
- `best_fit` describes the strongest suitability relationship for a chart type; it is not the same concept as `preview_case.is_primary`.
- Admin-defined array order is canonical.
- Use the canonical array order for tag display and `chart_types` derivation.
- Do not automatically sort by suitability unless a future decision explicitly changes this.
- Admin UI should prevent duplicate chart type entries before submit.

### Color References

```typescript
interface PaletteColorReference {
  source: 'palette'
  color_id: string
  opacity?: number
}

interface ThemeColorReference {
  source: 'theme'
  token:
    | 'foreground'
    | 'muted_foreground'
    | 'grid'
    | 'background'
  opacity?: number
}

type VisualColorReference =
  | PaletteColorReference
  | ThemeColorReference

interface NamedColorRole {
  key: string
  label: string
  color: PaletteColorReference
}
```

Data-encoding roles must use `PaletteColorReference`. Utility roles may use `ThemeColorReference`.

Color reference rules:

- Preview role mapping and preview color selection must reference palette colors through `color_id`.
- Do not use raw HEX as identity.
- Do not use array index as canonical identity.
- Do not rely on positional assumptions without validation.
- Missing references must not silently fall back to the full palette or another color.
- Duplicate references must be explicitly validated where duplicates are invalid.
- Color resolution utilities return structured validation errors that identify the unresolved `color_id`.

### Palette Preview Case

```typescript
interface BasePalettePreviewCase<
  TChartType extends ChartType,
  TColorRoles,
  TPreviewConfig
> {
  id: string
  palette_id: string
  chart_type: TChartType
  template_id: string
  template_version: number
  schema_version: number
  color_roles: TColorRoles
  preview_config: TPreviewConfig
  seed_strategy: 'stable_id' | 'fixed'
  seed_value?: number
  is_primary: boolean
  status: 'draft' | 'published' | 'archived'
  created_at: string
  updated_at: string
}
```

Preview Case rules:

- A palette can have at most one primary preview.
- Only published preview cases can be primary.
- Setting a new primary preview must unset the old primary preview in the same transaction.
- Draft preview cases must not appear in public Palette Card or Detail Page responses.
- Archived preview cases must not be selected as default previews.
- The same palette, chart type, template, and template version must not have duplicate non-archived preview cases.
- `template_version` describes visual template version.
- `schema_version` describes `color_roles` and `preview_config` JSON structure version.
- Updating a published preview case must validate the complete replacement payload before the transaction commits.
- Invalid intermediate published states must never be persisted.

### Phase 1 Color Role Mapping

```typescript
interface BarErrorColorRoles {
  groups: Array<{
    key: string
    label: string
    fill: PaletteColorReference
  }>
  elements: {
    error_bar: VisualColorReference
    significance?: VisualColorReference
    outline?: VisualColorReference
    axis?: VisualColorReference
  }
}

interface BoxplotJitterColorRoles {
  groups: NamedColorRole[]
  elements: {
    jitter_point?: VisualColorReference
    median_line?: VisualColorReference
    whisker?: VisualColorReference
    outline?: VisualColorReference
    axis?: VisualColorReference
  }
}

interface LineSeriesRole {
  key: string
  label: string
  line: PaletteColorReference
  confidence_band?: VisualColorReference
  marker?: VisualColorReference
}

interface LineMultiseriesColorRoles {
  series: LineSeriesRole[]
  elements: {
    axis?: VisualColorReference
    grid?: VisualColorReference
    reference_line?: VisualColorReference
  }
}

interface ScaleStopRole {
  position: number
  color: PaletteColorReference
  label?: string
}

interface HeatmapAnnotatedColorRoles {
  scale: {
    type: 'sequential' | 'diverging'
    stops: ScaleStopRole[]
  }
  annotations?: NamedColorRole[]
  elements: {
    missing_value?: VisualColorReference
    text?: VisualColorReference
    border?: VisualColorReference
  }
}
```

`groups`, `series`, `annotations`, and heatmap `stops` must support variable counts. Heatmap Phase 1 may require 3 stops, but the schema must not hard-code `low` / `mid` / `high`.

### Phase 1 Preview Configuration

Structural counts should be derived from role collections whenever possible.

Do not store:

- `group_count` when `groups.length` is available.
- `series_count` when `series.length` is available.
- `annotation_tracks` when `annotations.length` is the same concept.
- `show_significance`, `show_confidence_band`, `show_markers`, or `show_jitter` when role presence is enough.

```typescript
interface BarErrorPreviewConfig {
  orientation: 'vertical' | 'horizontal'
  sample_size: number
  error_type: 'sd' | 'sem' | 'ci'
  significance_style?: 'stars' | 'p_value'
  data_pattern:
    | 'treatment_higher'
    | 'treatment_lower'
    | 'dose_response'
    | 'mixed'
  x_axis_label?: string
  y_axis_label?: string
}

interface BoxplotJitterPreviewConfig {
  jitter_density: 'low' | 'medium' | 'high'
  show_outliers: boolean
  show_violin?: boolean
  y_axis_label?: string
}

interface LineMultiseriesPreviewConfig {
  point_count: number
  curve_shape:
    | 'increasing'
    | 'decreasing'
    | 'sigmoid'
    | 'peak'
    | 'mixed'
  x_axis_label?: string
  y_axis_label?: string
}

interface HeatmapAnnotatedPreviewConfig {
  rows: number
  columns: number
  cluster_rows: boolean
  cluster_columns: boolean
  show_row_labels: boolean
  show_column_labels: boolean
  show_values: boolean
  data_pattern:
    | 'two_clusters'
    | 'three_clusters'
    | 'gradient'
    | 'mixed'
}
```

### Generated Outputs

`exported_core_colors` and `copy_blocks` are derived outputs. They are not independently editable database truth.

```typescript
interface ExportedCoreColor {
  role: string
  label: string
  hex: string
  color_id: string
  usage?: string
}

interface CopyBlocks {
  r?: Record<string, string>
  python?: Record<string, string>
  json?: Record<string, unknown>
  css?: Record<string, string>
  graphpad?: string[]
}
```

Rules:

- Resolve palette-sourced role mappings through `palette.colors`.
- Theme-token utility roles do not become exported palette colors.
- Generate `exported_core_colors` from `preview_case.color_roles`.
- Generate copy blocks at runtime through export generators.
- Do not store full generated code strings as editable palette data.
- If a preview case is missing, use raw `palette.colors` for non-chart-specific display.

## API Contracts

Codex must audit the existing route style before implementing final endpoint names. The routes below define required behavior and DTO shape.

### Public Palette List

Provisional route:

```text
GET /api/palettes
```

```typescript
interface PublicPaletteListItemDTO {
  id: string
  slug: string
  name: string
  description?: string
  status: 'published'
  colors: PaletteColor[]
  chart_types: ChartType[]
  disciplines: string[]
  use_cases: string[]
  avoid_cases: string[]
  tags: string[]
  published_primary_preview?: PublishedPreviewRenderDTO
}

interface PreviewRenderPayloadDTO {
  id: string
  chart_type: ChartType
  template_id: string
  template_version: number
  schema_version: number
  color_roles: unknown
  preview_config: unknown
  seed_strategy: 'stable_id' | 'fixed'
  seed_value?: number
}

interface PublishedPreviewRenderDTO
  extends PreviewRenderPayloadDTO {}
```

Rules:

- Return palette metadata.
- Return canonical colors.
- Return resolved chart types.
- Return a published primary preview render payload when one exists.
- Do not return full `chart_applicability`; detail endpoint owns that richer suitability data unless Browse UI explicitly needs it later.
- Do not return draft preview cases.
- Do not return archived preview cases as defaults.

### Public Palette Detail

Provisional route:

```text
GET /api/palettes/:slug
```

```typescript
interface PublicPaletteDetailDTO {
  palette: PublicPaletteListItemDTO
  chart_applicability: ChartTypeApplicability[]
  resolved_primary_preview?: PublishedPreviewCaseDTO
  exported_core_colors: ExportedCoreColor[]
}

interface PreviewCaseBaseDTO
  extends PreviewRenderPayloadDTO {
  palette_id: string
  is_primary: boolean
  created_at: string
  updated_at: string
}

interface PublishedPreviewCaseDTO
  extends PreviewCaseBaseDTO {
  status: 'published'
}
```

Phase 1 public detail returns only `resolved_primary_preview`. Admin APIs own access to all preview cases. Public multiple-preview data and UI are deferred.

Detail rules:

- Return full `chart_applicability`.
- Return the resolved published primary preview when one exists.
- Do not return all published preview cases in Phase 1.
- Do not return draft or archived preview cases.

### Admin Preview Case Operations

Required operations, to adapt to audited admin route style:

| Operation | Provisional route | Behavior |
|-----------|-------------------|----------|
| Create preview case | `POST /api/admin/palettes/:palette_id/preview-cases` | Create draft preview case |
| Update preview case | `PATCH /api/admin/preview-cases/:id` | Update roles/config/template/seed only. Status is not accepted in this DTO. |
| Delete draft preview case | `DELETE /api/admin/preview-cases/:id` | Hard delete draft preview case only. |
| Archive preview case | `POST /api/admin/preview-cases/:id/archive` | Archive draft or published preview case. Published preview cases must use archive, not hard delete. |
| Publish preview case | `POST /api/admin/preview-cases/:id/publish` | Validate and mark published |
| Set primary preview | `POST /api/admin/preview-cases/:id/set-primary` | Require published and update primary transactionally |

```typescript
interface AdminPreviewCaseDTO
  extends PreviewCaseBaseDTO {
  status: 'draft' | 'published' | 'archived'
}

interface AdminPreviewCaseMutationResultDTO {
  preview_case?: AdminPreviewCaseDTO
  validation: ValidationResult<unknown>
}
```

Admin responses must preserve detailed validation issues so the UI can show field-level and JSON-path errors.

Status transition rules:

- `PATCH` must not update `status`.
- `publish` is the only operation that moves `draft` to `published`.
- `archive` is the operation that moves `draft` or `published` to `archived`.
- `DELETE` is allowed only for `draft`.
- Published preview cases must not be hard deleted in Phase 1.
- Archived preview cases are not recoverable in Phase 1.
- `set-primary` must not publish implicitly.

## Database Design

Migration-number rule:

- Repository policy audit resolved that the local test-user seed is development-only and must not be part of the production migration chain.
- The seed file lives at `backend/dev/seed_test_users.sql` and can be run manually for local development.
- Production preview migrations start at `013_persist_palette_color_ids.sql`, followed by `014_add_chart_applicability.sql` and `015_create_palette_preview_cases.sql`.
- Do not create another migration numbered `012`.

```sql
ALTER TABLE palettes
ADD COLUMN chart_applicability JSONB;

CREATE TABLE palette_preview_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    palette_id UUID NOT NULL
        REFERENCES palettes(id)
        ON DELETE CASCADE,

    chart_type VARCHAR(50) NOT NULL,

    template_id VARCHAR(100) NOT NULL,
    template_version INTEGER NOT NULL DEFAULT 1,
    schema_version INTEGER NOT NULL DEFAULT 1,

    color_roles JSONB NOT NULL,
    preview_config JSONB NOT NULL,

    seed_strategy VARCHAR(30)
        NOT NULL DEFAULT 'stable_id',
    seed_value INTEGER,

    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(20) NOT NULL DEFAULT 'draft',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_palette_preview_cases_status
        CHECK (status IN ('draft', 'published', 'archived')),

    CONSTRAINT chk_palette_preview_cases_seed_strategy
        CHECK (seed_strategy IN ('stable_id', 'fixed')),

    CONSTRAINT chk_palette_preview_cases_fixed_seed_value
        CHECK (seed_strategy <> 'fixed' OR seed_value IS NOT NULL),

    CONSTRAINT chk_palette_preview_cases_primary_published
        CHECK (is_primary = FALSE OR status = 'published')
);

CREATE INDEX idx_palette_preview_cases_palette_id
ON palette_preview_cases(palette_id);

CREATE INDEX idx_palette_preview_cases_chart_type
ON palette_preview_cases(chart_type);

CREATE UNIQUE INDEX idx_one_primary_preview_per_palette
ON palette_preview_cases(palette_id)
WHERE is_primary = TRUE;

CREATE UNIQUE INDEX idx_unique_active_preview_case
ON palette_preview_cases(
    palette_id,
    chart_type,
    template_id,
    template_version
)
WHERE status <> 'archived';
```

Database rules:

- Keep existing palette fields.
- Do not add palette-level `chart_family`, `functional_roles`, `preview_template`, `preview_config`, `exported_core_colors`, or `copy_blocks` as editable canonical fields.
- `chart_types` remains available for compatibility and filtering.
- New admin writes persist `chart_applicability`; backend derives `chart_types`.
- Existing palette `colors` JSONB must be backfilled with stable persisted color IDs before persisted preview cases reference `color_id`.
- WP2 must not persist preview cases that reference color IDs until all persisted palette colors have stable IDs.
- If color-ID backfill and preview-case table creation are in the same migration/work package, the migration must backfill and validate color IDs before preview-case records can reference them.
- Persisted preview cases must not depend on index-derived compatibility IDs as permanent references.
- `chart_applicability IS NULL` means not migrated; public reads may fall back to legacy `chart_types`.
- `chart_applicability = []` means migrated and explicitly no declared applicable chart types; do not fall back to legacy `chart_types`.
- Before changing the `palettes.type` constraint, WP2 must choose how to handle legacy `qualitative` and `heatmap`: retain a broader DB constraint, explicitly migrate records, or represent legacy values separately while preventing new creation.
- Active preview uniqueness applies only to non-archived preview cases.
- This active uniqueness rule is a deliberate Phase 1 simplification: the same palette/chart type/template/template version cannot have both a published case and a separate draft revision. Editing a published preview updates the same record through the admin flow. Separate draft revision records require a future revision/version model and are out of scope.

After Phase 1, reassess whether `chart_applicability` should move from JSONB to a normalized table.

## Frontend Design

Current repo paths must be confirmed in WP0. Expected frontend areas:

```text
src/
  types/
    palette.ts

  lib/
    palette/
      schema.ts
      colorReferences.ts
      resolveColors.ts
      applicability.ts

    chart-types/
      registry.ts
      types.ts
      bar-error/
      boxplot-jitter/
      line-multiseries/
      heatmap-annotated/

    deterministic/
      seed.ts
      random.ts

    exports/
      python.ts
      r.ts
      json.ts
      css.ts
      graphpad.ts

  components/
    PaletteCard.vue
    palettes/
      PaletteChartPreview.vue
      previews/

  views/
    PaletteDetailView.vue
    PalettesView.vue
    admin/
      palettes/
        AdminPaletteForm.vue
        AdminPreviewCaseEditor.vue

  api/
    palettes.ts
    admin.ts
```

Frontend rules:

- Shared pages use registry lookup rather than chart-type conditionals spread across the app.
- Palette Card and Detail Page must not depend on journal screenshots.
- Public pages display only published previews.
- Admin editor may show draft suggestions and validation issues.
- Existing Browse Palettes and Paper Project flows must keep working.
- Direct Palette Detail routes must eventually call `GET /api/palettes/:slug`; the list cache may be used as an optimization only. Direct navigation and page refresh must work independently of prior Browse Palettes loading. This is an API integration/compatibility task, not WP1 type work.
- Paper Project compatibility is protected:
  - `Palette.id` remains available.
  - `Palette.colors[].hex` remains available.
  - legacy `Palette.chart_type` access remains available through an adapter during transition.
  - project-local role keys remain stable.
  - `figure.selectedRoleKeys` semantics do not change.
  - WP1 does not refactor `AddPaletteModal.vue`.
  - future public-palette color IDs must not be confused with project-local role IDs unless an explicit mapping is introduced.

Chart Type Registry contract:

```typescript
interface ChartTemplateDefinition<TConfig, TMockData> {
  id: string
  version: number
  renderer: Component

  createDefaultPreviewConfig: () => TConfig

  generateMockData: (
    seed: number,
    config: TConfig
  ) => TMockData

  validatePreviewConfig: (
    config: unknown
  ) => ValidationResult<TConfig>
}

interface ChartTypeDefinition<TRoles> {
  id: ChartType
  family: ChartFamily
  label: string

  createDefaultColorRoles: (
    palette: Palette
  ) => TRoles

  validateColorRoles: (
    palette: Palette,
    roles: unknown
  ) => ValidationResult<TRoles>

  templates: Record<
    string,
    ChartTemplateDefinition<any, any>
  >

  default_template_id: string
}

export const chartTypeRegistry = {
  bar_error: barErrorDefinition,
  boxplot_jitter: boxplotJitterDefinition,
  line_multiseries: lineMultiseriesDefinition,
  heatmap_annotated: heatmapAnnotatedDefinition
}
```

`template_id` must be validated through `chartTypeRegistry[chart_type].templates`. Do not accept arbitrary template strings.

## Backend Design

Expected backend areas, subject to WP0 audit:

```text
backend/
  internal/
    palette/
      handler.go
      model.go
      repository.go
      service.go
      validation.go

  migrations/
    013_add_palette_preview_cases.sql

  tests/
    palette_preview_cases_test.go
```

Package placement rule:

- Prefer a separate `backend/internal/previewcase/` package if WP0 shows the backend uses entity-oriented packages or if `palette` would become too large.
- Otherwise extend `backend/internal/palette/` consistently with existing project style.
- Palette service may aggregate preview case data for public palette list/detail responses.

Backend rules:

- Handler exposes public and admin routes using existing router style.
- Repository owns SQL read/write.
- Service enforces business rules and transactions.
- Public palette response aggregation belongs in the service layer.
- Repository methods remain SQL-focused and may expose helpers for preview-case and primary-preview queries.
- Palette service assembles public DTOs that include canonical palette data, chart applicability, resolved primary published preview, and derived fields such as `exported_core_colors` when required.
- Handlers parse requests and return service DTOs; they do not compose frontend response payloads.
- Derived public response fields must not become duplicate canonical database truth without a documented reason.
- Validation returns detailed `ValidationResult`.
- Public queries filter draft preview cases.
- Default preview selection ignores archived preview cases.
- Publish validates chart type, template, roles, config, seed, and status.
- Updating a published preview validates the full replacement payload before commit; invalid published intermediate state must not be written.
- Set primary requires `published` and unsets the old primary in the same transaction.
- Repository should not decide semantic validity of JSON; service/validation should.

## Validation Rules

Do not use boolean-only type predicates for validation.

Pure color-reference and applicability utilities should use structured result objects:

```typescript
type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; errors: E[] }
```

Do not silently fall back for:

- missing `color_id`
- duplicate references where duplicates are invalid
- contradictory applicability entries
- unknown chart type
- malformed HEX
- invalid preview role assignment

UI fallback rendering may exist later, but it must be a deliberate presentation-layer decision and must not erase domain validation errors.

```typescript
interface ValidationIssue {
  path: string
  code: string
  message: string
}

interface ValidationResult<T> {
  valid: boolean
  value?: T
  issues: ValidationIssue[]
}
```

Wire format:

```json
{
  "valid": false,
  "issues": [
    {
      "path": "color_roles.groups[1].fill.color_id",
      "code": "COLOR_NOT_FOUND",
      "message": "Referenced palette color does not exist."
    }
  ]
}
```

Validation wire rules:

- Frontend and backend must use the same JSON field names: `valid`, `value`, and `issues`.
- `path` uses dot/bracket notation.
- `code` uses stable `UPPER_SNAKE_CASE`.
- `message` is admin-facing English text.
- Frontend logic must depend on `code` and `path`, not on `message`.

Validation must cover:

- Color ID does not exist in `palette.colors`.
- Duplicate role key.
- Duplicate `chart_applicability.chart_type`.
- More than one `chart_applicability` entry with `suitability: 'best_fit'`.
- Opacity outside `0` to `1`.
- Illegal heatmap stop count.
- Template does not belong to chart type.
- `seed_strategy: 'fixed'` without `seed_value`.
- Draft preview set as primary.
- Invalid status.
- Invalid chart type.
- Roles and config structure mismatch.

Backend UI must display these errors. Admin JSON editor must map `path` to the relevant field when possible.

## Deterministic Rendering Rules

Default seed is based on stable preview identity:

```text
palette.id
+ chart_type
+ template_id
+ template_version
```

Requirements:

- Use FNV-1a 32-bit or an existing project deterministic hash verified in WP0.
- `seed_strategy: 'stable_id'` hashes the stable identity.
- `seed_strategy: 'fixed'` uses `seed_value` as the final seed and does not combine it with the stable identity.
- Do not use runtime random hashes.
- Do not depend on object serialization order.
- Do not use uncontrolled `Math.random()`.
- Slug renames must not change previews.
- The same seed and config must produce the same mock data.
- Mock data generators do not handle colors.
- Renderers do not generate mock data.
- Component tests must verify renderers do not call `Math.random()` and do not mutate inputs.

```typescript
interface PreviewSeedInput {
  palette_id: string
  chart_type: ChartType
  template_id: string
  template_version: number
  seed_strategy: 'stable_id' | 'fixed'
  seed_value?: number
}

function createPreviewSeed(input: PreviewSeedInput): number {
  if (input.seed_strategy === 'fixed') {
    if (input.seed_value === undefined) {
      throw new Error('FIXED_SEED_VALUE_REQUIRED')
    }

    return input.seed_value
  }

  return hashStablePreviewIdentity(input)
}

function generateMockData<TPreviewConfig, TMockData>(
  seed: number,
  config: TPreviewConfig
): TMockData
```

## Work Packages

### WP0 - Repository Audit

Goal: Confirm actual repo structure, current models, routes, fields, migrations, and tests before implementation.

Files expected:

- Documentation only: `docs/figcolor-scientific-preview-system-plan.md` may be annotated if needed.
- Read-only audit of `src/...`, `backend/internal/...`, `backend/migrations/...`, package scripts, and tests.

Tasks:

- Find current frontend palette interfaces and API helpers.
- Find current backend palette handler/model/repository/service pattern.
- Inspect migrations and palette table shape.
- Inspect Palette Card, Detail Page, Add/Edit Palette, Browse filters, and Paper Project.
- Inspect current public/admin route style.
- Identify test commands.
- Record incompatibilities and minimal migration plan.

Out of scope:

- No domain model edits.
- No migrations.
- No API behavior changes.
- No component rewrites.

Acceptance criteria:

- Real paths are documented.
- Existing fields and DTO names are known.
- Final endpoint names are chosen or blockers are listed.
- Backward compatibility requirements are listed.

Validation commands:

- `rg --files`
- `rg "Palette|palette|chart_types|colors|discipline|use_case|avoid_case" src backend`
- `git status --short`

Stop point: Stop after reporting audit findings. Do not start WP1 until the audit is accepted or no blocker remains.

### WP1 - Canonical Domain Types

Goal: Establish one explicit frontend canonical palette domain and the pure utility layer required for future persisted preview cases.

WP1 implements this frontend-only data flow:

```text
Raw API DTO
    ↓
normalizePalette()
    ↓
CanonicalPalette
    ↓
explicit legacy compatibility adapters/selectors
    ↓
existing components
```

Files expected:

- `src/types/palette.ts`
- `src/lib/palette/schema.ts`
- `src/lib/palette/colorReferences.ts`
- `src/lib/palette/applicability.ts`
- `src/lib/palette/resolveColors.ts`
- `src/lib/palette.ts`

Tasks:

- Add canonical `CanonicalPalette` types without duplicate singular/plural domain fields.
- Add raw API DTO types that reflect `chart_types`, legacy `chart_type`, singular/plural metadata fields, current color objects, future persisted color IDs, and legacy experimental preview fields.
- Add one `normalizePalette()` boundary for raw DTO normalization.
- Preserve compatibility access to `palette.chart_type`, `palette.discipline`, `palette.use_case`, `palette.avoid_case`, `palette.id`, `palette.colors[].hex`, `palette.journal_style`, `palette.color_count`, and `palette.tags` through explicit adapters/selectors.
- Preserve Paper Project compatibility without refactoring `AddPaletteModal.vue`.
- Reframe `src/lib/palette/schema.ts` so the old experimental palette-level preview schema is not presented as canonical truth.
- Preserve old schema imports deliberately when still required.
- Normalize colors to include `id`, `hex`, derived `rgb`, optional `label`, and explicit `order`.
- Preserve persisted color IDs and generate documented transitional compatibility IDs for legacy colors without IDs.
- Preserve legacy `qualitative` and `heatmap` palette type values explicitly; do not silently coerce them.
- Add `ChartFamily`, `ChartType`, `ChartTypeApplicability`, and `resolveChartTypes`.
- Add `PaletteColorReference`, `ThemeColorReference`, and `VisualColorReference`.
- Add color-reference utilities that validate/resolve `color_id` and return structured errors.
- Add color-resolution utilities that do not silently fall back to full palette colors.
- Add chart-applicability helpers that distinguish curated applicability from inferred legacy `chart_types`.
- Add `BasePalettePreviewCase`.
- Add `ValidationIssue` and `ValidationResult`.
- Add lightweight fixture/assertion validation for pure normalization and resolution behavior without introducing a large test stack unless justified.

Out of scope:

- No migrations.
- No backend persistence.
- No renderer work.
- No admin UI redesign.
- No Phase 2 chart types.
- No public API shape changes.
- No preview-case routes.
- No deterministic mock-data generators.
- No preview lifecycle actions.

Acceptance criteria:

- One canonical frontend palette model is identifiable.
- Raw DTO and canonical domain are separate.
- Normalization happens at one explicit boundary.
- No component-level singular/plural normalization is introduced.
- Existing frontend imports are not broken.
- Existing consumers retain required compatibility.
- Paper Project remains intact.
- Colors have IDs and explicit order.
- Compatibility color IDs are documented as transitional.
- Missing color references produce structured errors.
- Chart applicability is distinct from preview cases.
- Experimental palette-level preview fields are not canonical truth.
- Legacy palette DTOs can normalize to canonical shape.
- `chart_applicability` drives `resolveChartTypes` when present.
- TypeScript types compile.
- `npm run build` succeeds.
- No backend or persistence work is included.

Validation commands:

- `./node_modules/.bin/vue-tsc --noEmit`
- `npm run build`
- Lightweight fixture/assertion command covering at least:
  - current API `chart_types`
  - legacy `chart_type`
  - singular/plural metadata normalization
  - persisted color IDs
  - generated compatibility IDs
  - HEX-to-RGB derivation
  - missing color reference
  - duplicate reference behavior
  - preservation of `qualitative` and `heatmap`
  - legacy `chart_type` component access

Stop point: Stop after types compile and report changed files.

### WP2 - Database Migration and Backend Models

Goal: Add persistence for `chart_applicability` and `palette_preview_cases`, plus backend model/repository/service/API DTO foundations.

Files expected:

- `backend/migrations/013_add_palette_preview_cases.sql` or next available migration number after resolving whether untracked migration `012` is intentional.
- `backend/internal/palette/model.go`
- `backend/internal/palette/repository.go`
- `backend/internal/palette/service.go`
- `backend/internal/palette/handler.go`
- `backend/internal/palette/validation.go`
- Backend test files in audited test location.

Tasks:

WP2 must be executed as internal sub-steps with a short report after each sub-step:

- WP2 preflight: Migration numbering is resolved. `012` is reserved for the development-only seed moved to `backend/dev/seed_test_users.sql`; production preview migrations use `013`-`015`.
- WP2 preflight: Decide legacy palette type persistence strategy for `qualitative` and `heatmap`: keep broader DB constraint, explicitly migrate records, or represent legacy values separately and prevent new creation.
- WP2A: Add migration and Go models/DTOs. The migration must add `chart_applicability`, backfill stable color IDs into existing `palettes.colors` JSONB, validate that persisted palette colors have IDs, and only then create preview-case structures that can reference `color_id`.
- WP2B: Implement repository CRUD for preview cases and `chart_applicability` persistence.
- WP2C: Implement service validation, published replacement validation, `chart_types` synchronization, draft hard delete, archive/publish rules, and set-primary transaction.
- WP2D: Implement public/admin handler contracts using the audited route style.
- Add or update backend tests for each sub-step.

Out of scope:

- No frontend renderer work.
- No dynamic admin editor.
- No Phase 2 chart types.
- No normalized `chart_applicability` table migration in Phase 1.

Acceptance criteria:

- Migration applies cleanly.
- Migration number is unambiguous and documented.
- Existing persisted palette colors have stable IDs before preview case records can reference them.
- Legacy palette type persistence decision is implemented or explicitly blocked before constraint changes.
- Backend compiles.
- Repository/service tests cover primary, draft, archive, and public filtering.
- Public DTOs never include draft preview cases.

Validation commands:

- Backend test command discovered in WP0.
- `go test ./...` if applicable.
- Migration command used by the project, if available.

Stop points:

- Stop after WP2A and report migration/model status.
- Stop after WP2B and report repository CRUD status.
- Stop after WP2C and report service validation/transaction status.
- Stop after WP2D and report handler/API contract status.
- Final WP2 stop: stop after backend tests pass or blockers are reported.

### WP3 - Registry and Deterministic Infrastructure

Goal: Build chart type registry, template lookup, detailed validation, deterministic seed, and PRNG infrastructure.

Files expected:

- `src/lib/chart-types/types.ts`
- `src/lib/chart-types/registry.ts`
- `src/lib/chart-types/*/definition.ts`
- `src/lib/chart-types/*/validation.ts`
- `src/lib/deterministic/seed.ts`
- `src/lib/deterministic/random.ts`
- `src/lib/palette/resolveColors.ts`

Tasks:

- Add `ChartTemplateDefinition`.
- Add `ChartTypeDefinition`.
- Add `ValidationResult`-based template and role validation.
- Add template lookup that rejects arbitrary `template_id`.
- Add stable seed generation using FNV-1a 32-bit or audited deterministic hash.
- Add deterministic PRNG.
- Add color resolution helpers.

Out of scope:

- No full renderer implementation except skeletons required for typing.
- No admin editor UI.
- No backend route changes unless required by shared DTO alignment.
- No automatic capability inference.

Acceptance criteria:

- Template lookup validates chart type/template relationship.
- Seed does not depend on slug or object serialization order.
- Validation returns detailed issues.
- No code path uses uncontrolled `Math.random()` for mock data.

Validation commands:

- `./node_modules/.bin/vue-tsc --noEmit`
- Frontend unit test command discovered in WP0.

Stop point: Stop after registry and deterministic unit tests pass.

### WP4 - bar_error Vertical Slice

Goal: Implement `bar_error` end to end as the first complete chart type.

Files expected:

- `src/lib/chart-types/bar-error/roles.ts`
- `src/lib/chart-types/bar-error/config.ts`
- `src/lib/chart-types/bar-error/validation.ts`
- `src/lib/chart-types/bar-error/mockData.ts`
- `src/lib/chart-types/bar-error/definition.ts`
- `src/components/palettes/previews/BarErrorPreview.vue`
- `src/components/palettes/PaletteChartPreview.vue`
- `src/components/PaletteCard.vue`
- `src/views/PaletteDetailView.vue`
- `src/views/admin/palettes/AdminPaletteForm.vue`
- `src/lib/exports/*`
- Related tests.

Tasks:

WP4 must be executed as internal sub-steps with a short report after each sub-step:

- WP4A: Implement bar roles, config schema, validation, deterministic mock data, template definition, SVG renderer, and renderer tests.
- WP4B: Integrate public Palette Card and Detail Page using the published primary preview render payload.
- WP4C: Integrate admin draft suggestion, create/edit/publish flow, and validation issue display for `bar_error`.
- WP4D: Generate exported colors and copy outputs from `bar_error` roles.
- Add or update tests for each sub-step.

Out of scope:

- No remaining chart types.
- No public multiple-preview switcher.
- No automatic role inference beyond draft suggestion.
- No unrelated visual redesign.

Acceptance criteria:

- `bar_error` renders in card and hero sizes.
- Optional significance role behaves correctly.
- Renderer does not mutate inputs.
- Renderer does not call `Math.random()`.
- Invalid roles/config cannot publish.
- Existing Browse and Paper Project flows still work.

Validation commands:

- `./node_modules/.bin/vue-tsc --noEmit`
- Frontend test command discovered in WP0.
- Backend test command if API behavior changed.

Stop points:

- Stop after WP4A and report renderer/test status.
- Stop after WP4B and report public Card/Detail integration status.
- Stop after WP4C and report admin publish/validation status.
- Stop after WP4D and report export status.
- Final WP4 stop: stop after the full `bar_error` vertical slice passes tests and public fallback still works.

### WP5 - Remaining Three Chart Types

Goal: Add `boxplot_jitter`, `line_multiseries`, and `heatmap_annotated` using the same registry pattern.

Files expected:

- `src/lib/chart-types/boxplot-jitter/*`
- `src/lib/chart-types/line-multiseries/*`
- `src/lib/chart-types/heatmap-annotated/*`
- `src/components/palettes/previews/BoxplotJitterPreview.vue`
- `src/components/palettes/previews/LineMultiseriesPreview.vue`
- `src/components/palettes/previews/HeatmapAnnotatedPreview.vue`
- Related tests.

Tasks:

- Implement roles, config, validation, mock data, template definition, and SVG renderer for each chart type.
- Register each chart type.
- Verify variable groups, series, annotations, and heatmap stops.
- Add card and hero rendering tests.

Out of scope:

- No Phase 2 chart types.
- No chart type outside the four Phase 1 types.
- No public template switching.
- No automatic capability inference.

Acceptance criteria:

- All four Phase 1 chart types render deterministically.
- Each renderer supports card and hero sizes.
- Optional roles are handled.
- Heatmap validates stop counts.

Validation commands:

- `./node_modules/.bin/vue-tsc --noEmit`
- Frontend unit/component test command discovered in WP0.

Stop point: Stop after all four chart types pass renderer and validation tests.

### WP6 - Legacy Compatibility and Fallback

Goal: Ensure old palettes and missing preview data do not break public or project flows.

Files expected:

- `src/lib/palette/applicability.ts`
- `src/lib/palette/schema.ts`
- `src/components/palettes/PaletteChartPreview.vue`
- `src/components/PaletteCard.vue`
- `src/views/PaletteDetailView.vue`
- `src/views/PalettesView.vue`
- `src/components/project/*`
- Backend public palette handlers/services.

Tasks:

- Handle palettes without `chart_applicability`.
- Handle palettes without preview cases.
- Implement public fallback order.
- Ensure draft previews never leak to public pages.
- Fix direct Palette Detail loading: `PaletteDetailView.vue` must call `GET /api/palettes/:slug` on direct navigation or refresh. The list cache may be used only as an optimization.
- Preserve Browse filters.
- Preserve Paper Project compatibility.

Out of scope:

- No admin editor expansion.
- No automatic public chart-specific preview generation.
- No public multiple-preview switcher.

Acceptance criteria:

- Legacy palette without applicability works.
- Legacy palette without preview case works.
- Palette with one primary preview works.
- Palette with multiple previews resolves only the published primary by default.
- Direct navigation to `/palettes/:slug` works without visiting Browse Palettes first.
- Browse filtering and Paper Project are not regressed.

Validation commands:

- `./node_modules/.bin/vue-tsc --noEmit`
- Frontend integration test command discovered in WP0.
- Backend API tests for public responses.

Stop point: Stop after legacy compatibility tests pass.

### WP7 - Admin Experience and Export

Goal: Complete admin dynamic editing, live preview, validation display, and copy outputs.

Files expected:

- `src/views/admin/palettes/AdminPaletteForm.vue`
- `src/views/admin/palettes/AdminPreviewCaseEditor.vue`
- `src/api/admin.ts`
- `src/lib/exports/python.ts`
- `src/lib/exports/r.ts`
- `src/lib/exports/json.ts`
- `src/lib/exports/css.ts`
- `src/lib/exports/graphpad.ts`
- Backend admin handlers/services.
- Related tests.

Tasks:

- Build chart applicability editor.
- Build preview case create/update/delete draft/archive/publish/set primary flows.
- Build registry-driven role editor.
- Build registry-driven preview config editor.
- Show live preview for draft edits.
- Show validation issues by field/path.
- Generate Python, R, JSON, and CSS copy outputs. Add GraphPad only after its format decision is resolved, or keep it behind an internal experimental plain ordered color list path.
- Keep JSON editor as Advanced / Debug mode.

Out of scope:

- No public multiple-preview switcher.
- No template switching UI unless Open Decision is resolved.
- No automatic role inference as a publishing source.
- No project-specific role overrides.

Acceptance criteria:

- Admin can create, edit, validate, hard delete draft, publish, archive, and set primary preview cases.
- Invalid roles/config cannot publish.
- Validation issues are visible and actionable.
- Copy outputs update when roles change.
- Python, R, JSON, and CSS exports are available.
- GraphPad is available only if its format decision is resolved; otherwise skip GraphPad or implement only an internal experimental plain ordered color list generator.

Validation commands:

- `./node_modules/.bin/vue-tsc --noEmit`
- Frontend component/integration tests.
- Backend admin API tests.

Stop point: Stop after admin workflow and export tests pass, or report Open Decision blockers.

## Test Requirements

### Unit Tests

Required coverage:

- Seed generation.
- Deterministic PRNG.
- Color resolution.
- Missing color validation.
- Duplicate role key validation.
- Applicability-to-chart-types derivation.
- Duplicate applicability chart type validation.
- Multiple `best_fit` applicability validation.
- Template lookup.
- Export generation.

### Component Tests

For every Phase 1 renderer:

- Card size rendering.
- Hero size rendering.
- Optional roles.
- No `Math.random()`.
- No input mutation.

### Backend Tests

Required coverage:

- Create preview case.
- Update preview case.
- Publish preview case.
- Hard delete draft preview case.
- Archive draft or published preview case.
- Set primary preview.
- Prevent draft primary.
- Public API only returns published previews.
- Cascade delete preview cases with palette.
- `chart_types` synchronization from `chart_applicability`.
- Duplicate `chart_applicability.chart_type` is rejected.
- More than one `best_fit` applicability entry is rejected.

### Integration Tests

Required coverage:

- Legacy palette without applicability.
- Legacy palette without preview case.
- Palette with one primary preview.
- Palette with multiple previews.
- Browse filtering.
- Paper Project compatibility.

## Migration and Backward Compatibility

- Phase 1 keeps existing palette fields.
- Phase 1 adds `chart_applicability` and `palette_preview_cases`.
- Legacy `chart_types` remain readable.
- New admin writes use `chart_applicability`; backend derives `chart_types`.
- Public pages use `resolveChartTypes`.
- Frontend canonical naming uses `chart_types`, `disciplines`, `use_cases`, and `avoid_cases`; legacy accessors remain adapter-only during migration.
- Existing palette colors must receive stable persisted IDs before preview-case role mappings use `color_id`.
- Index-derived frontend compatibility IDs are transitional and must not be treated as durable database references.
- Public Palette Card and Detail Hero do not use `source_image` as preview cover.
- Public fallback never shows unpublished generated chart-specific previews.
- Existing palettes without preview cases use deterministic generic preview, color-strip fallback, or placeholder.
- Existing Browse Palettes and Paper Project flows must not regress.
- Paper Project protected compatibility requirements:
  - `Palette.id` remains available.
  - `Palette.colors[].hex` remains available.
  - legacy `Palette.chart_type` access remains available through an adapter during transition.
  - project-local role keys remain stable.
  - `figure.selectedRoleKeys` semantics do not change.
  - future public-palette color IDs are not confused with project-local role IDs unless an explicit mapping is introduced.

## Acceptance Criteria

### Must Pass

- Four Phase 1 SVG renderers work.
- Palette Card and Detail Page no longer depend on journal screenshots.
- Previews are deterministic.
- Public pages use published primary preview when available.
- Legacy fallback works.
- Invalid roles/config cannot publish.
- Draft previews never appear in public API responses.
- Browse Palettes has no regression.
- Paper Project has no regression.
- Direct navigation to Palette Detail works without prior list-cache loading.
- `chart_applicability` is authoritative when present.
- Backend syncs `chart_types` from `chart_applicability`.
- Persisted preview cases reference stable persisted `color_id` values, not index-derived compatibility IDs.
- Validation returns detailed issues.
- Public Palette Card and Detail Hero do not use `source_image` or journal screenshot cover fields.

### Should Pass

- Python export.
- R export.
- JSON export.
- CSS export.
- GraphPad export, if format decision is resolved.
- Advanced JSON editor.
- Multiple preview cases supported in backend.
- Chart applicability display.
- Admin live preview.

### Deferred

- Automatic role inference as a publishing source.
- Automatic capability inference.
- Project-specific role overrides.
- Public multiple-preview switcher.
- Canvas renderer.
- Phase 2 chart types.
- Public template switching.

## Phase 1 Definition of Done

- All Must Pass acceptance criteria are met.
- All migrations are applied and documented.
- All four chart types have at least one tested example fixture.
- At least one real palette has a published primary preview for each chart type.
- Legacy palettes remain functional.
- Persisted palette colors have stable IDs before persisted preview cases reference them.
- No public page references journal screenshot cover fields or uses `source_image` as the preview cover.
- Public APIs do not expose draft preview cases.
- WP reports and unresolved deferred items are recorded.
- Open Decisions that block Must Pass criteria are resolved or explicitly deferred out of Phase 1.

## Open Decisions

### Open Decisions - Do Not Implement Until Resolved

Codex must stop and report if any item below blocks implementation. Do not decide these silently.

- Exact GraphPad export format.
- Whether template switching is exposed to users in Phase 1.
- WP2 persistence strategy for legacy palette type values `qualitative` and `heatmap`: keep broad DB constraint, explicit migration, or legacy-only representation plus prevention of new creation.
- WP2 migration numbering: resolved by moving the test-user seed out of `backend/migrations` to `backend/dev/seed_test_users.sql`.
- WP2 persisted color-ID strategy: decide exact JSONB backfill format and validation before preview-case records reference `color_id`.
- Whether GraphPad export is required for Must Pass or remains Should Pass.

Post-Phase 1 reassessment items:

- Whether `chart_applicability` should move from JSONB to a normalized table.
- Whether the Phase 1 theme token set should expand beyond `foreground`, `muted_foreground`, `grid`, and `background`.
- Whether `source_image` remains part of palette data long term.
- Whether public detail should expose all published preview cases through API or UI.
- Heatmap scale semantics: the WP3F renderer currently maps generated matrix values from `[-1, 1]` into `[0, 1]` for both sequential and diverging scales. This is acceptable for Phase 1 integration, but sequential heatmaps may be semantically cleaner if future renderer/data generation emits native `[0, 1]` values while diverging heatmaps keep `[-1, 1]`.
- Heatmap legend midpoint polish: the WP3F legend marks a midpoint only when a scale stop is approximately at `position: 0.5`. This is sufficient for the initial diverging template, but future legend rendering may need to mark the actual middle stop or all interior stops when diverging midpoints are not exactly `0.5`.

*Phase 1 completion can be evaluated only after WP0 through WP7 stop points and the Definition of Done are satisfied without unresolved Must Pass blockers.*
