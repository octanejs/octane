import * as React from 'react';
import {
	act as reactThreeAct,
	advance as reactAdvance,
	createRoot as createReactThreeRoot,
	extend as extendReactThree,
	useThree as reactUseThree,
	type RootState as ReactRootState,
} from '@react-three/fiber';
import { Sparkles as ReactSparkles } from '@react-three/drei/core/Sparkles.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SparklesScene } from './_fixtures/sparkles.three.tsrx';

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

type SparklesMaterial = THREE.ShaderMaterial & { time: number; pixelRatio: number };

function snapshot(points: THREE.Points) {
	const names = ['position', 'size', 'opacity', 'speed', 'color', 'noise'];
	const material = points.material as SparklesMaterial;
	return {
		attributes: Object.fromEntries(
			names.map((name) => {
				const value = points.geometry.getAttribute(name) as THREE.BufferAttribute;
				return [
					name,
					{
						itemSize: value.itemSize,
						array: Array.from(value.array, (entry) => (entry === 0 ? 0 : entry)),
					},
				];
			}),
		),
		material: {
			transparent: material.transparent,
			depthWrite: material.depthWrite,
			pixelRatio: material.pixelRatio,
			time: material.time,
		},
	};
}

async function reactSparkles(props: Record<string, unknown>) {
	const canvas = document.createElement('canvas');
	const root = createReactThreeRoot(canvas);
	let points!: THREE.Points;
	let getState!: () => ReactRootState;
	function Capture() {
		getState = reactUseThree((state) => state.get);
		return null;
	}
	await root.configure({ gl: renderer(canvas), frameloop: 'never', dpr: 1 });
	await reactThreeAct(async () =>
		root.render(
			React.createElement(
				React.Fragment,
				null,
				React.createElement(ReactSparkles, {
					...props,
					ref: (value: THREE.Points) => (points = value),
				}),
				React.createElement(Capture),
			),
		),
	);
	return { root, points, getState };
}

describe('Sparkles', () => {
	it('matches generated attributes, material configuration, and frame time', async () => {
		const props = {
			count: 2,
			scale: 0,
			speed: new Float32Array([0.5, 1.5]),
			opacity: 0.75,
			size: new Float32Array([2, 3]),
			color: '#ff0000',
			noise: new THREE.Vector3(1, 2, 3),
		};
		const react = await reactSparkles(props);
		let octanePoints!: THREE.Points;
		const octane = await createOctaneThree(SparklesScene, {
			...props,
			ref: (value: THREE.Points) => (octanePoints = value),
		});
		expect(snapshot(octanePoints)).toEqual(snapshot(react.points));
		await reactThreeAct(async () => reactAdvance(2.5, true, react.getState()));
		octane.advanceFrames(1, 2.5);
		expect((octanePoints.material as SparklesMaterial).time).toBe(
			(react.points.material as SparklesMaterial).time,
		);
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
	});
});
