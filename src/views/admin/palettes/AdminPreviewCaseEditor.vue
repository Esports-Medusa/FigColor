<template>
  <section class="preview-case-editor">
    <div class="editor-header">
      <div>
        <h3>Scientific Preview Cases</h3>
        <p class="editor-meta">{{ selectedDefinition.label }} · {{ selectedTemplate.id }}</p>
      </div>
      <div class="editor-actions">
        <select v-model="selectedChartType" :disabled="requestInProgress">
          <option v-for="definition in editorDefinitions" :key="definition.chartType" :value="definition.chartType">
            {{ definition.label }}
          </option>
        </select>
        <button type="button" class="btn btn-secondary btn-small" :disabled="requestInProgress" @click="startFreshDraft">
          {{ existingDraftForSelectedChart ? 'Reset Draft Form' : 'New Draft' }}
        </button>
      </div>
    </div>

    <div class="case-list">
      <button
        v-for="previewCase in visiblePreviewCases"
        :key="previewCase.id"
        type="button"
        class="case-chip"
        :class="{ active: selectedPreviewCase?.id === previewCase.id }"
        @click="selectPreviewCase(previewCase)"
      >
        {{ chartLabels[previewCase.chart_type] || previewCase.chart_type }}
        <span>{{ previewCase.status }}{{ previewCase.is_primary ? ' · primary' : '' }}</span>
      </button>
      <span v-if="visiblePreviewCases.length === 0" class="empty-note">No preview case yet.</span>
    </div>

    <div class="editor-grid">
      <div class="editor-fields">
        <div class="field-block">
          <div class="field-block-header">
            <h4>Lifecycle</h4>
            <span class="status-pill">{{ selectedPreviewCase?.status || 'new draft' }}</span>
          </div>
          <div v-if="!localOnly" class="workflow-actions">
            <button type="button" class="btn btn-primary" :disabled="requestInProgress || !canSaveDraft" @click="emitSaveDraft">
              {{ existingDraftForSelectedChart ? 'Update Draft' : 'Create Draft' }}
            </button>
            <button type="button" class="btn btn-success" :disabled="requestInProgress || !savedDraft || allIssues.length > 0" @click="emitPublish">
              Publish
            </button>
            <button type="button" class="btn btn-info" :disabled="requestInProgress || !canSetPrimary" @click="emitSetPrimary">
              Set Primary
            </button>
            <button type="button" class="btn btn-warning" :disabled="requestInProgress || !canArchive" @click="emitArchive">
              Archive
            </button>
            <button type="button" class="btn btn-danger" :disabled="requestInProgress || !savedDraft" @click="emitDeleteDraft">
              Delete Draft
            </button>
          </div>
        </div>

        <div v-if="!advancedMode" class="structured-editor">
          <div v-for="section in selectedDefinition.roleSections" :key="section.id" class="field-block">
            <div class="field-block-header">
              <h4>{{ section.label }}</h4>
              <button
                v-if="isRepeatableSection(section)"
                type="button"
                class="btn btn-secondary btn-small"
                :disabled="isReadOnly"
                @click="addRoleItem(section)"
              >
                Add
              </button>
            </div>

            <div v-if="section.kind === 'named-array'" class="role-rows">
              <div v-for="(item, index) in getArray(section.path)" :key="`${section.id}-${index}`" class="role-row">
                <input v-model="item.key" type="text" placeholder="key" :disabled="isReadOnly" />
                <input v-model="item.label" type="text" placeholder="label" :disabled="isReadOnly" />
                <select v-model="item[section.colorField].color_id" :disabled="isReadOnly">
                  <option value="">Missing color...</option>
                  <option v-for="color in palette.colors" :key="color.id" :value="color.id">
                    {{ color.label || color.hex }}
                  </option>
                </select>
                <template v-if="section.id === 'series'">
                  <select :value="visualReferenceValue(item.confidence_band)" :disabled="isReadOnly" @change="setVisualReference(item, 'confidence_band', ($event.target as HTMLSelectElement).value)">
                    <option value="">Omit confidence band</option>
                    <option v-for="option in visualReferenceOptions" :key="`band-${option.value}`" :value="option.value">{{ option.label }}</option>
                  </select>
                  <select :value="visualReferenceValue(item.marker)" :disabled="isReadOnly" @change="setVisualReference(item, 'marker', ($event.target as HTMLSelectElement).value)">
                    <option value="">Omit marker</option>
                    <option v-for="option in visualReferenceOptions" :key="`marker-${option.value}`" :value="option.value">{{ option.label }}</option>
                  </select>
                </template>
                <button type="button" class="btn btn-secondary btn-square" :disabled="index === 0 || isReadOnly" @click="moveArrayItem(section.path, index, -1)">↑</button>
                <button type="button" class="btn btn-secondary btn-square" :disabled="index === getArray(section.path).length - 1 || isReadOnly" @click="moveArrayItem(section.path, index, 1)">↓</button>
                <button type="button" class="btn btn-danger btn-square" :disabled="getArray(section.path).length <= (section.minItems || 0) || isReadOnly" @click="removeArrayItem(section.path, index)">×</button>
              </div>
            </div>

            <div v-else-if="section.kind === 'scale-stops'" class="role-rows">
              <div v-for="(item, index) in getArray(section.path)" :key="`${section.id}-${index}`" class="role-row scale-row">
                <input v-model.number="item.position" type="number" min="0" max="1" step="0.05" :disabled="isReadOnly" />
                <input v-model="item.label" type="text" placeholder="label" :disabled="isReadOnly" />
                <select v-model="item.color.color_id" :disabled="isReadOnly">
                  <option value="">Missing color...</option>
                  <option v-for="color in palette.colors" :key="color.id" :value="color.id">
                    {{ color.label || color.hex }}
                  </option>
                </select>
                <button type="button" class="btn btn-secondary btn-square" :disabled="index === 0 || isReadOnly" @click="moveArrayItem(section.path, index, -1)">↑</button>
                <button type="button" class="btn btn-secondary btn-square" :disabled="index === getArray(section.path).length - 1 || isReadOnly" @click="moveArrayItem(section.path, index, 1)">↓</button>
                <button type="button" class="btn btn-danger btn-square" :disabled="getArray(section.path).length <= (section.minItems || 0) || isReadOnly" @click="removeArrayItem(section.path, index)">×</button>
              </div>
            </div>

            <div v-else-if="section.kind === 'elements'" class="element-grid">
              <label v-for="key in section.keys" :key="key">
                {{ key }}
                <select :value="elementToken(key)" :disabled="isReadOnly" @change="setElementToken(key, ($event.target as HTMLSelectElement).value)">
                  <option value="">Omit</option>
                  <option v-for="token in themeTokens" :key="token" :value="token">{{ token }}</option>
                </select>
              </label>
            </div>

            <div v-else-if="section.kind === 'scale-type'" class="config-grid">
              <label>
                Scale Type
                <select v-model="roles.scale.type" :disabled="isReadOnly" @change="ensureScaleStopMinimum">
                  <option value="sequential">Sequential</option>
                  <option value="diverging">Diverging</option>
                </select>
              </label>
            </div>
          </div>

          <div class="field-block">
            <h4>Preview Config</h4>
            <div class="config-grid">
              <label v-for="field in selectedDefinition.configFields" :key="field.key">
                {{ field.label }}
                <select v-if="field.kind === 'enum'" v-model="config[field.key]" :disabled="isReadOnly">
                  <option v-for="option in field.options" :key="String(option)" :value="option">{{ option }}</option>
                </select>
                <input v-else-if="field.kind === 'number'" v-model.number="config[field.key]" type="number" :min="field.min" :max="field.max" :disabled="isReadOnly" />
                <input v-else-if="field.kind === 'boolean'" v-model="config[field.key]" type="checkbox" :disabled="isReadOnly" />
                <input v-else v-model="config[field.key]" type="text" :disabled="isReadOnly" />
              </label>
            </div>
          </div>
        </div>

        <div v-else class="field-block">
          <h4>Advanced JSON</h4>
          <label>
            color_roles
            <textarea v-model="rolesJson" rows="10" :disabled="isReadOnly" @blur="applyRolesJson"></textarea>
          </label>
          <label>
            preview_config
            <textarea v-model="configJson" rows="8" :disabled="isReadOnly" @blur="applyConfigJson"></textarea>
          </label>
          <p v-if="jsonError" class="error-text">{{ jsonError }}</p>
        </div>

        <div class="field-block">
          <label class="toggle-row">
            <input v-model="advancedMode" type="checkbox" :disabled="isReadOnly" />
            Advanced JSON
          </label>
        </div>

        <PreviewValidationIssues :issues="allIssues" />

        <div class="field-block">
          <h4>Runtime Export From Draft</h4>
          <pre>{{ jsonExport }}</pre>
        </div>
      </div>

      <div class="live-preview">
        <PaletteChartPreview :palette="palette" :preview-case="localPreviewCase" size="hero" :public-only="false" />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import PaletteChartPreview from '@/components/palettes/PaletteChartPreview.vue'
