/**
 * Renderer-neutral root state for the Three host.
 *
 * The state shape follows React Three Fiber 9.6.1, but the callable binding is
 * built on Octane's universal hooks so it is safe inside `*.three.tsrx`
 * components. Zustand remains the framework-neutral storage primitive.
 */
import * as THREE from 'three';
import {
	createContext,
	useContext,
	useRef,
	useSyncExternalStore,
	withSlot,
} from 'octane/universal';
import { createStore as createVanillaStore, type StoreApi } from 'zustand/vanilla';
import type {
	DomEvent,
	EventManager,
	Intersection,
	PointerCaptureTarget,
	ThreeEvent,
} from './events.js';

export type { EventManager } from './events.js';

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
	hovered: Map<string, ThreeEvent<DomEvent>>;
	subscribers: Subscription[];
	capturedMap: Map<number, Map<THREE.Object3D, PointerCaptureTarget>>;
	initialClick: [x: number, y: number];
	initialHits: THREE.Object3D[];
	lastEvent: { current: DomEvent | null };
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

interface PointerCaptureIdentity {
	eventObject: THREE.Object3D;
	intersection: Intersection;
	pointerIds: Set<number>;
}

const POINTER_CAPTURE_IDENTITIES = new WeakMap<object, PointerCaptureIdentity>();
const ACTIVE_POINTER_CAPTURE_IDENTITIES = new WeakMap<
	THREE.Object3D,
	Set<PointerCaptureIdentity>
>();
const POINTER_CAPTURE_TARGET_IDENTITIES = new WeakMap<
	PointerCaptureTarget,
	PointerCaptureIdentity
>();

/** Create the mutable identity cell used by an event's pointer-capture facade. */
export function createPointerCaptureIdentity(intersection: Intersection): PointerCaptureIdentity {
	return { eventObject: intersection.eventObject, intersection, pointerIds: new Set() };
}

/** Associate a public capture facade with its renderer-owned identity cell. */
export function registerPointerCaptureFacade(
	facade: object,
	identity: PointerCaptureIdentity,
): void {
	POINTER_CAPTURE_IDENTITIES.set(facade, identity);
}

export function makeIntersectionId(
	event: Pick<Intersection, 'eventObject' | 'object' | 'index' | 'instanceId'>,
): string {
	return `${(event.eventObject ?? event.object).uuid}/${event.index}/${event.instanceId}`;
}

function replaceIntersectionObject(
	intersection: Intersection,
	previous: THREE.Object3D,
	next: THREE.Object3D,
): Intersection {
	const object = intersection.object === previous ? next : intersection.object;
	const eventObject = intersection.eventObject === previous ? next : intersection.eventObject;
	if (object === intersection.object && eventObject === intersection.eventObject)
		return intersection;
	return { ...intersection, object, eventObject };
}

function pointerCaptureIdentityObjects(identity: PointerCaptureIdentity): Set<THREE.Object3D> {
	return new Set([identity.eventObject, identity.intersection.object]);
}

function indexPointerCaptureIdentity(identity: PointerCaptureIdentity): void {
	if (identity.pointerIds.size === 0) return;
	for (const object of pointerCaptureIdentityObjects(identity)) {
		const identities = ACTIVE_POINTER_CAPTURE_IDENTITIES.get(object);
		if (identities === undefined) {
			ACTIVE_POINTER_CAPTURE_IDENTITIES.set(object, new Set([identity]));
		} else {
			identities.add(identity);
		}
	}
}

function unindexPointerCaptureIdentity(identity: PointerCaptureIdentity): void {
	for (const object of pointerCaptureIdentityObjects(identity)) {
		const identities = ACTIVE_POINTER_CAPTURE_IDENTITIES.get(object);
		if (identities === undefined) continue;
		identities.delete(identity);
		if (identities.size === 0) ACTIVE_POINTER_CAPTURE_IDENTITIES.delete(object);
	}
}

function activatePointerCaptureIdentity(
	capture: PointerCaptureTarget,
	identity: PointerCaptureIdentity,
	pointerId: number,
): void {
	POINTER_CAPTURE_TARGET_IDENTITIES.set(capture, identity);
	if (identity.pointerIds.has(pointerId)) return;
	identity.pointerIds.add(pointerId);
	if (identity.pointerIds.size === 1) indexPointerCaptureIdentity(identity);
}

