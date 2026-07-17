# React-hosted Octane compatibility plan

Status: **Phases 0–4 landed (client + SSR/hydration)** (2026-07-17). Phase 0's committed evidence lives
in `packages/octane/tests/react-hosted/`, `packages/octane/typetests/`
(react-hosted-jsx.test-d.tsx), and `benchmarks/react-hosted-islands/`; measured
findings are folded into §3, §5, §6.2, §8, §9 and §15 below and summarized
under §14 Phase 0. Phase 1 ships the experimental `octane/react` client shell
(`OctaneCompat`, including the client half of the Phase 3 escape protocol) with
zero core-runtime changes; Phase 2 adds transparent React context (foreign
`use()`/`useContext()` resolution, the production Fiber adapter, and the §6.3
handshake) behind a cold-path-only core seam — see §14. Phase 3 closed its
remaining failure-matrix breadth, and Phase 4 ships `octane/react/server` +
island hydration (jsdom-provable scope; browser E2E precedes public release).
Selective events (Phase 5) and finalization (Phase 6) remain open.

> Goal: allow a compiled Octane tree to live inside an existing React 19 tree
> through one compatibility component, while preserving React context, native
> event propagation, React-owned Suspense/error handling, and SSR/hydration.
>
> ```tsx
> <OctaneCompat>
> 	<OctaneComponentTree />
> </OctaneCompat>
> ```
>
> This is the inverse of [react-library-compat-plan.md](./react-library-compat-plan.md),
> which ports React library bindings so they run on Octane. It is also narrower
> than the runtime substitution explored in
> [octanejs/octane#23](https://github.com/octanejs/octane/pull/23): the host remains
> real React, and only the subtree below `OctaneCompat` is rendered by Octane.

Line references in this document are intentionally avoided where possible; use
the named runtime/compiler functions as stable anchors because this plan is
expected to outlive several core-runtime revisions.

## 1. Executive decision

Implement `OctaneCompat` as one React-owned DOM host plus one private **hosted
Octane root** per island.

The hosted root is not a third renderer and not a React facade. It is the normal
compiled Octane DOM runtime with four narrowly-scoped host capabilities:

1. Read an actual React context without a manually declared bridge.
2. Report an otherwise-unhandled suspension or error to React.
3. Use selective native event delegation at the island host.
4. Render/hydrate through client and server entry points without giving React
   ownership of Octane's descendant DOM.

Current `main` already contains most of the client ownership seam:
`RendererRegionOwnerBridge`, `bindRendererRegionOwner()`, root-keyed owner/binding
WeakMaps, local-boundary-first error/Suspense routing, external context fallback,
and exact-once child-root disposal. Those were added for reverse universal-renderer
regions and are covered by `universal-renderer-boundaries.test.ts`. React hosting
should implement and minimally extend that protocol rather than introduce a second
hosted-boundary system.

The public contract has no context list, provider adapter, component registration,
or boundary-specific props. Existing React providers, Suspense boundaries, error
boundaries, and ancestor event handlers remain the integration surface.

The corresponding Octane code should be ordinary:

```ts
import { use } from 'octane';
import { ThemeContext } from './react-context.js';

export function OctaneComponentTree() @{
	const theme = use(ThemeContext);
	<main class={theme.mode}>{'Octane content'}</main>
}
```

Fiber inspection is permitted only as a client bootstrap optimization. A real
`React.use(context)` call in the wrapper is the subscription mechanism and the
correctness foundation.

The genuinely new client pieces are foreign React-context discovery/subscription,
a successful-commit acknowledgement for Suspense relays, React host lifecycle,
and selective per-island events. The server runtime has no corresponding owner
bridge yet and needs one.

## 2. Goals and non-goals

### Goals

- Preserve the exact one-component authoring shape shown above.
- Let Octane `use()` and `useContext()` accept a real React 19 context object.
- Resolve the nearest provider, including nested providers and explicit
  `undefined` values.
- Subscribe through React so provider-only updates schedule the correct islands.
- Let native capture and bubble cross the renderer boundary with normal DOM
  `stopPropagation()` and `preventDefault()` behavior.
- Let local Octane Suspense/error boundaries win, then surface only an unhandled
  suspension/error to the nearest React boundary.
- Support React server rendering, React streaming around the island, and Octane
  hydration of the island's server DOM.
- Keep native Octane roots and components free from compatibility fields,
  allocations, and per-render compatibility checks.
- Make an idle compat island cheap enough that hundreds or thousands can coexist.
- Fail explicitly when a requested interop contract cannot be made correct.
- Reuse and generalize the existing renderer-region owner protocol instead of
  duplicating its context/error/Suspense/teardown machinery.

### Non-goals for the first implementation

- Running unmodified precompiled React packages on Octane. PR #23 explored that
  separate problem by aliasing `react`, `react/jsx-runtime`, and `react-dom`.
- Reimplementing React SyntheticEvent, synthetic `onChange`, class components,
  legacy roots, StrictMode double-invocation inside Octane, or React private APIs
  beyond the isolated context-bootstrap adapter.
- Making React reconcile any DOM node created by Octane.
- React Server Components/Flight integration.
- Exact cross-renderer transition entanglement in the first milestone.
- Progressive Octane-owned stream segments inside a React Fizz stream in the
  first milestone. React owns outer streaming; the limitation is detailed below.
- Logical React event bubbling from an Octane portal placed outside the React root
  without a lazily-created React portal bridge.
- Eliminating the single DOM ownership host. A range-only host can be reconsidered
  only after React exposes a stable ownership/ref primitive that is safe here.

Related current contracts are documented in [ssr.md](./ssr.md),
[differences-from-react.md](./differences-from-react.md), and
[suspense-parallel-use-plan.md](./suspense-parallel-use-plan.md). The separate-root
decision follows the same isolation principle used by mixed renderer boundaries in
[universal-renderer-architecture.md](./universal-renderer-architecture.md).

## 3. Public contract

The provisional package surface should be a React-specific subpath, not part of
the default Octane runtime graph:

```tsx
import { OctaneCompat } from 'octane/react';

function ReactScreen() {
	return (
		<ThemeContext value={theme}>
			<React.Suspense fallback={<Spinner />}>
				<AppErrorBoundary>
					<section onClick={recordSectionClick}>
						<OctaneCompat>
							<OctaneComponentTree account={account} />
						</OctaneCompat>
					</section>
				</AppErrorBoundary>
			</React.Suspense>
		</ThemeContext>
	);
}
```

V1 should require exactly one Octane component element. That keeps root identity
and props updates unambiguous. The wrapper consumes the React element as a
`{ type, props, key }` transport; it never returns that child to React for
reconciliation.

The compiler/type surface must make a compiled Octane component valid at this JSX
site without `defineOctaneCompatComponent()`, `asReactComponent()`, or a user cast.
The current `ComponentBody` call signature returns `void`, which React's JSX types
do not accept as a component return. The compat declaration package may supply a
branded JSX-facing view and augment the Octane `use()`/`useContext()` overloads
with `React.Context<T>` while keeping React types out of the core package.
The Phase 0 typing spike (`packages/octane/typetests/react-hosted-jsx.test-d.tsx`,
gated by `pnpm typecheck`) proved the shape: raw `ComponentBody` is rejected by
React 19 JSX (arity + void return); a branded facade
`(props: P) => OctaneRenderedNode` is accepted zero-cast with exact prop checking
and intersects cleanly with `ComponentBody` so one declaration serves both hosts;
and the `children` prop CANNOT statically reject an ordinary React component
(every JSX expression types as `ReactElement<any, any>`), so that rejection is
necessarily the runtime development validation below.

React 19 places `ref` in element props, but React never invokes the child element.
V1 must decide and test whether that ref is deliberately passed through as an
ordinary Octane ref prop or rejected with a diagnostic; it must not be silently
claimed by React. Likewise, React-authored component children are not compiled
Octane children blocks. V1 should reject an ordinary React component nested inside
the transported root element unless a separate reverse-renderer boundary is used.
Primitive/serializable props remain ordinary root props.

No public API should be added for:

- `contexts={[...]}`;
- context-name/value maps;
- an application-level bridge provider;
- `onSuspend`/`onError` forwarding;
- a required local Suspense or error-boundary prop;
- per-library or per-component build configuration.

Development validation should reject a host-element child, Fragment, multiple
children, or an unbranded ordinary React component before Octane attempts to invoke
it.

The host element is a real ownership boundary. The prototype may use a
`<div data-octane-compat>`; its final tag and layout behavior remain an explicit
decision because a `div`, custom element, and `display: contents` each have layout
or accessibility tradeoffs. This decision must not change the component call site.

## 4. Architecture and invariants

```text
React providers / Suspense / error boundary / event ancestors
                             │
                 React <OctaneCompat> Fiber
                 controller + React.use(ctx)
                             │
                  React-owned host element
                  ────────────────────────
                  Octane-owned descendants
                             │
                   private hosted Octane root
             RendererRegionOwnerBridge implementation
```

Ownership is strict:

- React owns the compat component Fiber, the host element, and everything above
  it.
- Octane owns every child node inside the host.
- React always renders the host as opaque and never diffs its descendants.
- Octane never removes, replaces, or writes React-owned ancestors or the host
  element itself.
- One island's context, failure, hydration, and lifecycle state cannot affect
  another island.
- Read-only bridge ownership stays active through Octane teardown and is disposed
  exactly once, matching the existing renderer-region protocol.

Use one root per island. A shared live root would need to model every island as a
portal, yet each physical target would still need event listeners. It would also
couple provider position, failure state, `useId` cursors, scheduling, and teardown.
Share immutable constants, adapter code, Fiber-key caches, and dispatcher
functions—not live ownership.

## 5. Hosted root and controller

Start from the existing `RendererRegionOwnerBridge`:

```ts
interface RendererRegionOwnerBridge {
	readonly active: boolean;
	readContext<T>(context: Context<T>): T;
	routeError(error: unknown): boolean;
	routeSuspense(thenable: PromiseLike<unknown>): boolean;
	registerDispose(dispose: () => void): () => void;
}
```

`bindRendererRegionOwner()` already binds that owner only to the root Block,
clears context caches when ownership changes, registers exact-once root disposal,
and keeps normal Blocks free of owner fields through root-keyed WeakMaps.
`readContextFrom()` checks local Octane providers before consulting the owner, and
`handleRenderError()`/`findTryHandler()` check local Octane boundaries first.
Existing tests cover initial render faults, scheduled suspension, layout/ref/cleanup
faults, live context, topology replacement, and teardown.

`octane/react` should supply a React implementation of this bridge through one
private root envelope whose first operation is `bindRendererRegionOwner(props)`.
Only small protocol extensions should be considered:

- resolve a foreign React context to a root-local Octane mirror;
- acknowledge a successful hosted commit/post-flush so a React Suspense relay can
  resolve;
- expose visibility disconnect/reconnect if React Offscreen semantics require it;
- add a server counterpart, which does not exist today.

A private API such as `createHostedRoot(container, owner, options)` is still useful
for selecting zero-listener event registration before the root envelope renders.
It must delegate ownership/error/context mechanics to the existing bridge rather
than create a parallel boundary. The host owner is supplied by `octane/react`; the
Octane core must not import React.

The controller needs only stable, scalar ready-path state:

```ts
interface HostedController {
	node: Element | null;
	root: HostedRoot | null;
	body: ComponentBody | null;
	props: unknown;
	key: unknown;
	status: 0 | 1 | 2; // ready, pending, error
	payload: unknown; // null, relay wakeable, or original error
	contexts: HostedContextEntry[] | null;
	notify(): void;
}
```

The concrete representation should prefer a flat array for the usually tiny
context set. Promote to an indexed map only if measurements demonstrate a
meaningful high-context workload. Shared frozen empty arrays and opaque-HTML
objects avoid per-island empty-container allocation.

Treat each published registry shape as immutable. Discoveries build/replace a
versioned flat array rather than mutating the array a concurrent React render may
already be iterating. Value snapshots are likewise render-local and become visible
to Octane only in commit.

Lifecycle rules:

1. Construct the controller once with a lazy React state initializer.
2. Derive an SSR-stable Octane identifier prefix from React `useId()`.
3. Attach/create or hydrate the hosted root after the React host commits.
4. Pass props and committed context snapshots to Octane in the compat component's
   layout phase and synchronously finish the hosted Octane DOM commit before that
   layout callback returns. React layout setup is child-before-ancestor, so an
   outer React layout effect must observe current Octane DOM rather than a queued
   microtask update.
5. Keep live snapshots render-local until commit; an aborted concurrent React
   render must not mutate a running Octane tree.
6. Preserve the Octane root when React temporarily hides a suspended primary tree
   and tears down layout effects.
7. Dispose on a real unmount. React StrictMode's development setup/cleanup probe
   requires idempotent setup and a cancelable deferred final-dispose check rather
   than blindly destroying the root in every layout cleanup. The same deferred
   check is the hide/probe/unmount discriminator: React's deletion removes the
   host from the document within the same commit, while StrictMode probes and
   Suspense hiding leave it connected (hidden content keeps its DOM under
   `display: none`). A post-commit connectivity check on the host — canceled by
   a new attachment generation — separates all three without a private signal.
   **Phase 0 proved this against React 19.2 with one hard constraint on the
   check's TRIGGER**: hiding Suspense content destroys layout effects AND
   detaches refs, but leaves PASSIVE effects connected; deleting an
   already-hidden tree then fires only the passive cleanup. The check must
   therefore be scheduled from BOTH the host ref detach (prompt visible
   deletion + hide detection) and the wrapper's passive cleanup
   (deletion-while-hidden) — a layout-cleanup-only or ref-only trigger leaks
   the hosted root when React deletes a hidden island
   (`tests/react-hosted/lifecycle-discriminator.test.ts`). The external
   DOM-removal reconciliation also holds: with the host externally removed,
   React gives no signal, a later commit republishes into the detached host
   without faulting, and Octane's safe-cleanup guarantee covers the eventual
   teardown.
8. Keep the bridge active until Octane teardown finishes. During actual React
   deletion, an Octane cleanup error cannot be surfaced by scheduling state on the
   deleting controller; `routeError()` should decline it so the throw re-enters
   the disposal frame synchronously. **Phase 0 refinement:** because rule 7's
   discriminator defers disposal past React's commit, that frame is a
   post-commit microtask, NOT React's commit-error path — the fault can no
   longer reach React's own error handling. The decline behavior is proven
   (the fault is not swallowed and the dead wrapper is never scheduled), but a
   reporting channel must be chosen before Phase 1; the candidate is
   `reportError`, matching React 19's default `onUncaughtError`.
9. Account for existing initial-root failure behavior: an initial error/suspension
   routed through the owner currently unmounts that failed DOM root. A later React
   retry must safely create/bind a fresh hosted root.

React Suspense hiding is distinct from final unmount. If React's layout-effect
disconnect is the only signal available, the bridge needs a hosted visibility
operation that preserves state/DOM while detaching and later reconnecting the same
Octane layout effects, refs, and event activity. Reusing Octane's existing
Activity/hidden-tree machinery is preferable to inventing another visibility
model.

Do not allocate a `useSyncExternalStore` subscription object per context entry
or per store. One stable React invalidation hook per wrapper — a plain state
bump — is sufficient for context discovery and status changes.

## 6. Transparent React context

### 6.1 Why Fiber alone is insufficient

ReactDOM 19 stamps host nodes with a randomized `__reactFiber$...` property. A
committed provider can be found by resolving the current host Fiber and walking
its `return` chain until a Fiber whose type is the requested React context is
found; its committed value is in `memoizedProps.value`.

There are two correctness traps:

- The Fiber directly stamped on the DOM node can be the stale alternate after an
  update. The adapter must use the HostRoot's current pointer to resolve the
  committed branch, equivalent to React's current-Fiber slow path.
- Reading provider fields does **not** subscribe the wrapper. React records a
  context dependency only when `React.use(context)` runs during React render.

Therefore Fiber is a one-time bootstrap that avoids a blank/retry cycle. It is not
the propagation mechanism.

Never read `context._currentValue` as the primary strategy. It is renderer-global,
private, ambiguous with multiple renderers, and does not identify the nearest
provider or subscribe.

### 6.2 Client discovery and subscription

When Octane receives an Octane context, retain the existing fast path unchanged.
Only the foreign React-context branch performs hosted work:

1. Confirm the current Octane root is a hosted root. Using a React context outside
   one should throw a targeted diagnostic.
2. Ask the active renderer-region owner to resolve the foreign context to this
   island's root-local Octane mirror. Then call the existing Octane context reader;
   its local-provider-first lookup, memo dependency recording, cache invalidation,
   and owner fallback remain authoritative.
3. Check the island's committed context entries. If subscribed, the bridge's
   `readContext(mirror)` returns the committed React snapshot.
4. For a new React context, locate and resolve the host's current Fiber once for
   the current discovery epoch.
5. Walk upward for that context's nearest provider and use the committed provider
   value as the bootstrap. If none exists, use `HostContextRequest` unless the
   versioned Fiber adapter has explicitly proven a renderer-correct default source.
   React exposes no public default-value accessor; do not infer the default from
   `_currentValue`/`_currentValue2` as a general fallback.
6. Create a root-local Octane mirror context and record the dependency in the flat
   registry. Root-local mirrors prevent a provider change in one island from
   advancing memo-invalidation versions in unrelated islands.
7. Continue the Octane attempt. Several new contexts may be discovered; coalesce
   them into the next React notification. If the attempt later suspends/errors,
   publish the registry together with that status notification so the wrapper calls
   `React.use(context)` before throwing the relay/error. Do not require a successful
   Octane commit merely to install the React dependency.
8. On the next wrapper render, iterate the registry and call `React.use(context)`
   for each entry. React 19 permits `use()` in loops and conditions.
9. Store those values in a render-local parallel array. In the layout commit,
   publish the array to the hosted root. For every `Object.is`-different committed
   value, advance that root-local mirror context's Octane `$$version`, then
   synchronously flush Octane. Without the version bump, existing memo/context
   dependency checks could bail out on stale UI.

After step 9, React context propagation schedules the island normally. No later
provider update may perform a Fiber walk for that entry.

Each island that reads a provider is intentionally one real React consumer. That
cost is inherent to preserving nearest-provider semantics; a global collector
cannot deduplicate it correctly across nested provider positions.

**Phase 0 answer (React 19.2.7): the dependency IS retained.** A
`React.use(context)` dependency recorded in an immediately-suspended attempt
stays live in both shapes that matter — an initial mount attempt, and an update
attempt on a committed wrapper whose FIRST read of the context happens in the
suspending attempt. Provider-only updates issued while the attempt stays
suspended re-render it with the fresh value each time, and the dependency
remains live after recovery. The rare two-commit handshake (first commit the
subscription without throwing status, then trigger the relay/error render from
that commit's layout phase) is therefore NOT required on React 19.2.x.
`tests/react-hosted/use-context-retention.test.ts` pins the retention behavior
directly against React — if a future minor drops it, those tests fail and the
handshake becomes mandatory.

The first implementation may let the existing owner fallback return the mirror's
live snapshot. If repeated reads show meaningful ancestry/owner lookup cost, stamp
the mirror value on the hosted root scope after first resolution so Octane's
existing consumer→provider cache makes later reads O(1). This optimization remains
hosted-only and must preserve local-provider-first behavior.

Start with a targeted provider walk per newly requested context while sharing the
resolved current host Fiber for that discovery epoch. Most islands consume zero or
one host context. If benchmarks show a meaningful `contexts × Fiber depth` cost,
add a thresholded one-pass nearest-provider cache later rather than paying for a
provider map on every context-using island.

The first implementation may keep the registry monotonic until the child component
identity/key changes. That is simple and avoids rediscovery; the tradeoff is a stale
subscription if a conditional context read disappears. If real workloads show
conditional-context churn, record a generation per successful Octane render and
have the next React render omit inactive entries.

### 6.3 Correctness fallback

Fiber fields are private and must be isolated in one small, version-tested adapter.
If the Fiber property, current-tree algorithm, or provider shape is unavailable:

1. Throw a private `HostContextRequest(context)` from the hosted context reader.
2. The hosted root recognizes this internal control signal separately from
   Suspense and errors.
3. Register the context and trigger the wrapper.
4. The wrapper calls `React.use(context)` and commits the authoritative value.
5. Retry the Octane render.

This fallback can require one retry per newly encountered context, but it keeps
private internals out of the correctness contract. During hydration, the attempt
must be rollback-safe; if adoption has partially progressed and cannot be retried
atomically, abandon adoption and client-remount only that island with a development
diagnostic.

### 6.4 Server context

Server rendering is simpler. The Octane server attempt runs synchronously while
the `OctaneCompat` React component is rendering, so its hosted context reader can
call `React.use(context)` directly. No Fiber, discovery registry, or subscription
relay is needed on the server.

## 7. Suspense and error escape protocol

The compat point is semantically an Octane Suspense/error boundary, but it should
not be implemented as two rendered boundary components or an eagerly allocated
normal `TrySlot`.

A normal `tryBlock` owns markers, an arm Block/Scope, saved DOM, transition state,
pending state, error state, refs, and effect bookkeeping. Multiplying that ready
path by hundreds of islands would defeat the purpose of a thin boundary.

Instead, reuse the existing renderer-region last-resort routing:

- Existing local Octane `@try`, Suspense, and ErrorBoundary instances always get
  first chance.
- Only a throw that reaches the hosted root reaches
  `RendererRegionOwnerBridge.routeError()`/`routeSuspense()`.
- Native Octane roots retain their current path. Hosted-root lookup can occur only
  on the exceptional path, so normal rendering pays nothing.
- Use existing transactional rollback/detach/ref/effect helpers so an abandoned
  attempt cannot leak partial DOM or commit effects.

The current protocol already routes initial/scheduled render faults and
effect/ref/cleanup faults. The required addition is a successful-commit/post-flush
acknowledgement and React-specific episode state, not another boundary search.

### Suspension

Normalize both Octane's internal suspension form and a directly thrown thenable to
the underlying wakeable. For each pending episode:

1. Lazily create one relay wakeable and store it as the controller payload.
2. Trigger one React invalidation.
3. During React render, `OctaneCompat` first performs every registered
   `React.use(context)` read, then throws/uses the stable relay, allowing the nearest
   React Suspense boundary to handle it. (Phase 0 measured that an immediately
   suspended dependency IS retained on React 19.2 — see §6.2 — so no
   subscription handshake precedes this throw.)
4. When the underlying data settles, retry Octane first.
5. Resolve the relay only after the Octane retry has successfully committed and
   all relevant post-flush work has completed.
6. If replay suspends again, keep the same episode pending or replace it according
   to a precisely tested supersession rule; never retry-spin on an already fulfilled
   relay.

Context changes during a pending episode need their own supersession rule,
because the normal publish channel is closed: a wrapper re-render that reads
changed `React.use(context)` values still throws the relay, so it never reaches
the layout commit that would publish the new snapshot to Octane. The new value
may be exactly what stops the suspension. Phase 0/3 must choose how a
changed-snapshot re-render supersedes the episode — complete the wrapper without
throwing so the snapshot commits (transition-like reveal of the prior Octane
DOM, with a fresh episode if the retry re-suspends), or an out-of-band
generation-guarded publish that keeps the fallback up while Octane retries. The
wrapper must never throw a stale relay while holding a newer snapshot without
one of these paths recorded. Phase 0 evidence: dependency retention (§6.2)
means the suspended wrapper does re-render with the fresh snapshot on every
provider change, and the reveal-time layout publish supersedes the
episode-start snapshot before paint — the island reveals with the LATEST
provider value even when the change landed mid-episode
(`tests/react-hosted/use-context-retention.test.ts`). Whether a mid-episode
publish is also needed (so a new value can stop the suspension itself) remains
open question 16.

Every relay/retry callback carries the controller generation and pending-episode
token. A settlement from a superseded attempt or unmounted island must become a
no-op. If the current root was disposed after an initial routed suspension, retry
creates and rebinds a fresh hosted root before acknowledging readiness.

The post-commit resolution rule comes from Ripple's former compat implementation:
it resolved React's wakeable in a post-block-flush callback, after Ripple had
replayed and scheduled the boundary tree. Resolving merely when the data promise
settles can make React reveal an island whose Octane tree is not ready.

### Errors

Store the original error reference, invalidate the wrapper once, and throw that
error during React render. The nearest React error boundary then observes the
normal React contract; with no error boundary, the error reaches the React root.

The escape path must include Octane render, layout-effect, passive-effect, ref, and
commit failures wherever local Octane error owners already participate. Direct
exceptions thrown by a native event callback remain native event exceptions—React
error boundaries do not catch React event-handler exceptions either. If the event
schedules an Octane render that fails, that render failure does use the root escape
path.

During final React deletion, `routeError()` cannot rely on invalidating a component
that is being removed. The React bridge should return `false` while disposing so
the cleanup error rethrows synchronously from the React effect cleanup and follows
React's commit error handling.

Reset behavior should follow React ownership: resetting/remounting the React error
boundary remounts or retries the compat island. Do not add a second public reset
API.

## 8. Native event propagation and scaling

No React event adapter is required for ordinary content under the compat host.
ReactDOM finds the closest managed Fiber by walking from the unmanaged Octane DOM
target to the React-owned host. With the Octane listener physically attached to
that host, the native order is:

```text
React-root capture
→ Octane-host capture
→ target
→ Octane-host bubble
→ React-root bubble
```

This preserves the DOM ordering expected from nested trees. A native Octane
`stopPropagation()` prevents the later React bubble listener, and React observes
the real target/default-prevented state. Re-dispatching through a React prop or
synthetic event would require manually mirroring propagation, default state,
focus/enter behavior, custom events, and discrete flushing.

### 8.1 Current root cost that must change

The current `_delegated`/`_delegatedCapture` sets are module-global unions.
`registerDelegationTarget()` attaches every known event type when `createRoot()`
runs, and a later `delegateEvents()` registration back-attaches that type to every
active root/portal target. Consequently, `N` compat islands currently cost
`O(N × all loaded Octane event types)`, even if most islands have no handlers.
Controlled inputs can globally activate `input`, `change`, and `click` as well.

### 8.2 Selective hosted delegation

Keep the ordinary `_delegationTargets` map and normal roots conceptually unchanged.
Add a separate selective hosted-target path:

- A no-event island is absent from event target maps and installs no Octane native
  listeners.
- The normative trigger is the first committed event binding in that hosted root,
  so conditionally absent handlers do not install listeners merely because their
  module was imported. Note the current runtime activates at binding time during
  render (`delegateEvents` is called from the binding path), not at commit;
  hosted activation must either defer to commit or be idempotent and
  rollback-tolerant so an abandoned suspended attempt does not leave listeners
  that the structural counts forbid.
- A compiler-generated per-body event manifest may optimize the static path if it
  wins measurements, but it must activate only when that body actually mounts and
  cannot replace binding-time handling for dynamic cases.
- Hosted-only activation climbs to the root once and installs only the missing
  type/phase.
- Dynamic spreads/de-opt descriptors, controlled-form arming, and form actions
  call the same current-host activation path.
- The controller allocates bubble/capture sets only when the first relevant event
  appears. Keep them monotonic until island teardown; their upper bound is the
  number of distinct event types ever used by that island.
- Delay the iOS Safari `onclick = noop` compatibility stamp until `click` is
  activated.
- Unmount removes exactly the listeners installed for that hosted target.

Do not share these listeners at the React root or document. React registered its
bubble listener at the root first, so a later Octane listener there would run after
React bubble handlers and reverse logical order. A common-parent hub is unstable
and changes native `stopPropagation()` ordering.

### 8.3 Portals

Octane's `$$portalParent` repairs Octane's logical event walk, but a portal target
outside the React root has no native path through the React wrapper. If cross-root
portal events must bubble through React, create a React portal-owned subhost lazily
for that portal target and render Octane inside it. Keep this portal-only machinery
out of ordinary islands. V1 should document rather than reject external targets:
Octane's own semantics remain fully correct (`$$portalParent` plus portal
delegation targets keep Octane handlers, propagation, and context intact), and
body-target portals are pervasive in the existing bindings (radix, floating-ui,
sonner), so a hard rejection would make most real component libraries unusable
inside islands. The only loss is React-ancestor visibility of those events —
identical to any non-React DOM on the page — and the React portal-owned subhost
remains the future fix where that visibility is required.

## 9. SSR, React streaming, and hydration

Package separate client and server implementations behind conditional exports,
following the useful packaging pattern from PR #23 without aliasing React.

### 9.1 Server render

The server `OctaneCompat` implementation should:

1. Use React `useId()` to derive an island-stable Octane `identifierPrefix`.
2. Execute a specialized synchronous hosted Octane SSR attempt inside the React
   component render.
3. Route React-context reads directly to `React.use(context)`.
4. Preserve Octane's hydratable markers and suspense seeds.
5. Return one React host element whose inner HTML is the Octane result.
6. Throw an unhandled Octane thenable/error out of the React component rather than
   swallowing it or returning partial root output. React Fizz then owns the nearest
   outer Suspense/error behavior and streaming retry.

Do not call public Octane `renderToString()` unchanged: its bare-root suspension
contract returns partial output, while hosted SSR must preserve the underlying
thenable and escape it to Fizz.

Fizz retry state is a Phase 0 design gate. A fresh public Octane server pass creates
a fresh resolved/memo map; blindly starting another fresh pass after Fizz retries
can rediscover the same settled or freshly-created thenable forever. Prototype and
choose one request-safe mechanism:

- a hosted server session whose Octane resolved/parallel-use state survives this
  island's Fizz retries;
- delegation of the root thenable to `React.use(thenable)` while the React server
  dispatcher is active, combined with persistent Octane call-site memo state; or
- an equivalent request-local replay record.

The `React.use(thenable)` delegation is the chosen candidate, with two hard
qualifications Phase 0 measured against real Fizz
(`tests/react-hosted/fizz-retry.test.ts`):

- Fizz replay state is positional (the nth `use()` call in a retried task is
  served from the nth TRACKED thenable's settled result regardless of the new
  thenable's identity), so a fresh Octane pass per replay cannot loop a
  position a prior attempt already reached — sequential chains complete in one
  replay per stratum even when every replay creates fresh, never-settling
  thenables. The positional match also makes deterministic unwrap order a hard
  correctness requirement: a replay that unwraps in a different order is
  silently served MISALIGNED values (demonstrated, no error anywhere). Octane's
  strata design already guarantees the order.
- **Tracking covers only positions actually REACHED.** A parallel stratum
  creates K thenables and throws on the first pending unwrap, so positions
  1..K-1 are never tracked; each replay's fresh pass then re-tracks its own
  fresh replacements — the original in-flight results are discarded, fetch
  starts multiply, and every stratum member costs an extra replay. Persistent
  per-island memo state is therefore MANDATORY for the parallel-`use()`
  contract, not an optimization. Measured mechanism: Fizz replays a task with
  the IDENTICAL props object, so a `WeakMap` keyed on the island's transported
  props is request-local, replay-persistent storage — no module-global request
  state and no `AsyncLocalStorage`, which also answers the edge-runtime
  concern. The memoized thenables must carry Octane's in-place
  `status`/`value` stamps (they already do) so an already-settled dependency
  unwraps synchronously on replay instead of costing another round.

Rejections route through the tracked state to the Fizz boundary error path
exactly once, and overlapping requests with interleaved settlements never
observe each other's state. A Fizz-provided request cache is not an option: in
React 19.2.7, `React.cache` outside Flight is a non-memoizing passthrough and
Fizz's async dispatcher `getCacheForType` throws (see the internals inventory
in §17).

Module-global mutable request state is forbidden. The chosen mechanism must retain
Octane's parallel-`use()` strata, stable call-site identity, rejection routing, and
abort/CSP handling.

Local Octane boundaries retain their existing single-pass server semantics. There
is no supported channel for an independently-running Octane stream to inject later
segments into a React Fizz stream. V1 should render a local Octane pending arm in
the shell and let hydration/client retry complete it, or explicitly choose an
awaited hosted-server mode. Progressive inner Octane waves require a future stream
multiplexer and are not implied by basic SSR/hydration support.

Unhandled server errors escape to Fizz/root server error handling and callbacks.
Do not describe them as being caught by a React client error boundary—React error
boundaries do not catch server-render errors.

### 9.2 CSS and head resources

`renderToString()` returns `{ html, css }`. Emitting the same CSS string inside
every island would duplicate bytes across many islands. The hosted server path
should expose styles as hash-keyed records and return React `<style>` resources
with stable `href`/precedence metadata and `data-octane` hashes. React Fizz can then
hoist/deduplicate them while Octane hydration's existing hash detection still sees
the style. Allocate this path only when an island actually produced scoped CSS.

If React resource semantics cannot preserve the required tags in a supported host,
the correctness fallback is colocated CSS per island; request-global mutable
deduplication is not acceptable across concurrent requests.

Current Octane SSR folds hoisted `<title>`, `<meta>`, and `<link>` output into
`RenderResult.html`. That result cannot be inserted wholesale inside the compat
host: head resources would land under a body `div`. The hosted server renderer must
return structured body/head/style channels, translate supported head entries into
React 19 resources, or reject hoisted-head output in V1 with a targeted diagnostic.
Parsing a completed HTML string is a fallback, not the target ABI. Thread the React
render nonce into inline Octane seeds/styles/scripts and include CSP coverage.

### 9.3 Client hydration

React must hydrate the host without adopting or traversing the Octane descendants
as React children. The candidate contract is:

- The server writes the real Octane HTML with `dangerouslySetInnerHTML`.
- The client always supplies one shared frozen opaque `dangerouslySetInnerHTML`
  sentinel and `suppressHydrationWarning` so React leaves the existing descendants
  untouched.
- The prop remains stable forever, preventing later React renders from clearing
  the host.
- In the layout commit, Octane calls its hosted `hydrateRoot()` with the same body,
  props, context snapshot, and `identifierPrefix`.

**Phase 0 proved this contract against React 19.2.7 development AND production
hydration** (`tests/react-hosted/opaque-hydration.test.ts`): with the frozen
sentinel plus `suppressHydrationWarning`, React hydrates a page with several
sibling islands with zero descendant inserts/removes/text writes (mutation
observers on each host record nothing), no recoverable error, and no console
diagnostics; Octane's `hydrateRoot()` then adopts the exact server node
identities with live events and state; and a later React re-render with the
stable sentinel leaves the hosts untouched. If the opaque sentinel stops being
robust on a future React minor, serialize enough island metadata for the client
to present exact HTML or use another React-supported opaque ownership
primitive.

## 10. Lifecycle, concurrency, and ownership edge cases

- **React concurrent rendering:** wrapper render builds a pending context-value
  array; only a committed layout effect publishes it to Octane.
- **React StrictMode development probes:** setup is idempotent. A simulated cleanup
  must not permanently dispose or clear server DOM before the immediate second
  setup. Final disposal can be deferred/canceled by a new attachment generation.
- **React Suspense hiding:** React may clean up layout effects when hiding already
  visible primary content. Preserve the hosted Octane root and its state while the
  DOM is hidden, but do not assume "remain mounted" is sufficient: Octane layout
  effects, refs, measurements, and event activity may need an explicit
  disconnect/reconnect operation matching React Offscreen. Reuse Activity's
  visibility machinery where its semantics match, then run setup again on reveal.
- **Component identity/key change:** replace the hosted root body according to
  Octane root identity semantics and reset context discovery associated only with
  the former tree.
- **Props updates:** React commits first, then the hosted root receives the new
  props. Coalesce props and context changes into one Octane update. Pin an
  explicit republish policy for parent rerenders that change nothing: React
  semantics say a parent rerender re-renders children, but at hundreds of
  islands one top-level React state change would otherwise trigger that many
  synchronous pre-paint Octane flushes. `React.memo` around the wrapper cannot
  mitigate this — the transported child element is recreated every parent
  render — so the controller should shallow-compare the transported
  `{ type, props, key }` and skip the Octane update when nothing changed. This
  bail must be scale-tested (many islands under one rerendering parent) and its
  divergence from strict rerender-cascade semantics documented.
- **Unmount while pending:** invalidate the episode, detach listeners, cancel retry
  callbacks, and ensure a late wakeable cannot recreate the root or notify React.
- **External DOM removal:** retain Octane's safe cleanup guarantee.
- **Nested compat islands:** a React island cannot occur as a React-managed
  descendant inside Octane-owned DOM without an explicit reverse portal boundary.
  Ordinary React nesting around several sibling islands is supported.
- **Multiple ReactDOM copies/renderers:** cache Fiber property keys per discovered
  renderer/suffix rather than assuming one module-global key. Unsupported renderer
  shapes fall back to `HostContextRequest`. The DevTools hook
  (`__REACT_DEVTOOLS_GLOBAL_HOOK__.renderers`) is a read-only renderer census —
  runtime version pinning plus a fail-fast diagnostic when the renderer that owns
  the host is not the React copy `octane/react` imported (`currentDispatcherRef`
  identity).

## 11. Zero-cost and allocation budget

The ready path is a structural contract, not merely a benchmark aspiration.

| Island behavior | Allowed incremental work |
| --- | --- |
| No context, no events, ready | Host element, controller/invalidation state, `useId`, lifecycle hooks, hosted Octane root/tree |
| First React context | Lazy registry entry + root-local mirror, targeted Fiber provider walk, one coalesced React notification |
| Subscribed context update | One `React.use` read per registered context during wrapper render, one committed snapshot comparison; no Fiber walk |
| First event type/phase | One hosted event-set allocation if needed and one native listener for that host/type/phase |
| Suspension episode | One stable relay wakeable and status payload, released after settle/commit |
| Error | Original error reference as payload until React handles/remounts |

Explicitly forbidden ready-path costs:

- a context `Map`/`Set` for every island;
- an eager Fiber ancestry scan;
- rendered Octane boundary components, fallback DOM, or `TrySlot` markers;
- all-globally-known event listeners on every host;
- SyntheticEvent wrappers;
- a global live island registry or shared keyed Octane portal tree;
- one external-store subscription object per island;
- compat fields on every normal Octane Block or Scope;
- React-specific branches on every normal Octane component render.

The implementation should use hosted-only WeakMaps or root-owner tables for
foreign context reads and exceptional escape routing. Native Octane hot paths must
remain byte/behavior equivalent unless a separately justified optimization changes
them.

## 12. Packaging and build integration

Recommended package shape:

- `octane/react` (or a final dedicated package name) exports `OctaneCompat` and
  React-aware types.
- React and ReactDOM 19 are peer dependencies and are never bundled or aliased.
- Client/server conditional exports select the DOM controller or hosted SSR
  implementation. A tiny framework adapter may be needed where a bundler does not
  expose reliable SSR conditions, but it is one-time project setup.
- The client entry carries a `'use client'` directive so `OctaneCompat` is a
  valid client boundary in RSC-based hosts (Next-like toolchains) even though
  Flight integration is a non-goal; the `react-server` condition must resolve to
  the client-boundary stub rather than the hosted SSR implementation, which is
  Fizz-only.
- The existing Octane compiler continues compiling `.tsrx`; hosted event
  activation requires no per-component option. Static metadata is optional if the
  implementation spike proves it is the cheapest committed-binding fast path.
- Resolver deduplication ensures one React, ReactDOM, Octane client runtime, and
  Octane server runtime per environment.
- Core Octane receives only generic hosted-root capabilities and never imports
  React or React types.
- Client ownership is an implementation of the existing
  `RendererRegionOwnerBridge`; changes to that interface remain renderer-neutral
  and keep its universal-renderer users working.
- Private React internals — the Fiber property scrape, `ReactSharedInternals.T`,
  `ReactDOMSharedInternals.p`, and the DevTools renderer census — live in the
  React package behind one adapter module and a React-minor compatibility
  matrix. Every internal must sit behind feature detection and degrade to
  reduced fidelity, never incorrectness: transition/priority entanglement may
  downgrade to default priority; only the Fiber bootstrap has a
  correctness-adjacent role, and it already carries the public
  `HostContextRequest` fallback.

Do not reuse PR #23's `react()` Vite alias plugin in a React host application. It
would replace the actual React renderer whose context dependencies, boundaries,
and root event system this design needs.

## 13. Test and benchmark plan

All behavioral tests must use actual React 19 plus actual compiled Octane output.
Mocking the bridge protocol alone is insufficient.

### Client mount/update/lifecycle

- Mount, prop update, key/type replacement, unmount, remount, and external DOM
  removal.
- JSX typing and development diagnostics for one Octane child versus host elements,
  Fragments, multiple children, ordinary React components, nested React children,
  and child refs.
- React StrictMode development probe and production behavior.
- React parent rerender that changes neither props nor contexts.
- Unmount during a pending episode and late settle/rejection.
- React Suspense hide/reveal preserves Octane state, refs, and effect semantics.
- Existing `universal-renderer-boundaries.test.ts` remains green and is expanded
  only where a renderer-neutral bridge behavior changes.
- A parent React layout effect observes the fully committed Octane DOM/context
  update, pinning child/parent commit ordering.
- An Octane layout effect that calls a React state setter during the island's
  synchronous flush inside React's commit phase (re-entrancy is legal for React
  layout effects; prove the hosted flush inherits that contract).

