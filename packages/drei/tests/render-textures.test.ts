import * as React from 'react';
import {
	act as reactThreeAct,
	advance as reactAdvance,
	createRoot as createReactThreeRoot,
	extend as extendReactThree,
	useThree as reactUseThree,
	type RootState,
} from '@react-three/fiber';
import { RenderTexture as ReactRenderTexture } from '@react-three/drei/core/RenderTexture.js';
import {
	RenderCubeTexture as ReactRenderCubeTexture,
	type RenderCubeTextureApi as ReactCubeApi,
} from '@react-three/drei/core/RenderCubeTexture.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { RenderCubeTextureApi } from '../src/index.js';
import { RenderCubeTextureScene, RenderTextureScene } from './_fixtures/render-textures.three.tsrx';

const originalCubeUpdate = THREE.CubeCamera.prototype.update;
const cubeUpdates: THREE.CubeCamera[] = [];

beforeAll(() => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	extendReactThree(THREE as unknown as Record<string, new (...args: any[]) => any>);
	THREE.CubeCamera.prototype.update = function () {
		cubeUpdates.push(this);
	};
});
afterAll(() => {
	THREE.CubeCamera.prototype.update = originalCubeUpdate;
});

function renderer(canvas: HTMLCanvasElement) {
	let target: THREE.WebGLRenderTarget | THREE.WebGLCubeRenderTarget | null = null;
	const renderCalls: Array<[THREE.Scene, THREE.Camera]> = [];
	return {
		domElement: canvas,
		outputColorSpace: THREE.SRGBColorSpace,
		toneMapping: THREE.NoToneMapping,
		autoClear: false,
		xr: { enabled: true, isPresenting: true },
		renderCalls,
		render(scene: THREE.Scene, camera: THREE.Camera) {
			renderCalls.push([scene, camera]);
		},
		setPixelRatio() {},
		setSize() {},
		setRenderTarget(value: typeof target) {
			target = value;
		},
		getRenderTarget() {
			return target;
		},
		renderLists: { dispose() {} },
		forceContextLoss() {},
		dispose() {},
	} as unknown as THREE.WebGLRenderer & { renderCalls: Array<[THREE.Scene, THREE.Camera]> };
}

async function reactRoot(element: React.ReactNode) {
	const canvas = document.createElement('canvas');
	const gl = renderer(canvas);
	const root = createReactThreeRoot(canvas);
	let state!: RootState;
	function Capture() {
		state = reactUseThree();
		return null;
	}
	await root.configure({
		gl,
		frameloop: 'never',
		size: { width: 120, height: 80, top: 0, left: 0 },
		dpr: 1,
	});
	await reactThreeAct(async () =>
		root.render(React.createElement(React.Fragment, null, element, React.createElement(Capture))),
	);
	return { root, state, gl };
}

function textureSnapshot(texture: THREE.Texture) {
	const target = (texture as any).__webglRenderTarget as THREE.WebGLRenderTarget | undefined;
	return {
		name: texture.name,
		mipmaps: texture.generateMipmaps,
		type: texture.type,
		flipY: texture.flipY,
		targetWidth: target?.width,
		targetHeight: target?.height,
	};
}

