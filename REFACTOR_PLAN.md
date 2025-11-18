# MIND Diet PWA - SvelteKit + Cloudflare Workers Migration Plan

**Version**: 1.0
**Date**: 2025-11-18
**Migration Strategy**: Big Bang (Clean Cutover)

---

## Executive Summary

This plan outlines the migration of the MIND Diet PWA from vanilla JavaScript to SvelteKit with Cloudflare Workers + KV for sync, replacing the current Google Drive/Dropbox OAuth architecture.

**Key Simplifications** (based on requirements):
- ✅ No data migration needed (fresh start acceptable)
- ✅ Clean cutover from old sync to new sync
- ✅ No backward compatibility required
- ✅ PIN/password feature deferred
- ✅ Big bang approach feasible

**Timeline**: 6-8 weeks (single developer)
**Approach**: Parallel development in branch, then cutover
**Blueprint**: Ca-pwa repository patterns

---

## Development Approach: Parallel Directory Strategy

### Repository Structure

```
mind-pwa/
├── .git/
├── client/              # OLD - Keep for reference during development
├── server/              # OLD - Will be replaced by Cloudflare Worker
├── v2/                  # NEW - SvelteKit application
│   ├── src/
│   ├── static/
│   ├── worker/          # NEW - Cloudflare Worker
│   ├── package.json
│   ├── svelte.config.js
│   └── vite.config.js
├── package.json         # Monorepo (will be replaced)
└── REFACTOR_PLAN.md     # This document
```

### Branch Strategy

1. **Development Branch**: `feature/svelte-migration`
2. **Development Phase**: Build in `v2/` directory
3. **Cutover Phase**:
   - Delete `client/`, `server/`, old `package.json`
   - Move `v2/*` contents to root
   - Clean commit: "Migrate to SvelteKit + Cloudflare Workers"
4. **Merge**: Feature branch → main

**Rationale**:
- Easy reference to old code during development
- Clean final structure
- Single repo management
- Clear history of migration

---

## Phase 0: Environment Setup (Week 1, Days 1-2)

### Prerequisites

**Required Installations**:
```bash
# Verify Node.js version
node --version  # Should be >= 18.0.0

# Install/update pnpm (optional but recommended)
npm install -g pnpm

# Install Wrangler CLI (Cloudflare Workers)
npm install -g wrangler

# Verify Wrangler installation
wrangler --version
```

**Cloudflare Account Setup**:
1. Create account at https://dash.cloudflare.com/sign-up
2. Login via Wrangler: `wrangler login`
3. Create KV namespaces (will do in Phase 2)

**Development Tools** (Recommended):
- VS Code with extensions:
  - Svelte for VS Code
  - Svelte Intellisense
  - TypeScript and JavaScript Language Features
  - ESLint
  - Prettier

### Initial Branch & Directory Setup

```bash
# Create and switch to development branch
cd /home/user/mind-pwa
git checkout -b feature/svelte-migration

# Create v2 directory for new application
mkdir v2
cd v2

# Initialize SvelteKit project
npm create svelte@latest .
```

**SvelteKit Init Selections**:
- Project template: **Skeleton project**
- Type checking: **Yes, using TypeScript**
- Additional options:
  - ✅ ESLint
  - ✅ Prettier
  - ✅ Vitest (for unit tests)
  - ❌ Playwright (skip for now)

```bash
# Install dependencies
npm install

# Install additional dependencies
npm install -D @sveltejs/adapter-static vite-plugin-pwa
npm install axios qrcode

# Verify development server works
npm run dev
# Open http://localhost:5173, verify default page loads
# Ctrl+C to stop
```

### Project Configuration

**1. Configure for Static Adapter** (`v2/svelte.config.js`):

```javascript
import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: 'index.html',
      precompress: false
    }),
    paths: {
      base: process.env.BASE_PATH || ''
    }
  }
};

export default config;
```

**2. Configure Vite for PWA** (`v2/vite.config.ts`):

```typescript
import { sveltekit } from '@sveltejs/kit/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    sveltekit(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'MIND Diet Tracker',
        short_name: 'MIND Diet',
        description: 'Track your daily adherence to the MIND Diet',
        theme_color: '#4a5568',
        background_color: '#ffffff',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      }
    })
  ]
});
```

**3. TypeScript Configuration** (`v2/tsconfig.json` - already created, verify):

```json
{
  "extends": "./.svelte-kit/tsconfig.json",
  "compilerOptions": {
    "allowJs": true,
    "checkJs": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "sourceMap": true,
    "strict": true,
    "moduleResolution": "bundler"
  }
}
```

**4. Environment Variables** (`v2/.env.example`):

```bash
# Optional: Cloudflare Worker URL (for cloud sync)
VITE_WORKER_URL=

# Development
PUBLIC_ENV=development
```

**5. Copy Static Assets**:

```bash
# Copy PWA icons and manifest from old client
cd v2/static
mkdir -p icons
# Copy icons from ../client/public/ to static/icons/
# Rename/reorganize as needed for icon-192x192.png, icon-512x512.png
```

### Verify Environment

```bash
cd v2
npm run dev

# Checklist:
# ✅ Dev server starts on http://localhost:5173
# ✅ No TypeScript errors
# ✅ Hot module replacement works (edit +page.svelte, see changes)
# ✅ Console shows no errors

# Build test
npm run build
npm run preview

# ✅ Build succeeds
# ✅ Preview server works on http://localhost:4173
```

**Checkpoint**: Environment ready ✅

---

## Phase 1: Core Infrastructure (Week 1, Days 3-5)

