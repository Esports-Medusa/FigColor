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
  | 'DUPLICATE_ROLE_KEY'
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
  rolesSchema: PreviewSchema
  configSchema: PreviewSchema

  validateRoles(value: unknown): ValidationResult & { value?: TRoles }
  validateConfig(value: unknown): ValidationResult & { value?: TConfig }
}

export type PreviewSchema =
  | { kind: 'object'; fields: Record<string, PreviewSchemaField>; exact: boolean; rules?: PreviewObjectRule[] }
  | { kind: 'array'; items: PreviewSchema; minItems?: number; maxItems?: number; rules?: PreviewSchemaRule[] }
  | { kind: 'string'; nonWhitespace?: boolean; enum?: string[] }
  | { kind: 'number'; integer?: boolean; min?: number; max?: number }
  | { kind: 'boolean' }
  | { kind: 'palette_reference'; unknownMembers: 'allow' | 'reject' }
  | { kind: 'visual_reference'; themeTokens: string[]; unknownMembers: 'allow' | 'reject' }

export interface PreviewSchemaField {
  required: boolean
  schema: PreviewSchema
}

export type PreviewSchemaRule =
  | { kind: 'unique_by'; field: string; issueCode?: ChartRegistryIssueCode }
  | { kind: 'strictly_increasing'; field: string }

export type PreviewObjectRule = { kind: 'conditional_min_items'; arrayField: string; discriminatorField: string; cases: Record<string, number> }

export interface PreviewRegistryProjection {
  projection_format_version: number
  charts: Array<{
    chart_type: string
    templates: Array<{
      template_id: string
      template_version: number
      schema_version: number
      roles_schema: PreviewSchema
      config_schema: PreviewSchema
    }>
  }>
  vocabularies: {
    disciplines: string[]
    use_cases: string[]
    avoid_cases: string[]
    tags: string[]
  }
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
