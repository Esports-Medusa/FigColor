<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content">
      <div class="modal-header">
        <h3>Add Palette</h3>
        <button class="btn-close" @click="$emit('close')">×</button>
      </div>

      <!-- Tab Navigation -->
      <div class="tab-nav">
        <button 
          :class="['tab-btn', { active: activeTab === 'select' }]" 
          @click="activeTab = 'select'"
        >
          All Palettes
        </button>
        <button 
          :class="['tab-btn', { active: activeTab === 'favorites' }]" 
          @click="activeTab = 'favorites'"
        >
          My Favorites
        </button>
        <button 
          :class="['tab-btn', { active: activeTab === 'create' }]" 
          @click="activeTab = 'create'"
        >
          Create Custom
        </button>
      </div>

      <!-- Tab Content: Select from database -->
      <div v-if="activeTab === 'select'" class="tab-content">
        <!-- Search Bar -->
        <div class="search-bar">
          <input 
            v-model="searchQuery"
            type="text"
            placeholder="Search by name, ID, style, chart type, discipline, tags, or HEX..."
            class="search-input"
          />
        </div>

        <!-- Quick Filters -->
        <div class="quick-filters">
          <select v-model="filterChartType" class="filter-select">
            <option value="">All Chart Types</option>
            <option v-for="ct in availableChartTypes" :key="ct" :value="ct">{{ ct }}</option>
          </select>
          <select v-model="filterJournalStyle" class="filter-select">
            <option value="">All Journal Styles</option>
            <option v-for="js in availableJournalStyles" :key="js" :value="js">{{ js }}</option>
          </select>
          <select v-model="filterColorCount" class="filter-select">
            <option value="">All Color Counts</option>
            <option v-for="cc in availableColorCounts" :key="cc" :value="String(cc)">{{ cc }} colors</option>
          </select>
        </div>

        <!-- Results count -->
        <div class="results-info">
          Showing {{ filteredPalettes.length }} of {{ allPalettes.length }} palettes
        </div>

        <!-- Palette List -->
        <div v-if="loading" class="loading">Loading palettes...</div>
        <div v-else-if="filteredPalettes.length === 0" class="empty-message">
          No palettes match your search criteria.
        </div>
        <div v-else class="palette-list">
          <div 
            v-for="palette in filteredPalettes" 
            :key="palette.id"
            :class="['palette-option', { selected: selectedPaletteId === palette.id }]"
            @click="selectedPaletteId = palette.id"
          >
            <div class="palette-option-header">
              <div class="palette-name-id">
                <span class="palette-name">{{ palette.name }}</span>
                <span class="palette-id">{{ palette.id }}</span>
              </div>
              <button 
                class="favorite-btn"
                :class="{ favorited: isFavorited(palette.id) }"
                @click.stop="toggleFavorite(palette.id)"
                :title="isFavorited(palette.id) ? 'Remove from favorites' : 'Add to favorites'"
              >
                {{ isFavorited(palette.id) ? '♥' : '♡' }}
              </button>
            </div>
            <span class="palette-meta">
              {{ palette.journal_style?.join(', ') || 'general' }} | 
              {{ palette.chart_type?.join(', ') || 'N/A' }}
            </span>
            <div class="palette-tags">
              <span v-for="tag in palette.tags.slice(0, 4)" :key="tag" class="tag">{{ tag }}</span>
            </div>
            <div class="palette-preview-row">
              <div class="color-strip">
                <div 
                  v-for="(color, idx) in palette.colors.slice(0, 10)" 
                  :key="idx"
                  class="color-swatch"
                  :style="{ backgroundColor: color.hex }"
                  :title="color.hex"
                ></div>
                <span v-if="palette.color_count > 10" class="more-colors">+{{ palette.color_count - 10 }}</span>
              </div>
              <span class="color-count">{{ palette.color_count }} colors</span>
            </div>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn-cancel" @click="$emit('close')">Cancel</button>
          <button 
            class="btn-add" 
            :disabled="!selectedPaletteId"
            @click="addSelectedPalette"
          >
            Add Selected Palette
          </button>
        </div>
      </div>

      <!-- Tab Content: My Favorites -->
      <div v-if="activeTab === 'favorites'" class="tab-content">
        <!-- Search Bar for Favorites -->
        <div class="search-bar">
          <input 
            v-model="favoritesSearchQuery"
            type="text"
            placeholder="Search in favorites..."
            class="search-input"
          />
        </div>

        <!-- Quick Filters for Favorites -->
        <div class="quick-filters">
          <select v-model="favoritesFilterChartType" class="filter-select">
            <option value="">All Chart Types</option>
            <option v-for="ct in availableChartTypes" :key="ct" :value="ct">{{ ct }}</option>
          </select>
          <select v-model="favoritesFilterJournalStyle" class="filter-select">
            <option value="">All Journal Styles</option>
            <option v-for="js in availableJournalStyles" :key="js" :value="js">{{ js }}</option>
          </select>
        </div>

        <!-- Results count -->
        <div class="results-info">
          Showing {{ filteredFavoritePalettes.length }} of {{ favoritePalettes.length }} favorites
        </div>

        <!-- Favorites List -->
        <div v-if="favoritesLoading" class="loading">Loading favorites...</div>
        <div v-else-if="!isLoggedIn" class="empty-message">
          Please log in to view your favorite palettes.
        </div>
        <div v-else-if="favoritePalettes.length === 0" class="empty-message">
          No favorite palettes yet. Save palettes from the palette library first.
        </div>
        <div v-else-if="filteredFavoritePalettes.length === 0" class="empty-message">
          No favorites match your search criteria.
        </div>
        <div v-else class="palette-list">
          <div 
            v-for="palette in filteredFavoritePalettes" 
            :key="palette.id"
            :class="['palette-option', { selected: selectedPaletteId === palette.id }]"
            @click="selectedPaletteId = palette.id"
          >
            <div class="palette-option-header">
              <div class="palette-name-id">
                <span class="palette-name">{{ palette.name }}</span>
                <span class="palette-id">{{ palette.id }}</span>
              </div>
              <span class="favorited-badge">♥</span>
            </div>
            <span class="palette-meta">
              {{ palette.journal_style?.join(', ') || 'general' }} | 
              {{ palette.chart_type?.join(', ') || 'N/A' }}
            </span>
            <div class="palette-tags">
              <span v-for="tag in palette.tags.slice(0, 4)" :key="tag" class="tag">{{ tag }}</span>
            </div>
            <div class="palette-preview-row">
              <div class="color-strip">
                <div 
                  v-for="(color, idx) in palette.colors.slice(0, 10)" 
                  :key="idx"
                  class="color-swatch"
                  :style="{ backgroundColor: color.hex }"
                  :title="color.hex"
                ></div>
                <span v-if="palette.color_count > 10" class="more-colors">+{{ palette.color_count - 10 }}</span>
              </div>
              <span class="color-count">{{ palette.color_count }} colors</span>
            </div>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn-cancel" @click="$emit('close')">Cancel</button>
          <button 
            class="btn-add" 
            :disabled="!selectedPaletteId"
            @click="addSelectedPalette"
          >
            Add Selected Palette
          </button>
        </div>
      </div>

      <!-- Tab Content: Create custom palette -->
      <div v-if="activeTab === 'create'" class="tab-content">
        <div class="form-group">
          <label>Palette Name</label>
          <input 
            v-model="newPalette.name" 
            type="text" 
            placeholder="Enter palette name"
            class="input-field"
          />
        </div>

        <div class="roles-editor">
          <label>Roles (HEX Colors)</label>
          <div v-for="role in newPalette.roles" :key="role.key" class="role-row">
            <span class="role-label">{{ role.label }}</span>
            <div class="role-input-group">
              <input 
                type="color" 
                :value="role.color"
                @input="updateRoleColor(role.key, ($event.target as HTMLInputElement).value)"
                class="color-picker"
              />
              <input 
                v-model="role.color"
                type="text"
                :class="['hex-input', { error: roleHexErrors[role.key] }]"
                placeholder="#RRGGBB"
                @input="validateHex(role.key)"
              />
            </div>
            <span v-if="roleHexErrors[role.key]" class="error-text">
              Invalid HEX format
            </span>
          </div>
        </div>

        <!-- Preview -->
        <div class="custom-preview">
          <label>Preview</label>
          <div class="preview-colors">
            <div 
              v-for="role in newPalette.roles" 
              :key="role.key"
              class="preview-item"
            >
              <div class="preview-swatch" :style="{ backgroundColor: role.color }"></div>
              <span class="preview-label">{{ role.label }}</span>
              <span class="preview-hex">{{ role.color }}</span>
            </div>
          </div>
        </div>

        <div class="modal-actions">
          <button class="btn-cancel" @click="$emit('close')">Cancel</button>
          <button 
            class="btn-add" 
            :disabled="!isValidCustomPalette"
            @click="addCustomPalette"
          >
            Create Palette
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { Palette } from '@/types/palette'
import type { ProjectPalette } from '@/types/project'
import { loadPalettes, paletteToSearchText } from '@/lib/palette'
import { useFavorites } from '@/composables/useFavorites'
import { getToken } from '@/api/auth'

