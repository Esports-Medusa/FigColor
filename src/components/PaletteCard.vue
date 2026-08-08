<template>
  <div class="palette-card-wrapper">
    <router-link
      :to="{ name: 'palette-detail', params: { slug: palette.slug }, query: detailQuery }"
      class="palette-card"
    >
      <h3 class="palette-name">{{ palette.name }}</h3>
      <div class="chart-preview-wrapper">
        <PaletteChartPreview :palette="palette" size="card" />
      </div>
      <div class="palette-strip-wrapper">
        <PalettePreview :colors="palette.colors" size="sm" />
      </div>
      <div class="palette-meta">
        <span class="color-count">{{ palette.color_count }} colors · {{ palette.journal_style[0] || 'general' }}</span>
        <div class="palette-tags">
          <span v-for="style in palette.journal_style.slice(1)" :key="style" class="tag">{{ style }}</span>
          <span v-for="type in palette.chart_type.slice(0, 3)" :key="type" class="tag">{{ type }}</span>
        </div>
      </div>
    </router-link>
    <button 
      class="favorite-btn"
      :class="{ 'is-favorited': isFavorited }"
      @click.prevent="toggleFavorite"
      :title="isFavorited ? 'Remove from favorites' : 'Add to favorites'"
    >
      <svg v-if="isFavorited" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
      </svg>
      <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
      </svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import type { CanonicalPalette, Palette } from '@/types/palette'
import type { LocationQueryRaw } from 'vue-router'
import PalettePreview from './PalettePreview.vue'
import PaletteChartPreview from './palettes/PaletteChartPreview.vue'

type PaletteCardPalette = CanonicalPalette & Pick<Palette, 'chart_type'>

interface Props {
  palette: PaletteCardPalette
  isFavorited?: boolean
  detailQuery?: LocationQueryRaw
}

interface Emits {
  (e: 'toggleFavorite', paletteId: string): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

function toggleFavorite() {
  emit('toggleFavorite', props.palette.id)
}
</script>

<style scoped>
.palette-card-wrapper {
  position: relative;
}

.palette-card {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1.25rem;
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  text-decoration: none;
  color: inherit;
  transition: box-shadow 0.2s ease, transform 0.2s ease;
}

.palette-card:hover {
  box-shadow: var(--shadow-lg);
  transform: translateY(-3px);
  text-decoration: none;
}

.favorite-btn {
  position: absolute;
  top: 1rem;
  right: 1rem;
  padding: 0.5rem;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(8px);
  border: none;
  border-radius: 50%;
  cursor: pointer;
  color: #999;
  transition: color 0.2s, transform 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

.favorite-btn:hover {
  transform: scale(1.1);
  color: #e74c3c;
}

.favorite-btn.is-favorited {
  color: #e74c3c;
}

.palette-name {
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text);
  margin: 0;
  line-height: 1.4;
}

.palette-meta {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.color-count {
  font-size: 0.8125rem;
  color: var(--color-text-secondary);
}

.palette-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.tag {
  display: inline-block;
  padding: 0.25rem 0.625rem;
  font-size: 0.6875rem;
  font-weight: 500;
  color: var(--color-primary);
  background: rgba(0, 102, 204, 0.08);
  border-radius: var(--radius-sm);
}

.chart-preview-wrapper {
  position: relative;
  height: 160px;
  margin-top: 0.5rem;
  border-radius: var(--radius-md);
  overflow: hidden;
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
}

.palette-strip-wrapper {
  height: 12px;
  margin-top: 0.75rem;
  border-radius: 999px;
  overflow: hidden;
}

.palette-strip-wrapper :deep(.palette-preview) {
  height: 12px;
  min-height: 12px;
  max-height: 12px;
  border-radius: 999px;
  box-shadow: none;
}
</style>
