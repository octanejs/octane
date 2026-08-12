import * as React from 'react';
import {
	act as reactThreeAct,
	advance as reactAdvance,
	createRoot as createReactThreeRoot,
	extend as extendReactThree,
	useThree as reactUseThree,
	type RootState as ReactRootState,
} from '@react-three/fiber';
import {
	Segment as ReactSegment,
	Segments as ReactSegments,
} from '@react-three/drei/core/Segments.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Line2, LineMaterial, LineSegmentsGeometry } from 'three-stdlib';
import { SegmentObject, type SegmentObject as SegmentObjectType } from '../src/index.js';
import { SegmentsScene } from './_fixtures/segments.three.tsrx';

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

function snapshot(line: Line2) {
	const geometry = line.geometry as LineSegmentsGeometry;
	const material = line.material as LineMaterial;
	return {
		positions: Array.from(geometry.getAttribute('instanceStart').array),
		ends: Array.from(geometry.getAttribute('instanceEnd').array),
		colorsStart: Array.from(geometry.getAttribute('instanceColorStart').array),
		colorsEnd: Array.from(geometry.getAttribute('instanceColorEnd').array),
		linewidth: material.linewidth,
		vertexColors: material.vertexColors,
		resolution: material.resolution.toArray(),
	};
}

async function reactSegments(firstStart: THREE.Vector3) {
	const canvas = document.createElement('canvas');
	const root = createReactThreeRoot(canvas);
	let line!: Line2;
	let first!: SegmentObjectType;
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
					ReactSegments,
					{ ref: (value: Line2) => (line = value), limit: 2, lineWidth: 3 },
					React.createElement(ReactSegment, {
						ref: (value: SegmentObjectType) => (first = value),
						start: firstStart,
						end: [1, 2, 3],
						color: 'red',
					}),
					React.createElement(ReactSegment, { start: 2, end: [3, 4, 5], color: '#00ff00' }),
					React.createElement(ReactSegment, { start: [9, 9, 9], end: [10, 10, 10], color: 'blue' }),
				),
				React.createElement(Capture),
			),
		),
	);
	return { root, line, first, getState };
}

describe('Segments', () => {
	it('matches subscriptions, limit truncation, vector normalization, material props, and frame buffers', async () => {
		const firstStart = new THREE.Vector3(-1, 0.5, 2);
		const react = await reactSegments(firstStart);
		let octaneLine!: Line2;
		let octaneFirst!: SegmentObject;
		const octane = await createOctaneThree(SegmentsScene, {
			ref: (value: Line2) => (octaneLine = value),
			firstRef: (value: SegmentObject) => (octaneFirst = value),
			limit: 2,
			lineWidth: 3,
			dashed: false,
			firstStart,
			showSecond: true,
		});
		await reactThreeAct(async () => reactAdvance(1, true, react.getState()));
		octane.advanceFrames(1, 1);
		expect(snapshot(octaneLine)).toEqual(snapshot(react.line));
		expect(octaneFirst.start === firstStart).toBe(react.first.start === firstStart);
		expect(octaneFirst.start.toArray()).toEqual(react.first.start.toArray());
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
	});
});
