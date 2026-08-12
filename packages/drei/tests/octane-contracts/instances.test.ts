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
	createInstances as createReactInstances,
	Instance as ReactInstance,
	InstancedAttribute as ReactInstancedAttribute,
	Instances as ReactInstances,
	Merged as ReactMerged,
	PositionMesh as ReactPositionMesh,
} from '@react-three/drei/core/Instances.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PositionMesh } from '../../src/index.js';
import {
	FactoryInstancesScene,
	InstancesScene,
	InstanceWithoutParentScene,
	MergedArrayScene,
	MergedRecordScene,
	RenderPropInstancesScene,
} from '../_fixtures/instances.three.tsrx';

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

function snapshot(mesh: THREE.InstancedMesh) {
	const scaleAttribute = mesh.geometry.getAttribute('scale');
	return {
		count: mesh.count,
		matrix: Array.from(mesh.instanceMatrix.array),
		matrixUsage: mesh.instanceMatrix.usage,
		matrixRange: mesh.instanceMatrix.updateRanges.map((range) => ({ ...range })),
		color: mesh.instanceColor && Array.from(mesh.instanceColor.array),
		colorUsage: mesh.instanceColor?.usage,
		colorRange: mesh.instanceColor?.updateRanges.map((range) => ({ ...range })),
		scale: scaleAttribute && Array.from(scaleAttribute.array),
		scaleItemSize: scaleAttribute?.itemSize,
		scaleCount: scaleAttribute?.count,
		scaleNormalized: scaleAttribute?.normalized,
	};
}

async function reactInstances(geometry: THREE.BufferGeometry, material: THREE.Material) {
	const canvas = document.createElement('canvas');
	const root = createReactThreeRoot(canvas);
	let mesh!: THREE.InstancedMesh;
	let first!: ReactPositionMesh;
	let second!: ReactPositionMesh;
	let attribute!: THREE.InstancedBufferAttribute;
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
					ReactInstances,
					{
						ref: (value: THREE.InstancedMesh) => (mesh = value),
						geometry,
						material,
						limit: 3,
						range: 1,
						frames: 2,
						position: [4, 0, 0],
					},
					React.createElement(ReactInstance, {
						ref: (value: ReactPositionMesh) => (first = value),
						position: [1, 2, 3],
						scale: [2, 3, 4],
						color: '#4080c0',
					}),
					React.createElement(ReactInstance, {
						ref: (value: ReactPositionMesh) => (second = value),
						position: [-2, 1, 0.5],
						scale: 0.75,
						color: 'red',
					}),
					React.createElement(ReactInstancedAttribute, {
						ref: (value: THREE.InstancedBufferAttribute) => (attribute = value),
						name: 'scale',
						defaultValue: [1, 1, 1],
						normalized: true,
					}),
				),
				React.createElement(Capture),
			),
		),
	);
	return { root, mesh, first, second, attribute, getState };
}

async function reactMerged(meshes: THREE.Mesh[] | Record<string, THREE.Object3D>) {
	const canvas = document.createElement('canvas');
	const root = createReactThreeRoot(canvas);
	let group!: THREE.Group;
	let first!: ReactPositionMesh;
	let second!: ReactPositionMesh;
	let getState!: () => ReactRootState;
	function Capture() {
		getState = reactUseThree((state) => state.get);
		return null;
	}
	const renderChildren = Array.isArray(meshes)
		? (First: React.ElementType, Second: React.ElementType) =>
				React.createElement(
					React.Fragment,
					null,
					React.createElement(First, {
						ref: (value: ReactPositionMesh) => (first = value),
						position: [1, 0, 0],
					}),
					React.createElement(Second, {
						ref: (value: ReactPositionMesh) => (second = value),
						position: [0, 2, 0],
					}),
				)
		: (InstancesByName: Record<string, React.ElementType>) =>
				React.createElement(
					React.Fragment,
					null,
					React.createElement(InstancesByName.cube!, {
						ref: (value: ReactPositionMesh) => (first = value),
						position: [1, 0, 0],
					}),
					React.createElement(InstancesByName.sphere!, {
						ref: (value: ReactPositionMesh) => (second = value),
						position: [0, 2, 0],
					}),
				);
	await root.configure({ gl: renderer(canvas), frameloop: 'never' });
	await reactThreeAct(async () =>
		root.render(
			React.createElement(
				React.Fragment,
				null,
				React.createElement(
					ReactMerged,
					{ ref: (value: THREE.Group) => (group = value), meshes, limit: 2 },
					renderChildren,
				),
				React.createElement(Capture),
			),
		),
	);
	return { root, group, first, second, getState };
}

function hierarchy(object: THREE.Object3D): unknown {
	return object.children.map((child) => ({
		type: child.type,
		count: (child as THREE.InstancedMesh).isInstancedMesh
			? (child as THREE.InstancedMesh).count
			: undefined,
		geometryType: (child as THREE.Mesh).geometry?.type,
		materialType: Array.isArray((child as THREE.Mesh).material)
			? (child as THREE.Mesh).material.map((material) => material.type)
			: (child as THREE.Mesh).material?.type,
		children: hierarchy(child),
	}));
}

describe('Instances (Octane-only contracts)', () => {
	it.each([
		['render-prop local instances', RenderPropInstancesScene],
		['createInstances factory context', FactoryInstancesScene],
	] as const)('supports %s', async (_name, Component) => {
		let mesh!: THREE.InstancedMesh;
		let instance!: PositionMesh;
		const root = await createOctaneThree(Component, {
			ref: (value: THREE.InstancedMesh) => (mesh = value),
			instanceRef: (value: PositionMesh) => (instance = value),
			geometry: new THREE.BoxGeometry(),
			material: new THREE.MeshBasicMaterial(),
		});
		root.advanceFrames(1, 1);
		expect(mesh.count).toBe(1);
		expect(instance.instance.current).toBe(mesh);
		expect(mesh.instanceMatrix.array.slice(12, 15)).toEqual(
			new Float32Array(_name.startsWith('render') ? [2, 3, 4] : [3, 2, 1]),
		);
		root.unmount();
	});
	it('rejects Instance outside its required provider', async () => {
		await expect(createOctaneThree(InstanceWithoutParentScene, {})).rejects.toThrow(
			'Instance must be used inside Instances component.',
		);
	});
});
