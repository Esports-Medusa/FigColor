<template>
  <div class="code-tabs">
    <div class="tabs-header">
      <button
        v-for="item in items"
        :key="item.label"
        class="tab-btn"
        :class="{ active: activeTab === item.label }"
        @click="activeTab = item.label"
      >
        {{ item.label }}
      </button>
    </div>
    <div class="code-block">
      <pre class="code-content"><code>{{ currentCode }}</code></pre>
      <button class="copy-btn" @click="copyCode" :class="{ copied: isCopied }">
        {{ isCopied ? 'Copied' : 'Copy' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { copyText } from '@/lib/clipboard'

interface CodeItem {
  label: string
  code: string
}

const props = defineProps<{
  items: CodeItem[]
}>()

const activeTab = ref(props.items[0]?.label || '')
const isCopied = ref(false)

const currentCode = computed(() => {
  return props.items.find((item) => item.label === activeTab.value)?.code || ''
})

async function copyCode() {
  const success = await copyText(currentCode.value)
  if (success) {
    isCopied.value = true
    setTimeout(() => {
      isCopied.value = false
    }, 2000)
  }
}
</script>

<style scoped>
.code-tabs {
  display: flex;
  flex-direction: column;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid #e8ecf0;
}

.tabs-header {
  display: flex;
  background: #f8fafc;
  border-bottom: 1px solid #e8ecf0;
}

.tab-btn {
  padding: 0.75rem 1.25rem;
  font-size: 0.8125rem;
  font-weight: 500;
  color: #64748b;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: all 0.15s;
}

.tab-btn:hover {
  color: #3b82f6;
  background: #f0f9ff;
}

.tab-btn.active {
  color: #2563eb;
  border-bottom-color: #2563eb;
  background: #fff;
}

.code-block {
  position: relative;
  background: #1e1e1e;
}

.code-content {
  padding: 1.25rem;
  margin: 0;
  font-family: 'SF Mono', Monaco, 'Courier New', monospace;
  font-size: 0.875rem;
  line-height: 1.6;
  color: #d4d4d4;
  overflow-x: auto;
}

.copy-btn {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  padding: 0.375rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 500;
  border: 1px solid #4b5563;
  border-radius: 6px;
  background: #374151;
  color: #d1d5db;
  cursor: pointer;
  transition: all 0.15s;
}

.copy-btn:hover {
  background: #4b5563;
  color: #fff;
}

.copy-btn.copied {
  background: #22c55e;
  border-color: #22c55e;
  color: #fff;
}
</style>
