<template>
  <div class="admin-palette-form">
    <div class="page-header">
      <div class="header-left">
        <h1>{{ isEditing ? 'Edit Palette' : 'New Palette' }}</h1>
        <p class="subtitle">{{ isEditing ? `Editing "${form.name || 'palette'}"` : 'Create a new color palette' }}</p>
      </div>
      <button class="btn btn-secondary" @click="router.push('/admin/palettes')">
        ← Back
      </button>
    </div>

    <div class="form-layout">
      <!-- Main Form -->
      <div class="form-section">
        <div class="form-group">
          <label for="name">Name *</label>
          <input
            id="name"
            v-model="form.name"
            type="text"
            placeholder="e.g., Nature Scientific Palette"
            @blur="generateSlugFromName"
          />
        </div>

        <div class="form-group">
          <label for="slug">Slug</label>
          <input
            id="slug"
            v-model="form.slug"
            type="text"
            placeholder="auto-generated-from-name"
          />
        </div>

        <div class="form-group">
          <label for="colors">Colors (HEX, one per line) *</label>
          <textarea
            id="colors"
            v-model="colorsInput"
            placeholder="#4E79A7&#10;#F28E2B&#10;#59A14F&#10;#E15759&#10;#76B7B3"
            rows="6"
            @input="updateColorsFromInput"
          ></textarea>
          <span v-if="colorsError" class="error-text">{{ colorsError }}</span>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="type">Type *</label>
            <select id="type" v-model="form.type">
              <option value="">Select type...</option>
              <option v-for="option in paletteTypeOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </div>

          <div class="form-group">
            <label for="color_count">Color Count</label>
            <input id="color_count" v-model.number="form.color_count" type="number" min="1" readonly />
          </div>
        </div>

        <div class="form-group">
          <label for="chart_types">Chart Types</label>
          <p v-if="chartApplicabilityMode === 'authored'" class="helper-text">
            Derived from chart applicability while authored applicability is active.
          </p>
          <div class="checkbox-group">
            <label v-for="ct in availableChartTypes" :key="ct">
              <input type="checkbox" :value="ct" v-model="form.chart_types" :disabled="chartApplicabilityMode === 'authored'" />
              {{ ct }}
            </label>
          </div>
        </div>

        <div class="form-group applicability-editor">
          <div class="section-header">
            <div>
              <h3>Chart Applicability</h3>
              <p v-if="chartApplicabilityMode === 'legacy'" class="helper-text">
                Legacy chart_types are currently in use.
              </p>
            </div>
            <div class="section-actions">
              <button
                v-if="chartApplicabilityMode === 'legacy'"
                type="button"
                class="btn btn-secondary btn-small"
                @click="migrateToChartApplicability"
              >
                Migrate to chart applicability
              </button>
              <button
                v-else
                type="button"
                class="btn btn-secondary btn-small"
                @click="useLegacyChartTypes"
              >
                Use legacy chart types
              </button>
            </div>
          </div>

          <div v-if="chartApplicabilityMode === 'authored'" class="applicability-rows">
            <div
              v-for="(item, index) in form.chart_applicability"
              :key="index"
              class="applicability-row"
            >
              <select v-model="item.chart_type">
                <option value="">Chart type...</option>
                <option
                  v-for="ct in phase1ChartTypes"
                  :key="ct"
                  :value="ct"
                  :disabled="isDuplicateChartTypeOption(ct, index)"
                >
                  {{ chartTypeLabels[ct] }}
                </option>
              </select>
              <select v-model="item.suitability">
                <option v-for="option in suitabilityOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
              <input v-model="item.notes" type="text" placeholder="Optional notes" />
              <button type="button" class="btn btn-danger btn-small" @click="removeApplicabilityRow(index)">
                Remove
              </button>
            </div>
            <button type="button" class="btn btn-secondary btn-small" @click="addApplicabilityRow">
              Add applicability
            </button>
            <p v-if="form.chart_applicability.length === 0" class="helper-text">
              Saving now will persist an explicit empty applicability array.
            </p>
            <p v-if="applicabilityError" class="error-text">{{ applicabilityError }}</p>
          </div>
        </div>

        <div class="form-group">
          <label for="journal_style">Journal Style</label>
          <div class="checkbox-group">
            <label v-for="js in availableJournalStyles" :key="js">
              <input type="checkbox" :value="js" v-model="form.journal_style" />
              {{ js }}
            </label>
          </div>
        </div>

        <div class="form-group">
          <label for="discipline">Discipline</label>
          <input id="discipline" v-model="disciplineInput" type="text" placeholder="biology, medicine, etc. (comma separated)" />
        </div>

        <div class="form-group">
          <label for="use_case">Use Case</label>
          <input id="use_case" v-model="useCaseInput" type="text" placeholder="scatter plots, bar charts, etc. (comma separated)" />
        </div>

        <div class="form-group">
          <label for="avoid_case">Avoid For</label>
          <input id="avoid_case" v-model="avoidCaseInput" type="text" placeholder="too_many_groups, small_print, etc. (comma separated)" />
        </div>

        <div class="form-group">
          <label for="tags">Tags</label>
          <input id="tags" v-model="tagsInput" type="text" placeholder="high-contrast, colorblind-safe, etc. (comma separated)" />
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="source_type">Source Type</label>
            <select id="source_type" v-model="form.source_type">
              <option value="">Select...</option>
              <option value="manual">Manual</option>
              <option value="figure_extracted">Figure Extracted</option>
              <option value="curated">Curated</option>
            </select>
          </div>

          <div class="form-group">
            <label for="status">Status</label>
            <select id="status" v-model="form.status">
              <option value="draft">Draft</option>
              <option value="candidate">Candidate</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </div>

        <div class="form-group">
          <label for="source_image">Source Image URL</label>
          <input id="source_image" v-model="form.source_image" type="text" placeholder="https://..." />
        </div>

        <div class="form-group">
          <label for="source_note">Source Note</label>
          <textarea id="source_note" v-model="form.source_note" rows="3" placeholder="Notes about the source..."></textarea>
        </div>

        <div class="form-group">
          <label for="version">Version</label>
          <input id="version" v-model="form.version" type="text" placeholder="e.g., 1.0.0" />
        </div>

        <div class="form-group">
          <h3>Accessibility</h3>
          <div class="checkbox-group horizontal">
            <label>
              <input type="checkbox" v-model="form.accessibility!.colorblind_safe" />
              Colorblind Safe
            </label>
            <label>
              <input type="checkbox" v-model="form.accessibility!.print_friendly" />
              Print Friendly
            </label>
            <label>
              <input type="checkbox" v-model="form.accessibility!.dark_background" />
              Dark Background
            </label>
          </div>
        </div>

        <BarErrorPreviewEditor
          v-if="isEditing"
          :palette="canonicalPaletteForPreview"
          :preview-cases="previewCases"
          :request-in-progress="previewRequestInProgress"
          :backend-issues="previewBackendIssues"
          @save-draft="handlePreviewDraftSave"
          @publish="handlePreviewPublish"
          @replace-published="requestPreviewReplacement"
          @set-primary="handlePreviewSetPrimary"
          @archive="handlePreviewArchive"
        />
        <p v-if="previewWorkflowMessage" class="helper-text">{{ previewWorkflowMessage }}</p>

        <div class="form-actions">
          <button class="btn btn-primary" @click="savePalette" :disabled="saving || !isValid">
            {{ saving ? 'Saving...' : 'Save Palette' }}
          </button>
          <button class="btn btn-secondary" @click="saveAsDraft" :disabled="saving">
            Save as Draft
          </button>
          <button class="btn btn-info" @click="saveAsCandidate" :disabled="saving || !isValid">
            Save as Candidate
          </button>
          <button 
            v-if="isEditing" 
            class="btn btn-success" 
            @click="handlePublish" 
            :disabled="saving || form.status === 'published'"
          >
            Publish
          </button>
          <button 
            v-if="isEditing && form.status === 'published'" 
            class="btn btn-warning" 
            @click="handleUnpublish" 
            :disabled="saving"
          >
            Unpublish
          </button>
        </div>
      </div>

      <!-- Preview Section -->
      <div class="preview-section">
        <div class="preview-card">
          <h3>Palette Preview</h3>
          <div class="palette-preview" :style="{ background: previewGradient }">
            <div class="preview-colors">
              <div
                v-for="(color, index) in parsedColors"
                :key="index"
                class="preview-color"
                :style="{ background: color.hex }"
              ></div>
            </div>
          </div>

          <div v-if="parsedColors.length > 0" class="color-details">
            <h4>Colors ({{ parsedColors.length }})</h4>
            <div class="color-list">
              <div v-for="(color, index) in parsedColors" :key="index" class="color-item">
                <span class="color-swatch" :style="{ background: color.hex }"></span>
                <span class="color-hex">{{ color.hex }}</span>
                <span class="color-rgb">rgb({{ color.rgb.join(', ') }})</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <ConfirmDialog
      v-if="replacementConfirmDraft"
      title="Archive Published Preview"
      :message="replacementConfirmMessage"
      confirm-text="Archive and create draft"
      @confirm="confirmPreviewReplacement"
      @cancel="cancelPreviewReplacement"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { 
  getPalette, 
  createPalette, 
  updatePalette, 
  publishPalette,
  unpublishPalette,
  parseColorsInput, 
  preservePaletteColorIds,
  isValidHex,
  generateSlug,
  CreatePaletteRequest,
  PaletteColor
} from '@/api/admin'
import type {
  CanonicalPalette,
  ChartSuitability,
  ChartType,
  ChartTypeApplicability,
  PalettePreviewCase,
  ValidationIssue
} from '@/types/palette'
import { PHASE_1_CHART_TYPES, normalizeLegacyChartTypesToApplicability } from '@/lib/palette/applicability'
import BarErrorPreviewEditor from '@/components/admin/previews/BarErrorPreviewEditor.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import {
  type EditableBarErrorDraft
} from '@/lib/chart-types/bar-error/admin'
import {
  publishBarErrorSavedDraft,
  replacePublishedBarErrorWithDraft,
  saveBarErrorDraftRevision
} from '@/lib/chart-types/bar-error/lifecycle'
import {
  archiveAdminPreviewCase,
  createAdminPreviewCase,
  listAdminPreviewCases,
  publishAdminPreviewCase,
  setPrimaryAdminPreviewCase,
  updateAdminPreviewCase,
  type AdminPreviewMutationResult
} from '@/lib/api/adminPreviewCases'

