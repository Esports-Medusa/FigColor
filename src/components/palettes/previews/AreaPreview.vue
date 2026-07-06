<template>
  <svg viewBox="0 0 320 160" preserveAspectRatio="xMidYMid meet" class="area-preview">
    <!-- Background -->
    <rect x="0" y="0" width="320" height="160" fill="#FAFAFB" />
    
    <!-- Plot area background -->
    <rect x="28" y="22" width="268" height="108" fill="#FFFFFF" />
    
    <!-- Grid lines -->
    <line x1="28" y1="50" x2="296" y2="50" stroke="#EEF0F4" stroke-width="1" />
    <line x1="28" y1="78" x2="296" y2="78" stroke="#EEF0F4" stroke-width="1" />
    <line x1="28" y1="106" x2="296" y2="106" stroke="#EEF0F4" stroke-width="1" />
    
    <!-- X axis -->
    <line x1="28" y1="130" x2="296" y2="130" stroke="#D1D5DB" stroke-width="1" />
    
    <!-- Y axis -->
    <line x1="28" y1="22" x2="28" y2="130" stroke="#D1D5DB" stroke-width="1" />
    
    <!-- Area fill 1 -->
    <path
      :d="areaPath1"
      :fill="colors[0] || '#6B7280'"
      opacity="0.4"
    />
    
    <!-- Area fill 2 (if available) -->
    <path
      v-if="colors.length > 1"
      :d="areaPath2"
      :fill="colors[1]"
      opacity="0.3"
    />
    
    <!-- Line on top -->
    <polyline
      :points="linePoints1"
      fill="none"
      :stroke="colors[0] || '#6B7280'"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
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

interface Point {
  x: number
  y: number
}

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9999) * 10000
  return x - Math.floor(x)
}

// Generate line points
const linePoints1 = computed((): string => {
  const pts: string[] = []
  const seedBase = props.seed.charCodeAt(0) + (props.seed.charCodeAt(1) || 0)
  for (let i = 0; i < 6; i++) {
    const x = 40 + i * 42
    const y = 45 + seededRandom(seedBase + i * 7) * 60
    pts.push(`${x},${y}`)
  }
  return pts.join(' ')
})

// Generate area path
const areaPath1 = computed((): string => {
  const pts: Point[] = []
  const seedBase = props.seed.charCodeAt(0) + (props.seed.charCodeAt(1) || 0)
  for (let i = 0; i < 6; i++) {
    const x = 40 + i * 42
    const y = 45 + seededRandom(seedBase + i * 7) * 60
    pts.push({ x, y })
  }
  
  if (pts.length === 0) return ''
  
  let d = `M ${pts[0].x} 130 L ${pts[0].x} ${pts[0].y}`
  pts.forEach((p) => {
    d += ` L ${p.x} ${p.y}`
  })
  d += ` L ${pts[pts.length - 1].x} 130 Z`
  return d
})

const areaPath2 = computed((): string => {
  const pts: Point[] = []
  const seedBase = props.seed.charCodeAt(2) || 100
  for (let i = 0; i < 6; i++) {
    const x = 40 + i * 42
    const y = 55 + seededRandom(seedBase + i * 11) * 50
    pts.push({ x, y })
  }
  
  if (pts.length === 0) return ''
  
  let d = `M ${pts[0].x} 130 L ${pts[0].x} ${pts[0].y}`
  pts.forEach((p) => {
    d += ` L ${p.x} ${p.y}`
  })
  d += ` L ${pts[pts.length - 1].x} 130 Z`
  return d
})
</script>

<style scoped>
.area-preview {
  width: 100%;
  height: 100%;
}
</style>