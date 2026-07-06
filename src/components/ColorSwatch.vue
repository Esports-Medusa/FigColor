<template>
  <div class="color-swatch-card">
    <div class="swatch-color" :style="{ backgroundColor: color.hex }"></div>
    <div class="swatch-content">
      <div class="swatch-name">{{ displayName }}</div>
      <div class="swatch-row">
        <span class="swatch-hex">{{ color.hex }}</span>
        <button class="copy-btn" @click="copyHex" :class="{ copied: hexCopied }">
          {{ hexCopied ? 'Copied' : 'Copy' }}
        </button>
      </div>
      <div class="swatch-row">
        <span class="swatch-rgb">rgb({{ color.rgb.join(', ') }})</span>
        <button class="copy-btn" @click="copyRgb" :class="{ copied: rgbCopied }">
          {{ rgbCopied ? 'Copied' : 'Copy' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { PaletteColor } from '@/types/palette'
import { copyText } from '@/lib/clipboard'

const props = defineProps<{
  color: PaletteColor
  index?: number
  total?: number
  showName?: boolean
}>()

const hexCopied = ref(false)
const rgbCopied = ref(false)

const ROLES_2 = ['Primary', 'Contrast']
const ROLES_3 = ['Primary', 'Contrast', 'Accent']
const ROLES_4 = ['Primary', 'Secondary', 'Contrast', 'Accent']

const displayName = computed(() => {
  if (props.showName && (props.color as any).name) {
    return (props.color as any).name
  }
  if (props.index !== undefined) {
    const colorNum = props.index + 1
    if (props.total === 2) {
      return `${colorNum} / ${ROLES_2[props.index] || `Color ${colorNum}`}`
    }
    if (props.total === 3) {
      return `${colorNum} / ${ROLES_3[props.index] || `Color ${colorNum}`}`
    }
    if (props.total === 4) {
      return `${colorNum} / ${ROLES_4[props.index] || `Color ${colorNum}`}`
    }
    if (props.total && props.total >= 5) {
      return `${colorNum} / Group ${colorNum}`
    }
    return `Color ${colorNum}`
  }
  return ''
})

async function copyHex() {
  const success = await copyText(props.color.hex)
  if (success) {
    hexCopied.value = true
    setTimeout(() => {
      hexCopied.value = false
    }, 2000)
  }
}

async function copyRgb() {
  const rgbStr = `rgb(${props.color.rgb.join(', ')})`
  const success = await copyText(rgbStr)
  if (success) {
    rgbCopied.value = true
    setTimeout(() => {
      rgbCopied.value = false
    }, 2000)
  }
}
</script>

<style scoped>
.color-swatch-card {
  display: flex;
  flex-direction: column;
  width: 160px;
  background: #fff;
  border-radius: 14px;
  border: 1px solid #e8ecf0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  overflow: hidden;
}

.swatch-color {
  height: 120px;
  border-radius: 14px 14px 0 0;
}

.swatch-content {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.875rem;
}

.swatch-name {
  font-size: 0.8125rem;
  font-weight: 500;
  color: #374151;
  margin-bottom: 0.125rem;
}

.swatch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.375rem;
}

.swatch-hex {
  font-family: 'SF Mono', Monaco, 'Courier New', monospace;
  font-size: 0.8125rem;
  font-weight: 600;
  color: #1f2937;
}

.swatch-rgb {
  font-family: 'SF Mono', Monaco, 'Courier New', monospace;
  font-size: 0.6875rem;
  color: #6b7280;
}

.copy-btn {
  padding: 0.1875rem 0.5rem;
  font-size: 0.625rem;
  font-weight: 500;
  border: 1px solid #e5e7eb;
  border-radius: 9999px;
  background: #f9fafb;
  color: #6b7280;
  cursor: pointer;
  transition: all 0.15s;
}

.copy-btn:hover {
  background: #eff6ff;
  border-color: #3b82f6;
  color: #2563eb;
}

.copy-btn.copied {
  background: #f0fdf4;
  border-color: #22c55e;
  color: #16a34a;
}
</style>
