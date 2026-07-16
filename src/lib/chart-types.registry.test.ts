import { CHART_TYPE_DEFINITIONS, getChartTemplateDefinition, getChartTypeDefinition, registerChartTypes, validatePreviewCaseAgainstRegistry, validatePreviewTemplateReference } from '@/lib/chart-types/registry'
import { barErrorTemplate } from '@/lib/chart-types/bar-error/definition'
import type { PreviewCaseRegistryInput } from '@/lib/chart-types/types'

function expect(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message)
  }
}

function basePreviewCase(overrides: Partial<PreviewCaseRegistryInput> = {}): PreviewCaseRegistryInput {
  return {
    chart_type: 'bar_error',
    template_id: 'bar_error_v1',
    template_version: 1,
    schema_version: 1,
    color_roles: {
      groups: [{ key: 'control', label: 'Control', fill: { source: 'palette', color_id: 'color-1' } }],
      elements: {
        axis: { source: 'theme', token: 'foreground' },
        grid: { source: 'theme', token: 'grid' },
        text: { source: 'theme', token: 'muted_foreground' },
        error_bar: { source: 'theme', token: 'foreground' },
        background: { source: 'theme', token: 'background' }
      }
    },
    preview_config: {
      orientation: 'vertical',
      sample_size: 24,
      error_type: 'sem',
      data_pattern: 'treatment_higher'
    },
    ...overrides
  }
}

function expectIssue(previewCase: PreviewCaseRegistryInput, code: string): void {
  const result = validatePreviewCaseAgainstRegistry(previewCase)
  expect(!result.valid, `expected ${code} to be invalid`)
  expect(result.issues.some((issue) => issue.code === code), `expected issue ${code}`)
}

function testRegistryOrderAndLookup(): void {
  expect(CHART_TYPE_DEFINITIONS.map((definition) => definition.chartType).join(',') === 'bar_error,boxplot_jitter,line_multiseries,heatmap_annotated', 'registry order should be deterministic')
  expect(getChartTypeDefinition('bar_error')?.chartType === 'bar_error', 'chart type lookup should return definition')
  expect(getChartTemplateDefinition('bar_error', 'bar_error_v1')?.id === 'bar_error_v1', 'template lookup should return matching template')
}

function testValidPreviewCase(): void {
  const result = validatePreviewCaseAgainstRegistry(basePreviewCase())
  expect(result.valid, `valid preview case should pass: ${JSON.stringify(result.issues)}`)
}

function testRegistryFailuresAreSpecific(): void {
  expectIssue(basePreviewCase({ chart_type: 'scatter' }), 'UNSUPPORTED_CHART_TYPE')
  expectIssue(basePreviewCase({ template_id: 'missing_template_v1' }), 'UNKNOWN_TEMPLATE_ID')
  expectIssue(basePreviewCase({ chart_type: 'bar_error', template_id: 'line_multiseries_v1' }), 'TEMPLATE_CHART_TYPE_MISMATCH')
  expectIssue(basePreviewCase({ template_version: 2 }), 'UNSUPPORTED_TEMPLATE_VERSION')
  expectIssue(basePreviewCase({ schema_version: 2 }), 'UNSUPPORTED_SCHEMA_VERSION')
  expectIssue(basePreviewCase({ color_roles: { elements: {} } }), 'INVALID_COLOR_ROLES')
  expectIssue(basePreviewCase({ preview_config: { orientation: 'diagonal' } }), 'INVALID_PREVIEW_CONFIG')
}

function testReferenceValidationStopsBeforeShapeValidation(): void {
  const result = validatePreviewTemplateReference(basePreviewCase({ template_version: 2, color_roles: null }))
  expect(!result.valid, 'reference validation should reject unsupported version')
  expect(result.issues.some((issue) => issue.code === 'UNSUPPORTED_TEMPLATE_VERSION'), 'reference validation should include version issue')
  expect(!result.issues.some((issue) => issue.code === 'INVALID_COLOR_ROLES'), 'reference validation should not inspect roles')
}

function testDuplicateRegistryRejected(): void {
  let rejected = false
  try {
    registerChartTypes([
      { chartType: 'bar_error', templates: [barErrorTemplate] },
      { chartType: 'bar_error', templates: [barErrorTemplate] }
    ])
  } catch {
    rejected = true
  }
  expect(rejected, 'duplicate chart type registration should throw')
}

testRegistryOrderAndLookup()
testValidPreviewCase()
testRegistryFailuresAreSpecific()
testReferenceValidationStopsBeforeShapeValidation()
testDuplicateRegistryRejected()
