<template>
  <svg viewBox="0 0 320 160" preserveAspectRatio="xMidYMid meet" class="scatter-preview">
    <!-- Background -->
    <rect x="0" y="0" width="320" height="160" fill="#FAFAFB" />
    
    <!-- Plot area background -->
    <rect x="28" y="22" width="268" height="108" fill="#FFFFFF" />
    
    <!-- Grid lines -->
    <line x1="28" y1="55" x2="296" y2="55" stroke="#EEF0F4" stroke-width="1" />
    <line x1="28" y1="88" x2="296" y2="88" stroke="#EEF0F4" stroke-width="1" />
    <line x1="28" y1="121" x2="296" y2="121" stroke="#EEF0F4" stroke-width="1" />
    
    <!-- X axis -->
    <line x1="28" y1="130" x2="296" y2="130" stroke="#D1D5DB" stroke-width="1" />
    
    <!-- Y axis -->
    <line x1="28" y1="22" x2="28" y2="130" stroke="#D1D5DB" stroke-width="1" />
    
    <!-- Scatter points -->
    <circle
      v-for="(point, i) in scatterPoints"
      :key="i"
      :cx="point.x"
      :cy="point.y"
      r="3.5"
      :fill="point.color"
      opacity="0.75"
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
  color: string
}

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9999) * 10000
  return x - Math.floor(x)
}

const scatterPoints = computed((): Point[] => {
  const points: Point[] = []
  const colorCount = props.colors.length || 1
  
  // Generate cluster-like points for realistic scatter appearance
  const clusters = [
    { cx: 80, cy: 60, count: 8 },
    { cx: 160, cy: 85, count: 10 },
    { cx: 230, cy: 55, count: 7 }
  ]
  
  clusters.forEach((cluster, clusterIdx) => {
    const color = props.colors[clusterIdx % colorCount] || '#6B7280'
    for (let i = 0; i < cluster.count; i++) {
      const seedBase = clusterIdx * 100 + i * 13
      points.push({
        x: cluster.cx + (seededRandom(seedBase) - 0.5) * 45,
        y: cluster.cy + (seededRandom(seedBase + 1) - 0.5) * 40,
        color
      })
    }
  })
  
  return points
})
</script>

<style scoped>
.scatter-preview {
  width: 100%;
  height: 100%;
}
</style>