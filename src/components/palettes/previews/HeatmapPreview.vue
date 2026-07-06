<template>
  <svg viewBox="0 0 320 160" preserveAspectRatio="xMidYMid meet" class="heatmap-preview">
    <!-- Background -->
    <rect x="0" y="0" width="320" height="160" fill="#FAFAFB" />
    
    <!-- Heatmap grid cells -->
    <rect
      v-for="(cell, i) in heatmapCells"
      :key="i"
      :x="cell.x"
      :y="cell.y"
      :width="cellSize"
      :height="cellSize"
      :fill="cell.color"
      rx="1.5"
    />
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  colors: string[]
  seed?: string
}

const props = withDefaults(defineProps<Props>(), {
  colors: () => [],
  seed: 'default'
})

interface Cell {
  x: number
  y: number
  color: string
}

const cellSize = 36
const cellGap = 4
const gridCols = 6
const gridRows = 3
const startX = 28
const startY = 24

const heatmapCells = computed((): Cell[] => {
  const cells: Cell[] = []
  const colorCount = props.colors.length
  
  for (let row = 0; row < gridRows; row++) {
    for (let col = 0; col < gridCols; col++) {
      const colorIdx = (row * gridCols + col) % Math.max(colorCount, 1)
      cells.push({
        x: startX + col * (cellSize + cellGap),
        y: startY + row * (cellSize + cellGap),
        color: props.colors[colorIdx] || '#6B7280'
      })
    }
  }
  
  return cells
})
</script>

<style scoped>
.heatmap-preview {
  width: 100%;
  height: 100%;
}
</style>