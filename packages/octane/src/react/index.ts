'use client';

/**
 * `octane/react` — host a compiled Octane subtree inside a real React 19 tree
 * through one compatibility component:
 *
 * ```tsx
 * import { OctaneCompat } from 'octane/react';
 *
 * <OctaneCompat>
 * 	<OctaneComponentTree account={account} />
 * </OctaneCompat>
 * ```
 *
 * Architecture (docs/react-hosted-octane-compat-plan.md): React owns the
 * wrapper Fiber and one host element; a private hosted Octane root owns every
 * descendant. The hosted root binds a React implementation of the existing
 * `RendererRegionOwnerBridge` (`bindRendererRegionOwner`), so local Octane
 * `@try`/Suspense/error boundaries always get first chance and only a throw
 * that reaches the hosted root escapes to the nearest REACT Suspense or error
 * boundary. Events stay native and delegated at the island host — React
 * ancestors observe real capture/bubble order, targets, and
 * `stopPropagation()`/`preventDefault()`.
 *
 * Transparent React context (Phase 2): an island's ordinary `use()`/
 * `useContext()` accepts a REAL React 19 context object. The owner resolves
 * it to a root-local Octane mirror, bootstraps the committed nearest-provider
 * value from the host Fiber ONCE (see ./fiber-adapter.ts — the only
 * Fiber-touching module), and subscribes by replaying `React.use(context)`
 * for every registered entry in the wrapper render; committed snapshots
 * publish in the layout phase with mirror version bumps. When the adapter
 * cannot serve a read (unavailable, unknown Fiber shape, or a providerless
 * read whose default only React may supply), the §6.3 HostContextRequest
 * handshake retries with the authoritative value before paint.
 *
 * Phase status (§14): Phases 1–2 shipped (client shell + escape protocol +
 * transparent context). Not yet implemented:
 * - server rendering/hydration of islands (Phase 4) — under React SSR the
 *   host renders empty and the island mounts on the client;
 * - selective per-island event delegation (Phase 5) — hosted roots currently
 *   pay the normal `createRoot` delegation cost (see
 *   benchmarks/react-hosted-islands).
 */

import * as React from 'react';
import {
	bindRendererRegionOwner,
	createContext as createOctaneContext,
	createElement as createOctaneElement,
	createHostContextRequest,
	createRoot as createOctaneRoot,
	hydrateRoot as hydrateOctaneRoot,
	flushSync as octaneFlushSync,
	type ComponentBody,
	type Context as OctaneContext,
	type Root as OctaneRoot,
} from '../index.js';
import {
	OPAQUE_HOST_SENTINEL,
	OPAQUE_HOST_SENTINEL_COMMENT,
	REACT_CONTEXT_TAG,
	resolveHostedIsland,
	type OctaneCompatComponentProps,
	type OctaneCompatProps,
	type TransportedChild,
} from './shared.js';

export type {
	OctaneCompatComponentProps,
	OctaneCompatProps,
	OctaneHostedComponent,
	OctaneReactComponent,
	OctaneRenderedNode,
} from './shared.js';
import { drainPassiveEffects } from '../runtime.js';
import { readNearestProviderValue } from './fiber-adapter.js';

// Structural bench/test hook (§13): provider walks happen only at discovery.
export { __hostContextFiberWalks } from './fiber-adapter.js';

/** Shared registry key the Octane runtime reads the owner bridge from. */
const RENDERER_REGION_OWNER = Symbol.for('octane.renderer-region.owner');

interface PendingEpisode {
	relay: Promise<void>;
	resolve: () => void;
}

/**
 * One registered foreign context (§6.2): the React context, its root-local
 * Octane mirror (root-local so a provider change in one island never advances
 * memo-invalidation versions in another), and the latest COMMITTED React
 * snapshot the island may observe.
 */
interface HostedContextEntry {
	foreign: object;
	mirror: OctaneContext<unknown>;
	value: unknown;
	hasValue: boolean;
	/** Pending §6.3 request settlers awaiting the first committed snapshot. */
	settle: (() => void)[] | null;
}