### Create Project Structure

```bash
cd v2/src/lib

# Create directories
mkdir -p components/{daily,weekly,history,setup,shared}
mkdir -p services
mkdir -p stores
mkdir -p types
mkdir -p utils
mkdir -p data
```

### Migrate Data Definitions

**`v2/src/lib/data/foodGroups.ts`** - Copy from `client/src/data/foodGroups.js`:

```typescript
export interface FoodGroup {
  id: string;
  name: string;
  category: 'healthy' | 'unhealthy';
  targetType: 'daily' | 'weekly';
  dailyTarget?: number;
  weeklyTarget?: number;
  weeklyLimit?: number;
  servingExamples: string[];
  color: string;
}

export const foodGroups: FoodGroup[] = [
  {
    id: 'green-leafy-vegetables',
    name: 'Green Leafy Vegetables',
    category: 'healthy',
    targetType: 'daily',
    dailyTarget: 1,
    servingExamples: [
      '1 cup raw',
      '½ cup cooked spinach, kale, collards, or other greens'
    ],
    color: '#10b981'
  },
  // ... copy all 14 food groups from client/src/data/foodGroups.js
];
```

**`v2/src/lib/types/index.ts`**:

```typescript
export interface FoodGroup {
  id: string;
  name: string;
  category: 'healthy' | 'unhealthy';
  targetType: 'daily' | 'weekly';
  dailyTarget?: number;
  weeklyTarget?: number;
  weeklyLimit?: number;
  servingExamples: string[];
  color: string;
}

export interface DailyCounts {
  [date: string]: {
    [foodGroupId: string]: number;
  };
}

export interface WeeklyCounts {
  [foodGroupId: string]: number;
}

export interface HistoryEntry {
  weekStartDate: string;
  weeklyCounts: WeeklyCounts;
  dailyEntries: {
    [date: string]: {
      [foodGroupId: string]: number;
    };
  };
  lastModified: string;
}

export interface AppMetadata {
  lastModified: string | null;
  weekStartDay: 'Sunday' | 'Monday';
  syncGenerationId?: string;
  deviceId?: string;
}

export interface AppSettings {
  weekStartDay: 'Sunday' | 'Monday';
  theme: 'light' | 'dark' | 'auto';
  cloudSyncEnabled: boolean;
  syncDocId?: string;
}
```

### Migrate Utility Functions

**`v2/src/lib/utils/dateUtils.ts`** - Port from `client/src/utils/dateUtils.js`:

```typescript
export class DateUtils {
  /**
   * Format date as YYYY-MM-DD
   */
  static formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Parse YYYY-MM-DD string to Date
   */
  static parseDate(dateStr: string): Date {
    return new Date(dateStr + 'T00:00:00');
  }

  /**
   * Get week start date for a given date
   */
  static getWeekStartDate(date: Date, weekStartDay: 'Sunday' | 'Monday'): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = weekStartDay === 'Sunday'
      ? day
      : (day === 0 ? 6 : day - 1);

    d.setDate(d.getDate() - diff);
    return d;
  }

  /**
   * Get array of dates in a week
   */
  static getWeekDates(weekStartDate: Date): Date[] {
    const dates: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStartDate);
      date.setDate(weekStartDate.getDate() + i);
      dates.push(date);
    }
    return dates;
  }

  /**
   * Check if two dates are the same day
   */
  static isSameDay(date1: Date, date2: Date): boolean {
    return this.formatDate(date1) === this.formatDate(date2);
  }

  /**
   * Get today's date (midnight)
   */
  static getToday(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  // Add other utility methods from dateUtils.js as needed
}
```

**`v2/src/lib/utils/appUtils.ts`** - Port relevant utilities:

```typescript
export class AppUtils {
  /**
   * Generate unique device ID
   */
  static generateDeviceId(): string {
    return `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Validate email format
   */
  static isValidEmail(email: string): boolean {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  }

  /**
   * Deep clone object
   */
  static deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
  }

  // Add other utilities as needed
}
```

### Migrate Services

**`v2/src/lib/services/DataService.ts`** - Port from `client/src/core/dataService.js`:

```typescript
import type { DailyCounts, HistoryEntry, AppSettings, AppMetadata } from '$lib/types';
import { DateUtils } from '$lib/utils/dateUtils';

const STORAGE_KEYS = {
  DAILY_COUNTS: 'mindDiet_dailyCounts',
  HISTORY: 'mindDiet_history',
  SETTINGS: 'mindDiet_settings',
  METADATA: 'mindDiet_metadata',
  SYNC_ENCRYPTION_KEY: 'mindDiet_syncKey'
};

