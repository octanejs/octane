import * as React from 'react';
import {
	act as reactThreeAct,
	createRoot as createReactThreeRoot,
	extend as extendReactThree,
} from '@react-three/fiber';
import { Image as ReactImage } from '@react-three/drei/core/Image.js';
import { useTexture as reactUseTexture } from '@react-three/drei/core/Texture.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { useTexture } from '../src/index.js';
import { ImageTextureScene, ImageUrlScene, InvalidImageScene } from './_fixtures/image.three.tsrx';

const originalLoad = THREE.TextureLoader.prototype.load;
beforeAll(() => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	extendReactThree(THREE as unknown as Record<string, new (...args: any[]) => any>);
	THREE.TextureLoader.prototype.load = function (url, onLoad) {
		const texture = new THREE.Texture({ width: 320, height: 180 } as any);
		texture.name = String(url);
		onLoad?.(texture);
		return texture;
	};
});
afterAll(() => {
	THREE.TextureLoader.prototype.load = originalLoad;
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

async function reactImage(props: Record<string, unknown>) {
	let mesh!: THREE.Mesh;
	const canvas = document.createElement('canvas');
	const root = createReactThreeRoot(canvas);
	await root.configure({
		gl: renderer(canvas),
		frameloop: 'never',
		size: { width: 200, height: 120, top: 0, left: 0 },
		dpr: 1,
	});
	await reactThreeAct(async () =>
		root.render(
			React.createElement(
				React.Suspense,
				{ fallback: null },
				React.createElement(ReactImage as any, {
					...props,
					ref: (value: THREE.Mesh) => (mesh = value),
				}),
			),
		),
	);
	return { root, mesh };
}

function snapshot(mesh: THREE.Mesh) {
	const geometry = mesh.geometry as THREE.PlaneGeometry;
	const material = mesh.material as THREE.ShaderMaterial & Record<string, any>;
	return {
		name: mesh.name,
		scale: mesh.scale.toArray(),
		segments: [geometry.parameters.widthSegments, geometry.parameters.heightSegments],
		color: material.color.getHexString(),
		map: material.map.name,
		zoom: material.zoom,
		radius: material.radius,
		grayscale: material.grayscale,
		opacity: material.opacity,
		transparent: material.transparent,
		bounds: material.imageBounds.toArray(),
		materialScale: material.scale.toArray(),
		resolution: material.resolution,
	};
}

describe('Image', () => {
	it('matches React texture mode geometry, transforms, and shader uniforms', async () => {
		const texture = new THREE.Texture({ width: 640, height: 360 } as any);
		texture.name = 'direct';
		const props = {
			texture,
			segments: 3,
			scale: [2, 1] as [number, number],
			color: '#123456',
			zoom: 1.4,
			radius: 0.15,
			grayscale: 0.35,
			opacity: 0.7,
			transparent: true,
			name: 'image',
		};
		const react = await reactImage(props);
		let octaneMesh!: THREE.Mesh;
		const octane = await createOctaneThree(
			ImageTextureScene,
			{ ...props, meshRef: (value: THREE.Mesh) => (octaneMesh = value) },
			{ width: 200, height: 120 },
		);
		expect(snapshot(octaneMesh)).toEqual(snapshot(react.mesh));
		octaneMesh.scale.x += 1;
		expect(snapshot(octaneMesh)).not.toEqual(snapshot(react.mesh));
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
	});

	it('matches React URL routing and rejects a missing source', async () => {
		const url = '/image.png';
		const react = await reactImage({ url, scale: [2, 1], name: 'image-url' });
		let octaneMesh!: THREE.Mesh;
		const octane = await createOctaneThree(
			ImageUrlScene,
			{ url, meshRef: (value: THREE.Mesh) => (octaneMesh = value) },
			{ width: 200, height: 120 },
		);
		await reactThreeAct(async () => {
			for (let index = 0; index < 8; index++) await Promise.resolve();
		});
		expect(snapshot(octaneMesh)).toEqual(snapshot(react.mesh));
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
		useTexture.clear(url);
		reactUseTexture.clear(url);
		await expect(createOctaneThree(InvalidImageScene, {})).rejects.toThrow(
			'<Image /> requires a url or texture',
		);
	});
});
