import * as React from 'react';
import { act, createRoot, extend, useThree, type RootState } from '@react-three/fiber';
import { Wireframe as ReactWireframe } from '@react-three/drei/core/Wireframe.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CustomWireframeScene, OverrideWireframeScene } from './_fixtures/wireframe.three.tsrx';

beforeAll(() => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	extend(THREE as unknown as Record<string, new (...args: any[]) => any>);
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

async function reactRoot(node: React.ReactNode) {
	const canvas = document.createElement('canvas');
	const root = createRoot(canvas);
	let state!: RootState;
	function Capture() {
		state = useThree();
		return null;
	}
	await root.configure({ gl: renderer(canvas), frameloop: 'never' });
	await act(async () =>
		root.render(React.createElement(React.Fragment, null, node, React.createElement(Capture))),
	);
	return { root, scene: state.scene };
}

function barycentric(geometry: THREE.BufferGeometry) {
	return Array.from(geometry.getAttribute('barycentric').array);
}
function normalizeShader(source: string) {
	return source.replace(/\s+/g, ' ').trim();
}
function uniformSnapshot(material: THREE.ShaderMaterial) {
	return {
		stroke: material.uniforms.stroke.value.getHex(),
		fill: material.uniforms.fill.value.getHex(),
		thickness: material.uniforms.thickness.value,
	};
}

describe('Wireframe', () => {
	it('matches React custom-geometry conversion, barycentric data, material uniforms, and independent mutation', async () => {
		const reactGeometry = new THREE.BoxGeometry();
		const octaneGeometry = reactGeometry.clone();
		const react = await reactRoot(
			React.createElement(ReactWireframe, {
				geometry: reactGeometry,
				simplify: true,
				stroke: '#123456',
				fill: '#abcdef',
				thickness: 0.2,
			}),
		);
		const octane = await createOctaneThree(CustomWireframeScene, {
			geometry: octaneGeometry,
			simplify: true,
			stroke: '#123456',
			fill: '#abcdef',
			thickness: 0.2,
		});
		const reactMesh = react.scene.children[0] as THREE.Mesh<
			THREE.BufferGeometry,
			THREE.ShaderMaterial
		>;
		const octaneMesh = octane.scene.children[0] as THREE.Mesh<
			THREE.BufferGeometry,
			THREE.ShaderMaterial
		>;
		expect(octaneGeometry.index).toBe(reactGeometry.index);
		expect(barycentric(octaneGeometry)).toEqual(barycentric(reactGeometry));
		expect(uniformSnapshot(octaneMesh.material)).toEqual(uniformSnapshot(reactMesh.material));
		expect({
			side: octaneMesh.material.side,
			transparent: octaneMesh.material.transparent,
			polygonOffset: octaneMesh.material.polygonOffset,
			polygonOffsetFactor: octaneMesh.material.polygonOffsetFactor,
		}).toEqual({
			side: reactMesh.material.side,
			transparent: reactMesh.material.transparent,
			polygonOffset: reactMesh.material.polygonOffset,
			polygonOffsetFactor: reactMesh.material.polygonOffsetFactor,
		});
		octaneMesh.material.uniforms.thickness.value = 0.9;
		expect(uniformSnapshot(octaneMesh.material)).not.toEqual(uniformSnapshot(reactMesh.material));
		octane.unmount();
		await act(async () => react.root.unmount());
	});

	it('matches React parent-material override and restores geometry and material on cleanup', async () => {
		const reactGeometry = new THREE.BufferGeometry().setAttribute(
			'position',
			new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3),
		);
		const octaneGeometry = reactGeometry.clone();
		const reactMaterial = new THREE.MeshBasicMaterial();
		const octaneMaterial = reactMaterial.clone();
		let reactMesh!: THREE.Mesh;
		let octaneMesh!: THREE.Mesh;
		const react = await reactRoot(
			React.createElement(
				'mesh',
				{
					ref: (value: THREE.Mesh) => (reactMesh = value),
					geometry: reactGeometry,
					material: reactMaterial,
				},
				React.createElement(ReactWireframe, { stroke: 'red', fillMix: 0.6 }),
			),
		);
		const octane = await createOctaneThree(OverrideWireframeScene, {
			meshRef: (value: THREE.Mesh) => (octaneMesh = value),
			geometry: octaneGeometry,
			material: octaneMaterial,
			simplify: false,
			stroke: 'red',
			fillMix: 0.6,
		});
		const shader = {
			uniforms: {},
			vertexShader: 'void main() {',
			fragmentShader: 'void main() {\n#include <color_fragment>',
		} as unknown as THREE.WebGLProgramParametersWithUniforms;
		const octaneShader = {
			uniforms: {},
			vertexShader: shader.vertexShader,
			fragmentShader: shader.fragmentShader,
		} as unknown as THREE.WebGLProgramParametersWithUniforms;
		reactMaterial.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
		octaneMaterial.onBeforeCompile(octaneShader, {} as THREE.WebGLRenderer);
		expect(normalizeShader(octaneShader.vertexShader)).toBe(normalizeShader(shader.vertexShader));
		expect(normalizeShader(octaneShader.fragmentShader)).toBe(
			normalizeShader(shader.fragmentShader),
		);
		expect(Object.keys(octaneShader.uniforms)).toEqual(Object.keys(shader.uniforms));
		expect(barycentric(octaneGeometry)).toEqual(barycentric(reactGeometry));
		const mountedReactMesh = reactMesh;
		const mountedOctaneMesh = octaneMesh;
		octane.unmount();
		await act(async () => react.root.unmount());
		expect(octaneGeometry.getAttribute('barycentric')).toBe(
			reactGeometry.getAttribute('barycentric'),
		);
		expect(mountedOctaneMesh.material.onBeforeCompile.toString()).toBe(
			mountedReactMesh.material.onBeforeCompile.toString(),
		);
	});
});
