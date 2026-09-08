# Pinned React DOM commit-admission experiment

This is an isolated Phase 0 candidate, not ReactCompat, a supported React API,
or a complete transaction implementation. It answers one question: can a small,
explicit source patch withhold a completed real React DOM root commit, let the
host accept or abandon that candidate, and invalidate it when React schedules
newer internal work?

No installed package or production Octane source is changed. The materializer
copies only the pinned npm client artifacts to an ignored output directory and
inserts the reviewed fragment at exact, hash-verified sites. It does not patch a
running renderer, global React dispatchers, DevTools, DOM methods, or setters.
This generated-artifact approach is only for the experiment; it is not a
proposal to publish compiled React code as an authored Octane package.

## Reproduce

From the worktree root, pass the **same React DOM installation used by the
fixture**, not an equivalent installation from another checkout:

```sh
node experiments/react-compat/patch/materialize.mjs /absolute/path/to/react-dom
node node_modules/vitest/vitest.mjs run experiments/react-compat/patch/materialize.test.ts \
	--config experiments/react-compat/vitest.config.js
```

Resolve `react-dom/package.json` from `packages/octane/package.json`; pass its
containing directory. A normal workspace install exposes it through
`packages/octane/node_modules/react-dom`. This worktree currently resolves it to
`node_modules/.pnpm/react-dom@19.2.7_react@19.2.7/node_modules/react-dom`.

The default output is `patch/generated/`, which is ignored. It contains both
patched client artifacts, `client.cjs`, the original MIT license, and a manifest
recording input/output hashes. Generated-only dependency symlinks reuse the
input installation's exact `react`, `react-dom`, and `scheduler` instances;
there is no dependency installation. This also makes pnpm's otherwise private
transitive scheduler dependency resolvable.

Alias only the fixture's `react-dom/client` import to `generated/client.cjs`.
The latter selects the development or production artifact by `NODE_ENV`.
Alternatively, bundle the chosen `react-dom-client.*.cjs` directly. Keep ordinary
`react-dom` imports on the same unmodified package, so portals and shared React
DOM state still use the real renderer. A CommonJS-aware bundler is required.
Do not import both patched client artifacts into the same fixture.

Both client input hashes and the package/license hashes were checked
byte-for-byte against the npm tarball on 2026-08-28. Its SHA-512 integrity equals
the repository lockfile; [provenance.json](./provenance.json) records the npm
URL, tarball hash, file hashes, and immutable upstream source commit. Unknown
inputs fail before output is produced. The script refuses to write into the
installed input directory, including through directory aliases, and does not
follow output-file symlinks when replacing generated artifacts.

## External controller API

The patched client adds exactly one experimental export:

```js
import { createRoot, attachCommitGate } from 'react-dom/client';

const root = createRoot(container);
const gate = attachCommitGate(root, {
	onPrepared(token) {
		// Store the token and tell the host that a completed candidate exists.
		// React has not committed this candidate's host mutations or effects.
		pendingToken = token;
	},
	onAborted(token, reason) {
		// Optional observation. Never use this callback to revive the candidate.
	},
});

root.render(reactElement);

// Later, outside React render/commit:
pendingToken.accept(); // true when admitted; false if already invalidated
pendingToken.abort(); // true when the held candidate was abandoned

// Ordinary root.unmount() also works and is never held by the gate.
gate.dispose();
```

Attach before the root's first render. The function rejects a root from another
client instance, an already scheduled/rendered root, a disposed root, a second
gate, or a hydration root. Normal public `root.render`, React hook/class setters,
effects, and event dispatch remain unchanged.

`onPrepared` and `onAborted` run in microtasks, outside the React stack.
`gate.pending` is the currently held token or `null`. A token has an immutable
numeric `id`, a read-only `status` (`held`, `committing`, `committed`, `aborted`,
or `failed`), and `accept`/`abort` methods. Keep method calls on their token.
Acceptance or explicit abortion during React render/commit throws before making
changes. Controller callback exceptions retain normal microtask error reporting;
this prototype does not implement owner error-boundary routing.

Acceptance first flushes older pending React effects **while native cancellation
remains installed**, then checks that the exact candidate and its base current
tree are still valid. An effect or subscription update can invalidate it, causing
`accept()` to return `false`. Recorded external-store consistency checks are
also re-evaluated; a changed recorded store aborts with
`recorded-store-changed`. That result is not an automatic retry instruction; the
external controller must prepare current inputs again when appropriate.

The bypass is consumed by one exact candidate; work scheduled by its commit
effects cannot inherit a general bypass. After a token terminates, its retained
record releases the Fiber candidate, root, argument snapshot, and controller.

**Abort discards a prepared Fiber candidate, not React's queued state updates.**
Later updates or Suspense pings may cause React to rebase those updates into a
new candidate. Erasing arbitrary library state updates or cancelling user-owned
promises would violate React's queue/resource ownership and is not attempted.

## Exact source seams

