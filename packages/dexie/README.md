# @octanejs/dexie

[Dexie](https://dexie.org/) bindings for the [octane](https://github.com/octanejs/octane)
UI framework.

This package re-exports Dexie's framework-neutral IndexedDB API and ports the
reactive hooks from `dexie-react-hooks` to Octane. Existing Dexie database,
schema, transaction, and query code can remain unchanged.

```tsx
import Dexie from '@octanejs/dexie';
import { useLiveQuery } from '@octanejs/dexie';

const db = new Dexie('friends');
db.version(1).stores({ friends: '++id, name' });

function FriendList() @{
	const friends = useLiveQuery(() => db.table('friends').toArray(), [], []);
	<ul>
		{friends.map((friend) => <li key={friend.id}>{friend.name as string}</li>)}
	</ul>
}
```

## Ported hooks

- `useObservable`
- `useLiveQuery`
- `useSuspendingObservable`
- `useSuspendingLiveQuery`
- `usePermissions` for Dexie Cloud databases
- `useDocument` for optional `y-dexie` document providers

The suspending hooks use Octane's `use()` integration and work with Octane
Suspense or `@try` / `@pending` / `@catch` boundaries.

Dexie only observes changes made through Dexie. For async work outside Dexie
inside a live query, follow Dexie's guidance and wrap the returned promise with
`Promise.resolve()` so the observation context remains active.

`useDocument` requires the consumer to install and import `y-dexie` and `yjs`
before calling the hook. Those packages are intentionally not dependencies of
`@octanejs/dexie`.

## SSR and hydration

Non-suspending live queries are SSR-safe: the configured default result renders
without opening IndexedDB, and the client hydrates the existing host before
replacing that default with live data. Suspending live queries are intended for
client-side Suspense boundaries and do not load IndexedDB data during SSR.

## Status

Current scope, known divergences, and verification status are tracked in the
generated [bindings status table](../../docs/bindings-status.md), sourced from
this package's [`status.json`](./status.json).
