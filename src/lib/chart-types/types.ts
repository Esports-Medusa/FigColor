import type {
  ChartType,
  PreviewCaseSeedStrategy,
  ValidationIssue
} from '@/types/palette'

export type ValidationResult = {
  valid: boolean
  issues: ValidationIssue[]
}

export type ChartRegistryIssueCode =
  | 'UNSUPPORTED_CHART_TYPE'
  | 'UNKNOWN_TEMPLATE_ID'
  | 'TEMPLATE_CHART_TYPE_MISMATCH'
  | 'UNSUPPORTED_TEMPLATE_VERSION'
  | 'UNSUPPORTED_SCHEMA_VERSION'
  | 'INVALID_COLOR_ROLES'
  | 'INVALID_PREVIEW_CONFIG'
  | 'DUPLICATE_CHART_TYPE'
  | 'DUPLICATE_TEMPLATE_ID'

export interface ChartTemplateDefinition<
  TRoles = unknown,
  TConfig = unknown
> {
  id: string
  chartType: ChartType
  templateVersion: number
  schemaVersion: number

  validateRoles(value: unknown): ValidationResult & { value?: TRoles }
  validateConfig(value: unknown): ValidationResult & { value?: TConfig }
}

export interface ChartTypeDefinition {
  chartType: ChartType
  templates: readonly ChartTemplateDefinition[]
}

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

export interface PreviewRendererOutput {
  kind: 'svg'
  markup: string
}

export interface PreviewSeedInput {
  paletteId: string
  previewCaseId: string
  chartType: ChartType
  templateId: string
  templateVersion: number
  schemaVersion: number
}

export interface PreviewSeedStrategyInput extends PreviewSeedInput {
  seedStrategy: PreviewCaseSeedStrategy
  seedValue: number | null
}

export interface PreviewCaseRegistryInput {
  chart_type: ChartType | string
  template_id: string
  template_version: number
  schema_version: number
  color_roles: unknown
  preview_config: unknown
}

export type TemplateLookupResult =
  | {
      ok: true
      template: ChartTemplateDefinition
    }
  | {
      ok: false
      issues: ValidationIssue[]
    }

export type RegistryValidationResult = ValidationResult

export function validResult(): ValidationResult {
  return { valid: true, issues: [] }
}

export function invalidResult(issues: ValidationIssue[]): ValidationResult {
  return { valid: false, issues }
}

export function registryIssue(
  path: string,
  code: ChartRegistryIssueCode,
  message: string
): ValidationIssue {
  return { path, code, message }
}
