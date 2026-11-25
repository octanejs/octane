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
for choosing a boundary and setting up a mixed application. The Octane Vite
plugin resolves `octane/react` imports in the SSR graph to `octane/react/server`,
including imports from React-owned JSX. Use `octane/react/server` when the
server loads Octane directly or when you mark Octane as external in Vite's dev
server. Like the `ReactCompat` host below, the `div[data-octane-compat]` host is
styled `display: contents`, so the island's own root element is the parent's flex
or grid item. Use
`OctaneCompatInline` from the same entries for a `span[data-octane-compat]`
host. It takes the same props. Use phrasing content inside the span and
respect the surrounding HTML, including a button's restriction on nested
controls.

Pass `hostClassName` and `hostStyle` to style either host from React. A supplied
`hostStyle` replaces the default `display: contents`. For example,
`hostStyle={{ display: 'inline' }}` gives an inline host its own layout box,
and `hostStyle={{}}` leaves its display to CSS and the element's default.

Use `hostRole` and `hostAriaLabel` to set a role and accessible name on either
React-owned host. For example, a named icon can use `hostRole="img"`,
`hostAriaLabel="Status"`, and `hostStyle={{ display: 'inline-block' }}` to give
the host its own layout box.

When React's `Activity` hides an `OctaneCompat` island, prop and React context
changes still reach it, as they reach a hidden React child: the island re-renders and
its insertion effects run, so a stylesheet they install for visible siblings
stays current. A new child identity replaces the island while hidden, as a
React key change does. Layout effects, passive effects, and refs stay
disconnected until reveal. Behind a React Suspense fallback, React discards an
update that suspends again, so the island, like a React child, takes the new
value when the boundary reveals.

When React removes an `OctaneCompat` host, it takes the host out of the DOM
during the commit. Octane disposes the hosted root afterward, so its ref and
effect cleanups can run after the surrounding React unmount call returns.

While React Suspense shows the fallback for an `OctaneCompat` island, a new
component type or child key on the same host replaces the pending child, as a
`React.lazy` swap does. The replacement starts loading at once and the same
fallback stays up until it is ready. The superseded work is dropped: it does not
retry, reveal, or report a rejection. Its effects never run, because Octane
commits the replacement only after React commits it. New props or context for
the same component still wait for the current suspension and are published on
reveal. Change the React `key` on `OctaneCompat` itself to start over with a
new hosted root and reset the island's local state.

Resource hints such as `preload` and `preinit` issued during an
`OctaneCompat` render use the React host's document resource handling.
Place declarative document metadata such as `<title>` and `<meta>` in the
React tree.

In the browser, either host can borrow the `signalOwner` of a native Octane
root. Pass the same owner to each island that should share its compiled
module-level signals.

```tsx
const root = createRoot(container, { signalOwner: documentScope });

<OctaneCompat clientSignalOwner={documentScope} component={Panel} props={panelProps} />
```

The host captures the owner for its React key. Change the host's outer key
to use a different owner. The caller owns disposal, so removing one island
leaves the other borrowers active.

On the server, import either host from `octane/react/server` and pass the
request scope explicitly:

```tsx
<OctaneCompat serverSignalOwner={requestScope} component={Panel} props={panelProps} />
```

The host borrows that owner for session creation and every Fizz attempt or
replay, including overlapping streams. It never disposes the scope. Supply
`clientSignalOwner` from the browser entry with the same scope key as the
server owner. Existing hydration sidecars carry historical reads before the
browser owner supplies live values. A request-wide async carrier is also
available when code outside the hosted island needs the owner.

## Storybook with Octane components

The [Storybook example](../examples/storybook/README.md) uses `OctaneCompat` in
the opposite direction: Storybook's React renderer owns ordinary `.stories.tsx`
wrappers, while Octane owns the native `.tsrx` component subtree. Its local
`asReact` helper creates a stable React wrapper with inferred native props and
passes them through `OctaneCompat`; explicit args and argTypes provide Controls.
The example README covers installation, compiler setup, development, static builds,
and browser verification.

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

`requireDirective` gates application files under the bundler root. Installed and
linked packages use their manifest's default ownership. With this option
enabled, a package's `.tsx` file with a leading `/** @jsxImportSource react */`
stays with React's transform unless the application registers `react` as its
renderer intrinsics. A React library that does not declare Octane remains
React-owned.

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

`ReactCompat` has one `div[data-react-compat]` host. Use `ReactCompatInline`
from the same entry point to host phrasing content inside a paragraph or other
parent that accepts a span. It takes the same props and uses a
`span[data-react-compat]` host on the client and server.

Both hosts use `display: contents` so they add no layout box. Place the boundary
where its host and the React content are valid HTML. Octane leaves the island's
interior to React, including its DOM updates.

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

## Request-scoped signals in Node.js

For request-wide ownership beyond an individual hosted island, a Node.js server using React's `renderToPipeableStream` can install an async carrier once in the server entry. Enter the caller's scope when starting each render so React's asynchronous work can read that request's signals.

