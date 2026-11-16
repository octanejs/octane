'use client';

declare const process: { env: { NODE_ENV?: string } };

import { RENDERER_REGION_OWNER_TAG as RENDERER_REGION_OWNER } from '../runtime-tags.js';

export { ReactCompat, ReactCompatInline } from './react-compat.js';
export { bridgeReactContext } from './react-compat-shared.js';
export type {
	ReactCompatProps,
	ReactCompatComponentProps,
	ReactCompatClassComponentProps,
	ReactHostedComponent,
	ReactContextBridge,
} from './react-compat-shared.js';

/**
 * `octane/react` — both directions of DOM interoperability. ReactCompat hosts
 * real React components inside Octane (docs/react-compat.md). OctaneCompat
 * hosts a compiled Octane subtree inside a real React 19 tree:
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
 * The explicit `octane/react/server` entry renders either direction on the
 * server; these client adapters hydrate its opaque hosts. Hosted roots pay
 * normal createRoot delegation costs (benchmarks/react-hosted-islands and
 * benchmarks/octane-hosted-react).
 */

import * as React from 'react';
import { hasOwnProp } from '../has-own.js';
import { installHostedRefDriver } from '../runtime/drivers.js';
import { SUSPENSE_HIDDEN_MODE } from '../runtime/activity.js';
import { createElementFromConfig } from '../runtime/elements.js';
import { attachLiveFragmentRef } from '../runtime/engine.js';
import { discardSubtreeRefAttachesFrom, type FragmentInstance } from '../runtime/refs.js';
import type { RefAttach } from '../runtime/types.js';
import {
	Activity,
	bindRendererRegionOwner,
	createContext as createOctaneContext,
	createHostContextRequest,
	createRoot as createOctaneRoot,
	hydrateRoot as hydrateOctaneRoot,
	flushSync as octaneFlushSync,
	use as octaneUse,
	type ComponentBody,
	type Context as OctaneContext,
	type Root as OctaneRoot,
	type RootOptions,
} from '../index.js';
import {
	OCTANE_COMPAT_HOST_STYLE,
	OPAQUE_HOST_SENTINEL,
	OPAQUE_HOST_SENTINEL_COMMENT,
	REACT_CONTEXT_TAG,
	resolveHostedIsland,
	type OctaneCompatComponentProps as HostedComponentProps,
	type OctaneCompatProps as HostedElementProps,
	type TransportedChild,
} from './shared.js';

export type { OctaneHostedComponent, OctaneReactComponent, OctaneRenderedNode } from './shared.js';
import { drainPassiveEffects, type Block } from '../runtime.js';
import { readNearestProviderValue } from './fiber-adapter.js';
import { reactResourceHints } from './resource-hints.js';

interface ClientSignalOwnerOption {
	/**
	 * Borrow a signal owner for the browser root. Change the host's React key
	 * to select a different owner. The caller disposes the owner.
	 */
	clientSignalOwner?: RootOptions['signalOwner'];
}

export interface OctaneCompatProps extends HostedElementProps, ClientSignalOwnerOption {}

export type OctaneCompatComponentProps<P> = HostedComponentProps<P> & ClientSignalOwnerOption;

// Structural bench/test hook (§13): provider walks happen only at discovery.
export { __hostContextFiberWalks } from './fiber-adapter.js';

type Visibility = 'visible' | 'hidden' | typeof SUSPENSE_HIDDEN_MODE;

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

function refRoot(block: Block | null): Block | null {
	while (block !== null && block.parentBlock !== null) block = block.parentBlock;
	return block;
}

let skippedRefs: RefAttach[] | null = null;

function retainSkippedRef(entry: RefAttach): boolean {
	const root = refRoot(entry.block);
	// Native visibility only marks child blocks. A retired root keeps this
	// marker after its bridge registration is released.
	if (root?.kind !== 'root' || !root.inactive) return false;
	// Resolve a Fragment mount's live ref now, before a later render changes it.
	const ref =
		entry.ref === attachLiveFragmentRef ? (entry.el as FragmentInstance)._currentRef : entry.ref;
	if (ref != null) (skippedRefs ??= []).push(ref === entry.ref ? entry : { ...entry, ref });
	return true;
}

