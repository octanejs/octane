/**
 * Renderer-neutral ray and pointer event handling for the Three host.
 *
 * The picking, bubbling, hover, miss, propagation, and capture behavior follows
 * React Three Fiber 9.6.1. Listener invocation goes through Octane's universal
 * event scope so one native event observes one accepted listener table and
 * schedules at most one outer flush.
 */
import * as THREE from 'three';
import type { UniversalEventListenerDescriptor, UniversalEventPriority } from 'octane/universal';
import {
	dispatchThreeEvent,
	getThreeHostEventPriority,
	getThreeEventListener,
	getThreeEventStore,
	hasThreeEventListeners,
	isThreeEventHitLive,
	runThreeEventScope,
} from './driver.js';
import {
	clearInternalPointerCaptures,
	createPointerCaptureIdentity,
	makeIntersectionId,
	registerPointerCaptureFacade,
	releaseInternalPointerCapture,
	setInternalPointerCapture,
	type RootState,
	type RootStore,
} from './store.js';

type NonFunctionKeys<T> = {
	[K in keyof T]-?: T[K] extends (...args: any[]) => any ? never : K;
}[keyof T];
type Properties<T> = Pick<T, NonFunctionKeys<T>>;

export interface Intersection extends THREE.Intersection<THREE.Object3D> {
	/** The object which registered the handler receiving this intersection. */
	eventObject: THREE.Object3D;
}

export interface IntersectionEvent<TSourceEvent> extends Intersection {
	/** All intersections participating in this dispatch, in event order. */
	intersections: Intersection[];
	/** `vec3.set(pointer.x, pointer.y, 0).unproject(camera)`. */
	unprojectedPoint: THREE.Vector3;
	/** Normalized device coordinates for the event. */
	pointer: THREE.Vector2;
	/** Rounded pixel distance from the most recent pointer down. */
	delta: number;
	/** The ray which produced the intersection. */
	ray: THREE.Ray;
	/** The camera used by the raycaster. */
	camera: Camera;
	/** Stop deeper intersections and ancestors from receiving this event. */
	stopPropagation(): void;
	/** The original host event. */
	nativeEvent: TSourceEvent;
	/** Whether a handler stopped this dispatch. */
	stopped: boolean;
	/** Pointer-capture facade for the listener-owning Three object. */
	target: {
		hasPointerCapture(pointerId: number): boolean;
		setPointerCapture(pointerId: number): void;
		releasePointerCapture(pointerId: number): void;
	};
	/** Pointer-capture facade for the current listener-owning Three object. */
	currentTarget: {
		hasPointerCapture(pointerId: number): boolean;
		setPointerCapture(pointerId: number): void;
		releasePointerCapture(pointerId: number): void;
	};
}

export type Camera = THREE.OrthographicCamera | THREE.PerspectiveCamera;
export type ThreeEvent<TEvent> = IntersectionEvent<TEvent> & Properties<TEvent>;
export type DomEvent = PointerEvent | MouseEvent | WheelEvent;

export interface Events {
	onClick: EventListener;
	onContextMenu: EventListener;
	onDoubleClick: EventListener;
	onWheel: EventListener;
	onPointerDown: EventListener;
	onPointerUp: EventListener;
	onPointerLeave: EventListener;
	onPointerMove: EventListener;
	onPointerCancel: EventListener;
	onLostPointerCapture: EventListener;
}

