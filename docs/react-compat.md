# React components inside Octane

`ReactCompat` from `octane/react` hosts a real React component inside an Octane
template. React owns the component's hooks, state, events, refs, and descendants;
Octane owns the surrounding page. Use React and React DOM 19.2 or newer in the
React 19 series, with matching versions.

```tsrx
// App.tsrx
import { ReactCompat } from 'octane/react';
import { Counter } from './Counter.react';

export function App() @{
	<ReactCompat>
		<Counter start={3} />
	</ReactCompat>
}
```

```tsx
/** @jsxImportSource react */
// Counter.react.tsx — compile this file with React's JSX transform.
import { useState } from 'react';

export function Counter({ start }: { start: number }) {
	const [count, setCount] = useState(start);
	return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
```

The built-in **ReactCompat** playground example includes live props, callbacks
into Octane, an imperative React ref, local Suspense, and unmount/remount controls.
`OctaneCompat`, from the same entry, supports the opposite direction: compiled
Octane components inside React 19. See the
[two-direction interoperability guide](https://octanejs.dev/docs/react-compat)
for choosing a boundary and setting up a mixed application. Both boundaries
have server implementations in `octane/react/server`.

## Compiler ownership

Keep React component modules under React's JSX transform. In a mixed Vite app,
use both the Octane and React plugins and make ownership explicit:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { octane } from 'octane/compiler/vite';

export default defineConfig({
	plugins: [octane({ requireDirective: true }), react()],
});
```

`.tsrx` files always belong to Octane. Mark Octane-owned `.tsx` files and native
hook/context helper modules with `/** @jsxImportSource octane */`; mark React-owned JSX with
`/** @jsxImportSource react */`. Do not alias React or React DOM to Octane.

`requireDirective` applies to application files under the bundler root. Keep
mixed application modules inside that root. Installed and linked packages retain
their package ownership rules; a React library that does not declare Octane
remains React-owned.

Use a named `ReactCompat` import (aliases are supported). The compiler transports
its child as an inspectable element descriptor instead of executing the React
component in Octane's renderer. Props and refs retain their types at the child's
call site. A single function, class, `memo`, `lazy`, or `forwardRef` component is
accepted; fragments, DOM elements, arrays, and multiple island roots are rejected.
Put those structures inside a React component instead.

The component/props form is also available:

```tsrx
<ReactCompat component={Counter} props={{ start: 3 }} />
```

Do not combine the two forms. React children passed through props must be React
renderables, not Octane template blocks. Prefer JavaScript default parameters for
function defaults: the outer element is authored by Octane and follows Octane's
descriptor/defaultProps normalization.

## State, updates, and boundaries

Changing props updates the existing React root and preserves state and DOM
identity. Changing the child key or type replaces the React component. Changing
the `ReactCompat` key replaces the whole root. Ordinary props, callbacks, and
React 19 ref props pass through unchanged; React class refs target the instance.

Each island has one `div[data-react-compat]` host. Octane never reconciles its
interior. Place the boundary where a div is valid, not directly in a table row,
select, SVG tree, or another restricted content model. Treat its children as
React-owned DOM; direct writes by an outer renderer are unsupported.

The React root starts or updates after the Octane host commits. `root.render()`
and Octane `flushSync()` do not synchronously flush React work. React-local
transitions retain React's normal pending and content behavior. An Octane
transition is not a shared transaction across the two renderers: it does not
wait for the separate React root or roll back already committed Octane siblings.

An authored React Suspense or error boundary handles its own descendants first.
An escaped React suspension projects to the nearest Octane `@pending`/Suspense
boundary; completion is reported after React content commits. Escaped render,
layout, and passive-effect errors reach the nearest Octane catch boundary.
Resetting that boundary remounts the island. Event-handler errors follow React's
normal event error reporting; React error boundaries do not catch them.

While an island is projected as pending, new parent props/context snapshots are
published on reveal. Delete the boundary or change its outer key to replace a
pending island. This is the same post-commit coordination model as
`OctaneCompat`, not cross-root atomic commit.

Octane Suspense hiding disconnects React layout effects and refs and hides its
portals, while preserving passive effects. Octane Activity hiding also
disconnects passive effects. Reveal restores the same React state and nodes.
Actual deletion invalidates the island immediately and unmounts React in a
microtask, including islands deleted while hidden or pending. This deferral
allows nested React→Octane→React trees to delete safely during a React commit.

## Context

Map a native Octane context to a real React context once, then pass the mapping
to the boundary. This is specific to `ReactCompat`: in the opposite direction,
an Octane component inside `OctaneCompat` can already read a real React context
directly with Octane's `use` or `useContext`.

```ts
/** @jsxImportSource octane */
import { createContext } from 'octane';
import { createContext as createReactContext } from 'react';
import { bridgeReactContext } from 'octane/react';

export const Theme = createContext('light');
export const ReactTheme = createReactContext('light');
export const reactContexts = [bridgeReactContext(Theme, ReactTheme)];
```

```tsrx
<Theme value="dark">
	<ReactCompat contexts={reactContexts}>
		<ReactPanel />
	</ReactCompat>
</Theme>
```

`ReactPanel` reads `ReactTheme` with React's `use` or `useContext`. It receives the
nearest Octane provider value, including an explicit `undefined`, and updates
through Octane and React memo boundaries without losing state. Mappings are
scoped to each island; neither renderer's context internals are changed. Keep
the ordered source/target identities stable for the boundary's lifetime, or
change the boundary key. Duplicate target contexts are rejected. React providers
inside the island keep their usual precedence.

## Server rendering and hydration

The server implementation is `ReactCompat` from `octane/react/server`. Octane's
server compiler retargets `octane/react` imports automatically. Custom pipelines
must use the server entry explicitly.

Use Octane's asynchronous or streaming server renderer. Each React island buffers
its complete React server HTML; an enclosing Octane streaming boundary can send
its fallback while that island is pending. React's internal progressive reveal
scripts are not streamed separately. Errors reach the Octane server catch path;
React error boundaries do not handle server render errors.

React `useId` values receive a per-island prefix derived from Octane `useId`.
Hydration adopts the existing island DOM through React `hydrateRoot`, preserving
its nodes, refs, and user-edited form state. The server and client must render the
same component, context values, and tree. Normal React hydration recovery applies
to a mismatch inside an island.

The server request owns pending React work. Abort, cancellation, timeout, and
request completion release it. Buffered island HTML is limited to 8 MiB. A
synchronous Octane render can produce a surrounding fallback but cannot await
the React island. Nested React→OctaneCompat→ReactCompat server rendering is not
supported; client nesting works in both directions.

## Cost

Only importing `octane/react` adds the React integration. Native-only client bundles do
not include React or pay adapter work during ordinary rendering. Every island
does add a React root and its scheduling, event, and lifecycle overhead; prefer
one boundary around a useful React subtree over a boundary per tiny widget.
The [benchmark](../benchmarks/octane-hosted-react/README.md) records native bundle
controls and paired workloads against the same number of direct React roots.
The shared server request lifetime adds a small fixed cost even without React;
the benchmark's server measurements report that separately.
