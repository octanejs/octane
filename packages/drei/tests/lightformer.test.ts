import * as React from 'react';
import {
	act as reactThreeAct,
	createRoot as createReactThreeRoot,
	extend as extendReactThree,
} from '@react-three/fiber';
import { Lightformer as ReactLightformer } from '@react-three/drei/core/Lightformer.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { LightformerScene } from './_fixtures/lightformer.three.tsrx';

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

function snapshot(mesh: THREE.Mesh) {
	const material = mesh.material as THREE.MeshBasicMaterial;
	const light = mesh.children.find(
		(child): child is THREE.PointLight => child.isPointLight === true,
	);
	return {
		geometry: mesh.geometry.type,
		parameters: { ...mesh.geometry.parameters },
		scale: mesh.scale.toArray(),
		quaternion: mesh.quaternion.toArray(),
		color: material.color.toArray(),
		toneMapped: material.toneMapped,
		side: material.side,
		light: light && {
			castShadow: light.castShadow,
			intensity: light.intensity,
			color: light.color.toArray(),
		},
	};
}

async function reactLightformer(props: Record<string, unknown>) {
	const canvas = document.createElement('canvas');
	const root = createReactThreeRoot(canvas);
	let mesh!: THREE.Mesh;
	await root.configure({ gl: renderer(canvas), frameloop: 'never' });
	await reactThreeAct(async () =>
		root.render(
			React.createElement(ReactLightformer, {
				...props,
				ref: (value: THREE.Mesh) => (mesh = value),
			}),
		),
	);
	return { root, mesh };
}

describe('Lightformer', () => {
	it.each([
		['circle', undefined],
		['ring', [0.1, 0.9, 8]],
		['rect', [2, 3]],
		['plane', undefined],
		['box', [2, 3, 4]],
	] as const)('matches %s geometry defaults and explicit args', async (form, args) => {
		const props = {
			form,
			args,
			color: '#80c0ff',
			intensity: 2.5,
			scale: [2, 3] as [number, number],
		};
		const react = await reactLightformer(props);
		let octaneMesh!: THREE.Mesh;
		const octane = await createOctaneThree(LightformerScene, {
			...props,
			ref: (value: THREE.Mesh) => (octaneMesh = value),
			target: false,
			rotation: undefined,
			light: undefined,
		});
		expect(snapshot(octaneMesh)).toEqual(snapshot(react.mesh));
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
	});

	it('matches target orientation and optional point-light construction', async () => {
		const props = {
			form: 'box',
			target: [3, 2, -1] as [number, number, number],
			light: { intensity: 4, color: '#ff8040' },
		};
		const react = await reactLightformer(props);
		let octaneMesh!: THREE.Mesh;
		const octane = await createOctaneThree(LightformerScene, {
			...props,
			ref: (value: THREE.Mesh) => (octaneMesh = value),
			args: undefined,
			color: undefined,
			intensity: undefined,
			scale: undefined,
			rotation: undefined,
		});
		expect(snapshot(octaneMesh)).toEqual(snapshot(react.mesh));
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
	});
});
