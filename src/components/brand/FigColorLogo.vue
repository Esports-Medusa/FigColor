<template>
  <span class="figcolor-logo" aria-label="FigColor">
    <svg class="figcolor-mark" viewBox="0 0 34 34" aria-hidden="true">
      <rect x="2" y="3" width="27" height="7" rx="1" fill="#0E56C4" />
      <rect x="2" y="13.5" width="19" height="7" rx="1" fill="#11A893" />
      <rect x="2" y="24" width="10" height="7" rx="1" fill="#FF5347" />
    </svg>
    <span v-if="!markOnly" class="figcolor-wordmark">FigColor</span>
  </span>
</template>
<script setup lang="ts">withDefaults(defineProps<{ markOnly?: boolean }>(), { markOnly: false })</script>
<style scoped>
.figcolor-logo { display: inline-flex; align-items: center; gap: .7rem; color: var(--fc-ink); }
.figcolor-mark { width: 30px; height: 30px; flex: none; }
.figcolor-wordmark { font-family: Georgia, 'Times New Roman', serif; font-size: 1.65rem; line-height: 1; letter-spacing: -.035em; }
</style>
