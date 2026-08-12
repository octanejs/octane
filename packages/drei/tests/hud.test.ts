import * as React from 'react';
import {
	act as reactThreeAct,
	advance as reactAdvance,
	createRoot as createReactThreeRoot,
	extend as extendReactThree,
	useThree as reactUseThree,
	type RootState as ReactRootState,
} from '@react-three/fiber';
import { Hud as ReactHud } from '@react-three/drei/core/Hud.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { HudScene } from './_fixtures/hud.three.tsrx';

beforeAll(() => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	extendReactThree(THREE as unknown as Record<string, new (...args: any[]) => any>);
});

function reactRenderer(canvas: HTMLCanvasElement) {
	const renderCalls: Array<readonly [THREE.Scene, THREE.Camera]> = [];
	let clearDepthCalls = 0;
	const renderer = {
		domElement: canvas,
		outputColorSpace: THREE.SRGBColorSpace,
		toneMapping: THREE.NoToneMapping,
		autoClear: true,
		render(scene: THREE.Scene, camera: THREE.Camera) {
			renderCalls.push([scene, camera]);
		},
		clearDepth() {
			clearDepthCalls++;
		},
		setPixelRatio() {},
		setSize() {},
		renderLists: { dispose() {} },
		forceContextLoss() {},
		dispose() {},
	} as unknown as THREE.WebGLRenderer;
	return {
		renderer,
		renderCalls,
		get clearDepthCalls() {
			return clearDepthCalls;
		},
	};
}

function renderSnapshot(calls: readonly (readonly [THREE.Scene, THREE.Camera])[]) {
	return calls.map(([scene]) => ({
		main: scene.getObjectByName('main-scene') !== undefined,
		hud: scene.getObjectByName('hud-content') !== undefined,
	}));
}

async function reactHud(renderPriority: number) {
	const canvas = document.createElement('canvas');
	const recorder = reactRenderer(canvas);
	const root = createReactThreeRoot(canvas);
	let getState!: () => ReactRootState;
	function Capture() {
		getState = reactUseThree((state) => state.get);
		return null;
	}
	await root.configure({ gl: recorder.renderer, frameloop: 'never' });
	await reactThreeAct(async () =>
		root.render(
			React.createElement(
				React.Fragment,
				null,
				React.createElement('group', { name: 'main-scene' }),
				React.createElement(
					ReactHud,
					{ renderPriority },
					React.createElement('mesh', { name: 'hud-content' }),
				),
				React.createElement(Capture),
			),
		),
	);
	return { root, getState, recorder };
}

describe('Hud', () => {
	it.each([1, 2])(
		'matches portal isolation and render ordering at priority %s',
		async (priority) => {
			const react = await reactHud(priority);
			const octane = await createOctaneThree(HudScene, { renderPriority: priority });
			expect(octane.scene.getObjectByName('hud-content')).toBeUndefined();
			expect(react.getState().scene.getObjectByName('hud-content')).toBeUndefined();

			await reactThreeAct(async () => reactAdvance(1, true, react.getState()));
			octane.advanceFrames(1, 1);
			expect(renderSnapshot(octane.renderer.renderCalls)).toEqual(
				renderSnapshot(react.recorder.renderCalls),
			);
			expect(renderSnapshot(octane.renderer.renderCalls).some((call) => call.hud)).toBe(true);
			expect(octane.renderer.autoClear).toBe(react.recorder.renderer.autoClear);

			octane.unmount();
			await reactThreeAct(async () => react.root.unmount());
		},
	);
});
