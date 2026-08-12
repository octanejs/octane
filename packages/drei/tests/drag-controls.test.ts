import * as React from 'react';
import { act, createRoot, extend, useThree, type RootState } from '@react-three/fiber';
import { DragControls as ReactDragControls } from '@react-three/drei/web/DragControls.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { DragControlsScene } from './_fixtures/drag-controls.three.tsrx';

beforeAll(() => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	extend(THREE as unknown as Record<string, new (...args: any[]) => any>);
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
	} as unknown as THREE.WebGLRenderer;
}

type EventGroup = THREE.Group & { __r3f?: { handlers: Record<string, (event: any) => void> } };
function captureTarget() {
	return {
		setPointerCapture() {},
		releasePointerCapture() {},
		hasPointerCapture() {
			return false;
		},
	};
}
function pointerEvent(
	group: EventGroup,
	type: 'onPointerDown' | 'onPointerMove' | 'onPointerUp',
	x: number,
	y: number,
) {
	group.__r3f!.handlers[type]({
		pointerId: 1,
		pointerType: 'mouse',
		buttons: type === 'onPointerUp' ? 0 : 1,
		clientX: x,
		clientY: y,
		timeStamp: type === 'onPointerDown' ? 1 : type === 'onPointerMove' ? 17 : 33,
		target: captureTarget(),
		currentTarget: captureTarget(),
		point: new THREE.Vector3(0, 0, 0),
		stopPropagation() {},
		preventDefault() {},
	});
}
function matrices(call: any[]) {
	return call
		.slice(0, 4)
		.map((matrix: THREE.Matrix4) => matrix.elements.map((value) => Number(value.toFixed(6))));
}

describe('DragControls', () => {
	it('matches React drag callbacks, limits, matrix transforms, controls gating, and imperative refs', async () => {
		const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
		camera.position.z = 5;
		camera.updateMatrixWorld();
		const reactControls = { enabled: true };
		const reactStartStates: boolean[] = [];
		const reactCalls = {
			start: vi.fn(() => reactStartStates.push(reactControls.enabled)),
			drag: vi.fn(),
			end: vi.fn(),
			hover: vi.fn(),
		};
		let reactGroup!: EventGroup;
		let reactState!: RootState;
		function Capture() {
			reactState = useThree();
			reactState.controls = reactControls as any;
			return null;
		}
		const canvas = document.createElement('canvas');
		const reactRoot = createRoot(canvas);
		await reactRoot.configure({
			gl: renderer(canvas),
			camera,
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
						ReactDragControls,
						{
							ref: (value: THREE.Group) => (reactGroup = value),
							axisLock: 'z',
							dragLimits: [[-0.5, 0.5], [-0.25, 0.25], undefined],
							onHover: reactCalls.hover,
							onDragStart: reactCalls.start,
							onDrag: reactCalls.drag,
							onDragEnd: reactCalls.end,
						},
						React.createElement('mesh'),
					),
				),
			),
		);

		const octaneControls = { enabled: true };
		const octaneStartStates: boolean[] = [];
		const octaneCalls = {
			start: vi.fn(() => octaneStartStates.push(octaneControls.enabled)),
			drag: vi.fn(),
			end: vi.fn(),
			hover: vi.fn(),
		};
		let octaneGroup!: EventGroup;
		const octane = await createOctaneThree(
			DragControlsScene,
			{
				controls: octaneControls,
				controlRef: (value: THREE.Group) => (octaneGroup = value),
				autoTransform: true,
				matrix: undefined,
				axisLock: 'z',
				dragLimits: [[-0.5, 0.5], [-0.25, 0.25], undefined],
				onHover: octaneCalls.hover,
				onDragStart: octaneCalls.start,
				onDrag: octaneCalls.drag,
				onDragEnd: octaneCalls.end,
				dragConfig: undefined,
			},
			{ width: 400, height: 400, camera: camera.clone() },
		);

		pointerEvent(reactGroup, 'onPointerDown', 200, 200);
		pointerEvent(reactGroup, 'onPointerMove', 260, 230);
		pointerEvent(reactGroup, 'onPointerUp', 260, 230);
		Object.assign(octaneGroup, captureTarget());
		await octane.fireEvent(octaneGroup, 'pointerDown', {
			pointerId: 1,
			pointerType: 'mouse',
			buttons: 1,
			clientX: 200,
			clientY: 200,
			timeStamp: 1,
			point: new THREE.Vector3(),
		});
		await octane.fireEvent(octaneGroup, 'pointerMove', {
			pointerId: 1,
			pointerType: 'mouse',
			buttons: 1,
			clientX: 260,
			clientY: 230,
			timeStamp: 17,
			point: new THREE.Vector3(),
		});
		await octane.fireEvent(octaneGroup, 'pointerUp', {
			pointerId: 1,
			pointerType: 'mouse',
			buttons: 0,
			clientX: 260,
			clientY: 230,
			timeStamp: 33,
			point: new THREE.Vector3(),
		});
		expect(octaneCalls.start.mock.calls.map((call) => call[0].toArray())).toEqual(
			reactCalls.start.mock.calls.map((call) => call[0].toArray()),
		);
		expect(octaneStartStates).toEqual(reactStartStates);
		expect(octaneStartStates).toEqual([false]);
		expect(octaneCalls.drag).toHaveBeenCalledTimes(reactCalls.drag.mock.calls.length);
		expect(matrices(octaneCalls.drag.mock.calls.at(-1)!)).toEqual(
			matrices(reactCalls.drag.mock.calls.at(-1)!),
		);
		expect(octaneCalls.end).toHaveBeenCalledTimes(reactCalls.end.mock.calls.length);
		expect(octaneControls.enabled).toBe(reactControls.enabled);
		expect(octaneGroup.matrix.elements).toEqual(reactGroup.matrix.elements);
		expect(octaneGroup.matrixAutoUpdate).toBe(reactGroup.matrixAutoUpdate);
		expect(octaneGroup).not.toBe(reactGroup);

		octaneGroup.matrix.elements[12] += 1;
		expect(octaneGroup.matrix.elements).not.toEqual(reactGroup.matrix.elements);
		octane.unmount();
		await act(async () => reactRoot.unmount());
	});
});