export class DataService {
  /**
   * Load daily counts from localStorage
   */
  static loadDailyCounts(): DailyCounts {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.DAILY_COUNTS);
      return data ? JSON.parse(data) : {};
    } catch (error) {
      console.error('Error loading daily counts:', error);
      return {};
    }
  }

  /**
   * Save daily counts to localStorage
   */
  static saveDailyCounts(counts: DailyCounts): void {
    try {
      localStorage.setItem(STORAGE_KEYS.DAILY_COUNTS, JSON.stringify(counts));
    } catch (error) {
      console.error('Error saving daily counts:', error);
    }
  }

  /**
   * Load history from localStorage
   */
  static loadHistory(): HistoryEntry[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.HISTORY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error loading history:', error);
      return [];
    }
  }

  /**
   * Save history to localStorage
   */
  static saveHistory(history: HistoryEntry[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history));
    } catch (error) {
      console.error('Error saving history:', error);
    }
  }

  /**
   * Load settings
   */
  static loadSettings(): AppSettings {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      return data ? JSON.parse(data) : {
        weekStartDay: 'Sunday',
        theme: 'auto',
        cloudSyncEnabled: false
      };
    } catch (error) {
      console.error('Error loading settings:', error);
      return {
        weekStartDay: 'Sunday',
        theme: 'auto',
        cloudSyncEnabled: false
      };
    }
  }

  /**
   * Save settings
   */
  static saveSettings(settings: AppSettings): void {
    try {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  }

  /**
   * Load metadata
   */
  static loadMetadata(): AppMetadata {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.METADATA);
      return data ? JSON.parse(data) : {
        lastModified: null,
        weekStartDay: 'Sunday'
      };
    } catch (error) {
      console.error('Error loading metadata:', error);
      return {
        lastModified: null,
        weekStartDay: 'Sunday'
      };
    }
  }

  /**
   * Save metadata
   */
  static saveMetadata(metadata: AppMetadata): void {
    try {
      localStorage.setItem(STORAGE_KEYS.METADATA, JSON.stringify(metadata));
    } catch (error) {
      console.error('Error saving metadata:', error);
    }
  }

  /**
   * Export all data as JSON
   */
  static exportData(): string {
    return JSON.stringify({
      dailyCounts: this.loadDailyCounts(),
      history: this.loadHistory(),
      settings: this.loadSettings(),
      metadata: this.loadMetadata(),
      exportDate: new Date().toISOString()
    }, null, 2);
  }

  /**
   * Import data from JSON
   */
  static importData(jsonString: string): boolean {
    try {
      const data = JSON.parse(jsonString);

      if (data.dailyCounts) this.saveDailyCounts(data.dailyCounts);
      if (data.history) this.saveHistory(data.history);
      if (data.settings) this.saveSettings(data.settings);
      if (data.metadata) this.saveMetadata(data.metadata);

      return true;
    } catch (error) {
      console.error('Error importing data:', error);
      return false;
    }
  }

  /**
   * Clear all data
   */
  static clearAllData(): void {
    Object.values(STORAGE_KEYS).forEach(key => {
      localStorage.removeItem(key);
    });
  }
}
```

**`v2/src/lib/services/TrackingEngine.ts`** - Port from `client/src/core/trackingEngine.js`:

```typescript
import type { FoodGroup, DailyCounts, WeeklyCounts } from '$lib/types';
import { DateUtils } from '$lib/utils/dateUtils';

export class TrackingEngine {
  /**
   * Calculate weekly totals from daily counts
   */
  static calculateWeeklyTotals(
    dailyCounts: DailyCounts,
    weekStartDate: Date,
    foodGroups: FoodGroup[]
  ): WeeklyCounts {
    const weekDates = DateUtils.getWeekDates(weekStartDate);
    const totals: WeeklyCounts = {};

    foodGroups.forEach(fg => {
      totals[fg.id] = 0;
    });

    weekDates.forEach(date => {
      const dateKey = DateUtils.formatDate(date);
      const dayCounts = dailyCounts[dateKey] || {};

      Object.entries(dayCounts).forEach(([foodId, count]) => {
        totals[foodId] = (totals[foodId] || 0) + count;
      });
    });

    return totals;
  }

  /**
   * Check if daily target is met
   */
  static isDailyTargetMet(count: number, foodGroup: FoodGroup): boolean {
    if (foodGroup.targetType !== 'daily' || !foodGroup.dailyTarget) {
      return false;
    }
    return count >= foodGroup.dailyTarget;
  }

  /**
   * Check if weekly target is met
   */
  static isWeeklyTargetMet(count: number, foodGroup: FoodGroup): boolean {
    if (foodGroup.targetType !== 'weekly') {
      return false;
    }
    if (foodGroup.weeklyTarget) {
      return count >= foodGroup.weeklyTarget;
    }
    return false;
  }

  /**
   * Check if weekly limit is exceeded
   */
  static isWeeklyLimitExceeded(count: number, foodGroup: FoodGroup): boolean {
    if (!foodGroup.weeklyLimit) {
      return false;
    }
    return count > foodGroup.weeklyLimit;
  }

  /**
   * Get status color for count
   */
  static getStatusColor(count: number, foodGroup: FoodGroup, isWeekly: boolean): string {
    if (isWeekly) {
      if (foodGroup.category === 'unhealthy') {
        return this.isWeeklyLimitExceeded(count, foodGroup) ? '#ef4444' : '#10b981';
      } else {
        return this.isWeeklyTargetMet(count, foodGroup) ? '#10b981' : '#6b7280';
      }
    } else {
      if (foodGroup.targetType === 'daily') {
        return this.isDailyTargetMet(count, foodGroup) ? '#10b981' : '#6b7280';
      }
      return '#6b7280';
    }
  }
}
```

**Checkpoint**: Core infrastructure complete ✅

---

## Phase 2: State Management (Week 2, Days 1-2)

### Create Svelte Stores

**`v2/src/lib/stores/mindDiet.ts`**:

```typescript
import { writable, derived, get } from 'svelte/store';
import type { DailyCounts, WeeklyCounts, HistoryEntry, AppSettings, AppMetadata } from '$lib/types';
import { DataService } from '$lib/services/DataService';
import { TrackingEngine } from '$lib/services/TrackingEngine';
import { DateUtils } from '$lib/utils/dateUtils';
import { foodGroups } from '$lib/data/foodGroups';

