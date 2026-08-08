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
    id: 'line-preview-palette',
    slug: 'line-preview-palette',
    name: 'Line preview palette',
    status: 'published',
    colors,
    color_count: colors.length,
    type: 'categorical',
    chart_types: ['line_multiseries'],
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
  const series = normalizedColors.value.slice(0, 5).map((color, index) => ({
    key: `series_${index + 1}`,
    label: `Series ${index + 1}`,
    line: { source: 'palette' as const, color_id: color.id },
    marker: { source: 'palette' as const, color_id: color.id },
    confidence_band: index < 2 ? { source: 'palette' as const, color_id: color.id, opacity: 0.16 } : undefined
  }))

  return {
    id: 'line-preview-case',
    palette_id: palette.value.id,
    chart_type: 'line_multiseries',
    template_id: 'line_multiseries_v1',
    template_version: 1,
    schema_version: 1,
    color_roles: {
      series,
      elements: {
        axis: { source: 'theme', token: 'foreground' },
        grid: { source: 'theme', token: 'grid' },
        text: { source: 'theme', token: 'muted_foreground' },
        reference_line: { source: 'theme', token: 'muted_foreground' },
        background: { source: 'theme', token: 'background' }
      }
    },
    preview_config: {
      point_count: 8,
      curve_shape: 'mixed'
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
