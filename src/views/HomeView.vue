<template>
  <div class="home-view">
    <!-- Hero Section -->
    <section class="hero-section">
      <div class="hero-content">
        <div class="hero-brand">
          <div class="brand-logo">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="40" height="40" rx="12" fill="url(#logo-gradient)"/>
              <circle cx="14" cy="14" r="5" fill="#ffffff" opacity="0.9"/>
              <circle cx="26" cy="14" r="5" fill="#ffffff" opacity="0.6"/>
              <circle cx="14" cy="26" r="5" fill="#ffffff" opacity="0.6"/>
              <circle cx="26" cy="26" r="5" fill="#ffffff" opacity="0.3"/>
              <defs>
                <linearGradient id="logo-gradient" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
                  <stop stop-color="#0066cc"/>
                  <stop offset="1" stop-color="#7c3aed"/>
                </linearGradient>
              </defs>
            </svg>
          </div>
          <span class="brand-name">FigColor</span>
        </div>
        <h1 class="hero-title">Design publication-ready scientific figures with consistent color.</h1>
        <p class="hero-subtitle">Explore curated color palettes for papers, presentations, and reproducible code.</p>
        <div class="hero-actions">
          <router-link to="/palettes" class="btn btn-primary btn-lg">
            Browse Palettes
          </router-link>
          <router-link to="/chart-types" class="btn btn-secondary btn-lg">
            View Chart Types
          </router-link>
        </div>
      </div>
    </section>

    <!-- Featured Palettes Section -->
    <section class="featured-section">
      <h2 class="section-title">Featured Palettes</h2>
      <div v-if="isLoading" class="empty-state">
        <p>Loading palettes...</p>
      </div>
      <div v-else-if="featuredPalettes.length > 0" class="palettes-grid">
        <PaletteCard
          v-for="palette in featuredPalettes"
          :key="palette.id"
          :palette="palette"
        />
      </div>
      <div v-else class="empty-state">
        <p>No palettes available yet. Check back soon!</p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { loadPalettes } from '@/lib/palette'
import type { Palette } from '@/types/palette'
import PaletteCard from '@/components/PaletteCard.vue'

const palettes = ref<Palette[]>([])
const isLoading = ref(true)

const featuredPalettes = computed(() => {
  return palettes.value.slice(0, 3)
})

onMounted(async () => {
  try {
    palettes.value = await loadPalettes()
  } finally {
    isLoading.value = false
  }
})
</script>

<style scoped>
.home-view {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4rem;
  padding: 3rem 0;
  overflow: hidden;
}

/* Hero Section */
.hero-section {
  position: relative;
  text-align: center;
  padding: 5rem 2rem;
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.95) 0%,
    rgba(248, 250, 255, 0.90) 50%,
    rgba(245, 242, 255, 0.85) 100%
  );
  backdrop-filter: blur(30px);
  border-radius: var(--radius-xl);
  border: 1px solid rgba(255, 255, 255, 0.9);
  box-shadow: 0 8px 32px rgba(0, 102, 204, 0.1);
  overflow: hidden;
}

.hero-content {
  position: relative;
  max-width: 720px;
  margin: 0 auto;
}

.hero-brand {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  margin-bottom: 2rem;
}

.brand-logo {
  filter: drop-shadow(0 4px 12px rgba(0, 102, 204, 0.3));
}

.brand-name {
  font-size: 1.5rem;
  font-weight: 700;
  background: var(--gradient-brand);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  letter-spacing: -0.02em;
}

.hero-title {
  font-size: 2.5rem;
  font-weight: 700;
  color: var(--color-text);
  line-height: 1.2;
  margin-bottom: 1rem;
  letter-spacing: -0.02em;
}

.hero-subtitle {
  font-size: 1.25rem;
  color: var(--color-text-secondary);
  margin-bottom: 2rem;
  line-height: 1.6;
}

.hero-actions {
  display: flex;
  gap: 1rem;
  justify-content: center;
  flex-wrap: wrap;
}

.btn-lg {
  padding: 0.875rem 2rem;
  font-size: 1rem;
}

/* Featured Section */
.featured-section {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.section-title {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--color-text);
  margin: 0;
}

.palettes-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1.5rem;
}

.empty-state {
  padding: 3rem;
  text-align: center;
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(10px);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.empty-state p {
  color: var(--color-text-muted);
}

/* Responsive */
@media (max-width: 768px) {
  .home-view {
    gap: 3rem;
    padding: 2rem 0;
  }

  .hero-section {
    padding: 3rem 1.5rem;
  }

  .hero-title {
    font-size: 1.875rem;
  }

  .hero-subtitle {
    font-size: 1.125rem;
  }

  .hero-actions {
    flex-direction: column;
    align-items: center;
  }

  .btn-lg {
    width: 100%;
    max-width: 280px;
  }

  .palettes-grid {
    grid-template-columns: 1fr;
  }
}
</style>