/** Render-local pairing of the registry with its `React.use` reads (§5: never
 * mutate an array a concurrent React render may be iterating). */
interface ContextSnapshot {
	entries: HostedContextEntry[];
	values: unknown[];
}

const EMPTY_SNAPSHOT: ContextSnapshot = { entries: [], values: [] };

/**
 * Private hosted-root envelope. A plain function is a valid Octane component
 * body ("a component is any function"): it binds the owner bridge to the root,
 * then renders the transported child as an ordinary value-position component,
 * so the child itself stays an unmodified compiled Octane component.
 */
function hostedRootEnvelope(props: {
	body: ComponentBody;
	bodyProps: unknown;
	bodyKey: string | null;
}): unknown {
	bindRendererRegionOwner(props);
	// The transported key rides the octane element so a key change replaces the
	// island subtree (octane's keyed identity semantics), never updates in place.
	const config =
		props.bodyKey === null
			? props.bodyProps
			: { ...(props.bodyProps as object), key: props.bodyKey };
	return createOctaneElement(props.body, config as never);
}

function reportHostedFault(error: unknown): void {
	// Disposal is deferred past React's commit (see scheduleDisconnectCheck), so
	// a hosted cleanup fault cannot re-throw into React's commit-error path.
	// Match React 19's own uncaught-error default.
	if (typeof reportError === 'function') reportError(error);
	else console.error(error);
}

function shallowEqualProps(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
	if (a === b) return true;
	const aKeys = Object.keys(a);
	const bKeys = Object.keys(b);
	if (aKeys.length !== bKeys.length) return false;
	for (let i = 0; i < aKeys.length; i++) {
		const key = aKeys[i];
		if (!Object.is(a[key], (b as never)[key]) || !Object.prototype.hasOwnProperty.call(b, key)) {
			return false;
		}
	}
	return true;
}

/**
 * One controller per island: the React implementation of Octane's
 * renderer-region owner bridge plus the host lifecycle. Scalar ready-path
 * state only — episodes and error payloads are allocated lazily (§11).
 */
class HostedIslandController {
	// ── RendererRegionOwnerBridge ──────────────────────────────────────────
	active = true;

	// ── controller state ───────────────────────────────────────────────────
	host: HTMLElement | null = null;
	status: 0 | 1 | 2 = 0; // ready, pending, error
	payload: unknown = null; // null, relay promise, or the original error
	notify: () => void = () => {};

	/** Foreign-context registry — immutable snapshots, replaced on discovery (§6.2). */
	entries: HostedContextEntry[] = [];

	private root: OctaneRoot | null = null;
	private rootLive = false;
	private attached = false;
	private disposed = false;
	private identifierPrefix = '';
	private committed: TransportedChild | null = null;
	private episode: PendingEpisode | null = null;
	private disposers = new Set<() => void>();
	/** Bumped by every attachment signal; cancels a pending deferred dispose check. */
	private lifecycleGeneration = 0;
	private attemptSuspended = false;
	private attemptErrored = false;
	/** §6.3 request thenables this controller minted (recognized in routeSuspense). */
	private contextRequests = new WeakSet<PromiseLike<unknown>>();
	/** True while an attach is adopting server DOM (hydration). */
	private hydrating = false;
	/** A §6.3 handshake unwound the last attempt; the next commit retries the root. */
	private pendingContextRetry = false;

	// ── RendererRegionOwnerBridge ──────────────────────────────────────────

