import * as React from 'react';
import { act as reactAct } from 'react';
import { createRoot as createReactRoot } from 'react-dom/client';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { act as octaneAct } from 'octane';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

const mocks = vi.hoisted(() => ({
	forVisionTasks: vi.fn(async (basePath: string) => ({ basePath })),
	createFromOptions: vi.fn(async (vision: { basePath: string }, options: unknown) => ({
		vision,
		options,
		close: vi.fn(),
	})),
}));

vi.mock('@mediapipe/tasks-vision', () => ({
	FilesetResolver: { forVisionTasks: mocks.forVisionTasks },
	FaceLandmarker: { createFromOptions: mocks.createFromOptions },
}));

import {
	FaceLandmarker as ReactFaceLandmarker,
	useFaceLandmarker as reactUseFaceLandmarker,
} from '@react-three/drei/web/FaceLandmarker.js';
import { FaceLandmarkerScene } from './_fixtures/face-landmarker.three.tsrx';

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

describe('FaceLandmarker', () => {
	it('matches React loading, context/ref exposure, options, and cleanup', async () => {
		const basePath = '/vision-wasm';
		const options = {
			baseOptions: { modelAssetPath: '/face.task', delegate: 'CPU' },
			runningMode: 'VIDEO',
			outputFaceBlendshapes: false,
		} as any;
		let reactContext: any;
		let reactRef: any;
		function ReactReader() {
			reactContext = reactUseFaceLandmarker();
			return null;
		}
		const reactContainer = document.createElement('div');
		const reactRoot = createReactRoot(reactContainer);
		await reactAct(async () =>
			reactRoot.render(
				React.createElement(
					React.Suspense,
					{ fallback: null },
					React.createElement(
						ReactFaceLandmarker,
						{ ref: (value: any) => (reactRef = value), basePath, options },
						React.createElement(ReactReader),
					),
				),
			),
		);
		for (let index = 0; index < 8; index++) await Promise.resolve();

		let octaneContext: any;
		let octaneRef: any;
		const octaneRoot = await createOctaneThree(FaceLandmarkerScene, {
			basePath,
			options,
			landmarkerRef: (value: any) => (octaneRef = value),
			onContext: (value: any) => (octaneContext = value),
		});
		await octaneAct(async () => {
			for (let index = 0; index < 4; index++)
				await new Promise((resolve) => setTimeout(resolve, 0));
		});

		expect(octaneContext).toBe(octaneRef);
		expect(reactContext).toBe(reactRef);
		expect({ vision: octaneRef.vision, options: octaneRef.options }).toEqual({
			vision: reactRef.vision,
			options: reactRef.options,
		});
		octaneRef.options.runningMode = 'IMAGE';
		expect(octaneRef.options).not.toEqual(reactRef.options);
		const octaneInstance = octaneRef;
		const reactInstance = reactRef;
		octaneRoot.unmount();
		await reactAct(async () => reactRoot.unmount());
		expect(octaneInstance.close).toHaveBeenCalledOnce();
		expect(reactInstance.close).toHaveBeenCalledOnce();
	});
});
