import { createRequire } from 'node:module';
import * as React from 'react';
import {
	act as reactThreeAct,
	createRoot as createReactThreeRoot,
	extend as extendReactThree,
} from '@react-three/fiber';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { DefaultLoadingManager, NoToneMapping, SRGBColorSpace, type WebGLRenderer } from 'three';
import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { useProgress as octaneUseProgress } from '../src/index.js';
import { ProgressScene } from './_fixtures/progress.three.tsrx';

const require = createRequire(import.meta.url);
const previousActEnvironment = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
	.IS_REACT_ACT_ENVIRONMENT;
const octaneHandlers = {
	onStart: DefaultLoadingManager.onStart,
	onProgress: DefaultLoadingManager.onProgress,
	onError: DefaultLoadingManager.onError,
	onLoad: DefaultLoadingManager.onLoad,
};

beforeAll(() => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	extendReactThree(THREE as unknown as Record<string, new (...args: any[]) => any>);
});

afterAll(() => {
	if (previousActEnvironment === undefined)
		delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
	else
		(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
			previousActEnvironment;
});

function renderer(canvas: HTMLCanvasElement): WebGLRenderer {
	return {
		domElement: canvas,
		outputColorSpace: SRGBColorSpace,
		toneMapping: NoToneMapping,
		render() {},
		setPixelRatio() {},
		setSize() {},
		renderLists: { dispose() {} },
		forceContextLoss() {},
	} as unknown as WebGLRenderer;
}

function driveLoadingSequence(handlers: {
	onStart?: typeof DefaultLoadingManager.onStart;
	onProgress?: typeof DefaultLoadingManager.onProgress;
	onError?: typeof DefaultLoadingManager.onError;
	onLoad?: typeof DefaultLoadingManager.onLoad;
}) {
	handlers.onStart?.('/one', 0, 2);
	handlers.onProgress?.('/one', 1, 2);
	handlers.onError?.('/broken');
	handlers.onProgress?.('/two', 2, 2);
	handlers.onLoad?.();
}

describe('Progress and useProgress', () => {
	it('matches the pinned React Drei loading-manager state and render-prop output', async () => {
		const ReactDrei = await import('@react-three/drei');
		const reactThreePath = require.resolve('three', {
			paths: [require.resolve('@react-three/drei')],
		});
		const { DefaultLoadingManager: ReactDefaultLoadingManager } = await import(reactThreePath);
		const reactHandlers = {
			onStart: ReactDefaultLoadingManager.onStart,
			onProgress: ReactDefaultLoadingManager.onProgress,
			onError: ReactDefaultLoadingManager.onError,
			onLoad: ReactDefaultLoadingManager.onLoad,
		};
		expect(reactHandlers.onError).not.toBe(octaneHandlers.onError);

		ReactDrei.useProgress.setState({
			errors: [],
			active: false,
			progress: 0,
			item: '',
			loaded: 0,
			total: 0,
		});
		octaneUseProgress.setState({
			errors: [],
			active: false,
			progress: 0,
			item: '',
			loaded: 0,
			total: 0,
		});

		const canvas = document.createElement('canvas');
		const reactRenders: unknown[] = [];
		const octaneRenders: unknown[] = [];
		const reactRoot = createReactThreeRoot(canvas);
		await reactRoot.configure({
			gl: renderer(canvas),
			frameloop: 'never',
			dpr: 1,
			size: { width: 64, height: 64, top: 0, left: 0 },
		});
		await reactThreeAct(async () =>
			reactRoot.render(
				React.createElement(ReactDrei.Progress, null, (state) => {
					reactRenders.push({ ...state, errors: [...state.errors] });
					return null;
				}),
			),
		);
		const octaneRoot = await createOctaneThree(ProgressScene, {
			children: (state: ReturnType<typeof octaneUseProgress.getState>) => {
				octaneRenders.push({ ...state, errors: [...state.errors] });
				return null;
			},
		});

		driveLoadingSequence(reactHandlers);
		await reactThreeAct(async () => {});
		await Promise.resolve();
		const reactFinal = {
			...ReactDrei.useProgress.getState(),
			errors: [...ReactDrei.useProgress.getState().errors],
		};

		driveLoadingSequence(octaneHandlers);
		await Promise.resolve();
		const octaneFinal = {
			...octaneUseProgress.getState(),
			errors: [...octaneUseProgress.getState().errors],
		};

		expect(octaneFinal).toEqual({
			errors: ['/broken'],
			active: false,
			progress: 100,
			item: '/two',
			loaded: 2,
			total: 2,
		});
		expect(octaneFinal).toEqual(reactFinal);
		expect(octaneRenders.at(-1)).toEqual(reactRenders.at(-1));

		octaneRoot.unmount();
		await reactThreeAct(async () => reactRoot.unmount());
	});
});