const router = useRouter()
const route = useRoute()

const isEditing = computed(() => !!route.params.id)
const paletteId = computed(() => route.params.id as string)

const saving = ref(false)
const colorsError = ref('')
const previewCases = ref<PalettePreviewCase[]>([])
const previewRequestInProgress = ref(false)
const previewBackendIssues = ref<ValidationIssue[]>([])
const previewWorkflowMessage = ref('')
const replacementConfirmDraft = ref<EditableBarErrorDraft | null>(null)
const replacementConfirmPreviewCaseId = ref<string | null>(null)

const availableChartTypes = [
  'line', 'bar', 'scatter', 'boxplot', 'violin', 
  'heatmap', 'area', 'stacked_bar', 'survival_curve', 'volcano_plot'
]

const phase1ChartTypes = PHASE_1_CHART_TYPES
const chartTypeLabels: Record<ChartType, string> = {
  bar_error: 'Bar with error bars',
  boxplot_jitter: 'Boxplot with jitter',
  line_multiseries: 'Multi-series line',
  heatmap_annotated: 'Annotated heatmap',
  scatter_grouped: 'Grouped scatter',
  violin_distribution: 'Violin distribution'
}
const suitabilityOptions: Array<{ value: ChartSuitability; label: string }> = [
  { value: 'best_fit', label: 'Best fit' },
  { value: 'recommended', label: 'Recommended' },
  { value: 'compatible', label: 'Compatible' },
  { value: 'limited', label: 'Limited' }
]

