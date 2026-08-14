import { createPreviewDefaults } from '@/lib/chart-types/previewDefaults'
import { getChartTemplateDefinition } from '@/lib/chart-types/registry'
import { validateSchema, validateSchemaDeclaration } from '@/lib/chart-types/validation'
import type { ChartType } from '@/types/palette'
import type { PreviewSchema } from '@/lib/chart-types/types'

function expect(condition: boolean, message: string): void { if (!condition) throw new Error(message) }
const charts: ChartType[] = ['bar_error', 'boxplot_jitter', 'line_multiseries', 'heatmap_annotated', 'scatter_grouped', 'violin_distribution']
const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333']

function fixture(chart: ChartType) {
  const result = createPreviewDefaults(chart, ids, 0)
  if (!result.ok) throw new Error(`${chart} defaults unavailable`)
  const template = getChartTemplateDefinition(chart, result.value.template_id)
  if (!template) throw new Error(`${chart} template unavailable`)
  return { template, roles: structuredClone(result.value.color_roles), config: structuredClone(result.value.preview_config) }
}

function firstCollection(chart: ChartType, roles: Record<string, unknown>): Record<string, unknown>[] {
  if (chart === 'heatmap_annotated') return ((roles.scale as Record<string, unknown>).stops as Record<string, unknown>[])
  return (roles[chart === 'line_multiseries' ? 'series' : 'groups'] as Record<string, unknown>[])
}

function firstPaletteReference(chart: ChartType, item: Record<string, unknown>): Record<string, unknown> {
  return item[chart === 'bar_error' || chart === 'violin_distribution' ? 'fill' : chart === 'line_multiseries' ? 'line' : chart === 'heatmap_annotated' ? 'color' : 'color'] as Record<string, unknown>
}

