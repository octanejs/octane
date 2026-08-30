# @octanejs/alien-signals

[Alien Signals](https://github.com/stackblitz/alien-signals) bindings for
[Octane](https://github.com/octanejs/octane). This package ports the public
`react-alien-signals@0.3.0` API over the unchanged `alien-signals@1.0.4` core,
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
`useSignalScope`, and `useComputed`.

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
Unlike the published adapter's narrow declaration, `useSignalValue` explicitly
accepts both writable and computed readable signals, matching its documented
runtime behavior.

## Status

Current scope and verification evidence are tracked in the generated
[bindings status table](../../docs/bindings-status.md), sourced from this
package's [`status.json`](./status.json).
