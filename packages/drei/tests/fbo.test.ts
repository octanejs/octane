import * as React from 'react';
import {
	act as reactThreeAct,
	createRoot as createReactThreeRoot,
	useThree as reactUseThree,
	type RootState as ReactRootState,
} from '@react-three/fiber';
import { Fbo as ReactFbo, useFBO as reactUseFBO } from '@react-three/drei/core/Fbo.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FboBlockScene, FboScene, UseFBOScene } from './_fixtures/fbo.three.tsrx';

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

async function reactRoot(Component: React.ComponentType, width = 400, height = 200) {
	const canvas = document.createElement('canvas');
	const root = createReactThreeRoot(canvas);
	let get!: () => ReactRootState;
	function Capture() {
		get = reactUseThree((state) => state.get);
		return React.createElement(Component);
	}
	await root.configure({
		gl: renderer(canvas),
		frameloop: 'never',
		dpr: 1,
		size: { width, height, top: 0, left: 0 },
	});
	await reactThreeAct(async () => root.render(React.createElement(Capture)));
	return { root, getState: () => get() };
}

function snapshot(target: THREE.WebGLRenderTarget) {
	return {
		width: target.width,
		height: target.height,
		samples: target.samples,
		minFilter: target.texture.minFilter,
		magFilter: target.texture.magFilter,
		type: target.texture.type,
		depthBuffer: target.depthBuffer,
		depthTexture: target.depthTexture
			? {
					width: target.depthTexture.image.width,
					height: target.depthTexture.image.height,
					type: target.depthTexture.type,
				}
			: null,
	};
}

describe('framebuffer objects', () => {
	it('renders natural TSRX block children without invoking them as render props', async () => {
		const root = await createOctaneThree(FboBlockScene);
		expect(root.scene.getObjectByName('fbo-block-child')).toBeDefined();
		root.unmount();
	});

	it('matches explicit dimensions, defaults, multisampling, and depth aliases', async () => {
		let reactTarget!: THREE.WebGLRenderTarget;
		function ReactHook() {
			reactTarget = reactUseFBO(128, 64, { samples: 4, depth: true });
			return null;
		}
		const react = await reactRoot(ReactHook);
		let octaneTarget!: THREE.WebGLRenderTarget;
		const octane = await createOctaneThree(UseFBOScene, {
			width: 128,
			height: 64,
			settings: { samples: 4, depth: true },
			onTarget: (value: THREE.WebGLRenderTarget) => (octaneTarget = value),
		});
		expect(snapshot(octaneTarget)).toEqual(snapshot(reactTarget));
		let reactDisposed = false;
		let octaneDisposed = false;
		reactTarget.addEventListener('dispose', () => (reactDisposed = true));
		octaneTarget.addEventListener('dispose', () => (octaneDisposed = true));
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
		expect(octaneDisposed).toBe(reactDisposed);
		expect(octaneDisposed).toBe(true);
	});

	it('matches viewport-sized targets and resize behavior', async () => {
		let reactTarget!: THREE.WebGLRenderTarget;
		function ReactHook() {
			reactTarget = reactUseFBO({ depthBuffer: true, samples: 2 });
			return null;
		}
		const react = await reactRoot(ReactHook, 320, 180);
		let octaneTarget!: THREE.WebGLRenderTarget;
		const octane = await createOctaneThree(
			UseFBOScene,
			{
				width: { depthBuffer: true, samples: 2 },
				height: undefined,
				settings: undefined,
				onTarget: (value: THREE.WebGLRenderTarget) => (octaneTarget = value),
			},
			{ width: 320, height: 180 },
		);
		expect(snapshot(octaneTarget)).toEqual(snapshot(reactTarget));
		await reactThreeAct(async () => react.getState().setSize(640, 360));
		octane.store.getState().setSize(640, 360);
		for (let index = 0; index < 4; index++) await Promise.resolve();
		expect(snapshot(octaneTarget)).toEqual(snapshot(reactTarget));
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
	});

	it('matches Fbo child render callback and exposed ref identity', async () => {
		let reactRef: THREE.WebGLRenderTarget | null = null;
		let reactChild: THREE.WebGLRenderTarget | null = null;
		const react = await reactRoot(() =>
			React.createElement(
				ReactFbo,
				{
					width: 80,
					height: 40,
					ref: (value: THREE.WebGLRenderTarget | null) => (reactRef = value),
				},
				(value) => {
					reactChild = value;
					return null;
				},
			),
		);
		let octaneRef: THREE.WebGLRenderTarget | null = null;
		let octaneChild: THREE.WebGLRenderTarget | null = null;
		const octane = await createOctaneThree(FboScene, {
			width: 80,
			height: 40,
			settings: {},
			targetRef: (value: THREE.WebGLRenderTarget | null) => (octaneRef = value),
			onChildTarget: (value: THREE.WebGLRenderTarget) => (octaneChild = value),
		});
		expect(octaneRef).toBe(octaneChild);
		expect(reactRef).toBe(reactChild);
		expect(snapshot(octaneRef!)).toEqual(snapshot(reactRef!));
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
		expect(octaneRef).toBeNull();
		expect(reactRef).toBeNull();
	});
});
