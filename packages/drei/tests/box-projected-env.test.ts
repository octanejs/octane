import * as React from 'react';
import {
	act as reactThreeAct,
	createRoot as createReactThreeRoot,
	extend as extendReactThree,
} from '@react-three/fiber';
import { useBoxProjectedEnv as reactUseBoxProjectedEnv } from '@react-three/drei/core/useBoxProjectedEnv.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BoxProjectedEnvScene } from './_fixtures/box-projected-env.three.tsrx';

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

async function reactRoot(Component: React.ComponentType) {
	const canvas = document.createElement('canvas');
	const root = createReactThreeRoot(canvas);
	await root.configure({
		gl: renderer(canvas),
		frameloop: 'never',
		dpr: 1,
		size: { width: 400, height: 200, top: 0, left: 0 },
	});
	await reactThreeAct(async () => root.render(React.createElement(Component)));
	return root;
}

describe('useBoxProjectedEnv', () => {
	it('matches shader patching, uniforms, cache keys, and material refs', async () => {
		const position: [number, number, number] = [1, 2, 3];
		const size: [number, number, number] = [10, 20, 30];
		let reactSpread!: ReturnType<typeof reactUseBoxProjectedEnv>;
		function ReactScene() {
			reactSpread = reactUseBoxProjectedEnv(position, size);
			return React.createElement(
				'mesh',
				null,
				React.createElement('meshStandardMaterial', reactSpread),
			);
		}
		const react = await reactRoot(ReactScene);
		let octaneSpread!: typeof reactSpread;
		const octane = await createOctaneThree(BoxProjectedEnvScene, {
			position,
			size,
			onSpread: (spread: typeof reactSpread) => (octaneSpread = spread),
		});

		const shader = () => ({
			defines: {},
			uniforms: {},
			vertexShader: '#include <worldpos_vertex>',
			fragmentShader:
				'#include <envmap_physical_pars_fragment>\nvec3 worldNormal = inverseTransformDirection( normal, viewMatrix );\nreflectVec = inverseTransformDirection( reflectVec, viewMatrix );',
		});
		const reactShader = shader();
		const octaneShader = shader();
		reactSpread.onBeforeCompile(reactShader as any);
		octaneSpread.onBeforeCompile(octaneShader as any);
		expect(octaneShader).toEqual(reactShader);
		expect(octaneSpread.customProgramCacheKey()).toBe(reactSpread.customProgramCacheKey());
		expect(octaneSpread.ref.current).toBeInstanceOf(THREE.MeshStandardMaterial);
		expect(reactSpread.ref.current).toBeInstanceOf(THREE.MeshStandardMaterial);

		octane.unmount();
		await reactThreeAct(async () => react.unmount());
	});
});