```ts
import { AsyncLocalStorage } from 'node:async_hooks';
import { renderToPipeableStream } from 'react-dom/server';
import {
  installSignalOwnerEnvironment,
  runWithSignalOwner,
  type SignalOwner,
  type SignalOwnerIdentity,
} from 'octane/signals/server';

const owners = new AsyncLocalStorage<SignalOwnerIdentity>();
installSignalOwnerEnvironment({
  current: () => owners.getStore() ?? null,
  run: (owner, render) => owners.run(owner, render),
  capture: (owner) => (render) => owners.run(owner, render),
});

export function renderRequest(
  owner: SignalOwner,
  tree: Parameters<typeof renderToPipeableStream>[0],
  options?: Parameters<typeof renderToPipeableStream>[1],
) {
  return runWithSignalOwner(owner, () => renderToPipeableStream(tree, options));
}
```

The HTTP handler owns the scope. For a scope dedicated to one response, dispose it when the response finishes, and abort the React stream and dispose the scope if the client disconnects first. A recoverable React render error can leave other work pending.

The carrier applies to Node server rendering. To [borrow an owner in the browser](https://octanejs.dev/docs/react-compat#borrow-a-client-signal-owner), pass `clientSignalOwner` from the browser entry with the same scope key as the request owner. The existing island sidecars supply historical reads during hydration. After hydration, the islands read live values from the browser owner.

## Server rendering and hydration

The server implementation is `ReactCompat` from `octane/react/server`. Octane's
server compiler retargets `octane/react` imports automatically. Custom pipelines
must use the server entry explicitly.

Use Octane's asynchronous or streaming server renderer. Each React island buffers
its complete React server HTML; an enclosing Octane streaming boundary can send
its fallback while that island is pending. React's internal progressive reveal
scripts are not streamed separately. Errors that escape a React island's server render take
[Octane's server error path](./ssr.md#render-errors): an enclosing Octane
`@catch` arm or `<ErrorBoundary>` can render its fallback on the server. React
error boundaries inside the island retain React's own server semantics.

React `useId` values receive a per-island prefix derived from Octane `useId`.
Hydration adopts the existing island DOM through React `hydrateRoot`, preserving
its nodes, refs, and user-edited form state. The server and client must render the
same component, context values, and tree. Normal React hydration recovery applies
to a mismatch inside an island. If the owning Octane root has an
`onRecoverableError` handler, it receives one error for each recovery reported
by React. The error message identifies the island by its React identifier prefix,
and its `cause` is the original React error. With no handler, React reports the
error through its usual channel.

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

## Streaming and hydrating a full document

Use `ReactCompatDocument` when a React framework renders the entire HTML document.
Call it once at the root with a real React element. Compile the document entry
with React's JSX transform. Use the ordinary `<ReactCompat>` component for
islands inside an Octane tree.

```tsx
/** @jsxImportSource react */
import { ReactCompatDocument } from 'octane/react/server';

const stream = await ReactCompatDocument.renderToReadableStream(<ServerDocument />, {
	nonce,
	signal: request.signal,
});
return new Response(stream, { headers: { 'Content-Type': 'text/html' } });
```

```tsx
/** @jsxImportSource react */
import { ReactCompatDocument } from 'octane/react';

const shell = ReactCompatDocument.hydrate(document, <ClientDocument />, {
	onRecoverableError: reportError,
});
document.addEventListener('keydown', handleShortcut, { signal: shell.signal });
```

React owns the document markup, head resources, IDs and Suspense boundaries.
The server entry forwards the React DOM stream, including `allReady`, without
buffering or adding an island host. Both entries accept the native React DOM
options. Supply the same `identifierPrefix` on both sides if you set one.

The client attaches an Octane behavior root to `document.documentElement`.
Use it to register behaviors or bind listeners to its lifetime. Its `ready`
promise tracks behavior adoption only. React may still be hydrating. Calling
`shell.dispose()` aborts those listeners and unmounts React, including React's
DOM cleanup. Leave `preserveDOM` at its default to keep the document structure.
Passing `false` also removes the head and body.

## Binding a streamed React host

Use `createReactCompatHost` when Octane should manage selected properties of
a layout element while its children stay in the same React tree. Compile
this module for both server and client with Octane.

```tsrx
'use strong';

import { unbound } from 'octane/behavior';
import { createReactCompatHost } from 'octane/react';

function View(props: { className?: string; 'data-open': boolean; children?: never }) @{
	'use dom bindings';
	<div class={props.className} data-open={props['data-open']}>
		{unbound(props.children)}
	</div>
}

export const Frame = createReactCompatHost(View);
```

Use the resulting component in ordinary React JSX.

```tsx
<Frame className="frame" data-open={open} ref={frameRef}>
	<Outlet />
</Frame>
```

The template declares ownership only. Use one `div`, direct reads of the
corresponding `className`, `data-*`, `aria-*` or `style` props, and
`{unbound(props.children)}`. Pass plain React DOM values. Binding `style`
claims the whole object. Omit it when an animation library writes inline
styles. Other props, events and refs pass through to the div. The compiler
requires a named local template and the factory call in a module-level
`const`. Compute any derived values in the caller.

React streams the div and its children, including pending Suspense boundaries.
On attachment, Octane checks the compiler's `data-octane-bindings` stamp and
adopts the declared properties on that same element. If the stamp is missing
or stale, React keeps ownership. Abandoned renders never update the bindings.
The component also works in a client-only React root. It adds no wrapper,
shadow root, portal or second renderer root.