### Context

- Default value, nearest nested provider, explicit `undefined`, and provider value
  identity changes.
- Providerless reads use the public subscription handshake when the Fiber adapter
  cannot prove the default; no `_currentValue` dependency is assumed.
- Several distinct contexts discovered in one Octane render produce one React
  notification.
- Multiple Octane reads of the same React context deduplicate to one subscription.
- Provider-only updates pass through React memoized parents and update the island.
- Conditional first read after mount, conditional disappearance, and component/key
  replacement.
- Provider insertion/removal/replacement around a retained island.
- Context discovery in an Octane attempt that later suspends or errors still
  installs the React dependency before the wrapper throws status.
- Provider updates while that first-discovery attempt is suspended remain live,
  covering the one- versus two-commit subscription decision.
- Multiple islands under the same provider, different nested providers, and
  separate React roots.
- Fiber alternate flips across repeated provider updates.
- Fiber adapter deliberately disabled/corrupted exercises `HostContextRequest`.
- Concurrent React render abort proves uncommitted values never reach Octane.
- React context used outside a hosted root produces a targeted error.

### Suspense and errors

- Local Octane boundary handles the throw without notifying React.
- With no local boundary, the nearest React Suspense/error boundary handles it.
- With no React boundary, React root behavior is observed.
- Initial suspension, update suspension with prior content, repeated/new thenables,
  rejection, supersession, transition-originated updates, and retry after commit.