const availableJournalStyles = [
  'nature', 'science', 'cell', 'nejm', 'lancet', 'general'
]

const form = reactive({
  name: '',
  slug: '',
  colors: [] as PaletteColor[],
  color_count: 0,
  type: '',
  chart_types: [] as string[],
  chart_applicability: [] as ChartTypeApplicability[],
  journal_style: [] as string[],
  discipline: [] as string[],
  use_case: [] as string[],
  avoid_case: [] as string[],
  tags: [] as string[],
  accessibility: {
    colorblind_safe: false,
    print_friendly: false,
    dark_background: false
  },
  source_type: '',
  source_image: '',
  source_note: '',
  version: '',
  status: 'draft'
})

const colorsInput = ref('')
const loadedColors = ref<PaletteColor[]>([])
const loadedPaletteType = ref('')
const chartApplicabilityMode = ref<'legacy' | 'authored'>('legacy')
const clearApplicabilityOnSave = ref(false)
const disciplineInput = ref('')
const useCaseInput = ref('')
const avoidCaseInput = ref('')
const tagsInput = ref('')

const parsedColors = computed(() => {
  if (!colorsInput.value.trim()) return []
  try {
    return preservePaletteColorIds(loadedColors.value, parseColorsInput(colorsInput.value))
  } catch {
    return []
  }
})

