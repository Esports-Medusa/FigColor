import type { ChartTemplateDefinition, PreviewSchema } from '../types'
import { defineTemplate } from '../validation'
const req=(schema:PreviewSchema)=>({required:true,schema}); const opt=(schema:PreviewSchema)=>({required:false,schema}); const visual=():PreviewSchema=>({kind:'visual_reference',themeTokens:['foreground','muted_foreground','grid','background']})
const namedColor:PreviewSchema={kind:'object',exact:false,fields:{key:req({kind:'string',nonWhitespace:true}),label:req({kind:'string',nonWhitespace:true}),color:req({kind:'palette_reference'})}}
export const heatmapAnnotatedTemplate:ChartTemplateDefinition=defineTemplate({id:'heatmap_annotated_v1',chartType:'heatmap_annotated',templateVersion:1,schemaVersion:1,
rolesSchema:{kind:'object',exact:true,fields:{
 scale:req({kind:'object',exact:false,rules:[{kind:'conditional_min_items',arrayField:'stops',discriminatorField:'type',cases:{sequential:2,diverging:3}}],fields:{type:req({kind:'string',enum:['sequential','diverging']}),stops:req({kind:'array',minItems:1,rules:[{kind:'strictly_increasing',field:'position'}],items:{kind:'object',exact:false,fields:{position:req({kind:'number',min:0,max:1}),color:req({kind:'palette_reference'}),label:opt({kind:'string'})}}})}}),
 elements:opt({kind:'object',exact:true,fields:Object.fromEntries(['missing_value','text','border','grid','background','annotation_text'].map(k=>[k,opt(visual())]))}),
 annotations:opt({kind:'array',rules:[{kind:'unique_by',field:'key'}],items:namedColor})}},
configSchema:{kind:'object',exact:false,fields:{rows:req({kind:'number',integer:true,min:4,max:8}),columns:req({kind:'number',integer:true,min:4,max:8}),cluster_rows:req({kind:'boolean'}),cluster_columns:req({kind:'boolean'}),show_row_labels:req({kind:'boolean'}),show_column_labels:req({kind:'boolean'}),show_values:req({kind:'boolean'}),data_pattern:req({kind:'string',enum:['two_clusters','three_clusters','gradient','mixed']})}}})
