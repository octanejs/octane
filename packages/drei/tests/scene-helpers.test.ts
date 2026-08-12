import * as React from 'react';
import {
	act as reactThreeAct,
	advance as reactAdvance,
	createRoot as createReactThreeRoot,
	extend as extendReactThree,
	useThree as reactUseThree,
	type RootState as ReactRootState,
} from '@react-three/fiber';
import { ScreenSpace as ReactScreenSpace } from '@react-three/drei/core/ScreenSpace.js';
import { Detailed as ReactDetailed } from '@react-three/drei/core/Detailed.js';
import { ComputedAttribute as ReactComputedAttribute } from '@react-three/drei/core/ComputedAttribute.js';
import { MultiMaterial as ReactMultiMaterial } from '@react-three/drei/core/MultiMaterial.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
	ComputedAttributeScene,
	DetailedScene,
	MultiMaterialScene,
	ScreenSpaceScene,
} from './_fixtures/scene-helpers.three.tsrx';

const previousActEnvironment = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
	.IS_REACT_ACT_ENVIRONMENT;
beforeAll(() => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	extendReactThree(THREE as unknown as Record<string, new (...args: any[]) => any>);
});
afterAll(() => {
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

async function reactRoot(element: React.ReactNode) {
	const canvas = document.createElement('canvas');
	const root = createReactThreeRoot(canvas);
	let get!: () => ReactRootState;
	function Capture() {
		get = reactUseThree((state) => state.get);
		return element;
	}
	await root.configure({
		gl: renderer(canvas),
		frameloop: 'never',
		dpr: 1,
		size: { width: 400, height: 200, top: 0, left: 0 },
	});
	await reactThreeAct(async () => root.render(React.createElement(Capture)));
	return { root, getState: () => get() };
}

describe('scene graph helpers', () => {
	it('matches ScreenSpace camera transforms, depth, children, and refs', async () => {
		const reactRefs: Array<THREE.Group | null> = [];
		const octaneRefs: Array<THREE.Group | null> = [];
		const react = await reactRoot(
			React.createElement(
				ReactScreenSpace,
				{
					depth: 3,
					name: 'screen-space',
					ref: (value: THREE.Group | null) => reactRefs.push(value),
				},
				React.createElement('group', { name: 'screen-content' }),
			),
		);
		const octane = await createOctaneThree(
			ScreenSpaceScene,
			{ depth: 3, groupRef: (value: THREE.Group | null) => octaneRefs.push(value) },
			{ width: 400, height: 200 },
		);
		for (const state of [react.getState(), octane.store.getState()]) {
			state.camera.position.set(2, 4, 6);
			state.camera.rotation.set(0.2, 0.4, 0.1);
			state.camera.updateMatrixWorld();
		}
		reactAdvance(1000, true, react.getState());
		octane.advanceFrames(1);
		const reactGroup = reactRefs.at(-1)!;
		const octaneGroup = octaneRefs.at(-1)!;
		expect(octaneGroup.position.toArray()).toEqual(reactGroup.position.toArray());
		expect(octaneGroup.quaternion.toArray()).toEqual(reactGroup.quaternion.toArray());
		expect(octaneGroup.children[0].position.z).toBe(reactGroup.children[0].position.z);
		expect(octaneGroup.children[0].children[0].name).toBe('screen-content');
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
	});

	it('matches Detailed LOD levels, hysteresis, distances, and frame updates', async () => {
		const reactRefs: Array<THREE.LOD | null> = [];
		const octaneRefs: Array<THREE.LOD | null> = [];
		const props = { distances: [2, 8], hysteresis: 0.15 };
		const react = await reactRoot(
			React.createElement(
				ReactDetailed,
				{ ...props, ref: (value: THREE.LOD | null) => reactRefs.push(value) },
				React.createElement('group', { name: 'near' }),
				React.createElement('group', { name: 'far' }),
			),
		);
		const octane = await createOctaneThree(DetailedScene, {
			...props,
			lodRef: (value: THREE.LOD | null) => octaneRefs.push(value),
		});
		const levelSnapshot = (lod: THREE.LOD) =>
			lod.levels.map((level) => ({
				name: level.object.name,
				distance: level.distance,
				hysteresis: level.hysteresis,
			}));
		expect(levelSnapshot(octaneRefs.at(-1)!)).toEqual(levelSnapshot(reactRefs.at(-1)!));
		react.getState().camera.position.z = 10;
		octane.store.getState().camera.position.z = 10;
		reactAdvance(1000, true, react.getState());
		octane.advanceFrames(1);
		expect(octaneRefs.at(-1)!.getCurrentLevel()).toBe(reactRefs.at(-1)!.getCurrentLevel());
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
	});

	it('matches ComputedAttribute attachment and recomputation output', async () => {
		const reactGeometries: Array<THREE.BufferGeometry | null> = [];
		const octaneGeometries: Array<THREE.BufferGeometry | null> = [];
		const compute = (geometry: THREE.BufferGeometry) =>
			new THREE.BufferAttribute(
				new Float32Array(geometry.getAttribute('position').count * 2).fill(0.25),
				2,
			);
		const react = await reactRoot(
			React.createElement(
				'bufferGeometry',
				{ ref: (value: THREE.BufferGeometry | null) => reactGeometries.push(value) },
				React.createElement('bufferAttribute', {
					attach: 'attributes-position',
					args: [new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3],
				}),
				React.createElement(ReactComputedAttribute, { name: 'custom', compute }),
			),
		);
		const octane = await createOctaneThree(ComputedAttributeScene, {
			compute,
			geometryRef: (value: THREE.BufferGeometry | null) => octaneGeometries.push(value),
		});
		const snapshot = (geometry: THREE.BufferGeometry) => ({
			itemSize: geometry.getAttribute('custom').itemSize,
			array: Array.from(geometry.getAttribute('custom').array),
		});
		expect(snapshot(octaneGeometries.at(-1)!)).toEqual(snapshot(reactGeometries.at(-1)!));
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
	});

	it('matches MultiMaterial arrays, groups, depth writing, and cleanup', async () => {
		const reactMeshes: Array<THREE.Mesh | null> = [];
		const octaneMeshes: Array<THREE.Mesh | null> = [];
		const react = await reactRoot(
			React.createElement(
				'mesh',
				{ ref: (value: THREE.Mesh | null) => reactMeshes.push(value) },
				React.createElement('boxGeometry'),
				React.createElement(
					ReactMultiMaterial,
					null,
					React.createElement('meshBasicMaterial', { name: 'first', color: 'red' }),
					React.createElement('meshBasicMaterial', { name: 'second', color: 'blue' }),
				),
			),
		);
		const octane = await createOctaneThree(MultiMaterialScene, {
			meshRef: (value: THREE.Mesh | null) => octaneMeshes.push(value),
		});
		const reactMesh = reactMeshes.at(-1)!;
		const octaneMesh = octaneMeshes.at(-1)!;
		const snapshot = (mesh: THREE.Mesh) => ({
			materials: (mesh.material as THREE.Material[]).map((material) => ({
				name: material.name,
				depthWrite: material.depthWrite,
			})),
			groups: mesh.geometry.groups,
		});
		expect(snapshot(octaneMesh)).toEqual(snapshot(reactMesh));
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
		expect(Array.isArray(octaneMesh.material)).toBe(Array.isArray(reactMesh.material));
		expect(octaneMesh.geometry.groups).toEqual(reactMesh.geometry.groups);
	});
});
