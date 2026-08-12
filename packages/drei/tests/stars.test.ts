import * as React from 'react';
import {
	act as reactThreeAct,
	advance as reactAdvance,
	createRoot as createReactThreeRoot,
	extend as extendReactThree,
	useThree as reactUseThree,
	type RootState as ReactRootState,
} from '@react-three/fiber';
import { Stars as ReactStars } from '@react-three/drei/core/Stars.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { StarsScene } from './_fixtures/stars.three.tsrx';

beforeAll(() => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	extendReactThree(THREE as unknown as Record<string, new (...args: any[]) => any>);
});

afterEach(() => vi.restoreAllMocks());

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

function snapshot(points: THREE.Points) {
	const material = points.material as THREE.ShaderMaterial;
	return {
		position: Array.from(points.geometry.getAttribute('position').array),
		color: Array.from(points.geometry.getAttribute('color').array),
		size: Array.from(points.geometry.getAttribute('size').array),
		material: {
			blending: material.blending,
			fade: material.uniforms.fade.value,
			time: material.uniforms.time.value,
			depthWrite: material.depthWrite,
			transparent: material.transparent,
			vertexColors: material.vertexColors,
		},
	};
}

async function reactStars(props: Record<string, unknown>) {
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
				React.createElement(ReactStars, {
					...props,
					ref: (value: THREE.Points) => (points = value),
				}),
				React.createElement(Capture),
			),
		),
	);
	return { root, points, getState };
}

describe('Stars', () => {
	it('matches seeded geometry, material flags, fade, and frame timing', async () => {
		vi.spyOn(Math, 'random').mockReturnValue(0.25);
		const props = {
			radius: 10,
			depth: 5,
			count: 4,
			factor: 2,
			saturation: 0.4,
			fade: true,
			speed: 1.5,
		};
		const react = await reactStars(props);
		let octanePoints!: THREE.Points;
		const octane = await createOctaneThree(StarsScene, {
			...props,
			ref: (value: THREE.Points) => (octanePoints = value),
		});
		expect(snapshot(octanePoints)).toEqual(snapshot(react.points));
		await reactThreeAct(async () => reactAdvance(2, true, react.getState()));
		octane.advanceFrames(1, 2);
		expect(snapshot(octanePoints)).toEqual(snapshot(react.points));
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
	});
});
