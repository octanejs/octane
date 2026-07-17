/**
 * React-hosted Octane Phase 0 spike harness
 * (docs/react-hosted-octane-compat-plan.md §14 Phase 0).
 *
 * `OctaneCompatSpike` is an internal-only React 19 component whose controller
 * implements the EXISTING `RendererRegionOwnerBridge` protocol around an
 * unmodified compiled Octane root mounted under a React-owned host element.
 * It is executable evidence for the plan's riskiest client assumptions — it is
 * NOT the public `octane/react` package (which does not exist yet):
 *
 *  - ownership: React owns the wrapper Fiber + host element; Octane owns every
 *    descendant; the hosted root binds the owner via `bindRendererRegionOwner`.
 *  - context: island reads of a mirror Octane context reach `readContext()`,
 *    bootstrap once from the host Fiber (see `_fiber-adapter.ts`), register in
 *    a flat entry array, and stay live through `React.use(context)` calls in
 *    the wrapper render (§6.2 steps 1–9, with the mirror↔React context pairing
 *    supplied by the test instead of Phase 2's foreign-context detection).
 *  - escape: only a throw that reaches the hosted root arrives at
 *    `routeError`/`routeSuspense`; suspensions relay through one lazily-created
 *    wakeable that resolves only after a successful Octane retry commit and
 *    post-flush (§7); errors re-throw from the wrapper render into the nearest
 *    React error boundary.
 *  - lifecycle: attach/publish happens in the wrapper's layout effect and
 *    finishes the hosted Octane commit synchronously (§5 rule 4); disposal uses
 *    the deferred host-connectivity check that discriminates StrictMode
 *    probes, Suspense hiding, and real unmount (§5 rule 7).
 */
import * as React from 'react';
import { createRoot as createReactRoot, type Root as ReactRoot } from 'react-dom/client';
import {
	createRoot as createOctaneRoot,
	drainPassiveEffects,
	flushSync as octaneFlushSync,
	type ComponentBody,
	type Context as OctaneContext,
	type Root as OctaneRoot,
} from '../../src/index.js';
import { HostedIslandEnvelope } from './_fixtures/islands.tsrx';
import { readNearestProviderValue } from './_fiber-adapter.js';

// React 18+ act() gate — without it act() warns and skips scheduler drains.
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

export const reactAct: <T>(scope: () => T | Promise<T>) => Promise<T> = (React as any).act;

/** Shared registry key the runtime reads the owner bridge from (universal.ts / runtime.ts). */
export const RENDERER_REGION_OWNER: unique symbol = Symbol.for(
	'octane.renderer-region.owner',
) as never;

/**
 * Compiled-component brand for §3 development validation. The real compat
 * package would have the compiler stamp this on every compiled component (or
 * derive it from compiled-output metadata); the spike stamps it explicitly via
 * `octaneChild()` so an unbranded ordinary React component is distinguishable.
 */
const OCTANE_COMPONENT_BRAND: unique symbol = Symbol.for('octane.react-hosted.brand') as never;

export function octaneChild<P>(
	body: ComponentBody<P> | ((props: P) => unknown),
	props?: P,
	key?: string,
): React.ReactElement {
	(body as any)[OCTANE_COMPONENT_BRAND] = true;
	return React.createElement(
		body as unknown as React.FC<P & {}>,
		{
			...(props as object),
			key,
		} as any,
	);
}

export interface MirrorPair {
	react: React.Context<any>;
	mirror: OctaneContext<any>;
}

interface HostedContextEntry {
	reactContext: React.Context<any>;
	mirror: OctaneContext<any>;
	/** Latest committed React snapshot the island may observe. */
	value: any;
	hasValue: boolean;
}

interface PendingEpisode {
	relay: Promise<void>;
	resolve: () => void;
}

interface TransportedChild {
	type: ComponentBody;
	props: any;
}

export type LifecycleEvent =
	| 'attached'
	| 'hidden'
	| 'reattached'
	| 'disposed-by-unmount'
	| 'dispose-check-canceled';

export class IslandController {
	// ── RendererRegionOwnerBridge surface ────────────────────────────────────
	active = true;