// Initialize from localStorage
const initialSettings = DataService.loadSettings();
const initialDailyCounts = DataService.loadDailyCounts();
const initialHistory = DataService.loadHistory();
const initialMetadata = DataService.loadMetadata();

// Core state
export const settings = writable<AppSettings>(initialSettings);
export const dailyCounts = writable<DailyCounts>(initialDailyCounts);
export const history = writable<HistoryEntry[]>(initialHistory);
export const metadata = writable<AppMetadata>(initialMetadata);
export const currentDate = writable<Date>(DateUtils.getToday());

// Derived state
export const currentWeekStartDate = derived(
  [currentDate, settings],
  ([$currentDate, $settings]) => {
    return DateUtils.getWeekStartDate($currentDate, $settings.weekStartDay);
  }
);

export const currentWeekCounts = derived(
  [dailyCounts, currentWeekStartDate],
  ([$dailyCounts, $currentWeekStartDate]) => {
    return TrackingEngine.calculateWeeklyTotals($dailyCounts, $currentWeekStartDate, foodGroups);
  }
);

export const currentDayDateString = derived(
  currentDate,
  ($currentDate) => DateUtils.formatDate($currentDate)
);

// Persist changes to localStorage
dailyCounts.subscribe(value => {
  DataService.saveDailyCounts(value);
});

history.subscribe(value => {
  DataService.saveHistory(value);
});

settings.subscribe(value => {
  DataService.saveSettings(value);
});

metadata.subscribe(value => {
  DataService.saveMetadata(value);
});

// Actions
export const mindDietActions = {
  /**
   * Update count for a food group on a specific date
   */
  updateDailyCount(date: string, foodGroupId: string, count: number) {
    dailyCounts.update(counts => {
      const newCounts = { ...counts };
      if (!newCounts[date]) {
        newCounts[date] = {};
      }
      newCounts[date][foodGroupId] = Math.max(0, count);
      return newCounts;
    });

    // Update metadata
    metadata.update(m => ({
      ...m,
      lastModified: new Date().toISOString()
    }));
  },

  /**
   * Increment count
   */
  incrementCount(date: string, foodGroupId: string) {
    const counts = get(dailyCounts);
    const currentCount = counts[date]?.[foodGroupId] || 0;
    this.updateDailyCount(date, foodGroupId, currentCount + 1);
  },

  /**
   * Decrement count
   */
  decrementCount(date: string, foodGroupId: string) {
    const counts = get(dailyCounts);
    const currentCount = counts[date]?.[foodGroupId] || 0;
    if (currentCount > 0) {
      this.updateDailyCount(date, foodGroupId, currentCount - 1);
    }
  },

  /**
   * Reset daily counts for a date
   */
  resetDayCount(date: string) {
    dailyCounts.update(counts => {
      const newCounts = { ...counts };
      delete newCounts[date];
      return newCounts;
    });
  },

  /**
   * Set current date
   */
  setCurrentDate(date: Date) {
    currentDate.set(date);
  },

  /**
   * Navigate to previous day
   */
  previousDay() {
    currentDate.update(d => {
      const newDate = new Date(d);
      newDate.setDate(newDate.getDate() - 1);
      return newDate;
    });
  },

  /**
   * Navigate to next day
   */
  nextDay() {
    currentDate.update(d => {
      const newDate = new Date(d);
      newDate.setDate(newDate.getDate() + 1);
      return newDate;
    });
  },

  /**
   * Go to today
   */
  goToToday() {
    currentDate.set(DateUtils.getToday());
  },

  /**
   * Update settings
   */
  updateSettings(newSettings: Partial<AppSettings>) {
    settings.update(s => ({ ...s, ...newSettings }));
  },

  /**
   * Archive current week to history
   */
  archiveCurrentWeek() {
    const $currentWeekStartDate = get(currentWeekStartDate);
    const $dailyCounts = get(dailyCounts);
    const $currentWeekCounts = get(currentWeekCounts);

    const weekDates = DateUtils.getWeekDates($currentWeekStartDate);
    const dailyEntries: { [date: string]: { [foodGroupId: string]: number } } = {};

    weekDates.forEach(date => {
      const dateKey = DateUtils.formatDate(date);
      if ($dailyCounts[dateKey]) {
        dailyEntries[dateKey] = { ...$dailyCounts[dateKey] };
      }
    });

    const historyEntry: HistoryEntry = {
      weekStartDate: DateUtils.formatDate($currentWeekStartDate),
      weeklyCounts: { ...$currentWeekCounts },
      dailyEntries,
      lastModified: new Date().toISOString()
    };

    history.update(h => {
      // Check if entry for this week already exists
      const existingIndex = h.findIndex(
        entry => entry.weekStartDate === historyEntry.weekStartDate
      );

      if (existingIndex >= 0) {
        // Update existing
        const newHistory = [...h];
        newHistory[existingIndex] = historyEntry;
        return newHistory;
      } else {
        // Add new, sorted by date descending
        return [historyEntry, ...h].sort((a, b) =>
          b.weekStartDate.localeCompare(a.weekStartDate)
        );
      }
    });
  },

  /**
   * Export all data
   */
  exportData(): string {
    return DataService.exportData();
  },

  /**
   * Import data
   */
  importData(jsonString: string): boolean {
    const success = DataService.importData(jsonString);
    if (success) {
      // Reload all stores
      settings.set(DataService.loadSettings());
      dailyCounts.set(DataService.loadDailyCounts());
      history.set(DataService.loadHistory());
      metadata.set(DataService.loadMetadata());
    }
    return success;
  },

  /**
   * Clear all data
   */
  clearAllData() {
    if (confirm('Are you sure you want to clear all data? This cannot be undone.')) {
      DataService.clearAllData();
      settings.set({
        weekStartDay: 'Sunday',
        theme: 'auto',
        cloudSyncEnabled: false
      });
      dailyCounts.set({});
      history.set([]);
      metadata.set({
        lastModified: null,
        weekStartDay: 'Sunday'
      });
    }
  }
};
```

**`v2/src/lib/stores/networkStatus.ts`** - Copy from Ca-pwa:

```typescript
import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export const isOnline = writable(browser ? navigator.onLine : true);

