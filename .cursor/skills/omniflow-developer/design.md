# Phase 2: Mockup

Runs before every Feature phase marked `Mockup: sí`. Model: `Sonnet 5.5`.

Expert skills, by surface. Load one row only:

| Surface | Skills |
|---|---|
| Web product UI, dashboard, admin | `impeccable` (product) + `interface-design` |
| Web marketing or landing | `taste-skill` + `impeccable` (brand) |
| React Native | `react-native-design` (+ `mobile-ios-design` / `mobile-android-design` only for platform UX) |
| Ordering.co branded surface | add `ordering-brand-system` |
| Finitless branded surface | add `finitless-brand-theming` |

Always add `accessibility-compliance` checks to the review step (contrast, focus, touch targets).

## 1. Aesthetic audit (before drawing anything)

Read the repo's real design sources and list them in the plan file under `## Design read`:

- Tokens and theme: `theme.json`, Tailwind config, CSS variables, the native theme file, the theming or brand provider.
- 2 or 3 reference screens in this repo closest to the new UI. Name their files.
- Existing components to reuse: buttons, inputs, cards, tables, modals, empty states.
- Theming: if the repo supports per-tenant or light/dark themes, the mockup uses theme tokens only, never hard-coded colors.

Rule: the mockup is built **only** from those tokens and components. No new color, font, radius, shadow, or spacing scale. If something truly does not exist, name it as a proposed token and ask.

## 2. Build the mockup

Pick the first that works:

1. **Stitch** (`user-stitch`): create a design system from the audited tokens, then generate the screens.
2. **Local HTML**: `.omniflow/<TICKET>/mockups/<screen>.html`, using the repo's CSS variables or Tailwind classes. Render it in the browser and take screenshots.

Cover every state the phase needs: empty, loading, error, success, filled. Cover the viewports the repo supports (mobile, tablet, desktop).

## 3. Self-review, then show

Before showing anything, compare each screenshot with the reference screens: spacing, type scale, color, radius, density, and icon style. Fix any element that does not match. Run the accessibility checks.

Show the screenshots inline and use the 4-line voice. Its question is:
`¿Apruebas el mockup? (o dime qué cambiar)`

Feedback iterates on the mockup, not on code. After approval, save the approved screenshot paths in the plan file. `build.md` codes against that exact mockup.

## Bug or Hotfix with a visual change

No full mockup. Capture the current screen (before), then show the proposed change on the same screen (after), either as a small HTML patch or an annotated screenshot. One approval, then code.