import PreviewValidationIssues from '@/components/admin/previews/PreviewValidationIssues.vue'
import { getChartTemplateDefinition, validatePreviewCaseAgainstRegistry } from '@/lib/chart-types/registry'
import { createPreviewDefaults, DEFAULT_PREVIEW_TEMPLATE_IDS } from '@/lib/chart-types/previewDefaults'
import { resolveExplicitPreviewCaseExportModel, toJsonExport } from '@/lib/exports'
import {
  editorValueFromVisualReference,
  parseEditorObjectJson,
  resolveLifecycleActionAvailability,
  visualReferenceFromEditorValue
} from './AdminPreviewCaseEditor.logic'
import type { CanonicalPalette, ChartType, PalettePreviewCase, ThemeColorReference, ValidationIssue } from '@/types/palette'

type RoleSection =
  | { id: string; label: string; kind: 'named-array'; path: string; colorField: string; repeatable: true; minItems: number }
  | { id: string; label: string; kind: 'scale-stops'; path: string; repeatable: true; minItems: number }
  | { id: string; label: string; kind: 'elements'; path: string; keys: string[] }
  | { id: string; label: string; kind: 'scale-type'; path: string }

type ConfigField =
  | { key: string; label: string; kind: 'enum'; options: readonly string[] }
  | { key: string; label: string; kind: 'number'; min?: number; max?: number }
  | { key: string; label: string; kind: 'boolean' }
  | { key: string; label: string; kind: 'string' }