if (browser) {
  window.addEventListener('online', () => isOnline.set(true));
  window.addEventListener('offline', () => isOnline.set(false));
}
```

**Checkpoint**: State management complete ✅

---

## Phase 3: UI Components (Week 2-3)

### Layout & Theme

**`v2/src/routes/+layout.svelte`**:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { settings } from '$lib/stores/mindDiet';
  import '../app.css';

  let theme: 'light' | 'dark' | 'auto' = 'auto';

  $: {
    if (typeof window !== 'undefined') {
      applyTheme($settings.theme);
    }
  }

  function applyTheme(newTheme: 'light' | 'dark' | 'auto') {
    theme = newTheme;

    if (theme === 'auto') {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.classList.toggle('dark', isDark);
    } else {
      document.documentElement.classList.toggle('dark', theme === 'dark');
    }
  }

  onMount(() => {
    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if ($settings.theme === 'auto') {
        applyTheme('auto');
      }
    };
    mediaQuery.addEventListener('change', handler);

    return () => mediaQuery.removeEventListener('change', handler);
  });
</script>

<div class="app">
  <slot />
</div>

<style>
  :global(:root) {
    --color-primary: #4a5568;
    --color-success: #10b981;
    --color-error: #ef4444;
    --color-warning: #f59e0b;
    --color-text: #1f2937;
    --color-text-secondary: #6b7280;
    --color-bg: #ffffff;
    --color-bg-secondary: #f3f4f6;
    --color-border: #e5e7eb;
  }

  :global(.dark) {
    --color-text: #f9fafb;
    --color-text-secondary: #d1d5db;
    --color-bg: #1f2937;
    --color-bg-secondary: #374151;
    --color-border: #4b5563;
  }

  :global(body) {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    background-color: var(--color-bg);
    color: var(--color-text);
  }

  .app {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  /* Add more global styles as needed */
</style>
```

**`v2/src/app.css`** - Create base styles (adapt from Ca-pwa or Tailwind patterns)

### Main Daily Tracker View

**`v2/src/routes/+page.svelte`**:

```svelte
<script lang="ts">
  import { currentDate, currentDayDateString, dailyCounts, mindDietActions } from '$lib/stores/mindDiet';
  import { foodGroups } from '$lib/data/foodGroups';
  import { DateUtils } from '$lib/utils/dateUtils';
  import FoodGroupCard from '$lib/components/daily/FoodGroupCard.svelte';
  import DateNavigator from '$lib/components/shared/DateNavigator.svelte';

  $: counts = $dailyCounts[$currentDayDateString] || {};
  $: isToday = DateUtils.isSameDay($currentDate, DateUtils.getToday());
</script>

<svelte:head>
  <title>MIND Diet Tracker - Daily</title>
</svelte:head>

<div class="daily-view">
  <header>
    <h1>Daily Tracker</h1>
    <DateNavigator
      date={$currentDate}
      on:previous={() => mindDietActions.previousDay()}
      on:next={() => mindDietActions.nextDay()}
      on:today={() => mindDietActions.goToToday()}
    />
  </header>

  <main>
    <div class="food-groups">
      {#each foodGroups as foodGroup}
        <FoodGroupCard
          {foodGroup}
          count={counts[foodGroup.id] || 0}
          date={$currentDayDateString}
        />
      {/each}
    </div>
  </main>
</div>

<style>
  .daily-view {
    padding: 1rem;
    max-width: 1200px;
    margin: 0 auto;
  }

  header {
    margin-bottom: 2rem;
  }

  h1 {
    margin: 0 0 1rem 0;
    font-size: 2rem;
    color: var(--color-text);
  }

  .food-groups {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 1rem;
  }

  @media (max-width: 768px) {
    .food-groups {
      grid-template-columns: 1fr;
    }
  }
</style>
```

### Food Group Component

**`v2/src/lib/components/daily/FoodGroupCard.svelte`**:

