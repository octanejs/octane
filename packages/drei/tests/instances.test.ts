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
import { PositionMesh } from '../src/index.js';
import {
	FactoryInstancesScene,
	InstancesScene,
	InstanceWithoutParentScene,
	MergedArrayScene,
	MergedRecordScene,
	RenderPropInstancesScene,
} from './_fixtures/instances.three.tsrx';

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

describe('Instances', () => {
	it('matches virtual instances, matrix/color buffers, ranges, custom attributes, refs, and frame limits', async () => {
		const reactGeometry = new THREE.BoxGeometry();
		const reactMaterial = new THREE.MeshBasicMaterial({ side: THREE.BackSide });
		const octaneGeometry = reactGeometry.clone();
		const octaneMaterial = reactMaterial.clone();
		const react = await reactInstances(reactGeometry, reactMaterial);
		let mesh!: THREE.InstancedMesh;
		let first!: PositionMesh;
		let second!: PositionMesh;
		let attribute!: THREE.InstancedBufferAttribute;
		const octane = await createOctaneThree(InstancesScene, {
			ref: (value: THREE.InstancedMesh) => (mesh = value),
			firstRef: (value: PositionMesh) => (first = value),
			secondRef: (value: PositionMesh) => (second = value),
			attributeRef: (value: THREE.InstancedBufferAttribute) => (attribute = value),
			geometry: octaneGeometry,
			material: octaneMaterial,
			limit: 3,
			range: 1,
			frames: 2,
			parentPosition: [4, 0, 0],
			firstPosition: [1, 2, 3],
			firstScale: [2, 3, 4],
			firstColor: '#4080c0',
			showSecond: true,
			secondPosition: [-2, 1, 0.5],
			secondScale: 0.75,
			secondColor: 'red',
		});
		await reactThreeAct(async () => reactAdvance(1, true, react.getState()));
		octane.advanceFrames(1, 1);
		expect(snapshot(mesh)).toEqual(snapshot(react.mesh));
		expect(first.instance.current).toBe(mesh);
		expect(first.geometry).toBe(mesh.geometry);
		expect(first.position.toArray()).toEqual(react.first.position.toArray());
		expect(second.scale.toArray()).toEqual(react.second.scale.toArray());
		expect(attribute.usage).toBe(react.attribute.usage);
		await reactThreeAct(async () => reactAdvance(1, true, react.getState()));
		octane.advanceFrames(1, 1);
		const versions = [mesh.instanceMatrix.version, mesh.instanceColor!.version, attribute.version];
		await reactThreeAct(async () => reactAdvance(1, true, react.getState()));
		octane.advanceFrames(1, 1);
		expect([mesh.instanceMatrix.version, mesh.instanceColor!.version, attribute.version]).toEqual(
			versions,
		);
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
		expect(octaneGeometry.getAttribute('scale')).toBeUndefined();
	});

	it('matches PositionMesh raycasting and draw-count and miss negative controls', () => {
		function exercise(PointClass: typeof PositionMesh | typeof ReactPositionMesh) {
			const parent = new THREE.InstancedMesh(
				new THREE.BoxGeometry(),
				new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
				1,
			);
			parent.count = 1;
			parent.setMatrixAt(0, new THREE.Matrix4().makeTranslation(1, 0, 0));
			const point = new PointClass() as PositionMesh;
			const key = { current: point };
			point.instance = { current: parent };
			point.instanceKey = key;
			parent.userData.instances = [key];
			parent.updateMatrixWorld(true);
			const hits: THREE.Intersection[] = [];
			point.raycast(
				new THREE.Raycaster(new THREE.Vector3(1, 0, 5), new THREE.Vector3(0, 0, -1)),
				hits,
			);
			parent.count = -1;
			const excluded: THREE.Intersection[] = [];
			point.raycast(
				new THREE.Raycaster(new THREE.Vector3(1, 0, 5), new THREE.Vector3(0, 0, -1)),
				excluded,
			);
			parent.count = 1;
			const misses: THREE.Intersection[] = [];
			point.raycast(
				new THREE.Raycaster(new THREE.Vector3(5, 0, 5), new THREE.Vector3(0, 0, -1)),
				misses,
			);
			return {
				hit: hits[0] && {
					distance: hits[0].distance,
					point: hits[0].point.toArray(),
					instanceId: hits[0].instanceId,
				},
				excluded: excluded.length,
				misses: misses.length,
				geometryIdentity: point.geometry === parent.geometry,
			};
		}
		expect(exercise(PositionMesh)).toEqual(exercise(ReactPositionMesh));
		expect(exercise(PositionMesh)).toMatchObject({
			excluded: 0,
			misses: 0,
			geometryIdentity: true,
		});
	});

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

	it('matches Merged array and record composition while filtering non-mesh record entries', async () => {
		const arrayMeshes = [
			new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()),
			new THREE.Mesh(new THREE.SphereGeometry(), new THREE.MeshStandardMaterial()),
		];
		const reactArray = await reactMerged(arrayMeshes);
		let group!: THREE.Group;
		let first!: PositionMesh;
		let second!: PositionMesh;
		const arrayRoot = await createOctaneThree(MergedArrayScene, {
			ref: (value: THREE.Group) => (group = value),
			firstRef: (value: PositionMesh) => (first = value),
			secondRef: (value: PositionMesh) => (second = value),
			meshes: arrayMeshes,
		});
		await reactThreeAct(async () => reactAdvance(1, true, reactArray.getState()));
		arrayRoot.advanceFrames(1, 1);
		expect(hierarchy(group)).toEqual(hierarchy(reactArray.group));
		expect(first.instance.current?.geometry).toBe(arrayMeshes[0]!.geometry);
		expect(second.instance.current?.geometry).toBe(arrayMeshes[1]!.geometry);
		arrayRoot.unmount();
		await reactThreeAct(async () => reactArray.root.unmount());

		const reactRecordMeshes: Record<string, THREE.Object3D> = {
			cube: arrayMeshes[0]!,
			ignored: new THREE.Group(),
			sphere: arrayMeshes[1]!,
		};
		const recordMeshes: Record<string, THREE.Object3D> = { ...reactRecordMeshes };
		const reactRecord = await reactMerged(reactRecordMeshes);
		let cube!: PositionMesh;
		let sphere!: PositionMesh;
		const recordRoot = await createOctaneThree(MergedRecordScene, {
			ref: () => {},
			cubeRef: (value: PositionMesh) => (cube = value),
			sphereRef: (value: PositionMesh) => (sphere = value),
			meshes: recordMeshes,
		});
		await reactThreeAct(async () => reactAdvance(1, true, reactRecord.getState()));
		recordRoot.advanceFrames(1, 1);
		expect(Object.keys(recordMeshes)).toEqual(Object.keys(reactRecordMeshes));
		expect(Object.keys(recordMeshes)).toEqual(['cube', 'sphere']);
		expect(hierarchy(cube.instance.current!)).toEqual(
			hierarchy(reactRecord.first.instance.current!),
		);
		expect(cube.instance.current?.geometry).toBe(arrayMeshes[0]!.geometry);
		expect(sphere.instance.current?.geometry).toBe(arrayMeshes[1]!.geometry);
		recordRoot.unmount();
		await reactThreeAct(async () => reactRecord.root.unmount());
	});

	it('rejects Instance outside its required provider', async () => {
		await expect(createOctaneThree(InstanceWithoutParentScene, {})).rejects.toThrow(
			'Instance must be used inside Instances component.',
		);
	});
});
