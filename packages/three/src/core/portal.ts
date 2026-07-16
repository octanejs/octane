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
	RootStoreContext,
	updateCamera,
	type RootState,
	type RootStore,
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

interface PortalOptions {
	readonly events: InjectState['events'];
	readonly size: Partial<Size> | undefined;
}

interface PortalLayer {
	readonly store: RootStore;
	readonly target: ThreePortalTargetBinding;
	readonly sync: (parent: RootState, options: PortalOptions) => void;
	readonly commitCamera: (parent: RootState, options: PortalOptions) => void;
}

const PORTAL_OPTIONS = Symbol('octane.three.portal.options');
const PORTAL_OPTIONS_COMMIT = Symbol('octane.three.portal.options-commit');
const PORTAL_LAYER = Symbol('octane.three.portal.layer');
const PORTAL_CAMERA_COMMIT = Symbol('octane.three.portal.camera-commit');
const PORTAL_SUBSCRIPTION = Symbol('octane.three.portal.subscription');

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
	state: InjectState,
	options: PortalOptions,
): PortalLayer {
	const { events: _events, size: _size, ...rest } = state;
	const raycaster = new THREE.Raycaster();
	const pointer = new THREE.Vector2();
	const target = createThreePortalTargetBinding(container);
	const store = createPortalStore({
		...previousRoot.getState(),
		...rest,
		// A managed portal target may be reconstructed without changing the
		// authored target handle. The driver advances the shared binding to the
		// accepted replacement, and subsequent parent-state mirrors retain it.
		scene: target.current as THREE.Scene,
	} as RootState);

	const sync = (parent: RootState, currentOptions: PortalOptions) => {
		store.setState((local) => {
			let viewport: Partial<RootState['viewport']> | undefined;
			if (local.camera != null && currentOptions.size !== undefined) {
				const size = {
					...parent.size,
					...currentOptions.size,
				} as Size;
				viewport = parent.viewport.getCurrentViewport(
					snapshotCamera(local.camera),
					new THREE.Vector3(),
					size,
				);
			}
			return {
				...parent,
				...local,
				scene: target.current as THREE.Scene,
				raycaster,
				pointer,
				mouse: pointer,
				previousRoot,
				events: {
					...parent.events,
					...local.events,
					...currentOptions.events,
				} as EventManager<any>,
				size: {
					...parent.size,
					...currentOptions.size,
				},
				viewport: {
					...parent.viewport,
					...viewport,
				},
				setEvents(events: Partial<EventManager<any>>) {
					store.setState((value) => ({
						events: { ...value.events, ...events },
					}));
				},
			};
		});
	};
	const commitCamera = (parent: RootState, currentOptions: PortalOptions) => {
		const local = store.getState();
		if (
			local.camera == null ||
			currentOptions.size === undefined ||
			local.camera === parent.camera
		) {
			return;
		}
		updateCamera(local.camera, {
			...parent.size,
			...currentOptions.size,
		} as Size);
	};

	sync(previousRoot.getState(), options);
	return { store, target, sync, commitCamera };
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
	const options = { events: props.state?.events, size: props.state?.size };
	const optionsRef = useRef<PortalOptions>(options, PORTAL_OPTIONS);
	useInsertionEffect(
		() => {
			optionsRef.current = options;
		},
		[options.events, options.size],
		PORTAL_OPTIONS_COMMIT,
	);
	const layer = useMemo(
		() => createLayer(activeStore, props.container, props.state ?? {}, options),
		[activeStore, props.container],
		PORTAL_LAYER,
	);
	useInsertionEffect(
		() => {
			layer.commitCamera(activeStore.getState(), optionsRef.current);
		},
		[activeStore, layer],
		PORTAL_CAMERA_COMMIT,
	);
	useLayoutEffect(
		() => {
			return activeStore.subscribe((state) => {
				layer.sync(state, optionsRef.current);
				layer.commitCamera(state, optionsRef.current);
			});
		},
		[activeStore, layer],
		PORTAL_SUBSCRIPTION,
	);

	return universalContext(RootStoreContext, layer.store, () =>
		createUniversalPortal(
			props.children,
			createThreePortalTarget(props.container, layer.store, layer.target),
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
