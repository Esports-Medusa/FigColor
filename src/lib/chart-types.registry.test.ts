import { CHART_TYPE_DEFINITIONS, createPreviewRegistryProjection, getChartTemplateDefinition, getChartTypeDefinition, registerChartTypes, validatePreviewCaseAgainstRegistry, validatePreviewTemplateReference } from '@/lib/chart-types/registry'
import { barErrorTemplate } from '@/lib/chart-types/bar-error/definition'
import { createPreviewDefaults } from '@/lib/chart-types/previewDefaults'
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
  expect(CHART_TYPE_DEFINITIONS.map((definition) => definition.chartType).join(',') === 'bar_error,boxplot_jitter,line_multiseries,heatmap_annotated,scatter_grouped,violin_distribution', 'registry order should be deterministic')
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

function testStructuredProjection(): void {
  const first = createPreviewRegistryProjection()
  const second = createPreviewRegistryProjection()
  expect(first.projection_format_version === 1, 'projection format should be versioned independently')
  expect(first.charts.length === 6, 'projection should contain exactly six charts')
  expect(first.charts.every((chart) => chart.templates.length === 1 && chart.templates[0].roles_schema && chart.templates[0].config_schema), 'every chart should project template metadata and both schemas')
  expect(JSON.stringify(first) === JSON.stringify(second), 'projection should repeat deterministically')
  expect(!JSON.stringify(first).includes('validateRoles'), 'projection must not contain validator functions')
  expect(first.vocabularies.disciplines.includes('general') && first.vocabularies.tags.includes('clean'), 'projection should contain controlled vocabulary authority')
}

function testSchemaBehaviorAndNonMutation(): void {
  const input = basePreviewCase()
  const before = JSON.stringify(input)
  const invalid = basePreviewCase({ color_roles: { ...input.color_roles as object, unexpected: true }, preview_config: { orientation: 'diagonal' } })
  const result = validatePreviewCaseAgainstRegistry(invalid)
  expect(!result.valid, 'structured schemas should reject invalid roles and config')
  expect(result.issues[0].path === 'color_roles.unexpected', 'unknown root roles should retain deterministic first issue path')
  validatePreviewCaseAgainstRegistry(input)
  expect(JSON.stringify(input) === before, 'structured validation must not mutate input')
}

function testAllSixStructuredSchemas(): void {
  const charts = ['bar_error', 'boxplot_jitter', 'line_multiseries', 'heatmap_annotated', 'scatter_grouped', 'violin_distribution'] as const
  for (const chart of charts) {
    const defaults = createPreviewDefaults(chart, ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'], 0)
    expect(defaults.ok, `${chart} declarative schemas should accept existing defaults`)
    if (!defaults.ok) continue
    const roles = structuredClone(defaults.value.color_roles)
    const config = structuredClone(defaults.value.preview_config)
    const rolesResult = getChartTemplateDefinition(chart, defaults.value.template_id)?.validateRoles({ ...roles, unexpected: true })
    const configResult = getChartTemplateDefinition(chart, defaults.value.template_id)?.validateConfig(null)
    expect(rolesResult?.valid === false && rolesResult.issues[0].path === 'color_roles.unexpected', `${chart} should reject unknown root role members deterministically`)
    expect(configResult?.valid === false && configResult.issues[0].path === 'preview_config', `${chart} should reject null config`)
    expect(JSON.stringify(roles) === JSON.stringify(defaults.value.color_roles) && JSON.stringify(config) === JSON.stringify(defaults.value.preview_config), `${chart} validation should not mutate values`)
  }
  const heatmap = getChartTemplateDefinition('heatmap_annotated', 'heatmap_annotated_v1')
  const invalidScale = heatmap?.validateRoles({ scale: { type: 'diverging', stops: [{ position: 0, color: { source: 'palette', color_id: 'a' } }, { position: 0, color: { source: 'palette', color_id: 'b' } }] } })
  expect(invalidScale?.valid === false && invalidScale.issues.some(issue => issue.path === 'color_roles.scale.stops[1].position'), 'heatmap cross-field ordering rule should remain declarative and enforced')
}

testRegistryOrderAndLookup()
testValidPreviewCase()
testRegistryFailuresAreSpecific()
testReferenceValidationStopsBeforeShapeValidation()
testDuplicateRegistryRejected()
testStructuredProjection()
testSchemaBehaviorAndNonMutation()
testAllSixStructuredSchemas()