interface EditorDefinition {
  chartType: ChartType
  label: string
  roleSections: RoleSection[]
  configFields: ConfigField[]
}

interface Props {
  palette: CanonicalPalette
  previewCases?: PalettePreviewCase[]
  requestInProgress?: boolean
  backendIssues?: ValidationIssue[]
  localOnly?: boolean
}

interface Emits {
  (e: 'saveDraft', previewCase: PalettePreviewCase): void
  (e: 'publish', previewCase: PalettePreviewCase): void
  (e: 'setPrimary', previewCaseId: string): void
  (e: 'archive', previewCaseId: string): void
  (e: 'deleteDraft', previewCaseId: string): void
}

const props = withDefaults(defineProps<Props>(), {
  previewCases: () => [],
  requestInProgress: false,
  backendIssues: () => [],
  localOnly: false
})
const emit = defineEmits<Emits>()

const themeTokens = ['foreground', 'muted_foreground', 'grid', 'background'] as const
const selectedChartType = ref<ChartType>('bar_error')
const selectedPreviewCaseId = ref<string | null>(null)
const roles = ref<Record<string, any>>({})
const config = ref<Record<string, any>>({})
const advancedMode = ref(false)
const rolesJson = ref('')
const configJson = ref('')
const jsonError = ref('')

