# FigColor

Publication-ready color palettes for scientific figures.

## Overall Architecture Overview

FigColor is a full-stack application with a Vue 3 frontend and a Go backend.

- The frontend is built as a component-driven SPA using Vite, Vue 3, TypeScript, and Vue Router.
- The backend exposes REST API endpoints for authentication, palettes, projects, favorites, and user profile management.
- The frontend calls the backend via `/api/*` routes and uses JWT-based auth to manage protected routes and user sessions.
- Database state is stored in PostgreSQL, with schema initialization defined in `backend/migrations/`.

## Core Components and Technology Stack Selection

### Frontend

- `src/main.ts`: application bootstrap, global styles, auth initialization, and router mounting.
- `src/App.vue`: global layout, navigation, authentication-aware UI, and page shell.
- `src/router/index.ts`: route definitions, auth guards, and admin access control.
- `src/views/`: main feature pages such as Home, Palettes, PaletteDetail, ChartTypes, Projects, Favorites, and Profile.
- `src/components/`: shared UI components, including palette cards, preview widgets, filter sidebar, and copy/code helpers.
- `src/components/palettes/PaletteChartPreview.vue`: dynamic chart preview renderer that chooses preview templates by chart family or chart type.
- `src/components/palettes/previews/BoxplotJitterPreview.vue`: example SVG preview component for the `boxplot_jitter` chart family.
- `src/composables/useAuth.ts`: composable for auth state, token storage, login/logout, and current user loading.

### Backend

- `backend/cmd/server/main.go`: API server entrypoint that initializes configuration, DB connection, middleware, routes, and the Gin router.
- `backend/internal/config`: configuration loader for environment-driven settings like database URL, server port, JWT secret, and bcrypt cost.
- `backend/internal/database`: PostgreSQL connection management.
- `backend/internal/auth`, `backend/internal/user`, `backend/internal/project`, `backend/internal/favorite`, `backend/internal/palette`: domain-specific repositories, services, and HTTP handlers.
- `backend/internal/middleware`: middleware for CORS, authentication, and admin authorization.
- `backend/migrations/`: SQL files for schema and bootstrap migration logic.

### Technology choices

- Frontend: Vite for fast local development and build performance, Vue 3 for reactive components, TypeScript for type safety, and Vue Router for SPA navigation.
- Backend: Go for a lightweight, performant API layer; Gin for expressive HTTP routing; PostgreSQL for relational data persistence.
- Auth: JWT tokens for stateless session handling, bcrypt for secure password hashing, and middleware guards for route protection.

## Tech Stack

- Vite 5.x
- Vue 3.x
- TypeScript 5.x
- Vue Router 4.x
- Go 1.21
- Gin web framework
- PostgreSQL
- JWT auth, bcrypt, lib/pq

## Getting Started

### Frontend

```bash
# Install frontend dependencies
npm install

# Start frontend development server
npm run dev
```

### Backend

```bash
cd backend
go mod download
export DATABASE_URL="postgres://localhost:5432/figcolor?sslmode=disable"
createdb figcolor
# Apply migrations manually if needed
# psql "$DATABASE_URL" -f backend/migrations/001_init.sql
# ...
go run ./cmd/server
```

## Routes

- `/` - Home page
- `/palettes` - Browse all palettes
- `/palettes/:id` - Palette detail page
- `/chart-types` - Chart type guide

## Project Structure

```
src/
├── main.ts
├── App.vue
├── router/index.ts
├── views/
│   ├── HomeView.vue
│   ├── PalettesView.vue
│   ├── PaletteDetailView.vue
│   └── ChartTypesView.vue
├── components/
│   ├── ColorSwatch.vue
│   ├── PalettePreview.vue
│   ├── CopyCodeBlock.vue
│   ├── PaletteCard.vue
│   └── FilterSidebar.vue
├── data/palettes.json
├── lib/
│   ├── palette.ts
│   └── codegen.ts
├── types/palette.ts
└── styles/global.css
backend/
├── cmd/server/main.go
├── internal/
│   ├── auth/
│   ├── config/
│   ├── database/
│   ├── favorite/
│   ├── middleware/
│   ├── palette/
│   ├── project/
│   └── user/
└── migrations/
```

## Notes

- `src/data/palettes.json` is initialized as an empty array `[]`
- Replace with your actual palette data when ready
