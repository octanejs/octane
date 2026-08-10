import * as React from 'react';
import {
	act as reactThreeAct,
	createRoot as createReactThreeRoot,
	useThree as reactUseThree,
	type RootState as ReactRootState,
} from '@react-three/fiber';
import { AdaptiveDpr as ReactAdaptiveDpr } from '@react-three/drei/core/AdaptiveDpr.js';
import { AdaptiveEvents as ReactAdaptiveEvents } from '@react-three/drei/core/AdaptiveEvents.js';
import { BakeShadows as ReactBakeShadows } from '@react-three/drei/core/BakeShadows.js';
import { useAspect as reactUseAspect } from '@react-three/drei/core/useAspect.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
	AdaptiveDprScene,
	AdaptiveEventsScene,
	AspectScene,
	BakeShadowsScene,
} from './_fixtures/adaptive-performance.three.tsrx';

function renderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
	return {
		domElement: canvas,
		outputColorSpace: THREE.SRGBColorSpace,
		toneMapping: THREE.NoToneMapping,
		shadowMap: { autoUpdate: true, needsUpdate: false, enabled: false, type: THREE.PCFShadowMap },
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
	const gl = renderer(canvas);
	let get!: () => ReactRootState;
	function StateCapture() {
		get = reactUseThree((value) => value.get);
		return React.createElement(Component);
	}
	await root.configure({
		gl,
		frameloop: 'never',
		dpr: 1,
		size: { width, height, top: 0, left: 0 },
	});
	await reactThreeAct(async () => root.render(React.createElement(StateCapture)));
	return { root, gl, canvas, getState: () => get() };
}

async function flush() {
	await reactThreeAct(async () => {
		for (let index = 0; index < 4; index++) await Promise.resolve();
	});
}

describe('adaptive performance helpers', () => {
	it('matches useAspect for the configured viewport', async () => {
		const reactValues: unknown[] = [];
		const octaneValues: unknown[] = [];
		function ReactAspect() {
			reactValues.push(reactUseAspect(16, 9, 1.5));
			return null;
		}
		const react = await reactRoot(ReactAspect);
		const octane = await createOctaneThree(
			AspectScene,
			{ width: 16, height: 9, factor: 1.5, onValue: (value: unknown) => octaneValues.push(value) },
			{ width: 400, height: 200 },
		);
		expect(octaneValues.at(-1)).toEqual(reactValues.at(-1));
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
	});

	it('matches AdaptiveEvents updates and restores the prior enabled state', async () => {
		const react = await reactRoot(ReactAdaptiveEvents);
		const octane = await createOctaneThree(AdaptiveEventsScene, {});
		const reactState = react.getState();
		reactState.set((state) => ({ performance: { ...state.performance, current: 0.5 } }));
		octane.store
			.getState()
			.set((state) => ({ performance: { ...state.performance, current: 0.5 } }));
		await flush();
		expect(octane.store.getState().events.enabled).toBe(react.getState().events.enabled);
		expect(octane.store.getState().events.enabled).toBe(false);
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
		expect(octane.store.getState().events.enabled).toBe(true);
		expect(react.getState().events.enabled).toBe(true);
	});

	it('matches BakeShadows mount and cleanup mutations', async () => {
		const react = await reactRoot(ReactBakeShadows);
		const octane = await createOctaneThree(BakeShadowsScene, {});
		await flush();
		expect(octane.renderer.shadowMap).toMatchObject({ autoUpdate: false, needsUpdate: true });
		expect(octane.renderer.shadowMap).toMatchObject({
			autoUpdate: react.gl.shadowMap.autoUpdate,
			needsUpdate: react.gl.shadowMap.needsUpdate,
		});
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
		expect(octane.renderer.shadowMap).toMatchObject({ autoUpdate: true, needsUpdate: true });
		expect(react.gl.shadowMap).toMatchObject({ autoUpdate: true, needsUpdate: true });
	});

	it('matches AdaptiveDpr ratio, pixelation, and cleanup', async () => {
		const react = await reactRoot(() => React.createElement(ReactAdaptiveDpr, { pixelated: true }));
		const octane = await createOctaneThree(
			AdaptiveDprScene,
			{ pixelated: true },
			{ width: 400, height: 200 },
		);
		react.getState().set((state) => ({ performance: { ...state.performance, current: 0.5 } }));
		octane.store
			.getState()
			.set((state) => ({ performance: { ...state.performance, current: 0.5 } }));
		await flush();
		expect(octane.store.getState().viewport.dpr).toBe(react.getState().viewport.dpr);
		expect((octane.canvas as HTMLCanvasElement).style.imageRendering).toBe(
			react.canvas.style.imageRendering,
		);
		expect((octane.canvas as HTMLCanvasElement).style.imageRendering).toBe('pixelated');
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
		expect((octane.canvas as HTMLCanvasElement).style.imageRendering).toBe('auto');
		expect(react.canvas.style.imageRendering).toBe('auto');
	});
});
