# Skill: Octane's intentional divergences from React

Use this when behavior differs from React and you need to decide whether it is a
bug or by design. Do not "fix" these toward React.

## No rules of hooks

Hooks are tracked by compiler-assigned call-site slot, not call order. A hook may
sit behind a condition, after an early return, or in a loop. Code that relies on
hook-order errors firing does not apply.

## No controlled components, no synthetic onChange

`value` and `checked` are plain attributes; inputs are uncontrolled and native.
There is no per-keystroke synthetic `onChange`; use native `onInput`. React's
controlled-input value-reassertion model does not exist and must not be added.

## Native delegated events

`onClick`, `onInput`, `onSubmit` etc. are real DOM events via delegation, not a
synthetic layer. Timing, bubbling, and `event.target` semantics match the
platform, not React's wrapper.

## Keyed reconciler moves differ

Reconciliation is LIS-based (minimal DOM moves), not React's `lastPlacedIndex`.
The final DOM and survivor node identity are guaranteed identical to React; the
set of physically moved nodes is not. Tests asserting which nodes moved will
diverge; tests asserting final order and identity will pass.

## class / className composes clsx-style

Strings, numbers, arrays, objects, and nesting compose into a class string;
falsy parts drop out. React coerces an array to `"a,b"`; Octane yields `"a b"`.

## Not present at all

- Class components.
- Server Components / `'use client'` / `'use server'`.
- StrictMode double-invoke (renders and effects run once).
- `forwardRef` (refs are props, React 19 style).
- `useDebugValue` (shim as no-op).
- SuspenseList, Profiler, findDOMNode.

## Everything else matches

Observable hook, effect, Suspense, and transition semantics match React,
including effect ordering (child-first on mount, parent-first cleanup on
deletion), `Object.is` state bailouts, batching, and `useId` stability across
server render and hydration.
