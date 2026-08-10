import * as React from 'react';
import {
	act as reactThreeAct,
	createRoot as createReactThreeRoot,
	extend as extendReactThree,
} from '@react-three/fiber';
import { CurveModifier as ReactCurveModifier } from '@react-three/drei/core/CurveModifier.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Flow } from 'three-stdlib';
import { CurveModifierScene } from './_fixtures/curve-modifier.three.tsrx';

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

function snapshot(flow: Flow) {
	const mesh = flow.object3D as THREE.Mesh;
	return {
		objectType: mesh.type,
		name: mesh.name,
		geometry: mesh.geometry.type,
		material: Array.isArray(mesh.material)
			? mesh.material.map((entry) => entry.type)
			: mesh.material.type,
		curveLength: flow.curveLengthArray[0],
		spineLength: flow.uniforms.spineLength.value,
		pathOffset: flow.uniforms.pathOffset.value,
	};
}

describe('CurveModifier', () => {
	it('matches portal cloning, curve updates, exposed API, and rendered object identity', async () => {
		const reactCurve = new THREE.CatmullRomCurve3([
			new THREE.Vector3(0, 0, 0),
			new THREE.Vector3(2, 1, 0),
			new THREE.Vector3(4, 0, 1),
		]);
		const octaneCurve = reactCurve.clone();
		const canvas = document.createElement('canvas');
		const reactRoot = createReactThreeRoot(canvas);
		let reactFlow!: Flow;
		await reactRoot.configure({ gl: renderer(canvas), frameloop: 'never' });
		await reactThreeAct(async () =>
			reactRoot.render(
				React.createElement(
					ReactCurveModifier,
					{ ref: (value: Flow) => (reactFlow = value), curve: reactCurve },
					React.createElement(
						'mesh',
						{ name: 'source' },
						React.createElement('boxGeometry', { args: [2, 1, 1] }),
						React.createElement('meshStandardMaterial', { color: '#4080c0' }),
					),
				),
			),
		);
		let octaneFlow!: Flow;
		const octane = await createOctaneThree(CurveModifierScene, {
			ref: (value: Flow) => (octaneFlow = value),
			curve: octaneCurve,
		});
		expect(snapshot(octaneFlow)).toEqual(snapshot(reactFlow));
		expect(octane.scene.children[0]).toBe(octaneFlow.object3D);

		reactFlow.moveAlongCurve(0.25);
		octaneFlow.moveAlongCurve(0.25);
		expect(snapshot(octaneFlow)).toEqual(snapshot(reactFlow));
		octane.unmount();
		await reactThreeAct(async () => reactRoot.unmount());
	});
});
