# Skill: Migrate a React component to Octane

Use this when converting React component source (JSX/TSX) into an Octane `.tsrx`
component.

## Imports

Everything comes from `octane`. Replace `react`, `react-dom`, and
`react-dom/client` imports:

```ts
import { useState, useEffect, createPortal, createRoot, hydrateRoot } from 'octane';
```

## Component shape

Any function used at a `<Foo/>` site is a component. Two equivalent forms:

```tsx
export function Counter() @{
	const [count, setCount] = useState(0);
	<button onClick={() => setCount(count + 1)}>{'Count: ' + count}</button>
}

export function Counter() {
	const [count, setCount] = useState(0);
	return <button onClick={() => setCount(count + 1)}>{'Count: ' + count}</button>;
}
```

The `@{ ... }` body must end with exactly one output node. Setup code (hooks,
locals, early returns) stays above it.

## Conversion table

| React pattern | Octane pattern |
| --- | --- |
| `items.map(x => <li key={x.id}>...` | `@for (const x of items; key x.id) { <li>... }` with optional `@empty { }` |
| `cond ? <A/> : <B/>` in JSX | `@if (cond) { <A/> } @else { <B/> }` |
| `{cond && <A/>}` | `@if (cond) { <A/> }` |
| switch on a value | `@switch (v) { @case (a) { } @default { } }` |
| `<Suspense fallback={...}>` | `<Suspense>` or `@try { } @pending { }` |
| Error boundary class | `<ErrorBoundary>` or `@try { } @catch (e) { }` |
| `forwardRef((props, ref) => ...)` | plain function; `ref` arrives as a prop |
| `<input onChange={...}>` | `<input onInput={...}>` (native event) |
| controlled `value={state}` | uncontrolled; `value` is a plain attribute, read the DOM in handlers |
| `className={clsx(...)}` | `class={[...]}` composes clsx-style natively |
| `useDebugValue(x)` | delete it |
| `React.lazy(() => import(...))` | dynamic `import()` + `use()` under Suspense |
| `defaultProps` | parameter defaults / destructuring defaults |

## Text holes

A dynamic text hole needs `{expr as string}` unless the compiler can prove the
expression is a string (string literal, template literal, `+` concatenation with
a string, or a tracked local). A bare `{expr}` that is not provably a string is
treated as a renderable (component, element, coerced primitive).

```tsx
<p>{'Elapsed: ' + seconds}</p>
<p>{seconds as string}</p>
```

## Hooks

The hook API matches React, and there are no rules of hooks: a hook may sit
behind a condition, after an early return, or in a loop, because identity comes
from the call site, not call order.

```tsx
export function Panel(props) @{
	const [n, setN] = useState(0);
	if (props.hidden) return;
	useEffect(() => log(n), [n]);
	<button onClick={() => setN(n + 1)}>{'count: ' + n}</button>
}
```

## What does not port

- Class components (rewrite as functions).
- StrictMode double-invoke expectations (there is no double render; delete
  render-count workarounds).
- Server Components / `'use client'` directives.
- Synthetic event pooling or `e.persist()` (events are native).
- `React.Children` traversal over arbitrary VDOM (children are descriptors, not
  a VDOM tree; prefer explicit props over children introspection).

## Events

Events are native, delegated DOM events. `onClick`, `onInput`, `onSubmit`,
`onKeyDown` behave exactly like the platform. `onChange` on a text input fires
on commit (native change), not per keystroke.

## Refs

React 19 style. `ref={cb}` with optional cleanup return, `ref={refObject}`, or
an array `ref={[a, b]}` to compose. No `forwardRef` anywhere.

## Incremental migration

A React app does not have to convert everything at once. Mount already-migrated
Octane components inside the remaining React tree with
`@octanejs/react-wrapper`: `wrapOctane(Component)` returns a first-class React
component (props pass through; React children bridge into the Octane
`children` hole). Migrate leaf components first, wrap them, and move the
boundary upward.