const previewGradient = computed(() => {
  if (parsedColors.value.length === 0) return '#e5e7eb'
  const stops = parsedColors.value.map((c, i) => 
    `${c.hex} ${(i / Math.max(parsedColors.value.length - 1, 1)) * 100}%`
  ).join(', ')
  return `linear-gradient(90deg, ${stops})`
})

const isValid = computed(() => {
  return form.name.trim() !== '' &&
    form.type !== '' &&
    parsedColors.value.length > 0 &&
    parsedColors.value.every(c => isValidHex(c.hex)) &&
    !applicabilityError.value
})

const applicabilityError = computed(() => {
  if (chartApplicabilityMode.value !== 'authored') return ''

  const seen = new Set<string>()
  let bestFitCount = 0
  for (const item of form.chart_applicability) {
    if (!item.chart_type) return 'Every applicability row needs a chart type.'
    if (seen.has(item.chart_type)) return 'Each chart type can appear only once.'
    seen.add(item.chart_type)
    if (item.suitability === 'best_fit') {
      bestFitCount += 1
    }
  }
  return bestFitCount > 1 ? 'Only one chart type can be best fit.' : ''
})

const paletteTypeOptions = computed(() => {
  const options = [
    { value: 'categorical', label: 'Categorical' },
    { value: 'sequential', label: 'Sequential' },
    { value: 'diverging', label: 'Diverging' },
    { value: 'mixed', label: 'Mixed' },
  ]

  if (isEditing.value && ['qualitative', 'heatmap'].includes(loadedPaletteType.value)) {
    options.push({
      value: loadedPaletteType.value,
      label: `${loadedPaletteType.value} (legacy, preserve current)`,
    })
  }

  return options
})

const canonicalPaletteForPreview = computed<CanonicalPalette>(() => ({
  id: paletteId.value,
  slug: form.slug || generateSlug(form.name),
  name: form.name || 'Palette',
  status: form.status as 'draft' | 'candidate' | 'published' | 'archived',
  colors: form.colors
    .filter((color): color is PaletteColor & { id: string } => typeof color.id === 'string' && color.id.trim() !== '')
    .map((color, index) => ({
      id: color.id,
      hex: color.hex,
      rgb: color.rgb,
      label: color.label,
      order: color.order ?? index
    })),
  color_count: form.colors.length,
  type: (form.type || 'categorical') as 'categorical' | 'sequential' | 'diverging' | 'mixed' | 'qualitative' | 'heatmap',
  chart_types: form.chart_types,
  chart_applicability: chartApplicabilityMode.value === 'authored'
    ? form.chart_applicability.map((item) => ({ ...item }))
    : undefined,
  journal_style: [...form.journal_style],
  disciplines: parseCommaSeparated(disciplineInput.value),
  use_cases: parseCommaSeparated(useCaseInput.value),
  avoid_cases: parseCommaSeparated(avoidCaseInput.value),
  tags: parseCommaSeparated(tagsInput.value),
  accessibility: { ...form.accessibility },
  source_type: toCanonicalSourceType(form.source_type),
  source_image: form.source_image || undefined,
  source_note: form.source_note || undefined,
  version: form.version || undefined,
  created_at: '',
  updated_at: '',
  primary_preview_case: null,
  preview_cases: []
}))