	// ── controller state (plan §5 HostedController shape) ────────────────────
	host: HTMLElement | null = null;
	root: OctaneRoot | null = null;
	status: 0 | 1 | 2 = 0; // ready, pending, error
	payload: unknown = null; // null, relay promise, or original error
	entries: HostedContextEntry[] = [];
	notify: () => void = () => {};
	lifecycle: LifecycleEvent[] = [];
	/** A hosted-cleanup error raised during deferred disposal (see scheduleDisconnectCheck). */
	disposeFault: unknown = null;

	private body: ComponentBody | null = null;
	private bodyProps: any = null;
	private mirrors: MirrorPair[];
	private disposers = new Set<() => void>();
	private episode: PendingEpisode | null = null;
	private rootLive = false;
	private attached = false;
	private disposed = false;
	/** Bumped by every layout setup/cleanup; cancels a pending deferred dispose check. */
	private lifecycleGeneration = 0;
	private attemptSuspended = false;
	private attemptErrored = false;

	constructor(mirrors: MirrorPair[] = []) {
		this.mirrors = mirrors;
	}

	// ── RendererRegionOwnerBridge ────────────────────────────────────────────

	readContext<T>(context: OctaneContext<T>): T {
		let entry = this.entries.find((candidate) => candidate.mirror === context);
		if (entry === undefined) {
			const pair = this.mirrors.find((candidate) => candidate.mirror === context);
			if (pair === undefined || this.host === null) return context.defaultValue;
			// One-time committed-provider bootstrap from the host Fiber (§6.1).
			// Never subscribes — the wrapper's React.use(context) on the next
			// notification is the subscription.
			const boot = readNearestProviderValue(this.host, pair.react);
			entry = {
				reactContext: pair.react,
				mirror: context,
				value: boot.found ? boot.value : context.defaultValue,
				hasValue: boot.found,
			};
			// Registry shapes are immutable — replace, never mutate, the array a
			// concurrent React render may already be iterating (§5).
			this.entries = [...this.entries, entry];
			this.notify();
		}
		return entry.value as T;
	}

	routeError(error: unknown): boolean {
		// During final React deletion the wrapper cannot be scheduled — decline so
		// the cleanup error re-throws synchronously into React's commit-error path.
		if (this.disposed) return false;
		this.attemptErrored = true;
		this.status = 2;
		this.payload = error;
		this.notify();
		return true;
	}