```svelte
<script lang="ts">
  import type { FoodGroup } from '$lib/types';
  import { mindDietActions } from '$lib/stores/mindDiet';
  import { TrackingEngine } from '$lib/services/TrackingEngine';

  export let foodGroup: FoodGroup;
  export let count: number;
  export let date: string;

  $: statusColor = TrackingEngine.getStatusColor(count, foodGroup, false);
  $: targetMet = foodGroup.targetType === 'daily' && TrackingEngine.isDailyTargetMet(count, foodGroup);

  function increment() {
    mindDietActions.incrementCount(date, foodGroup.id);
  }

  function decrement() {
    mindDietActions.decrementCount(date, foodGroup.id);
  }
</script>

<div class="food-group-card" style="border-left: 4px solid {foodGroup.color}">
  <div class="header">
    <h3>{foodGroup.name}</h3>
    {#if foodGroup.targetType === 'daily' && foodGroup.dailyTarget}
      <span class="target">Target: {foodGroup.dailyTarget}/day</span>
    {:else if foodGroup.weeklyTarget}
      <span class="target">Target: {foodGroup.weeklyTarget}/week</span>
    {/if}
  </div>

  <div class="controls">
    <button class="btn-decrement" on:click={decrement} disabled={count === 0}>
      −
    </button>
    <div class="count" style="color: {statusColor}">
      {count}
      {#if targetMet}
        <span class="check">✓</span>
      {/if}
    </div>
    <button class="btn-increment" on:click={increment}>
      +
    </button>
  </div>

  <div class="serving-examples">
    {#each foodGroup.servingExamples.slice(0, 2) as example}
      <div class="example">{example}</div>
    {/each}
  </div>
</div>

<style>
  .food-group-card {
    background: var(--color-bg-secondary);
    border-radius: 8px;
    padding: 1rem;
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .food-group-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 1rem;
  }

  h3 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--color-text);
  }

  .target {
    font-size: 0.85rem;
    color: var(--color-text-secondary);
  }

  .controls {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .count {
    font-size: 2.5rem;
    font-weight: 700;
    min-width: 80px;
    text-align: center;
    position: relative;
  }

  .check {
    position: absolute;
    top: 0;
    right: -20px;
    font-size: 1.5rem;
    color: var(--color-success);
  }

  button {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    border: 2px solid var(--color-border);
    background: var(--color-bg);
    font-size: 1.5rem;
    cursor: pointer;
    transition: all 0.2s;
    color: var(--color-text);
  }

  button:hover:not(:disabled) {
    background: var(--color-primary);
    color: white;
    border-color: var(--color-primary);
  }

  button:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .serving-examples {
    padding-top: 0.5rem;
    border-top: 1px solid var(--color-border);
  }

  .example {
    font-size: 0.85rem;
    color: var(--color-text-secondary);
    margin-top: 0.25rem;
  }
</style>
```

### Date Navigator Component

**`v2/src/lib/components/shared/DateNavigator.svelte`**:

```svelte
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { DateUtils } from '$lib/utils/dateUtils';

  export let date: Date;

  const dispatch = createEventDispatcher();

  $: dateString = date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  $: isToday = DateUtils.isSameDay(date, DateUtils.getToday());
</script>

<div class="date-navigator">
  <button class="nav-btn" on:click={() => dispatch('previous')} aria-label="Previous day">
    ◀
  </button>

  <div class="date-display">
    {dateString}
    {#if isToday}
      <span class="today-badge">Today</span>
    {/if}
  </div>

  <button class="nav-btn" on:click={() => dispatch('next')} aria-label="Next day">
    ▶
  </button>

  {#if !isToday}
    <button class="today-btn" on:click={() => dispatch('today')}>
      Go to Today
    </button>
  {/if}
</div>

<style>
  .date-navigator {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    background: var(--color-bg-secondary);
    border-radius: 8px;
  }

  .date-display {
    flex: 1;
    text-align: center;
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--color-text);
  }

  .today-badge {
    display: inline-block;
    margin-left: 0.5rem;
    padding: 0.25rem 0.5rem;
    background: var(--color-success);
    color: white;
    font-size: 0.75rem;
    border-radius: 4px;
  }

  .nav-btn, .today-btn {
    padding: 0.5rem 1rem;
    border: 2px solid var(--color-border);
    background: var(--color-bg);
    color: var(--color-text);
    border-radius: 4px;
    cursor: pointer;
    font-weight: 600;
    transition: all 0.2s;
  }

  .nav-btn:hover, .today-btn:hover {
    background: var(--color-primary);
    color: white;
    border-color: var(--color-primary);
  }

  @media (max-width: 768px) {
    .date-navigator {
      flex-wrap: wrap;
    }

    .date-display {
      flex-basis: 100%;
      order: -1;
      margin-bottom: 0.5rem;
    }
  }
</style>
```

### Weekly View

**`v2/src/routes/weekly/+page.svelte`**:

```svelte
<script lang="ts">
  import { currentWeekStartDate, currentWeekCounts, dailyCounts } from '$lib/stores/mindDiet';
  import { foodGroups } from '$lib/data/foodGroups';
  import { DateUtils } from '$lib/utils/dateUtils';
  import { TrackingEngine } from '$lib/services/TrackingEngine';
  import WeeklyFoodGroupRow from '$lib/components/weekly/WeeklyFoodGroupRow.svelte';

  $: weekDates = DateUtils.getWeekDates($currentWeekStartDate);
  $: weekLabel = `Week of ${DateUtils.formatDate($currentWeekStartDate)}`;
</script>

<svelte:head>
  <title>MIND Diet Tracker - Weekly Summary</title>
</svelte:head>

<div class="weekly-view">
  <header>
    <h1>Weekly Summary</h1>
    <p class="week-label">{weekLabel}</p>
  </header>

  <main>
    <div class="weekly-table">
      <div class="table-header">
        <div class="food-group-col">Food Group</div>
        <div class="total-col">Total</div>
        <div class="target-col">Target</div>
        <div class="status-col">Status</div>
      </div>

      {#each foodGroups as foodGroup}
        <WeeklyFoodGroupRow
          {foodGroup}
          count={$currentWeekCounts[foodGroup.id] || 0}
        />
      {/each}
    </div>
  </main>
</div>

<style>
  .weekly-view {
    padding: 1rem;
    max-width: 1200px;
    margin: 0 auto;
  }

  header {
    margin-bottom: 2rem;
  }

  h1 {
    margin: 0 0 0.5rem 0;
    font-size: 2rem;
    color: var(--color-text);
  }

  .week-label {
    color: var(--color-text-secondary);
    font-size: 1.1rem;
    margin: 0;
  }

  .weekly-table {
    background: var(--color-bg-secondary);
    border-radius: 8px;
    overflow: hidden;
  }

  .table-header {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr 1fr;
    gap: 1rem;
    padding: 1rem;
    background: var(--color-primary);
    color: white;
    font-weight: 600;
  }

  @media (max-width: 768px) {
    .table-header {
      grid-template-columns: 2fr 1fr 1fr;
    }
    .target-col {
      display: none;
    }
  }
</style>
```

