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
import { SoftShadowsScene } from '../_fixtures/soft-shadows.three.tsrx';

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

describe('SoftShadows (Octane-only contracts)', () => {
	it('does not retain a global shader mutation after unmount', async () => {
		const original = THREE.ShaderChunk.shadowmap_pars_fragment;
		const canvas = document.createElement('canvas');
		const root = createOctaneThreeRoot(canvas);
		await root.configure({ gl: renderer(canvas), frameloop: 'never', dpr: 1 });
		await octaneAct(async () =>
			root.render(SoftShadowsScene, {
				focus: 0,
				samples: 10,
				size: 25,
				materialRef: () => {},
			}),
		);
		expect(THREE.ShaderChunk.shadowmap_pars_fragment).not.toBe(original);
		root.unmount();
		await octaneAct(async () => undefined);
		expect(THREE.ShaderChunk.shadowmap_pars_fragment).toBe(original);
	});
});
