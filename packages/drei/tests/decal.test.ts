import * as React from 'react';
import {
	act as reactThreeAct,
	createRoot as createReactThreeRoot,
	extend as extendReactThree,
} from '@react-three/fiber';
import { Decal as ReactDecal } from '@react-three/drei/core/Decal.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DecalScene } from './_fixtures/decal.three.tsrx';

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

async function reactDecal(props: Record<string, unknown>) {
	const canvas = document.createElement('canvas');
	const root = createReactThreeRoot(canvas);
	let value: THREE.Mesh | null = null;
	await root.configure({ gl: renderer(canvas), frameloop: 'never' });
	await reactThreeAct(async () =>
		root.render(
			React.createElement(
				'mesh',
				{ name: 'parent' },
				React.createElement('boxGeometry', { args: [2, 2, 2] }),
				React.createElement('meshBasicMaterial'),
				React.createElement(
					ReactDecal,
					{ ...props, ref: (mesh: THREE.Mesh | null) => (value = mesh), name: 'decal' },
					React.createElement('meshBasicMaterial', { color: 'hotpink' }),
				),
			),
		),
	);
	return { root, value: value! as THREE.Mesh };
}

function snapshot(mesh: THREE.Mesh) {
	const material = mesh.material as THREE.MeshBasicMaterial;
	return {
		name: mesh.name,
		positions: Array.from(mesh.geometry.getAttribute('position').array),
		normals: Array.from(mesh.geometry.getAttribute('normal').array),
		uvs: Array.from(mesh.geometry.getAttribute('uv').array),
		material: {
			transparent: material.transparent,
			polygonOffset: material.polygonOffset,
			polygonOffsetFactor: material.polygonOffsetFactor,
			depthTest: material.depthTest,
			color: material.color.getHex(),
		},
		debugChildren: mesh.children.length,
	};
}

describe('Decal', () => {
	it.each([
		['manual orientation', { position: [0, 0, 1], rotation: [0, 0, 0], scale: [0.8, 0.6, 0.4] }],
		['closest-normal orientation', { position: [0.2, 0.1, 1], rotation: 0.25, scale: 0.5 }],
	])('matches generated geometry and material defaults for %s', async (_, props) => {
		const react = await reactDecal(props);
		let octaneValue: THREE.Mesh | null = null;
		const octane = await createOctaneThree(DecalScene, {
			...props,
			decalRef: (mesh: THREE.Mesh | null) => (octaneValue = mesh),
		});
		expect(snapshot(octaneValue!)).toEqual(snapshot(react.value));
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
	});

	it('matches debug helper placement and disables helper raycasting', async () => {
		const props = { debug: true, position: [0, 0, 1], rotation: [0.1, 0.2, 0.3], scale: [1, 2, 3] };
		const react = await reactDecal(props);
		let octaneValue: THREE.Mesh | null = null;
		const octane = await createOctaneThree(DecalScene, {
			...props,
			decalRef: (mesh: THREE.Mesh | null) => (octaneValue = mesh),
		});
		const helperSnapshot = (mesh: THREE.Mesh) => ({
			position: mesh.children[0].position.toArray(),
			rotation: mesh.children[0].rotation.toArray(),
			scale: mesh.children[0].scale.toArray(),
			raycasts: mesh.children[0].children.map((child) => child.raycast([], {} as any)),
		});
		expect(helperSnapshot(octaneValue!)).toEqual(helperSnapshot(react.value));
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
	});
});
