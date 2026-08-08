<template>
  <div class="preview-adapter" v-html="svgMarkup"></div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { renderPalettePreview } from '@/lib/renderers'
import type { CanonicalPalette, PalettePreviewCase } from '@/types/palette'

interface Props {
  colors: string[]
  seed?: string
}

const props = withDefaults(defineProps<Props>(), {
  colors: () => [],
  seed: 'default'
})

const palette = computed<CanonicalPalette>(() => {
  const colors = normalizedColors.value
  return {
    id: 'boxplot-preview-palette',
    slug: 'boxplot-preview-palette',
    name: 'Boxplot preview palette',
    status: 'published',
    colors,
    color_count: colors.length,
    type: 'categorical',
    chart_types: ['boxplot_jitter'],
    journal_style: [],
    disciplines: [],
    use_cases: [],
    avoid_cases: [],
    tags: [],
    created_at: '',
    updated_at: '',
    primary_preview_case: null,
    preview_cases: []
  }
})

const previewCase = computed<PalettePreviewCase>(() => {
  const publicationLabels = ['Control', 'Low dose', 'High dose']
  const groups = normalizedColors.value.slice(0, 5).map((color, index) => ({
    key: `group_${index + 1}`,
    label: publicationLabels[index] ?? `Group ${index + 1}`,
    color: { source: 'palette' as const, color_id: color.id }
  }))

  return {
    id: 'boxplot-preview-case',
    palette_id: palette.value.id,
    chart_type: 'boxplot_jitter',
    template_id: 'boxplot_jitter_v1',
    template_version: 1,
    schema_version: 1,
    color_roles: {
      groups,
      elements: {
        axis: { source: 'theme', token: 'foreground' },
        grid: { source: 'theme', token: 'grid' },
        text: { source: 'theme', token: 'muted_foreground' },
        jitter_point: { source: 'theme', token: 'muted_foreground', opacity: 0.58 },
        median_line: { source: 'theme', token: 'foreground' },
        whisker: { source: 'theme', token: 'foreground' },
        outline: { source: 'theme', token: 'foreground' },
        background: { source: 'theme', token: 'background' }
      }
    },
    preview_config: {
      jitter_density: 'medium',
      show_outliers: true,
      y_axis_label: 'Relative protein expression (a.u.)'
    },
    seed_strategy: 'fixed',
    seed_value: hashSeed(props.seed),
    is_primary: true,
    status: 'published'
  }
})

const svgMarkup = computed(() => {
  const result = renderPalettePreview(palette.value, previewCase.value)
  return result.ok ? result.markup : ''
})

const normalizedColors = computed(() => {
  const input = props.colors.length > 0 ? props.colors : ['#4E79A7', '#F28E2B', '#59A14F']
  return input.map((hex, index) => ({
    id: `preview-color-${index + 1}`,
    hex,
    rgb: hexToRgb(hex),
    order: index
  }))
})

function hashSeed(seed: string): number {
  return Math.abs([...seed].reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0, 0))
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.slice(1) : '000000'
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16)
  ]
}
</script>

<style scoped>
.preview-adapter {
  width: 100%;
  height: 100%;
}

.preview-adapter :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
