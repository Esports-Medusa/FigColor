<template>
  <svg viewBox="0 0 360 220" preserveAspectRatio="xMidYMid meet" class="line-multiseries-preview">
    <!-- Background -->
    <rect x="0" y="0" width="360" height="220" fill="#FAFAFB" />
    
    <!-- Panel label A -->
    <text x="12" y="20" font-size="12" font-weight="600" fill="#6B7280">A</text>
    
    <!-- Y axis -->
    <line x1="50" y1="30" x2="50" y2="170" stroke="#E5E7EB" stroke-width="1" />
    <text x="45" y="35" font-size="8" fill="#6B7280" text-anchor="end">100</text>
    <text x="45" y="70" font-size="8" fill="#6B7280" text-anchor="end">75</text>
    <text x="45" y="105" font-size="8" fill="#6B7280" text-anchor="end">50</text>
    <text x="45" y="140" font-size="8" fill="#6B7280" text-anchor="end">25</text>
    <text x="45" y="175" font-size="8" fill="#6B7280" text-anchor="end">0</text>
    
    <!-- Y axis label -->
    <text x="15" y="100" font-size="8" fill="#6B7280" transform="rotate(-90, 15, 100)" text-anchor="middle">Expression</text>
    
    <!-- X axis -->
    <line x1="50" y1="170" x2="340" y2="170" stroke="#E5E7EB" stroke-width="1" />
    
    <!-- X axis labels -->
    <text x="50" y="188" font-size="8" fill="#6B7280">0h</text>
    <text x="120" y="188" font-size="8" fill="#6B7280">6h</text>
    <text x="190" y="188" font-size="8" fill="#6B7280">12h</text>
    <text x="260" y="188" font-size="8" fill="#6B7280">18h</text>
    <text x="330" y="188" font-size="8" fill="#6B7280">24h</text>
    
    <!-- Grid lines -->
    <line x1="50" y1="35" x2="340" y2="35" stroke="#F3F4F6" stroke-width="1" stroke-dasharray="2,2" />
    <line x1="50" y1="70" x2="340" y2="70" stroke="#F3F4F6" stroke-width="1" stroke-dasharray="2,2" />
    <line x1="50" y1="105" x2="340" y2="105" stroke="#F3F4F6" stroke-width="1" stroke-dasharray="2,2" />
    <line x1="50" y1="140" x2="340" y2="140" stroke="#F3F4F6" stroke-width="1" stroke-dasharray="2,2" />
    
    <!-- Confidence band 2 (background) -->
    <path :d="confidenceBand2Path" :fill="confidenceBandColors[1]" fill-opacity="0.15" />
    
    <!-- Confidence band 1 (background) -->
    <path :d="confidenceBand1Path" :fill="confidenceBandColors[0]" fill-opacity="0.2" />
    
    <!-- Line 3 -->
    <path :d="linePath3" :stroke="lineColors[2]" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
    
    <!-- Line 2 -->
    <path :d="linePath2" :stroke="lineColors[1]" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
    
    <!-- Line 1 -->
    <path :d="linePath1" :stroke="lineColors[0]" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" />
    
    <!-- Data points for line 1 -->
    <circle v-for="(pt, i) in dataPoints1" :key="i" :cx="pt.x" :cy="pt.y" r="3" :fill="lineColors[0]" />
    
    <!-- Data points for line 2 -->
    <circle v-for="(pt, i) in dataPoints2" :key="i" :cx="pt.x" :cy="pt.y" r="3" :fill="lineColors[1]" />
    
    <!-- Data points for line 3 -->
    <circle v-for="(pt, i) in dataPoints3" :key="i" :cx="pt.x" :cy="pt.y" r="3" :fill="lineColors[2]" />
    
    <!-- Legend -->
    <g transform="translate(250, 185)">
      <line x1="0" y1="5" x2="15" :y2="5" :stroke="lineColors[0]" stroke-width="2" />
      <text x="20" y="8" font-size="7" fill="#6B7280">Gene A</text>
      <line x1="55" y1="5" x2="70" :y2="5" :stroke="lineColors[1]" stroke-width="2" />
      <text x="75" y="8" font-size="7" fill="#6B7280">Gene B</text>
      <line x1="105" y1="5" x2="120" :y2="5" :stroke="lineColors[2]" stroke-width="2" />
      <text x="125" y="8" font-size="7" fill="#6B7280">Gene C</text>
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

