import * as React from 'react';
import { act, advance, createRoot, extend, useThree, type RootState } from '@react-three/fiber';
import { MeshReflectorMaterial as ReactMeshReflectorMaterial } from '@react-three/drei/core/MeshReflectorMaterial.js';
import { createRoot as createOctaneRoot } from '@octanejs/three';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { MeshReflectorMaterialScene } from './_fixtures/mesh-reflector-material.three.tsrx';

function renderer(canvas: HTMLCanvasElement) {
	return {
		domElement: canvas,
		outputColorSpace: THREE.SRGBColorSpace,
		toneMapping: THREE.NoToneMapping,
		autoClear: true,
		xr: { enabled: true },
		shadowMap: { autoUpdate: true },
		state: { buffers: { depth: { setMask: vi.fn() } } },
		setRenderTarget: vi.fn(),
		render: vi.fn(),
		clear: vi.fn(),
		setPixelRatio() {},
		setSize() {},
		renderLists: { dispose() {} },
		forceContextLoss() {},
		dispose() {},
	} as any;
}

function snapshot(material: any) {
	const shader = {
		defines: {},
		uniforms: {},
		vertexShader: '#include <project_vertex>',
		fragmentShader: '#include <emissivemap_fragment>',
	} as any;
	material.onBeforeCompile(shader);
	return {
		mirror: material.mirror,
		mixBlur: material.mixBlur,
		mixStrength: material.mixStrength,
		depthScale: material.depthScale,
		mixContrast: material.mixContrast,
		hasBlur: material.hasBlur,
		hasDiffuse: Boolean(material.tDiffuse),
		hasDepth: Boolean(material.tDepth),
		defines: material.defines,
		shaderDefines: shader.defines,
		shaderUniforms: Object.keys(shader.uniforms).sort(),
		vertexPatched: shader.vertexShader.includes('textureMatrix'),
		fragmentPatched: shader.fragmentShader.includes('distortionFactor'),
	};
}

describe('MeshReflectorMaterial', () => {
	it('matches React material uniforms, shader injection, reflection targets, blur passes, and renderer restoration', async () => {
		extend(THREE as unknown as Record<string, new (...args: any[]) => any>);
		const distortionMap = new THREE.Texture();
		let reactMaterial: any;
		let reactState!: RootState;
		function Capture() {
			reactState = useThree();
			return null;
		}
		const reactCanvas = document.createElement('canvas');
		const reactRenderer = renderer(reactCanvas);
		const reactRoot = createRoot(reactCanvas);
		await reactRoot.configure({
			gl: reactRenderer,
			frameloop: 'never',
			size: { width: 320, height: 180, top: 0, left: 0 },
			dpr: 1,
		});
		await act(async () =>
			reactRoot.render(
				React.createElement(
					React.Fragment,
					null,
					React.createElement(
						'mesh',
						null,
						React.createElement('planeGeometry', { args: [4, 4] }),
						React.createElement(ReactMeshReflectorMaterial, {
							ref: (value: any) => (reactMaterial = value),
							resolution: 64,
							blur: [2, 3],
							mirror: 0.4,
							mixBlur: 0.6,
							mixStrength: 1.5,
							depthScale: 0.8,
							distortionMap,
							mixContrast: 1.2,
						}),
					),
					React.createElement(Capture),
				),
			),
		);
		let octaneMaterial: any;
		const octaneCanvas = document.createElement('canvas');
		const octaneRenderer = renderer(octaneCanvas);
		const octaneRoot = createOctaneRoot(octaneCanvas);
		await octaneRoot.configure({
			gl: octaneRenderer,
			frameloop: 'never',
			size: { width: 320, height: 180, top: 0, left: 0 },
			dpr: 1,
		});
		octaneRoot.render(MeshReflectorMaterialScene, {
			materialRef: (value: any) => (octaneMaterial = value),
			resolution: 64,
			blur: [2, 3],
			mirror: 0.4,
			mixBlur: 0.6,
			mixStrength: 1.5,
			depthScale: 0.8,
			distortionMap,
			mixContrast: 1.2,
		});
		for (let index = 0; index < 8; index++) await Promise.resolve();
		expect(snapshot(octaneMaterial)).toEqual(snapshot(reactMaterial));
		await act(async () => advance(16, true, reactState));
		octaneRoot.store.getState().advance(1 / 60);
		expect(octaneRenderer.setRenderTarget.mock.calls.length).toBe(
			reactRenderer.setRenderTarget.mock.calls.length,
		);
		expect({ xr: octaneRenderer.xr.enabled, shadow: octaneRenderer.shadowMap.autoUpdate }).toEqual({
			xr: reactRenderer.xr.enabled,
			shadow: reactRenderer.shadowMap.autoUpdate,
		});
		octaneMaterial.mirror = 0.9;
		expect(snapshot(octaneMaterial)).not.toEqual(snapshot(reactMaterial));
		octaneRoot.unmount();
		await act(async () => reactRoot.unmount());
	});
});
