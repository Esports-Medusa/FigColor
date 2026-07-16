<template>
  <section class="bar-error-editor">
    <div class="editor-header">
      <div>
        <h3>Bar Error Preview</h3>
        <p v-if="selectedPreviewCase" class="editor-meta">
          {{ selectedPreviewCase.status }} · {{ selectedPreviewCase.is_primary ? 'primary' : 'not primary' }}
        </p>
        <p v-if="mode === 'editing_unsaved_revision'" class="editor-meta">
          unsaved revision
        </p>
        <p v-if="mode === 'replacing_published'" class="editor-meta">
          replacing published preview
        </p>
        <p v-if="mode === 'replacement_create_failed'" class="editor-meta warning">
          replacement draft not created
        </p>
      </div>
      <div class="editor-actions">
        <button
          v-if="canCreateRevision"
          type="button"
          class="btn btn-secondary btn-small"
          :disabled="requestInProgress"
          @click="createDraftRevision"
        >
          Create Draft Revision
        </button>
        <button
          v-if="!isReadOnly"
          type="button"
          class="btn btn-secondary btn-small"
          :disabled="requestInProgress"
          @click="generateSuggestion"
        >
          Suggest Draft
        </button>
        <button
          type="button"
          class="btn btn-secondary btn-small"
          :disabled="requestInProgress || !canCancel"
          @click="cancelChanges"
        >
          Cancel
        </button>
      </div>
    </div>

    <p v-if="suggestionError" class="error-text">{{ suggestionError }}</p>

    <div v-if="draft" class="editor-grid">
      <div class="editor-fields">
        <div class="field-block">
          <div class="field-block-header">
            <h4>Groups</h4>
            <button
              type="button"
              class="btn btn-secondary btn-small"
              :disabled="controlsDisabled || draft.groups.length >= maxGroups"
              @click="addGroup"
            >
              Add Group
            </button>
          </div>

          <div class="group-rows">
            <div v-for="(group, index) in draft.groups" :key="group.key" class="group-row">
              <input v-model="group.label" type="text" :aria-label="`Group ${index + 1} label`" :disabled="controlsDisabled" />
              <select v-model="group.color_id" :aria-label="`Group ${index + 1} color`" :disabled="controlsDisabled">
                <option v-for="color in palette.colors" :key="color.id" :value="color.id">
                  {{ color.label || color.hex }}
                </option>
              </select>
              <span
                class="swatch"
                :style="{ background: colorHex(group.color_id) }"
                aria-hidden="true"
              ></span>
              <div class="row-actions">
                <button
                  type="button"
                  class="btn btn-secondary btn-square"
                  :disabled="controlsDisabled || index === 0"
                  title="Move group up"
                  @click="moveGroup(index, -1)"
                >
                  ↑
                </button>
                <button
                  type="button"
                  class="btn btn-secondary btn-square"
                  :disabled="controlsDisabled || index === draft.groups.length - 1"
                  title="Move group down"
                  @click="moveGroup(index, 1)"
                >
                  ↓
                </button>
                <button
                  type="button"
                  class="btn btn-danger btn-square"
                  :disabled="controlsDisabled || draft.groups.length <= minGroups"
                  title="Remove group"
                  @click="removeGroup(index)"
                >
                  ×
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="field-block">
          <h4>Config</h4>
          <div class="config-grid">
            <label>
              Orientation
              <select v-model="draft.config.orientation" :disabled="controlsDisabled">
                <option value="vertical">Vertical</option>
                <option value="horizontal">Horizontal</option>
              </select>
            </label>
            <label>
              Sample Size
              <input v-model.number="draft.config.sample_size" type="number" min="1" :disabled="controlsDisabled" />
            </label>
            <label>
              Error Type
              <select v-model="draft.config.error_type" :disabled="controlsDisabled">
                <option value="sd">SD</option>
                <option value="sem">SEM</option>
                <option value="ci">CI</option>
              </select>
            </label>
            <label>
              Data Pattern
              <select v-model="draft.config.data_pattern" :disabled="controlsDisabled">
                <option value="mixed">Mixed</option>
                <option value="treatment_higher">Treatment Higher</option>
                <option value="treatment_lower">Treatment Lower</option>
                <option value="dose_response">Dose Response</option>
              </select>
            </label>
          </div>
        </div>

        <PreviewValidationIssues :issues="displayIssues" />

        <div class="workflow-actions">
          <button
            v-if="mode === 'editing_unsaved_revision' || mode === 'replacement_create_failed'"
            type="button"
            class="btn btn-warning"
            :disabled="requestInProgress || localIssues.length > 0"
            @click="emitReplacePublished"
          >
            Archive Published & Create Draft
          </button>
          <button
            v-else
            type="button"
            class="btn btn-primary"
            :disabled="isReadOnly || requestInProgress || localIssues.length > 0"
            @click="emitSaveDraft"
          >
            Save Draft
          </button>
          <button
            type="button"
            class="btn btn-success"
            :disabled="!savedDraftPreviewCase?.id || localIssues.length > 0 || requestInProgress"
            @click="emitPublish"
          >
            Publish
          </button>
          <button
            type="button"
            class="btn btn-info"
            :disabled="!canSetPrimary"
            @click="emitSetPrimary"
          >
            Set as Primary
          </button>
          <button
            type="button"
            class="btn btn-warning"
            :disabled="!selectedPreviewCase?.id || requestInProgress"
            @click="emitArchive"
          >
            Archive
          </button>
        </div>
      </div>

      <div class="live-preview">
        <PaletteChartPreview :palette="palette" :preview-case="localPreviewCase" size="hero" />
      </div>
    </div>

    <div v-else class="empty-editor">
      <button type="button" class="btn btn-primary" @click="generateSuggestion">
        Generate Draft Suggestion
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import PaletteChartPreview from '@/components/palettes/PaletteChartPreview.vue'
import type { CanonicalPalette, PalettePreviewCase, ValidationIssue } from '@/types/palette'
import {
  BAR_ERROR_MAX_GROUPS,
  BAR_ERROR_MIN_GROUPS,
  buildLocalBarErrorPreviewCase,
  cloneEditableBarErrorDraft,
  editableDraftFromPreviewCase,
  editableDraftFromSuggestion,
  validateEditableBarErrorDraft,
  type EditableBarErrorDraft
} from '@/lib/chart-types/bar-error/admin'
import { suggestBarErrorPreviewDraft } from '@/lib/chart-types/bar-error/suggestion'
import {
  modeForBarErrorPreviewCase,
  shouldSyncBarErrorEditorFromServer,
  type BarErrorEditorMode
} from '@/lib/chart-types/bar-error/lifecycle'
import PreviewValidationIssues from './PreviewValidationIssues.vue'