	/**
	 * Foreign-context resolution (§6.2 steps 1–7): find or create the
	 * root-local mirror for a real React context read inside the island. First
	 * discovery bootstraps the committed nearest-provider value from the host
	 * Fiber (bootstrap-only — the wrapper's `React.use` replay is the
	 * subscription) and coalesces one React notification.
	 */
	resolveForeignContext(foreign: object): OctaneContext<any> | null {
		if (this.disposed) return null;
		// Only React context objects resolve here; anything else keeps the
		// core diagnostic.
		if ((foreign as { $$typeof?: unknown }).$$typeof !== REACT_CONTEXT_TAG) return null;
		let entry = this.entries.find((candidate) => candidate.foreign === foreign);
		if (entry === undefined) {
			entry = {
				foreign,
				mirror: createOctaneContext<unknown>(undefined),
				value: undefined,
				hasValue: false,
				settle: null,
			};
			if (this.host !== null) {
				const boot = readNearestProviderValue(this.host, foreign);
				if (boot.found) {
					entry.value = boot.value;
					entry.hasValue = true;
				}
				// found:false covers BOTH an unavailable adapter and a providerless
				// read — no `_currentValue` inference; the §6.3 handshake supplies
				// the authoritative value (including the context default).
			}
			this.entries = [...this.entries, entry];
			this.notify();
		}
		return entry.mirror;
	}

	readContext<T>(context: OctaneContext<T>): T {
		const entry = this.entries.find(
			(candidate) => (candidate.mirror as OctaneContext<T>) === context,
		);
		if (entry === undefined) {
			// An ordinary Octane context with no island-local provider — the same
			// value a bare Octane root would produce.
			return context.defaultValue;
		}
		if (entry.hasValue) return entry.value as T;
		// §6.3 HostContextRequest: the value cannot be produced synchronously
		// (adapter unavailable, or a providerless read whose default only
		// `React.use` may supply). Unwind the attempt with the control signal;
		// the wrapper's next commit publishes the authoritative snapshot,
		// settles this request, and retries the root — all before paint.
		let settle!: () => void;
		const request = new Promise<void>((done) => {
			settle = done;
		});
		(entry.settle ??= []).push(settle);
		this.contextRequests.add(request);
		throw createHostContextRequest(request);
	}

	routeError(error: unknown): boolean {
		// While disposing, the wrapper cannot be scheduled: decline so the
		// cleanup fault re-throws synchronously out of the disposal frame.
		if (this.disposed) return false;
		this.attemptErrored = true;
		this.status = 2;
		this.payload = error;
		// An error supersedes any pending episode (§7): invalidate it so a later
		// settlement's retry cannot clobber the staged error with a "ready"
		// status, and resolve the relay so the suspended wrapper wakes and
		// throws into the nearest React error boundary.
		const episode = this.episode;
		this.episode = null;
		this.notify();
		episode?.resolve();
		return true;
	}

	routeSuspense(thenable: PromiseLike<unknown>): boolean {
		if (this.disposed) return false;
		if (this.contextRequests.has(thenable)) {
			// §6.3 handshake: no relay, no episode. The discovery notification is
			// already queued, so the wrapper re-renders, its layout commit
			// publishes the authoritative `React.use` snapshot, settles the
			// request, and retries the root synchronously — all before paint.
			if (this.hydrating && process.env.NODE_ENV !== 'production') {
				// Adoption cannot be retried atomically: the handshake retry
				// client-remounts only this island (§6.3 hydration fallback).
				console.warn(
					'<OctaneCompat> abandoned hydration for an island whose context ' +
						'read needed the request handshake; the island was client-remounted.',
				);
			}
			this.pendingContextRetry = true;
			return true;
		}
		this.attemptSuspended = true;
		let episode = this.episode;
		if (episode === null) {
			// One relay wakeable per pending span; a superseding attempt reuses it
			// so React's fallback stays up until Octane is actually ready (§7).
			let resolve!: () => void;
			const relay = new Promise<void>((done) => {
				resolve = done;
			});
			episode = this.episode = { relay, resolve };
			// A staged error outranks a pending episode — never downgrade it.
			if (this.status !== 2) {
				this.status = 1;
				this.payload = relay;
			}
			this.notify();
		}
		const current = episode;
		thenable.then(
			() => this.retryAfterSettle(current),
			() => this.retryAfterSettle(current),
		);
		return true;
	}

