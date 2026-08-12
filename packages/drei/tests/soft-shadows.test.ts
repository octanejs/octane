import * as React from 'react';
import {
	act as reactThreeAct,
	createRoot as createReactThreeRoot,
	extend as extendReactThree,
} from '@react-three/fiber';
import { SoftShadows as ReactSoftShadows } from '@react-three/drei/core/softShadows.js';
import { createRoot as createOctaneThreeRoot } from '@octanejs/three';
import { act as octaneAct } from 'octane';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { SoftShadowsScene } from './_fixtures/soft-shadows.three.tsrx';

beforeAll(() => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	extendReactThree(THREE as unknown as Record<string, new (...args: any[]) => any>);
});

type Recorder = THREE.WebGLRenderer & {
	compileCalls: Array<[THREE.Object3D, THREE.Camera]>;
	removeCalls: unknown[];
};

function renderer(canvas: HTMLCanvasElement): Recorder {
	const compileCalls: Array<[THREE.Object3D, THREE.Camera]> = [];
	const removeCalls: unknown[] = [];
	return {
		domElement: canvas,
		outputColorSpace: THREE.SRGBColorSpace,
		toneMapping: THREE.NoToneMapping,
		compileCalls,
		removeCalls,
		properties: { remove: (material: unknown) => void removeCalls.push(material) },
		info: { programs: [{}, {}] },
		compile: (scene, camera) => void compileCalls.push([scene, camera]),
		render() {},
		setPixelRatio() {},
		setSize() {},
		renderLists: { dispose() {} },
		forceContextLoss() {},
		dispose() {},
	} as unknown as Recorder;
}

describe('SoftShadows', () => {
	it('matches the pinned React Drei shader patch, material reset, compile, and restoration', async () => {
		const original = THREE.ShaderChunk.shadowmap_pars_fragment;
		const props = { focus: 1.25, samples: 6, size: 18 };
		let reactMaterial!: THREE.MeshBasicMaterial;
		const reactCanvas = document.createElement('canvas');
		const reactRenderer = renderer(reactCanvas);
		const reactRoot = createReactThreeRoot(reactCanvas);
		await reactRoot.configure({ gl: reactRenderer, frameloop: 'never', dpr: 1 });
		await reactThreeAct(async () =>
			reactRoot.render(
				React.createElement(
					React.Fragment,
					{},
					React.createElement(
						'mesh',
						{},
						React.createElement('boxGeometry'),
						React.createElement('meshBasicMaterial', { ref: (value) => (reactMaterial = value!) }),
					),
					React.createElement(ReactSoftShadows, props),
				),
			),
		);
		const reactShader = THREE.ShaderChunk.shadowmap_pars_fragment;
		expect(reactShader).toContain('#define PENUMBRA_FILTER_SIZE float(18)');
		expect(reactShader).toContain('for(int i = 0; i < 6; i ++)');
		expect(reactShader).toContain('float blockerDepthSum = float(1.25)');
		expect(reactRenderer.compileCalls).toHaveLength(1);
		expect(reactRenderer.removeCalls).toContain(reactMaterial);
		await reactThreeAct(async () => reactRoot.unmount());
		expect(THREE.ShaderChunk.shadowmap_pars_fragment).toBe(original);

		let octaneMaterial!: THREE.MeshBasicMaterial;
		const octaneCanvas = document.createElement('canvas');
		const octaneRenderer = renderer(octaneCanvas);
		const octaneRoot = createOctaneThreeRoot(octaneCanvas);
		await octaneRoot.configure({ gl: octaneRenderer, frameloop: 'never', dpr: 1 });
		await octaneAct(async () =>
			octaneRoot.render(SoftShadowsScene, {
				...props,
				materialRef: (value: THREE.MeshBasicMaterial) => (octaneMaterial = value),
			}),
		);
		expect(THREE.ShaderChunk.shadowmap_pars_fragment).toBe(reactShader);
		expect(octaneRenderer.compileCalls).toHaveLength(1);
		expect(octaneRenderer.removeCalls).toContain(octaneMaterial);
		octaneRoot.unmount();
		await octaneAct(async () => undefined);
		expect(THREE.ShaderChunk.shadowmap_pars_fragment).toBe(original);
		expect(octaneRenderer.compileCalls).toHaveLength(2);
		expect(reactRenderer.compileCalls).toHaveLength(2);
	});
});
