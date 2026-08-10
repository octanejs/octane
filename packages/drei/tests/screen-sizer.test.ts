import * as React from 'react';
import {
	act as reactThreeAct,
	advance as reactAdvance,
	createRoot as createReactThreeRoot,
	extend as extendReactThree,
	useThree as reactUseThree,
	type RootState as ReactRootState,
} from '@react-three/fiber';
import { ScreenSizer as ReactScreenSizer } from '@react-three/drei/core/ScreenSizer.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ScreenSizerScene } from './_fixtures/screen-sizer.three.tsrx';

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

async function reactSizer(camera: THREE.Camera, props: Record<string, unknown>) {
	const canvas = document.createElement('canvas');
	const root = createReactThreeRoot(canvas);
	let get!: () => ReactRootState;
	let value: THREE.Object3D | null = null;
	function Scene() {
		get = reactUseThree((state) => state.get);
		return React.createElement(
			ReactScreenSizer,
			{ ...props, ref: (object: THREE.Object3D | null) => (value = object), name: 'screen-sizer' },
			React.createElement('object3D', { name: 'content' }),
		);
	}
	await root.configure({
		gl: renderer(canvas),
		camera,
		frameloop: 'never',
		size: { width: 800, height: 400, top: 0, left: 0 },
	});
	await reactThreeAct(async () => root.render(React.createElement(Scene)));
	return { root, getState: () => get(), value: value! as THREE.Object3D };
}

describe('ScreenSizer', () => {
	it.each([
		['perspective', () => new THREE.PerspectiveCamera(60, 2, 0.1, 100)],
		['orthographic', () => new THREE.OrthographicCamera(-4, 4, 2, -2, 0.1, 100)],
	])('matches %s screen-space scaling, props, children, and refs', async (_, createCamera) => {
		const reactCamera = createCamera();
		const octaneCamera = createCamera();
		for (const camera of [reactCamera, octaneCamera]) {
			camera.position.set(3, 4, 10);
			camera.lookAt(0, 0, 0);
			camera.updateProjectionMatrix();
			camera.updateMatrixWorld();
		}
		const props = { scale: 2.5, position: [1, -1, 0] };
		const react = await reactSizer(reactCamera, props);
		let octaneValue: THREE.Object3D | null = null;
		const octane = await createOctaneThree(
			ScreenSizerScene,
			{ ...props, sizerRef: (object: THREE.Object3D | null) => (octaneValue = object) },
			{ width: 800, height: 400, camera: octaneCamera },
		);
		react.value.updateMatrixWorld();
		octaneValue!.updateMatrixWorld();
		reactAdvance(1, true, react.getState());
		octane.advanceFrames(1, 1);
		expect(octaneValue!.scale.toArray()).toEqual(react.value.scale.toArray());
		expect(octaneValue!.position.toArray()).toEqual(react.value.position.toArray());
		expect(octaneValue!.children[0].name).toBe(react.value.children[0].name);
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
	});
});