describe('render textures', () => {
	it('matches RenderTexture target configuration, portal ownership, frame budget, state restoration, and ref', async () => {
		let reactTexture!: THREE.Texture;
		let reactChild!: THREE.Group;
		const react = await reactRoot(
			React.createElement(
				ReactRenderTexture,
				{
					ref: (value: THREE.Texture) => (reactTexture = value),
					width: 64,
					height: 32,
					samples: 4,
					frames: 2,
					stencilBuffer: true,
					depthBuffer: true,
					generateMipmaps: true,
					name: 'render-texture',
				},
				React.createElement('group', {
					ref: (value: THREE.Group) => (reactChild = value),
					name: 'portal-child',
				}),
			),
		);
		let octaneTexture!: THREE.Texture;
		let octaneChild!: THREE.Group;
		const octane = await createOctaneThree(
			RenderTextureScene,
			{
				textureRef: (value: THREE.Texture) => (octaneTexture = value),
				childRef: (value: THREE.Group) => (octaneChild = value),
				width: 64,
				height: 32,
				samples: 4,
				frames: 2,
				stencilBuffer: true,
				depthBuffer: true,
				generateMipmaps: true,
			},
			{ width: 120, height: 80 },
		);
		(octane.renderer as any).xr = { enabled: true, isPresenting: true };
		await reactThreeAct(async () => reactAdvance(0.1, true, react.state));
		await reactThreeAct(async () => reactAdvance(0.1, true, react.state));
		await reactThreeAct(async () => reactAdvance(0.1, true, react.state));
		octane.advanceFrames(3, 0.1);
		expect(textureSnapshot(octaneTexture)).toEqual(textureSnapshot(reactTexture));
		expect(octaneChild.parent?.isScene).toBe(reactChild.parent?.isScene);
		expect((octane.renderer as any).renderCalls).toHaveLength(react.gl.renderCalls.length);
		expect((octane.renderer as any).xr).toEqual({ enabled: true, isPresenting: true });
		octaneTexture.name = 'negative';
		expect(textureSnapshot(octaneTexture)).not.toEqual(textureSnapshot(reactTexture));
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
	});

	it('matches RenderCubeTexture API, target flags, camera transform, portal, and frame budget', async () => {
		cubeUpdates.splice(0);
		let reactApi!: ReactCubeApi;
		let reactChild!: THREE.Group;
		const react = await reactRoot(
			React.createElement(
				ReactRenderCubeTexture,
				{
					ref: (value: ReactCubeApi) => (reactApi = value),
					resolution: 48,
					frames: 2,
					near: 0.25,
					far: 90,
					flip: true,
					position: [1, 2, 3],
					name: 'cube-texture',
				},
				React.createElement('group', {
					ref: (value: THREE.Group) => (reactChild = value),
					name: 'cube-portal-child',
				}),
			),
		);
		let octaneApi!: RenderCubeTextureApi;
		let octaneChild!: THREE.Group;
		const octane = await createOctaneThree(
			RenderCubeTextureScene,
			{
				apiRef: (value: RenderCubeTextureApi) => (octaneApi = value),
				childRef: (value: THREE.Group) => (octaneChild = value),
				resolution: 48,
				frames: 2,
				near: 0.25,
				far: 90,
				flip: true,
			},
			{ width: 120, height: 80 },
		);
		await reactThreeAct(async () => reactAdvance(0.1, true, react.state));
		await reactThreeAct(async () => reactAdvance(0.1, true, react.state));
		const reactUpdates = cubeUpdates.splice(0);
		octane.advanceFrames(2, 0.1);
		const octaneUpdates = cubeUpdates.splice(0);
		expect(octaneUpdates).toHaveLength(reactUpdates.length);
		expect({
			width: octaneApi.fbo.width,
			flip: octaneApi.fbo.texture.isRenderTargetTexture,
			flipY: octaneApi.fbo.texture.flipY,
			type: octaneApi.fbo.texture.type,
		}).toEqual({
			width: reactApi.fbo.width,
			flip: reactApi.fbo.texture.isRenderTargetTexture,
			flipY: reactApi.fbo.texture.flipY,
			type: reactApi.fbo.texture.type,
		});
		expect(octaneApi.camera.position.toArray()).toEqual(reactApi.camera.position.toArray());
		expect(
			octaneApi.camera.children.map((camera) => [
				(camera as THREE.PerspectiveCamera).near,
				(camera as THREE.PerspectiveCamera).far,
			]),
		).toEqual(
			reactApi.camera.children.map((camera) => [
				(camera as THREE.PerspectiveCamera).near,
				(camera as THREE.PerspectiveCamera).far,
			]),
		);
		expect(octaneChild.parent).toBe(octaneApi.scene);
		octaneApi.camera.position.x += 1;
		expect(octaneApi.camera.position.toArray()).not.toEqual(reactApi.camera.position.toArray());
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
	});
});
