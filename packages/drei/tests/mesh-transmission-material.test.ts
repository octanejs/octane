import * as React from 'react';
import { act, advance, createRoot, extend, useThree, type RootState } from '@react-three/fiber';
import { MeshTransmissionMaterial as ReactMeshTransmissionMaterial } from '@react-three/drei/core/MeshTransmissionMaterial.js';
import { createRoot as createOctaneRoot } from '@octanejs/three';
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { MeshTransmissionMaterialScene } from './_fixtures/mesh-transmission-material.three.tsrx';

beforeAll(() => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	extend(THREE as unknown as Record<string, new (...args: any[]) => any>);
});
type RecordEntry = {
	target: THREE.WebGLRenderTarget | null;
	material: THREE.Material | THREE.Material[] | undefined;
	background: THREE.Scene['background'];
};
function renderer(canvas: HTMLCanvasElement, records: RecordEntry[]): THREE.WebGLRenderer {
	let target: THREE.WebGLRenderTarget | null = null;
	return {
		domElement: canvas,
		outputColorSpace: THREE.SRGBColorSpace,
		toneMapping: THREE.ACESFilmicToneMapping,
		setRenderTarget(value: THREE.WebGLRenderTarget | null) {
			target = value;
		},
		getRenderTarget() {
			return target;
		},
		render(scene: THREE.Scene) {
			const mesh = scene.getObjectByName('transmission-parent') as THREE.Mesh | undefined;
			records.push({ target, material: mesh?.material, background: scene.background });
		},
		setPixelRatio() {},
		setSize() {},
		renderLists: { dispose() {} },
		forceContextLoss() {},
		dispose() {},
	} as unknown as THREE.WebGLRenderer;
}
function materialSnapshot(material: any) {
	return {
		transmission: material.transmission,
		internalTransmission: material._transmission,
		thickness: material.thickness,
		side: material.side,
		bufferSize: [material.buffer.image.width, material.buffer.image.height],
		anisotropicBlur: material.anisotropicBlur,
		chromaticAberration: material.chromaticAberration,
		distortion: material.distortion,
	};
}
function compile(material: THREE.Material) {
	const shader = {
		uniforms: {},
		defines: {},
		vertexShader: '',
		fragmentShader: '#include <transmission_pars_fragment>\n#include <transmission_fragment>',
	} as any;
	material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
	const markers = [
		'random3',
		'snoiseFractal',
		'getVolumeTransmissionRay',
		'getTransmissionSample',
		'applyVolumeAttenuation',
		'getIBLVolumeRefraction',
		'material.transmission = _transmission',
		'for (float i = 0.0',
		'transmission /= 4.0',
		'totalDiffuse = mix',
	];
	return {
		defines: shader.defines,
		uniforms: Object.keys(shader.uniforms).sort(),
		markers: markers.map((marker) => shader.fragmentShader.includes(marker)),
		replacedChunks:
			!shader.fragmentShader.includes('#include <transmission_pars_fragment>') &&
			!shader.fragmentShader.includes('#include <transmission_fragment>'),
	};
}

