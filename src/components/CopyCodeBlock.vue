<template>
  <div class="copy-code-block">
    <div class="code-header">
      <span class="code-label">{{ label }}</span>
      <button class="copy-btn" @click="copyCode" :class="{ copied: isCopied }">
        {{ isCopied ? 'Copied' : 'Copy' }}
      </button>
    </div>
    <pre class="code-content"><code>{{ code }}</code></pre>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  label: string
  code: string
}>()

const isCopied = ref(false)

async function copyCode() {
  try {
    await navigator.clipboard.writeText(props.code)
    isCopied.value = true
    setTimeout(() => {
      isCopied.value = false
    }, 2000)
  } catch (err) {
    console.error('Failed to copy code:', err)
  }
}
</script>

<style scoped>
.copy-code-block {
  display: flex;
  flex-direction: column;
  border: 1px solid #e5e5e7;
  border-radius: 8px;
  overflow: hidden;
}

.code-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 1rem;
  background-color: #f5f5f7;
  border-bottom: 1px solid #e5e5e7;
}

.code-label {
  font-weight: 500;
  font-size: 0.875rem;
  color: #333;
}

.copy-btn {
  padding: 0.25rem 0.75rem;
  font-size: 0.75rem;
  font-weight: 500;
  border-radius: 4px;
  background-color: #0066cc;
  color: #fff;
  transition: background-color 0.15s;
}

.copy-btn:hover {
  background-color: #0055aa;
}

.copy-btn.copied {
  background-color: #34c759;
}

.code-content {
  padding: 1rem;
  background-color: #1e1e1e;
  color: #d4d4d4;
  font-family: 'SF Mono', Monaco, 'Courier New', monospace;
  font-size: 0.875rem;
  line-height: 1.6;
  overflow-x: auto;
  margin: 0;
}

code {
  font-family: inherit;
}
</style>
