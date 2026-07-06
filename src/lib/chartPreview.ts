import type { Palette } from '@/types/palette'
import { CHART_TYPES } from '@/types/palette'

export const SUPPORTED_PREVIEW_CHART_TYPES = CHART_TYPES

export type SupportedPreviewChartType = typeof CHART_TYPES[number]

/**
 * Normalize chart type string for comparison (case-insensitive)
 */
export function normalizeChartType(type: string): string {
  return type.toLowerCase().trim()
}

/**
 * Check if a chart type is supported for preview
 */
export function isSupportedPreviewChartType(type: string): boolean {
  const normalized = normalizeChartType(type)
  return SUPPORTED_PREVIEW_CHART_TYPES.some(
    (supported) => normalizeChartType(supported) === normalized
  )
}

/**
 * Get the primary chart type for a palette preview.
 * 
 * Priority:
 * 1. If selectedChartType is provided and palette supports it, use selectedChartType
 * 2. Otherwise, use palette.chart_type[0] if supported
 * 3. Fallback to "line"
 * 
 * @param palette - The palette to get the primary chart type for
 * @param selectedChartType - Optional chart type filter from UI
 * @returns The recommended chart type string
 */
export function getPrimaryChartType(
  palette: Palette,
  selectedChartType?: string
): string {
  // Priority 1: User-selected chart type (not "All" or empty)
  if (selectedChartType && selectedChartType !== 'All' && selectedChartType.trim() !== '') {
    const normalizedSelected = normalizeChartType(selectedChartType)
    if (
      palette.chart_type &&
      palette.chart_type.length > 0 &&
      palette.chart_type.some((ct) => normalizeChartType(ct) === normalizedSelected)
    ) {
      return normalizedSelected
    }
  }

  // Priority 2: Palette's default chart type (chart_type[0])
  if (palette.chart_type && palette.chart_type.length > 0) {
    for (const chartType of palette.chart_type) {
      if (isSupportedPreviewChartType(chartType)) {
        return normalizeChartType(chartType)
      }
    }
    // If chart_type[0] is not supported, try to find the first supported one
    const firstSupported = palette.chart_type.find((ct) => isSupportedPreviewChartType(ct))
    if (firstSupported) {
      return normalizeChartType(firstSupported)
    }
  }

  // Priority 3: Fallback to line
  return 'line'
}