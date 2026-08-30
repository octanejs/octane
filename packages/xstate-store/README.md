# @octanejs/xstate-store

XState Store for Octane — a port of [`@xstate/store-react@2.0.0`](https://github.com/statelyai/xstate/tree/main/packages/xstate-store-react).

The `@xstate/store` core is framework-neutral, so it is reused **unmodified** and
re-exported wholesale from this entry point, exactly as upstream does. Only the
React binding is ported. See [`UPSTREAM.md`](./UPSTREAM.md) for the pin, the
export crosswalk, and the disposition of every upstream test.

```bash
npm install @octanejs/xstate-store
pnpm add @octanejs/xstate-store
```

## Usage

```tsx
import { createStore, useSelector } from '@octanejs/xstate-store';

const store = createStore({
	context: { count: 0 },
	on: {
		inc: (context, event: { by: number }) => ({
			...context,
			count: context.count + event.by,
		}),
	},
});

export function Counter() @{
	const count = useSelector(store, (s) => s.context.count);

	<button onClick={() => store.trigger.inc({ by: 1 })}>{count as string}</button>
}
```

`createStoreHook` bundles the store and its selector into one hook:

```tsx
import { createStoreHook } from '@octanejs/xstate-store';

const useCountStore = createStoreHook({
	context: { count: 0 },
	on: { inc: (context, event: { by: number }) => ({ ...context, count: context.count + event.by }) },
});

export function Counter() @{
	const [count, store] = useCountStore((s) => s.context.count);

	<button onClick={() => store.trigger.inc({ by: 1 })}>{count as string}</button>
}
```

## Exports

Everything `@xstate/store@4.2.3` exports (`createStore`, `createStoreConfig`,
`createStoreLogic`, `createAtom`, `createAtomConfig`, `createAsyncAtom`,
`createReducerAtom`, `fromStore`, `shallowEqual`, and the full type surface),
plus the ported hooks `useSelector`, `useStore`, `useAtom`, `useAtomState`, and
`createStoreHook`.

## Intentional differences from `@xstate/store-react` on React

- **Conditional hook calls are legal.** Upstream calls hooks inside `if` branches
  in `useSelector` and `useAtom`. On React that only works because the branch is
  stable for a given call site. Octane keys hooks by compiler-assigned call site
  rather than call order, so the shape is sound here — and if a call site ever
  did flip branches, Octane keeps independent hook cells per branch instead of
  corrupting hook order.
- **`useSyncExternalStore` skips React's commit-time `getSnapshot` re-read** when
  the rendered value was unchanged, because Octane's synchronous renderer closes
  the concurrent-interleaving window React guards there.
- **Server snapshots.** `getServerSnapshot` is optional in Octane and falls back
  to `getSnapshot`; React throws when it is missing. Every hook here supplies one.
