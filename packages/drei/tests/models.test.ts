import * as React from 'react';
import {
	act as reactThreeAct,
	createRoot as createReactThreeRoot,
	extend as extendReactThree,
} from '@react-three/fiber';
import { Gltf as ReactGltf, useGLTF as reactUseGLTF } from '@react-three/drei/core/Gltf.js';
import { Fbx as ReactFbx, useFBX as reactUseFBX } from '@react-three/drei/core/Fbx.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DRACOLoader, FBXLoader, GLTFLoader, type GLTF } from 'three-stdlib';
import { useFBX, useGLTF } from '../src/index.js';
import { FbxBoundary, GltfBoundary } from './_fixtures/models.three.tsrx';

const previousActEnvironment = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
	.IS_REACT_ACT_ENVIRONMENT;
const originalGltfLoad = GLTFLoader.prototype.load;
const originalFbxLoad = FBXLoader.prototype.load;
const originalDecoderPath = DRACOLoader.prototype.setDecoderPath;
const decoderPaths: string[] = [];
const requests: string[] = [];

function model(name: string) {
	const scene = new THREE.Group();
	scene.name = `${name}-scene`;
	const material = new THREE.MeshBasicMaterial({ color: 'seagreen' });
	material.name = `${name}-material`;
	const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
	mesh.name = `${name}-mesh`;
	scene.add(mesh);
	return { scene, mesh, material };
}

beforeAll(() => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	extendReactThree(THREE as unknown as Record<string, new (...args: any[]) => any>);
	GLTFLoader.prototype.load = function (url, onLoad) {
		requests.push(url);
		const asset = model(url);
		onLoad?.({
			scene: asset.scene,
			scenes: [asset.scene],
			animations: [],
			cameras: [],
			asset: {},
		} as unknown as GLTF);
		return this;
	};
	FBXLoader.prototype.load = function (url, onLoad) {
		requests.push(url);
		const container = new THREE.Group();
		container.add(model(url).scene);
		onLoad?.(container as never);
		return this;
	};
	DRACOLoader.prototype.setDecoderPath = function (path) {
		decoderPaths.push(path);
		return this;
	};
});

afterAll(() => {
	GLTFLoader.prototype.load = originalGltfLoad;
	FBXLoader.prototype.load = originalFbxLoad;
	DRACOLoader.prototype.setDecoderPath = originalDecoderPath;
	if (previousActEnvironment === undefined)
		delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
	else
		(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
			previousActEnvironment;
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

async function root() {
	const canvas = document.createElement('canvas');
	const value = createReactThreeRoot(canvas);
	await value.configure({
		gl: renderer(canvas),
		frameloop: 'never',
		dpr: 1,
		size: { width: 64, height: 64, top: 0, left: 0 },
	});
	return value;
}

async function flush() {
	await reactThreeAct(async () => {
		for (let index = 0; index < 8; index++) await Promise.resolve();
	});
}

function graphSnapshot(result: any) {
	return {
		sceneName: result.scene?.name,
		nodes: Object.keys(result.nodes ?? {}),
		materials: Object.keys(result.materials ?? {}),
		meshes: Object.keys(result.meshes ?? {}),
	};
}

describe('Gltf and useGLTF', () => {
	it('matches loading, graph augmentation, Clone output, refs, and cache behavior', async () => {
		const src = '/hero.glb';
		const reactResults: unknown[] = [];
		const octaneResults: unknown[] = [];
		const reactRefs: Array<THREE.Object3D | null> = [];
		const octaneRefs: Array<THREE.Object3D | null> = [];
		function ReactScene() {
			const result = reactUseGLTF(src, false, false);
			reactResults.push(result);
			return React.createElement(ReactGltf, {
				src,
				useDraco: false,
				useMeshOpt: false,
				name: 'gltf-clone',
				ref: (value: THREE.Object3D | null) => reactRefs.push(value),
			});
		}
		const reactRoot = await root();
		await reactThreeAct(async () =>
			reactRoot.render(
				React.createElement(React.Suspense, { fallback: null }, React.createElement(ReactScene)),
			),
		);
		const octaneRoot = await createOctaneThree(GltfBoundary, {
			src,
			useDraco: false,
			useMeshOpt: false,
			onLoad: (value: unknown) => octaneResults.push(value),
			modelRef: (value: THREE.Object3D | null) => octaneRefs.push(value),
		});
		await flush();

		expect(graphSnapshot(octaneResults.at(-1))).toEqual(graphSnapshot(reactResults.at(-1)));
		expect(octaneRefs.at(-1)?.name).toBe(reactRefs.at(-1)?.name);
		expect(requests.filter((request) => request === src)).toHaveLength(2);

		octaneRoot.unmount();
		await reactThreeAct(async () => reactRoot.unmount());
		expect(octaneRefs.at(-1)).toBeNull();
		useGLTF.clear(src);
		reactUseGLTF.clear(src);
	});

	it('matches decoder path and static API configuration', () => {
		useGLTF.setDecoderPath('/octane-draco/');
		useGLTF.preload('/octane-decoder.glb', true, false);
		reactUseGLTF.setDecoderPath('/react-draco/');
		reactUseGLTF.preload('/react-decoder.glb', true, false);
		expect(decoderPaths).toContain('/octane-draco/');
		expect(decoderPaths).toContain('/react-draco/');
		expect(typeof useGLTF.preload).toBe(typeof reactUseGLTF.preload);
		expect(typeof useGLTF.clear).toBe(typeof reactUseGLTF.clear);
		useGLTF.clear('/octane-decoder.glb');
		reactUseGLTF.clear('/react-decoder.glb');
	});
});

describe('Fbx and useFBX', () => {
	it('matches loading, first-child Clone output, and static cache API', async () => {
		const path = '/character.fbx';
		const reactResults: THREE.Group[] = [];
		const octaneResults: THREE.Group[] = [];
		const reactRefs: Array<THREE.Object3D | null> = [];
		const octaneRefs: Array<THREE.Object3D | null> = [];
		function ReactScene() {
			const result = reactUseFBX(path);
			reactResults.push(result);
			return React.createElement(ReactFbx, {
				path,
				name: 'fbx-clone',
				ref: (value: THREE.Object3D | null) => reactRefs.push(value),
			});
		}
		const reactRoot = await root();
		await reactThreeAct(async () =>
			reactRoot.render(
				React.createElement(React.Suspense, { fallback: null }, React.createElement(ReactScene)),
			),
		);
		const octaneRoot = await createOctaneThree(FbxBoundary, {
			path,
			onLoad: (value: THREE.Group) => octaneResults.push(value),
			modelRef: (value: THREE.Object3D | null) => octaneRefs.push(value),
		});
		await flush();
		expect(octaneResults.at(-1)?.children[0]?.name).toBe(reactResults.at(-1)?.children[0]?.name);
		expect(octaneRefs.at(-1)?.name).toBe(reactRefs.at(-1)?.name);
		expect(typeof useFBX.preload).toBe(typeof reactUseFBX.preload);
		expect(typeof useFBX.clear).toBe(typeof reactUseFBX.clear);
		octaneRoot.unmount();
		await reactThreeAct(async () => reactRoot.unmount());
		useFBX.clear(path);
		reactUseFBX.clear(path);
	});
});
