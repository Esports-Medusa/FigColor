/**
 * Canonical frontend palette domain for FigColor Scientific Preview Phase 1.
 *
 * Raw API payloads and legacy frontend payloads must be normalized into this
 * model before use. The legacy/experimental preview fields at the bottom of
 * this file are compatibility input only; they are not canonical palette truth.
 */

export type PaletteStatus = 'draft' | 'candidate' | 'published' | 'archived'

export type CanonicalPaletteType =
  | 'categorical'
  | 'sequential'
  | 'diverging'
  | 'mixed'

export type LegacyPaletteType = 'qualitative' | 'heatmap'

export type PaletteType = CanonicalPaletteType | LegacyPaletteType

export type ChartFamily =
  | 'bar'
  | 'distribution'
  | 'line'
  | 'heatmap'

export type ChartType =
  | 'bar_error'
  | 'boxplot_jitter'
  | 'line_multiseries'
  | 'heatmap_annotated'

export type PreviewCaseStatus = 'draft' | 'published' | 'archived'

export type PreviewCaseSeedStrategy = 'stable_id' | 'fixed'

export type ChartSuitability =
  | 'best_fit'
  | 'recommended'
  | 'compatible'
  | 'limited'

export type ChartApplicabilitySource = 'curated' | 'legacy_chart_types'

export interface ChartTypeApplicability {
  chart_type: ChartType
  suitability: ChartSuitability
  notes?: string
  source?: ChartApplicabilitySource
}

export interface PaletteColor {
  /**
   * Stable palette color identifier.
   *
   * Legacy palettes without persisted color IDs receive deterministic IDs based
   * on array order, e.g. `legacy-color-1`. Those compatibility IDs are stable
   * only as long as the color order is unchanged and must not be treated as safe
   * permanent database references for newly persisted preview cases.
   */
  id: string
  hex: string
  rgb: [number, number, number]
  label?: string
  order: number
}

export interface Accessibility {
  colorblind_safe: boolean
  print_friendly: boolean
  dark_background: boolean
}

export interface CanonicalPalette {
  id: string
  slug: string
  name: string
  description?: string
  status: PaletteStatus
  colors: PaletteColor[]
  color_count: number
  type: PaletteType
  chart_types: string[]
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
  primary_preview_case: PalettePreviewCase | null
  preview_cases: PalettePreviewCase[]
}

export interface LegacyPaletteCompatibility {
  /** @deprecated Use `chart_types`; retained for current public/Paper Project components. */
  chart_type: string[]
  /** @deprecated Use `disciplines`; retained for current public/Paper Project components. */
  discipline: string[]
  /** @deprecated Use `use_cases`; retained for current public/Paper Project components. */
  use_case: string[]
  /** @deprecated Use `avoid_cases`; retained for current public/Paper Project components. */
  avoid_case?: string[]
  /**
   * Legacy/experimental preview fields preserved as read-only compatibility
   * input. They are not canonical editable palette truth.
   */
  legacy_preview?: LegacyPreviewFields
  /** @deprecated Use `legacy_preview.chart_family`; not canonical palette truth. */
  chart_family?: LegacyExperimentalChartFamily
  /** @deprecated Use generated outputs from preview cases; not palette truth. */
  exported_core_colors?: LegacyExportedCoreColor[]
  /** @deprecated Preview templates belong to preview cases; not palettes. */
  preview_template?: LegacyPreviewTemplate
  /** @deprecated Copy blocks are generated outputs; not palette truth. */
  copy_blocks?: LegacyCopyBlocks
  /** @deprecated Role mappings belong to preview cases; not palettes. */
  functional_roles?: Record<string, unknown>
}

export type Palette = CanonicalPalette & LegacyPaletteCompatibility

export type RawPaletteColorDTO =
  | string
  | {
      id?: string
      color_id?: string
      hex?: string
      rgb?: [number, number, number] | number[]
      label?: string
      order?: number
    }

export type RawStringArrayDTO = string | string[]

