<template>
  <div class="palette-detail-view">
    <div v-if="palette" class="palette-detail">
      <!-- Back Link -->
      <router-link to="/palettes" class="back-link">
        ← Back to Palettes
      </router-link>

      <!-- Hero Card -->
      <section class="hero-card">
        <div class="hero-header">
          <h1 class="palette-name">{{ palette.name }}</h1>
          <p class="palette-summary">{{ paletteSummary }}</p>
        </div>
        <div class="hero-chart-preview">
          <PaletteChartPreview 
            :colors="paletteColors" 
            :chart-types="palette.chart_type"
            :chart-family="palette.chart_family"
            :seed="palette.id"
            variant="hero"
            :height="200"
          />
          <PalettePreview :colors="palette.colors" size="sm" class="small-strip" />
        </div>
        <button 
          class="favorite-btn"
          :class="{ 'is-favorited': favoriteStatus }"
          @click="toggleFavorite"
        >
          <svg v-if="favoriteStatus" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
          </svg>
          <svg v-else width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
          </svg>
          <span>{{ favoriteStatus ? 'Favorited' : 'Add to Favorites' }}</span>
        </button>
      </section>

      <!-- Colors Section -->
      <section class="colors-section">
        <h2 class="section-title">Colors</h2>
        <div class="colors-grid">
          <ColorSwatch
            v-for="(color, index) in palette.colors"
            :key="index"
            :color="color"
            :index="index"
            :total="palette.colors.length"
          />
        </div>
      </section>

      <!-- Recommended / Avoid Section -->
      <section class="recommend-avoid-section">
        <div class="recommend-card">
          <h3 class="card-title recommended">Recommended For</h3>
          <p class="card-desc">Best suited for these figure contexts.</p>
          <div class="chips-container">
            <span
              v-for="useCase in palette.use_case"
              :key="useCase"
              class="chip recommended"
            >
              {{ useCase }}
            </span>
          </div>
        </div>
        <div class="avoid-card">
          <h3 class="card-title avoid">Avoid For</h3>
          <p class="card-desc">May be less effective in these scenarios.</p>
          <div v-if="palette.avoid_case && palette.avoid_case.length > 0" class="chips-container">
            <span
              v-for="avoid in palette.avoid_case"
              :key="avoid"
              class="chip avoid"
            >
              {{ avoid }}
            </span>
          </div>
          <p v-else class="no-data">No avoid case provided.</p>
        </div>
      </section>

      <!-- Metadata Section -->
      <section class="metadata-section">
        <h2 class="section-title">Metadata</h2>
        <div class="metadata-grid">
          <div class="metadata-item">
            <span class="metadata-label">Journal Style</span>
            <div class="chips-container">
              <span v-for="style in palette.journal_style" :key="style" class="chip">{{ style }}</span>
            </div>
          </div>
          <div class="metadata-item">
            <span class="metadata-label">Chart Type</span>
            <div class="chips-container">
              <span v-for="type in palette.chart_type" :key="type" class="chip">{{ type }}</span>
            </div>
          </div>
          <div class="metadata-item">
            <span class="metadata-label">Discipline</span>
            <div class="chips-container">
              <span v-for="discipline in palette.discipline" :key="discipline" class="chip">{{ discipline }}</span>
            </div>
          </div>
          <div class="metadata-item">
            <span class="metadata-label">Tags</span>
            <div class="chips-container">
              <span v-for="tag in palette.tags" :key="tag" class="chip">{{ tag }}</span>
            </div>
          </div>
          <div class="metadata-item">
            <span class="metadata-label">Version</span>
            <div class="chips-container">
              <span class="chip">{{ versionLabel }}</span>
            </div>
          </div>
        </div>
        <p v-if="dateFooter" class="date-footer">{{ dateFooter }}</p>
      </section>

      <!-- Copy Code Section -->
      <section class="code-section">
        <h2 class="section-title">Copy Code</h2>
        <CodeTabs :items="codeTabsItems" />
      </section>
    </div>

    <div v-else class="not-found">
      <h1>Palette Not Found</h1>
      <p>The palette you're looking for doesn't exist.</p>
      <router-link to="/palettes" class="btn btn-primary">Back to Palettes</router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getPaletteBySlug } from '@/lib/palette'
