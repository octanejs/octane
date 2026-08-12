import * as React from 'react';
import {
	act as reactThreeAct,
	createRoot as createReactThreeRoot,
	useThree as reactUseThree,
	type RootState as ReactRootState,
} from '@react-three/fiber';
import { PointerLockControls as ReactPointerLockControls } from '@react-three/drei/core/PointerLockControls.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PointerLockControls as PointerLockControlsImpl } from 'three-stdlib';
import { PointerLockScene } from './_fixtures/pointer-lock.three.tsrx';

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

async function reactRoot(element: React.ReactNode) {
	const canvas = document.createElement('canvas');
	const root = createReactThreeRoot(canvas);
	let get!: () => ReactRootState;
	function Capture() {
		get = reactUseThree((state) => state.get);
		return element;
	}
	await root.configure({
		gl: renderer(canvas),
		frameloop: 'never',
		dpr: 1,
		size: { width: 400, height: 200, top: 0, left: 0 },
	});
	await reactThreeAct(async () => root.render(React.createElement(Capture)));
	return { root, getState: () => get() };
}

describe('PointerLockControls', () => {
	it('matches connection, centered events, selector locking, callbacks, defaults, and cleanup', async () => {
		const button = document.createElement('button');
		button.className = 'enter-game';
		document.body.append(button);
		let reactControl: PointerLockControlsImpl | null = null;
		let reactChanges = 0;
		let reactLocks = 0;
		let reactUnlocks = 0;
		const react = await reactRoot(
			React.createElement(ReactPointerLockControls, {
				ref: (value: PointerLockControlsImpl | null) => (reactControl = value),
				selector: '.enter-game',
				makeDefault: true,
				onChange: () => reactChanges++,
				onLock: () => reactLocks++,
				onUnlock: () => reactUnlocks++,
			}),
		);
		let octaneControl: PointerLockControlsImpl | null = null;
		let octaneChanges = 0;
		let octaneLocks = 0;
		let octaneUnlocks = 0;
		const octane = await createOctaneThree(
			PointerLockScene,
			{
				controlRef: (value: PointerLockControlsImpl | null) => (octaneControl = value),
				selector: '.enter-game',
				enabled: true,
				makeDefault: true,
				onChange: () => octaneChanges++,
				onLock: () => octaneLocks++,
				onUnlock: () => octaneUnlocks++,
			},
			{ width: 400, height: 200 },
		);
		expect(Boolean(octaneControl!.domElement)).toBe(Boolean(reactControl!.domElement));
		expect(octane.store.getState().controls).toBe(octaneControl);
		expect(react.getState().controls).toBe(reactControl);
		react.getState().pointer.set(0.7, -0.4);
		octane.store.getState().pointer.set(0.7, -0.4);
		react.getState().events.compute?.({} as any, react.getState());
		octane.store.getState().events.compute?.({} as any, octane.store.getState());
		expect(octane.store.getState().pointer.toArray()).toEqual(react.getState().pointer.toArray());
		expect(octane.store.getState().pointer.toArray()).toEqual([0, 0]);
		let reactLockCalls = 0;
		let octaneLockCalls = 0;
		reactControl!.lock = () => void reactLockCalls++;
		octaneControl!.lock = () => void octaneLockCalls++;
		button.click();
		expect(octaneLockCalls).toBe(reactLockCalls);
		expect(octaneLockCalls).toBe(1);
		octaneControl!.dispatchEvent({ type: 'change' });
		octaneControl!.dispatchEvent({ type: 'lock' });
		octaneControl!.dispatchEvent({ type: 'unlock' });
		await reactThreeAct(async () => {
			reactControl!.dispatchEvent({ type: 'change' });
			reactControl!.dispatchEvent({ type: 'lock' });
			reactControl!.dispatchEvent({ type: 'unlock' });
		});
		expect([octaneChanges, octaneLocks, octaneUnlocks]).toEqual([
			reactChanges,
			reactLocks,
			reactUnlocks,
		]);
		const mountedReact = reactControl;
		const mountedOctane = octaneControl;
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
		button.click();
		expect(octaneLockCalls).toBe(1);
		expect(reactLockCalls).toBe(1);
		mountedOctane!.dispatchEvent({ type: 'change' });
		mountedReact!.dispatchEvent({ type: 'change' });
		expect(octaneChanges).toBe(reactChanges);
		button.remove();
	});

	it('matches disabled mode without replacing event computation', async () => {
		const react = await reactRoot(
			React.createElement(ReactPointerLockControls, { enabled: false }),
		);
		const reactCompute = react.getState().events.compute;
		const octane = await createOctaneThree(PointerLockScene, {
			controlRef: () => undefined,
			selector: undefined,
			enabled: false,
			makeDefault: false,
			onChange: undefined,
			onLock: undefined,
			onUnlock: undefined,
		});
		expect(Boolean(octane.store.getState().events.compute)).toBe(Boolean(reactCompute));
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
	});
});
