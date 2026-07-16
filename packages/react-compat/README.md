# @octanejs/react-compat

Compatibility layer that lets already-compiled React packages run on Octane
without porting their source. Package code continues to import `react`,
`react/jsx-runtime` and `react-dom`; the Vite plugin resolves those imports to
small Octane facades.

This is one half of Octane's bi-directional React bridge:

- `@octanejs/react-compat` — run unmodified React packages **on Octane** (this
  package).
- [`@octanejs/react-wrapper`](../react-wrapper) — mount Octane components
  **inside a React app**, for incremental adoption from the React side.

## Usage

```js
import { defineConfig } from 'vite';
import { octane } from 'octane/compiler/vite';
import { react } from '@octanejs/react-compat/vite';

export default defineConfig({
  plugins: [octane({ compat: [react()] })],
});
```

This is the complete setup. There is no codemod, bridge command, transformed
copy of a dependency, or per-library configuration. Octane remains the main
plugin; the compatibility entry resolves React ecosystem imports to the client
or SSR facade as appropriate.

The metaframework plugin accepts the same option:

```js
import { octane } from '@octanejs/vite-plugin';
import { react } from '@octanejs/react-compat/vite';

export default { plugins: [octane({ compat: [react()] })] };
```

Application `.tsrx` components still compile through Octane's fast static path.
Only components received from React packages use the generic descriptor path.
Their state, effects, context and subscriptions still live in Octane scopes and
use the Octane scheduler.

## How it works

- React's automatic `jsx`/`jsxs` output becomes an Octane element descriptor;
  the third `key` argument and fragments are retained.
- Facade hooks allocate stable Octane slots by React's per-component call order.
  Native Octane hooks keep compiler-assigned slots, so both models coexist.
- `react-dom/client` accepts any React node at the root and portals are routed to
  Octane.
- Text-input `onChange` is translated to the native `input` event and receives a
  lightweight SyntheticEvent-compatible facade.
- Controlled `value`/`checked` props use DOM properties on the compat descriptor
  path. This does not change Octane's native uncontrolled-input semantics.
- Directly thrown Promises are routed to Octane Suspense boundaries.
- `use-sync-external-store/with-selector` is implemented on the facade to avoid
  a bundled second copy of React in state libraries.
- Vite resolves SSR module loads to a separate `octane/server` facade; React
  packages can therefore participate in Octane SSR without loading client hooks.
- React class components are adapted for state, refs, `contextType`, class
  `defaultProps`, commit lifecycles, and class Error Boundaries. Boundary errors
  thrown by descendants and rejected lazy imports route through Octane's native
  error machinery.
- A machine-readable `octaneCompatibility` export lists supported, partial, and
  unsupported contracts for diagnostics and ecosystem tooling.

## Verified published packages

The test suite imports the unmodified npm builds, not local ports:

| Package | Verified path |
| --- | --- |
| `react-redux` | hooks, `connect()`, external-store updates, and SSR |
| `jotai` | `Provider`, atoms, `useAtom`, consumer updates |
| `react-hook-form` | `useForm`, `register`, `watch`, text-input change semantics |
| `react-error-boundary` | class boundary catch, callback and imperative reset |
| `tailwindcss` v4 | real utility compilation and unchanged class names in Octane JSX |

Run the proof with:

```bash
pnpm exec vitest run --project react-compat-native
pnpm exec vitest run --project react-compat-ssr
```

## Edge-case contract

The dedicated edge suite pins behavior that often breaks renderer shims:

| Area | Verified contract |
| --- | --- |
| Error Boundaries | `getDerivedStateFromError`, `componentDidCatch`, setState-only boundaries, nested fallback errors, own-render exclusion, lazy rejection |
| Classes | state callbacks, mount/update/unmount, `contextType`, `defaultProps`, instance refs; rejected legacy lifecycles produce targeted errors |
| Hooks | uncompiled call-order state, changed hook-count diagnostics, external-store subscribe/unsubscribe |
| Suspense | raw thrown Promise, `lazy()` caching/reveal/rejection, Error Boundary handoff |
| Forms | text `onChange`, controlled input/checkbox/textarea/select reassertion, React Hook Form register and Controller |
| Events | `nativeEvent`, prevention/propagation helpers, `currentTarget`, portal bubbling; event errors intentionally bypass boundaries |
| Identity | automatic-runtime keys, keyed state across reorder, fragments, primitive/array roots, clone/Children helpers |
| Refs | object/callback refs, forwardRef, imperative handles, unmount cleanup—including pure host roots |
| Context/portals | direct React 19 providers, Consumer render props, memo invalidation, portal context and cleanup |
| SSR/hydration | class and classic-runtime SSR, server snapshots, no server effects, context, useId-stable hydration and updates |

These unsupported contracts fail or disclose themselves explicitly instead of
silently approximating React:

- legacy/`UNSAFE_` pre-render class lifecycles and `getSnapshotBeforeUpdate`,
- StrictMode development double render/effect/ref cycles,
- synchronous and streaming `react-dom/server` entry points,
- React Suspense's server-render-error fallback/retry behavior,
- React Server Components and private renderer internals.

## Native performance entry

Compatibility is the fallback, not the performance ceiling. A library can add an
Octane-native export later while keeping the same public API:

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

That entry can use compiled `.tsrx`, conditional hooks and Octane's smallest
rendering path. Consumers without it continue to use the React build through the
compatibility layer.

## Remaining boundaries

- Class support is deliberately a compatibility subset. `PureComponent` and
  `shouldComponentUpdate` bailout timing are not emulated, and
  `componentDidCatch` receives an empty `componentStack` because Octane has no
  React Fiber stack.
- The event facade covers the common SyntheticEvent contract and text-input
  `onChange`; obscure event plugins and React private internals need individual
  validation.
- Controlled properties are enforced, but React's development-only warnings for
  controlled/uncontrolled switches are not reproduced.
- React Server Components and React's private renderer internals are out of scope.
- ReactDOM's synchronous `renderToString` API is not emulated; application SSR
  continues to use `render()` from `octane/server`. React dependencies loaded
  inside that render are supported by the server facade.
- React can turn some server render errors inside Suspense into fallback HTML and
  retry on the client. Octane SSR currently reports a targeted compatibility
  error instead.