- Relay resolves only after successful Octane commit/post-flush.
- Render, layout-effect, passive-effect, ref, and commit errors route correctly.
- Cleanup error during final React deletion rethrows through React commit handling
  rather than scheduling the deleting controller.
- A React error-boundary reset/remount releases the former hosted root.

### Events

- Exact order: React capture → Octane capture → target/Octane bubble → React bubble.
- `stopPropagation()`/`stopImmediatePropagation()` from React capture and from
  Octane target/bubble listeners.
- `preventDefault`, real `event.target`, correct `currentTarget`, and no duplicate
  dispatch during hydration.
- Discrete update flush ordering before the outer React bubble handler observes DOM.
- An Octane handler that calls a React state setter during the same native event.
- Dynamic spread events, capture variants, controlled inputs, form actions, custom
  events, focus/blur, enter/leave, scroll, and non-bubbling delegated families.
- Lazy-loaded event-bearing component activates only its island.
- Portal behavior inside the host and the explicit external-portal contract.

### SSR/hydration

- React `renderToString` and streaming Fizz around an island.
- Server React context values, nested providers, unhandled suspension/error, and
  local Octane pending/catch arms.
- Fizz retries reuse a request-local hosted server session (or the selected
  equivalent) and do not recreate/rediscover an uncached thenable indefinitely.
