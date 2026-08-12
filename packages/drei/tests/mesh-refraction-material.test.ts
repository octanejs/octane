import * as React from 'react';
import { act, advance, createRoot, extend, useThree, type RootState } from '@react-three/fiber';
import { MeshRefractionMaterial as ReactMeshRefractionMaterial } from '@react-three/drei/core/MeshRefractionMaterial.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { MeshRefractionMaterialScene } from './_fixtures/mesh-refraction-material.three.tsrx';

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

function snapshot(material: any) {
	return {
		defines: material.defines,
		resolution: material.resolution.toArray(),
		aberrationStrength: material.aberrationStrength,
		ior: material.ior,
		bounces: material.bounces,
		color: material.color.getHexString(),
		hasBvh: Boolean(material.bvh),
		viewMatrixInverse: material.viewMatrixInverse.toArray(),
		projectionMatrixInverse: material.projectionMatrixInverse.toArray(),
	};
}

describe('MeshRefractionMaterial', () => {
	it('matches React defines, uniforms, BVH initialization, and frame camera matrices', async () => {
		extend(THREE as unknown as Record<string, new (...args: any[]) => any>);
		const envMap = new THREE.CubeTexture();
		envMap.image = Array.from({ length: 6 }, () => ({ width: 512, height: 512 })) as any;
		let reactMesh!: THREE.Mesh;
		let reactState!: RootState;
		function Capture() {
			reactState = useThree();
			return null;
		}
		const canvas = document.createElement('canvas');
		const reactRoot = createRoot(canvas);
		await reactRoot.configure({
			gl: renderer(canvas),
			frameloop: 'never',
			size: { width: 640, height: 360, top: 0, left: 0 },
			dpr: 1,
		});
		await act(async () =>
			reactRoot.render(
				React.createElement(
					React.Fragment,
					null,
					React.createElement(
						'mesh',
						{ ref: (value: THREE.Mesh) => (reactMesh = value) },
						React.createElement('icosahedronGeometry', { args: [1, 1] }),
						React.createElement(ReactMeshRefractionMaterial, {
							envMap,
							aberrationStrength: 0.2,
							fastChroma: false,
							ior: 1.7,
							bounces: 4,
							color: 'cyan',
						}),
					),
					React.createElement(Capture),
				),
			),
		);
		let octaneMesh!: THREE.Mesh;
		const octane = await createOctaneThree(
			MeshRefractionMaterialScene,
			{
				envMap,
				aberrationStrength: 0.2,
				fastChroma: false,
				ior: 1.7,
				bounces: 4,
				color: 'cyan',
				meshRef: (value: THREE.Mesh) => (octaneMesh = value),
			},
			{ width: 640, height: 360 },
		);
		await act(async () => advance(16, true, reactState));
		octane.advanceFrames(1, 1 / 60);
		expect(snapshot(octaneMesh.material)).toEqual(snapshot(reactMesh.material));
		(octaneMesh.material as any).ior = 9;
		expect(snapshot(octaneMesh.material)).not.toEqual(snapshot(reactMesh.material));
		octane.unmount();
		await act(async () => reactRoot.unmount());
	});
});
