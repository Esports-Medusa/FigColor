<template>
  <div class="figure-card">
    <div class="figure-header">
      <h4>{{ figure.name }}</h4>
      <span v-if="figure.panel" class="panel-badge">{{ figure.panel }}</span>
    </div>
    
    <div class="figure-info">
      <span class="chart-type">{{ chartTypeLabel }}</span>
      <span v-if="paletteName" class="palette-name">{{ paletteName }}</span>
    </div>

    <FigureChartPreview
      :chart-type="figure.chartType"
      :colors="getFigureSelectedColors(figure)"
    />

    <div v-if="selectedRoles && selectedRoles.length" class="roles-preview">
      <span
        v-for="role in selectedRoles"
        :key="role.key"
        class="role-swatch"
        :style="{ backgroundColor: role.color }"
        :title="role.label"
      ></span>
    </div>

    <div class="figure-actions">
      <button class="btn-edit" @click="$emit('edit', figure)">Edit</button>
      <button class="btn-delete" @click="confirmDelete">Delete</button>
    </div>

    <div v-if="showDeleteConfirm" class="delete-confirm">
      <p>Delete this figure?</p>
      <button class="btn-confirm-delete" @click="doDelete">Yes, delete</button>
      <button class="btn-cancel" @click="showDeleteConfirm = false">Cancel</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { FigureAssignment, ProjectPalette, PaletteRole } from '@/types/project'
import FigureChartPreview from './FigureChartPreview.vue'

const props = defineProps<{
  figure: FigureAssignment
  palettes: ProjectPalette[]
}>()

const emit = defineEmits<{
  (e: 'edit', figure: FigureAssignment): void
  (e: 'delete', figureId: string): void
}>()

const showDeleteConfirm = ref(false)

const paletteName = computed(() => {
  const palette = props.palettes.find(p => p.id === props.figure.paletteId)
  return palette?.name
})

const chartTypeLabel = computed(() => {
  const labels: Record<string, string> = {
    barplot: 'Bar Plot',
    boxplot: 'Box Plot',
    scatter: 'Scatter',
    line: 'Line Chart',
    heatmap: 'Heatmap',
    volcano: 'Volcano',
    umap: 'UMAP',
    pca: 'PCA',
    survival: 'Survival'
  }
  return labels[props.figure.chartType] || props.figure.chartType
})

const selectedRoles = computed(() => {
  if (!props.figure.paletteId || !props.palettes?.length) return []
  const palette = props.palettes.find(p => p.id === props.figure.paletteId)
  if (!palette) return []
  return props.figure.selectedRoleKeys
    ?.map(key => palette.roles.find(r => r.key === key))
    .filter(Boolean) as typeof palette.roles
})

/**
 * Get selected colors for figure preview
 * - Uses selectedColorIds if available (new structure)
 * - Falls back to selectedRoleKeys (old structure)
 * - If neither is set, returns first 3-5 colors from palette
 * - Returns empty array if palette not found (UI shows "No palette assigned")
 */
function getFigureSelectedColors(figure: FigureAssignment): Array<{ id: string; hex: string; roleLabel?: string }> {
  // Find the palette
  const palette = props.palettes?.find(p => p.id === figure.paletteId)
  
  // If palette not found, return empty array
  if (!palette) {
    return []
  }

  // If selectedColorIds is available (new structure), use it
  if (figure.selectedColorIds && figure.selectedColorIds.length > 0) {
    return figure.selectedColorIds
      .map(id => palette.roles.find(r => r.id === id))
      .filter((r): r is PaletteRole => !!r)
      .map(r => ({
        id: r.id,
        hex: r.color,
        roleLabel: r.label
      }))
  }

  // Fall back to selectedRoleKeys (old structure)
  if (figure.selectedRoleKeys && figure.selectedRoleKeys.length > 0) {
    return figure.selectedRoleKeys
      .map(key => palette.roles.find(r => r.key === key))
      .filter((r): r is PaletteRole => !!r)
      .map(r => ({
        id: r.id,
        hex: r.color,
        roleLabel: r.label
      }))
  }

  // If neither is set, return first 3-5 colors from palette as default
  return palette.roles.slice(0, 5).map(r => ({
    id: r.id,
    hex: r.color,
    roleLabel: r.label
  }))
}

function confirmDelete() {
  showDeleteConfirm.value = true
}

function doDelete() {
  emit('delete', props.figure.id)
  showDeleteConfirm.value = false
}
</script>

<style scoped>
.figure-card {
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 1rem;
  position: relative;
}

.figure-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.figure-header h4 {
  margin: 0;
  font-size: 1rem;
}

.panel-badge {
  background: #f0f0f0;
  padding: 0.125rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  color: #666;
}

.figure-info {
  display: flex;
  gap: 1rem;
  font-size: 0.85rem;
  color: #666;
  margin-bottom: 0.75rem;
}

.chart-type {
  font-weight: 500;
}

.roles-preview {
  display: flex;
  gap: 0.25rem;
  margin-top: 0.75rem;
}

.role-swatch {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  border: 1px solid rgba(0, 0, 0, 0.1);
}

.figure-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.btn-edit,
.btn-delete {
  padding: 0.375rem 0.75rem;
  border-radius: 4px;
  font-size: 0.85rem;
  cursor: pointer;
  border: none;
}

.btn-edit {
  background: #f0f0f0;
  color: #333;
}

.btn-delete {
  background: #fee;
  color: #c44;
}

.delete-confirm {
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.95);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  border-radius: 8px;
}

.delete-confirm p {
  margin: 0 0 0.5rem;
  font-weight: 500;
}

.btn-confirm-delete {
  background: #c44;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
}

.btn-cancel {
  background: none;
  border: 1px solid #ddd;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
}
</style>