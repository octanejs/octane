# @octanejs/effect-atom-react

[@effect/atom-react](https://github.com/Effect-TS/effect/tree/main/packages/atom/react) for
[Octane](https://github.com/octanejs/octane). It ports the published
`@effect/atom-react@4.1.0` surface: the hooks that read, write, mount, refresh and
subscribe to Effect atoms, `RegistryContext` and `RegistryProvider`,
`HydrationBoundary`, and the `ScopedAtom` helpers. Atoms, registries and results
come from `effect` itself.

## Installation

```bash
npm install @octanejs/effect-atom-react effect
pnpm add @octanejs/effect-atom-react effect
```

## Usage

Define atoms with `effect/reactivity` and read them from any component:

```tsx
import { useAtom, useAtomValue } from '@octanejs/effect-atom-react';
import { Atom } from 'effect/reactivity';

const count = Atom.make(0);
const doubled = Atom.make((get) => get(count) * 2);

export function Counter() @{
	const [value, setValue] = useAtom(count);
	const twice = useAtomValue(doubled);
	<button onClick={() => setValue((n) => n + 1)}>{`${value} (x2: ${twice})`}</button>
}
```

Hooks read the registry in `RegistryContext`. Without a provider they share one
default registry; `RegistryProvider` gives a subtree its own:

```tsx
import { RegistryProvider } from '@octanejs/effect-atom-react';

export function App() @{
	<RegistryProvider initialValues={[[count, 10]]}>
		<Counter />
	</RegistryProvider>
}
```

To provide a registry created elsewhere, render the context directly:
`<RegistryContext value={registry}>`. Octane contexts have no `.Provider`.

## API

| Export | Purpose |
| --- | --- |
| `useAtomValue(atom, selector?)` | Subscribe and return the value, optionally mapped |
| `useAtom(atom, { mode? })` | Value and setter for a writable atom |
| `useAtomSet(atom, { mode? })` | Mount a writable atom and return its setter; `mode: 'promise'` or `'promiseExit'` for `AsyncResult` atoms |
| `useAtomMount(atom)` | Keep an atom mounted while the component is |
| `useAtomRefresh(atom)` | Mount an atom and return a callback that refreshes it |
| `useAtomSubscribe(atom, f, { immediate? })` | Call `f` on changes while mounted |
| `useAtomSuspense(atom, { suspendOnWaiting?, includeFailure? })` | Read an `AsyncResult` atom through Suspense |
| `useAtomInitialValues(entries)` | Seed atoms once per registry |
| `useAtomRef`, `useAtomRefProp`, `useAtomRefPropValue` | Read and derive `AtomRef` values |
| `RegistryContext`, `RegistryProvider`, `scheduleTask` | The registry context, a provider that owns one, and its task scheduler |
| `HydrationBoundary` | Apply dehydrated atom state from the server |
| `make`, `TypeId`, `ScopedAtom` | Atoms scoped to a provider |

Each module is also importable on its own, as upstream's are:
`@octanejs/effect-atom-react/Hooks`, `/RegistryContext`, `/ReactHydration`, and
`/ScopedAtom`.

## Server rendering

`useAtomValue` and `useAtom` read upstream's server snapshot
(`Atom.getServerValue`), so atoms marked with `Atom.withServerValue` or
`Atom.withServerValueInitial` render their server value under `octane/server`, and
hydration adopts the server's markup. As upstream does, the snapshot taken while
hydrating holds until every reader unsubscribes, so a Suspense boundary that
hydrates later matches the server HTML. `HydrationBoundary` applies
`Hydration.dehydrate` output before its children render.

## Differences from @effect/atom-react

`scheduleTask`, the default task scheduler for registries, posts a host task
instead of a React Scheduler task, because Octane has no Scheduler package.
Registry work still runs in a later, cancellable task, in order. Components read
contexts with Octane's `<Context value>` instead of `Context.Provider`.

See [UPSTREAM.md](./UPSTREAM.md) for the pinned source and how parity is tested.