	registerDispose(dispose: () => void): () => void {
		this.disposers.add(dispose);
		this.rootLive = true;
		return () => {
			this.disposers.delete(dispose);
			// A rebind registers the successor BEFORE releasing the predecessor
			// (bindRendererRegionOwner), so the root is only dead when no disposer
			// remains — an unconditional clear would strand a live root.
			this.rootLive = this.disposers.size > 0;
		};
	}

	// ── wrapper integration ────────────────────────────────────────────────

	/**
	 * §6.2 step 8: render-local replay of every registered context read.
	 * Runs during EVERY wrapper render — including one about to throw the
	 * relay/error — so React records the dependencies (§7 step 3; retention
	 * across suspended attempts is pinned by the Phase 0 tests).
	 */
	readReactSnapshots(): ContextSnapshot {
		const entries = this.entries;
		if (entries.length === 0) return EMPTY_SNAPSHOT;
		const values: unknown[] = new Array(entries.length);
		for (let index = 0; index < entries.length; index++) {
			values[index] = React.use(entries[index].foreign as React.Context<unknown>);
		}
		return { entries, values };
	}

	/**
	 * Layout-commit publish of the committed React snapshot (§6.2 step 9):
	 * every `Object.is`-different value advances its root-local mirror's
	 * version — without the bump, memo/context dependency checks would bail
	 * out on the stale mirror value — and settles any §6.3 requests waiting on
	 * a first value. Returns whether the island must re-render.
	 */
	private publishSnapshots(snapshot: ContextSnapshot): boolean {
		let changed = false;
		const live = this.entries;
		const entries = snapshot.entries;
		for (let index = 0; index < entries.length; index++) {
			const entry = entries[index];
			// A child-identity reset may have retired this entry between the
			// wrapper render and this commit — never publish into a former tree.
			if (live !== entries && !live.includes(entry)) continue;
			const next = snapshot.values[index];
			if (!entry.hasValue || !Object.is(entry.value, next)) {
				entry.value = next;
				entry.hasValue = true;
				entry.mirror.$$version++;
				changed = true;
			}
			if (entry.settle !== null) {
				const settlers = entry.settle;
				entry.settle = null;
				for (const settle of settlers) settle();
				changed = true;
			}
		}
		return changed;
	}

	hostAttached(node: HTMLElement): void {
		this.host = node;
		this.lifecycleGeneration++;
	}

	/**
	 * Host-ref detach: schedule the deferred hide/probe/unmount discriminator.
	 * `host` is deliberately kept — a hidden island's ref detaches too, and a
	 * pending-episode retry must still reach the (connected, display:none) host.
	 */
	hostDetached(): void {
		this.scheduleDisconnectCheck();
	}

	passiveAlive(): void {
		this.lifecycleGeneration++;
	}

	/**
	 * Passive-effect cleanup is the deletion signal that still fires for HIDDEN
	 * trees: React 19 hide destroys layout effects and detaches refs but leaves
	 * passive effects connected, so deleting an already-hidden island fires only
	 * this cleanup (Phase 0 signal matrix, §5 rule 7).
	 */
	passiveDetached(): void {
		this.scheduleDisconnectCheck();
	}

	/**
	 * Layout-commit publish (§5 rule 4): synchronously finish the hosted Octane
	 * commit before the wrapper's layout effect returns, so outer React layout
	 * effects observe current island DOM. Bails when the parent re-render
	 * changed nothing (§10 republish policy): the transported child element is
	 * recreated every parent render, so `React.memo` cannot provide this bail.
	 */
	commit(child: TransportedChild, identifierPrefix: string, snapshot: ContextSnapshot): void {
		if (this.disposed) return;
		this.lifecycleGeneration++;
		this.identifierPrefix = identifierPrefix;
		const previous = this.committed;
		// A child identity/key change replaces the island — and resets context
		// discovery associated with the former tree (§10): the registry is
		// monotonic only within one child identity.
		if (previous !== null && (previous.type !== child.type || previous.key !== child.key)) {
			this.entries = [];
		}
		const contextsChanged = this.publishSnapshots(snapshot);
		const needsContextRetry = this.pendingContextRetry;
		this.pendingContextRetry = false;
		if (
			!contextsChanged &&
			!needsContextRetry &&
			this.attached &&
			this.rootLive &&
			this.status === 0 &&
			this.episode === null &&
			previous !== null &&
			previous.type === child.type &&
			previous.key === child.key &&
			shallowEqualProps(previous.props, child.props)
		) {
			return;
		}
		this.committed = child;
		this.attached = true;
		this.attachAndFlush();
	}