describe('MeshTransmissionMaterial', () => {
	it('matches React shader injection, local front/back render passes, state restoration, refs, and independent mutation', async () => {
		const background = new THREE.Color('#123456');
		const props = {
			transmissionSampler: false,
			backside: true,
			backsideThickness: 0.7,
			backsideEnvMapIntensity: 0.4,
			samples: 4,
			resolution: 16,
			backsideResolution: 8,
			background,
			transmission: 0.85,
			thickness: 0.3,
			anisotropy: 0.2,
			chromaticAberration: 0.08,
			distortion: 0.12,
		};
		const reactRecords: RecordEntry[] = [];
		let reactState!: RootState;
		let reactMaterial!: any;
		let reactMesh!: THREE.Mesh;
		function Capture() {
			reactState = useThree();
			return null;
		}
		const reactCanvas = document.createElement('canvas');
		const reactRenderer = renderer(reactCanvas, reactRecords);
		const reactRoot = createRoot(reactCanvas);
		await reactRoot.configure({
			gl: reactRenderer,
			frameloop: 'never',
			size: { width: 300, height: 150, left: 0, top: 0 },
			dpr: 1,
		});
		await act(async () =>
			reactRoot.render(
				React.createElement(
					React.Fragment,
					null,
					React.createElement(
						'mesh',
						{ ref: (value: THREE.Mesh) => (reactMesh = value), name: 'transmission-parent' },
						React.createElement('boxGeometry'),
						React.createElement(ReactMeshTransmissionMaterial, {
							...props,
							ref: (value: THREE.Material) => (reactMaterial = value),
						}),
					),
					React.createElement(Capture),
				),
			),
		);
		const octaneRecords: RecordEntry[] = [];
		let octaneMaterial!: any;
		let octaneMesh!: THREE.Mesh;
		const octaneCanvas = document.createElement('canvas');
		const octaneRenderer = renderer(octaneCanvas, octaneRecords);
		const octaneRoot = createOctaneRoot(octaneCanvas);
		await octaneRoot.configure({
			gl: octaneRenderer,
			frameloop: 'never',
			size: { width: 300, height: 150, left: 0, top: 0 },
			dpr: 1,
		});
		octaneRoot.render(MeshTransmissionMaterialScene, {
			...props,
			materialRef: (value: THREE.Material) => (octaneMaterial = value),
			meshRef: (value: THREE.Mesh) => (octaneMesh = value),
		});
		for (let index = 0; index < 8; index++) await Promise.resolve();
		expect(materialSnapshot(octaneMaterial)).toEqual(materialSnapshot(reactMaterial));
		expect(compile(octaneMaterial)).toEqual(compile(reactMaterial));
		await act(async () => advance(1000 / 60, true, reactState));
		octaneRoot.store.getState().advance(1 / 60);
		const reactPasses = reactRecords.filter((record) => record.target);
		const octanePasses = octaneRecords.filter((record) => record.target);
		expect(
			octanePasses.map((record) => [
				record.target!.width,
				record.target!.height,
				record.background === background,
			]),
		).toEqual(
			reactPasses.map((record) => [
				record.target!.width,
				record.target!.height,
				record.background === background,
			]),
		);
		expect(octanePasses).toHaveLength(reactPasses.length);
		expect(octaneRenderer.toneMapping).toBe(reactRenderer.toneMapping);
		expect(octaneRoot.store.getState().scene.background).toBe(reactState.scene.background);
		expect(materialSnapshot(octaneMaterial)).toEqual(materialSnapshot(reactMaterial));
		expect(octaneMesh.material).toBe(octaneMaterial);
		expect(reactMesh.material).toBe(reactMaterial);
		octaneMaterial.distortion = 0.9;
		expect(materialSnapshot(octaneMaterial)).not.toEqual(materialSnapshot(reactMaterial));

		const samplerProps = { ...props, transmissionSampler: true, backside: false };
		await act(async () =>
			reactRoot.render(
				React.createElement(
					React.Fragment,
					null,
					React.createElement(
						'mesh',
						{ ref: (value: THREE.Mesh) => (reactMesh = value), name: 'transmission-parent' },
						React.createElement('boxGeometry'),
						React.createElement(ReactMeshTransmissionMaterial, {
							...samplerProps,
							ref: (value: THREE.Material) => (reactMaterial = value),
						}),
					),
					React.createElement(Capture),
				),
			),
		);
		octaneRoot.render(MeshTransmissionMaterialScene, {
			...samplerProps,
			materialRef: (value: THREE.Material) => (octaneMaterial = value),
			meshRef: (value: THREE.Mesh) => (octaneMesh = value),
		});
		for (let index = 0; index < 8; index++) await Promise.resolve();
		expect(materialSnapshot(octaneMaterial)).toEqual(materialSnapshot(reactMaterial));
		expect(compile(octaneMaterial)).toEqual(compile(reactMaterial));
		reactRecords.length = 0;
		octaneRecords.length = 0;
		await act(async () => advance(2000 / 60, true, reactState));
		octaneRoot.store.getState().advance(2 / 60);
		expect(reactRecords.filter((record) => record.target)).toHaveLength(0);
		expect(octaneRecords.filter((record) => record.target)).toHaveLength(0);
		octaneRoot.unmount();
		await act(async () => reactRoot.unmount());
	});
});
