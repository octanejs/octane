import * as React from 'react';
import { act as reactThreeAct, createRoot as createReactThreeRoot } from '@react-three/fiber';
import { DetectGPU as ReactDetectGPU } from '@react-three/drei/core/DetectGPU.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { TierResult } from 'detect-gpu';
import { DetectGPUScene } from './_fixtures/detect-gpu.three.tsrx';

const mocks = vi.hoisted(() => ({ getGPUTier: vi.fn() }));
vi.mock('detect-gpu', async (importOriginal) => ({
	...(await importOriginal<typeof import('detect-gpu')>()),
	getGPUTier: mocks.getGPUTier,
}));

beforeAll(() => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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

async function flush(): Promise<void> {
	await reactThreeAct(async () => {
		for (let index = 0; index < 8; index++) await Promise.resolve();
	});
}

describe('DetectGPU', () => {
	it('matches the pinned React Drei suspension, result, render callback, and global cache key', async () => {
		const result: TierResult = {
			tier: 2,
			type: 'BENCHMARK',
			isMobile: false,
			fps: 58,
			gpu: 'Parity GPU',
		};
		mocks.getGPUTier.mockResolvedValue(result);
		const options = { failIfMajorPerformanceCaveat: true, desktopTiers: [0, 20, 40, 60] };
		const reactResults: TierResult[] = [];
		const canvas = document.createElement('canvas');
		const reactRoot = createReactThreeRoot(canvas);
		await reactRoot.configure({ gl: renderer(canvas), frameloop: 'never', dpr: 1 });
		await reactThreeAct(async () =>
			reactRoot.render(
				React.createElement(
					React.Suspense,
					{ fallback: null },
					React.createElement(ReactDetectGPU, {
						...options,
						children: (value) => void reactResults.push(value) || null,
					}),
				),
			),
		);
		await flush();

		const octaneResults: TierResult[] = [];
		const octaneRoot = await createOctaneThree(DetectGPUScene, {
			options,
			onResult: (value: TierResult) => void octaneResults.push(value) || null,
		});
		await flush();
		expect(octaneResults.at(-1)).toEqual(reactResults.at(-1));
		expect(octaneResults.at(-1)).toBe(result);
		expect(mocks.getGPUTier).toHaveBeenCalledTimes(2);
		expect(mocks.getGPUTier.mock.calls[0][0]).toEqual(options);
		expect(mocks.getGPUTier.mock.calls[1][0]).toEqual(options);

		octaneRoot.update(DetectGPUScene, {
			options: { failIfMajorPerformanceCaveat: false },
			onResult: (value: TierResult) => void octaneResults.push(value) || null,
		});
		await flush();
		expect(mocks.getGPUTier).toHaveBeenCalledTimes(2);
		expect(octaneResults.at(-1)).toBe(result);

		octaneRoot.unmount();
		await reactThreeAct(async () => reactRoot.unmount());
	});
});