	private scheduleDisconnectCheck(): void {
		const generation = ++this.lifecycleGeneration;
		queueMicrotask(() => {
			if (this.disposed || generation !== this.lifecycleGeneration) return;
			if (this.host !== null && this.host.isConnected) {
				// React deletion removes the host within its commit; a still-connected
				// host after the commit's microtasks is a hide (hidden content keeps
				// its DOM under display:none), not an unmount. Preserve the hosted
				// root, DOM, and state; the reveal's layout effect reattaches.
				this.attached = false;
				return;
			}
			try {
				this.dispose();
			} catch (error) {
				reportHostedFault(error);
			}
		});
	}

	private dispose(): void {
		if (this.disposed) return;
		// `disposed` makes routeError/routeSuspense decline, while the bridge
		// stays ACTIVE until Octane teardown finishes (§5 rule 8) so the
		// runtime's teardown routing still consults it.
		this.disposed = true;
		try {
			const disposers = [...this.disposers];
			this.disposers.clear();
			for (const dispose of disposers) dispose();
		} finally {
			this.active = false;
		}
	}

	// ── hosted root mechanics ──────────────────────────────────────────────

	private envelopeProps(): Record<string, unknown> {
		const committed = this.committed!;
		const props: Record<string, unknown> = {
			body: committed.type,
			bodyProps: committed.props,
			bodyKey: committed.key,
		};
		Object.defineProperty(props, RENDERER_REGION_OWNER, {
			value: this,
			enumerable: false,
		});
		return props;
	}

	private attachAndFlush(): { suspended: boolean; errored: boolean } {
		this.attemptSuspended = false;
		this.attemptErrored = false;
		if (this.host === null || this.committed === null || this.disposed) {
			return { suspended: false, errored: false };
		}
		if (this.root === null && hasServerIslandMarkup(this.host)) {
			// A server-rendered island (octane/react/server wrote the real HTML;
			// React hydrated around it without touching descendants — §9.3):
			// adopt the exact server node identities. The prefix is passed
			// VERBATIM so Octane ids hydrate byte-identically (§5 rule 2).
			// Same flushSync contract as the render path below: island layout
			// effects and refs commit before this layout effect returns, so
			// ancestor React layout effects observe the settled island DOM.
			const host = this.host;
			this.hydrating = true;
			try {
				octaneFlushSync(() => {
					this.root = hydrateOctaneRoot(
						host,
						hostedRootEnvelope as unknown as ComponentBody,
						this.envelopeProps(),
						{ identifierPrefix: this.identifierPrefix },
					);
				});
			} finally {
				this.hydrating = false;
			}
			return { suspended: this.attemptSuspended, errored: this.attemptErrored };
		}
		if (this.root === null || !this.rootLive) {
			// First attach, or the runtime unmounted the previous root after an
			// initial routed failure — a React retry binds a fresh root (§5 rule 9).
			this.root = createOctaneRoot(this.host, { identifierPrefix: this.identifierPrefix });
		}
		const root = this.root;
		octaneFlushSync(() =>
			root.render(hostedRootEnvelope as unknown as ComponentBody, this.envelopeProps()),
		);
		return { suspended: this.attemptSuspended, errored: this.attemptErrored };
	}

