# @octanejs/alien-signals

[Alien Signals](https://github.com/stackblitz/alien-signals) bindings for
[Octane](https://github.com/octanejs/octane). This package ports the public
`react-alien-signals@0.4.0` API over the reused `alien-signals@3.2.1` core,
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

The package exports `WritableSignal`, `ReadableSignal`, `DependencyList`,
`createSignal`, `createComputed`, `createEffect`, `createSignalScope`,
`useSignal`, `useSignalValue`, `useSetSignal`, `useSignalEffect`,
`useSignalScope`, `useComputed`, `batch`, `trigger`, `useSignalSelector`,
`useDeferredSignalValue`, `useSignalPassiveEffect`, `useSignalLayoutEffect`,
`useSignalInsertionEffect`, `SignalSetter`, `SignalEffectCallback`, and
`SignalEffectDependencies`.

`useComputed(getter, dependencies)` passes its dependency list directly to
Octane memoization. Signal dependencies read by `getter` remain reactive; the
explicit list controls when the computed signal itself is rebuilt with a new
closure.

`useSignalEffect` and `useSignalScope` start work after the client commit and
dispose it on replacement or unmount. They do not execute during server
rendering. The stop function returned by `useSignalScope` is safe before commit,
after commit, and during later unmount cleanup.

## Migrating

Replace imports from `react-alien-signals` with
`@octanejs/alien-signals`. The hook names and authored call shapes are the same.
Both packages accept writable and computed readable signals. Existing direct
functional signal setters remain supported. Hook setters also accept raw core
signals and can store function values through an updater without invoking the
returned function.

`batch(callback)` groups signal propagation, including nested batches.
`trigger(signalOrCollector)` notifies readers after an in-place mutation.
`useSignalSelector(signal, selector)` subscribes to a derived snapshot;
`useDeferredSignalValue(signal)` defers that snapshot through Octane's scheduler.

Phase effects accept `(signals, callback, dependencies?)`. Keep `signals`
referentially stable, for example with `useMemo(() => [source], [source])`.
They follow Octane's insertion, layout, and passive phases and dispose the prior
callback on change and unmount. They do not run during SSR.

The scope stop controller remembers cancellation for the rest of its mounted
lifetime, including calls before commit. Upstream 0.4.0 also starts scopes after
commit but may create a new scope after a dependency change following a stop.

## Status

Current scope and verification evidence are tracked in the generated
[bindings status table](../../docs/bindings-status.md), sourced from this
package's [`status.json`](./status.json).
