<template>
  <svg viewBox="0 0 360 220" preserveAspectRatio="xMidYMid meet" class="heatmap-annotated-preview">
    <!-- Background -->
    <rect x="0" y="0" width="360" height="220" fill="#FAFAFB" />
    
    <!-- Panel label A -->
    <text x="12" y="20" font-size="12" font-weight="600" fill="#6B7280">A</text>
    
    <!-- Heatmap grid -->
    <g transform="translate(30, 35)">
      <rect
        v-for="(cell, i) in heatmapCells"
        :key="i"
        :x="cell.x"
        :y="cell.y"
        :width="cellSize"
        :height="cellSize"
        :fill="cell.color"
        rx="2"
      />
    </g>
    
    <!-- Row annotations (left side) -->
    <g transform="translate(8, 35)">
      <rect
        v-for="(ann, i) in rowAnnotations"
        :key="i"
        :x="0"
        :y="ann.y + cellSize/2 - 4"
        :width="18"
        :height="8"
        :fill="ann.color"
        rx="2"
      />
    </g>
    
    <!-- Column annotations (top) -->
    <g transform="translate(30, 27)">
      <rect
        v-for="(ann, i) in colAnnotations"
        :key="i"
        :x="ann.x + cellSize/2 - 6"
        :y="0"
        :width="12"
        :height="10"
        :fill="ann.color"
        rx="2"
      />
    </g>
    
    <!-- Legend -->
    <g transform="translate(280, 180)">
      <defs>
        <linearGradient id="heatmapLegendGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" :stop-color="heatmapColors[0]" />
          <stop offset="50%" :stop-color="heatmapColors[1]" />
          <stop offset="100%" :stop-color="heatmapColors[2]" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="60" height="8" fill="url(#heatmapLegendGradient)" rx="2" />
      <text x="0" y="20" font-size="8" fill="#6B7280">-2</text>
      <text x="25" y="20" font-size="8" fill="#6B7280" text-anchor="middle">0</text>
      <text x="60" y="20" font-size="8" fill="#6B7280" text-anchor="end">+2</text>
    </g>
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

// Cell configuration
const cellSize = 32
const cellGap = 3
const gridCols = 8
const gridRows = 4
const startX = 0
const startY = 0

// Parse heatmap colors from colors array
const heatmapColors = computed(() => {
  if (props.colors.length >= 3) {
    return [props.colors[0], props.colors[1], props.colors[2]]
  }
  // Fallback to default colors
  return ['#3F2EA8', '#FFFFFF', '#C43B2F']
})

// Parse annotation colors from colors array
const annotationColors = computed(() => {
  if (props.colors.length > 3) {
    return [props.colors[3], props.colors[4] || props.colors[3]]
  }
  return ['#18B7B5', '#F2A51A']
})

// Deterministic random based on seed
function seededRandom(seed: string): () => number {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return () => {
    hash = Math.sin(hash) * 10000
    return hash - Math.floor(hash)
  }
}

const random = seededRandom(props.seed || 'default')

// Generate heatmap cells with values for color interpolation
interface Cell {
  x: number
  y: number
  color: string
  value: number
}

const heatmapCells = computed((): Cell[] => {
  const cells: Cell[] = []
  const [lowColor, midColor, highColor] = heatmapColors.value
  
  for (let row = 0; row < gridRows; row++) {
    for (let col = 0; col < gridCols; col++) {
      // Generate a value between -2 and 2
      const value = (random() - 0.5) * 4
      // Interpolate color based on value
      const color = interpolateColor(lowColor, midColor, highColor, value)
      
      cells.push({
        x: startX + col * (cellSize + cellGap),
        y: startY + row * (cellSize + cellGap),
        color,
        value
      })
    }
  }
  
  return cells
})

// Generate row annotations
interface Annotation {
  y: number
  color: string
}

const rowAnnotations = computed((): Annotation[] => {
  const annotations: Annotation[] = []
  
  for (let row = 0; row < gridRows; row++) {
    const annColor = annotationColors.value[row % annotationColors.value.length]
    annotations.push({
      y: startY + row * (cellSize + cellGap),
      color: annColor
    })
  }
  
  return annotations
})

// Generate column annotations
const colAnnotations = computed((): { x: number; color: string }[] => {
  const annotations: { x: number; color: string }[] = []
  
  for (let col = 0; col < gridCols; col++) {
    const annColor = annotationColors.value[col % annotationColors.value.length]
    annotations.push({
      x: startX + col * (cellSize + cellGap),
      color: annColor
    })
  }
  
  return annotations
})

// Color interpolation helper
function interpolateColor(low: string, mid: string, high: string, value: number): string {
  // Clamp value between -2 and 2
  const clampedValue = Math.max(-2, Math.min(2, value))
  
  const lowRGB = hexToRgb(low)
  const midRGB = hexToRgb(mid)
  const highRGB = hexToRgb(high)
  
  let r: number, g: number, b: number
  
  if (clampedValue < 0) {
    // Interpolate between low and mid
    const t = (clampedValue + 2) / 2 // 0 at -2, 1 at 0
    r = lowRGB.r + t * (midRGB.r - lowRGB.r)
    g = lowRGB.g + t * (midRGB.g - lowRGB.g)
    b = lowRGB.b + t * (midRGB.b - lowRGB.b)
  } else {
    // Interpolate between mid and high
    const t = clampedValue / 2 // 0 at 0, 1 at 2
    r = midRGB.r + t * (highRGB.r - midRGB.r)
    g = midRGB.g + t * (highRGB.g - midRGB.g)
    b = midRGB.b + t * (highRGB.b - midRGB.b)
  }
  
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 128, g: 128, b: 128 }
}
</script>

<style scoped>
.heatmap-annotated-preview {
  width: 100%;
  height: 100%;
}
</style>