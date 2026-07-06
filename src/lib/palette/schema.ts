/**
 * FigColor Palette Schema v2 - Phase 1
 * 
 * Phase 1 implements 4 chart families:
 * - heatmap_annotated
 * - bar_error
 * - boxplot_jitter
 * - line_multiseries
 */

// ============================================================
// ChartFamily Union
// ============================================================
export type ChartFamily = 
  | 'heatmap_annotated' 
  | 'bar_error' 
  | 'boxplot_jitter' 
  | 'line_multiseries'

// ============================================================
// ExportedCoreColor - unified color export format
// ============================================================
export interface ExportedCoreColor {
  role: string
  label: string
  hex: string
  usage?: string  // optional description of how this color is used
}

// ============================================================
// PreviewTemplate
// ============================================================
export interface PreviewTemplate {
  template_id: string
  renderer: 'svg' | 'canvas'
  mock_data_strategy: 'deterministic_seed_from_slug'
}

// ============================================================
// CopyBlocks
// ============================================================
export interface CopyBlocks {
  r?: Record<string, string>
  python?: Record<string, string>
  json?: Record<string, unknown>
}

// ============================================================
// BasePaletteSchema - shared outer fields
// ============================================================
export interface BasePaletteSchema {
  id: string
  slug: string
  name: string
  status: 'draft' | 'published' | 'archived'
  discipline: string[]
  chart_family: ChartFamily
  chart_types?: string[]
  tags: string[]
  colors?: PaletteColor[]  // legacy fallback, do not remove in Phase 1
  exported_core_colors?: ExportedCoreColor[]
  preview_template?: PreviewTemplate
  copy_blocks?: CopyBlocks
  created_at: string
  updated_at: string
  published_at?: string
}

// ============================================================
// PaletteColor (from existing types)
// ============================================================
export interface PaletteColor {
  hex: string
  rgb: [number, number, number]
}

// ============================================================
// Functional Roles - by chart_family
// ============================================================

// heatmap_annotated
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

// bar_error
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

// boxplot_jitter
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

// line_multiseries
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

// ============================================================
// FigColorPalette - discriminated union
// ============================================================
export type FigColorPalette = 
  | (BasePaletteSchema & { chart_family: 'heatmap_annotated'; functional_roles: HeatmapAnnotatedRoles })
  | (BasePaletteSchema & { chart_family: 'bar_error'; functional_roles: BarErrorRoles })
  | (BasePaletteSchema & { chart_family: 'boxplot_jitter'; functional_roles: BoxplotJitterRoles })
  | (BasePaletteSchema & { chart_family: 'line_multiseries'; functional_roles: LineMultiseriesRoles })

// ============================================================
// Helper type guards
// ============================================================
export function isHeatmapAnnotated(palette: BasePaletteSchema): palette is BasePaletteSchema & { chart_family: 'heatmap_annotated'; functional_roles: HeatmapAnnotatedRoles } {
  return palette.chart_family === 'heatmap_annotated'
}

export function isBarError(palette: BasePaletteSchema): palette is BasePaletteSchema & { chart_family: 'bar_error'; functional_roles: BarErrorRoles } {
  return palette.chart_family === 'bar_error'
}

export function isBoxplotJitter(palette: BasePaletteSchema): palette is BasePaletteSchema & { chart_family: 'boxplot_jitter'; functional_roles: BoxplotJitterRoles } {
  return palette.chart_family === 'boxplot_jitter'
}

export function isLineMultiseries(palette: BasePaletteSchema): palette is BasePaletteSchema & { chart_family: 'line_multiseries'; functional_roles: LineMultiseriesRoles } {
  return palette.chart_family === 'line_multiseries'
}