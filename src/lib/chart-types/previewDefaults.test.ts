import { CHART_TYPE_DEFINITIONS, getChartTemplateDefinition, validatePreviewCaseAgainstRegistry } from './registry'
import { createPreviewDefaults, DEFAULT_PREVIEW_TEMPLATE_IDS } from './previewDefaults'
import adminEditorSource from '@/views/admin/palettes/AdminPreviewCaseEditor.vue?raw'

function expect(condition: boolean, message: string): void { if (!condition) throw new Error(message) }

const colorIds = ['color-a', 'color-b', 'color-c', 'color-d', 'color-e', 'color-f']
for (const definition of CHART_TYPE_DEFINITIONS) {
  const input = [...colorIds]
  const result = createPreviewDefaults(definition.chartType, input, -2147483648)
  expect(result.ok, `${definition.chartType} defaults must be generated`)
  if (!result.ok) continue
  const template = getChartTemplateDefinition(definition.chartType, DEFAULT_PREVIEW_TEMPLATE_IDS[definition.chartType])!
  expect(result.value.template_id === template.id && result.value.template_version === template.templateVersion && result.value.schema_version === template.schemaVersion, `${definition.chartType} metadata must come from its explicit registry template`)
  expect(validatePreviewCaseAgainstRegistry(result.value).valid, `${definition.chartType} defaults must pass registry validation`)
  expect(result.value.seed_strategy === 'fixed' && result.value.seed_value === -2147483648, 'factory must preserve an explicit fixed seed')
  expect(input.join(',') === colorIds.join(','), 'factory must not modify color ID input')
  const serialized = JSON.stringify(result.value.color_roles)
  expect(!serialized.includes('#') && !serialized.includes('color-f'), 'roles must use IDs and enforce the existing extra-color limit')
}

expect(!createPreviewDefaults('unknown', colorIds, 0).ok, 'unsupported chart types must fail closed')
expect(!createPreviewDefaults('bar_error', [], 0).ok, 'grouped charts require one color')
expect(!createPreviewDefaults('heatmap_annotated', ['only-one'], 0).ok, 'heatmap requires two colors')
expect(!createPreviewDefaults('bar_error', colorIds, 2147483648).ok && !createPreviewDefaults('bar_error', colorIds, -2147483649).ok, 'factory must reject seeds outside signed 32-bit range')
const heatmapTwo = createPreviewDefaults('heatmap_annotated', colorIds.slice(0, 2), 2147483647)
const heatmapThree = createPreviewDefaults('heatmap_annotated', colorIds, 0)
expect(heatmapTwo.ok && ((heatmapTwo.value.color_roles as any).scale.stops.length === 2), 'two-color heatmap must have two stops')
expect(heatmapThree.ok && ((heatmapThree.value.color_roles as any).scale.stops.length === 3), 'extra-color heatmap must have three stops')
expect(adminEditorSource.includes("from '@/lib/chart-types/previewDefaults'") && adminEditorSource.includes('createPreviewDefaults('), 'Admin editor must consume the shared defaults factory')
expect(!adminEditorSource.includes('createDefaultRoles') && !adminEditorSource.includes('createDefaultConfig'), 'Admin editor must not retain a second hard-coded defaults owner')
