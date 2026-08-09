# Anime.js upstream contract

## Pin and source boundary

| Field | Value |
|---|---|
| Package | `animejs` |
| Version | `4.5.0` |
| Canonical tag | `v4.5.0` |
| Canonical tag commit | `2c9cf8ea00329f6768c7d7902252ed977d75ce42` |
| Supported upstream range | exactly `4.5.0` |
| License | MIT, © Julian Garnier |

Anime.js is framework-neutral. This package depends on the published release and
re-exports its runtime and declarations instead of copying or modifying the
animation engine. The npm artifact contains compiled `dist/` modules and types;
the canonical tagged repository additionally contains source, browser suites,
playgrounds, examples, and build configuration. Because the binding reuses the
published core unchanged, those sources are not vendored or shipped here.

## Public entry-point crosswalk

| Upstream entry point | Octane disposition | Evidence |
|---|---|---|
| `animejs` | Reused unchanged and re-exported from the package root; `useAnimeScope` is the sole additional runtime export | `tests/exports.test.ts`, `tests/types/public-api.test-d.ts` |
| `animejs/adapters/three` | Reused unchanged at `@octanejs/animejs/adapters/three` | `tests/exports.test.ts`, `tests/three-adapter.test.ts` |
| `animejs/package.json` | Not re-exported; consumers may inspect the direct dependency when needed | package manifest |
| `animejs/timer` | Explicit gap; the same APIs remain available through the supported root export | root export inventory |
| `animejs/animation` | Explicit gap; the same APIs remain available through the supported root export | root export inventory |
| `animejs/timeline` | Explicit gap; the same APIs remain available through the supported root export | root export inventory |
| `animejs/animatable` | Explicit gap; the same APIs remain available through the supported root export | root export inventory |
| `animejs/draggable` | Explicit gap; the same APIs remain available through the supported root export | root export inventory |
| `animejs/scope` | Explicit gap; the upstream scope API is available through the root and complemented by `useAnimeScope` | `tests/scope.test.ts` |
| `animejs/engine` | Explicit gap; the same APIs remain available through the supported root export | root export inventory |
| `animejs/events` | Explicit gap; the same APIs remain available through the supported root export | root export inventory |
| `animejs/layout` | Explicit gap; the same APIs remain available through the supported root export | root export inventory |
| `animejs/easings` and its six nested entry points | Explicit gap; easings are available through the supported root export | root export inventory |
| `animejs/utils` | Explicit gap; utilities are available through the supported root export | root export inventory |
| `animejs/svg` | Explicit gap; SVG helpers are available through the supported root export | root export inventory |
| `animejs/text` | Explicit gap; text helpers are available through the supported root export | root export inventory |
| `animejs/waapi` | Explicit gap; WAAPI helpers are available through the supported root export | root export inventory |
| `animejs/adapters` | Explicit gap; only the verified Three adapter receives an Octane subpath | adapter export inventory |

`tests/exports.test.ts` compares the binding namespaces with the installed
4.5.0 namespaces in both directions. Removing, renaming, or adding an upstream
runtime export therefore fails the test. The TypeScript fixture compiles
representative animation, timeline, scope, engine, utility, SVG/text, WAAPI,
and Three adapter calls through the binding's declarations.

## Upstream test-suite disposition

The canonical tag contains 33 executable files under `tests/suites/`. The npm
artifact does not publish them. The 32 browser suites exercise the unchanged
Anime.js engine and are upstream-core evidence rather than Octane binding
fixtures: `animatables`, `animations`, `build`, `callbacks`, `colors`,
`controls`, `directions`, `draggables`, `eases`, `engine`,
`function-based-values`, `keyframes`, `leaks`, `parameters`, `promises`,
`scope`, `scroll`, `seconds`, `stagger`, `svg`, `targets`, `text`, `threejs`,
`timelines`, `timings`, `transforms`, `tweens`, `types`, `units`, `utils`,
`values`, and `waapi`. They are not adapted because the binding does not
replace those modules; export identity tests prove it delegates to the same
installed implementation.

The remaining `node.test.js` suite is likewise an upstream-core environment
suite and is not copied into the package. Octane-specific evidence is classified
as follows:

- `tests/exports.test.ts`: Octane-only package-boundary contract.
- `tests/scope.test.ts`: Octane-only lifecycle, cleanup, selector isolation,
  registered-method, completion, refresh, and error-restoration contract.
- `tests/ssr.test.ts`: Octane-only SSR safety contract.
- `tests/three-adapter.test.ts`: Octane integration contract for the unchanged
  upstream adapter and real `@octanejs/three` objects.
- `tests/types/public-api.test-d.ts`: Octane package-declaration contract.

There is no React binding or React oracle in Anime.js 4.5.0, so React/Octane
differential and adapted React type lanes are not applicable.
