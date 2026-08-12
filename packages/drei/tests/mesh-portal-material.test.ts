import * as React from 'react';
import { act, advance, createRoot, extend, useThree, type RootState } from '@react-three/fiber';
import { MeshPortalMaterial as ReactMeshPortalMaterial } from '@react-three/drei/core/MeshPortalMaterial.js';
import { createRoot as createOctaneRoot } from '@octanejs/three';
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { MeshPortalMaterialScene } from './_fixtures/mesh-portal-material.three.tsrx';

beforeAll(() => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	extend(THREE as unknown as Record<string, new (...args: any[]) => any>);
});
type RenderRecord = { target: THREE.WebGLRenderTarget | null; object: THREE.Object3D };
function renderer(canvas: HTMLCanvasElement, records: RenderRecord[]): THREE.WebGLRenderer {
	let target: THREE.WebGLRenderTarget | null = null;
	return {
		domElement: canvas,
		outputColorSpace: THREE.SRGBColorSpace,
		toneMapping: THREE.NoToneMapping,
		autoClear: true,
		xr: { enabled: false, isPresenting: false },
		setRenderTarget(value: THREE.WebGLRenderTarget | null) {
			target = value;
		},
		getRenderTarget() {
			return target;
		},
		render(object: THREE.Object3D) {
			records.push({ target, object });
		},
		setPixelRatio() {},
		setSize() {},
		readRenderTargetPixels(
			_target: THREE.WebGLRenderTarget,
			_x: number,
			_y: number,
			_width: number,
			_height: number,
			buffer: Float32Array,
		) {
			buffer.fill(-0.25);
		},
		renderLists: { dispose() {} },
		forceContextLoss() {},
		dispose() {},
	} as unknown as THREE.WebGLRenderer;
}
function snapshot(material: any) {
	return {
		blur: material.blur,
		blend: material.blend,
		size: material.size,
		resolution: material.resolution.toArray(),
		mapSize: [material.map.image.width, material.map.image.height],
		sdfSize: material.sdf ? [material.sdf.image.width, material.sdf.image.height] : null,
	};
}

describe('MeshPortalMaterial', () => {
	it('matches React portal texture setup, parent transforms, blend takeover, refs, and independent mutation', async () => {
		const props = {
			events: true,
			blur: 0.2,
			eventPriority: 2,
			renderPriority: 3,
			worldUnits: false,
			resolution: 8,
		};
		const reactRecords: RenderRecord[] = [];
		let reactState!: RootState;
		let reactMaterial!: any;
		let reactMesh!: THREE.Mesh;
		function Capture() {
			reactState = useThree();
			return null;
		}
		const reactCanvas = document.createElement('canvas');
		const reactRoot = createRoot(reactCanvas);
		await reactRoot.configure({
			gl: renderer(reactCanvas, reactRecords),
			frameloop: 'never',
			size: { width: 320, height: 180, left: 0, top: 0 },
			dpr: 1,
		});
		await act(async () =>
			reactRoot.render(
				React.createElement(
					React.Fragment,
					null,
					React.createElement(
						'mesh',
						{
							ref: (value: THREE.Mesh) => (reactMesh = value),
							name: 'portal-parent',
							position: [1, 2, 3],
						},
						React.createElement('planeGeometry', { args: [2, 1] }),
						React.createElement(
							ReactMeshPortalMaterial,
							{ ...props, ref: (value: THREE.Material) => (reactMaterial = value) },
							React.createElement(
								'mesh',
								{ name: 'portal-content' },
								React.createElement('boxGeometry'),
								React.createElement('meshBasicMaterial', { color: 'hotpink' }),
							),
						),
					),
					React.createElement(Capture),
				),
			),
		);
		const octaneRecords: RenderRecord[] = [];
		let octaneMaterial!: any;
		let octaneMesh!: THREE.Mesh;
		const octaneCanvas = document.createElement('canvas');
		const octaneRoot = createOctaneRoot(octaneCanvas);
		await octaneRoot.configure({
			gl: renderer(octaneCanvas, octaneRecords),
			frameloop: 'never',
			size: { width: 320, height: 180, left: 0, top: 0 },
			dpr: 1,
		});
		octaneRoot.render(MeshPortalMaterialScene, {
			...props,
			materialRef: (value: THREE.Material) => (octaneMaterial = value),
			meshRef: (value: THREE.Mesh) => (octaneMesh = value),
		});
		for (let index = 0; index < 8; index++) await Promise.resolve();
		expect(snapshot(octaneMaterial)).toEqual(snapshot(reactMaterial));
		expect(octaneMesh.matrixWorld.elements).toEqual(reactMesh.matrixWorld.elements);
		octaneMaterial.blend = reactMaterial.blend = 0.5;
		for (let index = 1; index <= 3; index++) {
			await act(async () => advance((index * 1000) / 60, true, reactState));
			octaneRoot.store.getState().advance(index / 60);
		}
		const reactTargets = reactRecords
			.filter((record) => record.target)
			.map((record) => [record.target!.width, record.target!.height]);
		const octaneTargets = octaneRecords
			.filter((record) => record.target)
			.map((record) => [record.target!.width, record.target!.height]);
		expect(octaneTargets).toEqual(reactTargets);
		expect(octaneRoot.store.getState().events.enabled).toBe(reactState.events.enabled);
		octaneMaterial.blend = 0.9;
		expect(snapshot(octaneMaterial)).not.toEqual(snapshot(reactMaterial));
		octaneRoot.unmount();
		await act(async () => reactRoot.unmount());
	});
});
