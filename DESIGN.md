# Design System Specification: The Digital Curator

## 1. Overview & Creative North Star

This design system is built upon the **"Digital Curator"** Creative North Star. In a world of cluttered productivity tools, this system acts as a sophisticated filter, transforming dense information into a high-end editorial experience. It moves beyond the "template" aesthetic by leaning into intentional asymmetry, generous breathing room, and a rigid adherence to tonal depth rather than structural lines.

While inspired by a "Google-clean" functionalism, the "Digital Curator" elevates the experience through **Manrope** headlines that feel authoritative and **Inter** body text that feels clinical. We treat the interface not as a software application, but as a series of physical layers—like fine sheets of archival paper stacked on a stone surface. The result is an environment that feels quiet, professional, and hyper-efficient.

---

## 2. Colors & Surface Philosophy

The palette is rooted in a neutral, high-contrast foundation. The primary goal is to guide the eye through subtle shifts in luminance rather than heavy-handed borders.

### The Palette (Material Logic)
*   **Surface Foundation:** `surface` (#f8f9fa) serves as our canvas.
*   **The Accent:** `primary` (#455f88) is reserved for high-intent actions. Use `primary_container` (#d6e3ff) for supportive, low-contrast UI elements.
*   **Typography:** `on_surface` (#2b3437) provides the "Deep Carbon" contrast necessary for data density without the harshness of pure black.

### The "No-Line" Rule
**Explicit Instruction:** Designers are prohibited from using 1px solid borders to section off major layout areas. Boundaries must be defined solely through background color shifts. For example, a sidebar should be `surface_container_low`, sitting directly against a `surface` main content area. Let the change in value define the edge.

### Surface Hierarchy & Nesting
Treat the UI as a series of nested layers. To create depth:
1.  **Level 0 (Base):** `surface` (#f8f9fa)
2.  **Level 1 (Sections):** `surface_container_low` (#f1f4f6)
3.  **Level 2 (Cards/Containers):** `surface_container_lowest` (#ffffff) to provide a "pop" of clarity.

### The "Glass & Gradient" Rule
To avoid a "flat" or generic look, floating elements (like modals or dropdowns) should utilize **Glassmorphism**. Use semi-transparent surface colors with a `backdrop-filter: blur(20px)`. For primary CTAs, apply a subtle linear gradient from `primary` (#455f88) to `primary_dim` (#39537c) to provide a "signature" weight that flat colors lack.

---

## 3. Typography: The Editorial Scale

We utilize a dual-font strategy to balance character with utility.

*   **Display & Headlines (Manrope):** These are the "Editorial" voice. Use `display-lg` and `headline-md` with tight tracking (-0.02em) to create a bold, confident hierarchy. These fonts are meant to be felt as much as read.
*   **Body & Labels (Inter):** The "Utility" voice. `body-md` (#0.875rem) is our workhorse for data density. Inter's tall x-height ensures readability in complex, multi-column layouts.

**Hierarchy Note:** Always ensure at least two weight steps between a Headline and Body text to maintain the "High-End" contrast. If a Headline is `Bold`, the Body should be `Regular` or `Medium`.

---

## 4. Elevation & Depth

In this design system, "Elevation" is a psychological state, not just a shadow.

*   **The Layering Principle:** Depth is achieved by "stacking" container tiers. Place a `surface_container_lowest` card on a `surface_container_low` section to create a soft, natural lift.
*   **Ambient Shadows:** When a floating effect is required (e.g., a search bar), use "Atmospheric Shadows."
    *   **Blur:** 40px - 60px
    *   **Opacity:** 4% - 6%
    *   **Color:** Use a tinted version of `on_surface` rather than grey to mimic natural light.
*   **The "Ghost Border" Fallback:** If a border is required for accessibility, it must be a **Ghost Border**. Use the `outline_variant` token at **15% opacity**. Never use 100% opaque lines for containment.

---

## 5. Components

### Buttons
*   **Primary:** Rounded `DEFAULT` (0.5rem). Background: `primary` gradient. Typography: `on_primary` (Bold).
*   **Secondary:** Background: `secondary_container`. No border. Typography: `on_secondary_container`.
*   **States:** On hover, shift the elevation by moving from `surface_container_low` to `surface_container_high`.

### Input Fields
*   **Style:** Minimalist. No bottom line. Use `surface_container_highest` (#dbe4e7) as a subtle background fill with a `lg` (1rem) corner radius.
*   **Focus State:** A 2px "Ghost Border" using the `primary` color at 40% opacity.

### Cards & Data Lists
*   **Forbid Dividers:** Never use horizontal lines to separate list items. Use vertical white space (8px or 12px from the spacing scale) or alternating tonal shifts (zebra striping using `surface` and `surface_container_low`).
*   **Density:** For productivity views, use `body-sm` for secondary metadata to pack information without creating visual noise.

### Floating Search & Navigation
*   Use `full` (9999px) roundedness for search bars to create a distinct visual break from the rectangular data containers. Apply the "Glassmorphism" rule here.

---

## 6. Do's and Don'ts

### Do:
*   **Embrace Asymmetry:** Align a large `display-sm` headline to the left, and let the right side of the header breathe with open white space.
*   **Use Tonal Nesting:** Put a white (`surface_container_lowest`) card inside a light grey (`surface_container_low`) area.
*   **Focus on Micro-copy:** Use `label-sm` in all caps with increased letter spacing for category tags.

### Don't:
*   **Don't use 1px black borders.** It breaks the "Editorial" flow and makes the tool look like a legacy spreadsheet.
*   **Don't crowd the corners.** Even in data-dense views, keep a minimum of 24px padding inside cards.
*   **Don't use generic shadows.** Standard "drop shadows" are too heavy. Stick to the Ambient Shadow spec.
*   **Don't mix font families within a single block.** Keep Manrope for headers and Inter for the data/body. Mixing them mid-sentence destroys the professional polish.