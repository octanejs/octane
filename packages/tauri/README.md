# @octanejs/tauri

Octane hooks for [Tauri](https://tauri.app) v2 desktop apps.

Octane already runs inside a Tauri webview with no adapter: a zero-config Vite
project builds to static assets that `frontendDist` serves. What that leaves
open is the lifecycle glue between Tauri's promise/callback IPC and Octane's
render model, which is all this package is.

```bash
npm install @octanejs/tauri @tauri-apps/api
pnpm add @octanejs/tauri @tauri-apps/api
```

## `useInvoke(cmd, args?, options?)`

Runs a command and suspends until it resolves. Renders through `@try` /
`@pending` / `@catch` like any other suspending read.

```tsx
function Projects() @{
	const projects = useInvoke<Project[]>('list_projects', { archived: false });
	<ul>
		@for (const project of projects; key project.id) {
			<li>{project.name as string}</li>
		}
	</ul>
}
```

The promise is memoized on the call-site slot, so a replay never re-runs the
command. The default refetch key is the command name plus the *values* of a
record argument, so the `{ archived: false }` literal above does not refetch on
every render. That serialization costs one pass over the record per render,
which is nothing for the small argument objects commands take; array and binary
payloads are compared by identity instead.

`options.headers` is keyed the same way, so rotating an `Authorization` value
issues a new command instead of serving the one the previous token fetched.

`options.deps` replaces the argument half of that key, not the command name or
the headers: both are always part of it, so a changed command or credential can
never keep serving the previous one's result.

Writing `use(invoke('cmd', args))` directly in a `.tsrx` file also works and
gets the compiler's parallel-`use()` treatment. Reach for `useInvoke` when you
want explicit `deps`, or when the call lives in a plain `.ts` custom hook where
no template transform applies.

## `useInvokeState(cmd, args?, options?)`

The non-suspending form, for a button that reports its own progress.

```tsx
const { status, data, error, refetch } = useInvokeState<string>('sync_now');
```

`refetch()` returns the state to `pending` and clears `data`. There is no
stale-while-revalidate here on purpose: caching, retries, and background
refetching are a query library's job, and `@octanejs/tanstack-query` already
does that over any promise, including `invoke`.

## `useTauriEvent(event, handler, options?)`

Subscribes for the lifetime of the call site.

```tsx
useTauriEvent<Progress>('sync:progress', (received) => setProgress(received.payload));
```

`listen()` resolves its unlisten function *asynchronously*. A component that
unmounts before that lands leaks the listener, which is the single most common
Tauri lifecycle bug in a hand-written `useEffect`; this hook detaches either
way. `handler` is read through a ref, so an inline closure does not resubscribe:
only `event`, `options.target`, and `options.enabled` do.

A failed subscription is thrown by default, so a missing `core:event` permission
in the capability file is loud rather than a silently dead feature. That costs
the subtree: a component that throws never commits, so it cannot retry on its
own and only the boundary's `reset()` brings it back.

For a supplementary subscription whose loss should not take the subtree down,
pass `onError` instead. The component stays mounted, so changing `event` or
flipping `enabled` retries the subscription:

```tsx
useTauriEvent<Progress>('sync:progress', onProgress, {
	enabled: watching,
	onError: (error) => setBanner(describe(error)),
});
```

## Off-host behavior

Everything is guarded on `window.__TAURI_INTERNALS__`, so a plain browser tab or
an SSR pass never faults on a missing bridge:

| | no Tauri host |
| --- | --- |
| `useInvoke` | rejects with `TauriUnavailableError` (reaches `@catch`) |
| `useInvokeState` | `status: 'error'` with `TauriUnavailableError` |
| `useTauriEvent` | throws `TauriUnavailableError` from the boundary |

Server rendering performs no IPC at all: `useInvokeState` renders `pending` and
issues the command on the client after hydration.

To preview or test the app in an ordinary browser, install Tauri's own mock
bridge and the hooks behave normally:

```ts
import { mockIPC } from '@tauri-apps/api/mocks';

mockIPC((cmd, args) => {
	if (cmd === 'list_projects') return fixtureProjects;
	return null;
}, { shouldMockEvents: true });
```

`examples/workbench` does exactly that, which is how its browser journeys run
without a Rust toolchain.

## Not covered

The rest of `@tauri-apps/api` (window, webview, menu, tray, path, dpi, image)
and the `@tauri-apps/plugin-*` packages are already framework-neutral. Import
them directly; wrapping them here would only add a version-coupled second copy
of an API that does not need render integration.

`Channel<T>` streaming has no hook yet. Construct it in a `useMemo` so its
identity is stable across renders, and keep the handler in a ref.