	routeSuspense(thenable: PromiseLike<unknown>): boolean {
		if (this.disposed) return false;
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
			this.status = 1;
			this.payload = relay;
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
			this.rootLive = false;
		};
	}

	// ── wrapper integration ──────────────────────────────────────────────────

	/** §6.2 step 8: render-local replay of every registered context read. */
	readReactSnapshots(): any[] {
		const entries = this.entries;
		const values: any[] = new Array(entries.length);
		for (let index = 0; index < entries.length; index++) {
			values[index] = React.use(entries[index].reactContext);
		}
		return values;
	}

	/**
	 * Layout-commit publish + attach (§5 rule 4): commit the context snapshot,
	 * bump changed mirrors' versions, and synchronously finish the hosted Octane
	 * commit before the wrapper's layout effect returns.
	 */
	commit(child: TransportedChild, snapshots: any[]): void {
		if (this.disposed) return;
		this.lifecycleGeneration++;
		this.lifecycle.push(this.attached ? 'reattached' : 'attached');
		this.attached = true;
		this.body = child.type;
		this.bodyProps = child.props;
		const entries = this.entries;
		for (let index = 0; index < snapshots.length && index < entries.length; index++) {
			const entry = entries[index];
			if (!entry.hasValue || !Object.is(entry.value, snapshots[index])) {
				entry.value = snapshots[index];
				entry.hasValue = true;
				// §6.2 step 9 — without the version bump, memo/context dependency
				// checks bail out on the stale mirror value.
				entry.mirror.$$version++;
			}
		}
		this.attachAndFlush();
	}

	/** A new attachment generation cancels any pending deferred dispose check (§5 rule 7). */
	cancelDisconnectCheck(): void {
		this.lifecycleGeneration++;
	}

	/**
	 * Deferred hide/probe/unmount discriminator (§5 rule 7). Phase 0 finding on
	 * React 19.2 commit ordering: hiding Suspense content destroys layout
	 * effects AND detaches refs but leaves PASSIVE effects connected; deleting
	 * that already-hidden tree then fires only the passive cleanup. So the
	 * check must be scheduled from BOTH the host ref detach (prompt
	 * visible-deletion + hide detection) and the wrapper's passive cleanup
	 * (deletion-while-hidden) — a layout-cleanup-only or ref-only trigger
	 * leaks the hosted root when a hidden island is deleted.
	 */
	scheduleDisconnectCheck(): void {
		const generation = ++this.lifecycleGeneration;
		queueMicrotask(() => {
			if (this.disposed) return;
			if (generation !== this.lifecycleGeneration) {
				// A newer attachment generation exists: StrictMode probe or ordinary
				// re-render — the check is canceled, the hosted root survives.
				this.lifecycle.push('dispose-check-canceled');
				return;
			}
			if (this.host !== null && this.host.isConnected) {
				// React deletion removes the host within its commit; a still-connected
				// host after the commit's microtasks is a hide (Suspense/Offscreen keeps
				// hidden DOM under display:none), not an unmount.
				this.lifecycle.push('hidden');
				this.attached = false;
				return;
			}
			this.lifecycle.push('disposed-by-unmount');
			try {
				this.dispose();
			} catch (error) {
				// Deferred disposal runs OUTSIDE React's commit, so a hosted cleanup
				// fault can no longer re-throw into React's commit-error path (§5
				// rule 8 as written assumed synchronous disposal). Phase 0 records
				// the fault; the real package must pick a reporting channel
				// (candidate: reportError, matching React 19's onUncaughtError default).
				this.disposeFault = error;
			}
		});
	}

	dispose(): void {
		if (this.disposed) return;
		// The bridge stays ACTIVE until Octane teardown finishes (§5 rule 8) so
		// the runtime's teardown handler still reaches routeError(); `disposed`
		// makes routeError decline, so a cleanup fault re-throws synchronously
		// out of the disposal frame instead of scheduling the dead wrapper.
		this.disposed = true;
		try {
			const disposers = [...this.disposers];
			this.disposers.clear();
			for (const dispose of disposers) dispose();
		} finally {
			this.active = false;
		}
	}

	get isDisposed(): boolean {
		return this.disposed;
	}

	get hasLiveRoot(): boolean {
		return this.rootLive;
	}

	// ── hosted root mechanics ────────────────────────────────────────────────

	private envelopeProps(): any {
		const props: any = { body: this.body, bodyProps: this.bodyProps };
		Object.defineProperty(props, RENDERER_REGION_OWNER, {
			value: this,
			enumerable: false,
		});
		return props;
	}

	private attachAndFlush(): { suspended: boolean; errored: boolean } {
		this.attemptSuspended = false;
		this.attemptErrored = false;
		if (this.host === null || this.body === null) return { suspended: false, errored: false };
		if (this.root === null || !this.rootLive) {
			// A fresh hosted root: either first attach, or the runtime unmounted the
			// previous root after an initial routed failure (§5 rule 9).
			this.root = createOctaneRoot(this.host);
		}
		const root = this.root;
		octaneFlushSync(() => root.render(HostedIslandEnvelope, this.envelopeProps()));
		return { suspended: this.attemptSuspended, errored: this.attemptErrored };
	}

	private retryAfterSettle(episode: PendingEpisode): void {
		// A settlement from a superseded episode or an unmounted island is a no-op.
		if (this.disposed || this.episode !== episode) return;
		// Retry Octane FIRST; React learns about readiness only afterwards (§7).
		const result = this.attachAndFlush();
		if (result.suspended) return; // same episode remains pending
		this.episode = null;
		if (!result.errored) {
			this.status = 0;
			this.payload = null;
			// Post-flush work completes before React reveals the island.
			drainPassiveEffects();
		}
		// On error, routeError already staged status 2 — waking the wrapper makes
		// it throw the original error into the nearest React error boundary.
		episode.resolve();
	}
}

function validateIslandChild(children: React.ReactNode): TransportedChild {
	if (React.Children.count(children) !== 1) {
		throw new Error(
			'OctaneCompat expects exactly one Octane component element child; ' +
				`received ${React.Children.count(children)} children.`,
		);
	}
	if (!React.isValidElement(children)) {
		throw new Error('OctaneCompat expects an Octane component element, not a plain renderable.');
	}
	const type = children.type as unknown;
	if (typeof type === 'string') {
		throw new Error(
			`OctaneCompat cannot host the DOM element <${type}>; pass one compiled Octane component.`,
		);
	}
	if (typeof type !== 'function') {
		throw new Error(
			'OctaneCompat cannot host Fragments or exotic React elements; ' +
				'pass one compiled Octane component.',
		);
	}
	if ((type as any)[OCTANE_COMPONENT_BRAND] !== true) {
		throw new Error(
			'OctaneCompat received an ordinary React component; only compiled Octane components ' +
				'can render inside an island.',
		);
	}
	return { type: type as unknown as ComponentBody, props: (children as any).props };
}

