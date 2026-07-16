/**
 * Renderer-neutral root state for the Three host.
 *
 * The state shape follows React Three Fiber 9.6.1, but the callable binding is
 * built on Octane's universal hooks so it is safe inside `*.three.tsrx`
 * components. Zustand remains the framework-neutral storage primitive.
 */
import * as THREE from 'three';
import { createContext, useRef, useSyncExternalStore, withSlot } from 'octane/universal';
import { createStore as createVanillaStore, type StoreApi } from 'zustand/vanilla';

export type Dpr = number | readonly [min: number, max: number];

export interface Size {
	width: number;
	height: number;
	top: number;
	left: number;
}

export type Frameloop = 'always' | 'demand' | 'never';

export interface Viewport extends Size {
	/** The first configured pixel ratio. */
	initialDpr: number;
	/** The current pixel ratio. */
	dpr: number;
	/** Pixels per viewport unit. */
	factor: number;
	/** Camera distance from the viewport target. */
	distance: number;
	/** Pixel width divided by pixel height. */
	aspect: number;
	getCurrentViewport(
		camera?: Camera,
		target?: THREE.Vector3 | Parameters<THREE.Vector3['set']>,
		size?: Size,
	): Omit<Viewport, 'dpr' | 'initialDpr' | 'getCurrentViewport'>;
}

export type Camera = (THREE.OrthographicCamera | THREE.PerspectiveCamera) & {
	manual?: boolean;
};

/** Minimum renderer contract used by the root and frame loop. */
export interface Renderer {
	render(scene: THREE.Scene, camera: THREE.Camera): unknown;
	setPixelRatio?(dpr: number): void;
	setSize?(width: number, height: number, updateStyle?: boolean): void;
	dispose?(): void;
	forceContextLoss?(): void;
	domElement?: unknown;
	renderLists?: { dispose?(): void };
	shadowMap?: {
		enabled: boolean;
		type: THREE.ShadowMapType;
		needsUpdate?: boolean;
		[key: string]: unknown;
	};
	xr?: {
		enabled?: boolean;
		isPresenting?: boolean;
		setAnimationLoop?(callback: ((timestamp: number, frame?: XRFrame) => void) | null): void;
		addEventListener?(type: string, callback: () => void): void;
		removeEventListener?(type: string, callback: () => void): void;
	};
	outputColorSpace?: THREE.ColorSpace;
	toneMapping?: THREE.ToneMapping;
	[key: string]: any;
}

export interface EventManager<TTarget = unknown> {
	priority: number;
	enabled: boolean;
	connected: TTarget | false;
	handlers?: Readonly<Record<string, unknown>>;
	connect?(target: TTarget): void;
	disconnect?(): void;
	[key: string]: unknown;
}

export interface XRManager {
	connect(): void;
	disconnect(): void;
}

export type RenderCallback = (state: RootState, delta: number, frame?: XRFrame) => void;

export interface Subscription {
	ref: { current: RenderCallback };
	priority: number;
	store: RootStore;
}

export interface Performance {
	current: number;
	min: number;
	max: number;
	debounce: number;
	regress(): void;
}

export interface InternalState {
	interaction: THREE.Object3D[];
	hovered: Map<string, unknown>;
	subscribers: Subscription[];
	capturedMap: Map<number, Map<THREE.Object3D, unknown>>;
	initialClick: [x: number, y: number];
	initialHits: THREE.Object3D[];
	lastEvent: { current: unknown | null };
	active: boolean;
	priority: number;
	frames: number;
	subscribe(ref: { current: RenderCallback }, priority: number, store: RootStore): () => void;
}

