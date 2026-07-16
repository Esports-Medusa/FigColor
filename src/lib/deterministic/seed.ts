import type { PalettePreviewCase } from '@/types/palette'
import type { PreviewSeedInput, PreviewSeedStrategyInput } from '@/lib/chart-types/types'

const FNV_1A_OFFSET_BASIS = 0x811c9dc5
const FNV_1A_PRIME = 0x01000193

export function fnv1a32(input: string): number {
  let hash = FNV_1A_OFFSET_BASIS
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, FNV_1A_PRIME)
  }
  return hash >>> 0
}

export function derivePreviewSeed(input: PreviewSeedInput): number {
  return fnv1a32([
    'figcolor-preview-seed-v1',
    input.paletteId,
    input.previewCaseId,
    input.chartType,
    input.templateId,
    String(input.templateVersion),
    String(input.schemaVersion)
  ].join('\u001f'))
}

export function resolvePreviewSeed(input: PreviewSeedStrategyInput): number {
  if (input.seedStrategy === 'fixed') {
    if (input.seedValue === null || !Number.isInteger(input.seedValue)) {
      throw new Error('Fixed preview seed strategy requires an integer seed_value.')
    }
    return input.seedValue >>> 0
  }

  return derivePreviewSeed(input)
}

export function previewSeedInputFromCase(previewCase: PalettePreviewCase): PreviewSeedStrategyInput {
  return {
    paletteId: previewCase.palette_id,
    previewCaseId: previewCase.id,
    chartType: previewCase.chart_type,
    templateId: previewCase.template_id,
    templateVersion: previewCase.template_version,
    schemaVersion: previewCase.schema_version,
    seedStrategy: previewCase.seed_strategy,
    seedValue: previewCase.seed_value
  }
}