const editorDefinitions: EditorDefinition[] = [
  {
    chartType: 'bar_error',
    label: 'Bar with error bars',
    roleSections: [
      { id: 'groups', label: 'Groups', kind: 'named-array', path: 'groups', colorField: 'fill', repeatable: true, minItems: 1 },
      { id: 'elements', label: 'Elements', kind: 'elements', path: 'elements', keys: ['axis', 'grid', 'text', 'error_bar', 'background'] }
    ],
    configFields: [
      { key: 'orientation', label: 'Orientation', kind: 'enum', options: ['vertical', 'horizontal'] },
      { key: 'sample_size', label: 'Sample Size', kind: 'number', min: 1 },
      { key: 'error_type', label: 'Error Type', kind: 'enum', options: ['sd', 'sem', 'ci'] },
      { key: 'data_pattern', label: 'Data Pattern', kind: 'enum', options: ['treatment_higher', 'treatment_lower', 'dose_response', 'mixed'] }
    ]
  },
  {
    chartType: 'boxplot_jitter',
    label: 'Boxplot with jitter',
    roleSections: [
      { id: 'groups', label: 'Groups', kind: 'named-array', path: 'groups', colorField: 'color', repeatable: true, minItems: 1 },
      { id: 'elements', label: 'Optional Elements', kind: 'elements', path: 'elements', keys: ['jitter_point', 'median_line', 'whisker', 'outline', 'axis', 'grid', 'text', 'background'] }
    ],
    configFields: [
      { key: 'jitter_density', label: 'Jitter Density', kind: 'enum', options: ['low', 'medium', 'high'] },
      { key: 'show_outliers', label: 'Show Outliers', kind: 'boolean' },
      { key: 'y_axis_label', label: 'Y Axis Label', kind: 'string' }
    ]
  },
  {
    chartType: 'line_multiseries',
    label: 'Multi-series line',
    roleSections: [
      { id: 'series', label: 'Series', kind: 'named-array', path: 'series', colorField: 'line', repeatable: true, minItems: 1 },
      { id: 'elements', label: 'Optional Elements', kind: 'elements', path: 'elements', keys: ['axis', 'grid', 'reference_line', 'text', 'marker_stroke', 'background'] }
    ],
    configFields: [
      { key: 'point_count', label: 'Point Count', kind: 'number', min: 6, max: 12 },
      { key: 'curve_shape', label: 'Curve Shape', kind: 'enum', options: ['increasing', 'decreasing', 'sigmoid', 'peak', 'mixed'] },
      { key: 'x_axis_label', label: 'X Axis Label', kind: 'string' },
      { key: 'y_axis_label', label: 'Y Axis Label', kind: 'string' }
    ]
  },
  {
    chartType: 'heatmap_annotated',
    label: 'Annotated heatmap',
    roleSections: [
      { id: 'scaleType', label: 'Scale', kind: 'scale-type', path: 'scale' },
      { id: 'stops', label: 'Scale Stops', kind: 'scale-stops', path: 'scale.stops', repeatable: true, minItems: 2 },
      { id: 'annotations', label: 'Annotations', kind: 'named-array', path: 'annotations', colorField: 'color', repeatable: true, minItems: 0 },
      { id: 'elements', label: 'Optional Elements', kind: 'elements', path: 'elements', keys: ['missing_value', 'text', 'border', 'grid', 'background', 'annotation_text'] }
    ],
    configFields: [
      { key: 'rows', label: 'Rows', kind: 'number', min: 4, max: 8 },
      { key: 'columns', label: 'Columns', kind: 'number', min: 4, max: 8 },
      { key: 'cluster_rows', label: 'Cluster Rows', kind: 'boolean' },
      { key: 'cluster_columns', label: 'Cluster Columns', kind: 'boolean' },
      { key: 'show_row_labels', label: 'Show Row Labels', kind: 'boolean' },
      { key: 'show_column_labels', label: 'Show Column Labels', kind: 'boolean' },
      { key: 'show_values', label: 'Show Values', kind: 'boolean' },
      { key: 'data_pattern', label: 'Data Pattern', kind: 'enum', options: ['two_clusters', 'three_clusters', 'gradient', 'mixed'] }
    ]
  },
  {
    chartType: 'scatter_grouped',
    label: 'Grouped scatter',
    roleSections: [
      { id: 'groups', label: 'Groups', kind: 'named-array', path: 'groups', colorField: 'color', repeatable: true, minItems: 1 },
      { id: 'elements', label: 'Elements', kind: 'elements', path: 'elements', keys: ['axis', 'muted_foreground', 'grid', 'background'] }
    ],
    configFields: [
      { key: 'point_count', label: 'Point Count', kind: 'number', min: 8, max: 30 },
      { key: 'data_pattern', label: 'Data Pattern', kind: 'enum', options: ['clusters', 'positive', 'negative', 'mixed'] },
      { key: 'point_size', label: 'Point Size', kind: 'enum', options: ['small', 'medium', 'large'] },
      { key: 'point_opacity', label: 'Point Opacity', kind: 'number', min: 0.25, max: 1 }
    ]
  },
  {
    chartType: 'violin_distribution',
    label: 'Violin distribution',
    roleSections: [
      { id: 'groups', label: 'Distributions', kind: 'named-array', path: 'groups', colorField: 'fill', repeatable: true, minItems: 1 },
      { id: 'elements', label: 'Elements', kind: 'elements', path: 'elements', keys: ['outline', 'median', 'axis', 'grid', 'background'] }
    ],
    configFields: [
      { key: 'sample_count', label: 'Sample Count', kind: 'number', min: 16, max: 48 },
      { key: 'distribution_shape', label: 'Distribution Shape', kind: 'enum', options: ['normal', 'skewed', 'bimodal', 'mixed'] },
      { key: 'bandwidth', label: 'Bandwidth', kind: 'enum', options: ['narrow', 'medium', 'wide'] },
      { key: 'show_summary', label: 'Show Summary', kind: 'boolean' }
    ]
  }
]