interface Props {
  palette: CanonicalPalette
  previewCases?: PalettePreviewCase[]
  requestInProgress?: boolean
  backendIssues?: ValidationIssue[]
}

interface Emits {
  (e: 'saveDraft', draft: EditableBarErrorDraft): void
  (e: 'publish', draft: EditableBarErrorDraft): void
  (e: 'replacePublished', previewCaseId: string, draft: EditableBarErrorDraft): void
  (e: 'setPrimary', previewCaseId: string): void
  (e: 'archive', previewCaseId: string): void
}

const props = withDefaults(defineProps<Props>(), {
  previewCases: () => [],
  requestInProgress: false,
  backendIssues: () => []
})
const emit = defineEmits<Emits>()

const minGroups = BAR_ERROR_MIN_GROUPS
const maxGroups = BAR_ERROR_MAX_GROUPS
const draft = ref<EditableBarErrorDraft | null>(null)
const originalDraft = ref<EditableBarErrorDraft | null>(null)
const suggestionError = ref('')
const mode = ref<BarErrorEditorMode>('editing_new_draft')
const replacementSourcePreviewCaseId = ref<string | null>(null)
const wasRequestInProgress = ref(false)

const selectedPreviewCase = computed(() =>
  props.previewCases.find((previewCase) =>
    previewCase.chart_type === 'bar_error' &&
    previewCase.template_id === 'bar_error_v1' &&
    previewCase.status === 'draft'
  ) ?? props.previewCases.find((previewCase) =>
    previewCase.chart_type === 'bar_error' &&
    previewCase.template_id === 'bar_error_v1' &&
    previewCase.status === 'published'
  ) ?? props.previewCases.find((previewCase) =>
    previewCase.chart_type === 'bar_error' &&
    previewCase.template_id === 'bar_error_v1' &&
    previewCase.status === 'archived'
  ) ?? null
)

const savedDraftPreviewCase = computed(() =>
  selectedPreviewCase.value?.status === 'draft' ? selectedPreviewCase.value : null
)

const isReadOnly = computed(() =>
  Boolean(selectedPreviewCase.value && selectedPreviewCase.value.status !== 'draft' && mode.value !== 'editing_unsaved_revision' && mode.value !== 'replacement_create_failed')
)

const controlsDisabled = computed(() => isReadOnly.value || props.requestInProgress)

