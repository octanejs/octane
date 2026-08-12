import * as React from 'react';
import {
	act as reactThreeAct,
	advance as reactAdvance,
	createRoot as createReactThreeRoot,
	useThree as reactUseThree,
	type RootState as ReactRootState,
} from '@react-three/fiber';
import { TrailTexture as ReactTrailTexture } from '@react-three/drei/core/TrailTexture.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { TrailTextureScene } from '../_fixtures/trail-texture.three.tsrx';

type Call = [string, ...unknown[]];
const contexts: Array<{ calls: Call[]; context: CanvasRenderingContext2D }> = [];

beforeEach(() => {
	contexts.length = 0;
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (type: string) {
		if (type !== '2d') return null;
		const calls: Call[] = [];
		const gradient = {
			addColorStop: (offset: number, color: string) => calls.push(['color', offset, color]),
		};
		const context = {
			fillStyle: '',
			globalCompositeOperation: 'source-over',
			fillRect: (...args: unknown[]) => calls.push(['fillRect', ...args]),
			createRadialGradient: (...args: unknown[]) => (calls.push(['gradient', ...args]), gradient),
			beginPath: () => calls.push(['beginPath']),
			arc: (...args: unknown[]) => calls.push(['arc', ...args]),
			fill: () => calls.push(['fill']),
		} as unknown as CanvasRenderingContext2D;
		contexts.push({ calls, context });
		return context;
	} as any);
});

afterEach(() => vi.restoreAllMocks());

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

describe('TrailTexture (Octane-only contracts)', () => {
	it('uses the upstream canvas defaults when no config is supplied', async () => {
		let tuple!: [THREE.Texture, (event: any) => void];
		const root = await createOctaneThree(TrailTextureScene, {
			size: undefined,
			maxAge: undefined,
			radius: undefined,
			intensity: undefined,
			interpolate: undefined,
			smoothing: undefined,
			minForce: undefined,
			blend: undefined,
			children: (value: typeof tuple) => void (tuple = value) || null,
		});
		expect(tuple[0].image.width).toBe(256);
		expect(tuple[0].image.height).toBe(256);
		root.unmount();
	});
});
