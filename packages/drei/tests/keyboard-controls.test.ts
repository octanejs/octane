import * as React from 'react';
import { act as reactThreeAct, createRoot as createReactThreeRoot } from '@react-three/fiber';
import {
	KeyboardControls as ReactKeyboardControls,
	useKeyboardControls as reactUseKeyboardControls,
} from '@react-three/drei/web/KeyboardControls.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { KeyboardControlsScene } from './_fixtures/keyboard-controls.three.tsrx';

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

type Capture = {
	jump: boolean;
	sprint: boolean;
	subscribe: Function;
	getState: () => Record<string, boolean>;
};

async function reactKeyboard(
	map: Array<{ name: string; keys: string[]; up?: boolean }>,
	domElement: HTMLElement,
	onChange: (...args: any[]) => void,
	onCapture: (capture: Capture) => void,
) {
	const canvas = document.createElement('canvas');
	const root = createReactThreeRoot(canvas);
	function CaptureComponent() {
		const jump = reactUseKeyboardControls((state) => state.jump);
		const sprint = reactUseKeyboardControls((state) => state.sprint);
		const [subscribe, getState] = reactUseKeyboardControls();
		onCapture({ jump, sprint, subscribe, getState });
		return null;
	}
	await root.configure({ gl: renderer(canvas), frameloop: 'never' });
	await reactThreeAct(async () =>
		root.render(
			React.createElement(
				ReactKeyboardControls,
				{ map, domElement, onChange },
				React.createElement(CaptureComponent),
			),
		),
	);
	return root;
}

async function flush() {
	await reactThreeAct(async () => {
		await Promise.resolve();
	});
	await Promise.resolve();
}

describe('KeyboardControls', () => {
	it('matches key/code mapping, selector updates, store API, callbacks, repeat policy, and cleanup', async () => {
		const map = [
			{ name: 'jump', keys: [' ', 'Space'] },
			{ name: 'sprint', keys: ['ShiftLeft'], up: false },
		];
		const reactElement = document.createElement('div');
		const octaneElement = document.createElement('div');
		const reactChanges: unknown[] = [];
		const octaneChanges: unknown[] = [];
		const reactCaptures: Capture[] = [];
		const octaneCaptures: Capture[] = [];
		const react = await reactKeyboard(
			map,
			reactElement,
			(name, pressed, state) => reactChanges.push([name, pressed, { ...state }]),
			(capture) => reactCaptures.push(capture),
		);
		const octane = await createOctaneThree(KeyboardControlsScene, {
			map,
			domElement: octaneElement,
			onChange: (name: string, pressed: boolean, state: object) =>
				octaneChanges.push([name, pressed, { ...state }]),
			onCapture: (capture: Capture) => octaneCaptures.push(capture),
		});
		const dispatch = (element: HTMLElement, type: string, key: string, code: string) =>
			element.dispatchEvent(new KeyboardEvent(type, { key, code }));

		dispatch(reactElement, 'keydown', ' ', 'Space');
		dispatch(octaneElement, 'keydown', ' ', 'Space');
		await flush();
		expect(octaneCaptures.at(-1)!.jump).toBe(reactCaptures.at(-1)!.jump);
		expect(octaneCaptures.at(-1)!.getState()).toEqual(reactCaptures.at(-1)!.getState());
		dispatch(reactElement, 'keyup', ' ', 'Space');
		dispatch(octaneElement, 'keyup', ' ', 'Space');
		dispatch(reactElement, 'keydown', 'Shift', 'ShiftLeft');
		dispatch(octaneElement, 'keydown', 'Shift', 'ShiftLeft');
		dispatch(reactElement, 'keydown', 'Shift', 'ShiftLeft');
		dispatch(octaneElement, 'keydown', 'Shift', 'ShiftLeft');
		dispatch(reactElement, 'keyup', 'Shift', 'ShiftLeft');
		dispatch(octaneElement, 'keyup', 'Shift', 'ShiftLeft');
		await flush();
		expect(octaneChanges).toEqual(reactChanges);
		expect(octaneCaptures.at(-1)!.getState()).toEqual(reactCaptures.at(-1)!.getState());
		expect(octaneCaptures.at(-1)!.sprint).toBe(true);

		const beforeCleanup = octaneChanges.length;
		octane.unmount();
		await reactThreeAct(async () => react.unmount());
		dispatch(reactElement, 'keydown', ' ', 'Space');
		dispatch(octaneElement, 'keydown', ' ', 'Space');
		expect(octaneChanges).toHaveLength(beforeCleanup);
		expect(reactChanges).toHaveLength(beforeCleanup);
	});
});
