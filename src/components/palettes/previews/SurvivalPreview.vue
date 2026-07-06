<template>
  <svg viewBox="0 0 320 160" preserveAspectRatio="xMidYMid meet" class="survival-preview">
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
    
    <!-- Survival curve 1 -->
    <path
      :d="curvePath1"
      fill="none"
      :stroke="colors[0] || '#6B7280'"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    
    <!-- Survival curve 2 (if available) -->
    <path
      v-if="colors.length > 1"
      :d="curvePath2"
      fill="none"
      :stroke="colors[1]"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-dasharray="5,3"
    />
    
    <!-- Censor marks for curve 1 -->
    <g v-for="(mark, i) in censorMarks1" :key="`c1-${i}`">
      <line
        :x1="mark.x"
        :y1="mark.y - 4"
        :x2="mark.x"
        :y2="mark.y + 4"
        :stroke="colors[0] || '#6B7280'"
        stroke-width="1.5"
      />
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

interface Point {
  x: number
  y: number
}

interface CensorMark extends Point {}

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9999) * 10000
  return x - Math.floor(x)
}

// Generate survival curve path (step function)
const curvePath1 = computed((): string => {
  const points: Point[] = []
  let y = 30
  
  // Start point
  points.push({ x: 28, y })
  
  // Generate step-like progression
  const steps = 10
  for (let i = 0; i < steps; i++) {
    const x = 28 + (i + 1) * 26
    // Random step up (survival decreases)
    const stepUp = seededRandom(props.seed.charCodeAt(0) + i * 7) > 0.4
    if (stepUp) {
      y = Math.min(125, y + 8 + seededRandom(props.seed.charCodeAt(1) + i) * 12)
    }
    points.push({ x, y })
  }
  
  // Build path
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x} ${points[i - 1].y} L ${points[i].x} ${points[i].y}`
  }
  
  // Extend to bottom
  d += ` L 296 125`
  
  return d
})

const curvePath2 = computed((): string => {
  const points: Point[] = []
  let y = 40
  
  // Start point
  points.push({ x: 28, y })
  
  // Generate step-like progression (slower decline)
  const steps = 10
  for (let i = 0; i < steps; i++) {
    const x = 28 + (i + 1) * 26
    const stepUp = seededRandom(props.seed.charCodeAt(2) + i * 9) > 0.5
    if (stepUp) {
      y = Math.min(125, y + 5 + seededRandom(props.seed.charCodeAt(3) + i) * 8)
    }
    points.push({ x, y })
  }
  
  // Build path
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x} ${points[i - 1].y} L ${points[i].x} ${points[i].y}`
  }
  
  // Extend to bottom
  d += ` L 296 125`
  
  return d
})

const censorMarks1 = computed((): CensorMark[] => {
  const marks: CensorMark[] = []
  // Add censor marks at some steps
  const censorIndices = [2, 5, 8]
  const steps = 10
  let y = 30
  
  for (let i = 0; i < steps; i++) {
    const stepUp = seededRandom(props.seed.charCodeAt(0) + i * 7) > 0.4
    if (stepUp) {
      y = Math.min(125, y + 8 + seededRandom(props.seed.charCodeAt(1) + i) * 12)
    }
    if (censorIndices.includes(i)) {
      marks.push({ x: 28 + (i + 1) * 26, y })
    }
  }
  
  return marks
})
</script>

<style scoped>
.survival-preview {
  width: 100%;
  height: 100%;
}
</style>