export interface CompatSpikeProps {
	/** Test-supplied mirror↔React context pairs (Phase 2 replaces this with foreign-context detection). */
	contexts?: MirrorPair[];
	/** Test hook: observe the controller for lifecycle/registry assertions. */
	controllerRef?: (controller: IslandController) => void;
	children?: React.ReactNode;
}

export function OctaneCompatSpike(props: CompatSpikeProps): React.ReactNode {
	const [controller] = React.useState(() => new IslandController(props.contexts ?? []));
	// One stable invalidation per wrapper — a plain state bump (§5).
	const [, bump] = React.useReducer((count: number) => count + 1, 0);
	controller.notify = bump;
	props.controllerRef?.(controller);

	const child = validateIslandChild(props.children);
	// Context reads replay during EVERY wrapper render — including one that is
	// about to throw the relay/error — so React records the dependencies (§7 step 3).
	const snapshots = controller.readReactSnapshots();

	if (controller.status === 2) throw controller.payload;
	if (controller.status === 1) React.use(controller.payload as Promise<void>);

	// One stable callback ref: attach cancels a pending dispose check; detach
	// schedules it. `controller.host` is deliberately NOT cleared on detach —
	// a hidden island's ref detaches too, and the pending-episode retry must
	// still reach the (connected, display:none) host.
	const [hostRef] = React.useState(() => (node: HTMLDivElement | null) => {
		if (node !== null) {
			controller.host = node;
			controller.cancelDisconnectCheck();
		} else {
			controller.scheduleDisconnectCheck();
		}
	});
	React.useLayoutEffect(() => {
		controller.commit(child, snapshots);
	});
	// Deletion-of-hidden-content signal: passive effects survive a Suspense
	// hide, so this cleanup still fires when React deletes an already-hidden
	// island (the ref detach and layout cleanup already ran at hide time).
	React.useEffect(() => {
		controller.cancelDisconnectCheck();
		return () => controller.scheduleDisconnectCheck();
	}, [controller]);

	return React.createElement('div', { 'data-octane-compat': '', ref: hostRef });
}

// ── generic React-side test scaffolding ─────────────────────────────────────

interface ErrorBoundaryProps {
	fallback: (error: unknown) => React.ReactNode;
	children?: React.ReactNode;
}

export class SpikeErrorBoundary extends React.Component<
	ErrorBoundaryProps,
	{ error: unknown | null }
> {
	state: { error: unknown | null } = { error: null };
	static getDerivedStateFromError(error: unknown) {
		return { error };
	}
	reset(): void {
		this.setState({ error: null });
	}
	render(): React.ReactNode {
		if (this.state.error !== null) return this.props.fallback(this.state.error);
		return this.props.children;
	}
}

export interface ReactHostMount {
	container: HTMLDivElement;
	reactRoot: ReactRoot;
	render(element: React.ReactNode): Promise<void>;
	unmount(): Promise<void>;
	/** The compat host element (throws if none is mounted). */
	host(): HTMLElement;
}

export async function mountReactHost(
	element: React.ReactNode,
	options?: { onUncaughtError?: (error: unknown) => void },
): Promise<ReactHostMount> {
	const container = document.createElement('div');
	document.body.appendChild(container);
	const reactRoot = createReactRoot(
		container,
		options?.onUncaughtError ? ({ onUncaughtError: options.onUncaughtError } as any) : undefined,
	);
	const mounted: ReactHostMount = {
		container,
		reactRoot,
		async render(next) {
			await reactAct(async () => {
				reactRoot.render(next as any);
			});
		},
		async unmount() {
			await reactAct(async () => {
				reactRoot.unmount();
			});
			container.remove();
		},
		host() {
			const host = container.querySelector('[data-octane-compat]');
			if (host === null) throw new Error('no octane compat host mounted');
			return host as HTMLElement;
		},
	};
	await mounted.render(element);
	return mounted;
}

export const h = React.createElement;