export interface RootState {
	set: StoreApi<RootState>['setState'];
	get: StoreApi<RootState>['getState'];
	gl: Renderer;
	/** Future-facing name for the active rendering object. */
	renderer: Renderer;
	camera: Camera;
	scene: THREE.Scene;
	raycaster: THREE.Raycaster;
	clock: THREE.Clock;
	events: EventManager<any>;
	xr: XRManager;
	controls: THREE.EventDispatcher | null;
	pointer: THREE.Vector2;
	/** @deprecated Use `pointer`. */
	mouse: THREE.Vector2;
	legacy: boolean;
	linear: boolean;
	flat: boolean;
	frameloop: Frameloop;
	performance: Performance;
	size: Size;
	viewport: Viewport;
	invalidate(frames?: number): void;
	advance(timestamp: number, runGlobalEffects?: boolean): void;
	setEvents(events: Partial<EventManager<any>>): void;
	setSize(width: number, height: number, top?: number, left?: number): void;
	setDpr(dpr: Dpr): void;
	setFrameloop(frameloop?: Frameloop): void;
	onPointerMissed?: (event: MouseEvent) => void;
	previousRoot?: RootStore;
	internal: InternalState;
}

/**
 * R3F-shaped root store.
 *
 * The callable selector form is retained for upstream compatibility, but a
 * call through a dynamic value cannot receive an Octane compiler slot. Keep
 * such calls unconditional and ordered, or prefer compiler-visible
 * `useStore(selector)` / `useThree(selector)` in authored scene components.
 */
export type RootStore = {
	(): RootState;
	<T>(selector: (state: RootState) => T, equalityFn?: (previous: T, next: T) => boolean): T;
} & StoreApi<RootState>;

type Invalidate = (state?: RootState, frames?: number) => void;
type Advance = (
	timestamp: number,
	runGlobalEffects?: boolean,
	state?: RootState,
	frame?: XRFrame,
) => void;

const identity = <T>(value: T): T => value;
const STORE_CLEANUPS = new WeakMap<RootStore, () => void>();
const ROOT_OBJECT_STORES = new WeakMap<object, RootStore>();

export function associateRootObject(object: object, store: RootStore): void {
	ROOT_OBJECT_STORES.set(object, store);
}

export function dissociateRootObject(object: object, store: RootStore): void {
	if (ROOT_OBJECT_STORES.get(object) === store) ROOT_OBJECT_STORES.delete(object);
}

export function getRootObjectStore(object: object): RootStore | undefined {
	return ROOT_OBJECT_STORES.get(object);
}

function isOrthographicCamera(camera: Camera): camera is THREE.OrthographicCamera & {
	manual?: boolean;
} {
	return (camera as THREE.OrthographicCamera | null)?.isOrthographicCamera === true;
}

export function calculateDpr(dpr: Dpr): number {
	const target = typeof window === 'undefined' ? 1 : (window.devicePixelRatio ?? 2);
	return typeof dpr === 'number' ? dpr : Math.min(Math.max(dpr[0], target), dpr[1]);
}

export function updateCamera(camera: Camera | null | undefined, size: Size): void {
	if (camera == null || camera.manual === true) return;
	if (isOrthographicCamera(camera)) {
		camera.left = size.width / -2;
		camera.right = size.width / 2;
		camera.top = size.height / 2;
		camera.bottom = size.height / -2;
	} else {
		camera.aspect = size.height === 0 ? 0 : size.width / size.height;
	}
	camera.updateProjectionMatrix();
}

interface SelectionCell<T> {
	initialized: boolean;
	value: T;
}

/** Universal-hook selector used by the callable store and `useThree`. */
export function useRootStoreSelector<T>(
	store: RootStore,
	selector: (state: RootState) => T,
	equalityFn: (previous: T, next: T) => boolean = Object.is,
	slot?: unknown,
): T {
	const run = (nested: boolean): T => {
		const cell = nested
			? useRef<SelectionCell<T>>({ initialized: false, value: undefined as T }, 'selection')
			: useRef<SelectionCell<T>>({ initialized: false, value: undefined as T });
		const snapshot = () => {
			const next = selector(store.getState());
			if (!cell.current.initialized || !equalityFn(cell.current.value, next)) {
				cell.current = { initialized: true, value: next };
			}
			return cell.current.value;
		};
		return nested
			? useSyncExternalStore(store.subscribe, snapshot, snapshot, 'subscription')
			: useSyncExternalStore(store.subscribe, snapshot, snapshot);
	};
	return slot === undefined ? run(false) : withSlot(slot, () => run(true));
}

