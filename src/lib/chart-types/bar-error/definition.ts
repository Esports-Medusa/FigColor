import type { ChartTemplateDefinition, PreviewSchema } from '../types'
import { defineTemplate } from '../validation'

const themeTokens = ['foreground', 'muted_foreground', 'grid', 'background']
const text = (): PreviewSchema => ({ kind: 'string', nonWhitespace: true })
const visual = (): PreviewSchema => ({ kind: 'visual_reference', themeTokens, unknownMembers: 'allow' })
const fields = (entries: Record<string, PreviewSchema>, required = true) => Object.fromEntries(Object.entries(entries).map(([key, schema]) => [key, { required, schema }]))

export const barErrorTemplate: ChartTemplateDefinition = defineTemplate({
  id: 'bar_error_v1', chartType: 'bar_error', templateVersion: 1, schemaVersion: 1,
  rolesSchema: { kind: 'object', exact: true, fields: {
    groups: { required: true, schema: { kind: 'array', minItems: 1, maxItems: 5, rules: [{ kind: 'unique_by', field: 'key', issueCode: 'DUPLICATE_ROLE_KEY' }], items: { kind: 'object', exact: false, fields: fields({ key: text(), label: text(), fill: { kind: 'palette_reference', unknownMembers: 'allow' } }) } } },
    elements: { required: true, schema: { kind: 'object', exact: true, fields: fields({ axis: visual(), grid: visual(), text: visual(), error_bar: visual(), background: visual() }) } }
  } },
  configSchema: { kind: 'object', exact: false, fields: fields({ orientation: { kind: 'string', enum: ['vertical', 'horizontal'] }, sample_size: { kind: 'number', integer: true, min: 1 }, error_type: { kind: 'string', enum: ['sd', 'sem', 'ci'] }, data_pattern: { kind: 'string', enum: ['treatment_higher', 'treatment_lower', 'dose_response', 'mixed'] } }) }
})
