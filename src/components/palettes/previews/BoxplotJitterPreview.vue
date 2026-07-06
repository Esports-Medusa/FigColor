<template>
  <svg viewBox="0 0 360 220" preserveAspectRatio="xMidYMid meet" class="boxplot-jitter-preview">
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
    <text x="15" y="100" font-size="8" fill="#6B7280" transform="rotate(-90, 15, 100)" text-anchor="middle">Value</text>
    
    <!-- X axis -->
    <line x1="50" y1="170" x2="340" y2="170" stroke="#E5E7EB" stroke-width="1" />
    
    <!-- Grid lines -->
    <line x1="50" y1="35" x2="340" y2="35" stroke="#F3F4F6" stroke-width="1" stroke-dasharray="2,2" />
    <line x1="50" y1="70" x2="340" y2="70" stroke="#F3F4F6" stroke-width="1" stroke-dasharray="2,2" />
    <line x1="50" y1="105" x2="340" y2="105" stroke="#F3F4F6" stroke-width="1" stroke-dasharray="2,2" />
    <line x1="50" y1="140" x2="340" y2="140" stroke="#F3F4F6" stroke-width="1" stroke-dasharray="2,2" />
    
    <!-- Boxplot groups -->
    <g transform="translate(80, 0)">
      <!-- Group 1 boxplot -->
      <g :transform="`translate(0, 0)`">
        <!-- Box -->
        <rect 
          :x="0" :y="boxY(75, 100)" 
          :width="boxWidth" :height="boxHeight(50, 100)" 
          :fill="groupColors[0]" fill-opacity="0.7" rx="2"
        />
        <!-- Median line -->
        <line 
          x1="0" :y1="boxY(75, 100)" 
          :x2="boxWidth" :y2="boxY(75, 100)" 
          :stroke="medianColor" stroke-width="2"
        />
        <!-- Whiskers -->
        <line :x1="boxWidth/2" :y1="boxY(50, 100)" :x2="boxWidth/2" :y2="boxY(100, 100)" :stroke="groupColors[0]" stroke-width="1" />
        <line :x1="boxWidth/2 - 8" :y1="boxY(50, 100)" :x2="boxWidth/2 + 8" :y2="boxY(50, 100)" :stroke="groupColors[0]" stroke-width="1" />
        <line :x1="boxWidth/2 - 8" :y1="boxY(100, 100)" :x2="boxWidth/2 + 8" :y2="boxY(100, 100)" :stroke="groupColors[0]" stroke-width="1" />
        
        <!-- Jitter points -->
        <circle v-for="(pt, i) in jitterPoints1" :key="i" :cx="pt.cx" :cy="pt.cy" r="3" :fill="jitterColor" fill-opacity="0.6" />
      </g>
      
      <!-- Group 2 boxplot -->
      <g :transform="`translate(${boxWidth + groupGap}, 0)`">
        <!-- Box -->
        <rect 
          :x="0" :y="boxY(60, 85)" 
          :width="boxWidth" :height="boxHeight(40, 85)" 
          :fill="groupColors[1]" fill-opacity="0.7" rx="2"
        />
        <!-- Median line -->
        <line 
          x1="0" :y1="boxY(60, 85)" 
          :x2="boxWidth" :y2="boxY(60, 85)" 
          :stroke="medianColor" stroke-width="2"
        />
        <!-- Whiskers -->
        <line :x1="boxWidth/2" :y1="boxY(40, 85)" :x2="boxWidth/2" :y2="boxY(85, 85)" :stroke="groupColors[1]" stroke-width="1" />
        <line :x1="boxWidth/2 - 8" :y1="boxY(40, 85)" :x2="boxWidth/2 + 8" :y2="boxY(40, 85)" :stroke="groupColors[1]" stroke-width="1" />
        <line :x1="boxWidth/2 - 8" :y1="boxY(85, 85)" :x2="boxWidth/2 + 8" :y2="boxY(85, 85)" :stroke="groupColors[1]" stroke-width="1" />
        
        <!-- Jitter points -->
        <circle v-for="(pt, i) in jitterPoints2" :key="i" :cx="pt.cx" :cy="pt.cy" r="3" :fill="jitterColor" fill-opacity="0.6" />
      </g>
      
      <!-- Group 3 boxplot -->
      <g :transform="`translate(${(boxWidth + groupGap) * 2}, 0)`">
        <!-- Box -->
        <rect 
          :x="0" :y="boxY(45, 70)" 
          :width="boxWidth" :height="boxHeight(30, 70)" 
          :fill="groupColors[2]" fill-opacity="0.7" rx="2"
        />
        <!-- Median line -->
        <line 
          x1="0" :y1="boxY(45, 70)" 
          :x2="boxWidth" :y2="boxY(45, 70)" 
          :stroke="medianColor" stroke-width="2"
        />
        <!-- Whiskers -->
        <line :x1="boxWidth/2" :y1="boxY(30, 70)" :x2="boxWidth/2" :y2="boxY(70, 70)" :stroke="groupColors[2]" stroke-width="1" />
        <line :x1="boxWidth/2 - 8" :y1="boxY(30, 70)" :x2="boxWidth/2 + 8" :y2="boxY(30, 70)" :stroke="groupColors[2]" stroke-width="1" />
        <line :x1="boxWidth/2 - 8" :y1="boxY(70, 70)" :x2="boxWidth/2 + 8" :y2="boxY(70, 70)" :stroke="groupColors[2]" stroke-width="1" />
        
        <!-- Jitter points -->
        <circle v-for="(pt, i) in jitterPoints3" :key="i" :cx="pt.cx" :cy="pt.cy" r="3" :fill="jitterColor" fill-opacity="0.6" />
      </g>
    </g>
    
    <!-- X axis labels -->
    <text x="105" y="188" font-size="9" fill="#6B7280" text-anchor="middle">Group 1</text>
    <text x="195" y="188" font-size="9" fill="#6B7280" text-anchor="middle">Group 2</text>
    <text x="285" y="188" font-size="9" fill="#6B7280" text-anchor="middle">Group 3</text>
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