- Parallel `use()` and rejection routing remain correct through Fizz retries.
- Stable `useId`, Octane identifiers, suspense seeds, markers, and scoped CSS.
- Structured title/meta/link/style resources, duplicate hashes, and CSP nonce.
- Hydration performs no React descendant mutations and Octane adopts existing node
  identity.
- Development/production hydration, several sibling islands, provider updates
  immediately after hydration, and Fiber-fallback/remount behavior.
- An island inside a late-revealed streamed Suspense boundary: Fizz's
  `completeBoundary` relocates segment DOM into place — Octane hydration must
  adopt the relocated nodes' identity after the reveal.
- Hydration mismatch diagnostics remain attributable and do not corrupt sibling
  React DOM.

### Scale and structural budgets

Add deterministic 1/100/1,000-island cases for:

- empty/no-context/no-event mount, update, and unmount;
- one context per island and several contexts in one island;
- one click island among many empty islands and click handlers in every island;
- one controlled-input island among empty islands;
- one pending episode per island and repeated episodes;
- retained heap/controller/root/listener cleanup.

Instrument these structural counts in the deterministic benchmark/ratio harness,
not ordinary correctness tests:

- zero Octane `addEventListener` calls for empty islands;
- exactly one listener per used host/type/phase;
- zero context allocations for no-context islands;
- zero Fiber walks after a context entry is subscribed;
- one React notification for a batch of first discoveries;
- one relay allocation per pending episode;
- balanced listener/root/controller teardown.

