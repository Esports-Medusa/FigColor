<template>
  <div class="project-workspace" v-if="project">
    <header class="workspace-header">
      <div class="header-left">
        <button class="btn-back" @click="router.push('/projects')">← Back</button>
        <div class="project-info">
          <h1>{{ project.name }}</h1>
          <p v-if="project.description" class="subtitle">{{ project.description }}</p>
        </div>
      </div>
    </header>

    <div class="workspace-content">
      <!-- Palettes Section -->
      <section class="palettes-section">
        <div class="section-header">
          <h2>Project Palettes</h2>
          <button class="btn-add-palette" @click="showAddPaletteModal = true">
            + Add Palette
          </button>
        </div>

        <div class="palettes-grid">
          <div v-for="palette in palettes" :key="palette.id" class="palette-card">
            <!-- Delete confirmation overlay -->
            <div v-if="paletteToDelete === palette.id" class="delete-overlay">
              <div class="delete-confirm-content">
                <p class="delete-question">Delete this palette?</p>
                <div class="delete-actions">
                  <button class="btn-confirm-delete" @click="doDeletePalette(palette.id)">Yes, delete</button>
                  <button class="btn-cancel" @click="paletteToDelete = null">Cancel</button>
                </div>
              </div>
            </div>

            <div class="palette-info">
              <h3>{{ palette.name }}</h3>
              <span v-if="palette.isDefault" class="default-badge">Default</span>
            </div>
            <PaletteChartPreview
              v-if="projectPreviewPalettes.get(palette.id)"
              :palette="projectPreviewPalettes.get(palette.id)!"
              size="card"
            />
            <div class="palette-roles">
              <div
                v-for="role in palette.roles"
                :key="role.id"
                class="role-swatch"
                :style="{ backgroundColor: role.color }"
                :title="`${role.label}: ${role.color}`"
              ></div>
            </div>
            <div class="role-labels">
              <span v-for="role in palette.roles" :key="role.id" class="role-label-item">
                {{ role.label }}: {{ role.color }}
              </span>
            </div>
            <div class="palette-actions">
              <button class="btn-edit-palette" @click="openPaletteEditor(palette)">
                Edit Palette
              </button>
              <button 
                class="btn-delete-palette"
                @click="paletteToDelete = palette.id"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- Figures Section -->
      <section class="figures-section">
        <div class="section-header">
          <h2>Figures</h2>
          <button class="btn-new-figure" @click="showFigureForm = true">
            + New Figure
          </button>
        </div>

        <div v-if="figures && figures.length" class="figures-grid">
          <FigureAssignmentCard
            v-for="figure in figures"
            :key="figure.id"
            :figure="figure"
            :palettes="palettes"
            @edit="editFigure"
            @delete="deleteFigure"
          />
        </div>

        <div v-else class="empty-state">
          <p>No figures yet. Create your first figure to assign colors.</p>
          <button class="btn-primary" @click="showFigureForm = true">
            Create First Figure
          </button>
        </div>
      </section>
    </div>

    <!-- Figure Form Modal -->
    <FigureForm
      :show="showFigureForm"
      :palettes="palettes"
      :editingFigure="editingFigure"
      :submitError="figureFormError"
      @close="closeFigureForm"
      @submit="createFigure"
      @update="updateFigure"
    />

    <!-- Palette Edit Modal -->
    <PaletteEditModal
      v-if="editingPalette"
      :palette="editingPalette"
      :saving="paletteSaving"
      :saveError="paletteSaveError"
      @close="editingPalette = null"
      @update="onPaletteUpdate"
    />

    <!-- Add Palette Modal -->
    <AddPaletteModal
      v-if="showAddPaletteModal"
      :projectId="project.id"
      :existingPaletteIds="palettes.flatMap(p => [p.id, p.basePaletteId].filter((id): id is string => !!id))"
      @close="showAddPaletteModal = false"
      @add="onPaletteAdd"
    />
  </div>

  <div v-else-if="loading" class="loading">Loading project...</div>
  <div v-else-if="error" class="error">{{ error }}</div>
  <div v-else class="error">Project not found</div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, toRaw } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { ProjectDetail, ProjectPalette, FigureAssignment, CreateFigureRequest, UpdateProjectPaletteRequest } from '@/types/project'
import { projectApi } from '@/lib/projectApi'
import FigureForm from '@/components/project/FigureForm.vue'
import FigureAssignmentCard from '@/components/project/FigureAssignmentCard.vue'
import PaletteEditModal from '@/components/project/PaletteEditModal.vue'
import AddPaletteModal from '@/components/project/AddPaletteModal.vue'
import PaletteChartPreview from '@/components/palettes/PaletteChartPreview.vue'
import { resolveProjectPalettePreview } from '@/components/project/ProjectPalettePreview.logic'

