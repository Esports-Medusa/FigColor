<template>
  <div class="chromatic-spectrum-rail" aria-hidden="true">
    <span v-for="color in SPECTRUM_COLORS" :key="color" :style="{ backgroundColor: color }" />
  </div>
</template>

<script setup lang="ts">
const SPECTRUM_COLORS = [
  '#DDEAF7', '#CFE4F8', '#BBDCF7', '#A3D4F5', '#7FC7F0', '#56B9EA',
  '#2AA9E0', '#129ACF', '#0F9FB3', '#11A893', '#26B46F', '#55C94D',
  '#8BD831', '#BCE21C', '#E7E800', '#FFD900', '#FFC000', '#FFA31A',
  '#FF8528', '#FF6A35', '#FF5347', '#F94655', '#EB3D68', '#D9437F',
  '#C94A91', '#B95B9F', '#C06FAD', '#C782B8', '#CE94C3', '#D5A6CE',
  '#DCB7D9', '#E3C7E4', '#E8D2EB', '#EDDCF1', '#F0E4F5', '#F3EBF8'
] as const
</script>

<style scoped>
.chromatic-spectrum-rail { position: fixed; inset: 0 auto 0 max(10px, calc((100vw - var(--fc-content-width)) / 4 - 17px)); width: 34px; z-index: 120; display: grid; grid-template-rows: repeat(36, 1fr); gap: 1px; padding: 1px 0; background: #fff; pointer-events: none; }
.chromatic-spectrum-rail span { min-height: 0; }
@media (max-width: 1320px) { .chromatic-spectrum-rail { left: 10px; width: 24px; } }
@media (max-width: 600px) { .chromatic-spectrum-rail { left: 5px; width: 11px; } }
@media print { .chromatic-spectrum-rail { display: none; } }
</style>
