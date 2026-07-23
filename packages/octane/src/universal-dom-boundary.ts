import {
	readContextFromScope,
	useInsertionEffect as useDomInsertionEffect,
	useLayoutEffect as useDomLayoutEffect,
	useRendererThenable as useDomRendererThenable,
	useState as useDomState,
	type Context,
	type Scope,
} from './runtime.js';
import {
	isRendererRegion,
	type RendererRegion,
	type UniversalBoundaryMetadata,
	type UniversalComponent,
	type UniversalContext,
	type UniversalPreparedAttempt,
	type UniversalRoot,
} from './universal-core.js';

const UNIVERSAL_BOUNDARY = Symbol.for('octane.universal.boundary');

interface HostBoundaryProps {
	root: UniversalRoot;
	component?: UniversalComponent<any>;
	props?: any;
	/** Compiler-owned `children` form used by statically declared boundaries. */
	children?: RendererRegion;
}

interface BoundaryOwner {
	readContext<T>(context: UniversalContext<T>): T;
	invalidate(): void;
	consumeRootInvalidation(): boolean;
}

interface BoundaryRoot extends UniversalRoot {
	setBridge(owner: BoundaryOwner): void;
	clearBridge(owner: BoundaryOwner): void;
	__prepareBoundaryScheduled(
		component: UniversalComponent<any>,
		props: any,
	): {
		readonly attempt: UniversalPreparedAttempt;
		readonly transition: boolean;
		readonly projectedThenable: PromiseLike<unknown> | null;
	};
	__scheduleMicrotask(callback: () => void): void;
	__runCommitTasks(tasks: readonly (() => void)[]): void;
}

interface HostBoundaryState {
	root: BoundaryRoot;
	owner: BoundaryOwner;
	/** The DOM owner reached layout commit; this does not imply that a host batch ran. */
	ownerCommitted: boolean;
	/** The DOM owner installed its deletion lifetime, including while Suspense-hidden. */
	lifetimeCommitted: boolean;
	/** A suspended attempt reached insertion commit and retained the bridge for retry. */
	suspensionRetained: boolean;
	/** A retained suspended attempt later failed while preparing its retry. */
	retryErrored: boolean;
	pending: UniversalPreparedAttempt | null;
}

const boundaryStates = new WeakMap<Scope, HostBoundaryState>();
const BOUNDARY_INVALIDATE_SLOT = Symbol('octane.universal.boundary.invalidate');
const BOUNDARY_COMMIT_SLOT = Symbol('octane.universal.boundary.commit');
const BOUNDARY_ATTEMPT_LIFETIME_SLOT = Symbol('octane.universal.boundary.attempt-lifetime');
const BOUNDARY_LIFETIME_SLOT = Symbol('octane.universal.boundary.lifetime');

function assertRendererId(value: unknown): asserts value is string {
	if (typeof value !== 'string' || value.trim() === '') {
		throw new TypeError('Host boundary renderer must be a non-empty renderer id.');
	}
}

