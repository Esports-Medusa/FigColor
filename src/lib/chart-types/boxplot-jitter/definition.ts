import type { ChartTemplateDefinition, PreviewSchema } from '../types'
import { defineTemplate } from '../validation'
const tokens = ['foreground', 'muted_foreground', 'grid', 'background']
const visual = (): PreviewSchema => ({ kind: 'visual_reference', themeTokens: tokens, unknownMembers: 'allow' })
const req = (schema: PreviewSchema) => ({ required: true, schema })
const opt = (schema: PreviewSchema) => ({ required: false, schema })
export const boxplotJitterTemplate: ChartTemplateDefinition = defineTemplate({
  id: 'boxplot_jitter_v1', chartType: 'boxplot_jitter', templateVersion: 1, schemaVersion: 1,
  rolesSchema: { kind: 'object', exact: true, fields: {
    groups: req({ kind: 'array', minItems: 1, maxItems: 5, rules: [{ kind: 'unique_by', field: 'key' }], items: { kind: 'object', exact: false, fields: { key: req({ kind: 'string', nonWhitespace: true }), label: req({ kind: 'string', nonWhitespace: true }), color: req({ kind: 'palette_reference', unknownMembers: 'allow' }) } } }),
    elements: opt({ kind: 'object', exact: true, fields: Object.fromEntries(['jitter_point','median_line','whisker','outline','axis','grid','text','box_stroke','median','jitter','outlier','background'].map(key => [key, opt(visual())])) })
  } },
  configSchema: { kind: 'object', exact: false, fields: { jitter_density: req({ kind: 'string', enum: ['low','medium','high'] }), show_outliers: req({ kind: 'boolean' }), y_axis_label: opt({ kind: 'string' }) } }
})
