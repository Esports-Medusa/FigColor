import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { initAuth } from './composables/useAuth'
import './styles/global.css'

// Initialize auth state from stored token
initAuth()

createApp(App).use(router).mount('#app')