export interface LegacyPreviewFields {
  chart_family?: LegacyExperimentalChartFamily
  exported_core_colors?: LegacyExportedCoreColor[]
  preview_template?: LegacyPreviewTemplate
  copy_blocks?: LegacyCopyBlocks
  functional_roles?: Record<string, unknown>
}

export interface RawPaletteDTO extends LegacyPreviewFields {
  id?: string
  slug?: string
  name?: string
  description?: string
  status?: string
  colors?: unknown
  color_count?: number
  type?: string
  chart_types?: RawStringArrayDTO
  chart_type?: RawStringArrayDTO
  chart_applicability?: ChartTypeApplicability[] | null
  journal_style?: RawStringArrayDTO
  discipline?: RawStringArrayDTO
  disciplines?: RawStringArrayDTO
  use_case?: RawStringArrayDTO
  use_cases?: RawStringArrayDTO
  avoid_case?: RawStringArrayDTO
  avoid_cases?: RawStringArrayDTO
  tags?: RawStringArrayDTO
  accessibility?: Accessibility
  source_type?: 'manual' | 'figure_extracted' | 'curated' | string
  source_image?: string
  source_note?: string
  version?: string
  created_by?: string
  created_at?: string
  updated_at?: string
  published_at?: string
  archived_at?: string
  primary_preview_case?: RawPalettePreviewCase | null
  preview_cases?: RawPalettePreviewCase[]
}

export interface ValidationIssue {
  path: string
  code: string
  message: string
}

export interface ValidationResult<T> {
  valid: boolean
  value?: T
  issues: ValidationIssue[]
}

export interface PaletteColorReference {
  source: 'palette'
  color_id: string
  opacity?: number
}

export interface ThemeColorReference {
  source: 'theme'
  token: 'foreground' | 'muted_foreground' | 'grid' | 'background'
  opacity?: number
}

export type VisualColorReference = PaletteColorReference | ThemeColorReference

export interface NamedColorRole {
  key: string
  label: string
  color: PaletteColorReference
}

export interface BasePalettePreviewCase<
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

export interface RawPalettePreviewCase {
  id: string
  palette_id: string
  chart_type: ChartType | string
  template_id: string
  template_version: number
  schema_version: number
  color_roles: unknown
  preview_config: unknown
  seed_strategy: PreviewCaseSeedStrategy | string
  seed_value?: number | null
  is_primary: boolean
  status: PreviewCaseStatus
}

export interface PalettePreviewCase {
  id: string
  palette_id: string
  chart_type: ChartType
  template_id: string
  template_version: number
  schema_version: number
  color_roles: unknown
  preview_config: unknown
  seed_strategy: PreviewCaseSeedStrategy
  seed_value: number | null
  is_primary: boolean
  status: PreviewCaseStatus
}

export function getLegacyChartType(palette: CanonicalPalette): string[] {
  return [...palette.chart_types]
}

export function getLegacyDiscipline(palette: CanonicalPalette): string[] {
  return [...palette.disciplines]
}

export function getLegacyUseCase(palette: CanonicalPalette): string[] {
  return [...palette.use_cases]
}

export function getLegacyAvoidCase(palette: CanonicalPalette): string[] {
  return [...palette.avoid_cases]
}

export function toLegacyPaletteCompatibility(palette: CanonicalPalette): Palette {
  return {
    ...palette,
    chart_type: getLegacyChartType(palette),
    discipline: getLegacyDiscipline(palette),
    use_case: getLegacyUseCase(palette),
    avoid_case: getLegacyAvoidCase(palette)
  }
}

// ---------------------------------------------------------------------------
// Legacy experimental schema exports.
// ---------------------------------------------------------------------------

/** @deprecated Use `ChartType` plus `ChartFamily`; this is legacy preview input. */
export type LegacyExperimentalChartFamily =
  | 'heatmap_annotated'
  | 'bar_error'
  | 'boxplot_jitter'
  | 'line_multiseries'

/** @deprecated Use generated outputs from preview cases, not palette truth. */
export interface LegacyExportedCoreColor {
  role: string
  label: string
  hex: string
  usage?: string
}

