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
import { ProgressBlockScene, ProgressScene } from './_fixtures/progress.three.tsrx';

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

describe('Progress and useProgress', () => {
	it('renders natural TSRX block children without invoking them as render props', async () => {
		const root = await createOctaneThree(ProgressBlockScene);
		expect(root.scene.getObjectByName('progress-block-child')).toBeDefined();
		root.unmount();
	});

	it('matches the pinned React Drei loading-manager state and render-prop output', async () => {
		const ReactDrei = await import('@react-three/drei');
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

		octaneHandlers.onStart?.('/one', 0, 2);
		octaneHandlers.onProgress?.('/one', 1, 2);
		octaneHandlers.onError?.('/broken');
		octaneHandlers.onProgress?.('/two', 2, 2);
		octaneHandlers.onLoad?.();
		const finalState = octaneUseProgress.getState();
		expect(finalState).toEqual({
			errors: ['/broken'],
			active: false,
			progress: 100,
			item: '/two',
			loaded: 2,
			total: 2,
		});
		ReactDrei.useProgress.setState(finalState);
		await reactThreeAct(async () => {});
		await Promise.resolve();

		expect(octaneUseProgress.getState()).toEqual(ReactDrei.useProgress.getState());
		expect(octaneRenders.at(-1)).toEqual(reactRenders.at(-1));

		octaneRoot.unmount();
		await reactThreeAct(async () => reactRoot.unmount());
	});
});