import { toHexArray, toPythonList, toMatplotlibPalette, toSeabornPalette, toRVector, toGgplotScale, toCssVariables } from '@/lib/codegen'
import PalettePreview from '@/components/PalettePreview.vue'
import PaletteChartPreview from '@/components/palettes/PaletteChartPreview.vue'
import ColorSwatch from '@/components/ColorSwatch.vue'
import CodeTabs from '@/components/CodeTabs.vue'
import { useFavorites } from '@/composables/useFavorites'

const route = useRoute()
const router = useRouter()
const { isFavorited, addFavorite, removeFavorite, loadFavorites, favoritePaletteIds } = useFavorites()

const palette = computed(() => {
  const slug = route.params.slug as string
  return getPaletteBySlug(slug)
})

const favoriteStatus = computed(() => {
  return palette.value ? favoritePaletteIds.value.includes(palette.value.id) : false
})

async function toggleFavorite() {
  if (!palette.value) return
  
  if (favoriteStatus.value) {
    await removeFavorite(palette.value.id)
  } else {
    const success = await addFavorite(palette.value.id)
    if (!success) {
      router.push('/login')
    }
  }
}

onMounted(() => {
  loadFavorites()
})

// Colors as string array for new PaletteChartPreview
// Priority: exported_core_colors (new) > colors (legacy fallback)
const paletteColors = computed<string[]>(() => {
  if (!palette.value) return []
  
  // Try new exported_core_colors first
  if (palette.value.exported_core_colors && palette.value.exported_core_colors.length > 0) {
    return palette.value.exported_core_colors.map((c) => c.hex)
  }
  // Fallback to legacy colors
  return palette.value.colors.map((c) => (typeof c === 'string' ? c : c.hex))
})

// Palette summary text
const paletteSummary = computed(() => {
  if (!palette.value) return ''
  const colorCount = palette.value.color_count
  const journalStyle = palette.value.journal_style.length > 0
    ? palette.value.journal_style.map(s => s.toUpperCase()).join(', ')
    : 'General'
  const chartTypes = palette.value.chart_type.length > 0
    ? palette.value.chart_type.slice(0, 3).join(', ')
    : 'line'
  return `${colorCount} colors · ${journalStyle} · Recommended for ${chartTypes}`
})

const versionLabel = computed(() => {
  // Extract version from tags or use default
  const versionTag = palette.value?.tags.find(tag => tag.startsWith('v'))
  return versionTag || 'v1.0.0'
})

const hexArrayCode = computed(() => {
  if (!palette.value) return ''
  return toHexArray(palette.value.colors)
})

const pythonCode = computed(() => {
  if (!palette.value) return ''
  return toPythonList(palette.value.colors)
})

const matplotlibCode = computed(() => {
  if (!palette.value) return ''
  return toMatplotlibPalette(palette.value.colors)
})

const seabornCode = computed(() => {
  if (!palette.value) return ''
  return toSeabornPalette(palette.value.colors)
})

const rCode = computed(() => {
  if (!palette.value) return ''
  return toRVector(palette.value.colors)
})

const ggplotCode = computed(() => {
  if (!palette.value) return ''
  return toGgplotScale(palette.value.colors)
})

const cssCode = computed(() => {
  if (!palette.value) return ''
  return toCssVariables(palette.value.colors)
})

const codeTabsItems = computed(() => [
  { label: 'HEX', code: hexArrayCode.value },
  { label: 'Python', code: pythonCode.value },
  { label: 'Matplotlib', code: matplotlibCode.value },
  { label: 'Seaborn', code: seabornCode.value },
  { label: 'R', code: rCode.value },
  { label: 'ggplot2', code: ggplotCode.value },
  { label: 'CSS', code: cssCode.value }
])

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  } catch {
    return dateStr
  }
}

