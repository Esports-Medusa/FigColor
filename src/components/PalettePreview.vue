<template>
  <div
    class="palette-preview"
    :class="`palette-preview--${size}`"
    :style="{ height: sizeMap[size] }"
  >
    <div
      v-for="(color, index) in colors"
      :key="index"
      class="preview-segment"
      :style="{ backgroundColor: typeof color === 'string' ? color : color.hex }"
    >
      <span v-if="size !== 'xs' && size !== 'sm'" class="preview-tooltip">
        {{ typeof color === 'string' ? color : color.hex }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PaletteColor } from '@/types/palette'

type Size = 'xs' | 'sm' | 'md' | 'lg'

withDefaults(defineProps<{
  colors: PaletteColor[] | string[]
  size?: Size
}>(), {
  size: 'md'
})

const sizeMap: Record<Size, string> = {
  xs: '6px',
  sm: '10px',
  md: '28px',
  lg: '56px'
}
</script>

<style scoped>
.palette-preview {
  display: flex;
  width: 100%;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.palette-preview--xs,
.palette-preview--sm {
  box-shadow: none;
  border-radius: 999px;
}

.preview-segment {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: flex 0.2s ease;
}

.palette-preview--md .preview-segment:hover {
  flex: 1.3;
}

.preview-tooltip {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  padding: 0.25rem 0.5rem;
  background-color: rgba(0, 0, 0, 0.75);
  color: #fff;
  font-family: 'SF Mono', Monaco, 'Courier New', monospace;
  font-size: 0.75rem;
  border-radius: 4px;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s;
}

.preview-segment:hover .preview-tooltip {
  opacity: 1;
}
</style>
