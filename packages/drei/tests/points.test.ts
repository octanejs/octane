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
	Point as ReactPoint,
	Points as ReactPoints,
	PointsBuffer as ReactPointsBuffer,
	PositionPoint as ReactPositionPoint,
} from '@react-three/drei/core/Points.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PositionPoint } from '../src/index.js';
import {
	PointWithoutParentScene,
	PointsBufferScene,
	PointsDispatchBufferScene,
	PointsInstancesScene,
} from './_fixtures/points.three.tsrx';

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

function attributesSnapshot(points: THREE.Points, includeVersions = true) {
	const { position, color, size } = points.geometry.attributes;
	return {
		drawRange: { ...points.geometry.drawRange },
		position: position && {
			array: Array.from(position.array),
			count: position.count,
			itemSize: position.itemSize,
			usage: position.usage,
			...(includeVersions ? { version: position.version } : {}),
		},
		color: color && {
			array: Array.from(color.array),
			count: color.count,
			itemSize: color.itemSize,
			usage: color.usage,
			...(includeVersions ? { version: color.version } : {}),
		},
		size: size && {
			array: Array.from(size.array),
			count: size.count,
			itemSize: size.itemSize,
			usage: size.usage,
			...(includeVersions ? { version: size.version } : {}),
		},
	};
}

async function reactInstances() {
	const canvas = document.createElement('canvas');
	const root = createReactThreeRoot(canvas);
	let points!: THREE.Points;
	let first!: ReactPositionPoint;
	let second!: ReactPositionPoint;
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
					ReactPoints,
					{
						ref: (value: THREE.Points) => (points = value),
						limit: 3,
						range: 1,
						position: [4, 0, 0],
					},
					React.createElement(ReactPoint, {
						ref: (value: ReactPositionPoint) => (first = value),
						position: [1, 2, 3],
						size: 2.5,
						color: '#4080c0',
					}),
					React.createElement(ReactPoint, {
						ref: (value: ReactPositionPoint) => (second = value),
						position: [-2, 1, 0.5],
						size: 0.75,
						color: 'red',
					}),
				),
				React.createElement(Capture),
			),
		),
	);
	return { root, points, first, second, getState };
}

async function reactBuffer(
	Component: typeof ReactPoints | typeof ReactPointsBuffer,
	positions: Float32Array,
	colors: Float32Array,
	sizes: Float32Array,
) {
	const canvas = document.createElement('canvas');
	const root = createReactThreeRoot(canvas);
	let points!: THREE.Points;
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
				React.createElement(Component, {
					ref: (value: THREE.Points) => (points = value),
					positions,
					colors,
					sizes,
					stride: 2,
				}),
				React.createElement(Capture),
			),
		),
	);
	return { root, points, getState };
}

