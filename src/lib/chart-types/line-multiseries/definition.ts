import type { ChartTemplateDefinition, PreviewSchema } from '../types'
import { defineTemplate } from '../validation'
const tokens = ['foreground', 'muted_foreground', 'grid', 'background']
const req = (schema: PreviewSchema) => ({ required: true, schema }); const opt = (schema: PreviewSchema) => ({ required: false, schema })
const visual = (): PreviewSchema => ({ kind: 'visual_reference', themeTokens: tokens, unknownMembers: 'allow' })
export const lineMultiseriesTemplate: ChartTemplateDefinition = defineTemplate({
  id: 'line_multiseries_v1', chartType: 'line_multiseries', templateVersion: 1, schemaVersion: 1,
  rolesSchema: { kind: 'object', exact: true, fields: {
    series: req({ kind: 'array', minItems: 1, maxItems: 5, rules: [{ kind: 'unique_by', field: 'key' }], items: { kind: 'object', exact: false, fields: { key: req({kind:'string',nonWhitespace:true}), label:req({kind:'string',nonWhitespace:true}), line:req({kind:'palette_reference',unknownMembers:'allow'}), confidence_band:opt(visual()), marker:opt(visual()) } } }),
    elements: opt({ kind:'object', exact:true, fields:Object.fromEntries(['axis','grid','reference_line','text','marker_stroke','background'].map(key=>[key,opt(visual())])) })
  } },
  configSchema: { kind:'object', exact:false, fields:{ point_count:req({kind:'number',integer:true,min:6,max:12}), curve_shape:req({kind:'string',enum:['increasing','decreasing','sigmoid','peak','mixed']}), x_axis_label:opt({kind:'string'}), y_axis_label:opt({kind:'string'}) } }
})