	private retryAfterSettle(episode: PendingEpisode): void {
		// A settlement from a superseded episode or an unmounted island is a
		// no-op. routeError supersedes the episode when a fault is staged, so a
		// stale settlement can never clobber an error with a "ready" status.
		if (this.disposed || this.episode !== episode) return;
		// Retry Octane FIRST; React learns about readiness only after the hosted
		// tree has committed (§7 — the Ripple lesson).
		const result = this.attachAndFlush();
		// Re-suspended: the same episode remains pending. Errored: routeError
		// already superseded the episode, staged status 2, and resolved the relay
		// so the wrapper wakes and throws into the nearest React error boundary.
		if (result.suspended || result.errored) return;
		this.episode = null;
		this.status = 0;
		this.payload = null;
		// Post-flush work completes before React reveals the island.
		drainPassiveEffects();
		episode.resolve();
	}
}

/**
 * Host exactly one compiled Octane component inside a React tree, in either
 * authoring form:
 *
 * - `component`/`props` (typed): `<OctaneCompat component={Island} props={…}/>`
 *   passes the island transport directly — island prop types flow from the
 *   component's own octane-typed signature, so a wrong prop is a type error at
 *   the call site.
 * - element child: `<OctaneCompat><Island …/></OctaneCompat>` — the child
 *   element is consumed as a `{ type, props }` transport; React never invokes
 *   it.
 *
 * The island's `ref` prop (React 19 places `ref` in props) passes through to
 * the island as an ordinary Octane ref prop. Surrounding React Suspense
 * boundaries, error boundaries, and event ancestors are the integration
 * surface; there is nothing to register.
 */
export function OctaneCompat<P>(props: OctaneCompatComponentProps<P>): React.ReactNode;
export function OctaneCompat(props: OctaneCompatProps): React.ReactNode;
export function OctaneCompat(
	props: OctaneCompatProps | OctaneCompatComponentProps<unknown>,
): React.ReactNode {
	const [controller] = React.useState(() => new HostedIslandController());
	// One stable invalidation per wrapper — a plain state bump (§5).
	const [, bump] = React.useReducer((count: number) => count + 1, 0);
	controller.notify = bump;

	// Render-local transport: an aborted concurrent React render must never
	// mutate the running Octane tree, so the island transport and context
	// snapshot are captured here and published only from the committed layout
	// effect below (§5 rules 4–5).
	const child = resolveHostedIsland(props);
	// Context reads replay during EVERY wrapper render — including one about
	// to throw the relay/error — so React records the dependencies (§7 step 3).
	const snapshot = controller.readReactSnapshots();
	// SSR-stable island identifier prefix (§5 rule 2); Phase 4 pairs this with
	// the hosted server renderer for hydration parity.
	const identifierPrefix = React.useId();

	if (controller.status === 2) throw controller.payload;
	if (controller.status === 1) React.use(controller.payload as Promise<void>);

	const [hostRef] = React.useState(() => (node: HTMLDivElement | null) => {
		if (node !== null) controller.hostAttached(node);
		else controller.hostDetached();
	});
	React.useLayoutEffect(() => {
		controller.commit(child, identifierPrefix, snapshot);
	});
	React.useEffect(() => {
		controller.passiveAlive();
		return () => controller.passiveDetached();
	}, [controller]);

	return React.createElement('div', {
		'data-octane-compat': '',
		ref: hostRef,
		// §9.3 opaque-host contract: the server writes real island HTML; the
		// client ALWAYS supplies this stable frozen sentinel so React neither
		// diffs nor clears the Octane-owned descendants — on any render, forever.
		suppressHydrationWarning: true,
		dangerouslySetInnerHTML: OPAQUE_HOST_SENTINEL,
	});
}

/** Server island markup present? (Anything beyond the client's own sentinel.) */
function hasServerIslandMarkup(host: HTMLElement): boolean {
	const first = host.firstChild;
	if (first === null) return false;
	return !(
		first.nodeType === 8 &&
		(first as Comment).data === OPAQUE_HOST_SENTINEL_COMMENT &&
		first.nextSibling === null
	);
}
