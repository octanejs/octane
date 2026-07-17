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
 * Phase status (§14): this is the Phase 1 client shell, carrying the root
 * suspension/error escape protocol validated by the Phase 0 spike
 * (packages/octane/tests/react-hosted/). Not yet implemented:
 * - transparent React context (Phase 2) — an island's `use(context)` sees its
 *   own local Octane providers and context defaults only;
 * - server rendering/hydration of islands (Phase 4) — under React SSR the
 *   host renders empty and the island mounts on the client;
 * - selective per-island event delegation (Phase 5) — hosted roots currently
 *   pay the normal `createRoot` delegation cost (see
 *   benchmarks/react-hosted-islands).
 */

import * as React from 'react';
import {
	bindRendererRegionOwner,
	createElement as createOctaneElement,
	createRoot as createOctaneRoot,
	flushSync as octaneFlushSync,
	type ComponentBody,
	type Context as OctaneContext,
	type Root as OctaneRoot,
} from '../index.js';
import { drainPassiveEffects } from '../runtime.js';

export interface OctaneCompatProps {
	/** Exactly one compiled Octane component element. */
	children: React.ReactElement;
}

declare const OCTANE_RENDERED: unique symbol;

/**
 * Opaque branded node type for the JSX-facing view of a compiled Octane
 * component: assignable to `React.ReactNode` so React JSX accepts the child
 * site, but never actually produced at runtime — `OctaneCompat` consumes the
 * child element as a `{ type, props }` transport and React never invokes it.
 */
export type OctaneRenderedNode = React.ReactElement & {
	readonly [OCTANE_RENDERED]: 'octane';
};

/**
 * The React-JSX-facing type of a compiled Octane component. The runtime value
 * is the compiled body; only the declared type differs so `<Island …/>` is
 * valid zero-cast inside `<OctaneCompat>`. Intersects cleanly with
 * `ComponentBody<P>` so one declaration can serve both hosts.
 */
export type OctaneReactComponent<P = Record<string, never>> = (props: P) => OctaneRenderedNode;

/** Shared registry key the Octane runtime reads the owner bridge from. */
const RENDERER_REGION_OWNER = Symbol.for('octane.renderer-region.owner');

interface TransportedChild {
	type: ComponentBody;
	props: Record<string, unknown>;
	/** React key of the transported element — part of island identity (§3/§10). */
	key: string | null;
}

interface PendingEpisode {
	relay: Promise<void>;
	resolve: () => void;
}

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

	// ── RendererRegionOwnerBridge ──────────────────────────────────────────

	readContext<T>(context: OctaneContext<T>): T {
		// Phase 2 resolves foreign React contexts here. Until then an island
		// read with no local Octane provider sees the context default — the
		// same value a bare Octane root would produce.
		return context.defaultValue;
	}

	routeError(error: unknown): boolean {
		// While disposing, the wrapper cannot be scheduled: decline so the
		// cleanup fault re-throws synchronously out of the disposal frame.
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
			// A rebind registers the successor BEFORE releasing the predecessor
			// (bindRendererRegionOwner), so the root is only dead when no disposer
			// remains — an unconditional clear would strand a live root.
			this.rootLive = this.disposers.size > 0;
		};
	}

	// ── wrapper integration ────────────────────────────────────────────────

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
	commit(child: TransportedChild, identifierPrefix: string): void {
		if (this.disposed) return;
		this.lifecycleGeneration++;
		this.identifierPrefix = identifierPrefix;
		const previous = this.committed;
		if (
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
		// A settlement from a superseded episode or an unmounted island is a no-op.
		if (this.disposed || this.episode !== episode) return;
		// Retry Octane FIRST; React learns about readiness only after the hosted
		// tree has committed (§7 — the Ripple lesson).
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

function describeChildType(type: unknown): string {
	if (typeof type === 'string') return `the DOM element <${type}>`;
	if (type === React.Fragment) return 'a Fragment';
	if (typeof type === 'function')
		return `the component ${(type as Function).name || '(anonymous)'}`;
	return 'an exotic React element';
}

function validateIslandChild(children: React.ReactNode): TransportedChild {
	if (React.Children.count(children) !== 1) {
		throw new Error(
			'<OctaneCompat> expects exactly one Octane component element child; received ' +
				`${React.Children.count(children)} children.`,
		);
	}
	if (!React.isValidElement(children)) {
		throw new Error('<OctaneCompat> expects an Octane component element, not a plain renderable.');
	}
	const type = children.type as unknown;
	if (typeof type !== 'function') {
		throw new Error(
			`<OctaneCompat> cannot host ${describeChildType(type)}; ` +
				'pass one compiled Octane component. (memo/forwardRef/lazy wrappers are React-only ' +
				'element types — use Octane memo()/lazy() inside the island instead.)',
		);
	}
	if (process.env.NODE_ENV !== 'production') {
		// A class component is provably a React-only component. A PLAIN function
		// cannot be distinguished from a prod-compiled or plain-TS Octane
		// component today (the compiler does not yet emit a runtime brand), so
		// unbranded plain functions are accepted; passing an ordinary React
		// function component here fails inside the island when it calls React
		// hooks against the Octane runtime.
		if ((type as { prototype?: { isReactComponent?: unknown } }).prototype?.isReactComponent) {
			throw new Error(
				`<OctaneCompat> cannot host ${describeChildType(type)}: class components are ` +
					'React-only; pass one compiled Octane component.',
			);
		}
	}
	return {
		type: type as unknown as ComponentBody,
		props: (children.props ?? {}) as Record<string, unknown>,
		key: children.key ?? null,
	};
}

/**
 * Host exactly one compiled Octane component element inside a React tree.
 *
 * The child element is consumed as a `{ type, props }` transport — React never
 * invokes it. Its `ref` prop (React 19 places `ref` in props) passes through
 * to the island as an ordinary Octane ref prop. Surrounding React Suspense
 * boundaries, error boundaries, and event ancestors are the integration
 * surface; there is nothing to register.
 */
export function OctaneCompat(props: OctaneCompatProps): React.ReactNode {
	const [controller] = React.useState(() => new HostedIslandController());
	// One stable invalidation per wrapper — a plain state bump (§5).
	const [, bump] = React.useReducer((count: number) => count + 1, 0);
	controller.notify = bump;

	// Render-local transport: an aborted concurrent React render must never
	// mutate the running Octane tree, so the child is captured here and
	// published only from the committed layout effect below (§5 rule 5).
	const child = validateIslandChild(props.children);
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
		controller.commit(child, identifierPrefix);
	});
	React.useEffect(() => {
		controller.passiveAlive();
		return () => controller.passiveDetached();
	}, [controller]);

	return React.createElement('div', { 'data-octane-compat': '', ref: hostRef });
}
