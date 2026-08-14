import appSource from '@/App.vue?raw'
import railSource from './ChromaticSpectrumRail.vue?raw'
import logoSource from '@/components/brand/FigColorLogo.vue?raw'
import homeSource from '@/views/HomeView.vue?raw'
import projectsSource from '@/views/ProjectsView.vue?raw'
import profileSource from '@/views/ProfileView.vue?raw'
import previewSource from '@/components/palettes/PaletteChartPreview.vue?raw'

function expect(condition: boolean, message: string): void { if (!condition) throw new Error(message) }
const colors = [...railSource.matchAll(/'#[0-9A-F]{6}'/g)].map(match => match[0])
expect(appSource.includes('<ChromaticSpectrumRail />'), 'App shell renders the shared spectrum rail')
expect(appSource.includes('<FigColorLogo />'), 'App shell renders the shared vector logo')
expect(railSource.includes('aria-hidden="true"'), 'Spectrum rail is decorative')
expect(colors.length === 36, `Spectrum rail should contain 36 colors, received ${colors.length}`)
expect(colors[0] === "'#DDEAF7'" && colors[colors.length - 1] === "'#F3EBF8'", 'Spectrum endpoints keep the approved sequence')
expect(logoSource.includes('aria-label="FigColor"'), 'Logo has an accessible name')
expect(homeSource.includes('How FigColor works') && homeSource.includes('01') && homeSource.includes('02') && homeSource.includes('03'), 'Home contains the three-step workflow')
expect(!appSource.includes('How FigColor works'), 'Workflow is not repeated in the global shell')
expect(homeSource.includes('@media(max-width:768px)') && homeSource.includes('grid-template-columns:1fr'), 'Workflow has a mobile one-column layout')
expect(projectsSource.includes('+ New Project') && projectsSource.includes('@click="openProject(project)"'), 'Projects retains creation and card navigation')
expect(profileSource.includes('Email verified:') && profileSource.includes('Member since:') && profileSource.includes('handleLogout'), 'Profile retains user information and logout')
expect(previewSource.includes('background: #fff'), 'Canonical palette preview uses a white canvas')
