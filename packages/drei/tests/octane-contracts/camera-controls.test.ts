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
import { CameraControlsScene } from '../_fixtures/camera-controls.three.tsrx';

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

describe('CameraControls (Octane-only contracts)', () => {
	it('does not regress performance when regress is false', async () => {
		let controls!: CameraControlsImpl;
		const root = await createOctaneThree(CameraControlsScene, {
			makeDefault: false,
			regress: false,
			minDistance: 0,
			maxDistance: Infinity,
			smoothTime: 0.25,
			...callbacks(),
			ref: (value: CameraControlsImpl) => (controls = value),
		});
		const regress = vi.spyOn(root.store.getState().performance, 'regress');
		controls.dispatchEvent({ type: 'control' } as any);
		expect(regress).not.toHaveBeenCalled();
		root.unmount();
	});
});
