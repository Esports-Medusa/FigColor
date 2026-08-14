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

# Local API origin (copy .env.example to .env.local if needed)
export VITE_API_BASE_URL="http://localhost:8080"

# Start frontend development server
npm run dev
```

For a production frontend build, set `VITE_API_BASE_URL` to the public API
origin, such as `https://api.figcolor.xxx`. `VITE_*` values are embedded in the
browser bundle and must never contain passwords, signing secrets, or database
credentials. Cloudflare Pages copies `public/_redirects` into the build output
so Vue Router history routes fall back to `index.html`.

### Backend

```bash
cd backend
go mod download
export DATABASE_URL="postgres://localhost:5432/figcolor?sslmode=disable"
createdb figcolor
./scripts/run-migrations.sh
go run ./cmd/server
```

The server reads Render's `PORT` (falling back to `SERVER_PORT`, then `8080`)
and listens on all interfaces. Production also requires `JWT_SECRET` and should
set the frontend and CORS origins explicitly:

```bash
APP_ENV=production
APP_BASE_URL=https://figcolor.xxx
CORS_ALLOWED_ORIGINS=https://figcolor.xxx,https://www.figcolor.xxx
```

`DATABASE_URL` is required in every environment. Render can use `GET /health`
as its health-check path; the response contains only `{ "status": "ok" }`.

### Database Migrations

Run migrations from the backend directory:

```bash
cd backend
export DATABASE_URL="postgresql://username:password@host:5432/figcolor?sslmode=require"
./scripts/run-migrations.sh
```

The migration runner records each applied file and its SHA-256 checksum in
`schema_migrations`. It is safe to run the command again: already-applied files
are skipped. If an applied migration file has subsequently changed, the runner
stops with a checksum mismatch instead of modifying the database. Seed files in
`backend/dev/` are separate and are never run by the migration command.

### Admin Account

Register and verify an account normally, then promote it from the backend with
`go run ./cmd/figcolor-admin promote --email you@example.com`. No Admin password
or production account is seeded by migrations.

### Temporary Test Accounts

These local development accounts are not part of the production migration chain. To create or refresh them manually, run:

```bash
psql "$DATABASE_URL" -f dev/seed_test_users.sql
```

- Account: `test1@figcolor.local` / Password: `test1234`
- Account: `test2@figcolor.local` / Password: `test1234`
- Account: `test3@figcolor.local` / Password: `test1234`

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