const replacementConfirmPreviewCase = computed(() =>
  replacementConfirmPreviewCaseId.value
    ? previewCases.value.find((previewCase) => previewCase.id === replacementConfirmPreviewCaseId.value) ?? null
    : null
)

const replacementConfirmMessage = computed(() => {
  const primaryWarning = replacementConfirmPreviewCase.value?.is_primary
    ? ' This preview is currently primary, so the public chart preview may temporarily fall back until the replacement draft is published and set primary.'
    : ''
  return `Archive the published bar error preview and create a new draft from your current local edits?${primaryWarning}`
})

watch(parsedColors, (newColors) => {
  form.colors = newColors
  form.color_count = newColors.length
  colorsError.value = ''
  
  const invalidColors = newColors.filter(c => !isValidHex(c.hex))
  if (invalidColors.length > 0) {
    colorsError.value = `Invalid HEX: ${invalidColors.map(c => c.hex).join(', ')}`
  }
}, { deep: true })

watch(() => form.chart_applicability, (items) => {
  if (chartApplicabilityMode.value === 'authored') {
    form.chart_types = items.map((item) => item.chart_type).filter(Boolean)
  }
}, { deep: true })

function generateSlugFromName() {
  if (!isEditing.value && !form.slug) {
    form.slug = generateSlug(form.name)
  }
}

function updateColorsFromInput() {
  // Watch handles this
}

async function loadPalette() {
  if (!paletteId.value) return
  
  try {
    const palette = await getPalette(paletteId.value)
    form.name = palette.name
    form.slug = palette.slug
    form.type = palette.type
    loadedPaletteType.value = palette.type
    form.chart_types = palette.chart_types || []
    if (palette.chart_applicability !== undefined && palette.chart_applicability !== null) {
      chartApplicabilityMode.value = 'authored'
      clearApplicabilityOnSave.value = false
      form.chart_applicability = palette.chart_applicability.map(toEditableApplicability)
      form.chart_types = form.chart_applicability.map((item) => item.chart_type)
    } else {
      chartApplicabilityMode.value = 'legacy'
      clearApplicabilityOnSave.value = false
      form.chart_applicability = []
    }
    form.journal_style = palette.journal_style || []
    form.discipline = palette.discipline || []
    form.use_case = palette.use_case || []
    form.avoid_case = palette.avoid_case || []
    form.tags = palette.tags || []
    form.accessibility = palette.accessibility || {
      colorblind_safe: false,
      print_friendly: false,
      dark_background: false
    }
    form.source_type = palette.source_type || ''
    form.source_image = palette.source_image || ''
    form.source_note = palette.source_note || ''
    form.version = palette.version || ''
    form.status = palette.status || 'draft'
    form.color_count = palette.color_count
    loadedColors.value = palette.colors || []

    // Parse colors back to input format
    if (palette.colors && palette.colors.length > 0) {
      colorsInput.value = palette.colors.map(c => c.hex).join('\n')
    }

    // Parse comma-separated fields
    disciplineInput.value = palette.discipline?.join(', ') || ''
    useCaseInput.value = palette.use_case?.join(', ') || ''
    avoidCaseInput.value = palette.avoid_case?.join(', ') || ''
    tagsInput.value = palette.tags?.join(', ') || ''
    await loadPreviewCases()
  } catch (e: any) {
    alert('Failed to load palette: ' + e.message)
    router.push('/admin/palettes')
  }
}

function parseCommaSeparated(value: string): string[] {
  return value.split(',').map(s => s.trim()).filter(s => s.length > 0)
}

function toCanonicalSourceType(value: string): CanonicalPalette['source_type'] | undefined {
  return value === 'manual' || value === 'figure_extracted' || value === 'curated'
    ? value
    : undefined
}