export interface EventHandlers {
	onClick?: (event: ThreeEvent<MouseEvent>) => void;
	onContextMenu?: (event: ThreeEvent<MouseEvent>) => void;
	onDoubleClick?: (event: ThreeEvent<MouseEvent>) => void;
	onPointerUp?: (event: ThreeEvent<PointerEvent>) => void;
	onPointerDown?: (event: ThreeEvent<PointerEvent>) => void;
	onPointerOver?: (event: ThreeEvent<PointerEvent>) => void;
	onPointerOut?: (event: ThreeEvent<PointerEvent>) => void;
	onPointerEnter?: (event: ThreeEvent<PointerEvent>) => void;
	onPointerLeave?: (event: ThreeEvent<PointerEvent>) => void;
	onPointerMove?: (event: ThreeEvent<PointerEvent>) => void;
	onPointerMissed?: (event: MouseEvent) => void;
	onPointerCancel?: (event: ThreeEvent<PointerEvent>) => void;
	onWheel?: (event: ThreeEvent<WheelEvent>) => void;
	onLostPointerCapture?: (event: ThreeEvent<PointerEvent>) => void;
}

export type FilterFunction = (
	items: THREE.Intersection<THREE.Object3D>[],
	state: RootState,
) => THREE.Intersection<THREE.Object3D>[];
export type ComputeFunction = (event: DomEvent, root: RootState, previous?: RootState) => void;

export interface EventManager<TTarget = unknown> {
	/** Whether this event layer participates in picking. */
	enabled: boolean;
	/** Higher-priority event layers receive intersections first. */
	priority: number;
	/** Normalize the native event and configure the layer's raycaster. */
	compute?: ComputeFunction;
	/** Reorder or restructure the root layer's raw intersections. */
	filter?: FilterFunction;
	/** The host target currently connected to this manager. */
	connected?: TTarget;
	/** Native event forwarding handlers. */
	handlers?: Events;
	connect?(target: TTarget): void;
	disconnect?(): void;
	/** Re-run the most recent pointer move, for example after a camera move. */
	update?(): void;
}

export interface PointerCaptureTarget {
	intersection: Intersection;
	target: Element;
}

const POINTER_MOVE_LISTENERS = [
	'onPointerMove',
	'onPointerOver',
	'onPointerEnter',
	'onPointerOut',
	'onPointerLeave',
] as const;

const NATIVE_EVENT_NAMES: Readonly<Record<keyof Events, true>> = Object.freeze({
	onClick: true,
	onContextMenu: true,
	onDoubleClick: true,
	onWheel: true,
	onPointerDown: true,
	onPointerUp: true,
	onPointerLeave: true,
	onPointerMove: true,
	onPointerCancel: true,
	onLostPointerCapture: true,
});

/** Event priority shared by the host classifier and native event manager. */
export function getThreeEventPriority(name: keyof Events): UniversalEventPriority {
	const priority = getThreeHostEventPriority(name);
	if (priority === undefined)
		throw new TypeError(`Unsupported Three event name ${JSON.stringify(name)}`);
	return priority;
}

function isThreeEventName(name: string): name is keyof Events {
	return Object.prototype.hasOwnProperty.call(NATIVE_EVENT_NAMES, name);
}

function raycastLiveObject(
	raycaster: THREE.Raycaster,
	object: THREE.Object3D,
	intersections: THREE.Intersection<THREE.Object3D>[],
): void {
	if (!isThreeEventHitLive(object)) return;

	let propagate = true;
	if (object.layers.test(raycaster.layers)) {
		const raycast = object.raycast as unknown;
		if (typeof raycast === 'function') {
			const result = raycast.call(object, raycaster, intersections);
			if (result === false) propagate = false;
		}
	}

	if (!propagate) return;
	for (const child of object.children) {
		raycastLiveObject(raycaster, child, intersections);
	}
}

function findEventStore(object: THREE.Object3D): RootStore | undefined {
	let candidate: THREE.Object3D | null = object;
	while (candidate !== null) {
		const store = getThreeEventStore(candidate);
		if (store !== undefined) return store;
		candidate = candidate.parent;
	}
	return undefined;
}

function invokeListener(
	store: RootStore,
	listener: UniversalEventListenerDescriptor | undefined,
	payload: unknown,
): void {
	if (listener !== undefined) dispatchThreeEvent(store, listener.id, payload);
}