// Date footer for metadata section
const dateFooter = computed(() => {
  if (!palette.value) return ''
  const created = palette.value.created_at ? formatDate(palette.value.created_at) : null
  const updated = palette.value.updated_at ? formatDate(palette.value.updated_at) : null
  if (created && updated) {
    return `Created ${created} · Updated ${updated}`
  }
  if (created) {
    return `Created ${created}`
  }
  return ''
})
</script>

<style scoped>
.palette-detail-view {
  padding: 2rem 0;
  max-width: 1040px;
  margin: 0 auto;
}

.back-link {
  display: inline-block;
  margin-bottom: 1.5rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: #64748b;
  text-decoration: none;
  transition: color 0.15s;
}

.back-link:hover {
  color: #2563eb;
}

/* Hero Card */
.hero-card {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  padding: 2rem;
  background: #fff;
  border-radius: 20px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  margin-bottom: 2.5rem;
}

.hero-header {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.palette-name {
  font-size: 1.75rem;
  font-weight: 700;
  color: #111827;
}

.palette-summary {
  font-size: 0.875rem;
  color: #6b7280;
}

.hero-chart-preview {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  align-items: stretch;
}

.small-strip {
  height: 8px !important;
  border-radius: 4px !important;
}

.favorite-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1rem;
  background: white;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  color: #666;
  transition: all 0.2s;
  align-self: flex-start;
}

.favorite-btn:hover {
  border-color: #e74c3c;
  color: #e74c3c;
}

.favorite-btn.is-favorited {
  background: #fef2f2;
  border-color: #e74c3c;
  color: #e74c3c;
}

/* Sections */
.section-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: #374151;
  margin-bottom: 1rem;
}

/* Colors Section */
.colors-section {
  margin-bottom: 2.5rem;
}

.colors-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}

/* Recommended / Avoid Section */
.recommend-avoid-section {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
  margin-bottom: 2.5rem;
}

.recommend-card,
.avoid-card {
  padding: 1.5rem;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}

.card-title {
  font-size: 0.8125rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.5rem;
}

.card-desc {
  font-size: 0.8125rem;
  color: #64748b;
  margin-bottom: 0.875rem;
  line-height: 1.4;
}

.card-title.recommended {
  color: #059669;
}

.card-title.avoid {
  color: #dc2626;
}

.no-data {
  font-size: 0.875rem;
  color: #9ca3af;
  font-style: italic;
}

/* Metadata Section */
.metadata-section {
  margin-bottom: 2.5rem;
}

.metadata-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1.25rem;
}

.date-footer {
  margin-top: 1rem;
  font-size: 0.75rem;
  color: #64748b;
  text-align: right;
}

.metadata-item {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1.25rem;
  background: #fff;
  border-radius: 14px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}

.metadata-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* Chips */
.chips-container {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.chip {
  display: inline-block;
  padding: 0.3125rem 0.625rem;
  font-size: 0.75rem;
  font-weight: 500;
  border-radius: 9999px;
  background: #eff6ff;
  color: #2563eb;
}

.chip.recommended {
  background: #ecfdf5;
  color: #059669;
}

.chip.avoid {
  background: #fef2f2;
  color: #dc2626;
}

/* Code Section */
.code-section {
  margin-bottom: 2rem;
}

/* Not Found */
.not-found {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 4rem 2rem;
  background: #fff;
  border-radius: 12px;
  text-align: center;
}

.not-found h1 {
  font-size: 1.5rem;
  font-weight: 600;
  color: #333;
}

.not-found p {
  color: #666;
}

.btn {
  padding: 0.625rem 1.25rem;
  font-size: 0.875rem;
  font-weight: 500;
  border-radius: 8px;
  text-decoration: none;
  transition: background-color 0.15s;
}

.btn-primary {
  background-color: #2563eb;
  color: #fff;
}

.btn-primary:hover {
  background-color: #1d4ed8;
}

@media (max-width: 768px) {
  .recommend-avoid-section {
    grid-template-columns: 1fr;
  }

  .metadata-grid {
    grid-template-columns: 1fr;
  }
}
</style>