function deactivatePointerCaptureIdentity(capture: PointerCaptureTarget, pointerId: number): void {
	const identity = POINTER_CAPTURE_TARGET_IDENTITIES.get(capture);
	if (identity === undefined || !identity.pointerIds.delete(pointerId)) return;
	if (identity.pointerIds.size === 0) unindexPointerCaptureIdentity(identity);
}

function transferPointerCaptureIdentity(
	identity: PointerCaptureIdentity,
	previous: THREE.Object3D,
	next: THREE.Object3D,
): void {
	const intersection = replaceIntersectionObject(identity.intersection, previous, next);
	const eventObject = identity.eventObject === previous ? next : identity.eventObject;
	if (intersection === identity.intersection && eventObject === identity.eventObject) return;

	const active = identity.pointerIds.size > 0;
	if (active) unindexPointerCaptureIdentity(identity);
	identity.eventObject = eventObject;
	identity.intersection = intersection;
	if (active) indexPointerCaptureIdentity(identity);
}

function transferActivePointerCaptureIdentities(
	previous: THREE.Object3D,
	next: THREE.Object3D,
): void {
	const identities = ACTIVE_POINTER_CAPTURE_IDENTITIES.get(previous);
	if (identities === undefined) return;
	for (const identity of [...identities]) {
		transferPointerCaptureIdentity(identity, previous, next);
	}
}

function transferPointerCaptureEventIdentity(
	event: ThreeEvent<DomEvent>,
	previous: THREE.Object3D,
	next: THREE.Object3D,
): void {
	for (const facade of [event.target, event.currentTarget]) {
		const identity = POINTER_CAPTURE_IDENTITIES.get(facade);
		if (identity === undefined) continue;
		transferPointerCaptureIdentity(identity, previous, next);
	}
}

export function setInternalPointerCapture(
	capturedMap: Map<number, Map<THREE.Object3D, PointerCaptureTarget>>,
	object: THREE.Object3D,
	capture: PointerCaptureTarget,
	identity: PointerCaptureIdentity,
	pointerId: number,
): void {
	let captures = capturedMap.get(pointerId);
	if (captures === undefined) {
		captures = new Map();
		capturedMap.set(pointerId, captures);
	}
	const previous = captures.get(object);
	if (previous !== undefined) deactivatePointerCaptureIdentity(previous, pointerId);
	captures.set(object, capture);
	activatePointerCaptureIdentity(capture, identity, pointerId);
}

export function releaseInternalPointerCapture(
	capturedMap: Map<number, Map<THREE.Object3D, PointerCaptureTarget>>,
	object: THREE.Object3D,
	captures: Map<THREE.Object3D, PointerCaptureTarget>,
	pointerId: number,
): void {
	const capture = captures.get(object);
	if (capture === undefined) return;
	deactivatePointerCaptureIdentity(capture, pointerId);
	captures.delete(object);
	if (captures.size !== 0) return;
	capturedMap.delete(pointerId);
	capture.target.releasePointerCapture(pointerId);
}

export function clearInternalPointerCaptures(
	capturedMap: Map<number, Map<THREE.Object3D, PointerCaptureTarget>>,
	pointerId: number,
): void {
	const captures = capturedMap.get(pointerId);
	if (captures === undefined) return;
	for (const capture of captures.values()) {
		deactivatePointerCaptureIdentity(capture, pointerId);
	}
	capturedMap.delete(pointerId);
}

/** Transfer every observable interaction identity during an accepted reconstruction. */
export function swapInteractivity(
	store: RootStore,
	previous: THREE.Object3D,
	next: THREE.Object3D,
): void {
	const { internal } = store.getState();
	for (let index = 0; index < internal.interaction.length; index++) {
		if (internal.interaction[index] === previous) internal.interaction[index] = next;
	}
	for (let index = 0; index < internal.initialHits.length; index++) {
		if (internal.initialHits[index] === previous) internal.initialHits[index] = next;
	}
	transferActivePointerCaptureIdentities(previous, next);
	for (const [key, hovered] of [...internal.hovered]) {
		const replaced = replaceIntersectionObject(hovered, previous, next);
		const intersections = hovered.intersections.map((intersection) =>
			replaceIntersectionObject(intersection, previous, next),
		);
		const nestedChanged = intersections.some(
			(intersection, index) => intersection !== hovered.intersections[index],
		);
		if (replaced === hovered && !nestedChanged) continue;

		transferPointerCaptureEventIdentity(hovered, previous, next);
		const nextHovered = { ...replaced, intersections } as ThreeEvent<DomEvent>;
		internal.hovered.delete(key);
		internal.hovered.set(makeIntersectionId(nextHovered), nextHovered);
	}
	for (const [pointerId, captures] of internal.capturedMap) {
		for (const [eventObject, capture] of [...captures]) {
			const nextEventObject = eventObject === previous ? next : eventObject;
			const intersection = replaceIntersectionObject(capture.intersection, previous, next);
			if (nextEventObject === eventObject && intersection === capture.intersection) continue;

			const nextCapture = { ...capture, intersection };
			const identity = POINTER_CAPTURE_TARGET_IDENTITIES.get(capture);
			if (identity !== undefined) POINTER_CAPTURE_TARGET_IDENTITIES.set(nextCapture, identity);
			captures.delete(eventObject);
			const collision = captures.get(nextEventObject);
			if (collision !== undefined) deactivatePointerCaptureIdentity(collision, pointerId);
			captures.set(nextEventObject, nextCapture);
		}
	}
}