**`v2/src/lib/components/weekly/WeeklyFoodGroupRow.svelte`** - Create similar pattern

**Continue with History View, Settings Modal, etc.** - Follow similar patterns

Due to length constraints, I'll provide the structure for remaining components. Reference Ca-pwa for patterns.

**Checkpoint**: UI components framework complete ✅

---

## Phase 4: Cloudflare Worker + Sync (Week 4-5)

### Worker Setup

```bash
cd v2
mkdir worker
cd worker
npm init -y
npm install -D @cloudflare/workers-types wrangler
```

**`v2/worker/package.json`**:

```json
{
  "name": "mind-sync-worker",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "deploy:dev": "wrangler deploy --env dev"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20240925.0",
    "wrangler": "^4.28.1"
  }
}
```

**`v2/worker/src/index.ts`** - **Copy entire implementation from Ca-pwa** `worker/src/index.ts`:

```typescript
// Copy from Ca-pwa worker/src/index.ts
// Only changes needed:
// 1. Update ALLOWED_ORIGINS to your domain
// 2. Verify KV binding name matches wrangler.toml
```

**`v2/worker/wrangler.toml`**:

```toml
name = "mind-sync-worker"
main = "src/index.ts"
compatibility_date = "2024-08-11"

[[kv_namespaces]]
binding = "SYNC_KV"
id = "YOUR_PRODUCTION_KV_ID"  # Create with: wrangler kv:namespace create "SYNC_KV"

[env.dev]
[[env.dev.kv_namespaces]]
binding = "SYNC_KV"
id = "YOUR_DEV_KV_ID"  # Create with: wrangler kv:namespace create "SYNC_KV" --env dev
```

### Create KV Namespaces

```bash
cd worker

# Create production namespace
wrangler kv:namespace create "SYNC_KV"
# Output: Created namespace with ID: abc123...
# Copy this ID to wrangler.toml [[kv_namespaces]].id

# Create development namespace
wrangler kv:namespace create "SYNC_KV" --env dev
# Output: Created namespace with ID: def456...
# Copy this ID to wrangler.toml [env.dev].[[env.dev.kv_namespaces]].id

# Test worker locally
wrangler dev

# Deploy to Cloudflare
wrangler deploy
# Note the worker URL (e.g., https://mind-sync-worker.YOUR_SUBDOMAIN.workers.dev)
```

### Client-Side Sync Implementation

**`v2/src/lib/utils/CryptoUtils.ts`** - **Copy from Ca-pwa** `src/lib/utils/CryptoUtils.ts`

**`v2/src/lib/services/SyncService.ts`** - **Adapt from Ca-pwa** `src/lib/services/SyncService.ts`:

Key adaptations:
- Document structure for MIND data (metadata, persistent, weekly snapshots)
- Integration with mindDiet stores instead of calcium stores
- Week-based partitioning instead of month-based

**`v2/src/lib/stores/sync.ts`** - **Copy from Ca-pwa** `src/lib/stores/sync.ts`:

Minimal changes needed, mainly store references.

### Environment Configuration

**`v2/.env`**:

```bash
VITE_WORKER_URL=https://mind-sync-worker.YOUR_SUBDOMAIN.workers.dev
```

**Checkpoint**: Sync infrastructure complete ✅

---

## Phase 5: Setup Wizard & Settings (Week 6)

### Setup Wizard

**`v2/src/routes/setup/+page.svelte`** - Multi-step wizard:

1. Welcome
2. Week start day preference
3. Theme selection
4. Cloud sync option (optional)
5. Cloud sync setup (if enabled)
6. Completion

Reference Ca-pwa setup patterns and adapt for MIND-specific preferences.

### Settings Modal

**`v2/src/lib/components/shared/SettingsModal.svelte`**:

- Theme toggle
- Week start day
- Cloud sync enable/disable
- Export/Import data
- Clear data

**Checkpoint**: User configuration complete ✅

---

## Phase 6: Testing & Refinement (Week 7-8)

### Testing Checklist

**Functionality**:
- [ ] Daily tracking: increment/decrement counts
- [ ] Daily tracking: date navigation
- [ ] Weekly summary: correct totals
- [ ] Weekly summary: target status indicators
- [ ] History: view past weeks
- [ ] History: edit mode
- [ ] Settings: theme changes persist
- [ ] Settings: week start day changes recalculate
- [ ] Export: generates valid JSON
- [ ] Import: loads data correctly
- [ ] Cloud sync: create new doc
- [ ] Cloud sync: bidirectional sync
- [ ] Cloud sync: conflict resolution
- [ ] PWA: installable
- [ ] PWA: offline functionality

**Cross-Browser**:
- [ ] Chrome/Edge
- [ ] Firefox
- [ ] Safari (iOS)
- [ ] Chrome (Android)

**Responsive Design**:
- [ ] Desktop (1920x1080)
- [ ] Tablet (768x1024)
- [ ] Mobile (375x667)

