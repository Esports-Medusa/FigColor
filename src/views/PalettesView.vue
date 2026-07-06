<template>
  <div class="palettes-view">
    <h1 class="page-title">Browse Palettes</h1>
    
    <PaletteFilterPanel
      v-model:searchQuery="searchQuery"
      v-model:selectedJournalStyle="selectedJournalStyle"
      v-model:selectedChartType="selectedChartType"
      v-model:selectedColorCount="selectedColorCount"
      v-model:selectedUseCase="selectedUseCase"
      v-model:selectedDiscipline="selectedDiscipline"
      v-model:selectedTag="selectedTag"
    />

    <div v-if="isLoading" class="loading-state">
      <p>Loading palettes...</p>
    </div>

    <div v-else>
      <div class="results-info">
        <span class="results-count">Showing {{ filteredPalettes.length }} palettes</span>
      </div>

      <div v-if="filteredPalettes.length > 0" class="palettes-grid">
        <PaletteCard
          v-for="palette in filteredPalettes"
          :key="palette.id"
          :palette="palette"
          :preview-chart-type="getPrimaryChartType(palette, selectedChartType)"
          :is-favorited="isFavorited(palette.id)"
          @toggle-favorite="handleToggleFavorite"
        />
      </div>
      <div v-else class="empty-state">
        <p>No palettes found. Try another keyword or filter.</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { loadPalettes, getAllPalettes, normalizeText, paletteToSearchText } from '@/lib/palette'
import { getPrimaryChartType } from '@/lib/chartPreview'
import type { Palette } from '@/types/palette'
import PaletteCard from '@/components/PaletteCard.vue'
import PaletteFilterPanel from '@/components/PaletteFilterPanel.vue'
import { useFavorites } from '@/composables/useFavorites'

const router = useRouter()
const { isFavorited, addFavorite, removeFavorite, loadFavorites } = useFavorites()

const searchQuery = ref('')
const selectedJournalStyle = ref('')
const selectedChartType = ref('')
const selectedColorCount = ref<number | ''>('')
const selectedUseCase = ref('')
const selectedDiscipline = ref('')
const selectedTag = ref('')
const isLoading = ref(true)

const filteredPalettes = computed(() => {
  const allPalettes = getAllPalettes()
  console.log('[Browse] all palettes count:', allPalettes.length)
  
  const filtered = allPalettes.filter((palette) => {
    // Search filter
    if (searchQuery.value.trim()) {
      if (!matchesSearch(palette, searchQuery.value.trim())) {
        return false
      }
    }

    // Journal Style filter
    if (selectedJournalStyle.value) {
      if (!palette.journal_style.includes(selectedJournalStyle.value)) {
        return false
      }
    }

    // Chart Type filter
    if (selectedChartType.value) {
      if (!palette.chart_type.includes(selectedChartType.value)) {
        return false
      }
    }

    // Color Count filter
    if (selectedColorCount.value !== '') {
      if (palette.color_count !== selectedColorCount.value) {
        return false
      }
    }

    // Use Case filter
    if (selectedUseCase.value) {
      if (!palette.use_case.includes(selectedUseCase.value)) {
        return false
      }
    }

    // Discipline filter
    if (selectedDiscipline.value) {
      if (!palette.discipline.includes(selectedDiscipline.value)) {
        return false
      }
    }

    // Tags filter
    if (selectedTag.value) {
      if (!palette.tags.includes(selectedTag.value)) {
        return false
      }
    }

    return true
  })

  console.log('[Browse] filtered palettes:', filtered.length)
  return filtered
})

async function handleToggleFavorite(paletteId: string) {
  if (isFavorited(paletteId)) {
    await removeFavorite(paletteId)
  } else {
    const success = await addFavorite(paletteId)
    if (!success) {
      router.push('/login')
    }
  }
}

onMounted(async () => {
  loadFavorites()
  await loadPalettes()
  isLoading.value = false
})

function matchesSearch(palette: Palette, keyword: string): boolean {
  const searchText = paletteToSearchText(palette)
  const normalizedKeyword = normalizeText(keyword)
  return searchText.includes(normalizedKeyword)
}
</script>

<style scoped>
.palettes-view {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding: 2rem 0;
}

.page-title {
  font-size: 1.75rem;
  font-weight: 600;
  color: #333;
}

.results-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.results-count {
  font-size: 0.875rem;
  color: #666;
}

.palettes-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1.5rem;
}

.empty-state {
  padding: 3rem;
  text-align: center;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.empty-state p {
  color: #666;
}
</style>