const chartLabels = Object.fromEntries(editorDefinitions.map((definition) => [definition.chartType, definition.label])) as Record<ChartType, string>
const visualReferenceOptions = computed(() => [
  ...props.palette.colors.map((color) => ({
    value: `palette:${color.id}`,
    label: color.label || color.hex
  })),
  ...themeTokens.map((token) => ({
    value: `theme:${token}`,
    label: `Theme ${token}`
  }))
])

const selectedDefinition = computed(() =>
  editorDefinitions.find((definition) => definition.chartType === selectedChartType.value) ?? editorDefinitions[0]
)
const selectedTemplate = computed(() => ({
  id: DEFAULT_PREVIEW_TEMPLATE_IDS[selectedChartType.value],
  templateVersion: getChartTemplateDefinition(selectedChartType.value, DEFAULT_PREVIEW_TEMPLATE_IDS[selectedChartType.value])!.templateVersion,
  schemaVersion: getChartTemplateDefinition(selectedChartType.value, DEFAULT_PREVIEW_TEMPLATE_IDS[selectedChartType.value])!.schemaVersion
}))
const visiblePreviewCases = computed(() =>
  props.previewCases.filter((previewCase) => previewCase.chart_type === selectedChartType.value)
)
const selectedPreviewCase = computed(() =>
  selectedPreviewCaseId.value
    ? props.previewCases.find((previewCase) => previewCase.id === selectedPreviewCaseId.value) ?? null
    : visiblePreviewCases.value.find((previewCase) => previewCase.status === 'draft') ??
      visiblePreviewCases.value.find((previewCase) => previewCase.status === 'published') ??
      visiblePreviewCases.value[0] ??
      null
)
const existingDraftForSelectedChart = computed(() =>
  visiblePreviewCases.value.find((previewCase) => previewCase.status === 'draft') ?? null
)
const savedDraft = computed(() => selectedPreviewCase.value?.status === 'draft' ? selectedPreviewCase.value : null)
const localPreviewCase = computed<PalettePreviewCase>(() => ({
  id: selectedPreviewCase.value?.id ?? `local-${selectedChartType.value}`,
  palette_id: props.palette.id,
  chart_type: selectedChartType.value,
  template_id: selectedTemplate.value.id,
  template_version: selectedTemplate.value.templateVersion,
  schema_version: selectedTemplate.value.schemaVersion,
  color_roles: clone(roles.value),
  preview_config: clone(config.value),
  seed_strategy: 'stable_id',
  seed_value: null,
  is_primary: selectedPreviewCase.value?.status === 'published' ? selectedPreviewCase.value.is_primary : false,
  status: selectedPreviewCase.value?.status ?? 'draft'
}))
const localIssues = computed(() => {
  const result = validatePreviewCaseAgainstRegistry(localPreviewCase.value)
  const duplicateIssues = [
    ...duplicateKeyIssues(roles.value.groups, 'preview_case.color_roles.groups'),
    ...duplicateKeyIssues(roles.value.series, 'preview_case.color_roles.series'),
    ...duplicateKeyIssues(roles.value.annotations, 'preview_case.color_roles.annotations')
  ]
  return [...(result.valid ? [] : result.issues), ...duplicateIssues]
})
const allIssues = computed(() => [...localIssues.value, ...props.backendIssues])
const lifecycleAvailability = computed(() =>
  resolveLifecycleActionAvailability(selectedPreviewCase.value, allIssues.value.length > 0, props.requestInProgress)
)
const canSaveDraft = computed(() => lifecycleAvailability.value.saveDraft)
const canSetPrimary = computed(() => lifecycleAvailability.value.setPrimary)
const canArchive = computed(() => lifecycleAvailability.value.archive)
const isReadOnly = computed(() => lifecycleAvailability.value.readOnly)
const jsonExport = computed(() => toJsonExport(resolveExplicitPreviewCaseExportModel(props.palette, localPreviewCase.value)))