The upstream source is React
[`6117d7cca4906492c51fe6a03381e35adfd86e7d`](https://github.com/facebook/react/tree/6117d7cca4906492c51fe6a03381e35adfd86e7d).
The corresponding npm development and production artifacts keep the same
names for the necessary work-loop functions. The materializer verifies their
whole-file hashes before locating the following four sites:

1. Insert the helper fragment inside the client renderer's closure immediately
   before `commitRoot`.
2. Add one admission guard at the beginning of `commitRoot`, before it clears
   `cancelPendingCommit`, flushes effects, marks lanes finished, or performs any
   commit phase.
3. Track roots returned by this client's `createRoot` in a private `WeakSet`, so
   the new export cannot silently attach to a different renderer instance.
4. Export `attachCommitGate`; no root option, setter, dispatcher, or Fiber method
   is replaced.

The helper reuses native `cancelPendingCommit`, `prepareFreshStack`,
`markRootSuspended`, and `ensureRootIsScheduled`. React's ordinary
`scheduleUpdateOnFiber` cancels a pending commit before reusing its alternate
Fiber. The guard checks `root.current` and the cancellation callback's identity,
not just an application generation number. An explicit abort also takes
`prepareFreshStack`; clearing a token alone could leave React ready to reuse the
discarded finished tree.

See [commitRoot](https://github.com/facebook/react/blob/6117d7cca4906492c51fe6a03381e35adfd86e7d/packages/react-reconciler/src/ReactFiberWorkLoop.js#L3416),
[update cancellation](https://github.com/facebook/react/blob/6117d7cca4906492c51fe6a03381e35adfd86e7d/packages/react-reconciler/src/ReactFiberWorkLoop.js#L916),
and [fresh-stack cancellation](https://github.com/facebook/react/blob/6117d7cca4906492c51fe6a03381e35adfd86e7d/packages/react-reconciler/src/ReactFiberWorkLoop.js#L2155).
The first nine `commitRoot` arguments have the same meaning in both pinned
artifacts; the development artifact has additional diagnostics arguments. The
helper captures and replays the complete argument list rather than reconstructing
it from mutable work-loop globals.

Putting the guard at `commitRoot`, rather than only `commitRootWhenReady`, also
covers the direct development `act` commit path and completed urgent work.
Resource readiness processing remains React's own; it runs **before** this
admission point. [The act bypass](https://github.com/facebook/react/blob/6117d7cca4906492c51fe6a03381e35adfd86e7d/packages/react-reconciler/src/ReactFiberWorkLoop.js#L1405)
is why both browser modes still need independent evidence.

## What this does not establish

- **No Suspense observer.** A root that is suspended and has no completed
  candidate does not reach `commitRoot`, so no prepared token appears. Exporting
  escaped thenables needs a separate hook at suspension classification and
  root render outcomes. Local Suspense fallback completion is ordinary candidate
  output and must not be mistaken for an escaped suspension.
- **No multiple-root or Octane atomic commit.** Once accepted, a root runs its
  entire native commit. The next React root's mutation has not necessarily run
  when the first root's refs/layout effects execute. React's pending phase state
  is renderer-global and `commitRoot` flushes prior pending phases. A coordinated
  all-mutations-before-any-layout transaction needs a larger per-root commit-frame
  design and Octane participation, not sequential calls to `accept`.
- **No hydration qualification.** The central entry would also see completed
  hydration commits, but attachment after `hydrateRoot` schedules hydration is
  not an acceptable initialization protocol. This API rejects hydration roots.
- **No synchronous first-entry proof.** Prepared notifications are microtasks.
  It does not yet establish ready initial content before Octane's first render
  returns, or React/Octane `flushSync` composition. Calling React `flushSync` can
  render a candidate without making an external controller accept it.
- **No universal store-consistency guarantee.** Native store checks are not
  recorded on every synchronous or hydration render path. A store can change
  while an initial candidate is held before subscriptions connect. Rechecking
  existing flags does not close that gap; future staging needs broader snapshot
  tracking or a narrower admission policy.
- **No arbitrary resource/heap rollback.** Preloads and other React resource
  processing may happen before this seam. Impure component code, resource APIs
  such as executable `preinit`, shared class-instance observations, and native
  browser input changes are not transactionalized by withholding the commit.
- **No full lifetime/visibility/error protocol.** Normal unmount is tested
  separately from reentrant nested-renderer disposal. This patch does not bridge
  Activity, context topology, error boundaries, transitions, SSR, or legacy
  OctaneCompat's coordination contract.

The materializer tests verify hash rejection, source-directory protection,
reproducibility, syntax, and preservation of installed bytes. Behavioral browser
fixtures must independently prove withheld DOM/ref/effect/portal output,
autonomous updates, invalidation, explicit abort, unmount, and unaffected
unregistered roots in development and production. DOM-emulator smoke runs are
useful debugging evidence, not substitutes for those browser tests.
