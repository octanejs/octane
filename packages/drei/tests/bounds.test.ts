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
	Bounds as ReactBounds,
	useBounds as reactUseBounds,
	type BoundsApi as ReactBoundsApi,
} from '@react-three/drei/core/Bounds.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { BoundsApi } from '../src/index.js';
import { BoundsScene } from './_fixtures/bounds.three.tsrx';

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

async function reactRoot(element: React.ReactNode, camera?: THREE.Camera) {
	const canvas = document.createElement('canvas');
	const root = createReactThreeRoot(canvas);
	let get!: () => ReactRootState;
	function Capture() {
		get = reactUseThree((state) => state.get);
		return element;
	}
	await root.configure({
		gl: renderer(canvas),
		camera,
		frameloop: 'never',
		dpr: 1,
		size: { width: 400, height: 200, top: 0, left: 0 },
	});
	await reactThreeAct(async () => root.render(React.createElement(Capture)));
	return { root, getState: () => get() };
}

function sizeSnapshot(api: BoundsApi | ReactBoundsApi) {
	const value = api.getSize();
	return {
		min: value.box.min.toArray(),
		max: value.box.max.toArray(),
		size: value.size.toArray(),
		center: value.center.toArray(),
		distance: value.distance,
	};
}

function cameraSnapshot(camera: THREE.Camera) {
	return {
		position: camera.position.toArray(),
		quaternion: camera.quaternion.toArray(),
		up: camera.up.toArray(),
		near: camera.near,
		far: camera.far,
	};
}

