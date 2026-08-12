import * as React from 'react';
import {
	act as reactThreeAct,
	advance as reactAdvance,
	createRoot as createReactThreeRoot,
	useThree as reactUseThree,
	type RootState as ReactRootState,
} from '@react-three/fiber';
import {
	PerformanceMonitor as ReactPerformanceMonitor,
	usePerformanceMonitor as reactUsePerformanceMonitor,
} from '@react-three/drei/core/PerformanceMonitor.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { PerformanceMonitorApi } from '../../src/index.js';
import { PerformanceMonitorScene } from '../_fixtures/performance-monitor.three.tsrx';

beforeAll(() => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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

function callbacks() {
	return {
		onIncline: vi.fn(),
		onDecline: vi.fn(),
		onChange: vi.fn(),
		onFallback: vi.fn(),
		onSubscriberIncline: vi.fn(),
		onSubscriberDecline: vi.fn(),
		onSubscriberChange: vi.fn(),
		onSubscriberFallback: vi.fn(),
	};
}

function apiSnapshot(api: PerformanceMonitorApi) {
	return {
		fps: api.fps,
		factor: api.factor,
		refreshrate: api.refreshrate,
		index: api.index,
		flipped: api.flipped,
		fallback: api.fallback,
		frames: [...api.frames],
		averages: [...api.averages],
		subscriptions: api.subscriptions.size,
	};
}

describe('PerformanceMonitor (Octane-only contracts)', () => {
	it('stops sampling after fallback', async () => {
		const events = callbacks();
		const root = await createOctaneThree(PerformanceMonitorScene, {
			iterations: 1,
			ms: 10,
			threshold: 0,
			step: 0.1,
			factor: 0.5,
			flipflops: 0,
			bounds: () => [30, 60],
			...events,
		});
		const now = vi
			.spyOn(performance, 'now')
			.mockReturnValueOnce(0)
			.mockReturnValueOnce(10)
			.mockReturnValue(20);
		root.advanceFrames(2);
		expect(events.onFallback).toHaveBeenCalledOnce();
		const calls = now.mock.calls.length;
		root.advanceFrames(5);
		expect(now).toHaveBeenCalledTimes(calls);
		root.unmount();
	});
});