Use browser E2E coverage for hydration, native ordering, focus, and propagation
semantics that jsdom cannot prove. Correctness tests assert public output, DOM
identity, context values, effects/refs, propagation, errors, and diagnostics—not
private WeakMaps, Fiber keys, helper calls, or allocation counts. Keep exact counts,
bundle size, retained heap, and timing thresholds in benchmarks with semantic
controls, following `.agents/memories/testing.md`.

## 14. Implementation phases

### Phase 0 — executable spike and measurement

- Build an internal-only React 19 fixture whose owner implements the existing
  `RendererRegionOwnerBridge` around an unmodified Octane root.
- Prove the React-JSX component typing/branding and child/ref validation contract.
- Prove unmanaged descendant event propagation and Fiber provider discovery.
- Prove whether a newly discovered `React.use(context)` dependency survives an
  immediately suspended wrapper attempt; implement/pin the two-commit subscription
  handshake if it does not.
- Pin baseline root/listener/allocation counts for 1/100/1,000 islands.
- Prove the chosen opaque-host hydration technique before committing to the public
  API.
- Prove request-local Fizz retry state for unhandled Octane suspension, including
  parallel `use()`, and decide the structured CSS/head/CSP channel.
- Prove StrictMode cleanup versus real unmount and React Suspense/Offscreen
  disconnect/reconnect semantics.

