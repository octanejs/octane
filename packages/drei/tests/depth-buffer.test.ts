import * as React from 'react';
import {
	act as reactThreeAct,
	advance as reactAdvance,
	createRoot as createReactThreeRoot,
	useThree as reactUseThree,
	type RootState as ReactRootState,
} from '@react-three/fiber';
import { useDepthBuffer as reactUseDepthBuffer } from '@react-three/drei/core/useDepthBuffer.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DepthBufferDefaultsScene, DepthBufferScene } from './_fixtures/depth-buffer.three.tsrx';

type Recorder = THREE.WebGLRenderer & { renderCount: number };

function renderer(canvas: HTMLCanvasElement): Recorder {
	let target: THREE.WebGLRenderTarget | null = null;
	return {
		domElement: canvas,
		outputColorSpace: THREE.SRGBColorSpace,
		toneMapping: THREE.NoToneMapping,
		renderCount: 0,
		render() {
			this.renderCount++;
		},
		setRenderTarget(value: THREE.WebGLRenderTarget | null) {
			target = value;
		},
		getRenderTarget: () => target,
		setPixelRatio() {},
		setSize() {},
		renderLists: { dispose() {} },
		forceContextLoss() {},
		dispose() {},
	} as unknown as Recorder;
}

async function reactRoot(Component: React.ComponentType, width = 400, height = 200) {
	const canvas = document.createElement('canvas');
	const root = createReactThreeRoot(canvas);
	const gl = renderer(canvas);
	let get!: () => ReactRootState;
	function Capture() {
		get = reactUseThree((state) => state.get);
		return React.createElement(Component);
	}
	await root.configure({
		gl,
		frameloop: 'never',
		dpr: 1,
		size: { width, height, top: 0, left: 0 },
	});
	await reactThreeAct(async () => root.render(React.createElement(Capture)));
	return { root, gl, getState: () => get() };
}

function snapshot(texture: THREE.DepthTexture | null) {
	return texture
		? {
				width: texture.image.width,
				height: texture.image.height,
				format: texture.format,
				type: texture.type,
			}
		: null;
}

describe('useDepthBuffer', () => {
	it('restores defaults after the compiler-injected trailing slot', async () => {
		let texture: THREE.DepthTexture | null = null;
		const root = await createOctaneThree(
			DepthBufferDefaultsScene,
			{ onTexture: (value: THREE.DepthTexture | null) => (texture = value) },
			{ width: 320, height: 180 },
		);
		expect(snapshot(texture)).toMatchObject({ width: 256, height: 256 });
		root.unmount();
	});

	it.each([
		{ size: 128, expected: [128, 128] },
		{ size: 0, expected: [320, 180] },
	])(
		'matches texture configuration and frame limits for size=$size',
		async ({ size, expected }) => {
			let reactTexture: THREE.DepthTexture | null = null;
			function ReactHook() {
				reactTexture = reactUseDepthBuffer({ size, frames: 1 });
				return null;
			}
			const react = await reactRoot(ReactHook, 320, 180);
			let octaneTexture: THREE.DepthTexture | null = null;
			const octane = await createOctaneThree(
				DepthBufferScene,
				{
					size,
					frames: 1,
					onTexture: (value: THREE.DepthTexture | null) => (octaneTexture = value),
				},
				{ width: 320, height: 180 },
			);
			expect(snapshot(octaneTexture)).toEqual(snapshot(reactTexture));
			expect(snapshot(octaneTexture)).toMatchObject({ width: expected[0], height: expected[1] });
			const reactBefore = react.gl.renderCount;
			const octaneBefore = octane.renderer.frameCount;
			reactAdvance(1000, true, react.getState());
			octane.advanceFrames(1);
			reactAdvance(2000, true, react.getState());
			octane.advanceFrames(1);
			expect(octane.renderer.frameCount - octaneBefore).toBe(react.gl.renderCount - reactBefore);
			octane.unmount();
			await reactThreeAct(async () => react.root.unmount());
		},
	);
});
