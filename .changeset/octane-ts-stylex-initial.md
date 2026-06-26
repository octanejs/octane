---
"@octane-ts/stylex": patch
---

New package: `@octane-ts/stylex` — [StyleX](https://stylexjs.com) for the octane renderer.

StyleX is a build-time CSS-in-JS system, so unlike the zustand/motion runtime bindings the integration is the COMPILER pass, in two parts:

- `@octane-ts/stylex` — the authoring surface you import in components. It re-exports `@stylexjs/stylex` (so `props`/`attrs` types + runtime work) and is registered as an import source so the StyleX compiler finds the call sites. StyleX's `props()` output drops straight onto octane host elements: `<div {...stylex.props(styles.root)}>` works because octane's spread handler maps `className` → `class` and applies a `style` object.
- `@octane-ts/stylex/vite` — a Vite plugin that runs the StyleX compiler (`@stylexjs/babel-plugin`) over octane's compiled `.tsrx` output (`enforce: 'post'`), replacing `stylex.create`/`props`/`keyframes`/`defineVars`/`createTheme` with their atomic forms and emitting one deduped, priority-ordered static stylesheet as `virtual:stylex.css` — zero StyleX runtime in the shipped bundle, with dev HMR.
