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
      v-model:expanded="filtersExpanded"
    />

    <div v-if="isLoading" class="loading-state" aria-label="Loading palettes">
      <div class="results-info">
        <span class="results-count skeleton-line short"></span>
      </div>
      <div class="palettes-grid" aria-hidden="true">
        <div
          v-for="index in loadingSkeletonCount"
          :key="index"
          class="palette-card-skeleton"
        >
          <div class="skeleton-line title"></div>
          <div class="skeleton-preview"></div>
          <div class="skeleton-strip"></div>
          <div class="skeleton-line meta"></div>
          <div class="skeleton-tags">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      </div>
    </div>

    <div v-else>
      <div class="results-info">
        <span class="results-count">
          Showing {{ paginationStart }}-{{ paginationEnd }} of {{ totalPalettes }} palettes
        </span>
      </div>

      <div v-if="loadError" class="error-state">
        <p>Could not load palettes.</p>
        <button class="retry-btn" :disabled="isPageLoading" @click="loadCurrentPage">Retry</button>
      </div>

      <div v-else-if="palettes.length > 0" class="palettes-grid">
        <PaletteCard
          v-for="palette in palettes"
          :key="palette.id"
          :palette="palette"
          :is-favorited="isFavorited(palette.id)"
          :detail-query="route.query"
          @toggle-favorite="handleToggleFavorite"
        />
      </div>
      <div v-else class="empty-state">
        <p>No palettes found. Try another keyword or filter.</p>
      </div>

      <PaginationControls
        :current-page="currentPage"
        :total-pages="totalPages"
        :disabled="isPageLoading"
        aria-label="Palette pagination"
        @go="goToPage"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { loadPalettePage } from '@/lib/palette'
import type { Palette } from '@/types/palette'
import PaletteCard from '@/components/PaletteCard.vue'
import PaletteFilterPanel from '@/components/PaletteFilterPanel.vue'
import PaginationControls from '@/components/common/PaginationControls.vue'
import { useFavorites } from '@/composables/useFavorites'
import { createPalettesBrowseQuery, readPalettesBrowseState } from './palettesBrowseState'

const router = useRouter()
const route = useRoute()
const { isFavorited, addFavorite, removeFavorite, loadFavorites } = useFavorites()

const initialBrowseState = readPalettesBrowseState(route.query)
const searchQuery = ref(initialBrowseState.search)
const selectedJournalStyle = ref(initialBrowseState.journalStyle)
const selectedChartType = ref(initialBrowseState.chartType)
const selectedColorCount = ref<number | ''>(initialBrowseState.colorCount)
const selectedUseCase = ref(initialBrowseState.useCase)
const selectedDiscipline = ref(initialBrowseState.discipline)
const selectedTag = ref(initialBrowseState.tag)
const filtersExpanded = ref(initialBrowseState.filtersExpanded)
const isLoading = ref(true)
const isPageLoading = ref(false)
const palettes = ref<Palette[]>([])
const totalPalettes = ref(0)
const currentPage = ref(initialBrowseState.page)
const loadError = ref<string | null>(null)
const pageSize = 20
const loadingSkeletonCount = 6
let requestSequence = 0

const totalPages = computed(() => Math.max(1, Math.ceil(totalPalettes.value / pageSize)))
const paginationStart = computed(() => totalPalettes.value === 0 ? 0 : (currentPage.value - 1) * pageSize + 1)
const paginationEnd = computed(() => Math.min(currentPage.value * pageSize, totalPalettes.value))

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
  await loadCurrentPage()
  isLoading.value = false
})

watch(
  [
    searchQuery,
    selectedJournalStyle,
    selectedChartType,
    selectedColorCount,
    selectedUseCase,
    selectedDiscipline,
    selectedTag
  ],
  async () => {
    currentPage.value = 1
    await replaceBrowseQuery()
    await loadCurrentPage()
  }
)

watch(filtersExpanded, () => {
  void replaceBrowseQuery()
})

async function goToPage(page: number) {
  if (page < 1 || page > totalPages.value || page === currentPage.value) {
    return
  }
  currentPage.value = page
  await replaceBrowseQuery()
  await loadCurrentPage()
}

async function replaceBrowseQuery() {
  await router.replace({
    name: 'palettes',
    query: createPalettesBrowseQuery({
      search: searchQuery.value,
      journalStyle: selectedJournalStyle.value,
      chartType: selectedChartType.value,
      colorCount: selectedColorCount.value,
      useCase: selectedUseCase.value,
      discipline: selectedDiscipline.value,
      tag: selectedTag.value,
      page: currentPage.value,
      filtersExpanded: filtersExpanded.value
    })
  })
}

async function loadCurrentPage() {
  const requestId = requestSequence + 1
  requestSequence = requestId
  isPageLoading.value = true
  const result = await loadPalettePage({
    page: currentPage.value,
    pageSize,
    search: searchQuery.value,
    journalStyle: selectedJournalStyle.value,
    chartType: selectedChartType.value,
    colorCount: selectedColorCount.value,
    useCase: selectedUseCase.value,
    discipline: selectedDiscipline.value,
    tag: selectedTag.value
  })
  if (requestId !== requestSequence) {
    return
  }
  palettes.value = result.palettes
  totalPalettes.value = result.total
  loadError.value = result.error
  currentPage.value = Math.min(result.page, Math.max(1, result.totalPages))
  await replaceBrowseQuery()
  isPageLoading.value = false
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

.error-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 3rem;
  text-align: center;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.error-state p {
  color: #b42318;
}

.retry-btn {
  height: 2.25rem;
  padding: 0 0.875rem;
  border: 1px solid #d8e1ec;
  border-radius: 8px;
  background: #fff;
  color: #334155;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
}

.retry-btn:disabled {
  color: #94a3b8;
  cursor: not-allowed;
  background: #f8fafc;
}

.loading-state {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.palette-card-skeleton {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1.25rem;
  min-height: 306px;
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
}

.skeleton-preview {
  height: 160px;
  margin-top: 0.5rem;
  border-radius: var(--radius-md);
  background: #eef2f7;
}

.skeleton-strip {
  height: 12px;
  margin-top: 0.75rem;
  border-radius: 999px;
  background: #e5eaf1;
}

.skeleton-line,
.skeleton-tags span {
  display: block;
  border-radius: 999px;
  background: #e5eaf1;
}

.skeleton-line.title {
  width: 68%;
  height: 1rem;
}

.skeleton-line.meta {
  width: 58%;
  height: 0.8125rem;
}

.skeleton-line.short {
  width: 9rem;
  height: 0.875rem;
}

.skeleton-tags {
  display: flex;
  gap: 0.375rem;
}

.skeleton-tags span {
  width: 3.5rem;
  height: 1.25rem;
}
</style>
