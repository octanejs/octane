import * as React from 'react';
import {
	act as reactThreeAct,
	advance as reactAdvance,
	createRoot as createReactThreeRoot,
	extend as extendReactThree,
	useThree as reactUseThree,
	type RootState as ReactRootState,
} from '@react-three/fiber';
import {
	MarchingCube as ReactMarchingCube,
	MarchingCubes as ReactMarchingCubes,
	MarchingPlane as ReactMarchingPlane,
} from '@react-three/drei/core/MarchingCubes.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { MarchingCubes as MarchingCubesImpl } from 'three-stdlib';
import { MarchingCubesScene } from './_fixtures/marching-cubes.three.tsrx';

beforeAll(() => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	extendReactThree(THREE as unknown as Record<string, new (...args: any[]) => any>);
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

type Calls = Array<[string, ...unknown[]]>;

function recordCalls(instance: MarchingCubesImpl, calls: Calls) {
	vi.spyOn(instance, 'update').mockImplementation(() => {
		calls.push(['update']);
	});
	vi.spyOn(instance, 'reset').mockImplementation(() => {
		calls.push(['reset']);
	});
	vi.spyOn(instance, 'addBall').mockImplementation((...args) => {
		calls.push(['addBall', ...args]);
	});
	vi.spyOn(instance, 'addPlaneY').mockImplementation((...args) => {
		calls.push(['addPlaneY', ...args]);
	});
}

async function reactMarching(color: THREE.Color) {
	const canvas = document.createElement('canvas');
	const root = createReactThreeRoot(canvas);
	let marching!: MarchingCubesImpl;
	let cube!: THREE.Group;
	let plane!: THREE.Group;
	let getState!: () => ReactRootState;
	function Capture() {
		getState = reactUseThree((state) => state.get);
		return null;
	}
	await root.configure({ gl: renderer(canvas), frameloop: 'never' });
	await reactThreeAct(async () =>
		root.render(
			React.createElement(
				React.Fragment,
				null,
				React.createElement(
					ReactMarchingCubes,
					{
						ref: (value: MarchingCubesImpl) => (marching = value),
						resolution: 20,
						maxPolyCount: 500,
						enableUvs: true,
						enableColors: true,
					},
					React.createElement(ReactMarchingCube, {
						ref: (value: THREE.Group) => (cube = value),
						position: [0.2, -0.4, 0.6],
						strength: 0.7,
						subtract: 9,
						color,
					}),
					React.createElement(ReactMarchingPlane, {
						ref: (value: THREE.Group) => (plane = value),
						planeType: 'y',
						strength: 0.3,
						subtract: 7,
					}),
				),
				React.createElement(Capture),
			),
		),
	);
	return { root, marching, cube, plane, getState };
}

describe('MarchingCubes', () => {
	it('matches construction, refs, reset-before-contributor frame order, and contributor arguments', async () => {
		const color = new THREE.Color('#4080c0');
		const react = await reactMarching(color);
		let octaneMarching!: MarchingCubesImpl;
		let octaneCube!: THREE.Group;
		let octanePlane!: THREE.Group;
		const octane = await createOctaneThree(MarchingCubesScene, {
			ref: (value: MarchingCubesImpl) => (octaneMarching = value),
			cubeRef: (value: THREE.Group) => (octaneCube = value),
			planeRef: (value: THREE.Group) => (octanePlane = value),
			resolution: 20,
			maxPolyCount: 500,
			enableUvs: true,
			enableColors: true,
			cubeStrength: 0.7,
			cubeSubtract: 9,
			color,
			planeType: 'y',
			planeStrength: 0.3,
			planeSubtract: 7,
		});
		expect(octaneCube.position.toArray()).toEqual(react.cube.position.toArray());
		expect(octanePlane.type).toBe(react.plane.type);
		expect(octaneMarching.isolation).toBe(react.marching.isolation);
		expect(octaneMarching.enableUvs).toBe(react.marching.enableUvs);
		expect(octaneMarching.enableColors).toBe(react.marching.enableColors);

		const reactCalls: Calls = [];
		const octaneCalls: Calls = [];
		recordCalls(react.marching, reactCalls);
		recordCalls(octaneMarching, octaneCalls);
		await reactThreeAct(async () => reactAdvance(1, true, react.getState()));
		octane.advanceFrames(1, 1);
		expect(octaneCalls).toEqual(reactCalls);
		expect(octaneCalls.map(([name]) => name)).toEqual(['update', 'reset', 'addBall', 'addPlaneY']);
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
	});
});
