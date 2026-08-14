<template>
  <div class="admin-dashboard">
    <div class="admin-header">
      <h1>Admin Dashboard</h1>
      <p class="subtitle">Manage your palettes and content</p>
    </div>

    <!-- Stats Cards -->
    <div class="stats-grid">
      <div class="stat-card" @click="() => navigateToPalettes()">
        <div class="stat-value">{{ stats.total }}</div>
        <div class="stat-label">Total Palettes</div>
      </div>
      <div class="stat-card draft" @click="() => navigateToPalettes('draft')">
        <div class="stat-value">{{ stats.draft }}</div>
        <div class="stat-label">Draft</div>
      </div>
      <div class="stat-card candidate" @click="() => navigateToPalettes('candidate')">
        <div class="stat-value">{{ stats.candidate }}</div>
        <div class="stat-label">Candidate</div>
      </div>
      <div class="stat-card published" @click="() => navigateToPalettes('published')">
        <div class="stat-value">{{ stats.published }}</div>
        <div class="stat-label">Published</div>
      </div>
      <div class="stat-card archived" @click="() => navigateToPalettes('archived')">
        <div class="stat-value">{{ stats.archived }}</div>
        <div class="stat-label">Archived</div>
      </div>
    </div>

    <!-- Quick Actions -->
    <div class="quick-actions">
      <h2>Quick Actions</h2>
      <div class="action-buttons">
        <button class="btn btn-primary" @click="router.push('/admin/palettes/new')">
          + New Palette
        </button>
        <button class="btn btn-secondary" @click="router.push('/admin/palettes')">
          Manage Palettes
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getPaletteStats, PaletteStats } from '@/api/admin'

const router = useRouter()

const stats = ref<PaletteStats>({
  total: 0,
  draft: 0,
  candidate: 0,
  published: 0,
  archived: 0
})

function navigateToPalettes(status?: string) {
  if (status) {
    router.push(`/admin/palettes?status=${status}`)
  } else {
    router.push('/admin/palettes')
  }
}

onMounted(async () => {
  console.log('[AdminDashboard] Component mounted, fetching stats...')
  try {
    console.log('[AdminDashboard] Calling getPaletteStats()...')
    const result = await getPaletteStats()
    console.log('[AdminDashboard] Stats received:', result)
    stats.value = result
  } catch (error) {
    console.error('[AdminDashboard] Failed to load stats:', error)
  }
})
</script>

<style scoped>
.admin-dashboard {
  padding: 2rem;
  max-width: 1200px;
  margin: 0 auto;
}

.admin-header {
  margin-bottom: 2rem;
}

.admin-header h1 {
  font-size: 1.75rem;
  font-weight: 600;
  color: #1a1a1a;
  margin-bottom: 0.25rem;
}

.subtitle {
  color: #666;
  font-size: 0.875rem;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1rem;
  margin-bottom: 2rem;
}

.stat-card {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 1.25rem;
  cursor: pointer;
  transition: box-shadow 0.2s, border-color 0.2s;
}

.stat-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  border-color: #d1d5db;
}

.stat-value {
  font-size: 2rem;
  font-weight: 700;
  color: #1a1a1a;
  line-height: 1;
  margin-bottom: 0.5rem;
}

.stat-label {
  font-size: 0.875rem;
  color: #6b7280;
}

.stat-card.draft .stat-value {
  color: #f59e0b;
}

.stat-card.candidate .stat-value {
  color: #3b82f6;
}

.stat-card.published .stat-value {
  color: #10b981;
}

.stat-card.archived .stat-value {
  color: #6b7280;
}

.quick-actions {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 1.5rem;
}

.quick-actions h2 {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 1rem;
  color: #1a1a1a;
}

.action-buttons {
  display: flex;
  gap: 0.75rem;
}

.btn {
  padding: 0.625rem 1rem;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: background-color 0.2s;
}

.btn-primary {
  background: #2563eb;
  color: white;
}

.btn-primary:hover {
  background: #1d4ed8;
}

.btn-secondary {
  background: #f3f4f6;
  color: #374151;
}

.btn-secondary:hover {
  background: #e5e7eb;
}
</style>
