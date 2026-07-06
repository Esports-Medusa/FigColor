<template>
  <div class="figure-chart-preview" :class="`chart-type-${normalizedChartType}`">
    <svg v-if="hasColors" viewBox="0 0 320 120" preserveAspectRatio="xMidYMid meet">
      <!-- Background -->
      <rect x="0" y="0" width="320" height="120" fill="#F8F9FA" />
      
      <!-- Plot area -->
      <rect x="20" y="15" width="280" height="85" fill="#FFFFFF" />
      
      <!-- Bar Plot -->
      <g v-if="normalizedChartType === 'barplot' || normalizedChartType === 'bar'">
        <line x1="20" y1="95" x2="300" y2="95" stroke="#D1D5DB" stroke-width="1" />
        <line x1="20" y1="15" x2="20" y2="95" stroke="#D1D5DB" stroke-width="1" />
        <line x1="20" y1="55" x2="300" y2="55" stroke="#EEF0F4" stroke-width="1" />
        <rect
          v-for="(color, i) in barColors"
          :key="i"
          :x="35 + i * 50"
          :y="95 - barHeights[i]"
          width="36"
          :height="barHeights[i]"
          :fill="color"
          rx="2"
        />
      </g>
      
      <!-- Box Plot -->
      <g v-else-if="normalizedChartType === 'boxplot'">
        <line x1="20" y1="95" x2="300" y2="95" stroke="#D1D5DB" stroke-width="1" />
        <line x1="20" y1="15" x2="20" y2="95" stroke="#D1D5DB" stroke-width="1" />
        <line x1="20" y1="55" x2="300" y2="55" stroke="#EEF0F4" stroke-width="1" />
        <g v-for="(box, i) in boxes" :key="i">
          <line :x1="box.cx" :y1="box.whiskerTop" :x2="box.cx" :y2="box.y" stroke="#666" stroke-width="1.5" />
          <line :x1="box.cx" :y1="box.y + box.h" :x2="box.cx" :y2="box.whiskerBottom" stroke="#666" stroke-width="1.5" />
          <line :x1="box.x + 8" :y1="box.whiskerTop" :x2="box.x + box.w - 8" :y2="box.whiskerTop" stroke="#666" stroke-width="1.5" />
          <line :x1="box.x + 8" :y1="box.whiskerBottom" :x2="box.x + box.w - 8" :y2="box.whiskerBottom" stroke="#666" stroke-width="1.5" />
          <rect :x="box.x" :y="box.y" :width="box.w" :height="box.h" :fill="box.color" rx="3" opacity="0.85" />
        </g>
      </g>
      
      <!-- Line Chart -->
      <g v-else-if="normalizedChartType === 'line'">
        <line x1="20" y1="95" x2="300" y2="95" stroke="#D1D5DB" stroke-width="1" />
        <line x1="20" y1="15" x2="20" y2="95" stroke="#D1D5DB" stroke-width="1" />
        <line x1="20" y1="40" x2="300" y2="40" stroke="#EEF0F4" stroke-width="1" />
        <line x1="20" y1="65" x2="300" y2="65" stroke="#EEF0F4" stroke-width="1" />
        <polyline
          v-for="(line, i) in lineData"
          :key="i"
          :points="line.points"
          fill="none"
          :stroke="line.color"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          :stroke-dasharray="line.dash"
        />
      </g>
      
      <!-- Scatter Plot -->
      <g v-else-if="normalizedChartType === 'scatter'">
        <line x1="20" y1="95" x2="300" y2="95" stroke="#D1D5DB" stroke-width="1" />
        <line x1="20" y1="15" x2="20" y2="95" stroke="#D1D5DB" stroke-width="1" />
        <line x1="20" y1="40" x2="300" y2="40" stroke="#EEF0F4" stroke-width="1" />
        <line x1="20" y1="65" x2="300" y2="65" stroke="#EEF0F4" stroke-width="1" />
        <circle
          v-for="(pt, i) in scatterPoints"
          :key="i"
          :cx="pt.x"
          :cy="pt.y"
          r="3.5"
          :fill="pt.color"
          opacity="0.75"
        />
      </g>
      
      <!-- Heatmap -->
      <g v-else-if="normalizedChartType === 'heatmap'">
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
      
      <!-- PCA -->
      <g v-else-if="normalizedChartType === 'pca'">
        <line x1="20" y1="55" x2="300" y2="55" stroke="#D1D5DB" stroke-width="1" />
        <line x1="160" y1="10" x2="160" y2="100" stroke="#D1D5DB" stroke-width="1" />
        <polygon points="300,55 292,51 292,59" fill="#D1D5DB" />
        <polygon points="160,10 156,18 164,18" fill="#D1D5DB" />
        <text x="280" y="50" font-size="10" fill="#999" font-family="sans-serif">PC1</text>
        <text x="165" y="15" font-size="10" fill="#999" font-family="sans-serif">PC2</text>
        <circle
          v-for="(pt, i) in pcaPoints"
          :key="i"
          :cx="pt.x"
          :cy="pt.y"
          r="4"
          :fill="pt.color"
          opacity="0.8"
        />
      </g>
      
      <!-- Generic / Unknown -->
      <g v-else>
        <line x1="20" y1="95" x2="300" y2="95" stroke="#D1D5DB" stroke-width="1" />
        <line x1="20" y1="15" x2="20" y2="95" stroke="#D1D5DB" stroke-width="1" />
        <line x1="20" y1="55" x2="300" y2="55" stroke="#EEF0F4" stroke-width="1" />
        <rect x="50" y="45" width="30" height="50" fill="#9CA3AF" rx="2" opacity="0.6" />
        <rect x="100" y="35" width="30" height="60" fill="#6B7280" rx="2" opacity="0.6" />
        <rect x="150" y="55" width="30" height="40" fill="#9CA3AF" rx="2" opacity="0.6" />
        <rect x="200" y="40" width="30" height="55" fill="#6B7280" rx="2" opacity="0.6" />
        <text x="260" y="85" font-size="11" fill="#999" font-family="sans-serif">{{ chartType }}</text>
      </g>
    </svg>
    
    <div v-else class="no-palette">
      <span class="no-palette-icon">📊</span>
      <span class="no-palette-text">No palette assigned</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface ColorInfo {
  id: string
  hex: string
  roleLabel?: string
}

