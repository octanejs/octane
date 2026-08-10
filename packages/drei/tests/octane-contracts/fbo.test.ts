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
import { FboBlockScene, FboScene, UseFBOScene } from '../_fixtures/fbo.three.tsrx';

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

describe('framebuffer objects (Octane-only contracts)', () => {
	it('renders natural TSRX block children without invoking them as render props', async () => {
		const root = await createOctaneThree(FboBlockScene);
		expect(root.scene.getObjectByName('fbo-block-child')).toBeDefined();
		root.unmount();
	});
});
