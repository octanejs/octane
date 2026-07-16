/**
 * Same-renderer Three portals.
 *
 * Component ownership and Octane context stay at the authored call site. Only
 * the universal host-placement domain is redirected to the borrowed Object3D.
 */
import * as THREE from 'three';
import {
	createPortal as createUniversalPortal,
	defineUniversalComponent,
	universalComponent,
	universalContext,
	useContext,
	useInsertionEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	type UniversalRenderable,
} from 'octane/universal';
import {
	createThreePortalTarget,
	createThreePortalTargetBinding,
	type ThreePortalTargetBinding,
} from './driver.js';
import type { ComputeFunction, EventManager } from './events.js';
import {
	createPortalStore,
	readRootStoreRenderSnapshot,
	RootStoreContext,
	RootStoreRenderSnapshotContext,
	updateCamera,
	type RootState,
	type RootStore,
	type RootStoreRenderSnapshot,
	type Size,
} from './store.js';

export type InjectState = Partial<
	Omit<RootState, 'events'> & {
		events?: {
			enabled?: boolean;
			priority?: number;
			compute?: ComputeFunction;
			connected?: unknown;
		};
	}
>;

interface PortalProps {
	readonly children: UniversalRenderable;
	readonly container: THREE.Object3D;
	readonly state?: InjectState;
}

interface PortalPlan {
	readonly parent: RootState;
	readonly inject: InjectState;
	readonly state: RootState;
	readonly view: RootStoreRenderSnapshot;
	readonly injectedKeys: ReadonlySet<string>;
	readonly injectedEventKeys: ReadonlySet<string>;
}

interface PortalLayer {
	readonly store: RootStore;
	readonly target: ThreePortalTargetBinding;
	readonly stage: (parent: RootState, state: InjectState) => PortalPlan;
	readonly commit: (plan: PortalPlan) => void;
}

const EMPTY_INJECT_STATE = Object.freeze({}) as InjectState;
const PORTAL_STATE = Symbol('octane.three.portal.state');
const PORTAL_STATE_COMMIT = Symbol('octane.three.portal.state-commit');
const PORTAL_LAYER = Symbol('octane.three.portal.layer');
const PORTAL_SUBSCRIPTION = Symbol('octane.three.portal.subscription');

function shallowEqual(left: object, right: object): boolean {
	const leftKeys = Object.keys(left);
	const rightKeys = Object.keys(right);
	if (leftKeys.length !== rightKeys.length) return false;
	return leftKeys.every(
		(key) =>
			Object.prototype.hasOwnProperty.call(right, key) &&
			Object.is((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]),
	);
}

function reuseShallow<T extends object>(previous: T, next: T): T {
	return shallowEqual(previous, next) ? previous : next;
}

function resetRemovedKeys(
	target: Record<string, unknown>,
	previousKeys: ReadonlySet<string>,
	next: Readonly<Record<string, unknown>>,
	fallback: Readonly<Record<string, unknown>>,
): void {
	for (const key of previousKeys) {
		if (Object.prototype.hasOwnProperty.call(next, key)) continue;
		if (Object.prototype.hasOwnProperty.call(fallback, key)) target[key] = fallback[key];
		else delete target[key];
	}
}

function getWorldMatrixSnapshot(object: THREE.Object3D): THREE.Matrix4 {
	if (object.matrixWorldAutoUpdate === false) return object.matrixWorld.clone();
	const local = object.matrixAutoUpdate
		? new THREE.Matrix4().compose(object.position, object.quaternion, object.scale)
		: object.matrix.clone();
	return object.parent === null ? local : getWorldMatrixSnapshot(object.parent).multiply(local);
}

/**
 * `Viewport.getCurrentViewport` asks its camera for a world position, which in
 * Three updates the camera and ancestor matrices. Derive against a detached
 * snapshot so a render that is later rejected cannot mutate caller-owned hosts.
 */
function snapshotCamera<T extends THREE.Camera>(camera: T): T {
	// Inheriting the read-only camera surface avoids Camera.clone(), which
	// recursively copies children and JSON-serializes userData. Only the fields
	// that getWorldPosition mutates need detached ownership here.
	const snapshot = Object.create(camera) as T;
	const world = getWorldMatrixSnapshot(camera);
	snapshot.parent = null;
	snapshot.matrixAutoUpdate = false;
	snapshot.matrixWorldAutoUpdate = true;
	snapshot.matrix = world.clone();
	snapshot.matrixWorld = world.clone();
	snapshot.matrixWorldInverse = camera.matrixWorldInverse.clone();
	return snapshot;
}