interface Props {
  chartType: string
  colors: ColorInfo[]
}

const props = defineProps<Props>()

const normalizedChartType = computed(() => {
  return props.chartType?.toLowerCase().replace(/[-_]/g, '') || 'unknown'
})

const hasColors = computed(() => {
  return props.colors && props.colors.length > 0
})

const colorHexes = computed((): string[] => {
  return props.colors?.map(c => c.hex) || []
})

// Seeded random for consistent preview
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9999) * 10000
  return x - Math.floor(x)
}

// Bar chart data
const barColors = computed(() => {
  if (colorHexes.value.length === 0) return ['#6B7280']
  return colorHexes.value.slice(0, 5)
})

const barHeights = computed(() => {
  return barColors.value.map((_, i) => 25 + seededRandom(42 + i * 17) * 45)
})

// Box chart data
const boxes = computed(() => {
  return barColors.value.map((color, i) => {
    const baseY = 75
    const boxH = 25 + seededRandom(10 + i * 13) * 20
    const whiskerTop = baseY - boxH - 5 - seededRandom(20 + i * 7) * 15
    const x = 30 + i * 52
    return {
      color,
      x,
      y: baseY - boxH,
      w: 36,
      h: boxH,
      cx: x + 18,
      whiskerTop,
      whiskerBottom: 95
    }
  })
})

// Line chart data
const lineData = computed(() => {
  return barColors.value.slice(0, 3).map((color, lineIdx) => {
    const pts: string[] = []
    const seedBase = 30 + lineIdx * 50
    for (let i = 0; i < 6; i++) {
      const x = 35 + i * 46
      const y = 35 + seededRandom(seedBase + i * 7) * 50
      pts.push(`${x},${y}`)
    }
    const dash = lineIdx > 0 ? (lineIdx === 1 ? '4,3' : '2,2') : ''
    return { color, points: pts.join(' '), dash }
  })
})

// Scatter plot data
const scatterPoints = computed(() => {
  const pts: Array<{x: number, y: number, color: string}> = []
  const colorCount = colorHexes.value.length || 1
  const clusters = [
    { cx: 80, cy: 55, count: 7 },
    { cx: 160, cy: 70, count: 9 },
    { cx: 240, cy: 50, count: 6 }
  ]
  clusters.forEach((cluster, clusterIdx) => {
    const color = colorHexes.value[clusterIdx % colorCount] || '#6B7280'
    for (let i = 0; i < cluster.count; i++) {
      const seedBase = clusterIdx * 100 + i * 13
      pts.push({
        x: cluster.cx + (seededRandom(seedBase) - 0.5) * 40,
        y: cluster.cy + (seededRandom(seedBase + 1) - 0.5) * 35,
        color
      })
    }
  })
  return pts
})

// Heatmap data
const cellSize = 38
const heatmapCells = computed(() => {
  const result: Array<{x: number, y: number, color: string}> = []
  const gridCols = 6
  const gridRows = 2
  const colorCount = colorHexes.value.length
  for (let row = 0; row < gridRows; row++) {
    for (let col = 0; col < gridCols; col++) {
      const colorIdx = (row * gridCols + col) % Math.max(colorCount, 1)
      result.push({
        x: 26 + col * (cellSize + 4),
        y: 22 + row * (cellSize + 4),
        color: colorHexes.value[colorIdx] || '#6B7280'
      })
    }
  }
  return result
})

// PCA data
const pcaPoints = computed(() => {
  const pts: Array<{x: number, y: number, color: string}> = []
  const colorCount = colorHexes.value.length || 1
  const clusters = [
    { cx: 100, cy: 70, count: 10, spread: 35 },
    { cx: 200, cy: 45, count: 12, spread: 40 }
  ]
  clusters.forEach((cluster, clusterIdx) => {
    const color = colorHexes.value[clusterIdx % colorCount] || '#6B7280'
    for (let i = 0; i < cluster.count; i++) {
      const seedBase = clusterIdx * 100 + i * 13
      pts.push({
        x: cluster.cx + (seededRandom(seedBase) - 0.5) * cluster.spread,
        y: cluster.cy + (seededRandom(seedBase + 1) - 0.5) * cluster.spread,
        color
      })
    }
  })
  return pts
})
</script>

<style scoped>
.figure-chart-preview {
  width: 100%;
  height: 120px;
  background: #F8F9FA;
  border: 1px solid #E5E7EB;
  border-radius: 8px;
  overflow: hidden;
  box-sizing: border-box;
}

.figure-chart-preview svg {
  display: block;
  width: 100%;
  height: 100%;
}

.no-palette {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  color: #9CA3AF;
}

.no-palette-icon {
  font-size: 1.5rem;
  opacity: 0.5;
}

.no-palette-text {
  font-size: 0.75rem;
}
</style>