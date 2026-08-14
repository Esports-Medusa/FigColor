<template>
  <div class="home-view">
    <section class="hero-section">
      <h1>Find the right colors<br>for scientific figures.</h1>
      <p>Explore curated palettes tested across scientific chart types.</p>
      <router-link to="/palettes" class="btn btn-primary hero-cta">Browse Palettes</router-link>
    </section>

    <section class="workflow" aria-labelledby="workflow-title">
      <h2 id="workflow-title">How FigColor works</h2>
      <div class="workflow-grid">
        <article class="workflow-step">
          <div class="step-heading"><span>01</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z"/></svg><h3>Browse</h3></div>
          <p>Find palettes by chart type</p>
          <div class="browse-example" aria-hidden="true"><span>Chart type <b>⌄</b></span><div><i v-for="color in sampleColors" :key="color" :style="{backgroundColor:color}" /></div></div>
        </article>
        <article class="workflow-step">
          <div class="step-heading"><span>02</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10m5 10V4m5 16v-7m5 7V7M2 21h20"/></svg><h3>Preview</h3></div>
          <p>Test colors on scientific charts</p>
          <div class="preview-examples" aria-hidden="true">
            <div class="mini-chart"><i v-for="(color,index) in sampleColors.slice(0,4)" :key="color" :style="{backgroundColor:color,height:`${35+index*17}%`}" /></div>
            <svg class="chart-tile line-tile" viewBox="0 0 80 52"><path d="M8 42 25 29 42 36 59 18 72 25"/><path d="M8 35 24 39 42 23 58 31 72 14"/><path d="M8 45 25 35 42 41 59 30 72 34"/></svg>
            <svg class="chart-tile dots-tile" viewBox="0 0 80 52"><circle v-for="dot in scatterDots" :key="`${dot.x}-${dot.y}`" :cx="dot.x" :cy="dot.y" r="2.5" :fill="dot.color"/></svg>
          </div>
        </article>
        <article class="workflow-step">
          <div class="step-heading"><span>03</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5h6m-7-2h8v4H8V3Zm-3 3h14v15H5V6Zm4 5h6m-6 4h6"/></svg><h3>Use</h3></div>
          <p>Copy colors or save to a project</p>
          <div class="use-example" aria-hidden="true"><div class="color-codes"><code v-for="color in sampleColors.slice(0,4)" :key="color" :style="{borderColor:color}">{{ color }}</code></div><span class="save-example"><svg viewBox="0 0 24 24"><path d="M3 6h7l2 2h9v11H3V6Z"/></svg>Save to project</span></div>
        </article>
      </div>
    </section>

    <section class="featured-section">
      <div class="section-heading"><h2>Featured Palettes</h2><span /></div>
      <div v-if="isLoading" class="empty-state"><p>Loading palettes...</p></div>
      <div v-else-if="featuredPalettes.length" class="palettes-grid"><PaletteCard v-for="palette in featuredPalettes" :key="palette.id" :palette="palette" /></div>
      <div v-else class="empty-state"><p>No palettes available yet. Check back soon!</p></div>
    </section>
  </div>