const boxWidth = 45
const groupGap = 50
const chartTop = 30
const chartBottom = 170
const chartHeight = chartBottom - chartTop
const maxValue = 100

// Parse group colors from colors array
const groupColors = computed(() => {
  if (props.colors.length >= 3) {
    return [props.colors[0], props.colors[1], props.colors[2]]
  }
  return ['#4E79A7', '#F28E2B', '#59A14F']
})

// Jitter point color
const jitterColor = computed(() => {
  return props.colors.length > 3 ? props.colors[3] : '#6B7280'
})

// Median line color
const medianColor = computed(() => {
  return props.colors.length > 4 ? props.colors[4] : '#1F2937'
})

// Convert value to Y coordinate
function boxY(value: number, max: number): number {
  const normalized = value / max
  return chartBottom - normalized * chartHeight
}

// Calculate box height
function boxHeight(min: number, max: number): number {
  return ((max - min) / max) * chartHeight
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

// Generate jitter points for each group
interface JitterPoint {
  cx: number
  cy: number
}

// Group 1 jitter points (around median 75-100)
const jitterPoints1 = computed((): JitterPoint[] => {
  const points: JitterPoint[] = []
  for (let i = 0; i < 8; i++) {
    const value = 55 + random() * 50
    points.push({
      cx: boxWidth / 2 + (random() - 0.5) * 30,
      cy: boxY(value, maxValue)
    })
  }
  return points
})

// Group 2 jitter points (around median 60-85)
const jitterPoints2 = computed((): JitterPoint[] => {
  const points: JitterPoint[] = []
  for (let i = 0; i < 8; i++) {
    const value = 35 + random() * 55
    points.push({
      cx: boxWidth / 2 + (random() - 0.5) * 30,
      cy: boxY(value, maxValue)
    })
  }
  return points
})

// Group 3 jitter points (around median 45-70)
const jitterPoints3 = computed((): JitterPoint[] => {
  const points: JitterPoint[] = []
  for (let i = 0; i < 8; i++) {
    const value = 20 + random() * 55
    points.push({
      cx: boxWidth / 2 + (random() - 0.5) * 30,
      cy: boxY(value, maxValue)
    })
  }
  return points
})
</script>

<style scoped>
.boxplot-jitter-preview {
  width: 100%;
  height: 100%;
}
</style>