const route = useRoute()
const router = useRouter()

const project = ref<ProjectDetail['project'] | null>(null)
const palettes = ref<ProjectPalette[]>([])
const figures = ref<FigureAssignment[]>([])
const loading = ref(true)
const error = ref<string | null>(null)

const showFigureForm = ref(false)
const editingFigure = ref<FigureAssignment | null>(null)
const editingPalette = ref<ProjectPalette | null>(null)
const paletteSaving = ref(false)
const paletteSaveError = ref('')
const showAddPaletteModal = ref(false)
const figureFormError = ref('')

const projectPreviewPalettes = computed(() => new Map(
  palettes.value.flatMap((palette) => {
    const preview = resolveProjectPalettePreview(palette)
    return preview ? [[palette.id, preview] as const] : []
  })
))

// Delete palette inline confirm state
const paletteToDelete = ref<string | null>(null)

// UUID validation helper
function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

onMounted(() => {
  loadProject()
})

async function loadProject() {
  const projectId = route.params.projectId as string
  
  try {
    error.value = null
    const detail = await projectApi.getMyProjectDetail(projectId)
    project.value = detail?.project ?? null
    palettes.value = detail?.palettes ?? []
    figures.value = detail?.figures ?? []
  } catch (e: any) {
    console.error('Failed to load project:', e)
    if (e?.message?.includes('403') || e?.message?.includes('access denied')) {
      error.value = 'You do not have access to this project'
    } else {
      error.value = e?.message || 'Failed to load project'
    }
  } finally {
    loading.value = false
  }
}

async function createFigure(data: CreateFigureRequest) {
  const projectId = route.params.projectId as string
  
  try {
    figureFormError.value = ''
    await projectApi.createFigure(projectId, data)
    await loadProject()
    showFigureForm.value = false
  } catch (e: any) {
    console.error('Failed to create figure:', e)
    figureFormError.value = e?.message || 'Failed to create figure'
  }
}

function editFigure(figure: FigureAssignment) {
  console.log('Edit figure:', figure)
  // Use shallow copy to avoid mutating the reactive proxy
  editingFigure.value = {
    ...figure,
    selectedRoleKeys: [...(figure.selectedRoleKeys || [])]
  }
  showFigureForm.value = true
}

function closeFigureForm() {
  showFigureForm.value = false
  editingFigure.value = null
  figureFormError.value = ''
}

async function updateFigure(data: CreateFigureRequest) {
  const projectId = route.params.projectId as string
  const figureId = editingFigure.value?.id
  
  if (!figureId) return

  // Validate paletteId is a proper UUID before sending to backend
  if (data.paletteId && !isUuid(data.paletteId)) {
    console.warn('[ProjectDetailView] Invalid paletteId for backend UUID field:', data.paletteId)
    alert('Invalid palette selection. Please re-add the palette to this project before saving the figure.')
    return
  }

  try {
    await projectApi.updateFigure(projectId, figureId, data)
    // Update local state
    const idx = figures.value.findIndex(f => f.id === figureId)
    if (idx !== -1) {
      figures.value[idx] = {
        ...figures.value[idx],
        ...data
      }
    }
    closeFigureForm()
  } catch (e) {
    console.error('Failed to update figure:', e)
    figureFormError.value = e instanceof Error ? e.message : 'Failed to update figure'
  }
}

async function deleteFigure(figureId: string) {
  const projectId = route.params.projectId as string
  
  try {
    await projectApi.deleteFigure(projectId, figureId)
    figures.value = figures.value.filter(f => f.id !== figureId)
  } catch (e) {
    console.error('Failed to delete figure:', e)
    alert('Failed to delete figure')
  }
}

function openPaletteEditor(palette: ProjectPalette) {
  // Use toRaw + JSON parse to safely clone Vue reactive proxy
  const rawPalette = toRaw(palette)
  editingPalette.value = JSON.parse(JSON.stringify(rawPalette))
  paletteSaveError.value = ''
}

async function onPaletteUpdate(updatedPalette: ProjectPalette) {
  const original = palettes.value.find(p => p.id === updatedPalette.id)
  if (!original) return
  const existingRoleIds = new Set(original.roles.map(role => role.id))
  const payload: UpdateProjectPaletteRequest = {
    name: updatedPalette.name,
    roles: updatedPalette.roles.map((role, order) => ({
      ...(existingRoleIds.has(role.id) ? { id: role.id } : {}),
      key: role.key,
      label: role.label,
      color: role.color,
      roleType: role.roleType,
      order
    }))
  }
  paletteSaving.value = true
  paletteSaveError.value = ''
  try {
    await projectApi.updateProjectPalette(route.params.projectId as string, updatedPalette.id, payload)
    await loadProject()
    editingPalette.value = null
  } catch (error) {
    paletteSaveError.value = error instanceof Error ? error.message : 'Failed to update palette'
  } finally {
    paletteSaving.value = false
  }
}

