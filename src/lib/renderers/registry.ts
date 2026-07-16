import { getChartTemplateDefinition } from '@/lib/chart-types/registry'
import type { ChartRenderer, PreviewRendererLookupInput } from './types'

const rendererKey = (
  chartType: string,
  templateId: string,
  templateVersion: number,
  schemaVersion: number
) => `${chartType}\u001f${templateId}\u001f${templateVersion}\u001f${schemaVersion}`

export function registerPreviewRenderers(renderers: readonly ChartRenderer[]): readonly ChartRenderer[] {
  const seen = new Set<string>()

  renderers.forEach((renderer) => {
    const key = rendererKey(
      renderer.chartType,
      renderer.templateId,
      renderer.templateVersion,
      renderer.schemaVersion
    )

    if (seen.has(key)) {
      throw new Error(`Duplicate preview renderer registration: ${renderer.chartType}/${renderer.templateId}@${renderer.templateVersion}/${renderer.schemaVersion}`)
    }
    seen.add(key)

    const template = getChartTemplateDefinition(renderer.chartType, renderer.templateId)
    if (!template) {
      throw new Error(`Preview renderer ${renderer.chartType}/${renderer.templateId} does not match a chart-template registry definition.`)
    }
    if (
      template.chartType !== renderer.chartType ||
      template.id !== renderer.templateId ||
      template.templateVersion !== renderer.templateVersion ||
      template.schemaVersion !== renderer.schemaVersion
    ) {
      throw new Error(`Preview renderer metadata mismatch for ${renderer.chartType}/${renderer.templateId}.`)
    }
  })

  return renderers
}

export function getPreviewRenderer(
  renderers: readonly ChartRenderer[],
  input: PreviewRendererLookupInput
): ChartRenderer | undefined {
  const key = rendererKey(
    input.chartType,
    input.templateId,
    input.templateVersion,
    input.schemaVersion
  )

  return renderers.find((renderer) =>
    rendererKey(renderer.chartType, renderer.templateId, renderer.templateVersion, renderer.schemaVersion) === key
  )
}