function testSixChartConstraintMatrix(): void {
  for (const chart of charts) {
    const { template, roles, config } = fixture(chart)
    const before = JSON.stringify({ roles, config })
    expect(template.validateRoles(roles).valid && template.validateConfig(config).valid, `${chart}: known-good`)
    expect(!template.validateRoles(null).valid && !template.validateConfig([]).valid, `${chart}: object/array primitive shape`)
    expect(!template.validateRoles({ ...roles, unexpected: true }).valid, `${chart}: unknown root role member`)
    if (roles.elements && typeof roles.elements === 'object') expect(!template.validateRoles({ ...roles, elements: { ...(roles.elements as object), unexpected: true } }).valid, `${chart}: unknown nested element member`)

    const missingRoles = structuredClone(roles); delete missingRoles[Object.keys(template.rolesSchema.kind === 'object' ? template.rolesSchema.fields : {})[0]]
    const missingConfig = structuredClone(config); delete missingConfig[Object.keys(template.configSchema.kind === 'object' ? template.configSchema.fields : {})[0]]
    expect(!template.validateRoles(missingRoles).valid && !template.validateConfig(missingConfig).valid, `${chart}: required members`)

    const collection = firstCollection(chart, roles)
    const wrongCollection = structuredClone(roles)
    if (chart === 'heatmap_annotated') (wrongCollection.scale as Record<string, unknown>).stops = {}
    else wrongCollection[chart === 'line_multiseries' ? 'series' : 'groups'] = {}
    expect(!template.validateRoles(wrongCollection).valid, `${chart}: array shape`)
    const emptyRoles = structuredClone(roles)
    if (chart === 'heatmap_annotated') (emptyRoles.scale as Record<string, unknown>).stops = []
    else emptyRoles[chart === 'line_multiseries' ? 'series' : 'groups'] = []
    expect(!template.validateRoles(emptyRoles).valid, `${chart}: array minimum`)
    if (chart !== 'heatmap_annotated') {
      const maximum = structuredClone(roles); maximum[chart === 'line_multiseries' ? 'series' : 'groups'] = Array.from({ length: 10 }, (_, index) => ({ ...collection[0], key: `k${index}` }))
      expect(template.validateRoles(maximum).valid, `${chart}: array maximum boundary`)
      const excessive = structuredClone(roles); excessive[chart === 'line_multiseries' ? 'series' : 'groups'] = Array.from({ length: 11 }, (_, index) => ({ ...collection[0], key: `k${index}` }))
      expect(!template.validateRoles(excessive).valid, `${chart}: array maximum`)
      const duplicate = structuredClone(roles); duplicate[chart === 'line_multiseries' ? 'series' : 'groups'] = [{ ...collection[0] }, { ...collection[0] }]
      expect(!template.validateRoles(duplicate).valid, `${chart}: uniqueness`)
    }

    const configSchema = template.configSchema.kind === 'object' ? template.configSchema : undefined
    const enumKey = Object.entries(configSchema?.fields ?? {}).find(([, field]) => field.schema.kind === 'string' && field.schema.enum)?.[0]
    const numberKey = Object.entries(configSchema?.fields ?? {}).find(([, field]) => field.schema.kind === 'number')?.[0]
    if (enumKey) expect(!template.validateConfig({ ...config, [enumKey]: '__invalid__' }).valid, `${chart}: enum`)
    if (numberKey) {
      const schema = configSchema?.fields[numberKey].schema
      if (schema?.kind === 'number') {
        if (schema.integer) expect(!template.validateConfig({ ...config, [numberKey]: 0.5 }).valid, `${chart}: integer`)
        if (schema.min !== undefined) expect(!template.validateConfig({ ...config, [numberKey]: schema.min - 1 }).valid, `${chart}: numeric minimum`)
        if (schema.max !== undefined) expect(!template.validateConfig({ ...config, [numberKey]: schema.max + 1 }).valid, `${chart}: numeric maximum`)
      }
    }
    const optionalConfigKey = Object.entries(configSchema?.fields ?? {}).find(([, field]) => !field.required)?.[0]
    if (optionalConfigKey) { const omitted = structuredClone(config); delete omitted[optionalConfigKey]; expect(template.validateConfig(omitted).valid, `${chart}: optional config member`) }

    const reference = firstPaletteReference(chart, collection[0])
    const originalID = reference.color_id
    reference.color_id = ''
    expect(!template.validateRoles(roles).valid, `${chart}: malformed palette reference`)
    reference.color_id = originalID
    reference.opacity = 0.5; expect(template.validateRoles(roles).valid, `${chart}: opacity valid`)
    reference.opacity = 2; expect(!template.validateRoles(roles).valid, `${chart}: opacity range`)
    delete reference.opacity
    if (roles.elements && typeof roles.elements === 'object') {
      const elements = roles.elements as Record<string, unknown>; const key = Object.keys(elements)[0]; const original = elements[key]
      elements[key] = { source: 'theme', token: 'foreground' }; expect(template.validateRoles(roles).valid, `${chart}: theme reference`)
      elements[key] = { source: 'theme', token: '__invalid__' }; expect(!template.validateRoles(roles).valid, `${chart}: theme token`)
      elements[key] = original
    }
    expect(JSON.stringify({ roles, config }) === before, `${chart}: test fixture restored and validator did not mutate`)
  }
}

function testExactFalseCharacterization(): void {
  const cases: Array<{ name: string; run(): boolean }> = []
  for (const chart of charts) cases.push({ name: `${chart} config root`, run: () => { const { template, config } = fixture(chart); return template.validateConfig({ ...config, legacy_extra: true }).valid } })
  for (const chart of ['bar_error', 'boxplot_jitter', 'line_multiseries', 'scatter_grouped', 'violin_distribution'] as ChartType[]) cases.push({ name: `${chart} collection item`, run: () => { const { template, roles } = fixture(chart); firstCollection(chart, roles)[0].legacy_extra = true; return template.validateRoles(roles).valid } })
  cases.push(
    { name: 'heatmap scale', run: () => { const { template, roles } = fixture('heatmap_annotated'); (roles.scale as Record<string, unknown>).legacy_extra = true; return template.validateRoles(roles).valid } },
    { name: 'heatmap stop', run: () => { const { template, roles } = fixture('heatmap_annotated'); firstCollection('heatmap_annotated', roles)[0].legacy_extra = true; return template.validateRoles(roles).valid } },
    { name: 'heatmap annotation', run: () => { const { template, roles } = fixture('heatmap_annotated'); roles.annotations = [{ key: 'a', label: 'A', color: { source: 'palette', color_id: ids[0] }, legacy_extra: true }]; return template.validateRoles(roles).valid } }
  )
  for (const entry of cases) expect(entry.run(), `${entry.name}: baseline 82d6ecd accepted unknown members and exact:false must preserve it`)
  expect(cases.length === 14, 'every exact:false occurrence must have evidence')
}

