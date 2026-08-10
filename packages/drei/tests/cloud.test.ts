import * as React from 'react';
import {
	act as reactThreeAct,
	advance as reactAdvance,
	createRoot as createReactThreeRoot,
	extend as extendReactThree,
	type RootState as ReactRootState,
	useThree as reactUseThree,
} from '@react-three/fiber';
import {
	Cloud as ReactCloud,
	CloudInstance as ReactCloudInstance,
	Clouds as ReactClouds,
} from '@react-three/drei/core/Cloud.js';
import { useTexture as reactUseTexture } from '@react-three/drei/core/Texture.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { useTexture } from '../src/index.js';
import {
	CloudInstanceWithoutParentScene,
	CloudScene,
	StandaloneCloudScene,
} from './_fixtures/cloud.three.tsrx';

const originalTextureLoad = THREE.TextureLoader.prototype.load;

beforeAll(() => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	extendReactThree(THREE as unknown as Record<string, new (...args: any[]) => any>);
	THREE.TextureLoader.prototype.load = function (url, onLoad) {
		const texture = new THREE.Texture({ width: 4, height: 2 } as TexImageSource);
		texture.name = url;
		onLoad?.(texture);
		return texture;
	};
});

afterAll(() => {
	THREE.TextureLoader.prototype.load = originalTextureLoad;
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
		initTexture: vi.fn(),
	} as unknown as THREE.WebGLRenderer;
}

async function flushLoads() {
	await reactThreeAct(async () => {
		for (let index = 0; index < 8; index++) await Promise.resolve();
	});
}

function findInstanced(group: THREE.Group): THREE.InstancedMesh {
	let found: THREE.InstancedMesh | undefined;
	group.traverse((object) => {
		if ((object as THREE.InstancedMesh).isInstancedMesh) found = object as THREE.InstancedMesh;
	});
	if (!found) throw new Error('Clouds did not create an InstancedMesh.');
	return found;
}

function snapshot(group: THREE.Group) {
	const mesh = findInstanced(group);
	const opacity = mesh.geometry.getAttribute('cloudOpacity');
	const material = mesh.material as THREE.MeshLambertMaterial;
	const shader = {
		vertexShader: 'void main() {\n#include <fog_vertex>\n}',
		fragmentShader: 'void main() {\n#include <opaque_fragment>\n}',
		uniforms: {},
	} as unknown as THREE.WebGLProgramParametersWithUniforms;
	material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
	return {
		count: mesh.count,
		matrix: Array.from(mesh.instanceMatrix.array),
		color: mesh.instanceColor && Array.from(mesh.instanceColor.array),
		opacity: Array.from(opacity.array),
		matrixRange: mesh.instanceMatrix.updateRanges.map((range) => ({ ...range })),
		colorRange: mesh.instanceColor?.updateRanges.map((range) => ({ ...range })),
		opacityRange: opacity.updateRanges.map((range) => ({ ...range })),
		plane: (mesh.geometry as THREE.PlaneGeometry).parameters,
		frustumCulled: mesh.frustumCulled,
		mapName: material.map?.name,
		transparent: material.transparent,
		depthWrite: material.depthWrite,
		vertexShader: shader.vertexShader,
		fragmentShader: shader.fragmentShader,
	};
}

const distribute = (_cloud: unknown, index: number) => ({
	point: new THREE.Vector3(index === 0 ? -0.5 : 0.5, index / 4, 0.25),
	volume: 0.4 + index * 0.1,
});

