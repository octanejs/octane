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
import { PositionPoint } from '../../src/index.js';
import {
	PointWithoutParentScene,
	PointsBufferScene,
	PointsDispatchBufferScene,
	PointsInstancesScene,
} from '../_fixtures/points.three.tsrx';

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

describe('Points (Octane-only contracts)', () => {
	it('rejects Point outside its required Points provider', async () => {
		await expect(createOctaneThree(PointWithoutParentScene, {})).rejects.toThrow(
			'Point must be used inside Points component.',
		);
	});
});