Exit gate: context bootstrap + real React subscription, event order, and hydration
DOM ownership are demonstrated with executable tests; Fizz retry cannot loop on a
fresh Octane server pass.

**Executed 2026-07-17 — exit gate met.** Artifacts:

- `packages/octane/tests/react-hosted/` — the internal React 19 fixture
  (`_react-host.ts`: an `IslandController` implementing the existing
  `RendererRegionOwnerBridge` around an unmodified compiled Octane root, with
  a spike `OctaneCompatSpike` wrapper) plus the isolated Fiber adapter
  (`_fiber-adapter.ts`, the only Fiber-touching module) and suites for
  host/bridge lifecycle, §3 child/ref validation, §8 event propagation, §6.1
  Fiber bootstrap, OQ15 retention, §5 rule 7 discrimination, §9.3 opaque
  hydration (dev + prod React), and §9.1 Fizz retry. All suites run under both
  the dev and prod Octane compile projects;
  `universal-renderer-boundaries.test.ts` stays green and no Octane hot path
  changed.
- `packages/octane/typetests/react-hosted-jsx.test-d.tsx` — the §3 typing
  spike (checked by `pnpm typecheck`): raw `ComponentBody` is rejected by
  React JSX; a branded facade type is accepted zero-cast with exact prop
  checking and stays valid as an Octane body; children typing cannot
  statically discriminate octane vs React elements (JSX.Element erasure), so
  rejection is the runtime dev validation; child `ref` types as an ordinary
  prop.
- `benchmarks/react-hosted-islands/` — the 1/100/1000-island structural
  baseline (recorded in `benchmarks/baselines/local/react-hosted-islands.json`,
  linearity guarded in `baselines/ratios.json`): 5 delegated listeners per
  island regardless of whether ANY island binds events (the §8.1
  O(islands × loaded types) baseline Phase 5 must beat), 138 React
  root-container listeners per React root, 1 hosted root + 1 bridge binding
  per island, O(islands) late `delegateEvents` back-attach, zero listener
  leaks after teardown.

Findings that refined the plan: the rule 7 discriminator's trigger matrix and
rule 8's deferred-disposal error channel (§5), OQ15 answered as "retained"
(§6.2), reached-positions-only Fizz tracking making persistent memo mandatory
with props-identity WeakMap storage (§9.1), and the React-state round-trip
batching contract for events (§8: an island handler's React setState is
batched exactly like a nested React tree — React's own bubble listener for the
same event sees pre-update DOM — while Octane-local discrete updates commit
before the React bubble handler runs).

Deferred to browser E2E (jsdom cannot prove them; Phase 4/5 scope): paint-level
hide/reveal behavior, focus/enter-leave/scroll event families and real user
activation, streamed-Fizz `completeBoundary` segment relocation before Octane
adoption, CSS/head resource hoisting (§9.2 — untouched by Phase 0 along with
the structured head channel decision), and retained-heap measurements.

### Phase 1 — existing owner bridge and public client shell

- Reuse `bindRendererRegionOwner()` through a private compiled root envelope and
  generalize only renderer-neutral protocol names/capabilities that the spike
  proves necessary.
- Add `octane/react` client controller and exact child-element consumption.
- Implement mount/update/unmount, `useId` prefixing, concurrent-safe prop commits,
  visibility disconnect/reconnect, and StrictMode-safe disposal.
- Initially use existing event delegation for correctness, with benchmarks making
  its cost visible.

Exit gate: ready client islands work with no context/suspension requirements and
normal Octane roots show no behavior/performance regression.

**Executed 2026-07-17 — exit gate met, with zero core-runtime changes** (the
spike proved no renderer-neutral protocol generalization was necessary; normal
Octane roots are untouched by construction). Shipped as
`packages/octane/src/react/index.ts` behind the `octane/react` export
(`'use client'`, react/react-dom as optional peers, dist entry verified by the
publish build), exercised consumer-shaped by
`tests/react-hosted/octane-compat-public.test.ts` and type-pinned by
`typetests/react-hosted-jsx.test-d.tsx` against the exported
`OctaneReactComponent`/`OctaneRenderedNode` facade types. Notes:

- The private root envelope is a PLAIN function body (bind the owner, return a
  value-position element for the transported child) — no compiled `.tsrx`
  ships in the package.
- The §10 unchanged-parent-rerender bail (shallow `{ type, props, key }`
  compare) is implemented and tested — a key-only change replaces the island
  with fresh state through octane's keyed identity semantics; scale-testing
  the bail under hundreds of islands remains Phase 5 work.
- The client half of Phase 3 (lazy relay episodes, post-Octane-commit
  resolution, rejection routing, supersession/no-op guards, local-boundary
  priority) was pulled forward — the Phase 0 spike had already validated it.
  Phase 3 retains the failure-matrix breadth (§13) and transition-originated
  episodes.
- Deferred-disposal cleanup faults route through `reportError` (falling back
  to `console.error`), resolving the reporting-channel decision from §5
  rule 8.
- Strict rejection of an UNBRANDED plain-function React component is not
  implementable yet: `__oct_loc` is dev-only and plain-`.ts` Octane components
  carry no marker, so validation rejects host elements, Fragments, exotic
  element types (memo/forwardRef/lazy), plain renderables, multiple children,
  and class components — a compiler-emitted component brand (measured against
  codegen-size) remains future work tied to the declaration tooling.
- Under React SSR the client shell renders an empty host and mounts on the
  client; Phase 4 replaces this with the hosted server renderer via
  conditional exports.
- The `react-hosted-islands` benchmark keeps its inline owner so bridge-binding
  counts stay observable; `OctaneCompat` adds no listeners beyond the
  `createRoot` delegation cost the baseline already pins.

### Phase 2 — transparent context

- Add foreign-context overloads/detection and root-local mirrors.
- Implement the isolated current-Fiber/provider adapter.
- Add the React `use(context)` registry/snapshot commit loop.
- Add `HostContextRequest` fallback and hydration rollback/remount handling.

Exit gate: the full context matrix passes and provider updates perform no
post-subscription Fiber walks.

**Executed 2026-07-17 — exit gate met.** The client context matrix passes
through the public surface (`tests/react-hosted/octane-compat-context.test.ts`:
nearest nested providers, explicit `undefined`, provider-only updates across
memoized parents and repeated alternate flips, island-internal `memo()`
invalidation via mirror version bumps, several/duplicate/conditional reads,
provider insertion/removal around a retained island, cross-island isolation
through root-local mirrors, discovery-in-a-suspending-attempt, child-identity
registry reset, and the out-of-hosted-root diagnostic), and the
`react-hosted-islands` harness gates the walk criterion structurally: exactly
one Fiber walk per island at discovery and ZERO per provider update at
1/100/1000 islands, failing the run otherwise. Implementation notes:

- Core gained only the cold-path seam: `use()`/`useContext()` route an unknown
  usable through the optional owner capability `resolveForeignContext` (normal
  roots and hot paths untouched), a structural `ForeignHostContext<T>` overload
  keeps React types out of core while `use(React.Context<T>)` infers `T`
  (pinned in typetests), and `handleRenderError` recognizes the §6.3
  `createHostContextRequest` control signal BEFORE local boundary routing so
  island `@catch`/`@pending` arms never observe it — the owner receives the
  carried thenable via `routeSuspense`.