/** Remove all interaction state for an object that left the accepted host tree. */
export function removeInteractivity(store: RootStore, object: THREE.Object3D): void {
	const { internal } = store.getState();
	internal.interaction = internal.interaction.filter((candidate) => candidate !== object);
	internal.initialHits = internal.initialHits.filter((candidate) => candidate !== object);
	for (const [key, hovered] of internal.hovered) {
		if (hovered.eventObject === object || hovered.object === object) internal.hovered.delete(key);
	}
	for (const [pointerId, captures] of internal.capturedMap) {
		for (const [eventObject, capture] of [...captures]) {
			if (
				eventObject === object ||
				capture.intersection.object === object ||
				capture.intersection.eventObject === object
			) {
				releaseInternalPointerCapture(internal.capturedMap, eventObject, captures, pointerId);
			}
		}
	}
}

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

/**
 * Render-attempt-local state exposed by a portal without mutating its live
 * store. An accepted portal commit clears `current`, after which consumers
 * resume reading the store itself.
 *
 * This is package-private plumbing for the Three renderer. It is exported from
 * this module so the portal and hook implementations can share it, but it is
 * intentionally absent from the package's public barrel.
 */
export interface RootStoreRenderSnapshot {
	readonly store: RootStore;
	current: RootState | null;
}

export const RootStoreRenderSnapshotContext = createContext<RootStoreRenderSnapshot | null>(null);

export function readRootStoreRenderSnapshot(
	store: RootStore,
	snapshot: RootStoreRenderSnapshot | null,
): RootState {
	return snapshot?.store === store && snapshot.current !== null
		? snapshot.current
		: store.getState();
}

/** Universal-hook selector used by the callable store and `useThree`. */
export function useRootStoreSelector<T>(
	store: RootStore,
	selector: (state: RootState) => T,
	equalityFn: (previous: T, next: T) => boolean = Object.is,
	slot?: unknown,
): T {
	const renderSnapshot = useContext(RootStoreRenderSnapshotContext);
	const run = (nested: boolean): T => {
		const cell = nested
			? useRef<SelectionCell<T>>({ initialized: false, value: undefined as T }, 'selection')
			: useRef<SelectionCell<T>>({ initialized: false, value: undefined as T });
		const snapshot = () => {
			const next = selector(readRootStoreRenderSnapshot(store, renderSnapshot));
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

function bindRootStore(api: StoreApi<RootState>): RootStore {
	let store!: RootStore;
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
	return store;
}

/** Create an isolated callable store whose initial state is supplied by a portal layer. */
export function createPortalStore(initialState: RootState): RootStore {
	let store!: RootStore;
	const api = createVanillaStore<RootState>()((set, get) => ({
		...initialState,
		set,
		get,
	}));
	store = bindRootStore(api);
	return store;
}

/** Walk a portal chain to the one root that owns scheduling and native events. */
export function getInitialRootStore(store: RootStore): RootStore {
	const seen = new Set<RootStore>();
	let current = store;
	while (current.getState().previousRoot !== undefined) {
		if (seen.has(current)) {
			throw new Error('@octanejs/three: Portal store ancestry contains a cycle.');
		}
		seen.add(current);
		current = current.getState().previousRoot!;
	}
	return current;
}

/** Create the callable R3F-shaped store around Zustand's vanilla API. */
export function createRootStore(invalidate: Invalidate, advance: Advance): RootStore {
	let performanceTimeout: ReturnType<typeof setTimeout> | undefined;
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
			events: { priority: 1, enabled: true, connected: undefined },
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

	const store = bindRootStore(api);

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