describe('Points', () => {
	it('matches instance subscriptions, refs, transforms, range, colors, sizes, and dynamic updates', async () => {
		const react = await reactInstances();
		let points!: THREE.Points;
		let first!: PositionPoint;
		let second!: PositionPoint;
		const octane = await createOctaneThree(PointsInstancesScene, {
			ref: (value: THREE.Points) => (points = value),
			firstRef: (value: PositionPoint) => (first = value),
			secondRef: (value: PositionPoint) => (second = value),
			limit: 3,
			range: 1,
			parentPosition: [4, 0, 0],
			firstPosition: [1, 2, 3],
			firstSize: 2.5,
			firstColor: '#4080c0',
			showSecond: true,
			secondPosition: [-2, 1, 0.5],
			secondSize: 0.75,
			secondColor: 'red',
		});
		await reactThreeAct(async () => reactAdvance(1, true, react.getState()));
		octane.advanceFrames(1, 1);
		expect(attributesSnapshot(points, false)).toEqual(attributesSnapshot(react.points, false));
		expect(points.geometry.attributes.position!.version).toBeGreaterThan(0);
		expect(points.geometry.attributes.color!.version).toBeGreaterThan(0);
		expect(points.geometry.attributes.size!.version).toBeGreaterThan(0);
		expect(points.userData.instances.length).toBe(react.points.userData.instances.length);
		expect(first.instance.current).toBe(points);
		expect(second.instance.current).toBe(points);
		expect(first.geometry).toBe(points.geometry);
		expect(first.position.toArray()).toEqual(react.first.position.toArray());
		expect(second.position.toArray()).toEqual(react.second.position.toArray());
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
	});

	it.each([
		['explicit buffer component', ReactPointsBuffer, PointsBufferScene],
		['Float32Array dispatch through Points', ReactPoints, PointsDispatchBufferScene],
	] as const)(
		'matches %s attribute construction and frame invalidation',
		async (_name, ReactComponent, OctaneComponent) => {
			const reactPositions = new Float32Array([1, 2, 3, 4, 5, 6]);
			const reactColors = new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6]);
			const reactSizes = new Float32Array([7, 8, 9]);
			const octanePositions = reactPositions.slice();
			const octaneColors = reactColors.slice();
			const octaneSizes = reactSizes.slice();
			const react = await reactBuffer(ReactComponent, reactPositions, reactColors, reactSizes);
			let points!: THREE.Points;
			const octane = await createOctaneThree(OctaneComponent, {
				ref: (value: THREE.Points) => (points = value),
				positions: octanePositions,
				colors: octaneColors,
				sizes: octaneSizes,
				stride: 2,
			});
			expect(points.geometry.attributes.position!.array).toBe(octanePositions);
			expect(react.points.geometry.attributes.position!.array).toBe(reactPositions);
			await reactThreeAct(async () => reactAdvance(1, true, react.getState()));
			octane.advanceFrames(1, 1);
			expect(attributesSnapshot(points)).toEqual(attributesSnapshot(react.points));
			// Preserve the pinned upstream's non-obvious size count calculation.
			expect(points.geometry.attributes.size!.count).toBe(octaneSizes.length / 2);
			octane.unmount();
			await reactThreeAct(async () => react.root.unmount());
		},
	);

	it('matches PositionPoint raycasting and its draw-range and miss negative controls', () => {
		function exercise(PointClass: typeof PositionPoint | typeof ReactPositionPoint) {
			const parent = new THREE.Points(new THREE.BufferGeometry());
			parent.geometry.setDrawRange(0, 1);
			const point = new PointClass() as PositionPoint;
			const key = { current: point };
			point.position.set(1, 0, 0);
			point.instance = { current: parent };
			point.instanceKey = key;
			parent.userData.instances = [key];
			parent.add(point);
			parent.updateMatrixWorld(true);
			const raycaster = new THREE.Raycaster(
				new THREE.Vector3(1, 0, 5),
				new THREE.Vector3(0, 0, -1),
				0,
				10,
			);
			raycaster.params.Points = { threshold: 0.2 };
			const hits: THREE.Intersection[] = [];
			point.raycast(raycaster, hits);
			const hit = hits[0];
			parent.geometry.setDrawRange(0, -1);
			const excluded: THREE.Intersection[] = [];
			point.raycast(raycaster, excluded);
			parent.geometry.setDrawRange(0, 1);
			const misses: THREE.Intersection[] = [];
			point.raycast(
				new THREE.Raycaster(new THREE.Vector3(5, 0, 5), new THREE.Vector3(0, 0, -1)),
				misses,
			);
			return {
				hit: hit && {
					distance: hit.distance,
					distanceToRay: hit.distanceToRay,
					point: hit.point.toArray(),
					index: hit.index,
					face: hit.face,
				},
				excluded: excluded.length,
				misses: misses.length,
				geometryIdentity: point.geometry === parent.geometry,
			};
		}
		expect(exercise(PositionPoint)).toEqual(exercise(ReactPositionPoint));
		expect(exercise(PositionPoint)).toMatchObject({
			excluded: 0,
			misses: 0,
			geometryIdentity: true,
		});
	});

	it('rejects Point outside its required Points provider', async () => {
		await expect(createOctaneThree(PointWithoutParentScene, {})).rejects.toThrow(
			'Point must be used inside Points component.',
		);
	});
});
