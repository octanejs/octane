// @octane-ts/stylex — StyleX for the octane renderer.
//
// StyleX is a BUILD-TIME CSS-in-JS system: `@stylexjs/babel-plugin` compiles
// `stylex.create({...})` into atomic class-name maps and extracts the CSS, and
// `stylex.props(...)` / `stylex.attrs(...)` merge those at runtime into the props
// you spread onto an element. Unlike zustand/motion there is no React runtime to
// reimplement — the integration is the COMPILER pass. So this package is two parts:
//
//   • `@octane-ts/stylex`       — this module: the authoring surface you import in
//                                 components. It re-exports `@stylexjs/stylex` so
//                                 types + the runtime `props`/`attrs` work, and so
//                                 the babel plugin (configured to treat
//                                 `@octane-ts/stylex` as an import source) can find
//                                 and compile the `stylex.*` call sites.
//   • `@octane-ts/stylex/vite`  — the Vite plugin that runs the StyleX compiler over
//                                 octane's compiled `.tsrx` output and emits one
//                                 static atomic stylesheet (`virtual:stylex.css`).
//
// Octane host elements accept StyleX's output directly: `props()` returns
// `{ className?, style? }`, and octane's spread handler maps both `className` and
// `class` to the `class` attribute and applies a `style` object — so
// `<div {...stylex.props(styles.root)}>` just works.
import * as stylex from '@stylexjs/stylex';

export * from '@stylexjs/stylex';

// `@stylexjs/stylex` has no default export; provide the namespace as the default so
// `import stylex from '@octane-ts/stylex'` (the common StyleX usage) also resolves —
// the babel plugin recognizes default, namespace, and named imports alike.
export default stylex;