// Chart dimensions
const chartLeft = 50
const chartRight = 340
const chartTop = 30
const chartBottom = 170
const chartWidth = chartRight - chartLeft
const chartHeight = chartBottom - chartTop

// Time points (0, 6, 12, 18, 24 hours)
const timePoints = [0, 6, 12, 18, 24]

// Parse line colors from colors array
const lineColors = computed(() => {
  if (props.colors.length >= 3) {
    return [props.colors[0], props.colors[1], props.colors[2]]
  }
  return ['#4E79A7', '#F28E2B', '#59A14F']
})

// Confidence band colors
const confidenceBandColors = computed(() => {
  if (props.colors.length >= 5) {
    return [props.colors[3], props.colors[4]]
  }
  return ['#4E79A7', '#F28E2B']
})

// Convert value to Y coordinate
function valueToY(value: number): number {
  const maxValue = 100
  const normalized = value / maxValue
  return chartBottom - normalized * chartHeight
}

// Convert time to X coordinate
function timeToX(time: number): number {
  const maxTime = 24
  const normalized = time / maxTime
  return chartLeft + normalized * chartWidth
}

// Generate line path
function generateLinePath(dataPoints: { x: number; y: number }[]): string {
  if (dataPoints.length === 0) return ''
  
  let path = `M ${dataPoints[0].x} ${dataPoints[0].y}`
  for (let i = 1; i < dataPoints.length; i++) {
    path += ` L ${dataPoints[i].x} ${dataPoints[i].y}`
  }
  return path
}

// Generate confidence band path
function generateConfidenceBandPath(centerPoints: { x: number; y: number }[], bandWidth: number): string {
  if (centerPoints.length === 0) return ''
  
  // Upper band
  let path = `M ${centerPoints[0].x} ${centerPoints[0].y - bandWidth}`
  for (let i = 1; i < centerPoints.length; i++) {
    path += ` L ${centerPoints[i].x} ${centerPoints[i].y - bandWidth}`
  }
  
  // Connect to lower band (reverse)
  for (let i = centerPoints.length - 1; i >= 0; i--) {
    path += ` L ${centerPoints[i].x} ${centerPoints[i].y + bandWidth}`
  }
  
  path += ' Z'
  return path
}

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

// Generate data points for line 1 (Gene A - high expression, increasing)
const dataPoints1 = computed(() => {
  const baseValues = [20, 35, 55, 70, 85]
  return baseValues.map((v, i) => ({
    x: timeToX(timePoints[i]),
    y: valueToY(v + (random() - 0.5) * 10)
  }))
})

// Generate data points for line 2 (Gene B - medium expression, peaking)
const dataPoints2 = computed(() => {
  const baseValues = [40, 65, 80, 75, 60]
  return baseValues.map((v, i) => ({
    x: timeToX(timePoints[i]),
    y: valueToY(v + (random() - 0.5) * 10)
  }))
})

// Generate data points for line 3 (Gene C - low expression, decreasing)
const dataPoints3 = computed(() => {
  const baseValues = [70, 55, 40, 30, 25]
  return baseValues.map((v, i) => ({
    x: timeToX(timePoints[i]),
    y: valueToY(v + (random() - 0.5) * 10)
  }))
})

// Line paths
const linePath1 = computed(() => generateLinePath(dataPoints1.value))
const linePath2 = computed(() => generateLinePath(dataPoints2.value))
const linePath3 = computed(() => generateLinePath(dataPoints3.value))

// Confidence band paths
const confidenceBand1Path = computed(() => {
  return generateConfidenceBandPath(dataPoints1.value, 8)
})

const confidenceBand2Path = computed(() => {
  return generateConfidenceBandPath(dataPoints2.value, 8)
})
</script>

<style scoped>
.line-multiseries-preview {
  width: 100%;
  height: 100%;
}
</style>