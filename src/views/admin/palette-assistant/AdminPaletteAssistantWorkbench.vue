<template>
  <div class="workbench">
    <header>
      <p class="eyebrow">Admin · Palette Assistant</p>
      <h1>Draft Workbench</h1>
      <p>Analyze suggestions are non-authoritative. Inspect and edit the current Draft before confirming it.</p>
    </header>

    <section class="panel" aria-labelledby="source-heading">
      <h2 id="source-heading">1. Source image</h2>
      <input ref="fileInput" class="visually-hidden" type="file" accept="image/png,image/jpeg" :disabled="creating" @change="onFileChange" />
      <div
        :class="['upload-zone', { dragging: isDragging, locked: creating }]"
        role="button"
        tabindex="0"
        :aria-disabled="creating"
        @click="openFilePicker"
        @keydown.enter.prevent="openFilePicker"
        @keydown.space.prevent="openFilePicker"
        @dragenter.prevent="onDragEnter"
        @dragover.prevent="onDragOver"
        @dragleave.prevent="onDragLeave"
        @drop.prevent="onDrop"
      >
        <strong>{{ creating ? 'Image upload locked while Candidate creation is in progress' : 'Drop one PNG or JPEG here, or click to choose' }}</strong>
        <span>Encoded image limit: 6 MiB</span>
      </div>
      <p class="hint">The image stays browser-local except for the existing Admin Analyze request.</p>
      <p v-if="fileError" class="error" role="alert">{{ fileError }}</p>
      <div v-if="state.image" class="source-preview">
        <div
          ref="imageStage"
          :class="['image-stage', { picking: pickerActive }]"
          @mousemove="onImagePointerMove"
          @mouseleave="hidePickerPreview"
          @click="pickImageColor"
        >
          <img ref="sourceImage" :src="state.image.previewUrl" alt="Selected source image preview" @load="onSourceImageLoad" @error="onSourceImageError" />
          <div v-if="pickerActive && hoverSample" class="picker-readout" :style="pickerReadoutStyle">
            <canvas ref="magnifierCanvas" class="magnifier" aria-hidden="true"></canvas>
            <span><i :style="{ backgroundColor: hoverSample.hex }"></i>{{ hoverSample.hex }}</span>
          </div>
        </div>
        <canvas ref="sourceCanvas" class="visually-hidden" aria-hidden="true"></canvas>
        <div class="source-details">
          <strong>{{ state.image.file.name }}</strong>
          <p>{{ imageDimensionsLabel }} · {{ imageFormatLabel }} · {{ formatBytes(state.image.file.size) }}</p>
          <div class="actions">
            <button type="button" :class="pickerActive ? 'danger' : 'secondary'" :disabled="creating || !imageReady" @click="togglePicker">{{ pickerActive ? 'Exit color picker' : 'Pick color from image / 从图片吸色' }}</button>
            <button type="button" class="secondary" :disabled="creating" @click="removeImage">Remove image</button>
          </div>
          <p v-if="pickerActive" class="hint">Move over the image to inspect a 5×5 median sample, then click to choose. Press Escape to exit.</p>
          <p v-if="pickerMessage" class="notice" role="status">{{ pickerMessage }}</p>
          <div v-if="pendingPickedHex" class="picked-confirmation">
            <span><i :style="{ backgroundColor: pendingPickedHex }"></i><strong>{{ pendingPickedHex }}</strong></span>
            <button type="button" @click="addPickedColor">Add as data color</button>
            <button v-if="selectedColorId" type="button" class="secondary" @click="replaceSelectedColor">Replace selected color</button>
            <button type="button" class="secondary" @click="cancelPickedColor">Cancel</button>
          </div>
        </div>
      </div>
      <div class="actions">
        <button type="button" :disabled="creating || !state.image || !imageReady || state.status === 'analyzing'" @click="runAnalyze">
          {{ state.status === 'analyzing' ? 'Analyzing…' : state.audit ? 'Analyze again' : 'Analyze image' }}
        </button>
        <button v-if="state.status === 'analyzing'" type="button" class="secondary" @click="workbench.cancel()">Cancel</button>
      </div>
      <p v-if="state.status === 'cancelled'" class="notice" role="status">Analyze was cancelled. You can retry.</p>
      <div v-if="state.error" class="error-card" role="alert">
        <strong>{{ state.error.code }}</strong>
        <p>{{ state.error.message }}</p>
        <ul v-if="state.error.issues?.length"><li v-for="item in state.error.issues" :key="`${item.path}:${item.code}`"><code>{{ item.path }}</code>: {{ item.message }}</li></ul>
        <button v-if="state.error.retryable" type="button" @click="runAnalyze">Retry</button>
      </div>
    </section>

    <template v-if="state.audit && state.draft">
      <section class="panel" aria-labelledby="diagnostics-heading">
        <h2 id="diagnostics-heading">2. Suggestions and diagnostics</h2>
        <p class="hint">Immutable evidence from analysis {{ state.audit.analysisId }} · {{ state.audit.algorithmVersion }}</p>
        <div class="facts">
          <span>{{ state.audit.image.format.toUpperCase() }}</span><span>{{ state.audit.image.width }} × {{ state.audit.image.height }}</span><span>{{ state.audit.image.encoded_bytes }} bytes</span>
        </div>
        <h3>Suggested data colors <small class="coverage-label">· image coverage / 整图像素占比</small></h3>
        <div class="swatches">
          <span v-for="color in state.audit.dataSuggestions" :key="color.id" class="suggestion" :title="`${color.producer} / ${color.algorithm_version} / ${color.reason_codes.join(', ')}`"><i :style="{ backgroundColor: color.hex }"></i>{{ color.hex }} · {{ percent(color.fraction) }}</span>
        </div>
        <template v-if="state.audit.omittedStructuralColors.length">
          <h3>Omitted structural colors <small class="coverage-label">· image coverage / 整图像素占比</small></h3>
          <p class="hint">Visible for inspection; these do not count toward retained colors or categorical eligibility.</p>
          <div class="swatches">
            <span v-for="color in state.audit.omittedStructuralColors" :key="color.id" class="suggestion" :title="`${color.producer} / ${color.algorithm_version} / ${color.reason_codes.join(', ')}`"><i :style="{ backgroundColor: color.hex }"></i>{{ color.hex }} · {{ percent(color.fraction) }}</span>
          </div>
        </template>
        <h3>Warnings</h3>
        <AnalyzeWarningList v-if="state.audit.warnings.length" :warnings="state.audit.warnings" />
        <p v-else class="empty">No warnings.</p>
        <template v-if="state.audit.provenance.length">
          <h3>Suggestion provenance</h3>
          <ul><li v-for="(item, index) in state.audit.provenance" :key="`${item.path}:${index}`"><code>{{ item.path }}</code> → <code>{{ item.suggested_value === undefined ? 'Not provided' : typeof item.suggested_value === 'string' ? item.suggested_value : JSON.stringify(item.suggested_value) }}</code> · {{ item.producer }} / {{ item.algorithm_version }} · {{ item.reason_codes.join(', ') }}</li></ul>
        </template>
      </section>

      <section class="panel" aria-labelledby="draft-heading">
        <div class="section-title"><h2 id="draft-heading">3. Editable Draft</h2><span>Revision {{ state.draft.revision }}</span></div>
        <div class="grid">
          <label>Palette name<input :value="state.draft.name" :disabled="creating" @input="setName" /></label>
          <label>Palette type<select :value="state.draft.type" :disabled="creating" @change="setType"><option value="">Choose…</option><option v-for="type in PALETTE_TYPES" :key="type" :value="type">{{ type }}</option></select></label>
        </div>
        <h3>Retained colors ({{ state.draft.colors.length }})</h3>
        <div v-for="(color, index) in state.draft.colors" :key="color.id" class="color-row">
          <i :style="{ backgroundColor: validHex(color.hex) ? color.hex : 'transparent' }"></i>
          <input :ref="(element) => setColorInputRef(color.id, element)" :value="color.hex" aria-label="Color HEX" :disabled="creating" @input="setHex(index, $event)" />
          <select :value="color.classification" aria-label="Color classification" :disabled="creating" @change="setClassification(index, $event)"><option value="data">Data color</option><option value="structural">Structural (not retainable)</option></select>
          <span class="state-badge">{{ color.source }} · {{ color.state }}</span>
          <span class="identity">{{ color.id }}</span>
          <button type="button" :class="selectedColorId === color.id ? '' : 'secondary'" :disabled="creating" @click="selectColor(color.id)">{{ selectedColorId === color.id ? 'Selected' : 'Select' }}</button>
          <button v-if="color.source === 'assistant' && color.state === 'unconfirmed'" type="button" class="secondary" :disabled="creating" @click="acceptColor(index)">Accept suggestion</button>
          <button type="button" class="secondary" :disabled="creating || index === 0" @click="moveColor(index, -1)">↑</button>
          <button type="button" class="secondary" :disabled="creating || index === state.draft.colors.length - 1" @click="moveColor(index, 1)">↓</button>
          <button type="button" class="danger" :disabled="creating" @click="removeColor(index)">Remove</button>
        </div>
        <button type="button" class="secondary" :disabled="creating" @click="addColor">Add data color</button>

        <h3>Chart applicability</h3>
        <div v-for="(item, index) in state.draft.chart_applicability" :key="`${index}:${item.chart_type}`" class="application-row">
          <select :value="item.chart_type" :disabled="creating" @change="setChart(index, 'chart_type', $event)"><option value="">Chart type…</option><option v-for="chart in PHASE_1_CHART_TYPES" :key="chart" :value="chart">{{ chart }}</option></select>
          <select :value="item.suitability" :disabled="creating" @change="setChart(index, 'suitability', $event)"><option v-for="suitability in CHART_SUITABILITIES" :key="suitability" :value="suitability">{{ suitability }}</option></select>
          <input :value="item.notes || ''" placeholder="Optional notes" :disabled="creating" @input="setChart(index, 'notes', $event)" />
          <button type="button" class="danger" :disabled="creating" @click="removeChart(index)">Remove</button>
        </div>
        <button type="button" class="secondary" :disabled="creating" @click="addChart">Add applicability</button>
        <h3>Metadata</h3>
        <div class="grid">
          <label>Disciplines<ControlledVocabularySelect :model-value="state.draft.disciplines" field="disciplines" label="Disciplines" :disabled="creating" @update:model-value="setVocabulary('disciplines', $event)" /></label>
          <label>Use cases<ControlledVocabularySelect :model-value="state.draft.use_cases" field="use_cases" label="Use cases" :disabled="creating" @update:model-value="setVocabulary('use_cases', $event)" /></label>
          <label>Avoid cases<ControlledVocabularySelect :model-value="state.draft.avoid_cases" field="avoid_cases" label="Avoid cases" :disabled="creating" @update:model-value="setVocabulary('avoid_cases', $event)" /></label>
          <label>Tags<ControlledVocabularySelect :model-value="state.draft.tags" field="tags" label="Tags" :disabled="creating" @update:model-value="setVocabulary('tags', $event)" /></label>
          <label>Source note<textarea :value="state.draft.source_note" rows="3" :disabled="creating" placeholder="Colors extracted from a grouped boxplot; structural colors were excluded." @input="setSourceNote"></textarea></label>
          <fieldset :disabled="creating"><legend>Accessibility</legend><label><input type="checkbox" :checked="state.draft.accessibility.colorblind_safe" :disabled="creating" @change="setAccessibility('colorblind_safe', $event)" /> Colorblind safe</label><label><input type="checkbox" :checked="state.draft.accessibility.print_friendly" :disabled="creating" @change="setAccessibility('print_friendly', $event)" /> Print friendly</label><label><input type="checkbox" :checked="state.draft.accessibility.dark_background" :disabled="creating" @change="setAccessibility('dark_background', $event)" /> Dark background</label></fieldset>
        </div>
        <div class="actions"><button type="button" class="secondary" :disabled="creating" @click="resetDraft">Reset to Analyze suggestions</button></div>
      </section>

      <section class="panel" aria-labelledby="preview-heading">
        <h2 id="preview-heading">4. Scientific Preview</h2>
        <template v-if="!currentPreview">
          <p class="empty">No preview added.</p>
          <label>Chart type<select :value="pendingPreviewChart" :disabled="creating" @change="setPendingPreviewChart"><option v-for="chart in PHASE_1_CHART_TYPES" :key="chart" :value="chart">{{ chart }}</option></select></label>
          <button type="button" :disabled="creating" @click="createPreview">Add Preview</button>
        </template>
        <template v-else>
          <div class="section-title"><h3>{{ currentPreview.chart_type }} · {{ currentPreview.template_id }}</h3><button type="button" class="danger" :disabled="creating" @click="removePreview">Remove Preview</button></div>
          <label>Chart type<select :value="currentPreview.chart_type" :disabled="creating" @change="changePreviewChart"><option v-for="chart in PHASE_1_CHART_TYPES" :key="chart" :value="chart">{{ chart }}</option></select></label>
          <div class="grid preview-json-controls">
            <label>Color roles JSON<textarea :value="JSON.stringify(currentPreview.color_roles, null, 2)" rows="10" :disabled="creating" @change="setPreviewJson('color_roles', $event)"></textarea></label>
            <label>Preview config JSON<textarea :value="JSON.stringify(currentPreview.preview_config, null, 2)" rows="10" :disabled="creating" @change="setPreviewJson('preview_config', $event)"></textarea></label>
          </div>
          <p class="hint">Fixed seed: {{ currentPreview.seed_value }}</p>
          <div v-if="previewRender?.state === 'svg'" class="draft-live-preview" v-html="previewRender.markup"></div>
          <div v-else-if="previewRender" class="error-card" role="alert"><strong>Preview {{ previewRender.state }}</strong><p>{{ previewRender.message }}</p><ul v-if="previewRender.issues.length"><li v-for="item in previewRender.issues" :key="`${item.path}:${item.code}`"><code>{{ item.path }}</code>: {{ item.message }}</li></ul></div>
        </template>
        <p v-if="previewActionError" class="error" role="alert">{{ previewActionError }}</p>
      </section>

      <section class="panel" aria-labelledby="status-heading">
        <h2 id="status-heading">5. Current Draft status</h2>
        <div class="draft-strip" aria-label="Current Draft color order"><i v-for="color in state.draft.colors" :key="color.id" :style="{ backgroundColor: validHex(color.hex) ? color.hex : '#ffffff' }"></i></div>
        <ul v-if="issues.length" class="errors"><li v-for="item in issues" :key="`${item.path}:${item.code}`"><code>{{ item.path }}</code>: {{ item.message }}</li></ul>
        <div v-if="state.submission.error" class="error-card" role="alert"><strong>{{ state.submission.error.code }}</strong><p>{{ state.submission.error.message }}</p><ul v-if="state.submission.error.issues?.length"><li v-for="item in state.submission.error.issues" :key="`${item.path}:${item.code}`" :data-field="issueControlPath(item.path)"><code>{{ item.path }}</code>: {{ item.message }}</li></ul></div>
        <p v-else class="valid">Local Draft checks pass.</p>
        <button type="button" :disabled="creating || issues.length > 0 || confirmed" @click="confirmDraft">{{ confirmed ? `Revision ${state.draft.revision} confirmed` : 'Confirm current revision' }}</button>
        <p v-if="confirmed" class="valid" role="status">Confirmation is bound to revision {{ state.confirmedRevision }}. Any Candidate-relevant edit invalidates it.</p>
        <p v-else class="notice" role="status">The current revision is not confirmed.</p>
        <div class="actions"><button type="button" :disabled="!confirmed || issues.length > 0 || state.submission.status === 'validating' || state.submission.status === 'creating'" @click="runValidate">{{ state.submission.status === 'validating' ? 'Validating…' : 'Validate confirmed Draft' }}</button></div>
        <template v-if="state.submission.validation">
          <p class="valid">Validated revision {{ state.submission.validation.validated_revision }}. Receipt expires {{ state.submission.validation.receipt_expires_at }}.</p>
          <h3>Validation warnings</h3><p v-if="!state.submission.validation.warnings.length" class="empty">No warnings.</p>
          <ul v-else class="warnings"><li v-for="finding in state.submission.validation.warnings" :key="finding.id"><strong>{{ finding.code }}</strong>: {{ finding.message }}<label v-if="finding.requires_acknowledgment"><input type="checkbox" :checked="state.submission.acknowledgments.includes(finding.id)" :disabled="creating" @change="acknowledge(finding.id, $event)" /> I acknowledge this warning</label></li></ul>
          <h3>Exact duplicates</h3><p v-if="!state.submission.validation.duplicates.length" class="empty">No exact duplicate Candidates or published palettes.</p><ul v-else class="errors"><li v-for="finding in state.submission.validation.duplicates" :key="finding.id">Exact duplicate: {{ finding.palette_id || 'existing palette' }} (blocking)</li></ul>
          <h3>Similar palettes</h3><p v-if="!state.submission.validation.similarities.length" class="empty">No similar palettes.</p><ul v-else class="warnings"><li v-for="finding in state.submission.validation.similarities" :key="finding.id">{{ finding.palette_id || 'Existing palette' }} · {{ finding.policy }} · distance {{ finding.score }}</li></ul>
          <div class="actions"><button type="button" :disabled="!canCreate || state.submission.status === 'creating'" @click="runCreate">{{ state.submission.status === 'creating' ? 'Creating Candidate…' : state.submission.status === 'create_error' ? 'Retry Candidate creation' : 'Create Candidate' }}</button></div>
          <p class="hint">Creation enters existing Admin Review only. It never publishes automatically.</p>
        </template>
      </section>
    </template>

    <ConfirmDialog
      v-if="showLeaveConfirmation"
      title="Discard Palette Assistant Draft?"
      :message="leaveConfirmationMessage"
      confirm-text="Yes, discard"
      @confirm="confirmLeave"
      @cancel="cancelLeave"
    />
    <ConfirmDialog
      v-if="showImageReplacementConfirmation"
      title="Replace source image?"
      message="Discard the current Palette Assistant analysis and Draft, then use the new image?"
      confirm-text="Yes, replace"
      @confirm="confirmImageReplacement"
      @cancel="cancelImageReplacement"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import {
  addChartApplicability, addDraftPreviewCase, AnalyzeWarningList, CHART_SUITABILITIES, clearDraftPreviewCases, editChartApplicability,
  PALETTE_TYPES, PHASE_1_CHART_TYPES, removeChartApplicability,
  PaletteAssistantWorkbench, confirmCurrentDraft, isCurrentRevisionConfirmed,
  confirmWorkbenchAbandonment, mutateDraft, newAdminColor, addPickedDraftColor, replacePickedDraftColor,
  replaceDraftPreviewChart, resetDraftToAnalyze, validateDraft, mutateDraftPreviewCase,
  canCreateCandidate, createCandidateAndNavigate, issueControlPath, protectWorkbenchBeforeUnload, setWarningAcknowledgment,
  validateAssistantImageSelection
} from './workbench'
import { renderDraftPreview } from './draftPreviewRenderer'
import type { ChartType } from '@/types/palette'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import ControlledVocabularySelect from './ControlledVocabularySelect.vue'
import type { AssistantMetadataField } from './controlledVocabulary'
import { drawMagnifier, mapContainedImagePoint, sampleMedianHex } from './imageColorPicker'

