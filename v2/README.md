# MIND Diet PWA - SvelteKit Version

This is the modernized version of the MIND Diet Tracker, migrated from vanilla JavaScript to SvelteKit with TypeScript.

## Project Structure

```
v2/
├── src/
│   ├── lib/
│   │   ├── components/      # UI components
│   │   │   ├── daily/       # Daily tracker components
│   │   │   ├── weekly/      # Weekly summary components
│   │   │   ├── history/     # History view components
│   │   │   ├── setup/       # Setup wizard components
│   │   │   └── shared/      # Shared/common components
│   │   ├── services/        # Business logic services
│   │   ├── stores/          # Svelte stores (state management)
│   │   ├── types/           # TypeScript type definitions
│   │   ├── utils/           # Utility functions
│   │   └── data/            # Static data (food groups, etc.)
│   ├── routes/              # SvelteKit routes/pages
│   │   ├── +layout.svelte   # Root layout
│   │   └── +page.svelte     # Home page (Daily tracker)
│   └── app.html             # HTML template
├── static/                  # Static assets (icons, etc.)
├── worker/                  # Cloudflare Worker (to be added in Phase 4)
└── build/                   # Production build output (gitignored)
```

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Open in browser at http://localhost:5173
```

## Build

```bash
# Build for production
npm run build

# Preview production build
npm run preview
```

## Migration Status

- [x] **Phase 0**: Environment setup ✅
  - SvelteKit initialized with TypeScript
  - Static adapter configured
  - PWA plugin configured
  - Project structure created
  - Icons copied

- [ ] **Phase 1**: Core Infrastructure (Next)
  - Migrate data models and types
  - Port utility functions
  - Create service layer

- [ ] **Phase 2**: State Management
  - Create Svelte stores
  - Migrate StateManager logic

- [ ] **Phase 3**: UI Components
  - Daily tracker view
  - Weekly summary view
  - History view
  - Shared components

- [ ] **Phase 4**: Cloudflare Worker + Sync
  - Worker implementation
  - Client-side encryption
  - Sync service

- [ ] **Phase 5**: Setup Wizard & Settings
  - Multi-step wizard
  - Settings modal

- [ ] **Phase 6**: Testing & Refinement
  - Comprehensive testing
  - Bug fixes
  - Performance optimization

- [ ] **Phase 7**: Cutover & Deployment
  - Move v2 to root
  - Deploy to production

## Technology Stack

- **Framework**: SvelteKit 2.x
- **Language**: TypeScript
- **Build Tool**: Vite 7.x
- **Adapter**: @sveltejs/adapter-static (for static hosting)
- **PWA**: vite-plugin-pwa with Workbox
- **State**: Svelte stores (built-in reactivity)
- **Styling**: CSS (with CSS variables for theming)

## Configuration

- **svelte.config.js**: SvelteKit configuration
- **vite.config.ts**: Vite and PWA configuration
- **tsconfig.json**: TypeScript configuration
- **.env**: Environment variables (gitignored)
- **.env.example**: Example environment configuration

## Environment Variables

```bash
# Optional: Cloudflare Worker URL (for cloud sync)
VITE_WORKER_URL=

# Development
PUBLIC_ENV=development
```

## PWA Features

- ✅ Offline functionality via service worker
- ✅ Installable to home screen
- ✅ App manifest with branding
- ✅ Icon set (192x192, 512x512)
- ✅ Cache-first strategy for static assets

## Next Steps

Follow the [REFACTOR_PLAN.md](../REFACTOR_PLAN.md) to continue with Phase 1: Core Infrastructure.

Key files to migrate next:
1. `src/lib/data/foodGroups.ts` - Food group definitions
2. `src/lib/types/index.ts` - TypeScript interfaces
3. `src/lib/utils/dateUtils.ts` - Date utilities
4. `src/lib/services/DataService.ts` - Data persistence
5. `src/lib/services/TrackingEngine.ts` - MIND diet calculations

## Reference

- Original codebase: `../client/`
- Ca-pwa blueprint: https://github.com/NateEaton/Ca-pwa
- SvelteKit docs: https://kit.svelte.dev/docs
- Migration plan: `../REFACTOR_PLAN.md`
