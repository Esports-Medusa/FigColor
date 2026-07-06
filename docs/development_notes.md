# Development Notes

## Current Phase

**Goal**: Build a Vite + Vue 3 + TypeScript web application with local JSON data source for displaying, filtering, viewing, and copying scientific color palettes.

## Technical Stack

- **Build Tool**: Vite 5.x
- **Framework**: Vue 3.x (Composition API with `<script setup>`)
- **Language**: TypeScript 5.x
- **Router**: Vue Router 4.x
- **Data Source**: Local JSON file (`src/data/palettes.json`)
- **Styling**: Plain CSS with CSS variables (no UI framework)

## What We Are Building

1. **Palette Display**: Show color palettes with preview and detailed color information
2. **Filtering**: Sidebar with static filter options (UI ready, filtering logic extensible)
3. **Detail View**: Complete palette information with all metadata
4. **Code Copy**: Generate and copy color codes for Python, R, and CSS
5. **Chart Type Guide**: Static reference page for chart type recommendations

## What We Are NOT Building (Yet)

1. User authentication or login system
2. Database integration
3. Backend API
4. Web scraping for palette extraction
5. AI-powered palette generation
6. Submission or sharing system
7. Server-side rendering
8. Mobile-first responsive design (PC priority)

## Project Structure

```
src/
├── main.ts              # App entry point
├── App.vue              # Root component with navigation
├── router/
│   └── index.ts         # Route definitions
├── views/
│   ├── HomeView.vue     # Landing page
│   ├── PalettesView.vue # Palette browser with filters
│   ├── PaletteDetailView.vue # Single palette detail
│   └── ChartTypesView.vue # Chart type guide
├── components/
│   ├── ColorSwatch.vue  # Single color display
│   ├── PalettePreview.vue # Horizontal color strip
│   ├── CopyCodeBlock.vue # Code block with copy button
│   ├── PaletteCard.vue  # Palette summary card
│   └── FilterSidebar.vue # Left sidebar filters
├── data/
│   └── palettes.json    # Local palette data (user-provided)
├── lib/
│   ├── palette.ts       # Data access functions
│   └── codegen.ts       # Code generation utilities
├── types/
│   └── palette.ts      # TypeScript type definitions
└── styles/
    └── global.css       # Global styles
```

## Acceptance Criteria

### Must Have (Phase 1 Complete)

- [x] Project initializes with `npm create vite` structure
- [x] Vue Router properly configured with 4 routes
- [x] TypeScript types defined for Palette and ColorItem
- [x] `src/data/palettes.json` can be imported (empty or user-provided)
- [x] Home page displays app title and featured palettes
- [x] Palettes page shows all palettes with filter sidebar
- [x] Palette detail page shows all colors and metadata
- [x] Code generation works for HEX, Python, R, and CSS
- [x] Copy button uses clipboard API without crashing
- [x] No backend or database logic

### Code Quality

- [x] No `any` types (except where absolutely necessary)
- [x] Components use Composition API with `<script setup>`
- [x] CSS scoped to components where possible
- [x] No large UI framework dependencies

## Next Steps After Phase 1

1. Replace empty `palettes.json` with actual palette data
2. Implement filter functionality (connect sidebar to filtering logic)
3. Add search functionality
4. Create palette detail page with larger previews
5. Add accessibility features (ARIA labels, keyboard navigation)
6. Implement light/dark theme toggle