watch(selectedChartType, () => {
  selectedPreviewCaseId.value = null
  syncFromSelected()
})

watch(selectedPreviewCase, () => syncFromSelected(), { immediate: true })
watch(
  () => props.palette.colors.map((color) => `${color.id}:${color.hex}`).join('|'),
  () => {
    if (props.localOnly && !selectedPreviewCase.value) syncFromSelected()
  }
)
watch([roles, config], () => syncJsonText(), { deep: true })

function syncFromSelected(): void {
  const previewCase = selectedPreviewCase.value
  if (previewCase?.chart_type === selectedChartType.value) {
    roles.value = cloneObject(previewCase.color_roles)
    config.value = cloneObject(previewCase.preview_config)
  } else {
    applySharedDefaults()
  }
  ensureScaleStopMinimum()
  syncJsonText()
}

function selectPreviewCase(previewCase: PalettePreviewCase): void {
  selectedChartType.value = previewCase.chart_type
  selectedPreviewCaseId.value = previewCase.id
  roles.value = cloneObject(previewCase.color_roles)
  config.value = cloneObject(previewCase.preview_config)
  syncJsonText()
}

function startFreshDraft(): void {
  selectedPreviewCaseId.value = `local-${selectedChartType.value}-draft`
  applySharedDefaults()
  syncJsonText()
}

function emitSaveDraft(): void {
  if (!canSaveDraft.value) return
  emit('saveDraft', localPreviewCase.value)
}

function emitPublish(): void {
  if (!lifecycleAvailability.value.publish) return
  emit('publish', localPreviewCase.value)
}

function emitSetPrimary(): void {
  if (!selectedPreviewCase.value?.id || !canSetPrimary.value) return
  emit('setPrimary', selectedPreviewCase.value.id)
}

function emitArchive(): void {
  if (!selectedPreviewCase.value?.id) return
  emit('archive', selectedPreviewCase.value.id)
}

function emitDeleteDraft(): void {
  if (!savedDraft.value?.id || !lifecycleAvailability.value.deleteDraft) return
  emit('deleteDraft', savedDraft.value.id)
}

function getArray(path: string): any[] {
  const value = path.split('.').reduce<any>((cursor, part) => cursor?.[part], roles.value)
  return Array.isArray(value) ? value : []
}