/** Create the callable R3F-shaped store around Zustand's vanilla API. */
export function createRootStore(invalidate: Invalidate, advance: Advance): RootStore {
	let performanceTimeout: ReturnType<typeof setTimeout> | undefined;
	let store!: RootStore;
	const api = createVanillaStore<RootState>()((set, get) => {
		const position = new THREE.Vector3();
		const defaultTarget = new THREE.Vector3();
		const tempTarget = new THREE.Vector3();
		const pointer = new THREE.Vector2();

		const getCurrentViewport: Viewport['getCurrentViewport'] = (
			camera = get().camera,
			target = defaultTarget,
			size = get().size,
		) => {
			const { width, height, top, left } = size;
			const aspect = height === 0 ? 0 : width / height;
			if ((target as THREE.Vector3).isVector3) tempTarget.copy(target as THREE.Vector3);
			else tempTarget.set(...(target as Parameters<THREE.Vector3['set']>));
			const distance =
				camera == null ? 0 : camera.getWorldPosition(position).distanceTo(tempTarget);
			if (camera != null && isOrthographicCamera(camera)) {
				return {
					width: camera.zoom === 0 ? 0 : width / camera.zoom,
					height: camera.zoom === 0 ? 0 : height / camera.zoom,
					top,
					left,
					factor: 1,
					distance,
					aspect,
				};
			}
			const fov = camera == null ? 0 : (camera.fov * Math.PI) / 180;
			const viewportHeight = 2 * Math.tan(fov / 2) * distance;
			const viewportWidth = height === 0 ? 0 : viewportHeight * (width / height);
			return {
				width: viewportWidth,
				height: viewportHeight,
				top,
				left,
				factor: viewportWidth === 0 ? 0 : width / viewportWidth,
				distance,
				aspect,
			};
		};

		const state: RootState = {
			set,
			get,
			gl: null as unknown as Renderer,
			renderer: null as unknown as Renderer,
			camera: null as unknown as Camera,
			scene: null as unknown as THREE.Scene,
			raycaster: null as unknown as THREE.Raycaster,
			clock: new THREE.Clock(),
			events: { priority: 1, enabled: true, connected: false },
			xr: { connect() {}, disconnect() {} },
			controls: null,
			pointer,
			mouse: pointer,
			legacy: false,
			linear: false,
			flat: false,
			frameloop: 'always',
			performance: {
				current: 1,
				min: 0.5,
				max: 1,
				debounce: 200,
				regress() {
					const current = get();
					if (performanceTimeout !== undefined) clearTimeout(performanceTimeout);
					if (current.performance.current !== current.performance.min) {
						set((value) => ({
							performance: { ...value.performance, current: value.performance.min },
						}));
					}
					performanceTimeout = setTimeout(() => {
						set((value) => ({
							performance: { ...value.performance, current: value.performance.max },
						}));
					}, current.performance.debounce);
				},
			},
			size: { width: 0, height: 0, top: 0, left: 0 },
			viewport: {
				initialDpr: 0,
				dpr: 0,
				width: 0,
				height: 0,
				top: 0,
				left: 0,
				factor: 0,
				distance: 0,
				aspect: 0,
				getCurrentViewport,
			},
			invalidate: (frames = 1) => invalidate(get(), frames),
			advance: (timestamp, runGlobalEffects) => advance(timestamp, runGlobalEffects, get()),
			setEvents: (events) => set((value) => ({ events: { ...value.events, ...events } })),
			setSize: (width, height, top = 0, left = 0) => {
				const size = { width, height, top, left };
				set((value) => ({
					size,
					viewport: {
						...value.viewport,
						...getCurrentViewport(value.camera, defaultTarget, size),
					},
				}));
			},
			setDpr: (dpr) =>
				set((value) => {
					const resolved = calculateDpr(dpr);
					return {
						viewport: {
							...value.viewport,
							dpr: resolved,
							initialDpr: value.viewport.initialDpr || resolved,
						},
					};
				}),
			setFrameloop: (frameloop = 'always') => {
				const clock = get().clock;
				clock.stop();
				clock.elapsedTime = 0;
				if (frameloop !== 'never') {
					clock.start();
					clock.elapsedTime = 0;
				}
				set({ frameloop });
			},
			previousRoot: undefined,
			internal: {
				interaction: [],
				hovered: new Map(),
				subscribers: [],
				capturedMap: new Map(),
				initialClick: [0, 0],
				initialHits: [],
				lastEvent: { current: null },
				active: false,
				priority: 0,
				frames: 0,
				subscribe(ref, priority, subscriptionStore) {
					const internal = get().internal;
					if (priority > 0) internal.priority++;
					internal.subscribers = [
						...internal.subscribers,
						{ ref, priority, store: subscriptionStore },
					].sort((left, right) => left.priority - right.priority);
					return () => {
						const current = get().internal;
						if (priority > 0) current.priority--;
						current.subscribers = current.subscribers.filter(
							(subscription) => subscription.ref !== ref,
						);
					};
				},
			},
		};
		return state;
	});

	const bound = ((...args: unknown[]) => {
		const tail = args.at(-1);
		const userArgs = typeof tail === 'symbol' ? args.slice(0, -1) : args;
		const selector = (typeof userArgs[0] === 'function' ? userArgs[0] : identity) as (
			state: RootState,
		) => unknown;
		const equalityFn = (typeof userArgs[1] === 'function' ? userArgs[1] : Object.is) as (
			previous: unknown,
			next: unknown,
		) => boolean;
		return useRootStoreSelector(
			store,
			selector,
			equalityFn,
			typeof tail === 'symbol' ? tail : undefined,
		);
	}) as RootStore;
	Object.assign(bound, api);
	store = bound;

	let oldSize = store.getState().size;
	let oldDpr = store.getState().viewport.dpr;
	let oldCamera = store.getState().camera;
	const unsubscribeRenderer = store.subscribe((state) => {
		const { camera, size, viewport, gl } = state;
		if (size.width !== oldSize.width || size.height !== oldSize.height || viewport.dpr !== oldDpr) {
			oldSize = size;
			oldDpr = viewport.dpr;
			updateCamera(camera, size);
			if (gl != null && viewport.dpr > 0) gl.setPixelRatio?.(viewport.dpr);
			if (gl != null) {
				const updateStyle =
					typeof HTMLCanvasElement !== 'undefined' && gl.domElement instanceof HTMLCanvasElement;
				gl.setSize?.(size.width, size.height, updateStyle);
			}
		}
		if (camera !== oldCamera) {
			oldCamera = camera;
			state.set((value) => ({
				viewport: {
					...value.viewport,
					...value.viewport.getCurrentViewport(camera),
				},
			}));
		}
	});
	const unsubscribeInvalidate = store.subscribe((state) => invalidate(state));
	STORE_CLEANUPS.set(store, () => {
		unsubscribeRenderer();
		unsubscribeInvalidate();
		if (performanceTimeout !== undefined) clearTimeout(performanceTimeout);
	});
	return store;
}

export function destroyRootStore(store: RootStore): void {
	STORE_CLEANUPS.get(store)?.();
	STORE_CLEANUPS.delete(store);
	const state = store.getState();
	state.clock.stop();
	state.internal.active = false;
	state.internal.subscribers.length = 0;
	state.internal.priority = 0;
	state.internal.frames = 0;
}

export const RootStoreContext = createContext<RootStore | null>(null);
