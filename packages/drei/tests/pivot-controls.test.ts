import * as React from 'react';
import {
	act,
	advance as reactAdvance,
	createRoot as createReactRoot,
	extend,
	type RootState,
	useThree,
} from '@react-three/fiber';
import { PivotControls as ReactPivotControls } from '@react-three/drei/web/pivotControls/index.js';
import { createRoot as createOctaneRoot } from '@octanejs/three';
import {
	dispatchThreeEvent,
	getThreeEventListener,
	runThreeEventScope,
} from '../../three/src/core/driver.js';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { PivotControls } from '../src/web/pivotControls/index.three.tsrx';
import { PivotControlsScene } from './_fixtures/pivot-controls.three.tsrx';

beforeAll(() => {
	(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
	extend(THREE as any);
});
function renderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
	return {
		domElement: canvas,
		outputColorSpace: THREE.SRGBColorSpace,
		toneMapping: THREE.NoToneMapping,
		render() {},
		setPixelRatio() {},
		setSize() {},
		renderLists: { dispose() {} },
		forceContextLoss() {},
		dispose() {},
	} as any;
}
type EventObject = THREE.Object3D & { __r3f?: { handlers: Record<string, (event: any) => void> } };
function reactTargets(root: THREE.Object3D): EventObject[] {
	const result: EventObject[] = [];
	root.traverse((object) => {
		if ((object as EventObject).__r3f?.handlers.onPointerDown) result.push(object as EventObject);
	});
	return result;
}
function capture() {
	return {
		setPointerCapture() {},
		releasePointerCapture() {},
		hasPointerCapture() {
			return false;
		},
	};
}
function event(
	rayOrigin = new THREE.Vector3(0, 0, 5),
	point = new THREE.Vector3(),
	extra: Record<string, unknown> = {},
) {
	return {
		pointerId: 1,
		pointerType: 'mouse',
		buttons: 1,
		point,
		ray: new THREE.Ray(rayOrigin, new THREE.Vector3(0, 0, -1)),
		target: capture(),
		currentTarget: capture(),
		stopPropagation() {},
		...extra,
	};
}
function rounded(matrix: THREE.Matrix4) {
	return matrix.elements.map((value) => Number(value.toFixed(6)));
}
async function fireOctane(
	store: any,
	object: THREE.Object3D,
	name: string,
	data: Record<string, any>,
) {
	const listener = getThreeEventListener(object, name)!;
	const payload = {
		camera: store.getState().camera,
		target: object,
		currentTarget: object,
		sourceEvent: data,
		stopPropagation() {},
		...data,
	};
	const result = runThreeEventScope(store, listener.priority, () =>
		dispatchThreeEvent(store, listener.id, payload),
	);
	await result;
	await Promise.resolve();
}

async function mountPair(props: Record<string, any>) {
	const reactHost = document.createElement('div'),
		reactCanvas = document.createElement('canvas');
	reactHost.append(reactCanvas);
	const octaneHost = document.createElement('div'),
		octaneCanvas = document.createElement('canvas');
	octaneHost.append(octaneCanvas);
	const reactControls = { enabled: true },
		octaneControls = { enabled: true };
	let reactState!: RootState, reactRef!: THREE.Group, octaneRef!: THREE.Group;
	function Capture() {
		reactState = useThree();
		reactState.controls = reactControls as any;
		return null;
	}
	const reactRoot = createReactRoot(reactCanvas);
	await reactRoot.configure({
		gl: renderer(reactCanvas),
		frameloop: 'never',
		size: { width: 400, height: 400, left: 0, top: 0 },
		dpr: 1,
	});
	await act(async () =>
		reactRoot.render(
			React.createElement(
				React.Fragment,
				null,
				React.createElement(Capture),
				React.createElement(
					ReactPivotControls,
					{ ...props, ref: (value: THREE.Group) => (reactRef = value) },
					React.createElement(
						'mesh',
						{ name: 'pivot-child', position: [1, 0, 0] },
						React.createElement('boxGeometry', { args: [2, 2, 2] }),
						React.createElement('meshBasicMaterial'),
					),
				),
			),
		),
	);
	const octaneRoot = createOctaneRoot(octaneCanvas);
	await octaneRoot.configure({
		gl: renderer(octaneCanvas),
		frameloop: 'never',
		size: { width: 400, height: 400, left: 0, top: 0 },
		dpr: 1,
	});
	octaneRoot.render(PivotControlsScene, {
		...props,
		controls: octaneControls,
		controlRef: (value: THREE.Group) => (octaneRef = value),
	});
	await act(async () => {
		for (let i = 0; i < 8; i++) await Promise.resolve();
	});
	return {
		reactRoot,
		octaneRoot,
		reactHost,
		octaneHost,
		reactCanvas,
		octaneCanvas,
		reactState,
		reactControls,
		octaneControls,
		get reactRef() {
			return reactRef;
		},
		get octaneRef() {
			return octaneRef;
		},
	};
}

