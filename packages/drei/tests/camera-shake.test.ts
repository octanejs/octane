import * as React from 'react';
import {
	act as reactThreeAct,
	advance as reactAdvance,
	createRoot as createReactThreeRoot,
	useThree as reactUseThree,
	type RootState as ReactRootState,
} from '@react-three/fiber';
import {
	CameraShake as ReactCameraShake,
	type ShakeController as ReactShakeController,
} from '@react-three/drei/core/CameraShake.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { ShakeController } from '../src/index.js';
import { CameraShakeScene } from './_fixtures/camera-shake.three.tsrx';

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

async function reactRoot(props: React.ComponentProps<typeof ReactCameraShake>) {
	const canvas = document.createElement('canvas');
	const root = createReactThreeRoot(canvas);
	let get!: () => ReactRootState;
	let controller: ReactShakeController | undefined;
	function Scene() {
		get = reactUseThree((state) => state.get);
		return React.createElement(ReactCameraShake, {
			...props,
			ref: (value) => (controller = value),
		});
	}
	await root.configure({ gl: renderer(canvas), frameloop: 'never' });
	await reactThreeAct(async () => root.render(React.createElement(Scene)));
	return { root, getState: () => get(), controller: () => controller! };
}

describe('CameraShake', () => {
	it('matches controller clamping, deterministic rotation, and intensity decay', async () => {
		const props = {
			intensity: 0.8,
			decay: true,
			decayRate: 0.4,
			maxYaw: 0,
			maxPitch: 0,
			maxRoll: 0,
		};
		const react = await reactRoot(props);
		let octaneController!: ShakeController;
		const octane = await createOctaneThree(CameraShakeScene, {
			...props,
			shakeRef: (value: ShakeController | undefined) => {
				if (value) octaneController = value;
			},
		});
		for (const controller of [react.controller(), octaneController]) {
			controller.setIntensity(2);
			expect(controller.getIntensity()).toBe(1);
			controller.setIntensity(-2);
			expect(controller.getIntensity()).toBe(0);
			controller.setIntensity(0.8);
		}
		react.getState().camera.rotation.set(0.2, -0.3, 0.4);
		octane.store.getState().camera.rotation.set(0.2, -0.3, 0.4);
		reactAdvance(0.25, true, react.getState());
		octane.advanceFrames(1, 0.25);
		for (const axis of ['x', 'y', 'z'] as const)
			expect(octane.store.getState().camera.rotation[axis]).toBeCloseTo(
				react.getState().camera.rotation[axis],
			);
		expect(octaneController.getIntensity()).toBeCloseTo(react.controller().getIntensity());
		expect(octaneController.getIntensity()).toBeCloseTo(0.7);
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
	});

	it('keeps randomized shake within the same configured amplitude contract', async () => {
		const props = { intensity: 0.5, maxYaw: 0.2, maxPitch: 0.3, maxRoll: 0.4 };
		const react = await reactRoot(props);
		const octane = await createOctaneThree(CameraShakeScene, { ...props });
		reactAdvance(1, true, react.getState());
		octane.advanceFrames(1, 1);
		const bounds = (rotation: THREE.Euler) => [
			Math.abs(rotation.x) <= props.maxPitch * props.intensity ** 2,
			Math.abs(rotation.y) <= props.maxYaw * props.intensity ** 2,
			Math.abs(rotation.z) <= props.maxRoll * props.intensity ** 2,
		];
		expect(bounds(octane.store.getState().camera.rotation)).toEqual(
			bounds(react.getState().camera.rotation),
		);
		expect(bounds(octane.store.getState().camera.rotation)).toEqual([true, true, true]);
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
	});
});
