import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
	createEvents,
	createRoot,
	events as createPointerEvents,
	type DomEvent,
	type Renderer,
	type RootState,
	type ThreeEvent,
	type ThreeRoot,
} from '@octanejs/three';
import {
	ActivityEventScene,
	ArgsEventScene,
	EventScene,
	PrimitiveEventScene,
	PrimitiveParentEventScene,
	PrimitiveStackEventScene,
	ScopedEventScene,
} from './_fixtures/events.three.tsrx';

interface EventCanvas extends HTMLCanvasElement {
	setPointerCapture: ReturnType<typeof vi.fn>;
	releasePointerCapture: ReturnType<typeof vi.fn>;
}

const mountedRoots: ThreeRoot<HTMLCanvasElement>[] = [];

function createRenderer(canvas: HTMLCanvasElement): Renderer {
	return {
		domElement: canvas,
		render() {},
		setPixelRatio() {},
		setSize() {},
		renderLists: { dispose() {} },
		dispose() {},
		forceContextLoss() {},
	};
}

async function createEventRoot(onPointerMissed?: (event: MouseEvent) => void) {
	const canvas = document.createElement('canvas') as EventCanvas;
	canvas.width = 100;
	canvas.height = 100;
	canvas.setPointerCapture = vi.fn();
	canvas.releasePointerCapture = vi.fn();
	const root = createRoot(canvas);
	mountedRoots.push(root);
	await root.configure({
		gl: createRenderer(canvas),
		size: { width: 100, height: 100, top: 20, left: 30 },
		dpr: 1,
		frameloop: 'never',
		events: createPointerEvents,
		onPointerMissed,
	});
	return { canvas, root };
}

function prepareRaycast(state: RootState): void {
	state.scene.updateMatrixWorld(true);
	state.camera.updateMatrixWorld(true);
}

function dispatchPointer(
	target: HTMLElement,
	type: string,
	x: number,
	y: number,
	pointerId = 1,
): DomEvent {
	const event = new MouseEvent(type, {
		bubbles: true,
		clientX: x,
		clientY: y,
		button: 0,
	}) as DomEvent;
	Object.defineProperties(event, {
		offsetX: { configurable: true, enumerable: true, value: x },
		offsetY: { configurable: true, enumerable: true, value: y },
		pointerId: { configurable: true, enumerable: true, value: pointerId },
	});
	target.dispatchEvent(event);
	return event;
}

function emptySceneProps(overrides: Record<string, unknown> = {}) {
	return {
		showFront: true,
		parentRef: null,
		frontRef: null,
		rearRef: null,
		...overrides,
	};
}

afterEach(() => {
	for (const root of mountedRoots.splice(0)) root.unmount();
	vi.restoreAllMocks();
});

