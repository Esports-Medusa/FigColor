<template>
  <div v-if="show" class="modal-overlay" @click.self="close">
    <div class="modal">
      <h2>{{ editingFigure ? 'Edit Figure' : 'Create New Figure' }}</h2>
      <form @submit.prevent="submit">
        <div class="form-group">
          <label for="name">Figure Name *</label>
          <input
            id="name"
            v-model="form.name"
            type="text"
            placeholder="e.g., Figure 1A"
            required
          />
        </div>

        <div class="form-group">
          <label for="panel">Panel (optional)</label>
          <input
            id="panel"
            v-model="form.panel"
            type="text"
            placeholder="e.g., A, B, C"
          />
        </div>

        <div class="form-group">
          <label for="chartType">Chart Type *</label>
          <select id="chartType" v-model="form.chartType" required>
            <option value="">Select chart type</option>
            <option value="barplot">Bar Plot</option>
            <option value="boxplot">Box Plot</option>
            <option value="scatter">Scatter Plot</option>
            <option value="line">Line Chart</option>
            <option value="heatmap">Heatmap</option>
            <option value="volcano">Volcano Plot</option>
            <option value="umap">UMAP</option>
            <option value="pca">PCA</option>
            <option value="survival">Survival Curve</option>
          </select>
        </div>

        <div class="form-group">
          <label for="palette">Palette *</label>
          <select id="palette" v-model="form.paletteId" required @change="onPaletteChange">
            <option value="">Select palette</option>
            <option v-for="palette in palettes" :key="palette.id" :value="palette.id">
              {{ palette.name }}
            </option>
          </select>
        </div>

        <div v-if="form.paletteId && selectedPalette" class="form-group">
          <label>Select Roles *</label>
          <div class="roles-grid">
            <label 
              v-for="role in selectedPalette.roles" 
              :key="role.key" 
              class="role-card"
              :class="{ selected: form.selectedRoleKeys.includes(role.key) }"
            >
              <div class="role-card-checkbox">
                <input
                  type="checkbox"
                  :value="role.key"
                  v-model="form.selectedRoleKeys"
                />
              </div>
              <div class="role-card-content">
                <div class="role-card-header">
                  <span class="role-color-block" :style="{ backgroundColor: role.color }"></span>
                  <span class="role-name">{{ role.label }}</span>
                </div>
                <div class="role-card-info">
                  <span class="role-hex">{{ role.color }}</span>
                </div>
              </div>
            </label>
          </div>
        </div>

        <div class="form-group">
          <label for="notes">Notes (optional)</label>
          <textarea
            id="notes"
            v-model="form.notes"
            placeholder="Additional notes..."
            rows="2"
          ></textarea>
        </div>

        <div class="modal-actions">
          <button type="button" class="btn-secondary" @click="close">Cancel</button>
          <button type="submit" class="btn-primary" :disabled="!isValid">
            {{ editingFigure ? 'Save Changes' : 'Create Figure' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { ProjectPalette, FigureAssignment, CreateFigureRequest } from '@/types/project'

const props = defineProps<{
  show: boolean
  palettes: ProjectPalette[]
  editingFigure?: FigureAssignment | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'submit', data: CreateFigureRequest): void
  (e: 'update', data: CreateFigureRequest): void
}>()

const form = ref({
  name: '',
  panel: '',
  chartType: '',
  paletteId: '',
  selectedColorIds: [] as string[],
  selectedRoleKeys: [] as string[],
  notes: ''
})

const selectedPalette = computed(() => {
  return props.palettes?.find(p => p.id === form.value.paletteId)
})

const isValid = computed(() => {
  return form.value.name.trim() && form.value.chartType && form.value.paletteId && (form.value.selectedRoleKeys?.length ?? 0) > 0
})

watch(() => props.show, (newVal) => {
  if (!newVal) {
    resetForm()
  }
})

watch(() => props.editingFigure, (newFigure) => {
  if (newFigure) {
    // Use shallow copy to avoid mutating the reactive proxy
    // Sync selectedColorIds from selectedRoleKeys if not set
    const colorIds = newFigure.selectedColorIds?.length 
      ? newFigure.selectedColorIds 
      : newFigure.selectedRoleKeys
          .map(key => selectedPalette.value?.roles.find(r => r.key === key)?.id)
          .filter((id): id is string => !!id)
    form.value = {
      name: newFigure.name,
      panel: newFigure.panel || '',
      chartType: newFigure.chartType,
      paletteId: newFigure.paletteId,
      selectedColorIds: colorIds,
      selectedRoleKeys: [...(newFigure.selectedRoleKeys || [])],
      notes: newFigure.notes || ''
    }
  }
}, { immediate: true })

function onPaletteChange() {
  form.value.selectedRoleKeys = []
}

function resetForm() {
  form.value = {
    name: '',
    panel: '',
    chartType: '',
    paletteId: '',
    selectedColorIds: [],
    selectedRoleKeys: [],
    notes: ''
  }
}

function close() {
  emit('close')
}

function submit() {
  if (!isValid.value) return
   
  // Sync selectedColorIds from selectedRoleKeys (for backward compatibility)
  // When using selectedRoleKeys, also populate selectedColorIds
  const colorIds = form.value.selectedRoleKeys
    .map(key => selectedPalette.value?.roles.find(r => r.key === key)?.id)
    .filter((id): id is string => !!id)
   
  const data = {
    name: form.value.name.trim(),
    panel: form.value.panel.trim() || undefined,
    chartType: form.value.chartType,
    paletteId: form.value.paletteId,
    selectedColorIds: colorIds,
    selectedRoleKeys: form.value.selectedRoleKeys,
    notes: form.value.notes.trim() || undefined
  }
   
  if (props.editingFigure) {
    emit('update', data)
  } else {
    emit('submit', data)
  }
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: white;
  border-radius: 8px;
  padding: 2rem;
  width: 100%;
  max-width: 500px;
  max-height: 90vh;
  overflow-y: auto;
}

.modal h2 {
  margin-top: 0;
  margin-bottom: 1.5rem;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
}

.form-group input,
.form-group select,
.form-group textarea {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 1rem;
}

.roles-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
}

.role-card {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.875rem;
  background: #f9f9f9;
  border: 2px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.role-card:hover {
  background: #f0f4f6;
  border-color: #d0d7d9;
}

.role-card.selected {
  background: #e8f4f8;
  border-color: #4A90A4;
}

.role-card-checkbox {
  padding-top: 0.25rem;
}

.role-card-checkbox input {
  width: 18px;
  height: 18px;
  cursor: pointer;
  accent-color: #4A90A4;
}

.role-card-content {
  flex: 1;
  min-width: 0;
}

.role-card-header {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  margin-bottom: 0.375rem;
}

.role-color-block {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  flex-shrink: 0;
}

.role-name {
  font-weight: 600;
  font-size: 0.95rem;
  color: #333;
}

.role-card-info {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  padding-left: 36px;
}

.role-hex {
  font-size: 0.8rem;
  color: #666;
  font-family: 'SF Mono', Monaco, 'Courier New', monospace;
}

.role-color-name {
  font-size: 0.75rem;
  color: #888;
}

.modal-actions {
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
  margin-top: 1.5rem;
}

.btn-primary {
  background: #4A90A4;
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 6px;
  cursor: pointer;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background: #f0f0f0;
  border: 1px solid #ddd;
  padding: 0.75rem 1.5rem;
  border-radius: 6px;
  cursor: pointer;
}
</style>