function toEditableApplicability(item: ChartTypeApplicability): ChartTypeApplicability {
  return {
    chart_type: item.chart_type,
    suitability: item.suitability,
    notes: item.notes || '',
    source: 'curated'
  }
}

function migrateToChartApplicability() {
  form.chart_applicability = normalizeLegacyChartTypesToApplicability(form.chart_types)
    .map((item) => ({ ...item, source: 'curated' }))
  chartApplicabilityMode.value = 'authored'
  clearApplicabilityOnSave.value = false
  form.chart_types = form.chart_applicability.map((item) => item.chart_type)
}

function useLegacyChartTypes() {
  chartApplicabilityMode.value = 'legacy'
  clearApplicabilityOnSave.value = true
  form.chart_types = form.chart_applicability.map((item) => item.chart_type)
}

function addApplicabilityRow() {
  const nextChartType = phase1ChartTypes.find((chartType) => (
    !form.chart_applicability.some((item) => item.chart_type === chartType)
  ))
  if (!nextChartType) return

  form.chart_applicability.push({
    chart_type: nextChartType,
    suitability: form.chart_applicability.some((item) => item.suitability === 'best_fit')
      ? 'compatible'
      : 'best_fit',
    notes: '',
    source: 'curated'
  })
  form.chart_types = form.chart_applicability.map((item) => item.chart_type)
}

function removeApplicabilityRow(index: number) {
  form.chart_applicability.splice(index, 1)
  form.chart_types = form.chart_applicability.map((item) => item.chart_type)
}

function isDuplicateChartTypeOption(chartType: ChartType, index: number): boolean {
  return form.chart_applicability.some((item, itemIndex) => (
    itemIndex !== index && item.chart_type === chartType
  ))
}

function buildPalettePayload(): CreatePaletteRequest {
  const data: CreatePaletteRequest = {
    name: form.name,
    slug: form.slug || generateSlug(form.name),
    colors: form.colors,
    color_count: form.color_count,
    type: form.type,
    chart_types: form.chart_types,
    journal_style: form.journal_style,
    discipline: parseCommaSeparated(disciplineInput.value),
    use_case: parseCommaSeparated(useCaseInput.value),
    avoid_case: parseCommaSeparated(avoidCaseInput.value),
    tags: parseCommaSeparated(tagsInput.value),
    accessibility: form.accessibility,
    source_type: form.source_type || undefined,
    source_image: form.source_image || undefined,
    source_note: form.source_note || undefined,
    version: form.version || undefined,
    status: form.status
  }

  if (chartApplicabilityMode.value === 'authored') {
    data.chart_applicability = form.chart_applicability.map((item) => ({
      chart_type: item.chart_type,
      suitability: item.suitability,
      notes: item.notes?.trim() || undefined,
      source: 'curated'
    }))
    data.chart_types = data.chart_applicability.map((item) => item.chart_type)
  } else if (clearApplicabilityOnSave.value) {
    data.chart_applicability = null
  }

  return data
}

async function savePalette() {
  if (!isValid.value) {
    alert('Please fill in all required fields')
    return
  }

  saving.value = true
  try {
    const data = buildPalettePayload()

    if (isEditing.value) {
      await updatePalette(paletteId.value, data)
    } else {
      await createPalette(data)
    }

    router.push('/admin/palettes')
  } catch (e: any) {
    alert(e.message || 'Failed to save palette')
  } finally {
    saving.value = false
  }
}

async function saveAsDraft() {
  form.status = 'draft'
  await savePalette()
}

async function saveAsCandidate() {
  form.status = 'candidate'
  await savePalette()
}

async function handlePublish() {
  if (!isEditing.value) return
  saving.value = true
  try {
    // First save current form
    const data = buildPalettePayload()
    await updatePalette(paletteId.value, data)
    // Then publish
    await publishPalette(paletteId.value)
    form.status = 'published'
    alert('Palette published successfully!')
  } catch (e: any) {
    alert(e.message || 'Failed to publish palette')
  } finally {
    saving.value = false
  }
}

async function handleUnpublish() {
  if (!isEditing.value) return
  saving.value = true
  try {
    await unpublishPalette(paletteId.value)
    form.status = 'draft'
    alert('Palette unpublished successfully!')
  } catch (e: any) {
    alert(e.message || 'Failed to unpublish palette')
  } finally {
    saving.value = false
  }
}

