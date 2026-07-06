<template>
  <div 
    class="chart-preview-container"
    :class="[`variant-${variant}`, `chart-type-${resolvedChartType}`]"
    :style="containerStyle"
  >
    <component 
      :is="previewComponent" 
      :colors="colors"
      :seed="seed"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, type Component } from 'vue'
import LinePreview from './previews/LinePreview.vue'
import BarPreview from './previews/BarPreview.vue'
import ScatterPreview from './previews/ScatterPreview.vue'
import HeatmapPreview from './previews/HeatmapPreview.vue'
import SurvivalPreview from './previews/SurvivalPreview.vue'
import AreaPreview from './previews/AreaPreview.vue'
import HeatmapAnnotatedPreview from './previews/HeatmapAnnotatedPreview.vue'
import BarErrorPreview from './previews/BarErrorPreview.vue'
import BoxplotJitterPreview from './previews/BoxplotJitterPreview.vue'
import LineMultiseriesPreview from './previews/LineMultiseriesPreview.vue'

interface Props {
  /** Array of hex color strings */
  colors: string[]
  /** Array of chart types to choose from (fallback) */
  chartTypes?: string[]
  /** chart_family for Phase 1 preview selection (takes priority) */
  chartFamily?: string
  /** Height in pixels */
  height?: number
  /** Visual variant */
  variant?: 'card' | 'hero'
  /** Seed string for stable random generation */
  seed?: string
}

const props = withDefaults(defineProps<Props>(), {
  colors: () => [],
  chartTypes: () => [],
  chartFamily: undefined,
  height: 160,
  variant: 'card',
  seed: 'default'
})

// Map chartType strings to preview components
const CHART_TYPE_COMPONENT_MAP: Record<string, Component> = {
  heatmap: HeatmapPreview,
  heatmap_annotated: HeatmapAnnotatedPreview,
  bar_error: BarErrorPreview,
  boxplot_jitter: BoxplotJitterPreview,
  line_multiseries: LineMultiseriesPreview,
  scatter: ScatterPreview,
  pca: ScatterPreview,
  umap: ScatterPreview,
  survival_curve: SurvivalPreview,
  line: LinePreview,
  boxplot: BarPreview,
  bar: BarPreview,
  area: AreaPreview
}

// Default fallback
const DEFAULT_COMPONENT = LinePreview

// Normalize chart type string
function normalizeChartType(type: string): string {
  return type.toLowerCase().replace(/[-_]/g, '_').trim()
}

// Determine which chart type to display
// Priority: chartFamily (Phase 1) > chartTypes (legacy fallback)
const resolvedChartType = computed<string>(() => {
  // First try chartFamily (Phase 1 - takes priority)
  if (props.chartFamily) {
    const normalized = normalizeChartType(props.chartFamily)
    if (CHART_TYPE_COMPONENT_MAP[normalized]) {
      return normalized
    }
  }
  
  // Fallback to chartTypes array
  if (props.chartTypes.length > 0) {
    // Try to find a matching chart type
    for (const ct of props.chartTypes) {
      const normalized = normalizeChartType(ct)
      if (CHART_TYPE_COMPONENT_MAP[normalized]) {
        return normalized
      }
    }
    // If no exact match, try partial match for scatter-related types
    for (const ct of props.chartTypes) {
      const normalized = normalizeChartType(ct)
      if (normalized.includes('scatter') || normalized.includes('pca') || normalized.includes('umap')) {
        return 'scatter'
      }
    }
  }
  return 'line'
})

// Get the preview component
const previewComponent = computed(() => {
  return CHART_TYPE_COMPONENT_MAP[resolvedChartType.value] || DEFAULT_COMPONENT
})

// Container style
const containerStyle = computed(() => ({
  height: `${props.height}px`,
  borderRadius: props.variant === 'hero' ? '16px' : '14px'
}))
</script>

<style scoped>
.chart-preview-container {
  width: 100%;
  background: #FAFAFB;
  border: 1px solid #EEF0F4;
  overflow: hidden;
  box-sizing: border-box;
}

.chart-preview-container :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
}
</style>