- The §6.3 handshake is one wrapper pass, not a two-boundary protocol: the
  discovery notification re-renders the wrapper, whose layout commit publishes
  the authoritative `React.use` snapshot, settles the request thenables, and
  retries the root — before paint, including the providerless-default case
  (never `_currentValue`) and with the Fiber adapter hard-disabled.
- The production adapter (`src/react/fiber-adapter.ts`) is feature-detected
  and fail-soft: every internal failure degrades to the handshake. Its walk
  counter (`__hostContextFiberWalks`) is the bench instrumentation.
- Hydration rollback/remount handling moves to Phase 4 with the rest of the
  island hydration path — there is nothing to hydrate until the hosted server
  renderer exists.

### Phase 3 — root suspension/error escape

- Reuse existing renderer-region last-resort routing across render/commit/effect
  paths and add a successful-commit/post-flush acknowledgement.
- Implement lazy relay episodes, post-Octane-commit resolution, rejection, and
  supersession/generation guards.
- Prove local Octane boundaries win and React boundaries receive only escapes.

Exit gate: no eager normal `TrySlot`/marker allocation and all failure tests pass.

**Executed 2026-07-17 — exit gate met.** The client escape protocol shipped
with Phase 1 (lazy relay episodes, post-commit resolution, rejection routing,
supersession/no-op guards, local-boundary priority — no eager `TrySlot`);
Phase 3 closes the remaining §13 breadth through the public surface
(`tests/react-hosted/octane-compat-failure-matrix.test.ts`): layout-setup,
passive-setup, and ref-attachment faults route to the nearest React error
boundary; a sync update suspension over committed content refallbacks while
preserving hidden island DOM and state. Two decisions pinned:

- Open question 16 (mid-episode snapshot supersession): v1 uses REVEAL-TIME
  supersession — the suspended wrapper re-renders with fresh snapshots but
  keeps throwing the same relay; the reveal's layout publish supersedes the
  episode-start snapshot before paint (end-to-end tested with contexts and
  props). The pathological case — an island whose pending fetch can only
  settle with the NEW value — would need the out-of-band publish; deferred
  until a real workload needs it.
- Open question 9 (transition entanglement): a transition-committed prop
  change whose island suspension escapes refallbacks in v1 — the suspension
  surfaces from the layout-phase hosted flush as a new sync update, unlike a
  pure React tree where the transition render itself suspends and holds old
  content. Pinned as an `// OCTANE DIVERGENCE` test (no tearing: prior
  DOM/state preserved); the `ReactSharedInternals.T` lever remains the
  candidate if entanglement is later wanted.

### Phase 4 — server and hydration

- Add server conditional export and synchronous hosted SSR attempt.
- Read React context directly during server render and throw root escapes to Fizz.
- Implement request-local retry state, opaque host HTML, structured head/style
  resources/fallback, CSP nonce handling, Octane hydration, and identifier/seed
  parity.
- Add production-mode and browser E2E coverage.

Exit gate: multiple streamed React pages hydrate several islands without mismatch,
React descendant mutation, lost context, or double events.

**Executed 2026-07-17 — jsdom-provable scope met**
(`tests/react-hosted/octane-compat-ssr.test.ts`; real-browser E2E for paint,
focus, and streamed `completeBoundary` segment relocation remains before the
public release, §13). What shipped:

- `octane/react/server` (explicit subpath; the conditional-exports matrix
  stays with the OQ1 packaging finalization): one SYNCHRONOUS hosted attempt
  per Fizz task execution via the new server-runtime seam
  (`renderHostedAttempt` + `createHostedServerSession` in runtime.server.ts).
  A pass reuses the session's resolved/parallel-use maps, so puMemo thenables
  keep identity across replays; only a BARE root suspension (`rootSuspended`)
  delegates — a locally-owned suspension ships its @pending arm (§9.1 v1).
- Fizz retry state: strata aggregates are identity-stable, status-stamped,
  recorded into the session, and replayed IN ORDER via `React.use` — tested:
  one replay per sequential stratum, parallel creations started once with
  ZERO re-fetch across replays, rejection routed to Fizz exactly once, and
  overlapping streams fully isolated (the session key is the Fizz-stable
  transported props identity — answering open question 11 with no
  AsyncLocalStorage).
- Server context (§6.4): a hosted pass installs a foreign-context read hook;
  island `use(ReactContext)` calls `React.use` directly — nearest provider and
  Fizz semantics for free — and the hydrated island holds a live client
  subscription afterwards.
- Hydration (§9.3): the client host always carries the frozen opaque sentinel;
  a host containing server markup hydrates through `hydrateOctaneRoot` with
  the VERBATIM `useId`-derived prefix — Octane ids hydrate byte-identically
  (tested), node identity/state/events adopt, and a §6.3 request during
  adoption abandons it for a client remount with a dev diagnostic. Core
  gained a lazy root-disposer lookup so `bindRendererRegionOwner` works from
  a hydration pass.
- CSS/head (§9.2): island CSS emits as React 19 style resources (stable
  per-hash `href`, `precedence="octane"`) — Fizz hoists and dedupes across
  islands, and `injectStyle`'s detection now also recognizes React's
  `data-href="octane-<hash>"` serialization (React drops other attributes
  from hoisted resources) so hydration never re-injects. Hoisted island
  <title>/<meta>/<link> is rejected by the server COMPILER already
  (pinned); the hosted renderer keeps a defensive runtime guard (open
  question 14: v1 = reject). CSP nonce is threaded through the hosted seam
  (`HostedAttemptOptions.nonce`) but not yet exposed on the public component.

### Phase 5 — selective events and scale hardening

- Add separate lazy hosted target state and committed binding/dynamic/form
  activation.
- Add compiler event manifests only if the Phase 0/5 measurements show they improve
  the static path without over-registering conditional handlers.
- Remove eager listener/iOS-click work from event-free hosted roots.
- Add structural scale guards and retained-memory checks.

Exit gate: listener count is `O(sum of event types actually used by each island))`,
not `O(islands × global event types)`.

### Phase 6 — portals and advanced integration

- Decide/release the external-portal React subhost or document/reject it.
- Evaluate active-context unsubscription, transition-priority propagation, and
  progressive inner Octane streaming using measurements and real applications.
- Finalize package naming, host tag/layout behavior, supported React minors, docs,
  examples, and diagnostics.

## 15. Decisions and open questions

### Resolved by this plan

- Real React remains installed and owns the outer root.
- There is one hosted Octane root/controller per compat island.
- No manual context registration is part of the public API.
- Fiber is bootstrap-only; `React.use(context)` provides subscription.
- Context snapshots publish only after React commit.
- Root suspension/error uses a private escape handler, not eager public boundary
  components.
- The client escape/context/teardown foundation is the existing
  `RendererRegionOwnerBridge`, not a parallel protocol.
- A relay resolves after Octane retry/commit, not merely underlying-data settle.
- Events remain native and listeners live at the physical island host.
- Event-free hosted roots must use selective zero-listener delegation.
- Server context reads call React directly; client and server implementations are
  separate.
- No shared live root/global provider/store is required.

### Open before public release

1. Final package/subpath name and conditional-export matrix across Vite, Next-like
   hosts, and other React SSR toolchains.
2. Host tag and layout/accessibility behavior.
3. Exact supported React 19 minor range and response to an unknown Fiber shape.
4. Monotonic versus active context registries after workload measurement.
5. Hydration fallback when a `HostContextRequest` occurs during partial adoption.
6. React style-resource support versus colocated CSS fallback.
7. External Octane portal behavior.
8. Whether a future stream multiplexer can support progressive Octane boundary
   waves inside Fizz.
9. Whether React transition priority can/should cross updates originating in the
   Octane scheduler. The candidate mechanism is pinned (§17 internals
   inventory): `ReactSharedInternals.T` marks transition scopes in both
   directions and `ReactDOMSharedInternals.p` preserves discrete priority
   across deferred Octane flushes. Open is whether the semantics are wanted,
   not how.
10. Whether a future React Fragment-ref/range API can remove the host element
    without compromising ownership and events.
11. Durable server-session/replay storage across Fizz retries. *Phase 0 pinned
    the mechanism candidate:* Fizz replays a task with the identical props
    object, so a `WeakMap` keyed on the island's transported props is
    request-local, replay-persistent storage with no `AsyncLocalStorage`
    dependency (§9.1). Open is only the final shape of the stored session.
12. Child `ref` behavior and whether any React-authored nested children are
    accepted. *Phase 0 decision, tested:* the child `ref` passes through as an
    ordinary Octane ref prop and attaches to the Octane-owned element — never
    claimed by React (`tests/react-hosted/child-validation.test.ts`); nested
    React-authored children remain rejected.
13. Exact Offscreen hide/reveal behavior for Octane effects, refs, events, and
    measurements. *Phase 0 evidence:* the hosted root, DOM, state, and events
    survive hide/reveal untouched, but Octane's own effects/refs are NOT
    disconnected while hidden — whether an explicit disconnect/reconnect
    (Activity reuse) is required is still open.