const props = defineProps<{
  projectId: string
  existingPaletteIds: string[] // To filter out already added palettes
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'add', palette: ProjectPalette): void
}>()

const activeTab = ref<'select' | 'favorites' | 'create'>('select')
const loading = ref(false)
const favoritesLoading = ref(false)

// Load all palettes from local data
const allPalettes = ref<Palette[]>([])
const selectedPaletteId = ref<string | null>(null)

// Favorites composable
const { favoritePaletteIds, loadFavorites, addFavorite, removeFavorite, isFavorited: checkIsFavorited } = useFavorites()

// Check if user is logged in
const isLoggedIn = computed(() => !!getToken())

// Get full palette objects for favorites
const favoritePalettes = computed(() => {
  return allPalettes.value.filter(p => favoritePaletteIds.value.includes(p.id))
})

// Favorites search and filter state
const favoritesSearchQuery = ref('')
const favoritesFilterChartType = ref('')
const favoritesFilterJournalStyle = ref('')

// Filtered favorite palettes based on search and filters
const filteredFavoritePalettes = computed(() => {
  let result = favoritePalettes.value

  // Filter out already added palettes
  result = result.filter(p => !props.existingPaletteIds.includes(p.id))

  // Apply chart type filter
  if (favoritesFilterChartType.value) {
    result = result.filter(p => p.chart_type.includes(favoritesFilterChartType.value))
  }

  // Apply journal style filter
  if (favoritesFilterJournalStyle.value) {
    result = result.filter(p => p.journal_style.includes(favoritesFilterJournalStyle.value))
  }

  // Apply search query
  if (favoritesSearchQuery.value.trim()) {
    const query = favoritesSearchQuery.value.toLowerCase().trim()
    result = result.filter(palette => {
      const searchText = paletteToSearchText(palette)
      return searchText.includes(query)
    })
  }

  return result
})