/** @deprecated Preview templates belong to preview cases, not palettes. */
export interface LegacyPreviewTemplate {
  template_id: string
  renderer: 'svg' | 'canvas'
  mock_data_strategy: 'deterministic_seed_from_slug'
}

/** @deprecated Copy blocks are generated outputs, not palette truth. */
export interface LegacyCopyBlocks {
  r?: Record<string, string>
  python?: Record<string, string>
  json?: Record<string, unknown>
}

/** @deprecated Legacy role shape retained only for compatibility imports. */
export interface HeatmapAnnotatedRoles {
  heatmap_scale: {
    type: 'diverging_3'
    roles: { low: string; mid: string; high: string }
    domain: [number, number, number]
  }
  annotation: {
    type: 'categorical'
    roles: Record<string, string>
    labels: Record<string, string>
  }
}

/** @deprecated Legacy role shape retained only for compatibility imports. */
export interface BarErrorRoles {
  groups: {
    control: { hex: string; label: string }
    treatment: { hex: string; label: string }
  }
  statistics: {
    error_bar: { hex: string }
    significance?: { hex: string }
  }
}

/** @deprecated Legacy role shape retained only for compatibility imports. */
export interface BoxplotJitterRoles {
  groups: {
    group_1: { hex: string; label: string }
    group_2: { hex: string; label: string }
    group_3?: { hex: string; label: string }
  }
  overlays: {
    jitter_point: { hex: string }
    median_line: { hex: string }
  }
}

/** @deprecated Legacy role shape retained only for compatibility imports. */
export interface LineMultiseriesRoles {
  series: {
    line_1: { hex: string; label: string }
    line_2: { hex: string; label: string }
    line_3?: { hex: string; label: string }
  }
  uncertainty: {
    confidence_band_1: { hex: string }
    confidence_band_2?: { hex: string }
  }
}

/** @deprecated Legacy schema retained only for imports from older code. */
export interface BasePaletteSchema {
  id: string
  slug: string
  name: string
  status: 'draft' | 'published' | 'archived'
  discipline: string[]
  chart_family: LegacyExperimentalChartFamily
  chart_types?: string[]
  tags: string[]
  colors?: PaletteColor[]
  exported_core_colors?: LegacyExportedCoreColor[]
  preview_template?: LegacyPreviewTemplate
  copy_blocks?: LegacyCopyBlocks
  created_at: string
  updated_at: string
  published_at?: string
}

/** @deprecated Legacy discriminated union retained only for older imports. */
export type FigColorPalette =
  | (BasePaletteSchema & { chart_family: 'heatmap_annotated'; functional_roles: HeatmapAnnotatedRoles })
  | (BasePaletteSchema & { chart_family: 'bar_error'; functional_roles: BarErrorRoles })
  | (BasePaletteSchema & { chart_family: 'boxplot_jitter'; functional_roles: BoxplotJitterRoles })
  | (BasePaletteSchema & { chart_family: 'line_multiseries'; functional_roles: LineMultiseriesRoles })

export type ExportedCoreColor = LegacyExportedCoreColor
export type PreviewTemplate = LegacyPreviewTemplate
export type CopyBlocks = LegacyCopyBlocks

export function isHeatmapAnnotated(
  palette: BasePaletteSchema
): palette is BasePaletteSchema & { chart_family: 'heatmap_annotated'; functional_roles: HeatmapAnnotatedRoles } {
  return palette.chart_family === 'heatmap_annotated'
}

export function isBarError(
  palette: BasePaletteSchema
): palette is BasePaletteSchema & { chart_family: 'bar_error'; functional_roles: BarErrorRoles } {
  return palette.chart_family === 'bar_error'
}

export function isBoxplotJitter(
  palette: BasePaletteSchema
): palette is BasePaletteSchema & { chart_family: 'boxplot_jitter'; functional_roles: BoxplotJitterRoles } {
  return palette.chart_family === 'boxplot_jitter'
}

export function isLineMultiseries(
  palette: BasePaletteSchema
): palette is BasePaletteSchema & { chart_family: 'line_multiseries'; functional_roles: LineMultiseriesRoles } {
  return palette.chart_family === 'line_multiseries'
}
