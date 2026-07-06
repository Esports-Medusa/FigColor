<template>
  <div class="admin-palettes-list">
    <div class="page-header">
      <div class="header-left">
        <h1>Palettes</h1>
        <p class="subtitle">Manage your color palettes</p>
      </div>
      <button class="btn btn-primary" @click="router.push('/admin/palettes/new')">
        + New Palette
      </button>
    </div>

    <!-- Filters -->
    <div class="filters">
      <select v-model="filters.status" @change="loadPalettes">
        <option value="">All Status</option>
        <option value="draft">Draft</option>
        <option value="candidate">Candidate</option>
        <option value="published">Published</option>
        <option value="archived">Archived</option>
      </select>
      <select v-model="filters.type" @change="loadPalettes">
        <option value="">All Types</option>
        <option value="categorical">Categorical</option>
        <option value="sequential">Sequential</option>
        <option value="diverging">Diverging</option>
        <option value="qualitative">Qualitative</option>
        <option value="heatmap">Heatmap</option>
      </select>
      <select v-model="filters.chart_type" @change="loadPalettes">
        <option value="">All Chart Types</option>
        <option value="line">Line</option>
        <option value="bar">Bar</option>
        <option value="scatter">Scatter</option>
        <option value="heatmap">Heatmap</option>
        <option value="area">Area</option>
      </select>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="loading">Loading palettes...</div>

    <!-- Error State -->
    <div v-else-if="error" class="error">{{ error }}</div>

    <!-- Palettes Table -->
    <div v-else-if="palettes.length > 0" class="table-container">
      <table class="palettes-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Colors</th>
            <th>Chart Types</th>
            <th>Status</th>
            <th>Updated</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="palette in palettes" :key="palette.id">
            <td class="name-cell">
              <span class="palette-preview" :style="{ background: getPreviewGradient(palette.colors) }"></span>
              {{ palette.name }}
            </td>
            <td>{{ palette.type }}</td>
            <td>{{ palette.color_count }}</td>
            <td>
              <span v-for="ct in palette.chart_types?.slice(0, 2)" :key="ct" class="tag">
                {{ ct }}
              </span>
              <span v-if="palette.chart_types?.length > 2">+{{ palette.chart_types.length - 2 }}</span>
            </td>
            <td>
              <span :class="['status-badge', palette.status]">{{ palette.status }}</span>
            </td>
            <td>{{ formatDate(palette.updated_at) }}</td>
            <td class="actions-cell">
              <button class="btn-icon" @click="editPalette(palette.id)" title="Edit">
                ✎
              </button>
              <button 
                v-if="palette.status !== 'published'" 
                class="btn-icon success" 
                @click="publishPalette(palette)"
                title="Publish">
                ↑
              </button>
              <button 
                v-if="palette.status === 'published'" 
                class="btn-icon warning" 
                @click="unpublishPalette(palette)"
                title="Unpublish">
                ↓
              </button>
              <button class="btn-icon danger" @click="deletePalette(palette)" title="Delete">
                ✕
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Empty State -->
    <div v-else class="empty-state">
      <p>No palettes found.</p>
      <button class="btn btn-primary" @click="router.push('/admin/palettes/new')">
        Create your first palette
      </button>
    </div>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="pagination">
      <button :disabled="page === 1" @click="page--; loadPalettes()">Previous</button>
      <span>Page {{ page }} of {{ totalPages }}</span>
      <button :disabled="page === totalPages" @click="page++; loadPalettes()">Next</button>
    </div>

    <!-- Confirm Dialog -->
    <ConfirmDialog
      v-if="showConfirm"
      :title="confirmAction.title"
      :message="confirmAction.message"
      @confirm="confirmAction.handler"
      @cancel="showConfirm = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { 
  getPalettes, 
  publishPalette as apiPublishPalette, 
  unpublishPalette as apiUnpublishPalette, 
  deletePalette as apiDeletePalette,
  AdminPalette 
} from '@/api/admin'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'

const router = useRouter()
const route = useRoute()

const palettes = ref<AdminPalette[]>([])
const loading = ref(false)
const error = ref('')
const page = ref(1)
const pageSize = 20
const total = ref(0)

const filters = reactive({
  status: (route.query.status as string) || '',
  type: '',
  chart_type: '',
  journal_style: '',
  discipline: ''
})

const showConfirm = ref(false)
const confirmAction = ref({
  title: '',
  message: '',
  handler: () => {}
})

const totalPages = computed(() => Math.ceil(total.value / pageSize))

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function getPreviewGradient(colors: { hex: string }[]): string {
  if (!colors || colors.length === 0) return '#ccc'
  const stops = colors.map((c, i) => `${c.hex} ${(i / (colors.length - 1)) * 100}%`).join(', ')
  return `linear-gradient(90deg, ${stops})`
}

