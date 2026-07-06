// Re-export from schema.ts
export type { ChartFamily, ExportedCoreColor, PreviewTemplate, CopyBlocks } from '@/lib/palette/schema'

// Re-export functional role types for convenience
export type { 
  HeatmapAnnotatedRoles, 
  BarErrorRoles, 
  BoxplotJitterRoles, 
  LineMultiseriesRoles,
  FigColorPalette,
  BasePaletteSchema
} from '@/lib/palette/schema'

export type PaletteColor = {
  hex: string
  rgb: [number, number, number]
}

// Phase 1 extension interface
export interface PalettePhase1Fields {
  chart_family?: import('@/lib/palette/schema').ChartFamily
  exported_core_colors?: import('@/lib/palette/schema').ExportedCoreColor[]
  preview_template?: import('@/lib/palette/schema').PreviewTemplate
  copy_blocks?: import('@/lib/palette/schema').CopyBlocks
  functional_roles?: Record<string, unknown>
}

export type Palette = {
  id: string
  name: string
  slug: string
  colors: PaletteColor[]  // existing legacy color list; fallback when exported_core_colors is missing
  journal_style: string[]
  chart_type: string[]   // existing user filter field; NOT replaced by chart_family
  color_count: number
  use_case: string[]
  avoid_case?: string[]
  discipline: string[]
  tags: string[]
  created_at: string
  updated_at: string
} & PalettePhase1Fields

export const JOURNAL_STYLES = [
  'nature',
  'science',
  'cell',
  'nejm',
  'lancet',
  'general'
] as const

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
export type ChartType = typeof CHART_TYPES[number]
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
