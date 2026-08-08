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
    id: 'heatmap-preview-palette',
    slug: 'heatmap-preview-palette',
    name: 'Heatmap preview palette',
    status: 'published',
    colors,
    color_count: colors.length,
    type: 'diverging',
    chart_types: ['heatmap_annotated'],
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
  const colors = normalizedColors.value
  const scaleColors = colors.length >= 3 ? colors.slice(0, 3) : colors
  const annotations = colors.slice(3, 5).map((color, index) => ({
    key: `annotation_${index + 1}`,
    label: `A${index + 1}`,
    color: { source: 'palette' as const, color_id: color.id }
  }))

  return {
    id: 'heatmap-preview-case',
    palette_id: palette.value.id,
    chart_type: 'heatmap_annotated',
    template_id: 'heatmap_annotated_v1',
    template_version: 1,
    schema_version: 1,
    color_roles: {
      scale: {
        type: scaleColors.length >= 3 ? 'diverging' : 'sequential',
        stops: scaleColors.map((color, index) => ({
          position: scaleColors.length === 1 ? 0 : index / (scaleColors.length - 1),
          color: { source: 'palette' as const, color_id: color.id }
        }))
      },
      annotations,
      elements: {
        text: { source: 'theme', token: 'muted_foreground' },
        border: { source: 'theme', token: 'foreground' },
        grid: { source: 'theme', token: 'grid' },
        background: { source: 'theme', token: 'background' }
      }
    },
    preview_config: {
      rows: 6,
      columns: 6,
      cluster_rows: true,
      cluster_columns: true,
      show_row_labels: true,
      show_column_labels: true,
      show_values: false,
      data_pattern: 'mixed'
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
  const input = props.colors.length > 0 ? [...props.colors] : ['#3F2EA8', '#FFFFFF', '#C43B2F']
  if (input.length === 1) {
    input.push('#FFFFFF')
  }
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