async function loadPalettes() {
  loading.value = true
  error.value = ''
  try {
    const response = await getPalettes({
      status: filters.status || undefined,
      type: filters.type || undefined,
      chart_type: filters.chart_type || undefined,
      journal_style: filters.journal_style || undefined,
      discipline: filters.discipline || undefined,
      page: page.value,
      page_size: pageSize
    })
    palettes.value = response.items || []
    total.value = response.total || 0
  } catch (e: any) {
    error.value = e.message || 'Failed to load palettes'
  } finally {
    loading.value = false
  }
}

function editPalette(id: string) {
  router.push(`/admin/palettes/${id}/edit`)
}

async function publishPalette(palette: AdminPalette) {
  confirmAction.value = {
    title: 'Publish Palette',
    message: `Are you sure you want to publish "${palette.name}"? It will be visible to all users.`,
    handler: async () => {
      try {
        await apiPublishPalette(palette.id)
        showConfirm.value = false
        loadPalettes()
      } catch (e: any) {
        alert(e.message || 'Failed to publish palette')
      }
    }
  }
  showConfirm.value = true
}

async function unpublishPalette(palette: AdminPalette) {
  confirmAction.value = {
    title: 'Unpublish Palette',
    message: `Are you sure you want to unpublish "${palette.name}"? It will no longer be visible to users.`,
    handler: async () => {
      try {
        await apiUnpublishPalette(palette.id)
        showConfirm.value = false
        loadPalettes()
      } catch (e: any) {
        alert(e.message || 'Failed to unpublish palette')
      }
    }
  }
  showConfirm.value = true
}

async function deletePalette(palette: AdminPalette) {
  confirmAction.value = {
    title: 'Delete Palette',
    message: `Are you sure you want to delete "${palette.name}"? This action cannot be undone.`,
    handler: async () => {
      try {
        await apiDeletePalette(palette.id)
        showConfirm.value = false
        loadPalettes()
      } catch (e: any) {
        alert(e.message || 'Failed to delete palette')
      }
    }
  }
  showConfirm.value = true
}

onMounted(() => {
  loadPalettes()
})
</script>

<style scoped>
.admin-palettes-list {
  padding: 2rem;
  max-width: 1400px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1.5rem;
}

.header-left h1 {
  font-size: 1.5rem;
  font-weight: 600;
  color: #1a1a1a;
  margin-bottom: 0.25rem;
}

.subtitle {
  color: #666;
  font-size: 0.875rem;
}

.filters {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.filters select {
  padding: 0.5rem 0.75rem;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  font-size: 0.875rem;
  background: white;
  min-width: 150px;
}

.loading, .error, .empty-state {
  text-align: center;
  padding: 3rem;
  color: #666;
}

.error {
  color: #dc2626;
}

.table-container {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
}

.palettes-table {
  width: 100%;
  border-collapse: collapse;
}

.palettes-table th {
  text-align: left;
  padding: 0.75rem 1rem;
  background: #f9fafb;
  border-bottom: 1px solid #e5e7eb;
  font-size: 0.75rem;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.palettes-table td {
  padding: 0.875rem 1rem;
  border-bottom: 1px solid #f3f4f6;
  font-size: 0.875rem;
}

.palettes-table tr:last-child td {
  border-bottom: none;
}

.palettes-table tr:hover td {
  background: #f9fafb;
}

.name-cell {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-weight: 500;
}

.palette-preview {
  width: 32px;
  height: 24px;
  border-radius: 4px;
  border: 1px solid #e5e7eb;
}

.tag {
  display: inline-block;
  padding: 0.125rem 0.5rem;
  background: #f3f4f6;
  border-radius: 4px;
  font-size: 0.75rem;
  margin-right: 0.25rem;
}

.status-badge {
  display: inline-block;
  padding: 0.25rem 0.625rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 500;
}

.status-badge.draft {
  background: #fef3c7;
  color: #92400e;
}

.status-badge.candidate {
  background: #dbeafe;
  color: #1e40af;
}

.status-badge.published {
  background: #d1fae5;
  color: #065f46;
}

.status-badge.archived {
  background: #f3f4f6;
  color: #6b7280;
}

.actions-cell {
  display: flex;
  gap: 0.5rem;
}

.btn-icon {
  width: 28px;
  height: 28px;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  background: white;
  cursor: pointer;
  font-size: 0.875rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-icon:hover {
  background: #f3f4f6;
}

.btn-icon.success {
  color: #059669;
}

.btn-icon.success:hover {
  background: #d1fae5;
}

.btn-icon.warning {
  color: #d97706;
}

.btn-icon.warning:hover {
  background: #fef3c7;
}

.btn-icon.danger {
  color: #dc2626;
}

.btn-icon.danger:hover {
  background: #fee2e2;
}

.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 1rem;
  margin-top: 1.5rem;
}

.pagination button {
  padding: 0.5rem 1rem;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: white;
  cursor: pointer;
}

.pagination button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pagination button:hover:not(:disabled) {
  background: #f3f4f6;
}

.btn {
  padding: 0.625rem 1rem;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  border: none;
}

.btn-primary {
  background: #2563eb;
  color: white;
}

.btn-primary:hover {
  background: #1d4ed8;
}
</style>