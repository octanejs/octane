# @octanejs/use-sync-external-store

The `use-sync-external-store` 1.7.0 entry points for Octane. Replace
`use-sync-external-store` imports with `@octanejs/use-sync-external-store` when
porting source to Octane.

## Installation

```sh
npm install @octanejs/use-sync-external-store octane
pnpm add @octanejs/use-sync-external-store octane
```

## Usage

```ts
import { useSyncExternalStoreWithSelector } from '@octanejs/use-sync-external-store/with-selector';

const todo = useSyncExternalStoreWithSelector(
	store.subscribe,
	store.getSnapshot,
	store.getServerSnapshot,
	(state) => state.todos[id],
	(left, right) => left.done === right.done && left.title === right.title,
);
```

Every published entry point has a counterpart, including the `.js` spellings:

| Entry point | Exports |
| --- | --- |
| `@octanejs/use-sync-external-store` | `useSyncExternalStore` |
| `/shim`, `/shim/index.js`, `/shim/index.native`, `/shim/index.native.js` | `useSyncExternalStore` |
| `/with-selector`, `/with-selector.js`, `/shim/with-selector`, `/shim/with-selector.js` | `useSyncExternalStoreWithSelector` |

`useSyncExternalStore` is Octane's own hook, the same function `octane` exports,
just as the published package re-exports React's built-in hook on React 18 and
later. Octane always has the built-in hook, so the userspace fallback the shim
keeps for React 16 and 17 is not needed. New code can import
`useSyncExternalStore` from `octane` directly.

`useSyncExternalStoreWithSelector` is a port of React's selector hook. It
recomputes the selection only when the snapshot changes, and keeps the previous
selection when `isEqual` reports the new one equal, so an unchanged selection
does not re-render.

As upstream does, the main entry point logs one error in development when it
loads, recommending `/shim` or `octane` instead.

## Differences from React

- During server rendering, Octane's `useSyncExternalStore` falls back to
  `getSnapshot` when no server snapshot is given; React throws. Pass
  `getServerSnapshot` for markup that must match the client's first render.
- Octane hydrates only markup its own server renderer wrote.

`UPSTREAM.md` records the pinned source, license, and test evidence.
