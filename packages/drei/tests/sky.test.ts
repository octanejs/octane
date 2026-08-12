import * as React from 'react';
import {
	act as reactThreeAct,
	createRoot as createReactThreeRoot,
	extend as extendReactThree,
} from '@react-three/fiber';
import {
	Sky as ReactSky,
	calcPosFromAngles as reactCalcPosFromAngles,
} from '@react-three/drei/core/Sky.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Sky as SkyImpl } from 'three-stdlib';
import { calcPosFromAngles } from '../src/index.js';
import { SkyScene } from './_fixtures/sky.three.tsrx';

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

function snapshot(sky: SkyImpl) {
	return {
		scale: sky.scale.toArray(),
		mieCoefficient: sky.material.uniforms.mieCoefficient.value,
		mieDirectionalG: sky.material.uniforms.mieDirectionalG.value,
		rayleigh: sky.material.uniforms.rayleigh.value,
		turbidity: sky.material.uniforms.turbidity.value,
		sunPosition: sky.material.uniforms.sunPosition.value.toArray(),
	};
}

describe('Sky', () => {
	it('matches the upstream angle conversion and reuses a supplied vector', () => {
		const reactTarget = new THREE.Vector3(9, 9, 9);
		const octaneTarget = new THREE.Vector3(9, 9, 9);
		const reactPosition = reactCalcPosFromAngles(0.63, 0.17, reactTarget);
		const octanePosition = calcPosFromAngles(0.63, 0.17, octaneTarget);
		expect(octanePosition).toBe(octaneTarget);
		expect(octanePosition.toArray()).toEqual(reactPosition.toArray());
	});

	it('matches default and explicit sky uniforms, scale, and ref identity', async () => {
		const canvas = document.createElement('canvas');
		const reactRoot = createReactThreeRoot(canvas);
		let reactSky!: SkyImpl;
		await reactRoot.configure({ gl: renderer(canvas), frameloop: 'never' });
		await reactThreeAct(async () =>
			reactRoot.render(
				React.createElement(ReactSky, {
					ref: (value: SkyImpl) => (reactSky = value),
					distance: 750,
					inclination: 0.7,
					azimuth: 0.2,
					mieCoefficient: 0.01,
					mieDirectionalG: 0.65,
					rayleigh: 0.9,
					turbidity: 6,
				}),
			),
		);
		let octaneSky!: SkyImpl;
		const octane = await createOctaneThree(SkyScene, {
			ref: (value: SkyImpl) => (octaneSky = value),
			distance: 750,
			inclination: 0.7,
			azimuth: 0.2,
			sunPosition: undefined,
			mieCoefficient: 0.01,
			mieDirectionalG: 0.65,
			rayleigh: 0.9,
			turbidity: 6,
		});
		expect(octaneSky).toBe(octane.scene.children[0]);
		expect(snapshot(octaneSky)).toEqual(snapshot(reactSky));

		octane.unmount();
		await reactThreeAct(async () => reactRoot.unmount());
	});
});
