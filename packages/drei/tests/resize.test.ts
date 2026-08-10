import * as React from 'react';
import {
	act as reactThreeAct,
	createRoot as createReactThreeRoot,
	extend as extendReactThree,
} from '@react-three/fiber';
import { Resize as ReactResize } from '@react-three/drei/core/Resize.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ResizeScene } from './_fixtures/resize.three.tsrx';

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

async function reactResize(props: Record<string, unknown>) {
	const canvas = document.createElement('canvas');
	const root = createReactThreeRoot(canvas);
	let value: THREE.Group | null = null;
	await root.configure({ gl: renderer(canvas), frameloop: 'never' });
	await reactThreeAct(async () =>
		root.render(
			React.createElement(
				ReactResize,
				{ ...props, ref: (group: THREE.Group | null) => (value = group), name: 'resize' },
				React.createElement(
					'mesh',
					{ position: [2, 3, 4] },
					React.createElement('boxGeometry', { args: [2, 4, 8] }),
					React.createElement('meshBasicMaterial'),
				),
			),
		),
	);
	return { root, value: value! as THREE.Group };
}

describe('Resize', () => {
	it.each([
		['largest dimension', {}],
		['width', { width: true }],
		['height', { height: true }],
		['depth', { depth: true }],
		[
			'explicit bounds',
			{ box3: new THREE.Box3(new THREE.Vector3(-5, -2, -1), new THREE.Vector3(5, 2, 1)) },
		],
	])('matches %s scaling, hierarchy, props, and refs', async (_, props) => {
		const react = await reactResize(props);
		let octaneValue: THREE.Group | null = null;
		const octane = await createOctaneThree(ResizeScene, {
			...props,
			resizeRef: (group: THREE.Group | null) => (octaneValue = group),
		});
		const snapshot = (group: THREE.Group) => ({
			name: group.name,
			outerScale: group.children[0].scale.toArray(),
			childPosition: group.children[0].children[0].children[0].position.toArray(),
		});
		expect(snapshot(octaneValue!)).toEqual(snapshot(react.value));
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
	});
});