async function advance(pair: Awaited<ReturnType<typeof mountPair>>) {
	await act(async () => reactAdvance(1 / 60, true, pair.reactState));
	pair.octaneRoot.store.getState().advance(1 / 60);
}

async function interactionPair(props: Record<string, any>) {
	const reactCalls = { start: vi.fn(), drag: vi.fn(), end: vi.fn() };
	const octaneCalls = { start: vi.fn(), drag: vi.fn(), end: vi.fn() };
	const pair = await mountPair({
		...props,
		onDragStart: reactCalls.start,
		onDrag: reactCalls.drag,
		onDragEnd: reactCalls.end,
	});
	pair.octaneRoot.render(PivotControlsScene, {
		...props,
		controls: pair.octaneControls,
		controlRef: () => {},
		onDragStart: octaneCalls.start,
		onDrag: octaneCalls.drag,
		onDragEnd: octaneCalls.end,
	});
	await act(async () => {
		for (let i = 0; i < 4; i++) await Promise.resolve();
	});
	return { ...pair, reactCalls, octaneCalls };
}

async function dragPair(
	pair: Awaited<ReturnType<typeof interactionPair>>,
	octaneTarget: THREE.Object3D,
	downEvent: ReturnType<typeof event>,
	moveEvent: ReturnType<typeof event>,
	compareMatrices = true,
) {
	const reactTarget = reactTargets(pair.reactRef.children[0])[0];
	await act(async () => reactTarget.__r3f!.handlers.onPointerDown(downEvent));
	expect(pair.reactControls.enabled).toBe(false);
	await act(async () => reactTarget.__r3f!.handlers.onPointerMove(moveEvent));
	await act(async () => reactTarget.__r3f!.handlers.onPointerUp(event()));
	Object.assign(octaneTarget, capture());
	await fireOctane(pair.octaneRoot.store, octaneTarget, 'onPointerDown', downEvent);
	expect(pair.octaneControls.enabled).toBe(false);
	await fireOctane(pair.octaneRoot.store, octaneTarget, 'onPointerMove', moveEvent);
	await fireOctane(pair.octaneRoot.store, octaneTarget, 'onPointerUp', event());
	expect(
		pair.octaneCalls.start.mock.calls.map((call) => [call[0].component, call[0].axis]),
	).toEqual(pair.reactCalls.start.mock.calls.map((call) => [call[0].component, call[0].axis]));
	if (compareMatrices) {
		expect(pair.octaneCalls.drag.mock.calls.at(-1)!.map(rounded)).toEqual(
			pair.reactCalls.drag.mock.calls.at(-1)!.map(rounded),
		);
	}
	expect(pair.octaneCalls.end).toHaveBeenCalledTimes(1);
	expect(pair.octaneControls.enabled).toBe(true);
	return reactTarget;
}