const canCreateRevision = computed(() =>
  Boolean(
    selectedPreviewCase.value?.status === 'published' &&
    mode.value !== 'editing_unsaved_revision' &&
    mode.value !== 'replacement_create_failed' &&
    mode.value !== 'replacing_published' &&
    !props.requestInProgress
  )
)

const localPreviewCase = computed(() =>
  draft.value
    ? buildLocalBarErrorPreviewCase(props.palette.id, draft.value, {
        id: savedDraftPreviewCase.value?.id ?? selectedPreviewCase.value?.id,
        status: mode.value === 'editing_unsaved_revision' || mode.value === 'replacement_create_failed' || mode.value === 'replacing_published'
          ? 'draft'
          : selectedPreviewCase.value?.status,
        isPrimary: mode.value === 'editing_unsaved_revision' || mode.value === 'replacement_create_failed' || mode.value === 'replacing_published'
          ? false
          : selectedPreviewCase.value?.is_primary
      })
    : null
)

const localIssues = computed(() =>
  draft.value ? validateEditableBarErrorDraft(props.palette, draft.value, {
    previewCaseId: selectedPreviewCase.value?.id
  }) : []
)

const displayIssues = computed(() => [...localIssues.value, ...props.backendIssues])

const hasUnsavedChanges = computed(() =>
  JSON.stringify(draft.value) !== JSON.stringify(originalDraft.value)
)

const canCancel = computed(() =>
  hasUnsavedChanges.value ||
  mode.value === 'editing_unsaved_revision' ||
  mode.value === 'replacement_create_failed'
)

const canSetPrimary = computed(() =>
  Boolean(
    selectedPreviewCase.value?.id &&
    selectedPreviewCase.value.status === 'published' &&
    !selectedPreviewCase.value.is_primary &&
    !props.requestInProgress
  )
)

watch(selectedPreviewCase, (previewCase) => {
  if (!shouldSyncBarErrorEditorFromServer(mode.value, previewCase)) return
  syncFromPreviewCase(previewCase)
}, { immediate: true })

watch(() => props.requestInProgress, (inProgress) => {
  if (wasRequestInProgress.value && !inProgress && mode.value === 'replacing_published') {
    if (selectedPreviewCase.value?.status === 'draft') {
      syncFromPreviewCase(selectedPreviewCase.value)
    } else if (selectedPreviewCase.value?.status === 'archived') {
      mode.value = 'replacement_create_failed'
    } else {
      mode.value = 'editing_unsaved_revision'
    }
  }
  wasRequestInProgress.value = inProgress
})

function syncFromPreviewCase(previewCase: PalettePreviewCase | null): void {
  if (!previewCase) {
    mode.value = 'editing_new_draft'
    return
  }
  const editable = editableDraftFromPreviewCase(previewCase)
  draft.value = editable
  originalDraft.value = cloneEditableBarErrorDraft(editable)
  mode.value = modeForBarErrorPreviewCase(previewCase)
  replacementSourcePreviewCaseId.value = null
}

function generateSuggestion(): void {
  const result = suggestBarErrorPreviewDraft(props.palette)
  if (!result.ok) {
    suggestionError.value = result.message
    return
  }

  suggestionError.value = ''
  const editable = editableDraftFromSuggestion(result.value)
  draft.value = editable
  originalDraft.value = cloneEditableBarErrorDraft(editable)
  mode.value = 'editing_new_draft'
  replacementSourcePreviewCaseId.value = null
}

function cancelChanges(): void {
  if (mode.value === 'editing_unsaved_revision') {
    syncFromPreviewCase(selectedPreviewCase.value)
    return
  }
  if (mode.value === 'replacement_create_failed') {
    if (!window.confirm('Discard the retained local revision? The source published preview has already been archived.')) {
      return
    }
    syncFromPreviewCase(selectedPreviewCase.value)
    return
  }
  draft.value = originalDraft.value
    ? cloneEditableBarErrorDraft(originalDraft.value)
    : null
}

function createDraftRevision(): void {
  if (!selectedPreviewCase.value || selectedPreviewCase.value.status !== 'published') return
  const editable = editableDraftFromPreviewCase(selectedPreviewCase.value)
  draft.value = editable
  originalDraft.value = cloneEditableBarErrorDraft(editable)
  mode.value = 'editing_unsaved_revision'
  replacementSourcePreviewCaseId.value = selectedPreviewCase.value.id
  suggestionError.value = ''
}