function createLayer(
	previousRoot: RootStore,
	container: THREE.Object3D,
	parentState: RootState,
	state: InjectState,
): PortalLayer {
	const { events: _events, size: _size, ...initialRest } = state;
	const raycaster = new THREE.Raycaster();
	const pointer = new THREE.Vector2();
	const target = createThreePortalTargetBinding(container);
	const store = createPortalStore({
		...parentState,
		...initialRest,
		// A managed portal target may be reconstructed without changing the
		// authored target handle. The driver advances the shared binding to the
		// accepted replacement, and subsequent parent-state mirrors retain it.
		scene: target.current as THREE.Scene,
	} as RootState);
	let injectedKeys = new Set<string>();
	let injectedEventKeys = new Set<string>();
	let cameraCommit:
		| {
				readonly camera: RootState['camera'];
				readonly width: number;
				readonly height: number;
				readonly manual: boolean | undefined;
		  }
		| undefined;
	const setEvents = (events: Partial<EventManager<any>>) => {
		store.setState((local) => {
			const next = { ...local.events, ...events } as EventManager<any>;
			return shallowEqual(local.events, next) ? local : { events: next };
		});
	};

	const stage = (parent: RootState, currentState: InjectState): PortalPlan => {
		const { events, size, ...rest } = currentState;
		const nextInjectedKeys = new Set(Object.keys(rest));
		const nextInjectedEventKeys = new Set(Object.keys(events ?? {}));
		const local = store.getState();
		const inherited = { ...parent, ...local } as RootState & Record<string, unknown>;
		resetRemovedKeys(
			inherited,
			injectedKeys,
			rest as Readonly<Record<string, unknown>>,
			parent as unknown as Readonly<Record<string, unknown>>,
		);
		Object.assign(inherited, rest);

		const localEvents = { ...local.events } as Record<string, unknown>;
		resetRemovedKeys(
			localEvents,
			injectedEventKeys,
			(events ?? {}) as Readonly<Record<string, unknown>>,
			parent.events as unknown as Readonly<Record<string, unknown>>,
		);
		const nextEvents = reuseShallow(local.events, {
			...parent.events,
			...localEvents,
			...events,
		} as EventManager<any>);
		const nextSize = reuseShallow(local.size, { ...parent.size, ...size } as Size);
		let viewport: Partial<RootState['viewport']> | undefined;
		if (inherited.camera != null && size !== undefined) {
			viewport = parent.viewport.getCurrentViewport(
				snapshotCamera(inherited.camera),
				new THREE.Vector3(),
				nextSize,
			);
		}
		const nextViewport = reuseShallow(local.viewport, {
			...parent.viewport,
			...viewport,
		});
		const candidate = {
			...inherited,
			set: local.set,
			get: local.get,
			scene: target.current as THREE.Scene,
			raycaster,
			pointer,
			mouse: pointer,
			previousRoot,
			events: nextEvents,
			size: nextSize,
			viewport: nextViewport,
			setEvents,
		} as RootState;
		const next = shallowEqual(local, candidate) ? local : candidate;
		return {
			parent,
			inject: currentState,
			state: next,
			view: { store, current: next },
			injectedKeys: nextInjectedKeys,
			injectedEventKeys: nextInjectedEventKeys,
		};
	};
	const commitCamera = (plan: PortalPlan) => {
		const camera = plan.state.camera;
		if (camera == null || plan.inject.size === undefined || camera === plan.parent.camera) {
			cameraCommit = undefined;
			return;
		}
		const size = {
			...plan.parent.size,
			...plan.inject.size,
		} as Size;
		if (
			cameraCommit?.camera === camera &&
			cameraCommit.width === size.width &&
			cameraCommit.height === size.height &&
			cameraCommit.manual === camera.manual
		) {
			return;
		}
		updateCamera(camera, size);
		cameraCommit = {
			camera,
			width: size.width,
			height: size.height,
			manual: camera.manual,
		};
	};
	const commit = (plan: PortalPlan) => {
		try {
			// The driver advances the binding during the accepted host commit.
			// The staged state is attempt-owned, so reasserting that target here
			// cannot leak through a render that preparation rejects.
			plan.state.scene = target.current as THREE.Scene;
			commitCamera(plan);
			if (store.getState() !== plan.state) store.setState(plan.state, true);
			injectedKeys = new Set(plan.injectedKeys);
			injectedEventKeys = new Set(plan.injectedEventKeys);
		} finally {
			plan.view.current = null;
		}
	};

	// A new layer has no previously accepted state that can be exposed. Seed its
	// private store during construction so imperative `useStore().getState()`
	// reads are complete even before the first accepted insertion commit. Camera
	// mutations remain deferred until acceptance.
	const initialPlan = stage(parentState, state);
	initialPlan.state.scene = target.current as THREE.Scene;
	store.setState(initialPlan.state, true);
	injectedKeys = new Set(initialPlan.injectedKeys);
	injectedEventKeys = new Set(initialPlan.injectedEventKeys);
	initialPlan.view.current = null;

	return { store, target, stage, commit };
}

const Portal = defineUniversalComponent<PortalProps>('three', (props) => {
	if (props.container?.isObject3D !== true) {
		throw new TypeError('@octanejs/three: createPortal target must be a Three Object3D.');
	}
	// Context lookup itself does not subscribe to state; portal children select
	// from the enclave store they actually use.
	const activeStore = useContext(RootStoreContext);
	if (activeStore === null) {
		throw new Error('R3F: createPortal can only be used within the Canvas component!');
	}
	const parentView = useContext(RootStoreRenderSnapshotContext);
	const parentState = readRootStoreRenderSnapshot(activeStore, parentView);
	const state = props.state ?? EMPTY_INJECT_STATE;
	const stateRef = useRef<InjectState>(state, PORTAL_STATE);
	const layer = useMemo(
		() => createLayer(activeStore, props.container, parentState, state),
		[activeStore, props.container],
		PORTAL_LAYER,
	);
	const plan = layer.stage(parentState, state);
	useInsertionEffect(
		() => {
			layer.commit(plan);
			stateRef.current = state;
		},
		null,
		PORTAL_STATE_COMMIT,
	);
	useLayoutEffect(
		() => {
			return activeStore.subscribe((parent) => {
				layer.commit(layer.stage(parent, stateRef.current));
			});
		},
		[activeStore, layer],
		PORTAL_SUBSCRIPTION,
	);

	return universalContext(RootStoreContext, layer.store, () =>
		universalContext(RootStoreRenderSnapshotContext, plan.view, () =>
			createUniversalPortal(
				props.children,
				createThreePortalTarget(props.container, layer.store, layer.target),
			),
		),
	);
});

/** Render Three children into a borrowed Object3D with an isolated state layer. */
export function createPortal(
	children: UniversalRenderable,
	container: THREE.Object3D,
	state?: InjectState,
): UniversalRenderable {
	return universalComponent('three', Portal, { children, container, state });
}