// Toggle favorite function
async function toggleFavorite(paletteId: string) {
  if (checkIsFavorited(paletteId)) {
    await removeFavorite(paletteId)
  } else {
    await addFavorite(paletteId)
  }
}

// isFavorited alias for template
function isFavorited(paletteId: string): boolean {
  return checkIsFavorited(paletteId)
}

// Search and filter state
const searchQuery = ref('')
const filterChartType = ref('')
const filterJournalStyle = ref('')
const filterColorCount = ref('')

// Available filter options derived from palette data
const availableChartTypes = computed(() => {
  const types = new Set<string>()
  allPalettes.value.forEach(p => p.chart_type.forEach(ct => types.add(ct)))
  return Array.from(types).sort()
})

const availableJournalStyles = computed(() => {
  const styles = new Set<string>()
  allPalettes.value.forEach(p => p.journal_style.forEach(js => styles.add(js)))
  return Array.from(styles).sort()
})

const availableColorCounts = computed(() => {
  const counts = new Set<number>()
  allPalettes.value.forEach(p => counts.add(p.color_count))
  return Array.from(counts).sort((a, b) => a - b)
})

// Filtered palettes based on search query and filters
const filteredPalettes = computed(() => {
  let result = allPalettes.value

  // Filter out already added palettes
  result = result.filter(p => !props.existingPaletteIds.includes(p.id))

  // Apply chart type filter
  if (filterChartType.value) {
    result = result.filter(p => p.chart_type.includes(filterChartType.value))
  }

  // Apply journal style filter
  if (filterJournalStyle.value) {
    result = result.filter(p => p.journal_style.includes(filterJournalStyle.value))
  }

  // Apply color count filter
  if (filterColorCount.value) {
    const count = parseInt(filterColorCount.value, 10)
    result = result.filter(p => p.color_count === count)
  }

  // Apply search query
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase().trim()
    result = result.filter(palette => {
      const searchText = paletteToSearchText(palette)
      return searchText.includes(query)
    })
  }

  return result
})

async function loadAvailablePalettes() {
  loading.value = true
  try {
    allPalettes.value = await loadPalettes()
    console.log('[AddPaletteModal] Loaded palettes:', allPalettes.value.length)
  } catch (e) {
    console.error('[AddPaletteModal] Failed to load palettes:', e)
    allPalettes.value = []
  } finally {
    loading.value = false
  }
}