const workbench = reactive(new PaletteAssistantWorkbench())
const router = useRouter()
const state = workbench.state
const fileInput = ref<HTMLInputElement | null>(null)
const fileError = ref('')
const issues = computed(() => state.draft ? validateDraft(state.draft) : [])
const confirmed = computed(() => isCurrentRevisionConfirmed(state))
const pendingPreviewChart = ref<ChartType>('bar_error')
const previewActionError = ref('')
const currentPreview = computed(() => state.draft?.preview_cases[0] ?? null)
const previewRender = computed(() => state.draft && currentPreview.value ? renderDraftPreview(state.draft, currentPreview.value) : null)
const canCreate = computed(() => canCreateCandidate(state))
const creating = computed(() => state.submission.status === 'creating')
const isDragging = ref(false)
let dragDepth = 0
const pendingImage = ref<File | null>(null)
const showImageReplacementConfirmation = ref(false)
const sourceImage = ref<HTMLImageElement | null>(null)
const imageStage = ref<HTMLElement | null>(null)
const sourceCanvas = ref<HTMLCanvasElement | null>(null)
const magnifierCanvas = ref<HTMLCanvasElement | null>(null)
const imageReady = ref(false)
const localImageWidth = ref(0)
const localImageHeight = ref(0)
const pickerActive = ref(false)
const hoverSample = ref<{ hex: string; x: number; y: number; clientX: number; clientY: number } | null>(null)
const pendingPickedHex = ref('')
const pickerMessage = ref('')
const selectedColorId = ref<string | null>(null)
const colorInputRefs = new Map<string, HTMLInputElement>()
const imageDimensionsLabel = computed(() => localImageWidth.value && localImageHeight.value ? `${localImageWidth.value} × ${localImageHeight.value}px` : 'Dimensions pending')
const imageFormatLabel = computed(() => state.image?.file.type === 'image/png' ? 'PNG' : state.image?.file.type === 'image/jpeg' ? 'JPEG' : 'Unknown format')
const pickerReadoutStyle = computed(() => hoverSample.value ? ({ left: `${hoverSample.value.clientX + 18}px`, top: `${hoverSample.value.clientY + 18}px` }) : {})
const showLeaveConfirmation = ref(false)
const leaveConfirmationMessage = ref('Discard the unconfirmed Palette Assistant Draft?')
const pendingLeavePath = ref<string | null>(null)
let allowConfirmedLeave = false

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  handleIncomingFiles(input.files ?? [])
  input.value = ''
}
function openFilePicker() { if (!creating.value) fileInput.value?.click() }
function handleIncomingFiles(files: ArrayLike<File>) {
  if (creating.value) return
  const checked = validateAssistantImageSelection(files)
  fileError.value = checked.error ?? ''
  if (!checked.file || checked.error) return
  if (state.draft || state.audit) {
    pendingImage.value = checked.file
    showImageReplacementConfirmation.value = true
    return
  }
  applySelectedImage(checked.file)
}
function applySelectedImage(file: File) {
  resetImageInspection()
  fileError.value = workbench.selectImage(file) || ''
}
function confirmImageReplacement() { const file = pendingImage.value; pendingImage.value = null; showImageReplacementConfirmation.value = false; if (file) applySelectedImage(file) }
function cancelImageReplacement() { pendingImage.value = null; showImageReplacementConfirmation.value = false }
function onDragEnter() { if (creating.value) return; dragDepth += 1; isDragging.value = true }
function onDragOver(event: DragEvent) { event.preventDefault(); if (creating.value) return; isDragging.value = true; if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy' }
function onDragLeave() { dragDepth = Math.max(0, dragDepth - 1); if (dragDepth === 0) isDragging.value = false }
function onDrop(event: DragEvent) { event.preventDefault(); dragDepth = 0; isDragging.value = false; if (!creating.value) handleIncomingFiles(event.dataTransfer?.files ?? []) }
function removeImage() { resetImageInspection(); workbench.removeImage(); if (fileInput.value) fileInput.value.value = '' }
async function runAnalyze() { await workbench.analyze() }
function edit(action: Parameters<typeof mutateDraft>[1]) { mutateDraft(state, action) }
function setName(event: Event) { edit((draft) => { draft.name = (event.target as HTMLInputElement).value }) }
function setType(event: Event) { edit((draft) => { draft.type = (event.target as HTMLSelectElement).value }) }
function setHex(index: number, event: Event) { edit((draft) => { const color = draft.colors[index]; color.hex = (event.target as HTMLInputElement).value.toUpperCase(); color.source = 'admin'; color.state = 'modified' }) }
function setClassification(index: number, event: Event) { edit((draft) => { draft.colors[index].classification = (event.target as HTMLSelectElement).value as 'data' | 'structural'; draft.colors[index].state = 'modified' }) }
function acceptColor(index: number) { edit((draft) => { draft.colors[index].state = 'accepted' }) }
function addColor() { edit((draft) => { draft.colors.push(newAdminColor(draft.colors.length)) }) }
function removeColor(index: number) { edit((draft) => { draft.colors.splice(index, 1) }) }
function moveColor(index: number, direction: -1 | 1) { edit((draft) => { const target = index + direction; if (target < 0 || target >= draft.colors.length) return; const [color] = draft.colors.splice(index, 1); draft.colors.splice(target, 0, color) }) }
function addChart() { addChartApplicability(state) }
function removeChart(index: number) { removeChartApplicability(state, index) }
function setChart(index: number, field: 'chart_type' | 'suitability' | 'notes', event: Event) { editChartApplicability(state, index, field, (event.target as HTMLInputElement).value) }
function setVocabulary(field: AssistantMetadataField, values: string[]) { edit((draft) => { draft[field] = values }) }
function setSourceNote(event: Event) { edit((draft) => { draft.source_note = (event.target as HTMLTextAreaElement).value }) }
function setAccessibility(field: 'colorblind_safe'|'print_friendly'|'dark_background', event: Event) { edit((draft) => { draft.accessibility[field] = (event.target as HTMLInputElement).checked }) }
function confirmDraft() { confirmCurrentDraft(state) }
async function runValidate() { await workbench.validate() }
function acknowledge(id: string, event: Event) { setWarningAcknowledgment(state, id, (event.target as HTMLInputElement).checked) }
async function runCreate() { await createCandidateAndNavigate(workbench, (path) => router.push(path)) }
function resetDraft() { resetDraftToAnalyze(state) }
function createPreview() { const result = addDraftPreviewCase(state, pendingPreviewChart.value); previewActionError.value = result.ok ? '' : result.message }
function setPendingPreviewChart(event: Event) { pendingPreviewChart.value = (event.target as HTMLSelectElement).value as ChartType; previewActionError.value = '' }
function removePreview() { clearDraftPreviewCases(state); previewActionError.value = '' }
function changePreviewChart(event: Event) { const result = replaceDraftPreviewChart(state, (event.target as HTMLSelectElement).value); previewActionError.value = result.ok ? '' : result.message }
function setPreviewJson(field: 'color_roles' | 'preview_config', event: Event) {
  try {
    const value = JSON.parse((event.target as HTMLTextAreaElement).value)
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Expected a JSON object.')
    mutateDraftPreviewCase(state, (preview) => { preview[field] = value })
    previewActionError.value = ''
  } catch (error) { previewActionError.value = error instanceof Error ? error.message : 'Invalid JSON.' }
}
function onSourceImageLoad() {
  const image = sourceImage.value
  const canvas = sourceCanvas.value
  if (!image || !canvas) return
  localImageWidth.value = image.naturalWidth
  localImageHeight.value = image.naturalHeight
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  canvas.getContext('2d', { willReadFrequently: true })?.drawImage(image, 0, 0)
  imageReady.value = true
}
function onSourceImageError() { fileError.value = 'The selected image could not be decoded.'; resetImageInspection() }
function togglePicker() { pickerActive.value ? exitPicker() : (pickerActive.value = true); pickerMessage.value = '' }
function exitPicker() { pickerActive.value = false; hoverSample.value = null; pendingPickedHex.value = ''; pickerMessage.value = '' }
function resetImageInspection() { exitPicker(); imageReady.value = false; localImageWidth.value = 0; localImageHeight.value = 0; selectedColorId.value = null }
function hidePickerPreview() { hoverSample.value = null }
function sampleAtPointer(event: MouseEvent) {
  if (!pickerActive.value || !imageReady.value || !imageStage.value || !sourceCanvas.value) return null
  const rect = imageStage.value.getBoundingClientRect()
  const point = mapContainedImagePoint(event.clientX, event.clientY, rect, sourceCanvas.value.width, sourceCanvas.value.height)
  if (!point) return null
  const context = sourceCanvas.value.getContext('2d', { willReadFrequently: true })
  if (!context) return null
  const radius = 2
  const startX = Math.max(0, point.x - radius)
  const startY = Math.max(0, point.y - radius)
  const width = Math.min(sourceCanvas.value.width - startX, radius * 2 + 1)
  const height = Math.min(sourceCanvas.value.height - startY, radius * 2 + 1)
  const data = context.getImageData(startX, startY, width, height)
  const hex = sampleMedianHex(data.data, data.width, data.height, point.x - startX, point.y - startY, 5)
  return hex ? { hex, x: point.x, y: point.y, clientX: event.offsetX, clientY: event.offsetY } : null
}
function onImagePointerMove(event: MouseEvent) {
  const sample = sampleAtPointer(event)
  hoverSample.value = sample
  if (sample && magnifierCanvas.value && sourceCanvas.value) drawMagnifier(magnifierCanvas.value, sourceCanvas.value, sample.x, sample.y)
}
function pickImageColor(event: MouseEvent) {
  if (!pickerActive.value) return
  const sample = sampleAtPointer(event)
  if (!sample) { pickerMessage.value = 'Choose a point inside the displayed image, not the letterbox area.'; return }
  pendingPickedHex.value = sample.hex
  pickerMessage.value = ''
}
async function focusExistingColor(index: number) {
  const color = state.draft?.colors[index]
  if (!color) return
  selectedColorId.value = color.id
  pickerMessage.value = `${color.hex} already exists in the Draft; no duplicate was added.`
  await nextTick()
  colorInputRefs.get(color.id)?.focus()
}
function addPickedColor() {
  if (!pendingPickedHex.value) return
  const result = addPickedDraftColor(state, pendingPickedHex.value)
  if (!result.added && result.existingIndex !== undefined) { void focusExistingColor(result.existingIndex); return }
  pickerMessage.value = `${pendingPickedHex.value} was added as an Admin data color. Confirm the revised Draft when ready.`
  pendingPickedHex.value = ''
}
function replaceSelectedColor() {
  if (!pendingPickedHex.value || !selectedColorId.value) return
  const result = replacePickedDraftColor(state, selectedColorId.value, pendingPickedHex.value)
  if (result.existingIndex !== undefined) { void focusExistingColor(result.existingIndex); return }
  if (result.referenced) { pickerMessage.value = 'The selected color is referenced by the Draft Preview. Update or remove that reference before replacing it.'; return }
  if (result.replaced) { selectedColorId.value = null; pickerMessage.value = `${pendingPickedHex.value} replaced the selected color with a new Admin identity.`; pendingPickedHex.value = '' }
}
function cancelPickedColor() { pendingPickedHex.value = ''; pickerMessage.value = '' }
function selectColor(id: string) { selectedColorId.value = selectedColorId.value === id ? null : id }
function setColorInputRef(id: string, element: unknown) { if (element instanceof HTMLInputElement) colorInputRefs.set(id, element); else colorInputRefs.delete(id) }
const validHex = (value: string) => /^#[0-9A-F]{6}$/.test(value)
const percent = (value: number) => value > 0 && value < 0.001 ? '<0.1%' : `${(value * 100).toFixed(1)}%`
const formatBytes = (value: number) => `${(value / 1024).toFixed(1)} KiB`
function protectWorkbenchLeave(event: BeforeUnloadEvent) {
  protectWorkbenchBeforeUnload(state, event)
}
function onEscape(event: KeyboardEvent) { if (event.key === 'Escape' && pickerActive.value) exitPicker() }
function confirmLeave() {
  const path = pendingLeavePath.value
  showLeaveConfirmation.value = false
  pendingLeavePath.value = null
  if (!path) return
  allowConfirmedLeave = true
  void router.push(path)
}
function cancelLeave() {
  showLeaveConfirmation.value = false
  pendingLeavePath.value = null
}
onBeforeRouteLeave((to) => {
  if (allowConfirmedLeave) {
    allowConfirmedLeave = false
    return true
  }
  let prompt = ''
  const mayLeave = confirmWorkbenchAbandonment(state, (message) => {
    prompt = message
    return false
  })
  if (mayLeave) return true
  leaveConfirmationMessage.value = prompt
  pendingLeavePath.value = to.fullPath
  showLeaveConfirmation.value = true
  return false
})
onMounted(() => { window.addEventListener('beforeunload', protectWorkbenchLeave); window.addEventListener('keydown', onEscape) })
onBeforeUnmount(() => { window.removeEventListener('beforeunload', protectWorkbenchLeave); window.removeEventListener('keydown', onEscape); workbench.dispose() })
</script>

<style scoped>
.workbench{max-width:1100px;margin:0 auto;padding:2rem 0 4rem;color:#172033}.eyebrow{color:#6d28d9;font-weight:700;margin:0}.panel{background:#fff;border:1px solid #dfe4ec;border-radius:14px;padding:1.5rem;margin-top:1.25rem;box-shadow:0 8px 24px rgba(30,41,59,.05)}h1{margin:.25rem 0}h2{margin-top:0}h3{margin:1.4rem 0 .6rem}.hint,.empty{color:#64748b;font-size:.9rem}.visually-hidden{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}.upload-zone{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.35rem;min-height:118px;padding:1rem;border:2px dashed #94a3b8;border-radius:12px;background:#f8fafc;color:#334155;cursor:pointer;transition:.15s ease}.upload-zone:focus-visible{outline:3px solid rgba(37,99,235,.3);border-color:#2563eb}.upload-zone.dragging{border-color:#2563eb;background:#eff6ff;box-shadow:0 0 0 4px rgba(37,99,235,.12)}.upload-zone.locked{opacity:.55;cursor:not-allowed}.upload-zone span{font-size:.85rem;color:#64748b}.source-preview{display:grid;grid-template-columns:minmax(0,2fr) minmax(240px,1fr);gap:1.25rem;align-items:start;margin:1rem 0}.image-stage{position:relative;width:100%;height:min(70vh,680px);min-height:360px;background:repeating-conic-gradient(#eef2f7 0 25%,#f8fafc 0 50%) 50%/18px 18px;border:1px solid #cbd5e1;border-radius:10px;overflow:hidden}.image-stage.picking{cursor:crosshair;box-shadow:0 0 0 3px rgba(37,99,235,.18)}.image-stage>img{display:block;width:100%;height:100%;object-fit:contain}.picker-readout{position:absolute;z-index:10;pointer-events:none;display:flex;flex-direction:column;gap:.3rem;padding:.35rem;background:#fff;border:1px solid #cbd5e1;border-radius:9px;box-shadow:0 10px 25px rgba(15,23,42,.22)}.picker-readout .magnifier{display:block;border-radius:6px}.picker-readout span,.picked-confirmation span{display:flex;align-items:center;gap:.4rem;font-family:monospace}.picker-readout i,.picked-confirmation i{width:22px;height:22px;border:1px solid #94a3b8;border-radius:4px}.source-details{min-width:0}.source-details>p{overflow-wrap:anywhere}.picked-confirmation{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;margin-top:1rem;padding:.8rem;background:#f8fafc;border:1px solid #dbe3ee;border-radius:9px}.actions,.facts,.swatches{display:flex;gap:.75rem;flex-wrap:wrap;margin-top:1rem}button{border:0;border-radius:7px;padding:.65rem .9rem;background:#2563eb;color:#fff;font-weight:650;cursor:pointer}button:disabled{opacity:.45;cursor:not-allowed}.secondary{background:#e8eef8;color:#24324a}.danger{background:#fee2e2;color:#991b1b}.error,.errors,.error-card{color:#991b1b}.error-card{background:#fff1f2;padding:1rem;margin-top:1rem;border-radius:8px}.notice{color:#92400e}.valid{color:#166534}.facts span,.suggestion{background:#f1f5f9;padding:.45rem .65rem;border-radius:7px}.suggestion{display:flex;align-items:center;gap:.4rem}.suggestion i,.color-row>i{width:24px;height:24px;border:1px solid #cbd5e1;border-radius:5px}.warnings{background:#fffbeb;padding:1rem 1rem 1rem 2rem}.section-title{display:flex;justify-content:space-between;align-items:center}.grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem}label{display:flex;flex-direction:column;gap:.35rem;font-weight:600}input,select,textarea{padding:.55rem;border:1px solid #bdc6d4;border-radius:6px;background:#fff}.color-row,.application-row{display:flex;align-items:center;gap:.5rem;margin:.55rem 0}.identity{font-family:monospace;font-size:.72rem;color:#64748b;flex:1;overflow:hidden;text-overflow:ellipsis}.state-badge{font-size:.75rem;background:#ede9fe;color:#5b21b6;padding:.25rem .4rem;border-radius:5px}.draft-strip{display:flex;height:62px;border-radius:8px;overflow:hidden;border:1px solid #cbd5e1}.draft-strip i{flex:1}.boundary{margin-top:1.25rem;padding:1rem;background:#eef2ff;border-radius:8px}.boundary p{margin:.35rem 0 0}@media(max-width:760px){.grid{grid-template-columns:1fr}.color-row,.application-row{align-items:stretch;flex-direction:column}.identity{width:100%}.source-preview{grid-template-columns:1fr}.image-stage{height:min(62vh,520px);min-height:260px}}
</style>
