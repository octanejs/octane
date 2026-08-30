# @octanejs/xstate

XState for Octane — a port of [`@xstate/react@6.1.0`](https://github.com/statelyai/xstate/tree/main/packages/xstate-react).

The `xstate` actor core is framework-neutral and has no runtime dependencies, so
it is reused **unmodified** as a peer dependency. Only the React binding is
ported. See [`UPSTREAM.md`](./UPSTREAM.md) for the pin, the module and export
crosswalk, and the disposition of every upstream test.

```bash
npm install @octanejs/xstate xstate
pnpm add @octanejs/xstate xstate
```

## Usage

```tsx
import { createMachine } from 'xstate';
import { useMachine } from '@octanejs/xstate';

const toggleMachine = createMachine({
	id: 'toggle',
	initial: 'inactive',
	states: {
		inactive: { on: { TOGGLE: 'active' } },
		active: { on: { TOGGLE: 'inactive' } },
	},
});

export function Toggle() @{
	const [state, send] = useMachine(toggleMachine);

	<button onClick={() => send({ type: 'TOGGLE' })}>
		{state.value as string}
	</button>
}
```

`createActorContext` works exactly as upstream, including the member-call form:

```tsx
import { createActorContext } from '@octanejs/xstate';

const ToggleContext = createActorContext(toggleMachine);

function Display() @{
	const value = ToggleContext.useSelector((state) => state.value as string);
	<span>{value}</span>
}

export function App() @{
	<ToggleContext.Provider>
		<Display />
	</ToggleContext.Provider>
}
```

## Exports

`useActor`, `useActorRef`, `useSelector`, `useMachine` (deprecated upstream alias
of `useActor`), `createActorContext`, `shallowEqual` — the complete
`@xstate/react@6.1.0` surface.

## Intentional differences from `@xstate/react` on React

- **No StrictMode double-invoke.** Octane has no StrictMode, so effects, renders,
  and observer notifications fire once where React's development StrictMode fires
  them twice. Production counts are identical. Upstream's own suite parametrizes
  eight assertions over both modes; the non-strict values are this port's
  contract.
- **`useSyncExternalStore` skips React's commit-time `getSnapshot` re-read** when
  the rendered value was unchanged, because Octane's synchronous renderer closes
  the concurrent-interleaving window React guards there. An actor always
  notifies, so this is not reachable through this binding's public API.
- **Error boundaries are `@try`/`@catch` blocks**, not class components. An actor
  whose snapshot enters the `error` status still throws from render and is caught
  by the nearest boundary; only the way you write the boundary changes.
- **Server snapshots.** `getServerSnapshot` is optional in Octane and falls back
  to `getSnapshot`; React throws when it is missing. Both ported hooks always
  supply one.

`stopRootWithRehydration` is kept verbatim even though its motivating case
(React Strict Effects) cannot occur here, because it also governs
unmount-then-remount, which stays observable to consumers.