### Performance Optimization

- Review bundle size: `npm run build` and check `build/` folder
- Optimize images
- Code splitting if needed
- Lighthouse audit (aim for 90+ scores)

### Bug Fixes & Polish

- Fix any identified issues
- Improve UI animations
- Add loading states
- Error handling
- User feedback (toasts/notifications)

**Checkpoint**: Testing complete ✅

---

## Phase 7: Cutover & Deployment (Week 8)

### Prepare for Cutover

```bash
cd /home/user/mind-pwa

# Ensure you're on feature branch
git status

# Create backup of old code
git tag backup-vanilla-js

# Remove old code
rm -rf client server package.json package-lock.json

# Move v2 contents to root
mv v2/* .
mv v2/.* . 2>/dev/null || true
rmdir v2

# Update root .gitignore
cat > .gitignore << 'EOF'
node_modules
.DS_Store
build
.svelte-kit
.env
.env.local
worker/node_modules
worker/.wrangler
EOF

# Commit cutover
git add -A
git commit -m "Migrate to SvelteKit + Cloudflare Workers

- Rewrite frontend in SvelteKit with TypeScript
- Replace Google/Dropbox sync with Cloudflare Workers + KV
- Implement client-side encryption for sync
- Modernize state management with Svelte stores
- Improve UI with reactive components
- Maintain all core MIND Diet tracking features
- PWA functionality preserved and enhanced"
```

### Deploy

**Static Site (Vercel)**:

1. Update Vercel project settings:
   - Build Command: `npm run build`
   - Output Directory: `build`
   - Install Command: `npm install`

2. Add environment variable:
   - `VITE_WORKER_URL`: Your Cloudflare Worker URL

3. Deploy:
   ```bash
   git push origin feature/svelte-migration
   ```

4. Create PR and merge to main

**Cloudflare Worker**:

Already deployed in Phase 4. Update if needed:

```bash
cd worker
wrangler deploy
```

**Verify Production**:
- [ ] Site loads
- [ ] Tracking works
- [ ] Settings persist
- [ ] Sync works (if enabled)
- [ ] PWA installs
- [ ] Offline mode works

**Checkpoint**: Migration complete! 🎉

---

## Rollback Plan

If critical issues arise:

```bash
# Revert to backup
git checkout backup-vanilla-js
git checkout -b hotfix/revert-migration

# Deploy old version
# (Follow original deployment process)

# Investigate issues in feature branch
git checkout feature/svelte-migration
```

---

## Post-Migration Tasks

1. **Update Documentation**:
   - README.md with new tech stack
   - Installation guide
   - Development guide
   - Sync setup guide

2. **Monitor**:
   - Cloudflare Worker analytics
   - Error tracking
   - User feedback

3. **Iterate**:
   - Address any bugs
   - Performance improvements
   - Feature enhancements

---

## Success Metrics

**Technical**:
- ✅ Bundle size < 500KB (vs ~600KB+ before)
- ✅ Lighthouse score > 90
- ✅ First Contentful Paint < 1.5s
- ✅ Time to Interactive < 3s
- ✅ TypeScript coverage 100%

**Functional**:
- ✅ All features from vanilla version work
- ✅ Sync is more reliable
- ✅ Deployment is simpler (no Node.js server)
- ✅ Code is more maintainable

**User Experience**:
- ✅ UI feels faster/smoother
- ✅ Setup wizard is intuitive
- ✅ Sync is easier to configure
- ✅ No data loss during migration

---

## Timeline Summary

| Week | Phase | Focus | Status |
|------|-------|-------|--------|
| 1 | 0-1 | Environment & Core Infrastructure | ⏳ Pending |
| 2 | 2-3 | State Management & UI Foundation | ⏳ Pending |
| 3 | 3 | UI Components (Daily, Weekly) | ⏳ Pending |
| 4 | 4 | Cloudflare Worker & Sync | ⏳ Pending |
| 5 | 4 | Sync Service Integration | ⏳ Pending |
| 6 | 5 | Setup Wizard & Settings | ⏳ Pending |
| 7 | 6 | Testing & Refinement | ⏳ Pending |
| 8 | 6-7 | Final Testing & Deployment | ⏳ Pending |

**Total Estimated Time**: 6-8 weeks

---

## Resources

**Reference Implementations**:
- Ca-pwa: https://github.com/NateEaton/Ca-pwa
  - Worker: `/worker/src/index.ts`
  - SyncService: `/src/lib/services/SyncService.ts`
  - CryptoUtils: `/src/lib/utils/CryptoUtils.ts`
  - Stores: `/src/lib/stores/`

**Documentation**:
- SvelteKit: https://kit.svelte.dev/docs
- Svelte: https://svelte.dev/docs
- Cloudflare Workers: https://developers.cloudflare.com/workers/
- Cloudflare KV: https://developers.cloudflare.com/kv/
- Wrangler: https://developers.cloudflare.com/workers/wrangler/

**Tools**:
- Svelte REPL: https://svelte.dev/repl
- Wrangler Playground: Local testing with `wrangler dev`

---

## Notes

- **Ca-pwa as Blueprint**: Maximum code reuse from Ca-pwa for Worker and sync logic
- **Incremental Commits**: Commit after each major component/feature
- **Test Frequently**: Don't wait until the end to test
- **Reference Old Code**: Keep old codebase accessible for business logic reference
- **Ask for Help**: Consult Ca-pwa implementation when stuck

---

**Next Step**: Begin Phase 0 - Environment Setup ✅
