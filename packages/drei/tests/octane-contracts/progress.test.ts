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
import { useProgress as octaneUseProgress } from '../../src/index.js';
import { ProgressBlockScene, ProgressScene } from '../_fixtures/progress.three.tsrx';

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

describe('Progress and useProgress (Octane-only contracts)', () => {
	it('renders natural TSRX block children without invoking them as render props', async () => {
		const root = await createOctaneThree(ProgressBlockScene);
		expect(root.scene.getObjectByName('progress-block-child')).toBeDefined();
		root.unmount();
	});
});
