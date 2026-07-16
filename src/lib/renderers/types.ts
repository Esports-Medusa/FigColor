import type { ChartType, ValidationIssue } from '@/types/palette'

export interface PreviewRendererInput {
  paletteId: string
  previewCaseId: string
  chartType: ChartType
  templateId: string
  templateVersion: number
  schemaVersion: number
  colorRoles: unknown
  previewConfig: unknown
  seed: number
  resolvedColors: Record<string, string>
}

export type PreviewRenderResult =
  | {
      ok: true
      kind: 'svg'
      markup: string
      width: number
      height: number
    }
  | {
      ok: false
      kind: 'unsupported' | 'invalid' | 'error'
      code: string
      message: string
      issues?: ValidationIssue[]
    }

export interface ChartRenderer {
  chartType: ChartType
  templateId: string
  templateVersion: number
  schemaVersion: number

  render(input: PreviewRendererInput): PreviewRenderResult
}

export interface PreviewRendererLookupInput {
  chartType: ChartType | string
  templateId: string
  templateVersion: number
  schemaVersion: number
}
