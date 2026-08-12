import * as React from 'react';
import {
	act as reactThreeAct,
	createRoot as createReactThreeRoot,
	extend as extendReactThree,
} from '@react-three/fiber';
import { Svg as ReactSvg } from '@react-three/drei/core/Svg.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SVGLoader } from 'three-stdlib';
import { SvgScene } from './_fixtures/svg.three.tsrx';

const source =
	'<svg xmlns="http://www.w3.org/2000/svg"><path fill="#ff0000" fill-opacity="0.8" stroke="#00ff00" stroke-opacity="0.9" stroke-width="2" d="M0 0 L20 0 L20 10 Z"/></svg>';
const originalLoad = SVGLoader.prototype.load;

beforeAll(() => {
	SVGLoader.prototype.load = function (_url, onLoad) {
		const data = this.parse(source);
		onLoad?.(data);
		return this;
	} as typeof SVGLoader.prototype.load;
});

afterAll(() => {
	SVGLoader.prototype.load = originalLoad;
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

async function reactSvg(skipFill = false, skipStrokes = false) {
	let object!: THREE.Object3D;
	const canvas = document.createElement('canvas');
	const root = createReactThreeRoot(canvas);
	await root.configure({ gl: renderer(canvas), frameloop: 'never' });
	await reactThreeAct(async () =>
		root.render(
			React.createElement(
				React.Suspense,
				{ fallback: null },
				React.createElement(ReactSvg, {
					ref: (value: THREE.Object3D) => (object = value),
					src: source,
					skipFill,
					skipStrokes,
					fillMaterial: { opacity: 0.6 },
					strokeMaterial: { opacity: 0.7 },
					fillMeshProps: { name: 'fill' },
					strokeMeshProps: { name: 'stroke' },
					name: 'svg',
					position: [1, 2, 3],
				}),
			),
		),
	);
	return { root, object };
}

function snapshot(object: THREE.Object3D) {
	return {
		name: object.name,
		position: object.position.toArray(),
		scale: object.children[0].scale.toArray(),
		meshes: object.children[0].children.map((child) => {
			const mesh = child as THREE.Mesh;
			const material = mesh.material as THREE.MeshBasicMaterial;
			return {
				name: mesh.name,
				order: mesh.renderOrder,
				color: material.color.getHexString(),
				opacity: material.opacity,
				side: material.side,
				depthWrite: material.depthWrite,
			};
		}),
	};
}

describe('Svg', () => {
	it.each([
		[false, false],
		[true, false],
		[false, true],
	] as const)(
		'matches React geometry/material rendering for skipFill=%s skipStrokes=%s',
		async (skipFill, skipStrokes) => {
			extendReactThree(THREE as unknown as Record<string, new (...args: any[]) => any>);
			const react = await reactSvg(skipFill, skipStrokes);
			let octaneObject!: THREE.Object3D;
			const octane = await createOctaneThree(SvgScene, {
				src: source,
				skipFill,
				skipStrokes,
				objectRef: (value: THREE.Object3D) => (octaneObject = value),
			});
			await reactThreeAct(async () => {
				for (let index = 0; index < 8; index++) await Promise.resolve();
			});
			expect(snapshot(octaneObject)).toEqual(snapshot(react.object));
			octaneObject.position.x += 1;
			expect(snapshot(octaneObject)).not.toEqual(snapshot(react.object));
			octane.unmount();
			await reactThreeAct(async () => react.root.unmount());
		},
	);
});
