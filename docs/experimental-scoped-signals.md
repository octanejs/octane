# Experimental scoped async signals

This branch implements an opt-in experiment for [RFC 2](https://github.com/octanejs/RFCs/discussions/2), using the public Alien Signals 3.2.0 system API. It is not a stable API or a release recommendation. The [implementation plan](plans/2026-08-27-experimental-scoped-async-signals-plan.md) records the scope and acceptance gates; the [engine measurements](../benchmarks/scoped-signals/results/2026-08-27/README.md) record measured costs and their limits.

`octane/signals` is a renderer-independent data engine. Native component reads require `nativeReads: true`. Option validation and forwarding are implemented in the compiler, app configuration, and Vite, Rspack, and Rsbuild wrappers, but these build integrations have not been executed with the locked toolchain in this environment. The compiler's Vite configuration is:

```ts
import { octane } from 'octane/compiler/vite';

export default {
	plugins: [octane({ nativeReads: true })],
};
```

The existing `@octanejs/alien-signals` binding remains on its separate 1.0.4 contract. This experiment does not replace it or change ordinary hook dependencies.

## Data ownership and immediate reads

```ts
import { createScope } from 'octane/signals';

const account = createScope({ scopeKey: 'account:42' });
const count$ = account.signal$('count', 0);
const doubled$ = account.derived$('doubled', () => count$.get() * 2);

account.batch(() => {
	count$.set(2);
	console.log(doubled$.get()); // 4, immediately
	count$.set((previous) => previous + 1);
});

const stop = doubled$.subscribe(() => console.log(doubled$.get()));
// subscribe does not deliver an initial notification.
count$.set(4);
stop();

// Retire this data owner when the account/session actually ends.
account.dispose();
```

Keys are nonempty strings, unique within one scope. Two scopes with the same textual `scopeKey` still own separate state. A handle can read itself, or its owning scope can read it with `scope.get(handle$)`; a different scope cannot impersonate that owner. Derived computations may read handles belonging to another scope without taking ownership of them.

Writes use `Object.is` equality and become visible immediately. Nested batches defer notifications until the outer synchronous batch ends. `scope.action(fn)` preserves `this`, arguments, and the return value while applying that same batching rule. It does not untrack reads, roll back earlier writes on an exception, or keep a batch open across `await`.

Derived callbacks must be synchronous. Derived evaluation, updater callbacks, native rendering, and historical adoption reject signal writes. Untracking a loader does not remove this separate write guard. Plain values can be objects, but deep mutation is not tracked; replace a value to publish a change.

Explicit scopes own their producers independently of UI consumers. Unmounting one component removes its native subscriptions; it does not destroy shared resources used by another component. `dispose()` is idempotent and revokes requests, closes streams, releases dependency links and historical leases, and clears retained values. Surviving handles then throw `ScopeDisposedError`. Public subscriptions end silently on disposal.

## Async resources, retries, and streams

```ts
import { createScope, query } from 'octane/signals';

const account = createScope({ scopeKey: 'account:42' });
const selectedId$ = account.signal$('selected-id', 1);

const userQuery = query('user', async (id: number, { signal }) => {
	const response = await fetch(`/api/users/${id}`, { signal });
	if (!response.ok) throw new Error(`User request failed: ${response.status}`);
	return response.json() as Promise<{ id: number; name: string }>;
});

const user$ = account.asyncSignal$('user', () => userQuery(selectedId$.get()));
const card$ = account.derived$('card', () => ({
	id: selectedId$.get(),
	name: user$.get().name,
}));

selectedId$.set(2);
const previousCard = card$.latest(null);
user$.retry(); // Quiet refresh if the selected request still has a usable value.
user$.retry({ pending: true }); // Strict reads suspend until the new result.
```

The description runs eagerly and tracks its synchronous reads. The loader, including its synchronous prefix, is untracked. Equivalent canonical query arguments share an in-flight request within one data scope. Retrying a shared entry retries it for all selectors of that entry. Distinct owners do not share requests. Incompatible loader definitions under the same query key are rejected.

Every attempt has a revocable publishing lease. An obsolete resolve, rejection, stream yield, or completion cannot publish after selection changes, retry, or disposal, even if the producer ignores cancellation. Entries are removed when no resource selects them; there is no idle cache of every historical request key.

Cancellation callbacks are untracked producer code. If abort or iterator cleanup retires the scope, the canceled caller cannot start replacement work. If cleanup retries synchronously, that nested attempt keeps its lease even if its loader immediately fails.

Request arguments and serialized values accept undefined, null, booleans, finite numbers, strings, dense arrays, and acyclic plain objects with enumerable string data properties. Object keys are canonicalized; undefined and negative zero remain distinct. Accessors, symbols, custom prototypes, sparse arrays, cycles, and nonfinite numbers are rejected. Request arguments are copied and frozen before loading, so mutating the caller's object cannot change an in-flight identity.

A stream query uses `query(key, loader, { kind: 'stream' })`, where the loader returns an async iterable or a promise of one. Before its first yield the resource is pending and connecting. A yield makes it ready and open; normal completion keeps the last value and marks it closed and complete. Completing without any yield is an error. Cancellation requests both abort and iterator closure. Iterator factory, `next()`, and result-accessor failures become resource errors.

## Availability and retained values

| Read                                   | Contract                                                                                                                          |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `handle$.get()` / `scope.get(handle$)` | Return the current ready value, throw its pending thenable, or throw its error.                                                   |
| `handle$.latest(fallback)`             | Return the whole last successful computation, or the fallback if none exists. This result need not have appeared in committed UI. |
| `handle$.snapshot()`                   | Return an immutable status record. Ready records have `value`; error records have `error`; pending records have neither.          |
| `scope.isPending(() => handle$.get())` | Catch pending thenables and return a boolean; other errors still throw.                                                           |

Snapshots also expose `refreshing`, `connection`, `complete`, and an optional request identity. Undefined, null, false, and empty strings are usable values, not pending sentinels. A stream can be ready while its producer is incomplete. Ready derived snapshots aggregate activity from their dependencies.

`latest` retains one complete _calculation result_, not an arbitrary mixture of old and new fields. A successfully calculated object can be retained while one of its next inputs is pending. Ordinary errors preserve that last result, but `latest` never hides a retired owner or an incompatible/released historical frame. Resource retry and UI error-boundary reset remain separate operations.

## Components and existing hooks

Native reads use Octane's existing component scopes, blocks, scheduling, and acceptance machinery. The compiler carries read evidence through its own memoization and deferred values. A stable signal handle alone is not evidence that its value is unchanged. Committed subscriptions remain alive until replacement work is accepted, and discarded work releases its provisional subscriptions.

Native reads in parameter or destructuring default initializers execute before the generated body collector. The compiler also does not follow values through locals to recognize every JSX-returning function: setup reads in a function that returns an intermediate `view` variable can miss collection even when that variable contains JSX. These are known gaps in this prototype and are not guaranteed to receive a diagnostic. Compiler execution and broader authoring coverage remain acceptance gates; this draft does not claim complete native-read support.

Use `$` for signal bindings and functions that return native signals or hide live native reads. The naming diagnostics recognize the new branded API, statically known native-capability aliases and helpers, and optional TypeScript facts. They do not rename old bindings or ordinary properties merely because they end in `$`. Opaque imported functions can exceed static naming analysis; compiler-owned caches must still preserve reads observed at runtime.

Sample values during rendering before passing them to ordinary effects or memos:

```ts
const count = count$.get();
const formatted = useMemo(() => formatCount(count), [count]);
useEffect(() => recordCount(count), [count]);
```

Known native reads hidden inside a `useMemo` callback with inferred or fixed dependencies are diagnosed; `[count$]` observes the stable handle, not its changing value. The explicit `null` dependency form remains the existing every-render escape. Effects and event callbacks read imperatively and do not create render subscriptions. Explicit arrays are never rewritten, and omitted arrays keep Octane's normal inference contract.

Naming diagnostics and hook-slot assignment are separate analyses. Native hook-slot recognition follows direct named imports, including import aliases ending in `$`, and non-computed namespace calls. Further local aliases introduced by `const` assignments or namespace destructuring are not canonicalized as native hook sites in this prototype.

`useSignal$` is available from `octane/signals/client`; server compilation selects `octane/signals/server`. It uses the existing compiler-assigned hook slot and the real component scope's cleanup:

```tsrx
import { useSignal$ } from 'octane/signals/client';

export function Counter() @{
	const count$ = useSignal$(0);
	const label = String(count$.get());
	<button onClick={() => count$.set((value) => value + 1)}>{label as string}</button>
}
```

The handle remains stable for that hook lifetime. Letting it escape does not transfer ownership; it is unusable after its component scope is retired. Conditional hooks follow Octane's existing call-site slot rules; plain JavaScript loop hooks remain invalid. Server-local signals end with their render pass and do not enter shared-state seeds.

Local `useDerived$` and local async hooks are deferred. A local derived facade alone cannot keep captured props isolated through speculative renders, transitive graph caches, and memoized children. Mutating the committed computation early would expose speculative state. Use `scope.derived$` for explicitly owned computations; this experiment does not pretend that it solves local closure staging.

## Server rendering and historical adoption

Use request-local data scopes on the server. Native completed reads produce a versioned, tagged seed manifest, including the exact read channel: strict value, retained `latest`, or ready snapshot. Equal textual scope keys in one presented graph must identify the same owner. A retained result keeps the query identity that produced it, not the current pending selection's arguments.

Client adoption reads immutable historical frames while live state continues independently. It never rewinds a live writable value or populates a live derived cache with an older result. Root, delayed-island, and streamed-segment adoption own separate leases, released after accepted layout work. A matching completed resource seed avoids a duplicate client load; an incomplete ready seed starts a new quiet client attempt rather than transferring the server's producer.

The engine also exposes `scope.serialize()` and `scope.beginAdoption(seed)` for explicit embedding. A frame's synchronous `run(read)` installs that owner's historical view, `retain()` acquires another independent lease, and `release()` ends one lease. Nested reads of other shared owners require their frames too. Releasing a frame affects presentation validity, not live data.

Pending producers and error objects are not transported. Native pending/catch arms that cannot be seeded are marked for fresh rendering within their owned hydration range. An unexpected missing native channel triggers hydration recovery rather than becoming an application error or silently combining historical and live reads. Completed output that directly samples a pending/error snapshot, or converts pending demand into an `isPending` result, is unsupported by the v0 ready-state transport and receives a diagnostic. Use a pending boundary or a serializable `latest` projection instead.

## Inspection and current limits

`scope.inspect()` returns metadata about nodes, dependencies, subscriptions, request activity, adoption leases, and retirement. It does not evaluate dormant computations or include values and callbacks. Tracing is off by default; `createScope({ scopeKey, debug: { traceLimit: 256 } })` enables a bounded metadata-only trace.

The experimental DevTools integration, compiler/browser test results, and package verification status are tracked in the [evidence report](experimental-scoped-signals-evidence.md). Engine measurements alone do not establish native UI speed or memory safety. The current synchronous engine is measurably heavier than raw Alien Signals, especially in construction and ownership teardown.

Other exclusions remain: deep stores, async derived callbacks, mutation journals, remote-write reconciliation, cross-root atomic reveal, cross-realm handoff, and non-DOM hosts. The full repository/compiler validation requires the locked `@tsrx` toolchain; isolated engine and direct runtime checks are recorded separately and are not represented as a full green CI run.