async function loadPreviewCases(clearMessage = true) {
  if (!isEditing.value) return

  const result = await listAdminPreviewCases(paletteId.value, { includeArchived: true })
  if (result.ok) {
    previewCases.value = result.value.items
    if (clearMessage) {
      previewWorkflowMessage.value = ''
    }
    return
  }

  previewCases.value = []
  previewWorkflowMessage.value = result.message
}

async function handlePreviewDraftSave(draft: EditableBarErrorDraft) {
  await runPreviewMutation(
    () => saveBarErrorDraftRevision(paletteId.value, previewCases.value, draft, {
      create: createAdminPreviewCase,
      update: updateAdminPreviewCase
    }),
    'Draft saved.'
  )
}

async function handlePreviewPublish(draft: EditableBarErrorDraft) {
  await runPreviewMutation(
    () => publishBarErrorSavedDraft(previewCases.value, draft, {
      update: updateAdminPreviewCase,
      publish: publishAdminPreviewCase
    }),
    'Preview published.'
  )
}

function requestPreviewReplacement(previewCaseId: string, draft: EditableBarErrorDraft) {
  replacementConfirmPreviewCaseId.value = previewCaseId
  replacementConfirmDraft.value = draft
}

async function confirmPreviewReplacement() {
  if (!replacementConfirmPreviewCaseId.value || !replacementConfirmDraft.value) return

  const previewCaseId = replacementConfirmPreviewCaseId.value
  const draft = replacementConfirmDraft.value
  replacementConfirmPreviewCaseId.value = null
  replacementConfirmDraft.value = null
  await runPreviewReplacement(previewCaseId, draft)
}

function cancelPreviewReplacement() {
  replacementConfirmPreviewCaseId.value = null
  replacementConfirmDraft.value = null
}

async function runPreviewReplacement(previewCaseId: string, draft: EditableBarErrorDraft) {
  previewRequestInProgress.value = true
  previewBackendIssues.value = []
  previewWorkflowMessage.value = ''

  try {
    const result = await replacePublishedBarErrorWithDraft(
      paletteId.value,
      previewCaseId,
      draft,
      {
        archive: archiveAdminPreviewCase,
        create: createAdminPreviewCase
      }
    )

    if (!result.ok) {
      if (result.stage === 'archive_failed') {
        previewBackendIssues.value = result.archiveResult.ok ? [] : result.archiveResult.issues ?? []
        previewWorkflowMessage.value = result.archiveResult.ok ? '' : result.archiveResult.message
        return
      }

      previewBackendIssues.value = result.createResult.ok ? [] : result.createResult.issues ?? []
      previewWorkflowMessage.value = result.createResult.ok ? '' : result.createResult.message
      await loadPreviewCases(false)
      return
    }

    previewWorkflowMessage.value = 'Published preview archived and replacement draft created.'
    await loadPreviewCases(false)
  } finally {
    previewRequestInProgress.value = false
  }
}

async function handlePreviewSetPrimary(previewCaseId: string) {
  await runPreviewMutation(
    () => setPrimaryAdminPreviewCase(previewCaseId),
    'Preview set as primary.'
  )
}

async function handlePreviewArchive(previewCaseId: string) {
  await runPreviewMutation(
    () => archiveAdminPreviewCase(previewCaseId),
    'Preview archived.'
  )
}

async function runPreviewMutation(
  mutate: () => Promise<AdminPreviewMutationResult<PalettePreviewCase>>,
  successMessage: string
) {
  previewRequestInProgress.value = true
  previewBackendIssues.value = []
  previewWorkflowMessage.value = ''

  try {
    const result = await mutate()
    if (!result.ok) {
      previewBackendIssues.value = result.issues ?? []
      previewWorkflowMessage.value = result.message
      return
    }

    previewWorkflowMessage.value = successMessage
    await loadPreviewCases(false)
  } finally {
    previewRequestInProgress.value = false
  }
}