describe('Bounds', () => {
	it('matches initial scene refresh, size calculation, explicit boxes, and fluent identity', async () => {
		let reactApi!: ReactBoundsApi;
		function ReactCapture() {
			reactApi = reactUseBounds();
			return null;
		}
		const react = await reactRoot(
			React.createElement(
				ReactBounds,
				{ margin: 1.5 },
				React.createElement(
					'mesh',
					{ position: [2, 3, 4] },
					React.createElement('boxGeometry', { args: [2, 4, 6] }),
					React.createElement('meshBasicMaterial'),
				),
				React.createElement(ReactCapture),
			),
		);
		let octaneApi!: BoundsApi;
		const octane = await createOctaneThree(
			BoundsScene,
			{
				maxDuration: 1,
				margin: 1.5,
				observe: false,
				fit: false,
				clip: false,
				interpolateFunc: undefined,
				onFit: undefined,
				onApi: (value: BoundsApi) => (octaneApi = value),
			},
			{ width: 400, height: 200 },
		);
		expect(sizeSnapshot(octaneApi)).toEqual(sizeSnapshot(reactApi));
		const explicit = new THREE.Box3(new THREE.Vector3(-5, -4, -3), new THREE.Vector3(5, 6, 7));
		expect(octaneApi.refresh(explicit)).toBe(octaneApi);
		expect(reactApi.refresh(explicit)).toBe(reactApi);
		expect(sizeSnapshot(octaneApi)).toEqual(sizeSnapshot(reactApi));
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
	});

	it('matches clip values, control updates, and perspective reset animation', async () => {
		let reactApi!: ReactBoundsApi;
		function ReactCapture() {
			reactApi = reactUseBounds();
			return null;
		}
		const react = await reactRoot(
			React.createElement(
				ReactBounds,
				{ margin: 1.2, maxDuration: 0.001 },
				React.createElement(
					'mesh',
					{ position: [2, 3, 4] },
					React.createElement('boxGeometry', { args: [2, 4, 6] }),
				),
				React.createElement(ReactCapture),
			),
		);
		let octaneApi!: BoundsApi;
		const octane = await createOctaneThree(
			BoundsScene,
			{
				maxDuration: 0.001,
				margin: 1.2,
				observe: false,
				fit: false,
				clip: false,
				interpolateFunc: undefined,
				onFit: undefined,
				onApi: (value: BoundsApi) => (octaneApi = value),
			},
			{ width: 400, height: 200 },
		);
		const makeControls = () => {
			const listeners = new Map<string, (event: unknown) => void>();
			return {
				target: new THREE.Vector3(),
				maxDistance: 0,
				updates: 0,
				update() {
					this.updates++;
				},
				addEventListener(type: string, callback: (event: unknown) => void) {
					listeners.set(type, callback);
				},
				removeEventListener(type: string) {
					listeners.delete(type);
				},
			};
		};
		const reactControls = makeControls();
		const octaneControls = makeControls();
		await reactThreeAct(async () => react.getState().set({ controls: reactControls as any }));
		octane.store.getState().set({ controls: octaneControls as any });
		for (let index = 0; index < 4; index++) await Promise.resolve();
		reactApi.refresh().clip().reset();
		octaneApi.refresh().clip().reset();
		expect(cameraSnapshot(octane.store.getState().camera)).toEqual(
			cameraSnapshot(react.getState().camera),
		);
		expect({ maxDistance: octaneControls.maxDistance, updates: octaneControls.updates }).toEqual({
			maxDistance: reactControls.maxDistance,
			updates: reactControls.updates,
		});
		for (const timestamp of [1000, 2000, 3000]) {
			reactAdvance(timestamp, true, react.getState());
			octane.advanceFrames(1, 1);
		}
		expect(cameraSnapshot(octane.store.getState().camera)).toEqual(
			cameraSnapshot(react.getState().camera),
		);
		expect(octaneControls.target.toArray()).toEqual(reactControls.target.toArray());
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
	});

	it('matches moveTo, lookAt, and deprecated to animation goals', async () => {
		let reactApi!: ReactBoundsApi;
		function ReactCapture() {
			reactApi = reactUseBounds();
			return null;
		}
		const react = await reactRoot(
			React.createElement(
				ReactBounds,
				{ maxDuration: 0.001 },
				React.createElement('mesh', null, React.createElement('boxGeometry')),
				React.createElement(ReactCapture),
			),
		);
		let octaneApi!: BoundsApi;
		const octane = await createOctaneThree(BoundsScene, {
			maxDuration: 0.001,
			margin: 1.2,
			observe: false,
			fit: false,
			clip: false,
			interpolateFunc: undefined,
			onFit: undefined,
			onApi: (value: BoundsApi) => (octaneApi = value),
		});
		for (const operation of [
			(api: BoundsApi | ReactBoundsApi) =>
				api.moveTo([8, 7, 6]).lookAt({ target: [1, 2, 3], up: [0, 0, 1] }),
			(api: BoundsApi | ReactBoundsApi) => api.to({ position: [-4, 5, 6], target: [0, 1, 0] }),
		]) {
			operation(reactApi);
			operation(octaneApi);
			for (const timestamp of [4000, 5000, 6000]) {
				reactAdvance(timestamp, true, react.getState());
				octane.advanceFrames(1, 1);
			}
			expect(cameraSnapshot(octane.store.getState().camera)).toEqual(
				cameraSnapshot(react.getState().camera),
			);
		}
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
	});

	it('matches orthographic fit zoom, onFit data, and animation', async () => {
		const reactCamera = new THREE.OrthographicCamera(-5, 5, 4, -4, 0.1, 1000);
		const octaneCamera = reactCamera.clone();
		reactCamera.position.set(0, 0, 10);
		octaneCamera.position.copy(reactCamera.position);
		reactCamera.updateMatrixWorld();
		octaneCamera.updateMatrixWorld();
		let reactApi!: ReactBoundsApi;
		let reactFit: ReturnType<ReactBoundsApi['getSize']> | undefined;
		function ReactCapture() {
			reactApi = reactUseBounds();
			return null;
		}
		const react = await reactRoot(
			React.createElement(
				ReactBounds,
				{
					margin: 1.25,
					maxDuration: 0.001,
					onFit: (value) => (reactFit = value),
				},
				React.createElement(
					'mesh',
					{ position: [2, 3, 4] },
					React.createElement('boxGeometry', { args: [2, 4, 6] }),
				),
				React.createElement(ReactCapture),
			),
			reactCamera,
		);
		let octaneApi!: BoundsApi;
		let octaneFit: ReturnType<BoundsApi['getSize']> | undefined;
		const octane = await createOctaneThree(
			BoundsScene,
			{
				maxDuration: 0.001,
				margin: 1.25,
				observe: false,
				fit: false,
				clip: false,
				interpolateFunc: undefined,
				onFit: (value: ReturnType<BoundsApi['getSize']>) => (octaneFit = value),
				onApi: (value: BoundsApi) => (octaneApi = value),
			},
			{ width: 400, height: 200, camera: octaneCamera },
		);
		reactApi.refresh().fit();
		octaneApi.refresh().fit();
		expect(sizeSnapshot(octaneApi)).toEqual(sizeSnapshot(reactApi));
		expect({ size: octaneFit!.size.toArray(), distance: octaneFit!.distance }).toEqual({
			size: reactFit!.size.toArray(),
			distance: reactFit!.distance,
		});
		for (const timestamp of [7000, 8000, 9000]) {
			reactAdvance(timestamp, true, react.getState());
			octane.advanceFrames(1, 1);
		}
		expect(octaneCamera.zoom).toBe(reactCamera.zoom);
		expect(octaneCamera.projectionMatrix.toArray()).toEqual(reactCamera.projectionMatrix.toArray());
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
	});
});
