import type { DraftPreviewCase } from '@/api/paletteAssistant'
import type { EditableAssistantDraft } from './workbench'
import { resolveDraftColor, validateDraftPreviewCases } from './draftPreview'

function expect(condition: boolean, message: string): void { if (!condition) throw new Error(message) }

const firstId = '2559aff2-2f7b-5f17-9d9f-e505654c4ae5'
const secondId = '621bec94-c917-5be8-877d-1fcf5bb08e1c'

function preview(colorId = firstId): DraftPreviewCase {
  return {
    chart_type: 'bar_error', template_id: 'bar_error_v1', template_version: 1, schema_version: 1,
    color_roles: {
      groups: [{ key: 'control', label: 'Control', fill: { source: 'palette', color_id: colorId } }],
      elements: {
        axis: { source: 'theme', token: 'foreground' }, grid: { source: 'theme', token: 'grid' },
        text: { source: 'theme', token: 'muted_foreground' }, error_bar: { source: 'theme', token: 'foreground' },
        background: { source: 'theme', token: 'background' }
      }
    },
    preview_config: { orientation: 'vertical', sample_size: 24, error_type: 'sem', data_pattern: 'mixed' },
    seed_strategy: 'stable_id'
  }
}

function draft(previewCases: DraftPreviewCase[] = []): EditableAssistantDraft {
  return {
    contract_version: 'palette-assistant.v1', revision: 1, name: 'Draft', type: 'categorical',
    colors: [
      { id: firstId, hex: '#112233', order: 0, source: 'assistant', state: 'unconfirmed', classification: 'data' },
      { id: secondId, hex: '#445566', order: 1, source: 'assistant', state: 'unconfirmed', classification: 'data' }
    ],
    chart_applicability: [], disciplines: [], use_cases: [], avoid_cases: [], tags: [],
    accessibility: { colorblind_safe: false, print_friendly: false, dark_background: false },
    source_type: 'figure_extracted', source_note: '', preview_cases: previewCases, provenance: []
  }
}

function testCardinalityAndImmutability(): void {
  expect(validateDraftPreviewCases(draft()).length === 0, 'an empty authoritative Preview Case array must be valid')
  expect(validateDraftPreviewCases(draft([preview()])).length === 0, 'one valid Preview Case must be valid')
  const multiple = draft([preview(), preview(secondId)])
  const before = structuredClone(multiple)
  const issues = validateDraftPreviewCases(multiple)
  expect(issues.some((item) => item.path === 'preview_cases' && item.code === 'TOO_MANY_PREVIEW_CASES'), 'multiple Preview Cases must produce a blocking cardinality issue')
  expect(multiple.preview_cases.length === 2 && JSON.stringify(multiple) === JSON.stringify(before), 'validation must not truncate or mutate multiple Preview Cases')
}

function testStableReferences(): void {
  const current = draft([preview()])
  expect(resolveDraftColor(current.colors, firstId)?.hex === '#112233', 'reference must resolve by stable Draft color ID')
  const [color] = current.colors.splice(0, 1); current.colors.push(color)
  expect(resolveDraftColor(current.colors, firstId)?.hex === '#112233' && (current.preview_cases[0].color_roles as any).groups[0].fill.color_id === firstId, 'reorder must not alter or rebind the reference')
  current.colors[1].hex = '#AABBCC'
  expect(resolveDraftColor(current.colors, firstId)?.hex === '#AABBCC', 'the same stable reference must resolve an edited HEX')
  current.colors.splice(1, 1)
  current.colors.push({ id: 'b893e1a1-d859-4ff2-b3ed-c70f11527fb5', hex: '#AABBCC', order: 1, source: 'admin', state: 'modified', classification: 'data' })
  const issues = validateDraftPreviewCases(current)
  expect(issues.some((item) => item.path === 'preview_cases[0].color_roles.groups[0].fill.color_id' && item.code === 'DRAFT_COLOR_NOT_FOUND'), 'delete-plus-add must leave the old exact reference invalid')
  expect(resolveDraftColor(current.colors, firstId) === undefined, 'resolution must not fall back by HEX, order, or array index')
}

function testReferenceAndRegistryValidation(): void {
  const malformed = validateDraftPreviewCases(draft([preview('not-a-uuid')]))
  expect(malformed.some((item) => item.path === 'preview_cases[0].color_roles.groups[0].fill.color_id' && item.code === 'INVALID_DRAFT_COLOR_ID'), 'malformed UUID must be field-addressable')
  const unknown = validateDraftPreviewCases(draft([preview('123e4567-e89b-42d3-a456-426614174999')]))
  expect(unknown.some((item) => item.code === 'DRAFT_COLOR_NOT_FOUND'), 'unknown UUID must be rejected')

  const invalid = preview()
  invalid.template_version = 2
  expect(validateDraftPreviewCases(draft([invalid])).some((item) => item.path === 'preview_cases[0].template_version' && item.code === 'UNSUPPORTED_TEMPLATE_VERSION'), 'registry template validation must be preserved with a Draft path')
  invalid.template_version = 1; invalid.schema_version = 2
  expect(validateDraftPreviewCases(draft([invalid])).some((item) => item.code === 'UNSUPPORTED_SCHEMA_VERSION'), 'registry schema validation must be preserved')
  invalid.schema_version = 1; invalid.chart_type = 'unknown'
  expect(validateDraftPreviewCases(draft([invalid])).some((item) => item.code === 'UNSUPPORTED_CHART_TYPE'), 'registry chart validation must be preserved')
  invalid.chart_type = 'bar_error'; invalid.template_id = 'missing'
  expect(validateDraftPreviewCases(draft([invalid])).some((item) => item.code === 'UNKNOWN_TEMPLATE_ID'), 'registry template ID validation must be preserved')

  const badRoles = preview(); badRoles.color_roles = { groups: [] }
  const roleIssues = validateDraftPreviewCases(draft([badRoles]))
  expect(roleIssues.some((item) => item.path.startsWith('preview_cases[0].color_roles') && item.code === 'INVALID_COLOR_ROLES'), 'registry role validation must be preserved')
  const badConfig = preview(); badConfig.preview_config = { orientation: 'diagonal' }
  expect(validateDraftPreviewCases(draft([badConfig])).some((item) => item.path.startsWith('preview_cases[0].preview_config') && item.code === 'INVALID_PREVIEW_CONFIG'), 'registry config validation must be preserved')
}

function testSeedRules(): void {
  const invalidStrategy = preview(); invalidStrategy.seed_strategy = 'random'
  expect(validateDraftPreviewCases(draft([invalidStrategy])).some((item) => item.path === 'preview_cases[0].seed_strategy'), 'invalid seed strategy must be rejected')
  const fixed = preview(); fixed.seed_strategy = 'fixed'
  expect(validateDraftPreviewCases(draft([fixed])).some((item) => item.path === 'preview_cases[0].seed_value'), 'fixed seed requires an integer')
  fixed.seed_value = 42
  expect(validateDraftPreviewCases(draft([fixed])).length === 0, 'fixed integer seed must pass')
}

testCardinalityAndImmutability()
testStableReferences()
testReferenceAndRegistryValidation()
testSeedRules()
