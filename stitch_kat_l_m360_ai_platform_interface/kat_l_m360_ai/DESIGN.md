---
name: Katılım360 AI
colors:
  surface: '#fcf8fa'
  surface-dim: '#dcd9db'
  surface-bright: '#fcf8fa'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f6f3f5'
  surface-container: '#f0edef'
  surface-container-high: '#eae7e9'
  surface-container-highest: '#e4e2e4'
  on-surface: '#1b1b1d'
  on-surface-variant: '#45464d'
  inverse-surface: '#303032'
  inverse-on-surface: '#f3f0f2'
  outline: '#76777d'
  outline-variant: '#c6c6cd'
  surface-tint: '#565e74'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#131b2e'
  on-primary-container: '#7c839b'
  inverse-primary: '#bec6e0'
  secondary: '#545f73'
  on-secondary: '#ffffff'
  secondary-container: '#d5e0f8'
  on-secondary-container: '#586377'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#271901'
  on-tertiary-container: '#98805d'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dae2fd'
  primary-fixed-dim: '#bec6e0'
  on-primary-fixed: '#131b2e'
  on-primary-fixed-variant: '#3f465c'
  secondary-fixed: '#d8e3fb'
  secondary-fixed-dim: '#bcc7de'
  on-secondary-fixed: '#111c2d'
  on-secondary-fixed-variant: '#3c475a'
  tertiary-fixed: '#fcdeb5'
  tertiary-fixed-dim: '#dec29a'
  on-tertiary-fixed: '#271901'
  on-tertiary-fixed-variant: '#574425'
  background: '#fcf8fa'
  on-background: '#1b1b1d'
  surface-variant: '#e4e2e4'
typography:
  h1:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  h1-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.02em
  h2:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  h3:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: 0em
  body-base:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.01em
  caption:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0.02em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 8px
  container-margin: 24px
  gutter: 16px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 32px
---

## Brand & Style
The design system is built for a high-end enterprise fintech environment, specifically tailored for participation banking intelligence. The personality is **authoritative, analytical, and visionary**. It balances the conservative stability of banking with the cutting-edge precision of AI-driven data analysis.

The visual style is **Corporate Modern with subtle Tonal Layers**. It prioritizes extreme legibility and information density without feeling cluttered. The interface utilizes a "Data-First" approach, where the UI recedes to allow intelligence, trends, and campaign metrics to take center stage. The aesthetic response should be one of "Calm Control," providing executives with the clarity needed for rapid decision-making.

## Colors
The palette is rooted in **Deep Navy** to establish institutional trust. **Teal** is used exclusively for AI-driven insights, active states, and focus areas to distinguish "machine intelligence" from "static data."

- **Primary & Secondary:** Reserved for structural elements like sidebars, primary headers, and deep-level navigation.
- **Neutral Scale:** Uses a cool blue-gray spectrum to maintain a professional, technological feel.
- **Semantic Colors:** Used sparingly for status indicators (Success/Warning/Danger) to ensure they retain their communicative power within dense data tables.

## Typography
This design system employs a dual-font strategy. **Plus Jakarta Sans** provides a modern, slightly softer geometric touch for headings to make the platform feel approachable and "next-gen." **Inter** is used for all functional UI and body text due to its exceptional performance in data-heavy environments and numerical readability.

**Usage Rules:**
- All numeric data in tables should use `body-sm` or `caption` with tabular lining figures if available.
- All-caps should be reserved strictly for `caption` level labels to maintain a professional hierarchy.
- Line heights are slightly generous to prevent eye strain during long analytical sessions.

## Layout & Spacing
The layout follows a **12-column fluid grid** for the main content area, with a fixed-width left navigation sidebar (260px). 

**Spacing Principles:**
- **Grid:** Based on an 8px base unit. All padding and margins must be multiples of 8.
- **Density:** The system supports a "Standard" and "Compact" view. In Compact view (ideal for large tables), vertical padding is reduced from 12px to 8px.
- **Breakpoints:** 
  - Mobile: < 768px (Side nav becomes a bottom bar or hamburger).
  - Tablet: 768px - 1024px (Side nav collapses to icons only).
  - Desktop: > 1024px (Full sidebar).

## Elevation & Depth
The design system utilizes **Tonal Layering** over heavy shadows to maintain a clean, enterprise aesthetic. 

- **Level 0 (Background):** `#F8FAFC` - The base canvas.
- **Level 1 (Cards/Surface):** `#FFFFFF` - White surfaces with a 1px border of `#E2E8F0`. No shadow.
- **Level 2 (Hover/Active):** Subtle drop shadow: `0px 4px 12px rgba(15, 23, 42, 0.05)`.
- **Level 3 (Modals/Popovers):** `#FFFFFF` with a defined shadow: `0px 12px 32px rgba(15, 23, 42, 0.1)`.

Use depth to indicate interactability. Background elements stay flat; actionable elements lift slightly on interaction.

## Shapes
The shape language uses a **"Medium-Soft"** approach. While banking is traditionally "sharp" (0px), this system uses a **12px (rounded-lg)** default to convey a modern SaaS feeling.

- **Small Components (Checkboxes, Tags):** 4px.
- **Standard Components (Inputs, Buttons):** 10px.
- **Large Components (Cards, Modals):** 14px.
- **Search Bars:** Often fully rounded (pill-shaped) to distinguish them from data inputs.

## Components

### Buttons
- **Primary:** Background `Primary Navy`, text white. 10px radius. High contrast.
- **Secondary:** Transparent background, `Primary Navy` 1px border.
- **AI-Action:** Background `Accent Teal`, text white. Used only for "Generate Insight" or "Analyze" functions.

### Input Fields
- **Default State:** 1px border `#E2E8F0`, background white.
- **Focus State:** 1px border `#0D9488` with a 2px outer glow of 10% Teal.
- **Labeling:** Always use top-aligned labels in `label-md` weight.

### Cards & Data Tables
- **Cards:** No shadow by default; 1px border. Header separated by a 1px horizontal line.
- **Tables:** No vertical borders. Zebra striping using `#F8FAFC` for every second row. Header text in `caption` style, uppercase.

### Chips & Badges
- **Status Badges:** Soft background (10% opacity of the semantic color) with high-contrast text.
- **Campaign Categories:** Neutral gray backgrounds to avoid clashing with semantic statuses.

### Intelligence Widgets
- Use a subtle gradient border (Navy to Teal) for components powered by Katılım360 AI to differentiate them from standard reporting widgets.