const hostedRefDriver: Parameters<typeof installHostedRefDriver>[0] = {
	get skipped() {
		return skippedRefs?.length ? skippedRefs : null;
	},
	*iterate(queue) {
		let i = 0;
		try {
			while (i < queue.length) {
				const entry = queue[i++];
				if (!retainSkippedRef(entry)) yield entry;
			}
		} finally {
			// Closing the iterator after a fatal callback still records the retired tail.
			for (; i < queue.length; i++) retainSkippedRef(queue[i]);
		}
	},
	discardSubtree(root, uncommitted) {
		if (skippedRefs !== null) discardSubtreeRefAttachesFrom(skippedRefs, root, uncommitted);
	},
	finishRetirement(roots) {
		if (skippedRefs === null || skippedRefs.length === 0) return;
		skippedRefs = skippedRefs.filter((entry) => {
			const root = refRoot(entry.block);
			return root === null || !roots.includes(root);
		});
	},
};

interface EnvelopeProps {
	body: ComponentBody;
	bodyProps: unknown;
	bodyKey: string | null;
	mode: Visibility;
}

function sameIdentity(a: TransportedChild, b: TransportedChild): boolean {
	return a.type === b.type && a.key === b.key;
}

/** The transported child as an ordinary value-position Octane element. */
function transportedElement(props: EnvelopeProps): unknown {
	// The transported key rides the octane element so a key change replaces the
	// island subtree (octane's keyed identity semantics), never updates in place.
	const config =
		props.bodyKey === null
			? props.bodyProps
			: { ...(props.bodyProps as object), key: props.bodyKey };
	return createElementFromConfig(undefined, props.body, config as never);
}

/**
 * Private hosted-root envelope. A plain function is a valid Octane component
 * body ("a component is any function"): it binds the owner bridge to the root,
 * then renders the transported child as an ordinary value-position component,
 * so the child itself stays an unmodified compiled Octane component.
 */
function hostedRootEnvelope(props: EnvelopeProps): unknown {
	bindRendererRegionOwner(props);
	// Octane's own Activity carries a React Activity or Suspense hide into the
	// island: it disconnects effects, refs, and store subscriptions (a Suspense
	// hide keeps passive effects) while keeping state and DOM.
	// We wrap a validated component and the Activity sentinel. Descendants enable
	// optional descriptor capabilities where they create their own descriptors.
	return createElementFromConfig(undefined, Activity, {
		// The Suspense-hidden mode is private to this envelope, not public API.
		mode: props.mode as 'hidden',
		children: transportedElement(props),
	});
}

function StageReady(props: { marker: Promise<void> }): null {
	octaneUse(props.marker);
	return null;
}

/**
 * A staged dry run renders the child, then a sentinel that always suspends on
 * a fresh, already-resolved marker. The root attempt therefore rolls back: no
 * DOM lands and no effect runs. Octane suspends once for every sibling of a
 * stratum, so the marker alone means the child rendered without suspending,
 * and a joined suspension retries once the child's own work settles.
 */
function stagedRootEnvelope(props: EnvelopeProps & { marker: Promise<void> }): unknown {
	bindRendererRegionOwner(props);
	return [
		transportedElement(props),
		createElementFromConfig(undefined, StageReady, { marker: props.marker }),
	];
}

function reportHostedFault(error: unknown): void {
	// Disposal is deferred past React's commit, so
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
		if (!Object.is(a[key], (b as never)[key]) || !hasOwnProp.call(b, key)) {
			return false;
		}
	}
	return true;
}

/**
 * #2947: a new component type or key that arrives while the island is pending
 * supersedes the old attempt without unmounting React's fallback. The wrapper
 * suspends on this stage instead of the old relay, and the stage dry-runs the
 * new child in a detached root until it renders without suspending. React then
 * commits the new identity, and only that commit replaces the hosted child and
 * retires the old episode. An aborted React render leaves just a dry run.
 */
class StagedIsland {
	active = true;
	readonly resourceHints = reactResourceHints;
	status: 0 | 1 | 2 = 1; // ready, pending, error
	payload: unknown; // relay promise, then null or the error
	private resolve!: () => void;
	private root: OctaneRoot | null = null;
	private marker: Promise<void> | null = null;
	private disposers = new Set<() => void>();

	constructor(
		private owner: HostedIslandController,
		readonly child: TransportedChild,
	) {
		this.payload = new Promise<void>((done) => {
			this.resolve = done;
		});
		// Dry runs never run inside React's render.
		queueMicrotask(() => this.attempt());
	}