function addRoleItem(section: Extract<RoleSection, { repeatable: true }>): void {
  if (isReadOnly.value) return
  const array = getArray(section.path)
  if (section.kind === 'scale-stops') {
    array.push({
      position: Math.min(1, Math.max(0, array.length / Math.max(1, array.length))),
      label: `Stop ${array.length + 1}`,
      color: paletteRef(props.palette.colors[array.length % Math.max(1, props.palette.colors.length)]?.id ?? '')
    })
    normalizeStopPositions(array)
    return
  }

  const color = props.palette.colors[array.length % Math.max(1, props.palette.colors.length)]
  array.push(namedItem(`${section.id}_${array.length + 1}`, `${section.label} ${array.length + 1}`, section.colorField, color?.id ?? ''))
}

function removeArrayItem(path: string, index: number): void {
  if (isReadOnly.value) return
  getArray(path).splice(index, 1)
}

function moveArrayItem(path: string, index: number, direction: -1 | 1): void {
  if (isReadOnly.value) return
  const array = getArray(path)
  const next = index + direction
  if (next < 0 || next >= array.length) return
  const [item] = array.splice(index, 1)
  array.splice(next, 0, item)
}

function elementToken(key: string): string {
  const reference = roles.value.elements?.[key]
  return reference?.source === 'theme' ? reference.token : ''
}

function setElementToken(key: string, token: string): void {
  if (isReadOnly.value) return
  roles.value.elements = roles.value.elements || {}
  if (!token) {
    delete roles.value.elements[key]
  } else {
    roles.value.elements[key] = { source: 'theme', token: token as ThemeColorReference['token'] }
  }
}

function visualReferenceValue(value: unknown): string {
  return editorValueFromVisualReference(value)
}

function setVisualReference(item: Record<string, any>, key: 'confidence_band' | 'marker', value: string): void {
  if (isReadOnly.value) return
  const reference = visualReferenceFromEditorValue(value)
  if (!reference) {
    delete item[key]
    return
  }
  item[key] = reference
}

function ensureScaleStopMinimum(): void {
  if (selectedChartType.value !== 'heatmap_annotated') return
  roles.value.scale = roles.value.scale || { type: 'sequential', stops: [] }
  roles.value.scale.stops = Array.isArray(roles.value.scale.stops) ? roles.value.scale.stops : []
  const minimum = roles.value.scale.type === 'diverging' ? 3 : 2
  while (roles.value.scale.stops.length < minimum) {
    addRoleItem(selectedDefinition.value.roleSections.find((section): section is Extract<RoleSection, { kind: 'scale-stops' }> => section.kind === 'scale-stops')!)
  }
  normalizeStopPositions(roles.value.scale.stops)
}

function applyRolesJson(): void {
  if (isReadOnly.value) return
  applyJson(rolesJson.value, (value) => { roles.value = value })
}

function applyConfigJson(): void {
  if (isReadOnly.value) return
  applyJson(configJson.value, (value) => { config.value = value })
}

function applyJson(text: string, assign: (value: Record<string, any>) => void): void {
  const result = parseEditorObjectJson(text, {})
  jsonError.value = result.error
  if (!result.error) assign(result.value)
}

function syncJsonText(): void {
  rolesJson.value = JSON.stringify(roles.value, null, 2)
  configJson.value = JSON.stringify(config.value, null, 2)
}

function applySharedDefaults(): void {
  const result = createPreviewDefaults(selectedChartType.value, props.palette.colors.map((color) => color.id), 0)
  roles.value = result.ok ? cloneObject(result.value.color_roles) : {}
  config.value = result.ok ? cloneObject(result.value.preview_config) : {}
}

function namedItem(key: string, label: string, colorField: string, colorId: string): Record<string, any> {
  return { key, label, [colorField]: paletteRef(colorId) }
}

function paletteRef(colorId: string) {
  return { source: 'palette', color_id: colorId }
}

function normalizeStopPositions(stops: any[]): void {
  if (stops.length <= 1) return
  stops.forEach((stop, index) => {
    stop.position = index / (stops.length - 1)
  })
}