// Custom palette form state
const newPalette = ref({
  name: '',
  roles: [
    { key: 'control', label: 'Control', color: '#4A90A4' },
    { key: 'treatment', label: 'Treatment', color: '#E57373' },
    { key: 'highlight', label: 'Highlight', color: '#81C784' },
    { key: 'background', label: 'Background', color: '#FFFFFF' }
  ]
})

const roleHexErrors = ref<Record<string, boolean>>({})

function validateHex(roleKey: string) {
  const role = newPalette.value.roles.find(r => r.key === roleKey)
  if (role) {
    const hexPattern = /^#[0-9A-Fa-f]{6}$/
    roleHexErrors.value[roleKey] = !hexPattern.test(role.color)
  }
}

function updateRoleColor(roleKey: string, color: string) {
  const role = newPalette.value.roles.find(r => r.key === roleKey)
  if (role) {
    role.color = color
    validateHex(roleKey)
  }
}

const isValidCustomPalette = computed(() => {
  const hasName = newPalette.value.name.trim().length > 0
  const hasValidColors = newPalette.value.roles.every(
    role => /^#[0-9A-Fa-f]{6}$/.test(role.color) && !roleHexErrors.value[role.key]
  )
  return hasName && hasValidColors
})

async function addSelectedPalette() {
  if (!selectedPaletteId.value) return

  const basePalette = filteredPalettes.value.find(p => p.id === selectedPaletteId.value)
  if (!basePalette) return

  // TODO: Replace with actual API call when backend supports creating project palettes
  // const request: CreateProjectPaletteRequest = {
  //   projectId: props.projectId,
  //   basePaletteId: basePalette.id,
  //   name: basePalette.name
  // }
  // const newProjectPalette = await projectApi.createProjectPalette(request)

  // Generate UUIDs for the new palette and roles
  const paletteId = crypto.randomUUID()
  const newProjectPalette: ProjectPalette = {
    id: paletteId,
    projectId: props.projectId,
    name: basePalette.name,
    basePaletteId: basePalette.id,
    isDefault: false,
    roles: basePalette.colors.map((color, idx) => ({
      id: crypto.randomUUID(),
      paletteId: paletteId,
      key: `color-${idx}`,
      label: `Color ${idx + 1}`,
      color: color.hex,
      roleType: 'semantic' as const,
      order: idx,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }

  console.log('[AddPaletteModal] Adding palette from database:', newProjectPalette)
  emit('add', newProjectPalette)
  emit('close')
}

async function addCustomPalette() {
  if (!isValidCustomPalette.value) return

  // TODO: Replace with actual API call when backend supports creating project palettes
  // const request: CreateProjectPaletteRequest = {
  //   projectId: props.projectId,
  //   name: newPalette.value.name,
  //   roles: newPalette.value.roles
  // }
  // const newProjectPalette = await projectApi.createProjectPalette(request)

  // Mock: Create project-level palette from custom form
  const paletteId = crypto.randomUUID()
  const newProjectPalette: ProjectPalette = {
    id: paletteId,
    projectId: props.projectId,
    name: newPalette.value.name,
    isDefault: false,
    roles: newPalette.value.roles.map((role, idx) => ({
      id: crypto.randomUUID(),
      paletteId: paletteId,
      key: role.key,
      label: role.label,
      color: role.color,
      roleType: 'custom' as const,
      order: idx,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }

  console.log('[AddPaletteModal] Adding custom palette:', newProjectPalette)
  emit('add', newProjectPalette)
  emit('close')
}

onMounted(async () => {
  console.log('[AddPaletteModal] Mounted, loading available palettes...')
  await Promise.all([
    loadAvailablePalettes(),
    loadFavorites(),
  ])
})
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

.modal-content {
  background: white;
  border-radius: 12px;
  width: 90%;
  max-width: 600px;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid #e0e0e0;
}

.modal-header h3 {
  margin: 0;
  font-size: 1.25rem;
}

.btn-close {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #999;
  padding: 0;
  line-height: 1;
}

.btn-close:hover {
  color: #666;
}

.tab-nav {
  display: flex;
  border-bottom: 1px solid #e0e0e0;
}

.tab-btn {
  flex: 1;
  padding: 1rem;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.95rem;
  color: #666;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
}

.tab-btn:hover {
  background: #f5f5f5;
}

.tab-btn.active {
  color: #4A90A4;
  border-bottom-color: #4A90A4;
}

.tab-content {
  padding: 1.5rem;
}

.search-bar {
  margin-bottom: 1rem;
}

.search-input {
  width: 100%;
  padding: 0.75rem 1rem;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 0.95rem;
}

.search-input:focus {
  outline: none;
  border-color: #4A90A4;
}

.quick-filters {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.filter-select {
  flex: 1;
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.85rem;
  background: white;
  cursor: pointer;
}

.filter-select:focus {
  outline: none;
  border-color: #4A90A4;
}

.results-info {
  font-size: 0.85rem;
  color: #888;
  margin-bottom: 0.75rem;
}

.loading,
.empty-message {
  text-align: center;
  padding: 2rem;
  color: #666;
}

.palette-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-height: 400px;
  overflow-y: auto;
}

.palette-option {
  padding: 1rem;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.palette-option:hover {
  border-color: #4A90A4;
  background: #f8f9fa;
}

.palette-option.selected {
  border-color: #4A90A4;
  background: #e8f4f8;
}

.palette-option-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0.5rem;
}

.palette-name-id {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.palette-name {
  font-weight: 600;
  font-size: 1rem;
}

.palette-id {
  font-size: 0.75rem;
  color: #888;
  font-family: monospace;
}

.palette-meta {
  font-size: 0.8rem;
  color: #666;
  text-align: right;
}

.palette-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-bottom: 0.75rem;
}

.tag {
  font-size: 0.7rem;
  padding: 0.2rem 0.5rem;
  background: #e8f4f8;
  border-radius: 4px;
  color: #4A90A4;
}

.palette-preview-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.color-strip {
  display: flex;
  align-items: center;
  gap: 3px;
}

.color-swatch {
  width: 20px;
  height: 20px;
  border-radius: 3px;
  border: 1px solid rgba(0, 0, 0, 0.1);
}

.more-colors {
  font-size: 0.7rem;
  color: #888;
  margin-left: 0.25rem;
}

.color-count {
  font-size: 0.75rem;
  color: #888;
}

.form-group {
  margin-bottom: 1.25rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: #333;
}

.input-field {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 0.95rem;
}

.input-field:focus {
  outline: none;
  border-color: #4A90A4;
}

.roles-editor {
  margin-bottom: 1.5rem;
}

.roles-editor > label {
  display: block;
  margin-bottom: 1rem;
  font-weight: 500;
  color: #333;
}

.role-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
}

.role-label {
  width: 100px;
  font-size: 0.9rem;
  color: #555;
}

.role-input-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.color-picker {
  width: 40px;
  height: 40px;
  padding: 0;
  border: 1px solid #ddd;
  border-radius: 6px;
  cursor: pointer;
}

.hex-input {
  width: 100px;
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-family: monospace;
  font-size: 0.9rem;
}

.hex-input.error {
  border-color: #E57373;
  background: #FFEBEE;
}

.error-text {
  font-size: 0.8rem;
  color: #E57373;
}

.custom-preview {
  margin-bottom: 1.5rem;
  padding: 1rem;
  background: #f9f9f9;
  border-radius: 8px;
}

.custom-preview > label {
  display: block;
  margin-bottom: 0.75rem;
  font-weight: 500;
  color: #333;
}

.preview-colors {
  display: flex;
  gap: 1rem;
}

.preview-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
}

.preview-swatch {
  width: 48px;
  height: 48px;
  border-radius: 6px;
  border: 1px solid rgba(0, 0, 0, 0.1);
}

.preview-label {
  font-size: 0.8rem;
  color: #555;
}

.preview-hex {
  font-size: 0.75rem;
  font-family: monospace;
  color: #888;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding-top: 1rem;
  border-top: 1px solid #e0e0e0;
}

.btn-cancel,
.btn-add {
  padding: 0.75rem 1.5rem;
  border-radius: 6px;
  font-size: 0.95rem;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-cancel {
  background: white;
  border: 1px solid #ddd;
  color: #666;
}

.btn-cancel:hover {
  background: #f5f5f5;
}

.btn-add {
  background: #4A90A4;
  border: none;
  color: white;
}

.btn-add:hover:not(:disabled) {
  background: #3d7a8a;
}

.btn-add:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.favorite-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #ccc;
  padding: 0.25rem;
  line-height: 1;
  transition: all 0.2s;
}

.favorite-btn:hover {
  color: #E57373;
  transform: scale(1.1);
}

.favorite-btn.favorited {
  color: #E57373;
}

.favorited-badge {
  color: #E57373;
  font-size: 1.25rem;
}
</style>