describe('PivotControls', () => {
	it('matches axes, visibility, active/disabled transforms, fixed sizing, anchor, offset and rotation', async () => {
		const pair = await mountPair({
			activeAxes: [true, false, false],
			disableRotations: true,
			visible: false,
			fixed: true,
			scale: 80,
			offset: [2, 3, 4],
			rotation: [0.1, 0.2, 0.3],
			anchor: [1, 0, 0],
			lineWidth: 6,
			opacity: 0.4,
			axisColors: ['red', 'green', 'blue'],
			hoveredColor: 'yellow',
			depthTest: false,
			renderOrder: 42,
			userData: { marker: true },
		});
		await advance(pair);
		const reactGizmo = pair.reactRef.children[0],
			octaneGizmo = pair.octaneRef.children[0];
		expect(octaneGizmo.children).toHaveLength(reactGizmo.children.length);
		expect(octaneGizmo.children).toHaveLength(2);
		expect(octaneGizmo.visible).toBe(reactGizmo.visible);
		expect(octaneGizmo.position.toArray()).toEqual(reactGizmo.position.toArray());
		expect(octaneGizmo.rotation.toArray()).toEqual(reactGizmo.rotation.toArray());
		expect(octaneGizmo.scale.toArray()).toEqual(reactGizmo.scale.toArray());
		pair.octaneRoot.unmount();
		await act(async () => pair.reactRoot.unmount());

		const disabled = await mountPair({ enabled: false });
		expect(disabled.octaneRef.children[0].children).toHaveLength(0);
		expect(disabled.reactRef.children[0].children).toHaveLength(0);
		disabled.octaneRoot.unmount();
		await act(async () => disabled.reactRoot.unmount());
	});

	it('matches arrow drag lifecycle, limits, matrix tuples, autoTransform, controls gating and propagation', async () => {
		const reactCalls = { start: vi.fn(), drag: vi.fn(), end: vi.fn() },
			octaneCalls = { start: vi.fn(), drag: vi.fn(), end: vi.fn() };
		const pair = await mountPair({
			activeAxes: [true, false, false],
			disableSliders: true,
			disableRotations: true,
			disableScaling: true,
			translationLimits: [[-0.5, 0.5], undefined, undefined],
			onDragStart: reactCalls.start,
			onDrag: reactCalls.drag,
			onDragEnd: reactCalls.end,
		});
		// Give Octane independent spies after mount while preserving equivalent props through a rerender.
		pair.octaneRoot.render(PivotControlsScene, {
			activeAxes: [true, false, false],
			disableSliders: true,
			disableRotations: true,
			disableScaling: true,
			translationLimits: [[-0.5, 0.5], undefined, undefined],
			controls: pair.octaneControls,
			controlRef: () => {},
			onDragStart: octaneCalls.start,
			onDrag: octaneCalls.drag,
			onDragEnd: octaneCalls.end,
		});
		await act(async () => {
			for (let i = 0; i < 4; i++) await Promise.resolve();
		});
		const reactTarget = reactTargets(pair.reactRef.children[0])[0],
			octaneTarget = pair.octaneRef.children[0].children[0].children[0] as THREE.Group;
		const down = event();
		reactTarget.__r3f!.handlers.onPointerDown(down);
		expect(pair.reactControls.enabled).toBe(false);
		reactTarget.__r3f!.handlers.onPointerMove(event(new THREE.Vector3(2, 0, 5)));
		reactTarget.__r3f!.handlers.onPointerUp(event());
		Object.assign(octaneTarget, capture());
		await fireOctane(pair.octaneRoot.store, octaneTarget, 'onPointerDown', event());
		expect(pair.octaneControls.enabled).toBe(false);
		await fireOctane(
			pair.octaneRoot.store,
			octaneTarget,
			'onPointerMove',
			event(new THREE.Vector3(2, 0, 5)),
		);
		await fireOctane(pair.octaneRoot.store, octaneTarget, 'onPointerUp', event());
		expect(octaneCalls.start.mock.calls.map((call) => [call[0].component, call[0].axis])).toEqual(
			reactCalls.start.mock.calls.map((call) => [call[0].component, call[0].axis]),
		);
		expect(octaneCalls.drag).toHaveBeenCalledTimes(reactCalls.drag.mock.calls.length);
		expect(octaneCalls.drag.mock.calls.at(-1)!.map(rounded)).toEqual(
			reactCalls.drag.mock.calls.at(-1)!.map(rounded),
		);
		expect(octaneCalls.end).toHaveBeenCalledTimes(reactCalls.end.mock.calls.length);
		expect(pair.octaneControls.enabled).toBe(true);
		expect(pair.octaneRef.matrix.elements[12]).toBe(pair.reactRef.matrix.elements[12]);
		pair.octaneRoot.unmount();
		await act(async () => pair.reactRoot.unmount());
	});

	it('matches PlaneSlider decomposition, independent axis limits, lifecycle and callback matrices', async () => {
		const pair = await interactionPair({
			disableAxes: true,
			disableRotations: true,
			disableScaling: true,
			activeAxes: [true, true, false],
			translationLimits: [[-0.25, 0.25], [-0.5, 0.5], undefined],
		});
		const target = pair.octaneRef.children[0].children[0].children[0].children[0];
		await dragPair(pair, target, event(), event(new THREE.Vector3(0.8, 0.9, 5)));
		const deltaWorld = pair.octaneCalls.drag.mock.calls.at(-1)![3] as THREE.Matrix4;
		expect([deltaWorld.elements[12], deltaWorld.elements[13]]).toEqual([0.25, 0.5]);
		const intersectPlane = vi.spyOn(THREE.Ray.prototype, 'intersectPlane');
		await fireOctane(pair.octaneRoot.store, target, 'onPointerDown', event());
		intersectPlane.mockClear();
		await fireOctane(
			pair.octaneRoot.store,
			target,
			'onPointerMove',
			event(new THREE.Vector3(0.1, 0.2, 5)),
		);
		expect(intersectPlane).toHaveBeenCalledTimes(1);
		await fireOctane(pair.octaneRoot.store, target, 'onPointerUp', event());
		intersectPlane.mockRestore();
		pair.octaneRoot.unmount();
		await act(async () => pair.reactRoot.unmount());
	});

	it('matches AxisRotator angle math, shift snapping, limits, lifecycle and callback matrices', async () => {
		const pair = await interactionPair({
			disableAxes: true,
			disableSliders: true,
			disableScaling: true,
			activeAxes: [true, true, false],
			rotationLimits: [undefined, undefined, [-0.2, 0.2]],
		});
		const target = pair.octaneRef.children[0].children[0];
		const click = new THREE.Vector3(1, 0, 0);
		const hit = new THREE.Vector3(Math.cos(Math.PI / 6), Math.sin(Math.PI / 6), 5);
		await dragPair(
			pair,
			target,
			event(new THREE.Vector3(0, 0, 5), click),
			event(hit, click, { shiftKey: true }),
		);
		const deltaWorld = pair.octaneCalls.drag.mock.calls.at(-1)![3] as THREE.Matrix4;
		expect(Number(Math.atan2(deltaWorld.elements[1], deltaWorld.elements[0]).toFixed(6))).toBe(0.2);
		pair.octaneRoot.unmount();
		await act(async () => pair.reactRoot.unmount());
	});

	it('matches ScalingSphere scale math, shift snapping, pinned scaleLimits omission and mesh reset', async () => {
		const pair = await interactionPair({
			disableAxes: true,
			disableSliders: true,
			disableRotations: true,
			activeAxes: [true, false, false],
			scaleLimits: [[0.5, 1.4], undefined, undefined],
		});
		const target = pair.octaneRef.children[0].children[0].children[0];
		const sphere = target.children.find((child) => child instanceof THREE.Mesh) as THREE.Mesh;
		await dragPair(
			pair,
			target,
			event(),
			event(new THREE.Vector3(3, 0, 5), new THREE.Vector3(), { shiftKey: true }),
		);
		const deltaWorld = pair.octaneCalls.drag.mock.calls.at(-1)![3] as THREE.Matrix4;
		expect(Number(deltaWorld.elements[0].toFixed(6))).toBe(1.5);
		// Pinned parity: scaleLimits is accepted publicly but omitted from the provider.
		const reactDeltaWorld = pair.reactCalls.drag.mock.calls.at(-1)![3] as THREE.Matrix4;
		expect(Number(reactDeltaWorld.elements[0].toFixed(6))).toBe(1.5);
		expect(sphere.position.y).toBe(1.2);
		pair.octaneRoot.unmount();
		await act(async () => pair.reactRoot.unmount());
	});

	it('matches annotations, class, line/hover options, DOM lifecycle and full control count', async () => {
		const pair = await mountPair({
			annotations: true,
			annotationsClass: 'pivot-note',
			lineWidth: 8,
			opacity: 0.25,
			axisColors: ['#111111', '#222222', '#333333'],
			hoveredColor: '#abcdef',
		});
		expect(pair.octaneRef.children[0].children).toHaveLength(
			pair.reactRef.children[0].children.length,
		);
		expect(pair.octaneRef.children[0].children).toHaveLength(12);
		expect(pair.octaneHost.querySelectorAll('.pivot-note')).toHaveLength(
			pair.reactHost.querySelectorAll('.pivot-note').length,
		);
		expect(pair.octaneHost.querySelectorAll('.pivot-note')).toHaveLength(12);
		pair.octaneRoot.unmount();
		await act(async () => pair.reactRoot.unmount());
		expect(pair.octaneHost.querySelector('.pivot-note')).toBeNull();
	});

	it('matches controlled matrix identity and the autoTransform=false negative control', async () => {
		const matrix = new THREE.Matrix4().makeTranslation(3, 4, 5);
		const pair = await mountPair({
			matrix,
			autoTransform: false,
			activeAxes: [true, false, false],
			disableSliders: true,
			disableRotations: true,
			disableScaling: true,
		});
		await advance(pair);
		expect(pair.octaneRef.matrix).toBe(matrix);
		expect(pair.reactRef.matrix).toBe(matrix);
		const reactTarget = reactTargets(pair.reactRef.children[0])[0];
		const octaneTarget = pair.octaneRef.children[0].children[0].children[0] as THREE.Group;
		reactTarget.__r3f!.handlers.onPointerDown(event());
		reactTarget.__r3f!.handlers.onPointerMove(event(new THREE.Vector3(2, 0, 5)));
		reactTarget.__r3f!.handlers.onPointerUp(event());
		Object.assign(octaneTarget, capture());
		await fireOctane(pair.octaneRoot.store, octaneTarget, 'onPointerDown', event());
		await fireOctane(
			pair.octaneRoot.store,
			octaneTarget,
			'onPointerMove',
			event(new THREE.Vector3(2, 0, 5)),
		);
		await fireOctane(pair.octaneRoot.store, octaneTarget, 'onPointerUp', event());
		expect(pair.octaneRef.matrix.elements).toEqual(pair.reactRef.matrix.elements);
		expect(pair.octaneRef.matrix.elements[12]).toBe(3);
		pair.octaneRoot.unmount();
		await act(async () => pair.reactRoot.unmount());
	});

	it('exports the public runtime and props family', () =>
		expect(PivotControls).toBeTypeOf('function'));
});
