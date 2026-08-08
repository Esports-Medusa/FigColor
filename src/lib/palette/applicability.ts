import type {
  CanonicalPalette,
  ChartSuitability,
  ChartType,
  ChartTypeApplicability,
  ValidationIssue
} from './schema'
import {
  getPhase1ChartTypesForLegacyKey,
  getResolvedCompatibilityChartTypes
} from './schema'

export type ChartSupportStatus =
  | ChartSuitability
  | 'not_declared'

export interface ChartSupportResult {
  chart_type: ChartType
  status: ChartSupportStatus
  inferred_from_legacy: boolean
  applicability?: ChartTypeApplicability
}

export const PHASE_1_CHART_TYPES = [
  'bar_error',
  'boxplot_jitter',
  'line_multiseries',
  'heatmap_annotated'
] as const satisfies readonly ChartType[]

export const SUPPORTED_PREVIEW_CHART_TYPES: ChartType[] = [
  ...PHASE_1_CHART_TYPES,
  'scatter_grouped',
  'violin_distribution'
]

const BROAD_CHART_FILTER_TO_PHASE_1: Record<string, ChartType[]> = {
  bar: ['bar_error'],
  barplot: ['bar_error'],
  boxplot: ['boxplot_jitter'],
  violin: ['violin_distribution', 'boxplot_jitter'],
  scatter: ['scatter_grouped'],
  line: ['line_multiseries'],
  heatmap: ['heatmap_annotated']
}

export function normalizeLegacyChartTypesToApplicability(
  chartTypes: string[]
): ChartTypeApplicability[] {
  const result: ChartTypeApplicability[] = []
  const seen = new Set<ChartType>()

  chartTypes.forEach((chartType) => {
    const mapped = getPhase1ChartTypesForLegacyKey(chartType)
    mapped.forEach((phase1Type) => {
      if (!seen.has(phase1Type)) {
        result.push({
          chart_type: phase1Type,
          suitability: 'compatible',
          notes: 'Inferred from legacy chart_types compatibility data.',
          source: 'legacy_chart_types'
        })
        seen.add(phase1Type)
      }
    })
  })

  return result
}

export function getLegacyBroadChartTypes(palette: Pick<CanonicalPalette, 'chart_types'>): string[] {
  return [...palette.chart_types]
}

export function getEffectivePreviewChartTypes(
  palette: Pick<CanonicalPalette, 'chart_applicability' | 'chart_types'>
): ChartType[] {
  return getResolvedCompatibilityChartTypes(palette).filter(isPhase1ChartType)
}

export function supportsChartType(
  palette: CanonicalPalette,
  chartType: ChartType
): boolean {
  const support = getChartSupport(palette, chartType)
  return support.status !== 'not_declared'
}

export function chartFilterMatchesPalette(
  palette: Pick<CanonicalPalette, 'chart_applicability' | 'chart_types'>,
  selectedChartType: string
): boolean {
  const selected = normalizeChartFilterKey(selectedChartType)
  if (!selected) {
    return true
  }

  const phase1Targets = resolveChartFilterTargets(selected)
  if (palette.chart_applicability !== undefined) {
    return palette.chart_applicability.some((item) => phase1Targets.includes(item.chart_type))
  }

  return palette.chart_types.some((chartType) => {
    const normalizedChartType = normalizeChartFilterKey(chartType)
    return normalizedChartType === selected || phase1Targets.includes(normalizedChartType as ChartType)
  })
}

export function getChartSupport(
  palette: CanonicalPalette,
  chartType: ChartType
): ChartSupportResult {
  const applicability = getEffectiveApplicability(palette)
    .find((item) => item.chart_type === chartType)

  if (!applicability) {
    return {
      chart_type: chartType,
      status: 'not_declared',
      inferred_from_legacy: false
    }
  }

  return {
    chart_type: chartType,
    status: applicability.suitability,
    inferred_from_legacy: applicability.source === 'legacy_chart_types',
    applicability
  }
}

export function getRecommendedChartTypes(palette: CanonicalPalette): ChartType[] {
  return getEffectiveApplicability(palette)
    .filter((item) => item.suitability === 'best_fit' || item.suitability === 'recommended')
    .map((item) => item.chart_type)
}

export function getPrimaryChartTypes(palette: CanonicalPalette): ChartType[] {
  const effective = getEffectiveApplicability(palette)
  const bestFit = effective
    .filter((item) => item.suitability === 'best_fit')
    .map((item) => item.chart_type)

  return bestFit.length > 0 ? bestFit : getRecommendedChartTypes(palette)
}

export function validateChartApplicability(
  applicability: ChartTypeApplicability[] | undefined,
  path = 'chart_applicability'
): ValidationIssue[] {
  if (!applicability) {
    return []
  }

  const issues: ValidationIssue[] = []
  const seen = new Map<ChartType, number>()
  let bestFitCount = 0

  applicability.forEach((item, index) => {
    if (!SUPPORTED_PREVIEW_CHART_TYPES.includes(item.chart_type)) {
      issues.push({
        path: `${path}[${index}].chart_type`,
        code: 'INVALID_CHART_TYPE',
        message: 'Chart type is not part of the Phase 1 scientific preview set.'
      })
    }

    if (seen.has(item.chart_type)) {
      issues.push({
        path: `${path}[${index}].chart_type`,
        code: 'DUPLICATE_CHART_TYPE',
        message: `Duplicate chart applicability entry: ${item.chart_type}.`
      })
    }
    seen.set(item.chart_type, index)

    if (item.suitability === 'best_fit') {
      bestFitCount += 1
      if (bestFitCount > 1) {
        issues.push({
          path: `${path}[${index}].suitability`,
          code: 'MULTIPLE_BEST_FIT',
          message: 'Only one chart applicability entry may be best_fit.'
        })
      }
    }
  })

  return issues
}

export function getEffectiveApplicability(palette: CanonicalPalette): ChartTypeApplicability[] {
  return getEffectiveApplicabilityInput(palette)
}

function getEffectiveApplicabilityInput(
  palette: Pick<CanonicalPalette, 'chart_applicability' | 'chart_types'>
): ChartTypeApplicability[] {
  if (palette.chart_applicability !== undefined) {
    return palette.chart_applicability
  }

  return normalizeLegacyChartTypesToApplicability(palette.chart_types)
}

function isPhase1ChartType(value: string): value is ChartType {
  return SUPPORTED_PREVIEW_CHART_TYPES.includes(value as ChartType)
}

function resolveChartFilterTargets(selected: string): ChartType[] {
  if (isPhase1ChartType(selected)) {
    return [selected]
  }
  return BROAD_CHART_FILTER_TO_PHASE_1[selected] ?? []
}

function normalizeChartFilterKey(value: string): string {
  return value.toLowerCase().replace(/[-\s]/g, '_').trim()
}
