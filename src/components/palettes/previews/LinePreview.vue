<template>
  <svg viewBox="0 0 320 160" preserveAspectRatio="xMidYMid meet" class="line-preview">
    <!-- Background -->
    <rect x="0" y="0" width="320" height="160" fill="#FAFAFB" />
    
    <!-- Plot area background -->
    <rect x="28" y="22" width="268" height="108" fill="#FFFFFF" />
    
    <!-- Grid lines - subtle light gray -->
    <line x1="28" y1="50" x2="296" y2="50" stroke="#EEF0F4" stroke-width="1" />
    <line x1="28" y1="78" x2="296" y2="78" stroke="#EEF0F4" stroke-width="1" />
    <line x1="28" y1="106" x2="296" y2="106" stroke="#EEF0F4" stroke-width="1" />
    
    <!-- X axis -->
    <line x1="28" y1="130" x2="296" y2="130" stroke="#D1D5DB" stroke-width="1" />
    
    <!-- Y axis -->
    <line x1="28" y1="22" x2="28" y2="130" stroke="#D1D5DB" stroke-width="1" />
    
    <!-- First line -->
    <polyline
      :points="points1"
      fill="none"
      :stroke="colors[0] || '#6B7280'"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    
    <!-- Second line (if available) -->
    <polyline
      v-if="colors.length > 1"
      :points="points2"
      fill="none"
      :stroke="colors[1]"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-dasharray="4,3"
    />
    
    <!-- Third line (if available) -->
    <polyline
      v-if="colors.length > 2"
      :points="points3"
      fill="none"
      :stroke="colors[2]"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-dasharray="2,2"
      opacity="0.7"
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

// Generate stable pseudo-random values based on seed
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9999) * 10000
  return x - Math.floor(x)
}

const points1 = computed(() => {
  const pts: string[] = []
  const seedBase = props.seed.charCodeAt(0) + (props.seed.charCodeAt(1) || 0)
  for (let i = 0; i < 6; i++) {
    const x = 40 + i * 42
    const y = 45 + seededRandom(seedBase + i * 7) * 60
    pts.push(`${x},${y}`)
  }
  return pts.join(' ')
})

const points2 = computed(() => {
  const pts: string[] = []
  const seedBase = props.seed.charCodeAt(2) || 100
  for (let i = 0; i < 6; i++) {
    const x = 40 + i * 42
    const y = 55 + seededRandom(seedBase + i * 11) * 50
    pts.push(`${x},${y}`)
  }
  return pts.join(' ')
})

const points3 = computed(() => {
  const pts: string[] = []
  const seedBase = props.seed.charCodeAt(3) || 200
  for (let i = 0; i < 6; i++) {
    const x = 40 + i * 42
    const y = 35 + seededRandom(seedBase + i * 13) * 65
    pts.push(`${x},${y}`)
  }
  return pts.join(' ')
})
</script>

<style scoped>
.line-preview {
  width: 100%;
  height: 100%;
}
</style>