function testReferencePolicy(): void {
  const { template, roles } = fixture('bar_error')
  const group = firstCollection('bar_error', roles)[0]
  group.fill = { source: 'palette', color_id: ids[0], hex: '#FFFFFF', index: 0, order: 0, unexpected: true, opacity: 0.5 }
  expect(template.validateRoles(roles).valid, 'baseline palette references ignored extra members without treating them as fallback')
  group.fill = { source: 'palette', hex: '#FFFFFF', index: 0, order: 0 }
  expect(!template.validateRoles(roles).valid, 'HEX/index/order must not replace color_id')
  group.fill = { source: 'palette', color_id: ids[0] }
  const elements = roles.elements as Record<string, unknown>
  elements.axis = { source: 'theme', token: 'foreground', unexpected: true }
  expect(template.validateRoles(roles).valid, 'baseline theme references ignored extra members')
  elements.axis = { source: 'theme', token: 'unknown' }
  expect(!template.validateRoles(roles).valid, 'unknown theme token must fail')
  elements.axis = { source: 'unknown', color_id: ids[0] }
  expect(!template.validateRoles(roles).valid, 'unknown reference source must fail')
  elements.axis = { source: 'theme', token: 'foreground', opacity: 2 }
  const opacity = template.validateRoles(roles)
  expect(!opacity.valid && opacity.issues.some(issue => issue.path === 'color_roles.elements.axis.opacity'), 'opacity range and path')
}

function testRulesOrderingAndNumericMessages(): void {
  const heatmap = fixture('heatmap_annotated')
  const scale = heatmap.roles.scale as Record<string, unknown>
  scale.type = 'diverging'; scale.stops = [{ position: 0, color: { source: 'palette', color_id: ids[0] } }, { position: 0, color: { source: 'palette', color_id: ids[1] } }]
  const result = heatmap.template.validateRoles(heatmap.roles)
  expect(!result.valid && result.issues.map(issue => issue.path).join('|') === 'color_roles.scale.stops[1].position|color_roles.scale.stops', 'strictly increasing issue must precede conditional minimum deterministically')

  const minOnly: PreviewSchema = { kind: 'number', min: 2 }
  const maxOnly: PreviewSchema = { kind: 'number', max: 4 }
  const bounded: PreviewSchema = { kind: 'number', min: 2, max: 4 }
  expect(validateSchema(1, minOnly, 'value', 'INVALID_PREVIEW_CONFIG').issues[0].message === 'value must be at least 2.', 'min-only message')
  expect(validateSchema(5, maxOnly, 'value', 'INVALID_PREVIEW_CONFIG').issues[0].message === 'value must be at most 4.', 'max-only message')
  expect(validateSchema(5, bounded, 'value', 'INVALID_PREVIEW_CONFIG').issues[0].message === 'value must be between 2 and 4.', 'bounded message')
  expect(validateSchemaDeclaration({ kind: 'number', min: 5, max: 2 }).length === 1, 'invalid numeric declaration rejected')
  expect(validateSchemaDeclaration({ kind: 'array', minItems: 2, maxItems: 1, items: { kind: 'boolean' } }).length === 1, 'invalid array declaration rejected')
}

testSixChartConstraintMatrix()
testExactFalseCharacterization()
testReferencePolicy()
testRulesOrderingAndNumericMessages()