/** Create the framework-neutral event dispatcher for one Three root store. */
export function createEvents(store: RootStore): {
	handlePointer(name: string): EventListener;
} {
	function calculateDistance(event: DomEvent): number {
		const { internal } = store.getState();
		const dx = event.offsetX - internal.initialClick[0];
		const dy = event.offsetY - internal.initialClick[1];
		return Math.round(Math.sqrt(dx * dx + dy * dy));
	}

	function filterPointerEvents(objects: THREE.Object3D[]): THREE.Object3D[] {
		return objects.filter((object) =>
			POINTER_MOVE_LISTENERS.some((name) => getThreeEventListener(object, name) !== undefined),
		);
	}

	function intersect(
		event: DomEvent,
		filter?: (objects: THREE.Object3D[]) => THREE.Object3D[],
	): Intersection[] {
		const rootState = store.getState();
		const duplicates = new Set<string>();
		const intersections: Intersection[] = [];
		const eventObjects = filter
			? filter(rootState.internal.interaction)
			: rootState.internal.interaction;

		// Each event layer computes its ray lazily, once, for this native event.
		for (const object of eventObjects) {
			const objectStore = getThreeEventStore(object);
			if (objectStore !== undefined) objectStore.getState().raycaster.camera = undefined!;
		}

		if (!rootState.previousRoot) {
			rootState.events.compute?.(event, rootState);
		}

		function handleRaycast(object: THREE.Object3D): THREE.Intersection<THREE.Object3D>[] {
			const objectStore = getThreeEventStore(object);
			if (objectStore === undefined) return [];
			const state = objectStore.getState();
			if (!state.events.enabled || state.raycaster.camera === null) return [];

			if (state.raycaster.camera === undefined) {
				state.events.compute?.(event, state, state.previousRoot?.getState());
				if (state.raycaster.camera === undefined) state.raycaster.camera = null!;
			}

			if (!state.raycaster.camera) return [];
			const intersections: THREE.Intersection<THREE.Object3D>[] = [];
			raycastLiveObject(state.raycaster, object, intersections);
			return intersections.filter((intersection) => isThreeEventHitLive(intersection.object));
		}

		let hits = eventObjects
			.flatMap(handleRaycast)
			.sort((left, right) => {
				const leftStore = findEventStore(left.object);
				const rightStore = findEventStore(right.object);
				if (leftStore === undefined || rightStore === undefined) {
					return left.distance - right.distance;
				}
				return (
					rightStore.getState().events.priority - leftStore.getState().events.priority ||
					left.distance - right.distance
				);
			})
			.filter((item) => {
				const id = makeIntersectionId(item as Intersection);
				if (duplicates.has(id)) return false;
				duplicates.add(id);
				return true;
			});

		if (rootState.events.filter !== undefined) {
			hits = rootState.events.filter(hits, rootState);
		}

		// Bubble every physical hit through managed Three ancestors.
		for (const hit of hits) {
			let eventObject: THREE.Object3D | null = hit.object;
			while (eventObject !== null) {
				if (hasThreeEventListeners(eventObject)) {
					intersections.push({ ...hit, eventObject });
				}
				eventObject = eventObject.parent;
			}
		}

		// Pointer capture supplements ordinary intersections; it does not replace them.
		if ('pointerId' in event) {
			const captures = rootState.internal.capturedMap.get(event.pointerId);
			if (captures !== undefined) {
				for (const capture of captures.values()) {
					if (!duplicates.has(makeIntersectionId(capture.intersection))) {
						intersections.push(capture.intersection);
					}
				}
			}
		}

		return intersections;
	}

	function cancelPointer(intersections: Intersection[]): void {
		const { internal } = store.getState();
		for (const hovered of internal.hovered.values()) {
			const stillHovered = intersections.some(
				(hit) =>
					hit.object === hovered.object &&
					hit.index === hovered.index &&
					hit.instanceId === hovered.instanceId,
			);
			if (stillHovered) continue;

			internal.hovered.delete(makeIntersectionId(hovered));
			const eventStore = findEventStore(hovered.eventObject) ?? store;
			const data = { ...hovered, intersections } as ThreeEvent<PointerEvent>;
			invokeListener(eventStore, getThreeEventListener(hovered.eventObject, 'onPointerOut'), data);
			invokeListener(
				eventStore,
				getThreeEventListener(hovered.eventObject, 'onPointerLeave'),
				data,
			);
		}
	}

	function pointerMissed(event: MouseEvent, objects: THREE.Object3D[]): void {
		for (const object of objects) {
			const eventStore = getThreeEventStore(object) ?? store;
			invokeListener(eventStore, getThreeEventListener(object, 'onPointerMissed'), event);
		}
	}

	function handleIntersects(
		intersections: Intersection[],
		event: DomEvent,
		delta: number,
		callback: (event: ThreeEvent<DomEvent>) => void,
	): Intersection[] {
		if (intersections.length === 0) return intersections;
		const localState = { stopped: false };

		for (const hit of intersections) {
			const eventStore = findEventStore(hit.object);
			if (eventStore === undefined) continue;
			const state = eventStore.getState();
			const { raycaster, pointer, camera, internal } = state;
			const unprojectedPoint = new THREE.Vector3(pointer.x, pointer.y, 0).unproject(camera);

			const captureIdentity = createPointerCaptureIdentity(hit);
			const hasPointerCapture = (pointerId: number): boolean =>
				internal.capturedMap.get(pointerId)?.has(captureIdentity.eventObject) ?? false;

			const setPointerCapture = (pointerId: number): void => {
				const target = event.target as Element;
				const capture = { intersection: captureIdentity.intersection, target };
				setInternalPointerCapture(
					internal.capturedMap,
					captureIdentity.eventObject,
					capture,
					captureIdentity,
					pointerId,
				);
				target.setPointerCapture(pointerId);
			};

			const releasePointerCapture = (pointerId: number): void => {
				const captures = internal.capturedMap.get(pointerId);
				if (captures !== undefined) {
					releaseInternalPointerCapture(
						internal.capturedMap,
						captureIdentity.eventObject,
						captures,
						pointerId,
					);
				}
			};

			const nativeProperties: Record<string, unknown> = {};
			// Native event values commonly live on the prototype; enumerate both own
			// and inherited atomics while leaving methods on nativeEvent.
			for (const property in event) {
				const value = event[property as keyof DomEvent];
				if (typeof value !== 'function') nativeProperties[property] = value;
			}

			const target = { hasPointerCapture, setPointerCapture, releasePointerCapture };
			const currentTarget = { hasPointerCapture, setPointerCapture, releasePointerCapture };
			registerPointerCaptureFacade(target, captureIdentity);
			registerPointerCaptureFacade(currentTarget, captureIdentity);

			const raycastEvent = {
				...hit,
				...nativeProperties,
				pointer,
				intersections,
				stopped: localState.stopped,
				delta,
				unprojectedPoint,
				ray: raycaster.ray,
				camera,
				stopPropagation() {
					const captures =
						'pointerId' in event ? internal.capturedMap.get(event.pointerId) : undefined;
					if (captures === undefined || captures.has(hit.eventObject)) {
						raycastEvent.stopped = localState.stopped = true;
						const isHovered = Array.from(internal.hovered.values()).some(
							(hovered) => hovered.eventObject === hit.eventObject,
						);
						if (internal.hovered.size > 0 && isHovered) {
							const higher = intersections.slice(0, intersections.indexOf(hit));
							cancelPointer([...higher, hit]);
						}
					}
				},
				target,
				currentTarget,
				nativeEvent: event,
			} as unknown as ThreeEvent<DomEvent>;

			callback(raycastEvent);
			if (localState.stopped) break;
		}
		return intersections;
	}

	function handleEvent(name: keyof Events, event: DomEvent): void {
		const { onPointerMissed, internal } = store.getState();
		internal.lastEvent.current = event;

		const isPointerMove = name === 'onPointerMove';
		const isClickEvent = name === 'onClick' || name === 'onContextMenu' || name === 'onDoubleClick';
		const hits = intersect(event, isPointerMove ? filterPointerEvents : undefined);
		const delta = isClickEvent ? calculateDistance(event) : 0;

		if (name === 'onPointerDown') {
			internal.initialClick = [event.offsetX, event.offsetY];
			internal.initialHits = hits.map((hit) => hit.eventObject);
		}

		// Misses run before click handlers so user cleanup precedes the hit action.
		if (isClickEvent && hits.length === 0 && delta <= 2) {
			pointerMissed(event as MouseEvent, internal.interaction);
			onPointerMissed?.(event as MouseEvent);
		}

		if (isPointerMove) cancelPointer(hits);

		function onIntersect(data: ThreeEvent<DomEvent>): void {
			const { eventObject } = data;
			const eventStore = findEventStore(eventObject) ?? store;

			if (isPointerMove) {
				const hasHoverHandler =
					getThreeEventListener(eventObject, 'onPointerOver') !== undefined ||
					getThreeEventListener(eventObject, 'onPointerEnter') !== undefined ||
					getThreeEventListener(eventObject, 'onPointerOut') !== undefined ||
					getThreeEventListener(eventObject, 'onPointerLeave') !== undefined;
				if (hasHoverHandler) {
					const id = makeIntersectionId(data);
					const hovered = internal.hovered.get(id);
					if (hovered === undefined) {
						internal.hovered.set(id, data);
						invokeListener(eventStore, getThreeEventListener(eventObject, 'onPointerOver'), data);
						invokeListener(eventStore, getThreeEventListener(eventObject, 'onPointerEnter'), data);
					} else if (hovered.stopped) {
						data.stopPropagation();
					}
				}
				invokeListener(eventStore, getThreeEventListener(eventObject, 'onPointerMove'), data);
				return;
			}

			const listener = getThreeEventListener(eventObject, name);
			if (listener !== undefined) {
				if (!isClickEvent || internal.initialHits.includes(eventObject)) {
					pointerMissed(
						event as MouseEvent,
						internal.interaction.filter((object) => !internal.initialHits.includes(object)),
					);
					invokeListener(eventStore, listener, data);
				}
			} else if (isClickEvent && internal.initialHits.includes(eventObject)) {
				pointerMissed(
					event as MouseEvent,
					internal.interaction.filter((object) => !internal.initialHits.includes(object)),
				);
			}
		}

		handleIntersects(hits, event, delta, onIntersect);
	}

	function handlePointer(name: string): EventListener {
		if (!isThreeEventName(name)) {
			throw new TypeError(`Unsupported Three event name "${name}"`);
		}
		const priority = getThreeEventPriority(name);
		if (name === 'onPointerLeave' || name === 'onPointerCancel') {
			return () => runThreeEventScope(store, priority, () => cancelPointer([]));
		}
		if (name === 'onLostPointerCapture') {
			return (nativeEvent) => {
				const event = nativeEvent as DomEvent;
				runThreeEventScope(store, priority, () => {
					if (!('pointerId' in event)) return;
					const { internal } = store.getState();
					if (!internal.capturedMap.has(event.pointerId)) return;
					requestAnimationFrame(() => {
						// Lost capture fires before pointerup. Defer cleanup so pointerup can
						// still reach every capturing object, then open a fresh event scope.
						runThreeEventScope(store, 'continuous', () => {
							if (internal.capturedMap.has(event.pointerId)) {
								clearInternalPointerCaptures(internal.capturedMap, event.pointerId);
								cancelPointer([]);
							}
						});
					});
				});
			};
		}
		return (nativeEvent) =>
			runThreeEventScope(store, priority, () => handleEvent(name, nativeEvent as DomEvent));
	}

	return { handlePointer };
}
