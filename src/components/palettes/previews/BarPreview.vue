<template>
  <svg viewBox="0 0 320 160" preserveAspectRatio="xMidYMid meet" class="bar-preview">
    <!-- Background -->
    <rect x="0" y="0" width="320" height="160" fill="#FAFAFB" />
    
    <!-- Plot area background -->
    <rect x="28" y="22" width="268" height="108" fill="#FFFFFF" />
    
    <!-- X axis -->
    <line x1="28" y1="130" x2="296" y2="130" stroke="#D1D5DB" stroke-width="1" />
    
    <!-- Y axis -->
    <line x1="28" y1="22" x2="28" y2="130" stroke="#D1D5DB" stroke-width="1" />
    
    <!-- Grid line -->
    <line x1="28" y1="78" x2="296" y2="78" stroke="#EEF0F4" stroke-width="1" />
    
    <!-- Bars -->
    <g v-for="(color, i) in barColors" :key="i">
      <rect
        :x="barX(i)"
        :y="barY(i)"
        :width="barWidth"
        :height="barHeight(i)"
        :fill="color"
        rx="2"
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

// Generate stable pseudo-random values based on seed
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9999) * 10000
  return x - Math.floor(x)
}

const barColors = computed(() => {
  if (props.colors.length === 0) return ['#6B7280']
  return props.colors.slice(0, 5)
})

const barWidth = computed(() => 32)
const barSpacing = computed(() => 46)

const barX = (index: number): number => {
  const startX = 40 + index * barSpacing.value
  return startX
}

const barHeight = (index: number): number => {
  const seedBase = props.seed.charCodeAt(0) + index * 17
  return 25 + seededRandom(seedBase) * 65
}

const barY = (index: number): number => {
  return 130 - barHeight(index)
}
</script>

<style scoped>
.bar-preview {
  width: 100%;
  height: 100%;
}
</style>