	readContext<T>(context: OctaneContext<T>): T {
		return this.owner.readContext(context);
	}

	resolveForeignContext(foreign: object): OctaneContext<any> | null {
		return this.owner.resolveForeignContext(foreign);
	}

	routeError(error: unknown): boolean {
		if (!this.active) return false;
		this.settle(2, error);
		return true;
	}

	routeSuspense(thenable: PromiseLike<unknown>): boolean {
		if (!this.active) return false;
		// A context handshake completes in the committed root, before paint.
		if (thenable === this.marker || this.owner.isContextRequest(thenable)) {
			this.settle(0, null);
		} else {
			const retry = () => this.attempt();
			thenable.then(retry, retry);
		}
		return true;
	}

	registerDispose(dispose: () => void): () => void {
		this.disposers.add(dispose);
		return () => this.disposers.delete(dispose);
	}

	/** Retire the stage. Resolving wakes a React render still waiting on it. */
	dispose(): void {
		if (!this.active) return;
		try {
			const disposers = [...this.disposers];
			this.disposers.clear();
			for (const dispose of disposers) dispose();
		} finally {
			this.active = false;
			this.root = null;
			this.resolve();
		}
	}

	private settle(status: 0 | 2, payload: unknown): void {
		if (this.status !== 1) return;
		this.status = status;
		this.payload = payload;
	}

	private attempt(): void {
		const host = this.owner.host;
		if (this.status !== 1 || !this.owner.isStaging(this) || host === null) return;
		if (this.root === null || this.disposers.size === 0) {
			this.root = createOctaneRoot(host.ownerDocument.createElement(host.localName));
		}
		const root = this.root;
		const props: Record<string, unknown> = {
			body: this.child.type,
			bodyProps: this.child.props,
			bodyKey: this.child.key,
			mode: 'visible',
			marker: (this.marker = Promise.resolve()),
		};
		Object.defineProperty(props, RENDERER_REGION_OWNER, { value: this, enumerable: false });
		try {
			octaneFlushSync(() => root.render(stagedRootEnvelope as unknown as ComponentBody, props));
		} catch (error) {
			this.settle(2, error);
		}
		if (this.status !== 1) {
			try {
				this.dispose();
			} catch (error) {
				reportHostedFault(error);
			}
		}
	}
}

/**
 * One controller per island: the React implementation of Octane's
 * renderer-region owner bridge plus the host lifecycle. Scalar ready-path
 * state only — episodes and error payloads are allocated lazily (§11).
 */
class HostedIslandController {
	// ── RendererRegionOwnerBridge ──────────────────────────────────────────
	active = true;
	readonly resourceHints = reactResourceHints;

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
	private staged: StagedIsland | null = null;
	private disposers = new Map<() => void, Block>();
	/** Exact roots marked during the current insertion cleanup, including late registrations. */
	private retiringRoots: Block[] | null = null;
	/** Positive while mounted. Cleanup negates the generation before deferring disposal. */
	private lifecycleGeneration = 0;
	private attemptSuspended = false;
	private attemptErrored = false;
	/** §6.3 request thenables this controller minted (recognized in routeSuspense). */
	private contextRequests = new WeakSet<PromiseLike<unknown>>();
	/** True while an attach is adopting server DOM (hydration). */
	private hydrating = false;
	/** A §6.3 handshake unwound the last attempt; the next commit retries the root. */
	private pendingContextRetry = false;
	/** How React hid the wrapper; the hosted Activity keeps that mode until the next commit. */
	private visibility: Visibility = 'visible';
	/** A disconnect awaits its microtask check; any commit cancels it. */
	private requestedVisibility: Visibility | null = null;

	constructor(private clientSignalOwner: RootOptions['signalOwner']) {}

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

	isContextRequest(thenable: PromiseLike<unknown>): boolean {
		return this.contextRequests.has(thenable);
	}

	isStaging(stage: StagedIsland): boolean {
		return this.staged === stage && this.lifecycleGeneration > 0 && !this.disposed;
	}

