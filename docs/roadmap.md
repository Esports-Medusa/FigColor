# Roadmap

## Phase 1: Local Palette MVP (Current)

**Goal**: Build the foundational web application skeleton with local JSON data source.

### Deliverables

- [x] Vite + Vue 3 + TypeScript project setup
- [x] Vue Router configuration (4 routes)
- [x] Palette and ColorItem TypeScript types
- [x] Local JSON data import for palettes
- [x] Basic UI components (ColorSwatch, PalettePreview, PaletteCard, etc.)
- [x] Home page with featured palettes
- [x] Palettes browse page with static filter sidebar
- [x] Palette detail page with all metadata
- [x] Code generation (HEX, Python, R, CSS)
- [x] Chart Types guide page
- [x] Documentation (schema, development notes)

### Timeline
Completed.

---

## Phase 2: Filtering & Search

**Goal**: Add interactive filtering and search capabilities.

### Features

- [ ] Connect FilterSidebar to actual filtering logic
- [ ] Add search bar for palette name search
- [ ] Implement multi-select filters
- [ ] URL query parameter synchronization for filters
- [ ] Clear all filters button
- [ ] Filter result count display

### Technical Considerations

- Use Vue Router query params for filter state
- Debounce search input
- Consider URL encoding for shareable filtered views

---

## Phase 3: Database Migration

**Goal**: Move from local JSON to a proper database.

### Features

- [ ] Database selection (PostgreSQL, SQLite, or similar)
- [ ] Data migration scripts
- [ ] API layer for CRUD operations
- [ ] Admin interface for palette management
- [ ] Data validation layer
- [ ] Migration to proper ID system (if needed)

### Technical Considerations

- Keep JSON import/export capability
- Design API for future multi-user scenarios
- Consider CORS implications

---

## Phase 4: Research Palette Extraction

**Goal**: Automate palette extraction from published scientific figures.

### Features

- [ ] PDF upload functionality
- [ ] Image color extraction algorithms
- [ ] Integration with existing palette database
- [ ] Source citation tracking
- [ ] Quality assessment for extracted palettes

### Technical Considerations

- Use canvas or specialized library for color extraction
- Handle various image formats (PNG, JPEG, SVG)
- Implement rate limiting for batch processing

---

## Phase 5: Advanced Features

**Goal**: Add features for power users and accessibility.

### Features

- [ ] User accounts and saved palettes
- [ ] Palette comparison tool
- [ ] Custom palette creation
- [ ] Export to more formats (LaTeX, MATLAB, etc.)
- [ ] Colorblind simulation preview
- [ ] Print preview mode
- [ ] Palette recommendation engine
- [ ] Mobile responsive design
- [ ] Internationalization (i18n)

### Technical Considerations

- Progressive Web App (PWA) capabilities
- Service worker for offline access
- Implement proper color vision deficiency simulations

---

## Future Considerations

- Integration with popular plotting libraries (matplotlib, ggplot2, plotly)
- Browser extension for quick palette access
- Collaborative palette rating and comments
- API for third-party integrations
- AI-powered palette suggestions based on manuscript content