onMounted(() => {
  if (isEditing.value) {
    loadPalette()
  }
})
</script>

<style scoped>
.admin-palette-form {
  padding: 2rem;
  max-width: 1400px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 2rem;
}

.header-left h1 {
  font-size: 1.5rem;
  font-weight: 600;
  color: #1a1a1a;
  margin-bottom: 0.25rem;
}

.subtitle {
  color: #666;
  font-size: 0.875rem;
}

.form-layout {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 2rem;
}

.form-section {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 1.5rem;
}

.preview-section {
  position: sticky;
  top: 2rem;
}

.preview-card {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 1.5rem;
}

.preview-card h3 {
  font-size: 0.875rem;
  font-weight: 600;
  margin-bottom: 1rem;
}

.palette-preview {
  height: 80px;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  margin-bottom: 1.5rem;
  overflow: hidden;
}

.preview-colors {
  display: flex;
  height: 100%;
}

.preview-color {
  flex: 1;
}

.color-details h4 {
  font-size: 0.75rem;
  font-weight: 600;
  color: #6b7280;
  margin-bottom: 0.75rem;
}

.color-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.color-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.8125rem;
}

.color-swatch {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  border: 1px solid #e5e7eb;
}

.color-hex {
  font-family: monospace;
  font-weight: 500;
}

.color-rgb {
  color: #6b7280;
  font-size: 0.75rem;
}

.form-group {
  margin-bottom: 1.25rem;
}

.form-group h3 {
  font-size: 0.875rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.form-group label {
  display: block;
  font-size: 0.875rem;
  font-weight: 500;
  color: #374151;
  margin-bottom: 0.375rem;
}

.form-group input[type="text"],
.form-group input[type="number"],
.form-group select,
.form-group textarea {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 0.875rem;
}

.form-group input:focus,
.form-group select:focus,
.form-group textarea:focus {
  outline: none;
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

.checkbox-group {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
}

.checkbox-group.horizontal {
  gap: 1rem;
}

.checkbox-group label {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.875rem;
  cursor: pointer;
}

.checkbox-group input[type="checkbox"] {
  width: 16px;
  height: 16px;
}

.error-text {
  color: #dc2626;
  font-size: 0.75rem;
  margin-top: 0.25rem;
}

.helper-text {
  color: #6b7280;
  font-size: 0.75rem;
  margin: 0.25rem 0 0.5rem;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 0.75rem;
}

.section-actions {
  flex: 0 0 auto;
}

.applicability-rows {
  display: grid;
  gap: 0.75rem;
}

.applicability-row {
  display: grid;
  grid-template-columns: minmax(160px, 1fr) minmax(130px, 0.8fr) minmax(180px, 1.2fr) auto;
  gap: 0.5rem;
  align-items: start;
}

.form-actions {
  display: flex;
  gap: 0.75rem;
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid #e5e7eb;
}

.btn {
  padding: 0.625rem 1rem;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  border: none;
}

.btn-small {
  padding: 0.45rem 0.65rem;
  font-size: 0.75rem;
}

.btn-primary {
  background: #2563eb;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #1d4ed8;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background: #f3f4f6;
  color: #374151;
}

.btn-secondary:hover {
  background: #e5e7eb;
}

.btn-info {
  background: #3b82f6;
  color: white;
}

.btn-info:hover:not(:disabled) {
  background: #2563eb;
}

.btn-success {
  background: #10b981;
  color: white;
}

.btn-success:hover:not(:disabled) {
  background: #059669;
}

.btn-warning {
  background: #f59e0b;
  color: white;
}

.btn-warning:hover:not(:disabled) {
  background: #d97706;
}

.btn-danger {
  background: #fee2e2;
  color: #991b1b;
}

.btn-danger:hover {
  background: #fecaca;
}

@media (max-width: 900px) {
  .form-layout {
    grid-template-columns: 1fr;
  }

  .preview-section {
    position: static;
  }
}

@media (max-width: 720px) {
  .section-header,
  .applicability-row,
  .form-row,
  .form-actions {
    grid-template-columns: 1fr;
  }

  .section-header,
  .form-actions {
    flex-direction: column;
  }
}
</style>
