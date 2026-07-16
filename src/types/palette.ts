export type {
  Accessibility,
  BasePalettePreviewCase,
  BasePaletteSchema,
  BarErrorRoles,
  BoxplotJitterRoles,
  CanonicalPalette,
  CanonicalPaletteType,
  ChartApplicabilitySource,
  ChartFamily,
  ChartSuitability,
  ChartType,
  ChartTypeApplicability,
  CopyBlocks,
  ExportedCoreColor,
  FigColorPalette,
  HeatmapAnnotatedRoles,
  LegacyCopyBlocks,
  LegacyExperimentalChartFamily,
  LegacyExportedCoreColor,
  LegacyPaletteCompatibility,
  LegacyPaletteType,
  LegacyPreviewFields,
  LegacyPreviewTemplate,
  LineMultiseriesRoles,
  NamedColorRole,
  Palette,
  PaletteColor,
  PalettePreviewCase,
  PaletteColorReference,
  PaletteStatus,
  PaletteType,
  PreviewCaseSeedStrategy,
  PreviewCaseStatus,
  PreviewTemplate,
  RawPaletteColorDTO,
  RawPaletteDTO,
  RawPalettePreviewCase,
  RawStringArrayDTO,
  ThemeColorReference,
  ValidationIssue,
  ValidationResult,
  VisualColorReference
} from '@/lib/palette/schema'

export {
  getLegacyAvoidCase,
  getLegacyChartType,
  getLegacyDiscipline,
  getLegacyUseCase,
  isBarError,
  isBoxplotJitter,
  isHeatmapAnnotated,
  isLineMultiseries,
  toLegacyPaletteCompatibility
} from '@/lib/palette/schema'

export const JOURNAL_STYLES = [
  'nature',
  'science',
  'cell',
  'nejm',
  'lancet',
  'general'
] as const

/**
 * Legacy broad chart type filters used by the current public UI and Paper
 * Project. Scientific preview cases use the canonical `ChartType` union from
 * `src/lib/palette/schema.ts`.
 */
export const CHART_TYPES = [
  'line',
  'bar',
  'scatter',
  'boxplot',
  'violin',
  'heatmap',
  'area',
  'stacked_bar',
  'survival_curve',
  'volcano_plot',
  'umap',
  'pca'
] as const

export const USE_CASES = [
  'publication',
  'presentation',
  'thesis',
  'poster',
  'multi_group_comparison',
  'control_vs_treatment',
  'time_series',
  'omics',
  'clinical'
] as const

export const AVOID_CASES = [
  'too_many_groups',
  'small_print',
  'grayscale_print',
  'colorblind_sensitive',
  'heatmap',
  'continuous_variable',
  'dark_background',
  'low_contrast_required'
] as const

export const DISCIPLINES = [
  'biomedical',
  'clinical',
  'genomics',
  'single_cell',
  'neuroscience',
  'immunology',
  'oncology',
  'AI',
  'machine_learning',
  'statistics',
  'engineering',
  'chemistry',
  'materials_science',
  'environmental_science',
  'general'
] as const

export const TAGS = [
  'muted',
  'pastel',
  'high_contrast',
  'low_saturation',
  'publication_ready',
  'presentation_friendly',
  'colorblind_friendly',
  'clean',
  'soft',
  'vivid',
  'minimal',
  'professional',
  'warm',
  'cool'
] as const

export type JournalStyle = typeof JOURNAL_STYLES[number]
export type LegacyChartType = typeof CHART_TYPES[number]
export type UseCase = typeof USE_CASES[number]
export type AvoidCase = typeof AVOID_CASES[number]
export type Discipline = typeof DISCIPLINES[number]
export type Tag = typeof TAGS[number]

export type PaletteFilters = {
  journal_style?: string[]
  chart_type?: string[]
  color_count?: number[]
  use_case?: string[]
  discipline?: string[]
  tags?: string[]
}
