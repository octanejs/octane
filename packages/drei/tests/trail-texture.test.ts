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
import { TrailTextureScene } from './_fixtures/trail-texture.three.tsrx';

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

describe('TrailTexture', () => {
	it('matches texture setup, touch interpolation, force smoothing, drawing, and frame aging', async () => {
		const props = {
			size: 64,
			maxAge: 500,
			radius: 0.25,
			intensity: 0.4,
			interpolate: 2,
			smoothing: 0.5,
			minForce: 0.2,
			blend: 'screen' as const,
		};
		let reactTuple!: [THREE.Texture, (event: { uv: { x: number; y: number } }) => void];
		let reactState!: ReactRootState;
		function ReactScene() {
			reactState = reactUseThree();
			return React.createElement(ReactTrailTexture, {
				...props,
				children: (value) => void (reactTuple = value as typeof reactTuple) || null,
			});
		}
		const canvas = document.createElement('canvas');
		const reactRoot = createReactThreeRoot(canvas);
		await reactRoot.configure({ gl: renderer(canvas), frameloop: 'never', dpr: 1 });
		await reactThreeAct(async () => reactRoot.render(React.createElement(ReactScene)));
		const reactContext = contexts.at(-1)!;
		reactTuple[1]({ uv: { x: 0.1, y: 0.2 } });
		reactTuple[1]({ uv: { x: 0.8, y: 0.7 } });
		reactAdvance(0.1, true, reactState);

		let octaneTuple!: typeof reactTuple;
		const octaneRoot = await createOctaneThree(TrailTextureScene, {
			...props,
			children: (value: typeof reactTuple) => void (octaneTuple = value) || null,
		});
		const octaneContext = contexts.at(-1)!;
		octaneTuple[1]({ uv: { x: 0.1, y: 0.2 } });
		octaneTuple[1]({ uv: { x: 0.8, y: 0.7 } });
		octaneRoot.advanceFrames(1, 0.1);

		expect(octaneTuple[0].image.width).toBe(reactTuple[0].image.width);
		expect(octaneTuple[0].image.height).toBe(reactTuple[0].image.height);
		expect(octaneTuple[0].image.id).toBe(reactTuple[0].image.id);
		expect(octaneTuple[0].version).toBe(reactTuple[0].version);
		expect(octaneContext.calls).toEqual(reactContext.calls);
		expect(octaneContext.calls.filter(([name]) => name === 'arc').length).toBeGreaterThan(2);

		octaneRoot.advanceFrames(1, 1);
		expect(octaneTuple[0].version).toBeGreaterThan(reactTuple[0].version);
		octaneRoot.unmount();
		await reactThreeAct(async () => reactRoot.unmount());
	});
});
