import * as React from 'react';
import {
	act as reactThreeAct,
	createRoot as createReactThreeRoot,
	extend as extendReactThree,
} from '@react-three/fiber';
import { CatmullRomLine as ReactCatmullRomLine } from '@react-three/drei/core/CatmullRomLine.js';
import { CubicBezierLine as ReactCubicBezierLine } from '@react-three/drei/core/CubicBezierLine.js';
import { Edges as ReactEdges } from '@react-three/drei/core/Edges.js';
import { Line as ReactLine } from '@react-three/drei/core/Line.js';
import {
	QuadraticBezierLine as ReactQuadraticBezierLine,
	type QuadraticBezierLineRef as ReactQuadraticRef,
} from '@react-three/drei/core/QuadraticBezierLine.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Line2, LineSegments2 } from 'three-stdlib';
import type { QuadraticBezierLineRef } from '../src/index.js';
import {
	CatmullScene,
	CubicScene,
	EdgesScene,
	LineScene,
	QuadraticScene,
} from './_fixtures/lines.three.tsrx';

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

async function reactRoot(element: React.ReactNode) {
	const canvas = document.createElement('canvas');
	const root = createReactThreeRoot(canvas);
	await root.configure({
		gl: renderer(canvas),
		frameloop: 'never',
		dpr: 1,
		size: { width: 1280, height: 800, top: 0, left: 0 },
	});
	await reactThreeAct(async () => root.render(element));
	return root;
}

function lineSnapshot(line: Line2 | LineSegments2) {
	const geometry = line.geometry;
	const material = line.material;
	return {
		type: line.type,
		start: Array.from(geometry.attributes.instanceStart.array),
		end: Array.from(geometry.attributes.instanceEnd.array),
		colorsStart: geometry.attributes.instanceColorStart
			? Array.from(geometry.attributes.instanceColorStart.array)
			: null,
		colorsEnd: geometry.attributes.instanceColorEnd
			? Array.from(geometry.attributes.instanceColorEnd.array)
			: null,
		linewidth: material.linewidth,
		resolution: material.resolution.toArray(),
		dashed: 'USE_DASH' in material.defines,
		transparent: material.transparent,
		color: material.color.getHex(),
	};
}

describe('line helpers', () => {
	it.each([false, true])(
		'matches Line geometry, colors, material, and segments=%s',
		async (segments) => {
			const points = [new THREE.Vector2(0, 1), [2, 3, 4], new THREE.Vector3(5, 6, 7)] as const;
			const vertexColors = [
				[1, 0, 0, 0.25],
				[0, 1, 0, 0.5],
				[0, 0, 1, 1],
			] as const;
			let reactLine: Line2 | LineSegments2 | null = null;
			const react = await reactRoot(
				React.createElement(ReactLine, {
					points,
					vertexColors,
					segments,
					lineWidth: 3,
					dashed: true,
					color: 'hotpink',
					ref: (value: Line2 | LineSegments2 | null) => (reactLine = value),
				}),
			);
			let octaneLine: Line2 | LineSegments2 | null = null;
			const octane = await createOctaneThree(LineScene, {
				points,
				vertexColors,
				segments,
				lineWidth: 3,
				dashed: true,
				color: 'hotpink',
				lineRef: (value: Line2 | LineSegments2 | null) => (octaneLine = value),
			});
			expect(lineSnapshot(octaneLine!)).toEqual(lineSnapshot(reactLine!));
			octane.unmount();
			await reactThreeAct(async () => react.unmount());
		},
	);

	it('matches quadratic points and imperative setPoints', async () => {
		let reactLine: ReactQuadraticRef | null = null;
		const react = await reactRoot(
			React.createElement(ReactQuadraticBezierLine, {
				start: [0, 0, 0],
				end: [2, 1, 0],
				segments: 8,
				ref: (value: ReactQuadraticRef | null) => (reactLine = value),
			}),
		);
		let octaneLine: QuadraticBezierLineRef | null = null;
		const octane = await createOctaneThree(QuadraticScene, {
			start: [0, 0, 0],
			end: [2, 1, 0],
			mid: undefined,
			segments: 8,
			lineRef: (value: QuadraticBezierLineRef | null) => (octaneLine = value),
		});
		expect(lineSnapshot(octaneLine!)).toEqual(lineSnapshot(reactLine!));
		reactLine!.setPoints([1, 0, 0], [3, 2, 0], [2, 3, 0]);
		octaneLine!.setPoints([1, 0, 0], [3, 2, 0], [2, 3, 0]);
		expect(lineSnapshot(octaneLine!)).toEqual(lineSnapshot(reactLine!));
		octane.unmount();
		await reactThreeAct(async () => react.unmount());
	});

	it('matches cubic and Catmull-Rom curve sampling with interpolated colors', async () => {
		let reactCubic: Line2 | null = null;
		const cubicProps = {
			start: [0, 0, 0] as [number, number, number],
			end: [3, 0, 0] as [number, number, number],
			midA: [1, 2, 0] as [number, number, number],
			midB: [2, -1, 0] as [number, number, number],
			segments: 7,
		};
		const react = await reactRoot(
			React.createElement(ReactCubicBezierLine, {
				...cubicProps,
				ref: (value: Line2 | null) => (reactCubic = value),
			}),
		);
		let octaneCubic: Line2 | null = null;
		const octane = await createOctaneThree(CubicScene, {
			...cubicProps,
			lineRef: (value: Line2 | null) => (octaneCubic = value),
		});
		expect(lineSnapshot(octaneCubic!)).toEqual(lineSnapshot(reactCubic!));

		const catmullProps = {
			points: [
				[0, 0, 0],
				[1, 2, 0],
				[3, 1, 0],
			] as [number, number, number][],
			closed: false,
			curveType: 'centripetal' as const,
			tension: 0.5,
			segments: 6,
			vertexColors: [new THREE.Color('red'), new THREE.Color('blue')],
		};
		let reactCatmull: Line2 | null = null;
		const reactCatmullRoot = await reactRoot(
			React.createElement(ReactCatmullRomLine, {
				...catmullProps,
				ref: (value: Line2 | null) => (reactCatmull = value),
			}),
		);
		let octaneCatmull: Line2 | null = null;
		const octaneCatmullRoot = await createOctaneThree(CatmullScene, {
			...catmullProps,
			lineRef: (value: Line2 | null) => (octaneCatmull = value),
		});
		expect(lineSnapshot(octaneCatmull!)).toEqual(lineSnapshot(reactCatmull!));
		octane.unmount();
		octaneCatmullRoot.unmount();
		await reactThreeAct(async () => react.unmount());
		await reactThreeAct(async () => reactCatmullRoot.unmount());
	});

	it('matches Edges parent geometry extraction, threshold output, and line material', async () => {
		let reactEdges: LineSegments2 | null = null;
		const react = await reactRoot(
			React.createElement(
				'mesh',
				null,
				React.createElement('boxGeometry', { args: [2, 3, 4] }),
				React.createElement('meshBasicMaterial'),
				React.createElement(ReactEdges, {
					threshold: 20,
					color: 'red',
					lineWidth: 2,
					ref: (value: LineSegments2 | null) => (reactEdges = value),
				}),
			),
		);
		let octaneEdges: LineSegments2 | null = null;
		const octane = await createOctaneThree(EdgesScene, {
			threshold: 20,
			edgesRef: (value: LineSegments2 | null) => (octaneEdges = value),
		});
		expect(lineSnapshot(octaneEdges!)).toEqual(lineSnapshot(reactEdges!));
		octane.unmount();
		await reactThreeAct(async () => react.unmount());
	});
});
