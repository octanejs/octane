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
import { DepthBufferDefaultsScene, DepthBufferScene } from '../_fixtures/depth-buffer.three.tsrx';

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

describe('useDepthBuffer (Octane-only contracts)', () => {
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
});
