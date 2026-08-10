import * as React from 'react';
import {
	act as reactThreeAct,
	advance as reactAdvance,
	createRoot as createReactThreeRoot,
	useThree as reactUseThree,
	type RootState as ReactRootState,
} from '@react-three/fiber';
import { CameraControls as ReactCameraControls } from '@react-three/drei/core/CameraControls.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import CameraControlsImpl from 'camera-controls';
import { CameraControlsScene } from './_fixtures/camera-controls.three.tsrx';

beforeAll(() => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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

function callbacks() {
	return {
		onControlStart: vi.fn(),
		onControl: vi.fn(),
		onControlEnd: vi.fn(),
		onTransitionStart: vi.fn(),
		onUpdate: vi.fn(),
		onWake: vi.fn(),
		onRest: vi.fn(),
		onSleep: vi.fn(),
		onStart: vi.fn(),
		onEnd: vi.fn(),
		onChange: vi.fn(),
	};
}

function snapshot(controls: CameraControlsImpl) {
	return {
		minDistance: controls.minDistance,
		maxDistance: controls.maxDistance,
		smoothTime: controls.smoothTime,
		cameraType: controls.camera.type,
		connected: (controls as any)._domElement?.tagName ?? null,
	};
}

describe('CameraControls', () => {
	it('matches props, default takeover, event aliases, frame updates, and disconnection', async () => {
		const props = {
			makeDefault: true,
			regress: false,
			minDistance: 2,
			maxDistance: 40,
			smoothTime: 0.4,
		};
		const reactCallbacks = callbacks();
		let reactControls!: CameraControlsImpl;
		let reactState!: ReactRootState;
		function ReactScene() {
			reactState = reactUseThree();
			return React.createElement(ReactCameraControls, {
				...props,
				...reactCallbacks,
				ref: (value) => (reactControls = value!),
			});
		}
		const canvas = document.createElement('canvas');
		const reactRoot = createReactThreeRoot(canvas);
		await reactRoot.configure({ gl: renderer(canvas), frameloop: 'never', dpr: 1 });
		await reactThreeAct(async () => reactRoot.render(React.createElement(ReactScene)));

		const octaneCallbacks = callbacks();
		let octaneControls!: CameraControlsImpl;
		const octaneRoot = await createOctaneThree(CameraControlsScene, {
			...props,
			...octaneCallbacks,
			ref: (value: CameraControlsImpl) => (octaneControls = value),
		});
		expect(snapshot(octaneControls)).toEqual(snapshot(reactControls));
		expect(octaneRoot.store.getState().controls).toBe(octaneControls);
		expect(reactState.controls).toBe(reactControls);

		for (const group of [reactCallbacks, octaneCallbacks]) {
			for (const callback of Object.values(group)) callback.mockClear();
		}
		for (const type of [
			'controlstart',
			'control',
			'controlend',
			'transitionstart',
			'update',
			'wake',
			'rest',
			'sleep',
		]) {
			reactControls.dispatchEvent({ type } as any);
			octaneControls.dispatchEvent({ type } as any);
		}
		for (const name of Object.keys(reactCallbacks) as Array<keyof typeof reactCallbacks>) {
			expect(octaneCallbacks[name].mock.calls.length).toBe(reactCallbacks[name].mock.calls.length);
		}

		const reactUpdate = vi.spyOn(reactControls, 'update');
		const octaneUpdate = vi.spyOn(octaneControls, 'update');
		reactAdvance(0.25, true, reactState);
		octaneRoot.advanceFrames(1, 0.25);
		expect(octaneUpdate.mock.calls).toEqual(reactUpdate.mock.calls);

		const mountedReact = reactControls;
		const mountedOctane = octaneControls;
		octaneRoot.unmount();
		await reactThreeAct(async () => reactRoot.unmount());
		expect((mountedOctane as any)._domElement).toBe((mountedReact as any)._domElement);
		expect(octaneRoot.store.getState().controls).toBe(reactState.get().controls);
	});
});