async function reactClouds(texture: string) {
	const canvas = document.createElement('canvas');
	const root = createReactThreeRoot(canvas);
	let group!: THREE.Group;
	let first!: THREE.Group;
	let second!: THREE.Group;
	let getState!: () => ReactRootState;
	function Capture() {
		getState = reactUseThree((state) => state.get);
		return null;
	}
	await root.configure({ gl: renderer(canvas), frameloop: 'never' });
	await reactThreeAct(async () =>
		root.render(
			React.createElement(
				React.Fragment,
				null,
				React.createElement(
					React.Suspense,
					{ fallback: null },
					React.createElement(
						ReactClouds,
						{
							ref: (value: THREE.Group) => (group = value),
							texture,
							limit: 6,
							range: 4,
							frustumCulled: false,
							position: [2, 0, 0],
						},
						React.createElement(ReactCloudInstance, {
							ref: (value: THREE.Group) => (first = value),
							seed: 4,
							segments: 3,
							bounds: [2, 1, 3],
							concentrate: 'outside',
							volume: 2,
							smallestVolume: 0.1,
							distribute,
							growth: 1.5,
							speed: 0.75,
							fade: 8,
							opacity: 0.6,
							color: '#4080c0',
							position: [1, 2, 3],
						}),
						React.createElement(ReactCloudInstance, {
							ref: (value: THREE.Group) => (second = value),
							seed: 8,
							segments: 2,
							color: 'red',
						}),
					),
				),
				React.createElement(Capture),
			),
		),
	);
	await flushLoads();
	return { root, group, first, second, getState };
}

describe('Clouds', () => {
	it('matches seeded distribution, custom distribution, range, buffers, animation, texture aspect, material shader, and refs', async () => {
		const texture = '/cloud-parity.png';
		const react = await reactClouds(texture);
		let group!: THREE.Group;
		let first!: THREE.Group;
		let second!: THREE.Group;
		const octane = await createOctaneThree(CloudScene, {
			ref: (value: THREE.Group) => (group = value),
			firstRef: (value: THREE.Group) => (first = value),
			secondRef: (value: THREE.Group) => (second = value),
			texture,
			limit: 6,
			range: 4,
			frustumCulled: false,
			parentPosition: [2, 0, 0],
			firstSeed: 4,
			firstSegments: 3,
			firstBounds: [2, 1, 3],
			firstConcentrate: 'outside',
			firstVolume: 2,
			firstSmallestVolume: 0.1,
			firstDistribute: distribute,
			firstGrowth: 1.5,
			firstSpeed: 0.75,
			firstFade: 8,
			firstOpacity: 0.6,
			firstColor: '#4080c0',
			firstPosition: [1, 2, 3],
			showSecond: true,
			secondSeed: 8,
			secondSegments: 2,
			secondColor: 'red',
		});
		await flushLoads();
		await reactThreeAct(async () => reactAdvance(0.5, true, react.getState()));
		octane.advanceFrames(1, 0.5);
		expect(snapshot(group)).toEqual(snapshot(react.group));
		expect(first.position.toArray()).toEqual(react.first.position.toArray());
		expect(second.type).toBe(react.second.type);
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
		useTexture.clear(texture);
		reactUseTexture.clear(texture);
	});

	it('wraps a standalone Cloud in an implicit Clouds provider', async () => {
		const texture =
			'https://rawcdn.githack.com/pmndrs/drei-assets/9225a9f1fbd449d9411125c2f419b843d0308c9f/cloud.png';
		let cloud!: THREE.Group;
		const root = await createOctaneThree(StandaloneCloudScene, {
			ref: (value: THREE.Group) => (cloud = value),
			seed: 2,
			segments: 1,
			color: 'white',
		});
		await flushLoads();
		root.advanceFrames(1, 0.25);
		expect(cloud.type).toBe('Group');
		expect(
			cloud.parent?.children.some((object) => (object as THREE.InstancedMesh).isInstancedMesh),
		).toBe(true);
		root.unmount();
		useTexture.clear(texture);
		reactUseTexture.clear(texture);
	});

	it('rejects CloudInstance outside Clouds', async () => {
		await expect(createOctaneThree(CloudInstanceWithoutParentScene, {})).rejects.toThrow(
			'CloudInstance must be used inside Clouds component.',
		);
	});
});