export function createUniversalHostBoundary(renderer: string): ((
	props: HostBoundaryProps,
	scope: Scope,
) => void) & {
	readonly [UNIVERSAL_BOUNDARY]: UniversalBoundaryMetadata;
} {
	assertRendererId(renderer);
	const boundary = ((props: HostBoundaryProps, scope: Scope) => {
		if (props.root.renderer !== renderer) {
			throw new Error(
				`Universal boundary ${JSON.stringify(renderer)} received root ${JSON.stringify(props.root.renderer)}.`,
			);
		}
		let component = props.component;
		let componentProps = props.props;
		if (props.children !== undefined) {
			const region = props.children;
			if (!isRendererRegion(region)) {
				throw new TypeError(
					`Universal boundary ${JSON.stringify(renderer)} expected compiler-owned renderer-region children.`,
				);
			}
			if (region.ownerRenderer !== 'dom' || region.childRenderer !== renderer) {
				throw new Error(
					`Universal boundary ${JSON.stringify(renderer)} cannot mount region ${JSON.stringify(region.ownerRenderer)} -> ${JSON.stringify(region.childRenderer)}.`,
				);
			}
			if (component !== undefined) {
				throw new Error(
					'A universal boundary cannot receive both component and renderer-region children.',
				);
			}
			component = region.component as UniversalComponent<any>;
			componentProps = region.props;
		}
		if (component === undefined) {
			throw new Error(
				`Universal boundary ${JSON.stringify(renderer)} requires a component or renderer-owned children.`,
			);
		}
		let state = boundaryStates.get(scope);
		const [, invalidate] = useDomState(0, BOUNDARY_INVALIDATE_SLOT);
		if (state === undefined) {
			let rootInvalidated = false;
			const owner: BoundaryOwner = {
				readContext<T>(context: UniversalContext<T>) {
					return readContextFromScope(scope, context as Context<T>);
				},
				invalidate() {
					rootInvalidated = true;
					invalidate((value) => value + 1);
				},
				consumeRootInvalidation() {
					const invalidated = rootInvalidated;
					rootInvalidated = false;
					return invalidated;
				},
			};
			state = {
				root: props.root as BoundaryRoot,
				owner,
				ownerCommitted: false,
				lifetimeCommitted: false,
				suspensionRetained: false,
				retryErrored: false,
				pending: null,
			};
			boundaryStates.set(scope, state);
			state.root.setBridge(owner);
		} else if (state.root !== props.root) {
			throw new Error('Changing the root owned by a mounted universal boundary is not supported.');
		}
		const retryingRetainedSuspension = state.suspensionRetained;
		let attempt: UniversalPreparedAttempt;
		let transitionAttempt = false;
		let projectedThenable: PromiseLike<unknown> | null = null;
		try {
			if (state.owner.consumeRootInvalidation()) {
				const preparation = state.root.__prepareBoundaryScheduled(component, componentProps);
				attempt = preparation.attempt;
				transitionAttempt = preparation.transition;
				projectedThenable = preparation.projectedThenable;
			} else {
				attempt = state.root.prepare(component, componentProps);
			}
		} catch (error) {
			if (retryingRetainedSuspension) state.retryErrored = true;
			if (!state.ownerCommitted) {
				boundaryStates.delete(scope);
				state.root.clearBridge(state.owner);
			}
			throw error;
		}
		state.pending = attempt;
		useDomLayoutEffect(
			() => {
				if (state!.pending !== attempt) return;
				try {
					if (attempt.status === 'prepared') attempt.commit();
					// Suspension commits the DOM owner's lifetime without accepting a
					// universal host batch. Retain its bridge so settlement can retry with
					// the same context and error owner.
					state!.ownerCommitted = true;
					state!.pending = null;
				} catch (error) {
					boundaryStates.delete(scope);
					state!.pending = null;
					try {
						state!.root.unmount();
					} finally {
						state!.root.clearBridge(state!.owner);
					}
					throw error;
				}
			},
			[attempt],
			BOUNDARY_COMMIT_SLOT,
		);
		// Host-root ownership must survive DOM Suspense/Activity deactivation.
		// Mark each attempt separately: a prepared attempt that reaches insertion
		// commit owns the root even if a later sibling suspends before layout. A
		// self-suspended attempt retains only its retry bridge; deleting that owner
		// before a successful retry must leave the still-uncommitted root reusable.
		useDomInsertionEffect(
			() => {
				if (attempt.status === 'prepared') {
					state!.lifetimeCommitted = true;
					state!.suspensionRetained = false;
				} else if (attempt.status === 'suspended') {
					state!.suspensionRetained = true;
				}
			},
			[attempt],
			BOUNDARY_ATTEMPT_LIFETIME_SLOT,
		);
		// Insertion effects stay connected while retained content is hidden and
		// clean up only on actual deletion, which is exactly the owner lifetime.
		useDomInsertionEffect(
			() => {
				return () => {
					// Resolve through the map defensively so a failed render can never
					// leave a newer owner bridge captured by this effect's first closure.
					const ownedState = boundaryStates.get(scope) ?? state!;
					const mustUnmount =
						ownedState.ownerCommitted || ownedState.lifetimeCommitted || ownedState.retryErrored;
					boundaryStates.delete(scope);
					ownedState.lifetimeCommitted = false;
					ownedState.suspensionRetained = false;
					ownedState.retryErrored = false;
					const pending = ownedState.pending;
					ownedState.pending = null;
					ownedState.root.__runCommitTasks([
						() => pending?.abort(),
						() => {
							if (mustUnmount) ownedState.root.unmount();
						},
						() => ownedState.root.clearBridge(ownedState.owner),
					]);
				};
			},
			[],
			BOUNDARY_LIFETIME_SLOT,
		);
		state.root.__scheduleMicrotask(() => {
			if (state!.pending !== attempt) return;
			state!.pending = null;
			state!.root.__runCommitTasks([
				() => attempt.abort(),
				() => {
					// Preserve either a prepared deletion lifetime or a suspended retry
					// bridge when insertion committed before layout was skipped. Only an
					// attempt with neither marker was abandoned before owning anything.
					if (!state!.ownerCommitted && !state!.lifetimeCommitted && !state!.suspensionRetained) {
						if (boundaryStates.get(scope) === state) boundaryStates.delete(scope);
						state!.root.clearBridge(state!.owner);
					}
				},
			]);
		});
		// A root-level suspension has no universal @pending arm of its own. Project
		// it through the DOM owner so the nearest authored DOM @pending boundary can
		// hide the Canvas shell and render its fallback. The queued abort above
		// releases the attempt transaction; an insertion-committed owner retains
		// its bridge so settlement retries through the DOM boundary.
		if (projectedThenable !== null) {
			useDomRendererThenable(projectedThenable);
		} else if (attempt.status === 'suspended' && !transitionAttempt) {
			useDomRendererThenable(attempt.thenable);
		}
	}) as ((props: HostBoundaryProps, scope: Scope) => void) & {
		readonly [UNIVERSAL_BOUNDARY]: UniversalBoundaryMetadata;
	};
	Object.defineProperty(boundary, UNIVERSAL_BOUNDARY, {
		value: Object.freeze({
			id: `dom->${renderer}`,
			ownerRenderer: 'dom',
			childRenderer: renderer,
			childrenProp: 'children',
		}),
	});
	return boundary;
}