function addGroup(): void {
  if (!draft.value || draft.value.groups.length >= maxGroups) return
  const color = props.palette.colors.find((candidate) =>
    !draft.value?.groups.some((group) => group.color_id === candidate.id)
  ) ?? props.palette.colors[0]
  if (!color) return

  draft.value.groups.push({
    key: nextGroupKey(),
    label: `Group ${draft.value.groups.length + 1}`,
    color_id: color.id
  })
}

function removeGroup(index: number): void {
  if (!draft.value || draft.value.groups.length <= minGroups) return
  draft.value.groups.splice(index, 1)
}

function moveGroup(index: number, direction: -1 | 1): void {
  if (!draft.value) return
  const nextIndex = index + direction
  if (nextIndex < 0 || nextIndex >= draft.value.groups.length) return
  const [group] = draft.value.groups.splice(index, 1)
  draft.value.groups.splice(nextIndex, 0, group)
}

function colorHex(colorId: string): string {
  return props.palette.colors.find((color) => color.id === colorId)?.hex ?? '#e5e7eb'
}

function emitSaveDraft(): void {
  if (!draft.value || isReadOnly.value || localIssues.value.length > 0) return
  emit('saveDraft', cloneEditableBarErrorDraft(draft.value))
}

function emitPublish(): void {
  if (!draft.value || localIssues.value.length > 0 || !savedDraftPreviewCase.value?.id) return
  emit('publish', cloneEditableBarErrorDraft(draft.value))
}

function emitReplacePublished(): void {
  const sourceId = replacementSourcePreviewCaseId.value ?? selectedPreviewCase.value?.id
  if (!draft.value || !sourceId || localIssues.value.length > 0) return
  mode.value = 'replacing_published'
  emit('replacePublished', sourceId, cloneEditableBarErrorDraft(draft.value))
}

function emitSetPrimary(): void {
  if (!selectedPreviewCase.value?.id || !canSetPrimary.value) return
  emit('setPrimary', selectedPreviewCase.value.id)
}

function emitArchive(): void {
  if (!selectedPreviewCase.value?.id) return
  emit('archive', selectedPreviewCase.value.id)
}

function nextGroupKey(): string {
  if (!draft.value) return 'group_1'
  const used = new Set(draft.value.groups.map((group) => group.key))
  for (let index = 1; index <= maxGroups; index += 1) {
    const key = `group_${index}`
    if (!used.has(key)) return key
  }
  return `group_${draft.value.groups.length + 1}`
}
</script>

<style scoped>
.bar-error-editor {
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
.editor-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.editor-header,
.field-block-header {
  justify-content: space-between;
}

.editor-header h3,
.field-block h4 {
  margin: 0;
  color: #111827;
}

.editor-header h3 {
  font-size: 0.95rem;
}

.field-block h4 {
  font-size: 0.8125rem;
}

.editor-meta {
  margin: 0.2rem 0 0;
  color: #6b7280;
  font-size: 0.75rem;
  text-transform: capitalize;
}

.editor-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(280px, 0.85fr);
  gap: 1rem;
}

.editor-fields,
.field-block,
.group-rows {
  display: grid;
  gap: 0.75rem;
}

.group-row {
  display: grid;
  grid-template-columns: minmax(120px, 1fr) minmax(130px, 1fr) 28px auto;
  gap: 0.5rem;
  align-items: center;
}

.group-row input,
.group-row select,
.config-grid input,
.config-grid select {
  width: 100%;
  min-width: 0;
  padding: 0.45rem 0.55rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 0.8125rem;
}

.swatch {
  width: 24px;
  height: 24px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
}

.row-actions {
  display: flex;
  gap: 0.25rem;
}

.config-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
}

.config-grid label {
  display: grid;
  gap: 0.35rem;
  color: #374151;
  font-size: 0.75rem;
  font-weight: 600;
}

.live-preview {
  min-width: 0;
}

.empty-editor {
  display: flex;
  justify-content: flex-start;
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

.btn-primary {
  background: #2563eb;
  color: #fff;
}

.btn-secondary {
  background: #f3f4f6;
  color: #374151;
}

.btn-info {
  background: #3b82f6;
  color: #fff;
}

.btn-success {
  background: #10b981;
  color: #fff;
}

.btn-warning {
  background: #f59e0b;
  color: #fff;
}

.btn-danger {
  background: #fee2e2;
  color: #991b1b;
}

.error-text {
  color: #dc2626;
  font-size: 0.75rem;
}

@media (max-width: 980px) {
  .editor-grid {
    grid-template-columns: 1fr;
  }

  .group-row {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
