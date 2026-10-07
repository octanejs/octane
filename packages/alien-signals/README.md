# @octanejs/alien-signals

[Alien Signals](https://github.com/stackblitz/alien-signals) bindings for
[Octane](https://github.com/octanejs/octane). This package ports the public
`react-alien-signals@0.4.0` API over the unchanged `alien-signals@3.2.1` core,
without React or React types.

## Installation

```sh
npm install @octanejs/alien-signals
pnpm add @octanejs/alien-signals
```

```tsx
import {
  createComputed,
  createSignal,
  useSignal,
  useSignalValue,
} from '@octanejs/alien-signals';

const countSignal = createSignal(1);
const doubledSignal = createComputed(() => countSignal() * 2);

export function Counter() @{
  const [count, setCount] = useSignal(countSignal);
  const doubled = useSignalValue(doubledSignal);

  <button onClick={() => setCount((value) => value + 1)}>
    {'Count: ' + count + ', doubled: ' + doubled}
  </button>
}
```

The package exports the types `ReadableSignal`, `WritableSignal`,
`SignalSetter`, `SignalEffectCallback`, `SignalEffectDependencies`, and
`DependencyList`; the core helpers `createSignal`, `createComputed`,
`createEffect`, `createSignalScope`, `batch`, and `trigger`; and the hooks
`useSignal`, `useSignalValue`, `useDeferredSignalValue`, `useSignalSelector`,
`useSetSignal`, `useSignalEffect`, `useSignalPassiveEffect`,
`useSignalLayoutEffect`, `useSignalInsertionEffect`, `useSignalScope`, and
`useComputed`.

A writable signal takes a value. Updater functions are accepted by the setters
that `useSignal` and `useSetSignal` return, not by the signal itself.

Every component that reads the same signal shares one core subscription.
`useSignalSelector(signal, selector)` re-renders only when the selected value
changes by `Object.is`. `useDeferredSignalValue(signal)` returns a deferred
snapshot of the signal.

`useComputed(getter, dependencies)` passes its dependency list directly to
Octane memoization. Signal dependencies read by `getter` remain reactive; the
explicit list controls when the computed signal itself is rebuilt with a new
closure.

`useSignalEffect(fn, dependencies?)` and `useSignalScope(callback,
dependencies?)` start work after the client commit and dispose it on
replacement or unmount. Without a dependency list they restart when the
callback identity changes. They do not execute during server rendering. The
stop function returned by `useSignalScope` is stable; it stops the scope that is
currently running, and a later dependency change starts a new one.

`useSignalPassiveEffect`, `useSignalLayoutEffect`, and
`useSignalInsertionEffect` take a referentially stable list of signals, the
effect, and optional extra dependencies. They re-run in the matching effect
phase whenever one of those signals changes.

## Migrating

Replace imports from `react-alien-signals` with
`@octanejs/alien-signals`. The hook names and authored call shapes are the same.

## Status

Current scope and verification evidence are tracked in the generated
[bindings status table](../../docs/bindings-status.md), sourced from this
package's [`status.json`](./status.json).
