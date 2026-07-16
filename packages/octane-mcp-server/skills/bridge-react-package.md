# Skill: Run a React package on Octane

Use this when a user wants a React ecosystem library to work in their Octane
app. The bridge is bi-directional; the reverse direction (mounting Octane
components inside a React app) is `@octanejs/react-wrapper` — see the last
section.

## Default path: out of the box, unmodified

React packages run on Octane without porting. Add the compatibility entry to
the Octane Vite plugin:

```js
import { defineConfig } from 'vite';
import { octane } from 'octane/compiler/vite';
import { react } from '@octanejs/react-compat/vite';

export default defineConfig({
	plugins: [octane({ compat: [react()] })],
});
```

That is the complete setup — no codemod, no transformed copy of a dependency,
no per-library configuration. Package code keeps importing `react`,
`react/jsx-runtime` and `react-dom`; the plugin resolves those to Octane
facades (and to separate server facades under SSR). Application `.tsrx` code
still compiles through Octane's fast static path; only components coming from
React packages use the generic descriptor path.

Covered by the compatibility runtime (see the react-compat README for the full
verified contract): hooks by call order, automatic and classic JSX runtimes,
`react-dom/client` roots and portals, SyntheticEvent + text-input `onChange`
translation, controlled `value`/`checked` properties, thrown-Promise Suspense
and `lazy`, class components (state, commit lifecycles, `contextType`, class
`defaultProps`, refs) and class Error Boundaries, `use-sync-external-store`,
and SSR through `render()` from `octane/server`.

## What does NOT run under react-compat

These fail with targeted errors instead of silently approximating React — a
package that never exercises them still works:

- legacy/`UNSAFE_` pre-render class lifecycles and `getSnapshotBeforeUpdate`,
- StrictMode development double render/effect/ref cycles,
- synchronous and streaming `react-dom/server` entry points
  (`renderToString`, `renderToPipeableStream`, …) — application SSR uses
  `render()` from `octane/server` instead,
- React Server Components and React private renderer internals,
- `findDOMNode` (removed in React 19 too).

Run the `octane_bridge_react_package` tool to scan a specific package for
these before promising anything.

## Performance option: official Octane-native bindings

Maintained native ports skip the descriptor path entirely and use compiled
`.tsrx`. Prefer them when they exist; the React original remains a working
fallback through react-compat:

| React package | Octane binding |
| --- | --- |
| `zustand` | `@octanejs/zustand` |
| `@tanstack/react-query` | `@octanejs/query` |
| `framer-motion` / `motion` | `@octanejs/motion` |
| `@stylexjs/stylex` | `@octanejs/stylex` |
| `react-router` / `react-router-dom` | `@octanejs/router` |
| `@lexical/react` | `@octanejs/lexical` |
| `@floating-ui/react` | `@octanejs/floating-ui` |
| `radix-ui` | `@octanejs/radix` |

## Publishing a native entry (library authors)

A library can add an Octane-native build later while keeping one public API,
via the `octane` export condition:

```json
{
	"exports": {
		".": {
			"octane": "./dist/octane.js",
			"import": "./dist/react.js"
		}
	}
}
```

For the native entry:

- Reuse the framework-agnostic core verbatim (`zustand/vanilla`,
  `@tanstack/query-core`, `jotai/vanilla`, `xstate`, `@floating-ui/dom`, a
  `*-core` dependency). Code with zero `react` imports runs on Octane as-is.
- Re-implement the thin React binding against Octane's identically named
  hooks; most store bindings reduce to
  `useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)`.
- Author shipped components in `.tsrx` (refs are props, `@for`/`@if`
  directives, `{expr as string}` text holes). `forwardRef` disappears —
  accept `ref` as a normal prop.
- Custom hooks in plain `.ts` files must forward the caller's slot (the
  `subSlot` convention used by the official bindings):

  ```ts
  export function subSlot(slot: symbol | undefined, tag: string) {
  	return slot !== undefined ? Symbol.for((slot.description ?? '') + ':' + tag) : undefined;
  }
  ```

- Validate by driving real DOM events and comparing against the React
  original where possible.

## The reverse direction: Octane inside React

`@octanejs/react-wrapper` mounts compiled Octane components inside a real
React app (real `react`/`react-dom` as peers) — for incremental adoption from
the React side:

```tsx
import { wrapOctane } from '@octanejs/react-wrapper';
const Counter = wrapOctane(OctaneCounter);
<Counter start={5} />; // React props flow in; Octane state survives re-renders
```

React children passed to the wrapper render inside the Octane component's
`children` hole (a layout-neutral portal bridge), so React → Octane → React
nesting composes.
