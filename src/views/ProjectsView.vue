<template>
  <div class="projects-view">
    <header class="page-header">
      <h1>Paper Projects</h1>
      <p class="subtitle">Manage color palettes for your research papers</p>
      <button class="btn-primary" @click="showCreateModal = true">
        + New Project
      </button>
    </header>

    <!-- Projects List -->
    <div v-if="projects.length" class="projects-grid">
      <div
        v-for="project in projects"
        :key="project.id"
        class="project-card"
        @click="openProject(project)"
      >
        <div class="project-header">
          <h3>{{ project.name }}</h3>
          <span class="project-date">{{ formatDate(project.createdAt) }}</span>
        </div>
        <p class="project-description">{{ project.description || 'No description' }}</p>
        <div class="project-stats">
          <span>{{ formatDate(project.createdAt) }}</span>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else class="empty-state">
      <div class="empty-icon">📁</div>
      <h2>No projects yet</h2>
      <p>Create your first paper project to start managing consistent colors across all your figures.</p>
      <button class="btn-primary" @click="showCreateModal = true">Create First Project</button>
    </div>

    <!-- Create Modal -->
    <div v-if="showCreateModal" class="modal-overlay" @click.self="showCreateModal = false">
      <div class="modal">
        <h2>Create New Project</h2>
        <form @submit.prevent="createProject">
          <div class="form-group">
            <label for="name">Project Name</label>
            <input
              id="name"
              v-model="newProject.name"
              type="text"
              placeholder="e.g., My PhD Thesis Figures"
              required
            />
          </div>
          <div class="form-group">
            <label for="description">Description (optional)</label>
            <textarea
              id="description"
              v-model="newProject.description"
              placeholder="Brief description of your paper or research topic"
              rows="3"
            />
          </div>
          <div class="modal-actions">
            <button type="button" class="btn-secondary" @click="showCreateModal = false">
              Cancel
            </button>
            <button type="submit" class="btn-primary" :disabled="!newProject.name.trim()">
              Create Project
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import type { PaperProject } from '@/types/project'
import { getToken } from '@/api/auth'
import { apiUrl } from '@/api/baseUrl'

const router = useRouter()

const projects = ref<PaperProject[]>([])
const showCreateModal = ref(false)
const newProject = ref({ name: '', description: '' })

onMounted(() => {
  loadProjects()
})

async function loadProjects() {
  try {
    const res = await fetch(apiUrl('/me/projects'), {
      headers: {
        ...(getToken() ? { 'Authorization': `Bearer ${getToken()}` } : {})
      }
    })
    if (res.ok) {
      projects.value = await res.json()
    }
  } catch (e) {
    console.error('Failed to load projects:', e)
  }
}

async function createProject() {
  const project = {
    name: newProject.value.name.trim(),
    description: newProject.value.description.trim()
  }

  try {
    const res = await fetch(apiUrl('/me/projects'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(getToken() ? { 'Authorization': `Bearer ${getToken()}` } : {})
      },
      body: JSON.stringify(project)
    })
    if (res.ok) {
      const created = await res.json()
      projects.value.push(created)
      showCreateModal.value = false
      newProject.value = { name: '', description: '' }
      router.push(`/projects/${created.id}`)
    }
  } catch (e) {
    console.error('Failed to create project:', e)
    alert('Failed to create project')
  }
}

function openProject(project: PaperProject) {
  router.push(`/projects/${project.id}`)
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}
</script>

<style scoped>
.projects-view {
  max-width: var(--fc-content-width);
  margin: 0 auto;
  padding: 0;
}

.page-header {
  margin-bottom: 2rem;
}

.page-header h1 {
  font-size: 2rem;
  margin-bottom: 0.5rem;
}

.subtitle {
  color: #666;
  margin-bottom: 1.5rem;
}

.btn-primary {
  background: var(--fc-primary);
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 6px;
  font-size: 1rem;
  cursor: pointer;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.projects-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1.5rem;
}

.project-card {
  background: white;
  border: 1px solid var(--fc-line);
  border-radius: var(--fc-radius-card);
  padding: 1.5rem;
  cursor: pointer;
  transition: box-shadow 0.2s;
}

.project-card:hover {
  box-shadow: var(--fc-shadow-subtle);
  border-color: #b7c2d1;
}

.project-header {
  display: flex;
  justify-content: space-between;
  align-items: start;
  margin-bottom: 0.5rem;
}

.project-header h3 {
  margin: 0;
  font-size: 1.2rem;
}

.project-date {
  font-size: 0.85rem;
  color: #999;
}

.project-description {
  color: #666;
  font-size: 0.9rem;
  margin-bottom: 1rem;
}

.project-palette-preview {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.role-swatch {
  width: 32px;
  height: 32px;
  border-radius: 4px;
  border: 1px solid rgba(0, 0, 0, 0.1);
}

.project-stats {
  font-size: 0.85rem;
  color: #999;
}

.empty-state {
  text-align: center;
  padding: 4rem 2rem;
  background: #fff;
  border: 1px solid var(--fc-line);
  border-radius: 8px;
}

@media (max-width: 900px) { .projects-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 560px) { .projects-grid { grid-template-columns: 1fr; } }

.empty-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.empty-state h2 {
  margin-bottom: 0.5rem;
}

.empty-state p {
  color: #666;
  margin-bottom: 1.5rem;
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: white;
  border-radius: 8px;
  padding: 2rem;
  width: 100%;
  max-width: 480px;
}

.modal h2 {
  margin-top: 0;
  margin-bottom: 1.5rem;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
}

.form-group input,
.form-group textarea {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 1rem;
}

.modal-actions {
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
  margin-top: 1.5rem;
}

.btn-secondary {
  background: #f0f0f0;
  border: 1px solid #ddd;
  padding: 0.75rem 1.5rem;
  border-radius: 6px;
  cursor: pointer;
}
</style>