14. Translation or rejection policy for Octane head resources in hosted SSR,
    including CSP.
15. ~~Whether React retains a newly discovered context dependency in an
    immediately suspended wrapper render or the rare two-commit handshake is
    mandatory.~~ **Answered by Phase 0 (React 19.2.7): retained, in both
    initial-mount and update-attempt suspension; the handshake is not needed.
    `tests/react-hosted/use-context-retention.test.ts` guards the behavior
    against future React minors (§6.2).**
16. The supersession path for context snapshots that change during a pending
    episode: complete the wrapper without throwing so the snapshot commits, or
    an out-of-band generation-guarded publish (§7). Phase 0 pinned that the
    reveal-time publish already closes the stale-snapshot window before paint;
    open is whether a mid-episode publish is needed so a new value can stop
    the suspension itself.

## 16. Rejected alternatives

- **Manual `contexts` prop/provider bridge:** explicit ceremony, duplicates provider
  topology, and scales poorly across many islands.
- **Fiber-only context reads:** obtains a value but never creates a React context
  dependency, so provider updates strand the island.
- **`context._currentValue`:** wrong abstraction for nearest-provider and
  multi-renderer correctness; also no subscription.
- **One retry per context as the only path:** correct as a fallback but causes
  avoidable first-mount/hydration replay chains. Fiber bootstrap batches the common
  path.
- **Global live compat provider/manager:** nested provider values differ by island;
  shared ownership couples failure, hydration, and teardown.
- **One shared Octane root with portals:** still needs physical event targets and
  adds keyed registry updates/portal markers.
- **Full Octane `tryBlock` at every compat point:** eagerly allocates boundary state,
  markers, and arm Blocks even when nothing fails.
- **Listeners at the React root/document:** incorrect bubble ordering and
  propagation behavior.
- **React SyntheticEvent adapter:** more plumbing and observably different native
  propagation/default behavior.
- **PR #23's React aliases:** replaces the real host renderer required by this
  design.
- **Rendering Octane DOM without a React-owned host:** leaves React with no stable
  Fiber/DOM ownership boundary for context lookup, hydration, events, and cleanup.

## 17. Prior art and evidence

### Current renderer-region owner bridge

The closest live implementation is already in `packages/octane/src/runtime.ts`:

- `RendererRegionOwnerBridge` defines active ownership, external context, error,
  Suspense, and disposal capabilities.
- `bindRendererRegionOwner()` binds the bridge only to an owning DOM root through
  WeakMaps and clears cached external context when ownership changes.
- `readContextFrom()` searches local Octane providers before the external owner.
- `findTryHandler()` and `handleRenderError()` search local Octane boundaries before
  routing an unhandled error/thenable to the external owner.
- `universal-renderer-boundaries.test.ts` covers live context, topology replacement,
  initial error, suspension, effect/ref/cleanup faults, and exact-once teardown.

That code materially reduces this plan's runtime scope. The client work should add
React foreign-context resolution, commit readiness, React lifecycle, and selective
events around it. The server runtime still needs an equivalent owner/session seam.

### Ripple's deleted `compat-react`

Ripple previously mounted a Ripple block beneath a React component and relayed
initial suspension through React `use(promise)`. Its strongest lesson is the relay
lifecycle: resolve React only from a post-Ripple-flush callback after the Ripple
boundary has replayed. See
[Improve how Ripple compat works](https://github.com/Ripple-TS/ripple/commit/13323ddd)
and the later [compat removal](https://github.com/Ripple-TS/ripple/commit/1de66b8f).

It does not provide the complete design here: it did not compose SSR/hydration and
did not transparently subscribe to arbitrary real React contexts inside Ripple.
Its removal also eliminated substantial source/compiler/plugin machinery, which is
another reason to keep this host protocol narrow.

### Octane PR #23

[PR #23](https://github.com/octanejs/octane/pull/23) explored a runtime facade for
unmodified React packages running **on Octane**. Reusable principles:

- opt-in runtime isolation;
- lazily allocated `WeakMap` state for compatibility scopes;
- symbol-gated compatibility-only DOM behavior;
- identity caches for adapters;
- client/server package separation;
- exact resolver aliases/deduplication as one-time setup;
- normalization of directly thrown thenables.

Non-reusable implementation surface:

- replacing `react`/`react-dom` removes the real React host;
- call-order hook slots, JSX/class/SyntheticEvent/form facades solve the inverse
  problem;
- its `createContext` produces an Octane context rather than consuming a real React
  provider;
- it does not integrate ReactDOM server/Fizz with Octane islands.

The PR's breadth—31 changed files and roughly 2,800 added lines—and review findings
around controlled-host and ref-cleanup edge paths are evidence for a smaller seam,
not a reason to reproduce the facade.

### Local React 19 evidence gathered for this plan

Prototypes against the repository's React/ReactDOM 19 toolchain established:

- the host DOM Fiber property can be discovered and the current provider Fiber
  distinguished from a stale alternate;
- provider-only updates reach a memoized wrapper once it calls
  `React.use(context)`;
- a Fiber-read value without `React.use(context)` does not subscribe;
- unmanaged DOM under a React-owned host participates in outer React capture and
  bubble with the native listener order described above;
- native stop propagation at the Octane host prevents the later React bubble;
- server execution inside a React component can call `React.use(context)` and read
  the nearest provider.

These prototypes are evidence, not the implementation. Phase 0 converted each
one into committed behavioral coverage (`packages/octane/tests/react-hosted/`)
before core changes begin — see §14 Phase 0 for the artifact list and the
findings the conversion surfaced. (The server `React.use(context)` read is the
one item still covered only by the prototype: exercising it end-to-end needs
the Phase 4 hosted server entry.)

### React 19.2.7 internals inventory

A source audit of the installed React/ReactDOM 19.2.7 builds pinned which
internals help and which cannot. Adopted levers (fidelity-only, isolated in the
version-tested adapter per §12):

- `ReactSharedInternals.T`: `startTransition` sets `T = {}` synchronously around
  its scope. Reading `T !== null` when an Octane update is scheduled detects a
  React transition scope; setting `T` around Octane's own `startTransition`
  lets React updates issued inside inherit transition treatment.
- `ReactDOMSharedInternals.p`: `resolveUpdatePriority()` consults `p` before
  falling back to `window.event`. Synchronous Octane handlers already inherit
  discrete priority through `window.event`; a deferred Octane flush that calls a
  React setter loses it. Setting `p` around a discrete-originated flush —
  exactly what `flushSync` does internally — preserves it.
- `__REACT_DEVTOOLS_GLOBAL_HOOK__.renderers`: read-only renderer census for
  runtime version pinning and multi-copy diagnostics (§10).
- `captureOwnerStack()` (public, development builds): React owner stacks on
  island error/hydration diagnostics.

Verified dead ends — do not re-investigate without a React version change:

- **Fizz request-scoped cache:** `React.cache` outside Flight is a non-memoizing
  passthrough and Fizz's `DefaultAsyncDispatcher.getCacheForType` throws
  "Not implemented.", so the durable server-session question (§15) cannot be
  solved with `cache()`.
- **DevTools `findFiberByHostInstance`:** removed from the React 19.2 injection
  payload (absent from development and production builds); the payload is only
  `{bundleType, version, rendererPackageName, currentDispatcherRef,
  reconcilerVersion}`. The `__reactFiber$` property scrape is the only
  host→Fiber channel.
- **Manual `fiber.dependencies` injection:** React resets `dependencies` at
  every render start, so an injected context entry survives only until the
  wrapper's next render; all it would elide is the coalesced first-discovery
  notification.
- **Running the hosted client render inside React's render phase** with the live
  dispatcher: React render attempts are replayable and abortable while Octane
  rendering is DOM-effectful; the §6.2 registry loop is the minimal safe form —
  replay the context reads in React render, never the render itself.
- **`unstable_createEventHandle`** (React-ancestor visibility for external
  portals): experimental-channel only; not compiled into stable 19.2.
- **`hook.onCommitFiberRoot` batching of island publishes:** violates lifecycle
  rule 4 (§5) — outer React layout effects must synchronously observe committed
  Octane DOM.

## 18. Definition of done

The feature is ready to document publicly only when:

- the exact zero-registration API works in client, server, and hydration builds;
- real React context values and updates are correct without manual plumbing;
- local Octane and outer React failure ownership is deterministic;
- React observes native events in the correct order with correct propagation;
- empty islands pay no context, Fiber, boundary, or event-listener allocation;
- normal Octane roots incur no hosted compatibility work;
- existing universal renderer-region boundary behavior remains green and the React
  owner reuses that protocol;
- 1/100/1,000-island structural guards pass;
- development and production browser hydration produce no mismatch or descendant
  ownership violations;
- supported React minor versions are pinned in CI, with the Fiber-independent
  fallback covered;
- Fizz retries use request-local state and cannot loop on fresh Octane thenables;
- CSS/head/CSP resources have a structured, concurrent-request-safe contract;
- limitations for portals, nested streaming, transitions, and host layout are
  resolved or explicitly documented;
- a user-facing changeset, API documentation, and at least one React-host example
  land with the implementation.