describe('Three ray and pointer events', () => {
	it('normalizes coordinates, orders hits, and bubbles through physical Three parents', async () => {
		const { canvas, root } = await createEventRoot();
		const log: Array<{
			handler: string;
			object: string;
			eventObject: string;
			intersections: string[];
			pointer: [number, number];
			point: [number, number, number];
		}> = [];
		const record = (handler: string) => (event: ThreeEvent<PointerEvent>) => {
			log.push({
				handler,
				object: event.object.name,
				eventObject: event.eventObject.name,
				intersections: event.intersections.map((hit) => hit.eventObject.name),
				pointer: [event.pointer.x, event.pointer.y],
				point: [event.point.x, event.point.y, event.point.z],
			});
		};

		root.render(
			EventScene,
			emptySceneProps({
				onFrontPointerDown: record('front'),
				onParentPointerDown: record('parent'),
				onRearPointerDown: record('rear'),
			}),
		);
		prepareRaycast(root.store.getState());
		dispatchPointer(canvas, 'pointerdown', 50, 50);

		expect(log.map(({ handler, object, eventObject }) => [handler, object, eventObject])).toEqual([
			['front', 'front', 'front'],
			['parent', 'front', 'parent'],
			['rear', 'rear', 'rear'],
			['parent', 'rear', 'parent'],
		]);
		expect(log[0].intersections).toEqual(['front', 'parent', 'rear', 'parent']);
		expect(log[0].pointer).toEqual([0, 0]);
		expect(log[0].point[0]).toBeCloseTo(0);
		expect(log[0].point[1]).toBeCloseTo(0);
		expect(log[0].point[2]).toBeCloseTo(1.5);
	});

	it('keeps propagation and hover transitions inside the ordered hit sequence', async () => {
		const { canvas, root } = await createEventRoot();
		const propagation: string[] = [];
		root.render(
			EventScene,
			emptySceneProps({
				onFrontPointerDown(event: ThreeEvent<PointerEvent>) {
					propagation.push('front');
					event.stopPropagation();
				},
				onParentPointerDown: () => propagation.push('parent'),
				onRearPointerDown: () => propagation.push('rear'),
			}),
		);
		prepareRaycast(root.store.getState());
		dispatchPointer(canvas, 'pointerdown', 50, 50);
		expect(propagation).toEqual(['front']);

		const hover: string[] = [];
		root.render(
			EventScene,
			emptySceneProps({
				onFrontPointerOver(event: ThreeEvent<PointerEvent>) {
					hover.push('front-over');
					event.stopPropagation();
				},
				onFrontPointerEnter: () => hover.push('front-enter'),
				onFrontPointerMove: () => hover.push('front-move'),
				onFrontPointerOut: () => hover.push('front-out'),
				onFrontPointerLeave: () => hover.push('front-leave'),
				onRearPointerOver: () => hover.push('rear-over'),
				onRearPointerEnter: () => hover.push('rear-enter'),
				onRearPointerMove: () => hover.push('rear-move'),
				onRearPointerOut: () => hover.push('rear-out'),
				onRearPointerLeave: () => hover.push('rear-leave'),
			}),
		);
		prepareRaycast(root.store.getState());
		dispatchPointer(canvas, 'pointermove', 50, 50);
		dispatchPointer(canvas, 'pointermove', 50, 50);
		dispatchPointer(canvas, 'pointermove', 99, 99);
		expect(hover).toEqual([
			'front-over',
			'front-enter',
			'front-move',
			'front-move',
			'front-out',
			'front-leave',
		]);
	});

	it('stops click propagation before rear hits and physical ancestors', async () => {
		const { canvas, root } = await createEventRoot();
		const clicks: string[] = [];
		root.render(
			EventScene,
			emptySceneProps({
				onFrontClick(event: ThreeEvent<MouseEvent>) {
					clicks.push('front');
					event.stopPropagation();
				},
				onParentClick: () => clicks.push('parent'),
				onRearClick: () => clicks.push('rear'),
			}),
		);
		prepareRaycast(root.store.getState());

		dispatchPointer(canvas, 'pointerdown', 50, 50);
		dispatchPointer(canvas, 'click', 50, 50);

		expect(clicks).toEqual(['front']);
	});

	it('gates clicks to pointer-down hits and reports object and root misses first', async () => {
		const misses: string[] = [];
		const { canvas, root } = await createEventRoot(() => misses.push('root'));
		root.render(
			EventScene,
			emptySceneProps({
				onParentPointerMissed: () => misses.push('parent'),
				onFrontPointerMissed: () => misses.push('front'),
				onRearPointerMissed: () => misses.push('rear'),
			}),
		);
		prepareRaycast(root.store.getState());
		dispatchPointer(canvas, 'pointerdown', 99, 99);
		const nativeClick = dispatchPointer(canvas, 'click', 99, 99);
		expect(misses).toEqual(['parent', 'front', 'rear', 'root']);
		expect(root.store.getState().internal.lastEvent.current).toBe(nativeClick);

		const clicks: string[] = [];
		const parentMiss = vi.fn();
		root.render(
			EventScene,
			emptySceneProps({
				onFrontClick: () => clicks.push('front'),
				onRearClick: () => clicks.push('rear'),
				onParentPointerMissed: parentMiss,
			}),
		);
		prepareRaycast(root.store.getState());
		dispatchPointer(canvas, 'pointerdown', 50, 50);
		dispatchPointer(canvas, 'click', 50, 50);
		expect(clicks).toEqual(['front', 'rear']);
		expect(parentMiss).not.toHaveBeenCalled();
	});

	it('bubbles unmanaged primitive descendants to their managed event object', async () => {
		const { canvas, root } = await createEventRoot();
		const group = new THREE.Group();
		group.name = 'managed-group';
		const child = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
		child.name = 'unmanaged-child';
		group.add(child);
		const observations: Array<[string, string]> = [];
		root.render(PrimitiveEventScene, {
			object: group,
			objectRef: null,
			onPointerDown(event: ThreeEvent<PointerEvent>) {
				observations.push([event.object.name, event.eventObject.name]);
			},
		});
		prepareRaycast(root.store.getState());

		dispatchPointer(canvas, 'pointerdown', 50, 50);

		expect(observations).toEqual([['unmanaged-child', 'managed-group']]);
	});

	it('keeps events live when constructor args reconstruct an object', async () => {
		const { canvas, root } = await createEventRoot();
		const objects: Array<THREE.Mesh | null> = [];
		const events: THREE.Mesh[] = [];
		const props = (args: readonly unknown[]) => ({
			args,
			objectRef: (object: THREE.Mesh | null) => objects.push(object),
			onPointerDown: (event: ThreeEvent<PointerEvent>) =>
				events.push(event.eventObject as THREE.Mesh),
		});
		root.render(ArgsEventScene, props([]));
		prepareRaycast(root.store.getState());
		dispatchPointer(canvas, 'pointerdown', 50, 50);
		const first = events[0];

		root.render(ArgsEventScene, props([undefined, undefined]));
		prepareRaycast(root.store.getState());
		dispatchPointer(canvas, 'pointerdown', 50, 50);
		const second = events[1];

		expect(first).toBeInstanceOf(THREE.Mesh);
		expect(second).toBeInstanceOf(THREE.Mesh);
		expect(second).not.toBe(first);
		expect(objects).toContain(first);
		expect(objects.at(-1)).toBe(second);
	});

	it('preserves interaction order when a live object gains another handler', async () => {
		const { root } = await createEventRoot();
		const onPointerDown = () => {};
		root.render(
			EventScene,
			emptySceneProps({
				onFrontPointerDown: onPointerDown,
				onRearPointerDown: onPointerDown,
			}),
		);
		expect(root.store.getState().internal.interaction.map((object) => object.name)).toEqual([
			'front',
			'rear',
		]);

		root.render(
			EventScene,
			emptySceneProps({
				onFrontClick: () => {},
				onFrontPointerDown: onPointerDown,
				onRearPointerDown: onPointerDown,
			}),
		);

		expect(root.store.getState().internal.interaction.map((object) => object.name)).toEqual([
			'front',
			'rear',
		]);
	});

	it('disconnects retained Activity hits while hidden and restores them when visible', async () => {
		const { canvas, root } = await createEventRoot();
		const log: string[] = [];
		const childRaycast = vi.fn(function (
			this: THREE.Mesh,
			raycaster: THREE.Raycaster,
			intersections: THREE.Intersection[],
		) {
			return THREE.Mesh.prototype.raycast.call(this, raycaster, intersections);
		});
		const props = (mode: 'hidden' | 'visible') => ({
			mode,
			childRaycast,
			onChildPointerDown: () => log.push('child'),
			onParentPointerDown: () => log.push('parent'),
		});

		root.render(ActivityEventScene, props('hidden'));
		prepareRaycast(root.store.getState());
		dispatchPointer(canvas, 'pointerdown', 50, 50);
		expect(log).toEqual([]);
		expect(childRaycast).not.toHaveBeenCalled();
		expect(root.store.getState().internal.interaction.map((object) => object.name)).toEqual([
			'activity-parent',
		]);

		root.render(ActivityEventScene, props('visible'));
		prepareRaycast(root.store.getState());
		dispatchPointer(canvas, 'pointerdown', 50, 50);
		expect(log).toEqual(['child', 'parent']);
		expect(childRaycast).toHaveBeenCalled();

		childRaycast.mockClear();
		root.render(ActivityEventScene, props('hidden'));
		prepareRaycast(root.store.getState());
		dispatchPointer(canvas, 'pointerdown', 50, 50);
		expect(log).toEqual(['child', 'parent']);
		expect(childRaycast).not.toHaveBeenCalled();
	});

	it('supplements off-hit raycasts with capture and transfers capture across reconstruction', async () => {
		const { canvas, root } = await createEventRoot();
		const first = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
		first.name = 'first';
		const second = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
		second.name = 'second';
		const moves: string[] = [];
		const props = (object: THREE.Mesh) => ({
			object,
			objectRef: null,
			onPointerDown(event: ThreeEvent<PointerEvent>) {
				event.target.setPointerCapture(event.pointerId);
			},
			onPointerMove(event: ThreeEvent<PointerEvent>) {
				moves.push(event.eventObject.name);
			},
			onPointerOver() {},
			onPointerOut: () => moves.push('out'),
			onPointerLeave: () => moves.push('leave'),
		});

		root.render(PrimitiveEventScene, props(first));
		prepareRaycast(root.store.getState());
		dispatchPointer(canvas, 'pointermove', 50, 50, 7);
		dispatchPointer(canvas, 'pointerdown', 50, 50, 7);
		expect(canvas.setPointerCapture).toHaveBeenCalledWith(7);
		root.render(PrimitiveEventScene, {
			...props(first),
			onPointerMissed() {},
		});
		expect(root.store.getState().internal.capturedMap.get(7)?.has(first)).toBe(true);

		root.render(PrimitiveEventScene, props(second));
		const reconstructed = root.store.getState().internal;
		const hovered = [...reconstructed.hovered.values()];
		const capture = reconstructed.capturedMap.get(7)?.get(second);
		expect(reconstructed.interaction).toEqual([second]);
		expect(reconstructed.initialHits).toEqual([second]);
		expect(hovered).toHaveLength(1);
		expect(hovered[0].object).toBe(second);
		expect(hovered[0].eventObject).toBe(second);
		expect(hovered[0].intersections.map((hit) => [hit.object, hit.eventObject])).toEqual([
			[second, second],
		]);
		expect(capture?.intersection.object).toBe(second);
		expect(capture?.intersection.eventObject).toBe(second);
		prepareRaycast(root.store.getState());
		dispatchPointer(canvas, 'pointermove', 99, 99, 7);
		expect(moves).toEqual(['first', 'second']);
		expect(root.store.getState().internal.capturedMap.get(7)?.has(second)).toBe(true);
		expect(root.store.getState().internal.capturedMap.get(7)?.has(first)).toBe(false);

		root.unmount();
		mountedRoots.splice(mountedRoots.indexOf(root), 1);
		expect(canvas.releasePointerCapture).toHaveBeenCalledWith(7);
	});

	it('transfers retained pointer-down capture facades across reconstruction', async () => {
		const { canvas, root } = await createEventRoot();
		const first = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
		first.name = 'retained-first';
		const second = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
		second.name = 'retained-second';
		const third = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
		third.name = 'retained-third';
		let target: ThreeEvent<PointerEvent>['target'] | undefined;
		let currentTarget: ThreeEvent<PointerEvent>['currentTarget'] | undefined;
		const props = (object: THREE.Mesh) => ({
			object,
			objectRef: null,
			onPointerDown(event: ThreeEvent<PointerEvent>) {
				target = event.target;
				currentTarget = event.currentTarget;
				event.target.setPointerCapture(event.pointerId);
			},
		});

		root.render(PrimitiveEventScene, props(first));
		prepareRaycast(root.store.getState());
		dispatchPointer(canvas, 'pointerdown', 50, 50, 12);
		expect(target?.hasPointerCapture(12)).toBe(true);
		target?.setPointerCapture(14);

		root.render(PrimitiveEventScene, props(second));
		const capture = root.store.getState().internal.capturedMap.get(12)?.get(second);
		expect(target?.hasPointerCapture(12)).toBe(true);
		expect(currentTarget?.hasPointerCapture(12)).toBe(true);
		expect(capture?.intersection.object).toBe(second);
		expect(capture?.intersection.eventObject).toBe(second);

		currentTarget?.releasePointerCapture(12);
		expect(target?.hasPointerCapture(12)).toBe(false);
		expect(root.store.getState().internal.capturedMap.has(12)).toBe(false);
		expect(target?.hasPointerCapture(14)).toBe(true);
		expect(canvas.releasePointerCapture).toHaveBeenCalledWith(12);

		root.render(PrimitiveEventScene, props(third));
		const remainingCapture = root.store.getState().internal.capturedMap.get(14)?.get(third);
		expect(target?.hasPointerCapture(14)).toBe(true);
		expect(remainingCapture?.intersection.object).toBe(third);
		currentTarget?.releasePointerCapture(14);
		expect(root.store.getState().internal.capturedMap.has(14)).toBe(false);
		expect(canvas.releasePointerCapture).toHaveBeenCalledWith(14);
	});

	it('rewrites captured raw-hit intersections when a descendant reconstructs', async () => {
		const { canvas, root } = await createEventRoot();
		const first = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
		first.name = 'nested-first';
		const second = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
		second.name = 'nested-second';
		let parent: THREE.Object3D | undefined;
		const props = (object: THREE.Mesh) => ({
			object,
			onPointerDown(event: ThreeEvent<PointerEvent>) {
				parent = event.eventObject;
				event.target.setPointerCapture(event.pointerId);
			},
		});

		root.render(PrimitiveParentEventScene, props(first));
		prepareRaycast(root.store.getState());
		dispatchPointer(canvas, 'pointerdown', 50, 50, 13);
		root.render(PrimitiveParentEventScene, props(second));

		const capture = parent
			? root.store.getState().internal.capturedMap.get(13)?.get(parent)
			: undefined;
		expect(capture?.intersection.object).toBe(second);
		expect(capture?.intersection.eventObject).toBe(parent);
	});

	it('targets reconstructed objects when a stored hover event changes pointer capture', async () => {
		const { canvas, root } = await createEventRoot();
		const first = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
		first.name = 'first';
		first.position.z = 1;
		const second = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
		second.name = 'second';
		second.position.z = 1;
		const captureChecks: boolean[] = [];
		const props = (object: THREE.Mesh) => ({
			object,
			onFrontPointerMove() {},
			onFrontPointerOver() {},
			onFrontPointerOut(event: ThreeEvent<PointerEvent>) {
				captureChecks.push(event.target.hasPointerCapture(event.pointerId));
				event.target.setPointerCapture(event.pointerId);
				captureChecks.push(event.currentTarget.hasPointerCapture(event.pointerId));
				event.currentTarget.releasePointerCapture(event.pointerId);
				captureChecks.push(event.target.hasPointerCapture(event.pointerId));
				event.target.setPointerCapture(event.pointerId);
			},
			onRearPointerMove() {},
			onRearPointerOver() {},
			onRearPointerOut() {},
		});

		root.render(PrimitiveStackEventScene, props(first));
		prepareRaycast(root.store.getState());
		dispatchPointer(canvas, 'pointermove', 50, 50, 11);

		root.render(PrimitiveStackEventScene, props(second));
		const hovered = [...root.store.getState().internal.hovered.values()];
		const rearHover = hovered.find((event) => event.eventObject.name === 'nested-rear');
		expect(rearHover?.intersections.some((hit) => hit.object === first)).toBe(false);
		expect(rearHover?.intersections.some((hit) => hit.object === second)).toBe(true);

		prepareRaycast(root.store.getState());
		dispatchPointer(canvas, 'pointermove', 99, 99, 11);

		const captures = root.store.getState().internal.capturedMap.get(11);
		const capture = captures?.get(second);
		expect(captureChecks).toEqual([false, true, false]);
		expect(captures?.has(first)).toBe(false);
		expect(captures?.has(second)).toBe(true);
		expect(capture?.intersection.object).toBe(second);
		expect(capture?.intersection.eventObject).toBe(second);
		expect(canvas.setPointerCapture).toHaveBeenCalledTimes(2);
		expect(canvas.releasePointerCapture).toHaveBeenCalledWith(11);
	});

	it('accepts dynamic event names and rejects unsupported event handlers', async () => {
		const { root } = await createEventRoot();
		const dynamicName: string = 'onPointerDown';
		const coreEvents = createEvents(root.store);

		expect(coreEvents.handlePointer(dynamicName)).toBeTypeOf('function');
		expect(() => coreEvents.handlePointer('onGestureStart')).toThrowError(
			new TypeError('Unsupported Three event name "onGestureStart"'),
		);
	});

	it('snapshots all listeners for one discrete event before committing handler updates', async () => {
		const { canvas, root } = await createEventRoot();
		const log: string[] = [];
		root.render(ScopedEventScene, { onEvent: (name: string) => log.push(name) });
		prepareRaycast(root.store.getState());

		dispatchPointer(canvas, 'pointerdown', 50, 50);

		expect(log).toEqual(['front', 'rear']);
		expect(root.store.getState().scene.getObjectByName('rear')).toBeUndefined();
	});

	it('supports custom filtering, disabling, and replaying the last pointer move', async () => {
		const { canvas, root } = await createEventRoot();
		const log: string[] = [];
		root.render(
			EventScene,
			emptySceneProps({
				onFrontPointerDown: () => log.push('front'),
				onRearPointerDown: () => log.push('rear'),
				onFrontPointerMove: () => log.push('move'),
			}),
		);
		const state = root.store.getState();
		state.setEvents({ filter: (hits) => [...hits].reverse() });
		prepareRaycast(state);
		dispatchPointer(canvas, 'pointerdown', 50, 50);
		expect(log.slice(0, 2)).toEqual(['rear', 'front']);

		state.setEvents({ enabled: false });
		dispatchPointer(canvas, 'pointerdown', 50, 50);
		expect(log).toEqual(['rear', 'front']);
		state.setEvents({ enabled: true, filter: undefined });
		dispatchPointer(canvas, 'pointermove', 50, 50);
		state.events.update?.();
		expect(log.slice(-2)).toEqual(['move', 'move']);
	});

	it('reuses the active event scope when update replays a move from a discrete handler', async () => {
		const { canvas, root } = await createEventRoot();
		const log: string[] = [];
		root.render(
			EventScene,
			emptySceneProps({
				onFrontPointerDown: () => {
					log.push('down');
					root.store.getState().events.update?.();
				},
				onFrontPointerMove: () => log.push('move'),
			}),
		);
		prepareRaycast(root.store.getState());

		expect(() => dispatchPointer(canvas, 'pointerdown', 50, 50)).not.toThrow();
		expect(log).toEqual(['down', 'move']);
	});
});