function onPaletteAdd(newPalette: ProjectPalette) {
  console.log('[ProjectDetailView] Adding new palette:', newPalette)
  palettes.value.push(newPalette)
}

function doDeletePalette(paletteId: string) {
  if (!paletteId) return
  
  // Check if any figures are using this palette
  const palette = palettes.value.find(p => p.id === paletteId)
  const figuresUsingPalette = figures.value.filter(f => f.paletteId === paletteId || f.paletteId === palette?.basePaletteId)
  
  // Find remaining palettes after deletion
  const remainingPalettes = palettes.value.filter(p => p.id !== paletteId)
  const fallbackPaletteId = remainingPalettes.length > 0 ? (remainingPalettes[0].basePaletteId || remainingPalettes[0].id) : ''
  
  // Update figures that were using this palette
  if (figuresUsingPalette.length > 0) {
    figures.value = figures.value.map(f => {
      if (f.paletteId === paletteId || f.paletteId === palette?.basePaletteId) {
        return {
          ...f,
          paletteId: fallbackPaletteId,
          selectedRoleKeys: [] // Clear selected roles
        }
      }
      return f
    })
  }
  
  // TODO: Call API to remove palette from project
  // await projectApi.removePalette(project.id, paletteId)
  console.log('[ProjectDetailView] Removing palette:', paletteId)
  palettes.value = palettes.value.filter(p => p.id !== paletteId)
  
  // Reset delete state
  paletteToDelete.value = null
}
</script>

<style scoped>
.project-workspace {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
}

.workspace-header {
  margin-bottom: 2rem;
}

.header-left {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
}

.btn-back {
  background: none;
  border: none;
  color: #4A90A4;
  cursor: pointer;
  font-size: 1rem;
  padding: 0.5rem 0;
}

.project-info h1 {
  margin: 0 0 0.5rem;
}

.subtitle {
  color: #666;
  margin: 0;
}

.workspace-content {
  display: grid;
  gap: 2rem;
}

.palettes-section,
.figures-section {
  background: white;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 1.5rem;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.section-header h2 {
  margin: 0;
}

.btn-add-palette {
  background: #4A90A4;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
}

.btn-add-palette:hover {
  background: #3d7a8a;
}

.palettes-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
}

.palette-card {
  background: #f9f9f9;
  border-radius: 8px;
  padding: 1rem;
  position: relative;
}

.palette-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.palette-info h3 {
  margin: 0;
  font-size: 1rem;
}

.default-badge {
  background: #4A90A4;
  color: white;
  padding: 0.125rem 0.5rem;
  border-radius: 4px;
  font-size: 0.7rem;
}

.palette-roles {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.role-swatch {
  width: 32px;
  height: 32px;
  border-radius: 4px;
  border: 1px solid rgba(0, 0, 0, 0.1);
}

.role-labels {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.role-label-item {
  font-size: 0.75rem;
  color: #666;
  background: #f0f0f0;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
}

.palette-actions {
  display: flex;
  gap: 0.5rem;
}

.btn-edit-palette {
  flex: 1;
  padding: 0.5rem;
  background: white;
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
}

.btn-edit-palette:hover {
  background: #f5f5f5;
}

.btn-delete-palette {
  flex: 1;
  padding: 0.5rem;
  background: white;
  border: 1px solid #E57373;
  color: #E57373;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
}

.btn-delete-palette:hover {
  background: #FFEBEE;
}

.delete-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.95);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  z-index: 10;
}

.delete-confirm-content {
  text-align: center;
}

.delete-question {
  font-size: 1rem;
  font-weight: 500;
  color: #333;
  margin-bottom: 1rem;
}

.delete-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: center;
}

.btn-confirm-delete {
  padding: 0.5rem 1rem;
  background: #E57373;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
}

.btn-confirm-delete:hover {
  background: #d32f2f;
}

.btn-cancel {
  padding: 0.5rem 1rem;
  background: white;
  border: 1px solid #ddd;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
}

.btn-cancel:hover {
  background: #f5f5f5;
}

.btn-new-figure {
  background: #4A90A4;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  cursor: pointer;
}

.figures-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
}

.empty-state {
  text-align: center;
  padding: 2rem;
  background: #f9f9f9;
  border-radius: 8px;
}

.empty-state p {
  color: #666;
  margin-bottom: 1rem;
}

.btn-primary {
  background: #4A90A4;
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 6px;
  cursor: pointer;
}

.loading,
.error {
  text-align: center;
  padding: 4rem;
  color: #666;
}
</style>
