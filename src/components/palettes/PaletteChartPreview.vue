<template>
  <div
    class="palette-chart-preview"
    :class="`size-${size}`"
    :data-preview-state="previewState"
    :role="previewAccessibleLabel ? 'img' : undefined"
    :aria-label="previewAccessibleLabel || undefined"
  >
    <div v-if="svgMarkup" class="svg-frame" v-html="svgMarkup"></div>
    <div v-else-if="fallbackColors.length > 0" class="fallback-frame" aria-hidden="true">
      <div class="fallback-plot">
        <span
          v-for="(color, index) in fallbackColors"
          :key="`${color}-${index}`"
          class="fallback-swatch"
          :style="{ backgroundColor: color }"
        ></span>
      </div>
      <div class="fallback-strip">
        <span
          v-for="(color, index) in fallbackColors"
          :key="`strip-${color}-${index}`"
          :style="{ backgroundColor: color }"
        ></span>
      </div>
    </div>
    <div v-else class="placeholder-frame" aria-hidden="true">
      <span></span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  createPaletteChartPreviewModel,
  selectPalettePreviewCase
} from './PaletteChartPreview.logic'
import type { CanonicalPalette, PalettePreviewCase } from '@/types/palette'

interface Props {
  palette: CanonicalPalette
  previewCase?: PalettePreviewCase | null
  size?: 'card' | 'hero'
  publicOnly?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  previewCase: undefined,
  size: 'card',
  publicOnly: true
})

const selectedPreviewCase = computed(() =>
  selectPalettePreviewCase(props.palette, props.previewCase, props.previewCase !== undefined, props.publicOnly)
)

const previewModel = computed(() =>
  createPaletteChartPreviewModel(props.palette, selectedPreviewCase.value)
)

const svgMarkup = computed(() => {
  // This markup is produced only by internal deterministic SVG renderers.
  // Arbitrary SVG/HTML is never accepted through component props.
  return previewModel.value.svgMarkup
})

const previewState = computed(() => previewModel.value.state)
const fallbackColors = computed(() => previewModel.value.fallbackColors)
const previewAccessibleLabel = computed(() => previewModel.value.accessibleLabel)
</script>

<style scoped>
.palette-chart-preview {
  width: 100%;
  overflow: hidden;
  box-sizing: border-box;
  background: #fff;
  border: 1px solid var(--fc-line-soft);
}

.size-card {
  height: 160px;
  border-radius: var(--radius-md);
}

.size-hero {
  min-height: 240px;
  aspect-ratio: 16 / 7;
  border-radius: var(--fc-radius-card);
}

.svg-frame,
.fallback-frame {
  width: 100%;
  height: 100%;
}

.svg-frame {
  display: flex;
  align-items: center;
  justify-content: center;
}

.svg-frame :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.fallback-frame {
  display: grid;
  grid-template-rows: 1fr auto;
  gap: 0.75rem;
  padding: 1rem;
}

.fallback-plot {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(22px, 1fr));
  align-items: end;
  gap: 0.5rem;
  min-height: 0;
}

.fallback-swatch {
  display: block;
  min-height: 42%;
  border-radius: 6px 6px 3px 3px;
  box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.08);
}

.fallback-swatch:nth-child(2n) {
  min-height: 68%;
}

.fallback-swatch:nth-child(3n) {
  min-height: 54%;
}

.fallback-swatch:nth-child(4n) {
  min-height: 82%;
}

.fallback-strip {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: minmax(0, 1fr);
  height: 12px;
  overflow: hidden;
  border-radius: 999px;
  box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.08);
}

.fallback-strip span {
  min-width: 0;
}

.size-hero .fallback-frame {
  padding: 1.5rem;
}

.size-hero .fallback-plot {
  gap: 0.75rem;
}

.placeholder-frame {
  display: grid;
  width: 100%;
  height: 100%;
  place-items: center;
  background: #fff;
}

.placeholder-frame span {
  width: min(46%, 10rem);
  height: 0.75rem;
  border-radius: 999px;
  background: #e5e7eb;
}
</style>
