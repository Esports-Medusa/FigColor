import type { ChartType } from '@/types/palette'
import controlledVocabularies from '../../../contracts/palette-ingestion/v1/controlled-vocabularies.json'
import { barErrorTemplate } from './bar-error/definition'
import { boxplotJitterTemplate } from './boxplot-jitter/definition'
import { heatmapAnnotatedTemplate } from './heatmap-annotated/definition'
import { lineMultiseriesTemplate } from './line-multiseries/definition'
import { scatterGroupedTemplate } from './scatter-grouped/definition'
import { violinDistributionTemplate } from './violin-distribution/definition'
import {
  invalidResult,
  registryIssue,
  validResult,
  type ChartTemplateDefinition,
  type ChartTypeDefinition,
  type PreviewCaseRegistryInput,
  type RegistryValidationResult,
  type PreviewRegistryProjection,
  type TemplateLookupResult,
  type ValidationResult
} from './types'
import { validateSchemaDeclaration } from './validation'

export const CHART_TYPE_DEFINITIONS: readonly ChartTypeDefinition[] = registerChartTypes([
  {
    chartType: 'bar_error',
    templates: [barErrorTemplate]
  },
  {
    chartType: 'boxplot_jitter',
    templates: [boxplotJitterTemplate]
  },
  {
    chartType: 'line_multiseries',
    templates: [lineMultiseriesTemplate]
  },
  {
    chartType: 'heatmap_annotated',
    templates: [heatmapAnnotatedTemplate]
  },
  {
    chartType: 'scatter_grouped',
    templates: [scatterGroupedTemplate]
  },
  {
    chartType: 'violin_distribution',
    templates: [violinDistributionTemplate]
  }
])

export const PREVIEW_REGISTRY_PROJECTION_FORMAT_VERSION = 1

export function createPreviewRegistryProjection(): PreviewRegistryProjection {
  for (const chart of CHART_TYPE_DEFINITIONS) for (const template of chart.templates) {
    const errors = [...validateSchemaDeclaration(template.rolesSchema, `${template.id}.roles`), ...validateSchemaDeclaration(template.configSchema, `${template.id}.config`)]
    if (errors.length > 0) throw new Error(`Invalid structured Preview schema: ${errors.join(' ')}`)
  }
  return {
    projection_format_version: PREVIEW_REGISTRY_PROJECTION_FORMAT_VERSION,
    charts: CHART_TYPE_DEFINITIONS.map((chart) => ({
      chart_type: chart.chartType,
      templates: chart.templates.map((template) => ({
        template_id: template.id,
        template_version: template.templateVersion,
        schema_version: template.schemaVersion,
        roles_schema: template.rolesSchema,
        config_schema: template.configSchema
      }))
    })),
    vocabularies: {
      disciplines: [...controlledVocabularies.disciplines],
      use_cases: [...controlledVocabularies.use_cases],
      avoid_cases: [...controlledVocabularies.avoid_cases],
      tags: [...controlledVocabularies.tags]
    }
  }
}

export function getChartTypeDefinition(chartType: ChartType | string): ChartTypeDefinition | undefined {
  return CHART_TYPE_DEFINITIONS.find((definition) => definition.chartType === chartType)
}

export function getChartTemplateDefinition(
  chartType: ChartType | string,
  templateId: string
): ChartTemplateDefinition | undefined {
  return getChartTypeDefinition(chartType)?.templates.find((template) => template.id === templateId)
}

export function lookupChartTemplateDefinition(
  chartType: ChartType | string,
  templateId: string
): TemplateLookupResult {
  const chartDefinition = getChartTypeDefinition(chartType)
  if (!chartDefinition) {
    return {
      ok: false,
      issues: [registryIssue('chart_type', 'UNSUPPORTED_CHART_TYPE', `Unsupported chart type: ${chartType}.`)]
    }
  }

  const template = chartDefinition.templates.find((candidate) => candidate.id === templateId)
  if (template) {
    return { ok: true, template }
  }

  const owningTemplate = findTemplateById(templateId)
  return {
    ok: false,
    issues: [owningTemplate
      ? registryIssue(
          'template_id',
          'TEMPLATE_CHART_TYPE_MISMATCH',
          `Template ${templateId} belongs to ${owningTemplate.chartType}, not ${chartType}.`
        )
      : registryIssue('template_id', 'UNKNOWN_TEMPLATE_ID', `Unknown template ID: ${templateId}.`)]
  }
}

export function validatePreviewTemplateReference(previewCase: PreviewCaseRegistryInput): RegistryValidationResult {
  const lookup = lookupChartTemplateDefinition(previewCase.chart_type, previewCase.template_id)
  if (!lookup.ok) {
    return invalidResult(lookup.issues)
  }

  const issues = []
  if (previewCase.template_version !== lookup.template.templateVersion) {
    issues.push(registryIssue(
      'template_version',
      'UNSUPPORTED_TEMPLATE_VERSION',
      `Unsupported template version ${previewCase.template_version} for ${previewCase.template_id}.`
    ))
  }
  if (previewCase.schema_version !== lookup.template.schemaVersion) {
    issues.push(registryIssue(
      'schema_version',
      'UNSUPPORTED_SCHEMA_VERSION',
      `Unsupported schema version ${previewCase.schema_version} for ${previewCase.template_id}.`
    ))
  }

  return issues.length > 0 ? invalidResult(issues) : validResult()
}

export function validatePreviewCaseAgainstRegistry(previewCase: PreviewCaseRegistryInput): RegistryValidationResult {
  const referenceResult = validatePreviewTemplateReference(previewCase)
  if (!referenceResult.valid) {
    return referenceResult
  }

  const template = getChartTemplateDefinition(previewCase.chart_type, previewCase.template_id)
  if (!template) {
    return invalidResult([registryIssue('template_id', 'UNKNOWN_TEMPLATE_ID', `Unknown template ID: ${previewCase.template_id}.`)])
  }

  return mergeValidationResults([
    template.validateRoles(previewCase.color_roles),
    template.validateConfig(previewCase.preview_config)
  ])
}

export function registerChartTypes(definitions: readonly ChartTypeDefinition[]): readonly ChartTypeDefinition[] {
  const chartTypes = new Set<string>()
  const templateIds = new Set<string>()

  definitions.forEach((definition) => {
    if (chartTypes.has(definition.chartType)) {
      throw new Error(`Duplicate chart type registration: ${definition.chartType}`)
    }
    chartTypes.add(definition.chartType)

    definition.templates.forEach((template) => {
      if (template.chartType !== definition.chartType) {
        throw new Error(`Template ${template.id} has chart type ${template.chartType}, expected ${definition.chartType}`)
      }
      if (templateIds.has(template.id)) {
        throw new Error(`Duplicate template registration: ${template.id}`)
      }
      templateIds.add(template.id)
    })
  })

  return definitions
}

function findTemplateById(templateId: string): ChartTemplateDefinition | undefined {
  return CHART_TYPE_DEFINITIONS
    .flatMap((definition) => definition.templates)
    .find((template) => template.id === templateId)
}

function mergeValidationResults(results: readonly ValidationResult[]): ValidationResult {
  const issues = results.flatMap((result) => result.issues)
  return issues.length > 0 ? invalidResult(issues) : validResult()
}
