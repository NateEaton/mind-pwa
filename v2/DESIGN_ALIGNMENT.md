# Design Alignment Document

This document captures the differences between the original MIND PWA and the v2 refactored version, providing guidance for future design refinements to match the original look and feel.

## Executive Summary

The v2 refactor successfully implements all core functionality but has stylistic and layout differences from the original. The original app follows a **mobile-first, material design-inspired** approach with green theming, while v2 uses a **desktop-friendly, neutral gray** design system.

---

## 1. Navigation & Layout

### Original Design
- **Pattern**: Bottom tab bar navigation (iOS/Android app style)
- **Position**: Fixed at bottom of header (below title)
- **Structure**: Two-level header
  - Top: "MIND Diet Tracker" title (centered, white text)
  - Bottom: Tab bar with 4 tabs (Daily, Weekly, History, Menu)
- **Header Height**: 88px total
- **Tab Items**: Icon + label, yellow icons (#FFC107), white text
- **Active State**: Lighter background overlay on active tab
- **Menu**: Dropdown overlay triggered by Menu tab

### V2 Implementation
- **Pattern**: Top horizontal navigation bar
- **Position**: Single-level sticky header
- **Structure**: Brand text on left, nav links on right
- **Header Height**: 60px
- **Nav Items**: Text-only links, no icons
- **Active State**: Not visually indicated
- **Settings**: Dedicated page in navigation

### Alignment Tasks
```css
/* To match original: */
1. Increase header height to 88px
2. Split header into two levels:
   - Top: Centered title
   - Bottom: Tab bar with icons
3. Add Material Design Icons for tabs
4. Change nav links to yellow icons with labels
5. Implement active state indicator
6. Convert Settings to Menu dropdown
7. Position tabs at bottom of header
```

---

## 2. Color Scheme

### Original Palette

**Light Theme:**
```css
/* Primary Colors */
--color-primary: #4CAF50;           /* Main green */
--color-primary-dark: #388E3C;      /* Hover/active states */
--color-secondary: #8BC34A;         /* Tab bar, badges */
--color-secondary-dark: #689F38;    /* Secondary hover */

/* Accent Colors */
--color-accent: #FFC107;            /* Yellow icons */
--color-warning: #FF9800;           /* Near-limit warnings */
--color-warning-dark: #F57C00;      /* Warning hover */
--color-danger: #dc3545;            /* Errors, exceeded limits */

/* Background Colors */
--color-bg: #f4f4f4;                /* Page background */
--color-card-bg: #ffffff;           /* Card background */
--color-border: #ddd;               /* Borders */

/* Text Colors */
--color-text: #333;                 /* Primary text */
--color-text-muted: #666;           /* Secondary text */

/* Status Colors */
--color-success-bg: #d4edda;        /* Goal met background */
--color-success-border: #c3e6cb;    /* Goal met border */
--color-danger-bg: #f8d7da;         /* Goal missed background */
--color-danger-border: #f5c6cb;     /* Goal missed border */
--color-warning-bg: #fff3cd;        /* Near limit background */
--color-warning-border: #ffeeba;    /* Near limit border */
```

**Dark Theme:**
```css
--color-primary: #66BB6A;           /* Lighter green for dark mode */
--color-secondary: #9CCC65;         /* Lighter secondary */
--color-bg: #1a1a1a;                /* Dark background */
--color-card-bg: #2d2d2d;           /* Dark card background */
--color-text: #e0e0e0;              /* Light text */
--color-border: #444;               /* Dark borders */
```

### V2 Implementation
```css
/* Primary Colors */
--color-primary: #4a5568;           /* Gray/slate */
--color-primary-hover: #2d3748;     /* Darker gray */
--color-success: #10b981;           /* Green (different shade) */
--color-warning: #f59e0b;           /* Orange */
--color-danger: #ef4444;            /* Red */

/* Backgrounds */
--color-bg: #ffffff;                /* White */
--color-bg-secondary: #f3f4f6;      /* Light gray */
--color-border: #e5e7eb;            /* Gray border */

/* Text */
--color-text: #1f2937;              /* Dark gray */
--color-text-secondary: #6b7280;    /* Medium gray */
```

### Alignment Tasks
```typescript
// Replace entire color system in +layout.svelte:
1. Change primary from #4a5568 to #4CAF50
2. Add secondary color (#8BC34A)
3. Add yellow accent (#FFC107)
4. Update warning colors to orange (#FF9800)
5. Add status background colors (success, warning, danger)
6. Update dark theme colors to match original
7. Adjust all components using primary color
```

---

## 3. Component Styling

### Food Group Items (Daily Tracker)

**Original Design:**
```
┌─────────────────────────────────────────────────────────┐
│ [i] Whole Grains                    [7] [-] [2] [+]    │
│     ≥3 servings/day                                     │
└─────────────────────────────────────────────────────────┘
```
- **Layout**: Horizontal flex, no wrapping
- **Info Button**: Small circular "i" button (green border, left side)
- **Weekly Badge**: Rounded pill showing week total (colored by status)
- **Controls**: Yellow minus, number input (30px width), green plus
- **Buttons**: All circular (border-radius: 50%)
- **Separator**: Border-bottom between items
- **Badge Position**: Inline with title on left side

**V2 Implementation:**
```
┌─────────────────────────────────────────────────────────┐
│ Whole Grains                                            │
│ ≥3 servings/day                                        │
│                                           [-] [2] [+]  │
└─────────────────────────────────────────────────────────┘
```
- **Layout**: Vertical stacking
- **Info**: Description shown below title (no modal button)
- **Weekly Badge**: Not displayed on daily view
- **Controls**: Positioned in separate row
- **Buttons**: Rectangular with rounded corners

**Alignment Tasks:**
```svelte
<!-- FoodGroupCard.svelte changes: -->
1. Change layout from vertical to horizontal flex
2. Add info button (circular, green border, left side)
3. Add weekly badge (pill shape, colored by status)
4. Make all buttons circular (50% border-radius)
5. Color minus button yellow, plus button green
6. Add border-bottom separator
7. Reduce input width to 30px
8. Move description to modal (triggered by info button)
```

### Summary Cards (Weekly/History)

**Original Design:**
```
┌─┬─────────────────────┬─────────┬────────┐
│█│ Whole Grains        │  18/21  │ ✓ Met  │
└─┴─────────────────────┴─────────┴────────┘
```
- **Status Bar**: 8px wide colored bar on left edge
- **Layout**: Three columns (Name | Servings | Target)
- **Padding**: Minimal for compact display
- **Colors**: Status bar color matches goal status (green/yellow/red)
- **Typography**: Vertically stacked label + value

**V2 Implementation:**
- Uses cards with more padding
- Progress bars instead of status bars
- Different grid layout

**Alignment Tasks:**
```css
/* Weekly/History card styling: */
1. Add 8px colored bar to left edge
2. Reduce padding for compact display
3. Use three-column layout
4. Remove progress bars, use simple metrics
5. Match status colors to original
6. Add border instead of shadows
```

### Modals

**Original Design:**
- **Header**: Green background (#4CAF50), white text
- **Close Button**: Large white "×" in header
- **Body**: White background, scrollable (max-height: 60vh)
- **Footer**: Action buttons (secondary left, primary right)
- **Backdrop**: Semi-transparent dark (rgba(0,0,0,0.55))
- **Animation**: Fade in from center

**V2 Implementation:**
- No modals currently implemented
- Would need to match original styling

**Alignment Tasks:**
```svelte
<!-- Create Modal.svelte component: -->
1. Green header with white text
2. Large × close button in header
3. Scrollable body with max-height
4. Footer with button alignment
5. Dark backdrop overlay
6. Fade-in animation
```

---

## 4. Typography & Spacing

### Original System

**Font Sizes:**
```css
--font-xs: 0.8rem;    /* Small labels */
--font-sm: 0.9rem;    /* Secondary text */
--font-md: 1rem;      /* Base text */
--font-lg: 1.2rem;    /* Subheadings */
--font-xl: 1.4rem;    /* Page headings */
--font-xxl: 2rem;     /* Large display */
```

**Spacing:**
```css
--spacing-xs: 0.3rem;
--spacing-sm: 0.5rem;
--spacing-md: 0.8rem;
--spacing-lg: 1rem;
--spacing-xl: 1.5rem;
```

**Border Radius:**
```css
--border-radius-sm: 4px;   /* Buttons, inputs */
--border-radius-md: 8px;   /* Cards, modals */
```

### V2 Implementation

**Font Sizes:**
- No font size variables defined
- Uses browser defaults

**Spacing:**
```css
--spacing-xs: 0.25rem;   /* Smaller than original */
--spacing-sm: 0.5rem;    /* Same */
--spacing-md: 1rem;      /* Larger than original (0.8rem) */
--spacing-lg: 1.5rem;    /* Larger than original (1rem) */
--spacing-xl: 2rem;      /* Larger than original (1.5rem) */
```

**Border Radius:**
```css
--radius-sm: 0.25rem;    /* Smaller than original (4px) */
--radius-md: 0.5rem;     /* Smaller than original (8px) */
--radius-lg: 0.75rem;    /* New size */
```

### Alignment Tasks
```css
/* Update CSS variables in +layout.svelte: */
1. Add font size variables (xs through xxl)
2. Adjust spacing scale to match original:
   - xs: 0.3rem (not 0.25rem)
   - md: 0.8rem (not 1rem)
   - lg: 1rem (not 1.5rem)
   - xl: 1.5rem (not 2rem)
3. Update border radius:
   - sm: 4px (not 0.25rem)
   - md: 8px (not 0.5rem)
4. Apply font sizes throughout components
```

---

## 5. Mobile Responsiveness

### Original Breakpoints & Strategies

**Breakpoints:**
- **600px**: Tablet and smaller desktop
- **480px**: Mobile devices
- **360px**: Small mobile devices

**Key Responsive Behaviors:**

**At 600px:**
```css
/* Header adjustments */
h1 { font-size: 1.3rem; }  /* Reduced from 1.5rem */
.tab-icon { font-size: 1.4em; }  /* Increased for touch */

/* Modal width */
.modal { width: 95%; }
```

**At 480px:**
```css
/* Stack settings controls */
.settings-group { flex-direction: column; }

/* Food item adjustments */
.food-item button { width: 28px; height: 28px; }  /* Smaller */
.weekly-badge { font-size: 0.7rem; padding: 2px 6px; }

/* Summary table */
.summary-table { grid-template-columns: 2fr 1fr 1fr; }

/* Full-width inputs */
input, select { width: 100%; }
```

**At 360px:**
```css
/* Day selector */
.day-button { width: 28px; height: 28px; }  /* Reduced from 32px */

/* Navigation wrapping */
.history-controls { flex-wrap: wrap; }
```

### V2 Implementation

**Breakpoints:**
- **640px**: Mobile devices (single breakpoint)

**Responsive Behaviors:**
```css
@media (max-width: 640px) {
  .nav-brand { font-size: 1rem; }
  .nav-link { font-size: 0.875rem; }
  .main { padding: var(--spacing-md); }
}
```

### Alignment Tasks
```css
/* Add comprehensive responsive design: */
1. Add 600px, 480px, 360px breakpoints
2. Implement touch-friendly button sizes (28-30px minimum)
3. Add vertical stacking for mobile layouts
4. Adjust font sizes at each breakpoint
5. Implement modal width adjustments
6. Add grid column adjustments for tables
7. Enable navigation control wrapping
8. Test on actual mobile devices
```

---

## 6. Interactive Elements

### Day Selector

**Original Design:**
```
┌──────────────────────────────────────┐
│  [S] [M] [T] [W] [T] [F] [S]        │
└──────────────────────────────────────┘
```
- **Container**: Rounded pill (#e9e9e9 background)
- **Buttons**: Circular (32px), single letter labels
- **Active**: Green background, white text
- **Hover**: Slightly darker gray
- **Spacing**: Minimal gap between buttons

**V2 Implementation:**
- Not currently in v2
- Weekly view uses different navigation

**Alignment Tasks:**
```svelte
<!-- Create DaySelector.svelte: -->
1. Rounded pill container
2. Seven circular buttons
3. Single letter labels (S M T W T F S)
4. Green active state
5. Hover effects
6. 32px button size (28px on mobile)
```

### Toast Notifications

**Original Design:**
- **Position**: Fixed bottom center
- **Shape**: Rounded pill (border-radius: 30px)
- **Animation**: Slide up + fade in
- **Colors**: Type-based (green/orange/red)
- **Duration**: 1-3 seconds (configurable)
- **Loading**: Optional spinner icon

**V2 Implementation:**
- No toast system implemented
- Uses browser alerts

**Alignment Tasks:**
```typescript
// Create toast.ts utility:
1. Fixed bottom positioning
2. Pill-shaped container
3. Slide-up animation
4. Color coding by type
5. Auto-dismiss timer
6. Queue multiple toasts
7. Optional spinner support
```

---

## 7. View-Specific Layouts

### Daily Tracker View

**Original:**
```
┌─────────────────────────────────────┐
│ ← [Today: Wed, Jan 15, 2025] →     │ ← Sticky header
├─────────────────────────────────────┤
│                                     │
│ Healthy Brain Foods                 │ ← Section heading
│ [Food item]                         │
│ [Food item]                         │
│                                     │
│ Foods to Limit                      │
│ [Food item]                         │
│                                     │ ← Scrollable
└─────────────────────────────────────┘
```
- **Header**: Sticky date navigator
- **Content**: Scrollable food groups
- **Sections**: "Healthy Brain Foods" and "Foods to Limit"
- **Layout**: Compact, minimal spacing

**V2:**
- Similar structure
- Different date navigator styling
- No section grouping visible

### Weekly Summary View

**Original:**
```
┌─────────────────────────────────────┐
│ Week of Jan 12 - Jan 18, 2025       │ ← Sticky header
│ [S][M][T][W][T][F][S]               │ ← Day selector
├─────────────────────────────────────┤
│ [Summary cards with status bars]    │
│ Overall Score: 8.5/15               │ ← Scrollable
│ [Weekly totals by food group]       │
└─────────────────────────────────────┘
```
- **Day Selector**: Prominent in sticky header
- **Score**: Large display of overall weekly score
- **Cards**: Compact with left edge status indicators

**V2:**
- Different header layout
- Uses progress bars instead of status indicators
- Different score presentation

---

## 8. Animation & Transitions

### Original Animations

**Page Transitions:**
- None (instant view switching)

**Component Animations:**
```css
/* Button hover/active */
transition: all 0.2s ease;

/* Modal fade in */
animation: fadeIn 0.2s ease;

/* Toast slide up */
animation: slideUp 0.3s ease;

/* Menu dropdown */
transition: opacity 0.15s, transform 0.15s;
```

**Loading States:**
- Spinner in toasts
- Button disabled states
- No skeleton loaders

### V2 Implementation
```css
--transition-fast: 150ms ease;
--transition-base: 200ms ease;
--transition-slow: 300ms ease;
```
- Similar timing to original
- No animations currently implemented

### Alignment Tasks
```css
/* Add animations: */
1. Modal fadeIn keyframes
2. Toast slideUp keyframes
3. Menu dropdown transitions
4. Button state transitions
5. Hover effects with transforms
6. Loading spinners
```

---

## 9. Accessibility Considerations

### Original Implementation

**Keyboard Navigation:**
- Tab order follows visual order
- Enter/Space activate buttons
- Escape closes modals/menus
- Arrow keys for date navigation

**Screen Reader Support:**
- Semantic HTML (nav, main, header)
- ARIA labels on icon buttons
- ARIA live regions for toasts
- Role attributes on modals

**Touch Targets:**
- Minimum 28px on mobile (360px)
- 30px on mobile (480px)
- 32px+ on tablet/desktop

**Color Contrast:**
- Text meets WCAG AA standards
- Status colors have sufficient contrast
- Focus indicators visible

### V2 Implementation
- Semantic HTML used
- No ARIA attributes yet
- Touch targets may be too small
- Focus states minimal

### Alignment Tasks
```html
<!-- Accessibility improvements: -->
1. Add ARIA labels to icon buttons
2. Implement ARIA live regions for dynamic content
3. Add role="dialog" to modals
4. Ensure minimum touch target sizes
5. Add visible focus indicators
6. Test with screen readers
7. Verify color contrast ratios
8. Add keyboard shortcuts documentation
```

---

## 10. Implementation Priority

### Phase 1: Critical Visual Alignment (High Priority)
1. **Color System**: Replace gray with green theme
2. **Navigation**: Implement bottom tab bar with icons
3. **Food Group Items**: Horizontal layout with circular buttons
4. **Typography**: Add font size variables and apply

### Phase 2: Component Refinement (Medium Priority)
5. **Weekly Summary**: Add status bar indicators
6. **Modals**: Implement with green headers
7. **Day Selector**: Create rounded pill component
8. **Toasts**: Build notification system

### Phase 3: Polish & Responsive (Lower Priority)
9. **Mobile Breakpoints**: Add 600px, 480px, 360px breakpoints
10. **Animations**: Add fadeIn, slideUp, transitions
11. **Accessibility**: ARIA labels, focus states
12. **Testing**: Cross-browser, mobile device testing

---

## 11. Code Reference Guide

### Files to Modify for Alignment

**Color System:**
- `v2/src/routes/+layout.svelte` (lines 66-121)

**Navigation:**
- `v2/src/routes/+layout.svelte` (lines 48-58, 142-217)

**Daily Tracker:**
- `v2/src/lib/components/shared/FoodGroupCard.svelte` (entire file)
- `v2/src/routes/+page.svelte` (layout structure)

**Weekly Summary:**
- `v2/src/routes/weekly/+page.svelte` (entire file)

**Typography:**
- `v2/src/routes/+layout.svelte` (add to CSS variables section)
- All component files (apply font sizes)

**Responsive Design:**
- `v2/src/routes/+layout.svelte` (expand media queries)
- All component files (add responsive breakpoints)

### New Files to Create

**Components:**
- `v2/src/lib/components/shared/Modal.svelte`
- `v2/src/lib/components/shared/DaySelector.svelte`
- `v2/src/lib/components/shared/Toast.svelte`
- `v2/src/lib/components/shared/StatusBar.svelte`

**Utilities:**
- `v2/src/lib/utils/toast.ts`
- `v2/src/lib/utils/animations.ts`

---

## 12. Visual Comparison Checklist

Use this checklist when aligning each component:

### Navigation
- [ ] Bottom tab bar (not top nav)
- [ ] Two-level header (title + tabs)
- [ ] Yellow icons with labels
- [ ] Green active state
- [ ] 88px total header height
- [ ] Menu dropdown (not settings page)

### Colors
- [ ] Green primary (#4CAF50)
- [ ] Yellow accent (#FFC107)
- [ ] Orange warnings (#FF9800)
- [ ] Status backgrounds (light green/red/yellow)
- [ ] Dark theme support

### Food Group Items
- [ ] Horizontal layout
- [ ] Info button (left)
- [ ] Weekly badge (left, colored)
- [ ] Circular buttons
- [ ] Yellow minus, green plus
- [ ] 30px input width
- [ ] Border-bottom separator

### Summary Cards
- [ ] 8px left status bar
- [ ] Three columns
- [ ] Minimal padding
- [ ] Status colors
- [ ] Border (not shadow)

### Typography
- [ ] Font size variables defined
- [ ] Spacing: 0.3, 0.5, 0.8, 1, 1.5rem
- [ ] Border radius: 4px, 8px
- [ ] System font stack

### Responsive
- [ ] 600px breakpoint
- [ ] 480px breakpoint
- [ ] 360px breakpoint
- [ ] Touch targets (28-32px)
- [ ] Vertical stacking on mobile

---

## Conclusion

This document provides a complete roadmap for aligning the v2 design with the original MIND PWA. The original design prioritizes mobile-first usability with a clean, material design-inspired interface using green theming. The v2 implementation is functionally complete but differs stylistically.

**Key Takeaway**: The original app's design is optimized for **mobile PWA usage** with bottom navigation and touch-friendly controls, while v2 currently favors a **desktop-first** approach with top navigation.

**Recommendation**: Implement Phase 1 changes first (color system and navigation) as these provide the most visual impact and align with the mobile-first PWA nature of the application.

---

*Document Version: 1.0*
*Last Updated: 2025-01-19*
*Author: Claude (Code Assistant)*
