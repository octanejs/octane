import * as React from 'react';
import {
	act as reactThreeAct,
	advance as reactAdvance,
	createRoot as createReactThreeRoot,
	extend as extendReactThree,
	useThree as reactUseThree,
	type RootState as ReactRootState,
} from '@react-three/fiber';
import { MeshDistortMaterial as ReactMeshDistortMaterial } from '@react-three/drei/core/MeshDistortMaterial.js';
import { MeshWobbleMaterial as ReactMeshWobbleMaterial } from '@react-three/drei/core/MeshWobbleMaterial.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DistortMaterialScene, WobbleMaterialScene } from './_fixtures/motion-materials.three.tsrx';

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

type MotionMaterial = THREE.Material & {
	time: number;
	distort?: number;
	radius?: number;
	factor?: number;
	color: THREE.Color;
	roughness: number;
	onBeforeCompile(shader: { vertexShader: string; uniforms: Record<string, unknown> }): void;
};

async function reactMaterial(Component: React.ElementType, props: Record<string, unknown>) {
	const canvas = document.createElement('canvas');
	const root = createReactThreeRoot(canvas);
	let material!: MotionMaterial;
	let getState!: () => ReactRootState;
	function Capture() {
		getState = reactUseThree((state) => state.get);
		return null;
	}
	await root.configure({ gl: renderer(canvas), frameloop: 'never' });
	await reactThreeAct(async () =>
		root.render(
			React.createElement(
				'mesh',
				null,
				React.createElement(Component, {
					...props,
					ref: (value: MotionMaterial) => (material = value),
				}),
				React.createElement(Capture),
			),
		),
	);
	return { root, material, getState };
}

function materialSnapshot(material: MotionMaterial) {
	return {
		time: material.time,
		distort: material.distort,
		radius: material.radius,
		factor: material.factor,
		color: material.color.toArray(),
		roughness: material.roughness,
	};
}

function shaderSnapshot(material: MotionMaterial) {
	const shader = {
		vertexShader: '#include <begin_vertex>',
		uniforms: {} as Record<string, unknown>,
	};
	material.onBeforeCompile(shader);
	return {
		uniforms: Object.keys(shader.uniforms).sort(),
		hasTime: shader.vertexShader.includes('uniform float time;'),
		hasTransformed: shader.vertexShader.includes('vec3 transformed'),
		hasNoise: shader.vertexShader.includes('snoise'),
		hasNormalRotation: shader.vertexShader.includes('vNormal = vNormal * m'),
	};
}

describe('motion materials', () => {
	it('matches distort properties, shader mutation, attachment, and frame timing', async () => {
		const props = { speed: 2.5, distort: 0.7, radius: 1.4, color: '#4080c0', roughness: 0.25 };
		const react = await reactMaterial(ReactMeshDistortMaterial, props);
		let octaneMaterial!: MotionMaterial;
		const octane = await createOctaneThree(DistortMaterialScene, {
			...props,
			ref: (value: MotionMaterial) => (octaneMaterial = value),
		});
		expect((octane.scene.children[0] as THREE.Mesh).material).toBe(octaneMaterial);
		expect(materialSnapshot(octaneMaterial)).toEqual(materialSnapshot(react.material));
		expect(shaderSnapshot(octaneMaterial)).toEqual(shaderSnapshot(react.material));
		await reactThreeAct(async () => reactAdvance(4, true, react.getState()));
		octane.advanceFrames(1, 4);
		expect(octaneMaterial.time).toBe(react.material.time);
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
	});

	it('matches wobble properties, shader mutation, attachment, and frame timing', async () => {
		const props = { speed: 0.5, factor: 1.8, color: '#c08040', roughness: 0.6 };
		const react = await reactMaterial(ReactMeshWobbleMaterial, props);
		let octaneMaterial!: MotionMaterial;
		const octane = await createOctaneThree(WobbleMaterialScene, {
			...props,
			ref: (value: MotionMaterial) => (octaneMaterial = value),
		});
		expect((octane.scene.children[0] as THREE.Mesh).material).toBe(octaneMaterial);
		expect(materialSnapshot(octaneMaterial)).toEqual(materialSnapshot(react.material));
		expect(shaderSnapshot(octaneMaterial)).toEqual(shaderSnapshot(react.material));
		await reactThreeAct(async () => reactAdvance(3, true, react.getState()));
		octane.advanceFrames(1, 3);
		expect(octaneMaterial.time).toBe(react.material.time);
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
	});
});