	/**
	 * Render-phase: the stage a pending island waits on for a newly selected
	 * child identity, or null when the ordinary commit path applies.
	 */
	stage(child: TransportedChild): StagedIsland | null {
		const committed = this.committed;
		if (committed === null || this.disposed || sameIdentity(committed, child)) return null;
		const staged = this.staged;
		if (staged !== null && sameIdentity(staged.child, child)) return staged;
		// A ready island takes a new identity through the ordinary commit.
		if (this.status === 0) return null;
		staged?.dispose();
		return (this.staged = new StagedIsland(this, child));
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

	registerDispose(dispose: () => void, root: Block): () => void {
		installHostedRefDriver(hostedRefDriver);
		this.disposers.set(dispose, root);
		if (this.retiringRoots !== null) {
			root.inactive = true;
			this.retiringRoots.push(root);
		}
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
	}

	hostDetached(): void {
		// Hiding detaches the ref. Keep the host for pending retries and republish on reveal.
		this.attached = false;
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
		this.identifierPrefix = identifierPrefix;
		const previous = this.committed;
		// A child identity/key change replaces the island — and resets context
		// discovery associated with the former tree (§10): the registry is
		// monotonic only within one child identity.
		if (previous !== null && !sameIdentity(previous, child)) {
			this.entries = [];
			// React committed the new identity: retire the stage and the old
			// episode, so a late settlement neither retries nor reports.
			this.retireStage();
			const episode = this.episode;
			this.episode = null;
			this.status = 0;
			this.payload = null;
			episode?.resolve();
		}
		const contextsChanged = this.publishSnapshots(snapshot);
		const needsContextRetry = this.pendingContextRetry;
		this.pendingContextRetry = false;
		// A layout commit means the wrapper is visible: cancel a pending hide and reveal.
		const revealing = this.visibility !== 'visible';
		this.visibility = 'visible';
		this.requestedVisibility = null;
		if (
			!revealing &&
			!contextsChanged &&
			!needsContextRetry &&
			this.attached &&
			this.rootLive &&
			this.status === 0 &&
			this.episode === null &&
			previous !== null &&
			sameIdentity(previous, child) &&
			shallowEqualProps(previous.props, child.props)
		) {
			return;
		}
		this.committed = child;
		this.attached = true;
		this.attachAndFlush();
	}

	/**
	 * Wrapper layout and passive cleanups. React runs the layout one on any hide,
	 * a StrictMode probe, and deletion, and the passive one on all but a Suspense
	 * hide, which keeps passive effects connected. The microtask runs after the
	 * probe's layout re-setup (which cancels it) and after deletion's insertion
	 * cleanup (which retires the root), so only a hide reaches the hosted
	 * Activity: a passive cleanup upgrades the request to a full hide. A
	 * Suspense hide the island's own relay caused is not one: its retry commits
	 * Octane before React reveals (§7).
	 */
	disconnected(passive: boolean): void {
		if (this.visibility === 'hidden' || this.root === null || this.lifecycleGeneration < 0) return;
		const mode = passive ? 'hidden' : SUSPENSE_HIDDEN_MODE;
		if (mode === this.visibility || (!passive && this.episode !== null)) return;
		const queued = this.requestedVisibility !== null;
		if (this.requestedVisibility !== 'hidden') this.requestedVisibility = mode;
		if (queued) return;
		queueMicrotask(() => {
			const requested = this.requestedVisibility;
			this.requestedVisibility = null;
			if (requested === null || this.disposed || this.lifecycleGeneration < 0) return;
			if (requested !== 'hidden' && this.episode !== null) return;
			this.visibility = requested;
			try {
				this.attachAndFlush();
			} catch (error) {
				reportHostedFault(error);
			}
		});
	}

	/** Insertion effects stay registered while React hides or probes the island. */
	startLifetime(): () => void {
		const previous = this.lifecycleGeneration;
		const generation = Math.abs(previous) + 1;
		this.lifecycleGeneration = generation;
		if (previous < 0) {
			for (const root of this.disposers.values()) root.inactive = false;
			this.retiringRoots = null;
		}
		return () => {
			if (generation !== this.lifecycleGeneration) return;
			this.lifecycleGeneration = -generation;
			// The current Octane effect may still return a cleanup. Skip pending setups
			// for this host immediately, then dispose after that callback finishes.
			const roots = (this.retiringRoots = [...this.disposers.values()]);
			for (const root of roots) root.inactive = true;
			queueMicrotask(() => {
				if (this.disposed || this.lifecycleGeneration !== -generation) return;
				try {
					this.dispose();
				} catch (error) {
					reportHostedFault(error);
				} finally {
					this.retiringRoots = null;
					hostedRefDriver.finishRetirement(roots);
				}
			});
		};
	}

	private retireStage(): void {
		const staged = this.staged;
		this.staged = null;
		staged?.dispose();
	}

	private dispose(): void {
		if (this.disposed) return;
		this.retireStage();
		// `disposed` makes routeError/routeSuspense decline, while the bridge
		// stays ACTIVE until Octane teardown finishes (§5 rule 8) so the
		// runtime's teardown routing still consults it.
		this.disposed = true;
		try {
			const disposers = [...this.disposers.keys()];
			this.disposers.clear();
			for (const dispose of disposers) dispose();
		} finally {
			this.active = false;
			this.root = null;
			this.clientSignalOwner = undefined;
		}
	}

	// ── hosted root mechanics ──────────────────────────────────────────────

	private rootOptions(): RootOptions {
		const options: RootOptions = { identifierPrefix: this.identifierPrefix };
		if (this.clientSignalOwner !== undefined) options.signalOwner = this.clientSignalOwner;
		return options;
	}

	private envelopeProps(): Record<string, unknown> {
		const committed = this.committed!;
		const props: Record<string, unknown> = {
			body: committed.type,
			bodyProps: committed.props,
			bodyKey: committed.key,
			mode: this.visibility,
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
						this.rootOptions(),
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
			this.root = createOctaneRoot(this.host, this.rootOptions());
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
		if (this.lifecycleGeneration < 0 || this.episode !== episode) return;
		// Retry Octane FIRST; React learns about readiness only after the hosted
		// tree has committed (§7 — the Ripple lesson).
		const result = this.attachAndFlush();
		// Re-suspended: the same episode remains pending. Errored: routeError
		// already superseded the episode, staged status 2, and resolved the relay
		// so the wrapper wakes and throws into the nearest React error boundary.
		// A layout effect in the retry can synchronously delete the React host.
		if (this.lifecycleGeneration < 0 || result.suspended || result.errored) return;
		this.episode = null;
		this.status = 0;
		this.payload = null;
		// Post-flush work completes before React reveals the island.
		drainPassiveEffects();
		episode.resolve();
	}
}

function createOctaneCompat(host: 'div' | 'span') {
	function OctaneCompat<P>(props: OctaneCompatComponentProps<P>): React.ReactNode;
	function OctaneCompat(props: OctaneCompatProps): React.ReactNode;
	function OctaneCompat(
		props: OctaneCompatProps | OctaneCompatComponentProps<unknown>,
	): React.ReactNode {
		const [controller] = React.useState(() => new HostedIslandController(props.clientSignalOwner));
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

		// A new identity while pending waits on its own stage, not the old relay.
		const gate = controller.stage(child) ?? controller;
		if (gate.status === 2) throw gate.payload;
		if (gate.status === 1) React.use(gate.payload as Promise<void>);

		const [hostRef] = React.useState(() => (node: HTMLElement | null) => {
			if (node !== null) controller.hostAttached(node);
			else controller.hostDetached();
		});
		React.useLayoutEffect(() => {
			controller.commit(child, identifierPrefix, snapshot);
		});
		React.useLayoutEffect(() => () => controller.disconnected(false), [controller]);
		React.useEffect(() => () => controller.disconnected(true), [controller]);
		React.useInsertionEffect(() => controller.startLifetime(), [controller]);

		return React.createElement(host, {
			'data-octane-compat': '',
			className: props.hostClassName,
			style: props.hostStyle ?? OCTANE_COMPAT_HOST_STYLE,
			role: props.hostRole,
			'aria-label': props.hostAriaLabel,
			ref: hostRef,
			// §9.3 opaque-host contract: the server writes real island HTML; the
			// client ALWAYS supplies this stable frozen sentinel so React neither
			// diffs nor clears the Octane-owned descendants — on any render, forever.
			suppressHydrationWarning: true,
			dangerouslySetInnerHTML: OPAQUE_HOST_SENTINEL,
		});
	}
	return OctaneCompat;
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
export const OctaneCompat = /* @__PURE__ */ createOctaneCompat('div');
/** Host phrasing Octane content inside a span. */
export const OctaneCompatInline = /* @__PURE__ */ createOctaneCompat('span');

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
