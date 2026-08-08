<template>
  <div class="favorites-view">
    <header class="page-header">
      <h1>My Favorites</h1>
      <p class="subtitle">Your saved color palettes</p>
    </header>

    <div v-if="pageLoading || isLoading" class="loading-state">
      <p>Loading favorites...</p>
    </div>

    <div v-else-if="error" class="error-state">
      <p>{{ error }}</p>
    </div>

    <div v-else-if="favoritePalettes.length">
      <div class="results-info">
        <span class="results-count">
          Showing {{ paginationStart }}-{{ paginationEnd }} of {{ favoritePalettes.length }} favorites
        </span>
      </div>

      <div class="palettes-grid">
        <PaletteCard
          v-for="palette in paginatedFavoritePalettes"
          :key="palette.id"
          :palette="palette"
          :is-favorited="true"
          @toggle-favorite="handleToggleFavorite"
        />
      </div>

      <PaginationControls
        :current-page="currentPage"
        :total-pages="totalPages"
        aria-label="Favorite palette pagination"
        @go="goToPage"
      />
    </div>

    <div v-else class="empty-state">
      <div class="empty-icon">❤️</div>
      <h2>No favorites yet</h2>
      <p>Browse palettes and click the heart icon to save them here.</p>
      <router-link to="/palettes" class="btn-primary">Browse Palettes</router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, computed, ref, watch } from 'vue'
import { useFavorites } from '@/composables/useFavorites'
import PaletteCard from '@/components/PaletteCard.vue'
import PaginationControls from '@/components/common/PaginationControls.vue'
import { loadPalettes } from '@/lib/palette'
import type { Palette } from '@/types/palette'

const { loadFavorites, removeFavorite, favoritePaletteIds, isLoading, error } = useFavorites()
const palettes = ref<Palette[]>([])
const pageLoading = ref(true)
const currentPage = ref(1)
const pageSize = 20

const favoritePalettes = computed(() =>
  palettes.value.filter(p => favoritePaletteIds.value.includes(p.id))
)
const totalPages = computed(() => Math.max(1, Math.ceil(favoritePalettes.value.length / pageSize)))
const paginationStart = computed(() => favoritePalettes.value.length === 0 ? 0 : (currentPage.value - 1) * pageSize + 1)
const paginationEnd = computed(() => Math.min(currentPage.value * pageSize, favoritePalettes.value.length))
const paginatedFavoritePalettes = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return favoritePalettes.value.slice(start, start + pageSize)
})

async function handleToggleFavorite(paletteId: string) {
  await removeFavorite(paletteId)
}

function goToPage(page: number) {
  if (page < 1 || page > totalPages.value || page === currentPage.value) {
    return
  }
  currentPage.value = page
}

watch(
  () => favoritePalettes.value.length,
  () => {
    currentPage.value = Math.min(currentPage.value, totalPages.value)
  }
)

onMounted(async () => {
  pageLoading.value = true
  try {
    const [loadedPalettes] = await Promise.all([
      loadPalettes(),
      loadFavorites(),
    ])
    palettes.value = loadedPalettes
  } finally {
    pageLoading.value = false
  }
})
</script>

<style scoped>
.favorites-view {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
}

.page-header {
  margin-bottom: 2rem;
}

.page-header h1 {
  font-size: 2rem;
  margin-bottom: 0.5rem;
}

.subtitle {
  color: #666;
}

.palettes-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 1.5rem;
}

.results-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.results-count {
  font-size: 0.875rem;
  color: #666;
}

.empty-state {
  text-align: center;
  padding: 4rem 2rem;
}

.empty-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.empty-state h2 {
  margin-bottom: 0.5rem;
}

.empty-state p {
  color: #666;
  margin-bottom: 1.5rem;
}

.loading-state,
.error-state {
  text-align: center;
  padding: 3rem 2rem;
  color: #666;
}

.error-state {
  color: #b91c1c;
}

.btn-primary {
  display: inline-block;
  background: #4A90A4;
  color: white;
  padding: 0.75rem 1.5rem;
  border-radius: 6px;
  text-decoration: none;
}

.btn-primary:hover {
  background: #3d7a8c;
}
</style>