function duplicateKeyIssues(value: unknown, path: string): ValidationIssue[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const issues: ValidationIssue[] = []
  value.forEach((item, index) => {
    if (!isRecord(item) || typeof item.key !== 'string') return
    if (seen.has(item.key)) {
      issues.push({ path: `${path}[${index}].key`, code: 'DUPLICATE_ROLE_KEY', message: `Duplicate role key: ${item.key}.` })
    }
    seen.add(item.key)
  })
  return issues
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function cloneObject(value: unknown): Record<string, any> {
  return isRecord(value) ? clone(value) : {}
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isRepeatableSection(section: RoleSection): section is Extract<RoleSection, { repeatable: true }> {
  return section.kind === 'named-array' || section.kind === 'scale-stops'
}
</script>

<style scoped>
.preview-case-editor {
  display: grid;
  gap: 1rem;
  padding: 1rem;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
}

.editor-header,
.field-block-header,
.workflow-actions,
.editor-actions,
.case-list {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.editor-header,
.field-block-header {
  justify-content: space-between;
}

.editor-header h3,
.field-block h4 {
  margin: 0;
}

.editor-meta,
.empty-note {
  margin: 0.2rem 0 0;
  color: #6b7280;
  font-size: 0.75rem;
}

.editor-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1rem;
}

.live-preview {
  grid-row: 1;
}

.editor-fields {
  grid-row: 2;
}

.editor-fields,
.structured-editor,
.field-block,
.role-rows {
  display: grid;
  gap: 0.75rem;
}

.field-block {
  padding: 0.875rem;
  border: 1px solid #eef0f4;
  border-radius: 8px;
}

.role-row {
  display: grid;
  grid-template-columns: minmax(95px, 0.85fr) minmax(120px, 1fr) minmax(140px, 1fr) auto auto auto;
  gap: 0.5rem;
  align-items: center;
}

.scale-row {
  grid-template-columns: 80px minmax(120px, 1fr) minmax(140px, 1fr) auto auto auto;
}

.config-grid,
.element-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
}

.config-grid label,
.element-grid label,
.field-block label {
  display: grid;
  gap: 0.35rem;
  color: #374151;
  font-size: 0.75rem;
  font-weight: 600;
}

input,
select,
textarea {
  min-width: 0;
  padding: 0.45rem 0.55rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 0.8125rem;
}

input[type="checkbox"] {
  width: 16px;
  height: 16px;
}

pre {
  max-height: 220px;
  overflow: auto;
  padding: 0.75rem;
  margin: 0;
  background: #f8fafc;
  border-radius: 6px;
  font-size: 0.75rem;
}

.case-chip {
  display: inline-grid;
  gap: 0.1rem;
  padding: 0.45rem 0.7rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #fff;
  color: #111827;
  cursor: pointer;
  text-align: left;
}

.case-chip.active {
  border-color: #2563eb;
  background: #eff6ff;
}

.case-chip span,
.status-pill {
  color: #6b7280;
  font-size: 0.7rem;
  text-transform: capitalize;
}

.toggle-row {
  display: flex !important;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 0.5rem;
}

.live-preview {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}

.btn {
  padding: 0.625rem 1rem;
  border: 0;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
}

.btn-small {
  padding: 0.45rem 0.65rem;
  font-size: 0.75rem;
}

.btn-square {
  width: 28px;
  height: 28px;
  padding: 0;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary { background: #2563eb; color: #fff; }
.btn-secondary { background: #f3f4f6; color: #374151; }
.btn-info { background: #3b82f6; color: #fff; }
.btn-success { background: #10b981; color: #fff; }
.btn-warning { background: #f59e0b; color: #fff; }
.btn-danger { background: #fee2e2; color: #991b1b; }

.error-text {
  color: #dc2626;
  font-size: 0.75rem;
}

@media (max-width: 980px) {
  .editor-grid,
  .role-row,
  .scale-row,
  .config-grid,
  .element-grid {
    grid-template-columns: 1fr;
  }
}
</style>