</template>
<script setup lang="ts">
import { computed,onMounted,ref } from 'vue'
import { loadPalettes } from '@/lib/palette'
import type { Palette } from '@/types/palette'
import PaletteCard from '@/components/PaletteCard.vue'
const palettes=ref<Palette[]>([]);const isLoading=ref(true)
const featuredPalettes=computed(()=>palettes.value.slice(0,3))
const sampleColors=['#0E56C4','#1485D1','#11A893','#FF5347','#7D3786']
const scatterDots=[{x:13,y:34,color:'#0E56C4'},{x:20,y:19,color:'#11A893'},{x:28,y:39,color:'#7D3786'},{x:35,y:25,color:'#FF5347'},{x:43,y:14,color:'#11A893'},{x:51,y:34,color:'#7D3786'},{x:60,y:22,color:'#0E56C4'},{x:68,y:39,color:'#FF5347'}]
onMounted(async()=>{try{palettes.value=await loadPalettes()}finally{isLoading.value=false}})
</script>
<style scoped>
.home-view{display:flex;flex-direction:column;gap:2.6rem}.hero-section{padding:2rem 2rem 0;max-width:850px}.hero-section h1{font-size:clamp(2.6rem,5vw,4.6rem);line-height:1.08;margin-bottom:1rem}.hero-section p{font-size:1.1rem;color:var(--fc-muted);margin-bottom:1.7rem}.hero-cta{min-height:46px;padding:0 1.5rem}
.workflow{border:1px solid #cbd5e1;border-radius:var(--fc-radius-large);overflow:hidden;background:#fff}.workflow>h2{font-family:inherit;font-size:1rem;font-weight:600;padding:1.25rem 2rem .8rem}.workflow-grid{display:grid;grid-template-columns:repeat(3,1fr);padding:.5rem 0 1.55rem}.workflow-step{min-width:0;padding:.25rem 2rem}.workflow-step+.workflow-step{border-left:1px solid var(--fc-line)}.step-heading{display:flex;align-items:center;gap:.8rem}.step-heading>span{color:var(--fc-primary);font-size:1.25rem}.step-heading>svg{width:27px;height:27px;fill:none;stroke:var(--fc-ink);stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}.step-heading h3{font-size:1rem}.workflow-step>p{margin:.25rem 0 1rem 5rem;color:var(--fc-muted);font-size:.78rem;white-space:nowrap}
.browse-example{height:44px;display:flex;align-items:stretch;gap:.75rem}.browse-example>span{width:42%;display:flex;align-items:center;justify-content:space-between;padding:0 .65rem;font-size:.68rem;color:var(--fc-text);border:1px solid var(--fc-line);border-radius:5px}.browse-example>span b{font-size:1rem}.browse-example>div{display:flex;flex:1;border-radius:4px;overflow:hidden}.browse-example i{flex:1}.preview-examples{height:56px;display:grid;grid-template-columns:repeat(3,1fr);gap:.5rem}.mini-chart,.chart-tile{height:56px;width:100%;border:1px solid var(--fc-line);border-radius:3px;background:#fff}.mini-chart{display:flex;align-items:end;gap:5px;padding:8px}.mini-chart i{flex:1}.chart-tile{padding:4px;fill:none}.line-tile path{stroke-width:1.5}.line-tile path:nth-child(1){stroke:#11A893}.line-tile path:nth-child(2){stroke:#1485D1}.line-tile path:nth-child(3){stroke:#FF5347}.use-example{display:flex;align-items:center;gap:.65rem;min-height:56px}.color-codes{display:flex;gap:.25rem}.color-codes code{padding:.42rem .32rem;border:1px solid;border-radius:3px;color:var(--fc-text);font-size:.55rem;background:#fff}.save-example{display:flex;align-items:center;gap:.3rem;border:1px solid #9cabc0;border-radius:4px;padding:.48rem .55rem;font-size:.62rem;white-space:nowrap}.save-example svg{width:14px;height:14px;fill:none;stroke:var(--fc-ink);stroke-width:1.6}
.section-heading{display:flex;align-items:center;gap:1.5rem;margin-bottom:1.5rem}.section-heading h2{font-family:inherit;font-size:1.15rem}.section-heading span{height:1px;background:var(--fc-line);flex:1}.palettes-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1.5rem}
@media(max-width:1024px){.workflow-step{padding:.25rem 1rem}.workflow-step>p{margin-left:4.7rem}.use-example{align-items:flex-start;flex-direction:column}.save-example{align-self:flex-end}}
@media(max-width:768px){.hero-section{padding:1rem 0}.workflow-grid{grid-template-columns:1fr}.workflow-step+.workflow-step{border-left:0;border-top:1px solid var(--fc-line)}.workflow-step{padding:1.25rem 1.5rem}.workflow-step>p{white-space:normal}.use-example{flex-direction:row;align-items:center}.save-example{align-self:auto}.palettes-grid{grid-template-columns:1fr}.home-view{gap:2rem}}
</style>
