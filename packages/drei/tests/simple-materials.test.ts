import * as React from 'react';
import {
	act as reactThreeAct,
	createRoot as createReactThreeRoot,
	extend as extendReactThree,
} from '@react-three/fiber';
import { Mask as ReactMask, useMask as reactUseMask } from '@react-three/drei/core/Mask.js';
import { MeshDiscardMaterial as ReactMeshDiscardMaterial } from '@react-three/drei/core/MeshDiscardMaterial.js';
import {
	PointMaterial as ReactPointMaterial,
	PointMaterialImpl as ReactPointMaterialImpl,
} from '@react-three/drei/core/PointMaterial.js';
import { ScreenQuad as ReactScreenQuad } from '@react-three/drei/core/ScreenQuad.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
	DiscardScene,
	MaskScene,
	PointMaterialScene,
	ScreenQuadScene,
	UseMaskScene,
} from './_fixtures/simple-materials.three.tsrx';

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

async function reactRoot(element: React.ReactNode) {
	const canvas = document.createElement('canvas');
	const root = createReactThreeRoot(canvas);
	await root.configure({
		gl: renderer(canvas),
		frameloop: 'never',
		dpr: 1,
		size: { width: 400, height: 200, top: 0, left: 0 },
	});
	await reactThreeAct(async () => root.render(element));
	return root;
}

describe('simple materials and stencil helpers', () => {
	it('matches MeshDiscardMaterial shader construction and props', async () => {
		let reactMaterial: THREE.ShaderMaterial | null = null;
		const react = await reactRoot(
			React.createElement(
				'mesh',
				null,
				React.createElement(ReactMeshDiscardMaterial, {
					transparent: true,
					ref: (value: THREE.ShaderMaterial | null) => (reactMaterial = value),
				}),
			),
		);
		let octaneMaterial: THREE.ShaderMaterial | null = null;
		const octane = await createOctaneThree(DiscardScene, {
			materialRef: (value: THREE.ShaderMaterial | null) => (octaneMaterial = value),
		});
		const snapshot = (material: THREE.ShaderMaterial) => ({
			vertexShader: material.vertexShader,
			fragmentShader: material.fragmentShader,
			transparent: material.transparent,
		});
		expect(snapshot(octaneMaterial!)).toEqual(snapshot(reactMaterial!));
		octane.unmount();
		await reactThreeAct(async () => react.unmount());
	});

	it('matches PointMaterial properties and shader rewriting', async () => {
		let reactMaterial: ReactPointMaterialImpl | null = null;
		const react = await reactRoot(
			React.createElement(
				'points',
				null,
				React.createElement(ReactPointMaterial, {
					size: 3,
					color: 'hotpink',
					ref: (value: ReactPointMaterialImpl | null) => (reactMaterial = value),
				}),
			),
		);
		let octaneMaterial: THREE.PointsMaterial | null = null;
		const octane = await createOctaneThree(PointMaterialScene, {
			materialRef: (value: THREE.PointsMaterial | null) => (octaneMaterial = value),
		});
		const compile = (material: THREE.PointsMaterial, isWebGL2: boolean) => {
			const shader = {
				vertexShader: '',
				fragmentShader: '#include <opaque_fragment>',
				uniforms: {},
			};
			material.onBeforeCompile(
				shader as THREE.WebGLProgramParametersWithUniforms,
				{ capabilities: { isWebGL2 } } as THREE.WebGLRenderer,
			);
			return shader.fragmentShader;
		};
		expect({ size: octaneMaterial!.size, color: octaneMaterial!.color.getHex() }).toEqual({
			size: reactMaterial!.size,
			color: reactMaterial!.color.getHex(),
		});
		expect(compile(octaneMaterial!, false)).toBe(compile(reactMaterial!, false));
		expect(compile(octaneMaterial!, true)).toBe(compile(reactMaterial!, true));
		octane.unmount();
		await reactThreeAct(async () => react.unmount());
	});

	it('matches ScreenQuad geometry, infinite bounds, props, and children', async () => {
		let reactMesh: THREE.Mesh | null = null;
		const react = await reactRoot(
			React.createElement(
				ReactScreenQuad,
				{ name: 'screen-quad', ref: (value: THREE.Mesh | null) => (reactMesh = value) },
				React.createElement('meshBasicMaterial'),
			),
		);
		let octaneMesh: THREE.Mesh | null = null;
		const octane = await createOctaneThree(ScreenQuadScene, {
			meshRef: (value: THREE.Mesh | null) => (octaneMesh = value),
		});
		const snapshot = (mesh: THREE.Mesh) => ({
			name: mesh.name,
			frustumCulled: mesh.frustumCulled,
			position: Array.from(mesh.geometry.getAttribute('position').array),
			itemSize: mesh.geometry.getAttribute('position').itemSize,
			radius: mesh.geometry.boundingSphere?.radius,
			material: mesh.material.type,
		});
		expect(snapshot(octaneMesh!)).toEqual(snapshot(reactMesh!));
		octane.unmount();
		await reactThreeAct(async () => react.unmount());
	});

	it('matches Mask material mutation, render order, useMask, and inverse mode', async () => {
		let reactMesh: THREE.Mesh | null = null;
		const react = await reactRoot(
			React.createElement(
				ReactMask,
				{
					id: 3,
					colorWrite: true,
					depthWrite: false,
					ref: (value: THREE.Mesh | null) => (reactMesh = value),
				},
				React.createElement('meshBasicMaterial'),
			),
		);
		let octaneMesh: THREE.Mesh | null = null;
		const octane = await createOctaneThree(MaskScene, {
			id: 3,
			colorWrite: true,
			depthWrite: false,
			meshRef: (value: THREE.Mesh | null) => (octaneMesh = value),
		});
		const snapshot = (mesh: THREE.Mesh) => {
			const material = mesh.material as THREE.Material;
			return {
				renderOrder: mesh.renderOrder,
				colorWrite: material.colorWrite,
				depthWrite: material.depthWrite,
				stencilWrite: material.stencilWrite,
				stencilRef: material.stencilRef,
				stencilFunc: material.stencilFunc,
				stencilFail: material.stencilFail,
				stencilZFail: material.stencilZFail,
				stencilZPass: material.stencilZPass,
			};
		};
		expect(snapshot(octaneMesh!)).toEqual(snapshot(reactMesh!));

		for (const inverse of [false, true]) {
			let reactValues: unknown;
			function ReactUseMask() {
				reactValues = reactUseMask(4, inverse);
				return null;
			}
			const reactHook = await reactRoot(React.createElement(ReactUseMask));
			let octaneValues: unknown;
			const octaneHook = await createOctaneThree(UseMaskScene, {
				id: 4,
				inverse,
				onValue: (value: unknown) => (octaneValues = value),
			});
			expect(octaneValues).toEqual(reactValues);
			octaneHook.unmount();
			await reactThreeAct(async () => reactHook.unmount());
		}
		octane.unmount();
		await reactThreeAct(async () => react.unmount());
	});
});
