<template>
  <svg viewBox="0 0 360 220" preserveAspectRatio="xMidYMid meet" class="bar-error-preview">
    <!-- Background -->
    <rect x="0" y="0" width="360" height="220" fill="#FAFAFB" />
    
    <!-- Panel label A -->
    <text x="12" y="20" font-size="12" font-weight="600" fill="#6B7280">A</text>
    
    <!-- Y axis -->
    <line x1="50" y1="30" x2="50" y2="160" stroke="#E5E7EB" stroke-width="1" />
    <text x="45" y="35" font-size="8" fill="#6B7280" text-anchor="end">3</text>
    <text x="45" y="70" font-size="8" fill="#6B7280" text-anchor="end">2</text>
    <text x="45" y="105" font-size="8" fill="#6B7280" text-anchor="end">1</text>
    <text x="45" y="140" font-size="8" fill="#6B7280" text-anchor="end">0</text>
    <text x="45" y="165" font-size="8" fill="#6B7280" text-anchor="end">-1</text>
    
    <!-- Y axis label -->
    <text x="15" y="95" font-size="8" fill="#6B7280" transform="rotate(-90, 15, 95)" text-anchor="middle">Expression</text>
    
    <!-- X axis -->
    <line x1="50" y1="160" x2="340" y2="160" stroke="#E5E7EB" stroke-width="1" />
    
    <!-- Grid lines -->
    <line x1="50" y1="35" x2="340" y2="35" stroke="#F3F4F6" stroke-width="1" stroke-dasharray="2,2" />
    <line x1="50" y1="70" x2="340" y2="70" stroke="#F3F4F6" stroke-width="1" stroke-dasharray="2,2" />
    <line x1="50" y1="105" x2="340" y2="105" stroke="#F3F4F6" stroke-width="1" stroke-dasharray="2,2" />
    <line x1="50" y1="140" x2="340" y2="140" stroke="#F3F4F6" stroke-width="1" stroke-dasharray="2,2" />
    
    <!-- Bars -->
    <g transform="translate(70, 0)">
      <!-- Control group -->
      <rect 
        :x="0" :y="controlBar.y" 
        :width="barWidth" :height="controlBar.height" 
        :fill="barColors[0]" rx="3"
      />
      <!-- Error bar for control -->
      <line :x1="barWidth/2" :y1="controlBar.y - 8" :x2="barWidth/2" :y2="controlBar.y + 5" :stroke="errorBarColor" stroke-width="1.5" />
      <line :x1="barWidth/2 - 5" :y1="controlBar.y - 8" :x2="barWidth/2 + 5" :y2="controlBar.y - 8" :stroke="errorBarColor" stroke-width="1.5" />
      <line :x1="barWidth/2 - 5" :y1="controlBar.y + 5" :x2="barWidth/2 + 5" :y2="controlBar.y + 5" :stroke="errorBarColor" stroke-width="1.5" />
      
      <!-- Treatment group -->
      <rect 
        :x="barWidth + groupGap" :y="treatmentBar.y" 
        :width="barWidth" :height="treatmentBar.height" 
        :fill="barColors[1]" rx="3"
      />
      <!-- Error bar for treatment -->
      <line :x1="barWidth + groupGap + barWidth/2" :y1="treatmentBar.y - 10" :x2="barWidth + groupGap + barWidth/2" :y2="treatmentBar.y + 5" :stroke="errorBarColor" stroke-width="1.5" />
      <line :x1="barWidth + groupGap + barWidth/2 - 5" :y1="treatmentBar.y - 10" :x2="barWidth + groupGap + barWidth/2 + 5" :y2="treatmentBar.y - 10" :stroke="errorBarColor" stroke-width="1.5" />
      <line :x1="barWidth + groupGap + barWidth/2 - 5" :y1="treatmentBar.y + 5" :x2="barWidth + groupGap + barWidth/2 + 5" :y2="treatmentBar.y + 5" :stroke="errorBarColor" stroke-width="1.5" />
      
      <!-- Significance marker -->
      <text :x="barWidth + groupGap/2" y="45" font-size="10" fill="#E15759" text-anchor="middle">*</text>
      <line x1="barWidth/2" y1="38" :x2="barWidth + groupGap + barWidth/2" y2="38" stroke="#E15759" stroke-width="1" />
    </g>
    
    <!-- X axis labels -->
    <text x="110" y="178" font-size="9" fill="#6B7280" text-anchor="middle">Control</text>
    <text x="195" y="178" font-size="9" fill="#6B7280" text-anchor="middle">Treatment</text>
    
    <!-- Legend -->
    <g transform="translate(280, 185)">
      <rect x="0" y="0" width="10" height="10" :fill="barColors[0]" rx="2" />
      <text x="14" y="9" font-size="8" fill="#6B7280">Ctrl</text>
      <rect x="45" y="0" width="10" height="10" :fill="barColors[1]" rx="2" />
      <text x="59" y="9" font-size="8" fill="#6B7280">Tx</text>
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

const barWidth = 50
const groupGap = 40
const baselineY = 160

// Parse bar colors from colors array
const barColors = computed(() => {
  if (props.colors.length >= 2) {
    return [props.colors[0], props.colors[1]]
  }
  return ['#4E79A7', '#F28E2B']
})

// Error bar color
const errorBarColor = computed(() => {
  return props.colors.length > 2 ? props.colors[2] : '#6B7280'
})

// Calculate bar heights based on mock data
interface BarData {
  y: number
  height: number
}

const controlBar = computed((): BarData => {
  const value = 1.2
  const height = value * 35 // Scale factor
  return {
    y: baselineY - height,
    height
  }
})

const treatmentBar = computed((): BarData => {
  const value = 2.5
  const height = value * 35 // Scale factor
  return {
    y: baselineY - height,
    height
  }
})
</script>

<style scoped>
.bar-error-preview {
  width: 100%;
  height: 100%;
}
</style>