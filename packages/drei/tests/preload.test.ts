import * as React from 'react';
import {
	act as reactThreeAct,
	createRoot as createReactThreeRoot,
	extend as extendReactThree,
	useThree as reactUseThree,
	type RootState as ReactRootState,
} from '@react-three/fiber';
import { Preload as ReactPreload } from '@react-three/drei/core/Preload.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PreloadScene } from './_fixtures/preload.three.tsrx';

const originalUpdate = THREE.CubeCamera.prototype.update;
const originalDispose = THREE.WebGLCubeRenderTarget.prototype.dispose;
const cubeCalls: Array<{ scene: THREE.Scene; hiddenVisible: boolean | undefined }> = [];
let disposals = 0;

beforeAll(() => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	extendReactThree(THREE as unknown as Record<string, new (...args: any[]) => any>);
	THREE.CubeCamera.prototype.update = function (_renderer, scene) {
		cubeCalls.push({
			scene,
			hiddenVisible: scene.getObjectByName('hidden')?.visible,
		});
	};
	THREE.WebGLCubeRenderTarget.prototype.dispose = function () {
		disposals++;
	};
});
afterAll(() => {
	THREE.CubeCamera.prototype.update = originalUpdate;
	THREE.WebGLCubeRenderTarget.prototype.dispose = originalDispose;
});

function renderer(
	canvas: HTMLCanvasElement,
	compileCalls: Array<[THREE.Object3D, THREE.Camera]>,
): THREE.WebGLRenderer {
	return {
		domElement: canvas,
		outputColorSpace: THREE.SRGBColorSpace,
		toneMapping: THREE.NoToneMapping,
		render() {},
		compile: (scene, camera) => void compileCalls.push([scene, camera]),
		setPixelRatio() {},
		setSize() {},
		renderLists: { dispose() {} },
		forceContextLoss() {},
		dispose() {},
	} as unknown as THREE.WebGLRenderer;
}

async function reactPreload(props: React.ComponentProps<typeof ReactPreload>) {
	const canvas = document.createElement('canvas');
	const compileCalls: Array<[THREE.Object3D, THREE.Camera]> = [];
	const root = createReactThreeRoot(canvas);
	let get!: () => ReactRootState;
	function Scene() {
		get = reactUseThree((state) => state.get);
		return React.createElement(
			React.Fragment,
			{},
			React.createElement(
				'group',
				{ name: 'default-content' },
				React.createElement('object3D', { name: 'hidden', visible: false }),
			),
			React.createElement(ReactPreload, props),
		);
	}
	await root.configure({ gl: renderer(canvas, compileCalls), frameloop: 'never' });
	await reactThreeAct(async () => root.render(React.createElement(Scene)));
	return { root, getState: () => get(), compileCalls };
}

describe('Preload', () => {
	it('matches default scene/camera compilation, invisible traversal, cube warming, and disposal', async () => {
		cubeCalls.length = 0;
		disposals = 0;
		const react = await reactPreload({ all: true });
		const reactCube = cubeCalls.at(-1)!;
		const octane = await createOctaneThree(PreloadScene, { all: true });
		const octaneCube = cubeCalls.at(-1)!;
		expect(octane.renderer.compileCalls).toHaveLength(react.compileCalls.length);
		expect(octane.renderer.compileCalls[0][0]).toBe(octane.scene);
		expect(react.compileCalls[0][0]).toBe(react.getState().scene);
		expect(octane.renderer.compileCalls[0][1].type).toBe(react.compileCalls[0][1].type);
		expect(octaneCube.hiddenVisible).toBe(reactCube.hiddenVisible);
		expect(octaneCube.hiddenVisible).toBe(true);
		expect(octane.scene.getObjectByName('hidden')!.visible).toBe(false);
		expect(react.getState().scene.getObjectByName('hidden')!.visible).toBe(false);
		expect(disposals).toBe(2);
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
	});

	it('matches explicit scene and camera selection without revealing hidden objects', async () => {
		cubeCalls.length = 0;
		const scene = new THREE.Scene();
		const hidden = new THREE.Object3D();
		hidden.name = 'hidden';
		hidden.visible = false;
		scene.add(hidden);
		const camera = new THREE.OrthographicCamera();
		const react = await reactPreload({ all: false, scene, camera });
		const reactCube = cubeCalls.at(-1)!;
		const octane = await createOctaneThree(PreloadScene, { all: false, scene, camera });
		const octaneCube = cubeCalls.at(-1)!;
		expect(react.compileCalls[0]).toEqual([scene, camera]);
		expect(octane.renderer.compileCalls[0]).toEqual([scene, camera]);
		expect(octaneCube.hiddenVisible).toBe(reactCube.hiddenVisible);
		expect(octaneCube.hiddenVisible).toBe(false);
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
	});
});
