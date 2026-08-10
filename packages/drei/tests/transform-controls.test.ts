import * as React from 'react';
import {
	act as reactThreeAct,
	createRoot as createReactThreeRoot,
	extend as extendReactThree,
	useThree as reactUseThree,
	type RootState as ReactRootState,
} from '@react-three/fiber';
import { TransformControls as ReactTransformControls } from '@react-three/drei/core/TransformControls.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { TransformControls as TransformControlsImpl } from 'three-stdlib';
import { TransformControlsScene } from './_fixtures/transform-controls.three.tsrx';

beforeAll(() => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	extendReactThree(THREE as unknown as Record<string, new (...args: any[]) => any>);
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

function snapshot(controls: TransformControlsImpl) {
	return {
		enabled: controls.enabled,
		axis: controls.axis,
		mode: controls.mode,
		translationSnap: controls.translationSnap,
		rotationSnap: controls.rotationSnap,
		scaleSnap: controls.scaleSnap,
		space: controls.space,
		size: controls.size,
		showX: controls.showX,
		showY: controls.showY,
		showZ: controls.showZ,
		objectName: controls.object?.name,
	};
}

describe('TransformControls', () => {
	it('matches the pinned React Drei props, child-group attachment, default takeover, events, and cleanup', async () => {
		const reactEvents = { change: vi.fn(), down: vi.fn(), up: vi.fn(), object: vi.fn() };
		const octaneEvents = { change: vi.fn(), down: vi.fn(), up: vi.fn(), object: vi.fn() };
		const props = {
			makeDefault: true,
			enabled: false,
			axis: 'X',
			mode: 'rotate' as const,
			translationSnap: 2,
			rotationSnap: 0.5,
			scaleSnap: 0.25,
			space: 'local' as const,
			size: 1.5,
			showX: false,
			showY: true,
			showZ: false,
		};
		let reactControls!: TransformControlsImpl;
		let reactState!: ReactRootState;
		const canvas = document.createElement('canvas');
		const reactRoot = createReactThreeRoot(canvas);
		await reactRoot.configure({ gl: renderer(canvas), frameloop: 'never', dpr: 1 });
		function ReactScene() {
			reactState = reactUseThree();
			return React.createElement(
				ReactTransformControls,
				{
					...props,
					ref: (value) => (reactControls = value!),
					onChange: reactEvents.change,
					onMouseDown: reactEvents.down,
					onMouseUp: reactEvents.up,
					onObjectChange: reactEvents.object,
					name: 'controlled-group',
				},
				React.createElement('mesh', { name: 'controlled-child' }),
			);
		}
		await reactThreeAct(async () => reactRoot.render(React.createElement(ReactScene)));

		let octaneControls!: TransformControlsImpl;
		const octaneRoot = await createOctaneThree(TransformControlsScene, {
			...props,
			object: undefined,
			ref: (value: TransformControlsImpl) => (octaneControls = value),
			onChange: octaneEvents.change,
			onMouseDown: octaneEvents.down,
			onMouseUp: octaneEvents.up,
			onObjectChange: octaneEvents.object,
		});

		expect(snapshot(octaneControls)).toEqual(snapshot(reactControls));
		expect(octaneRoot.store.getState().controls).toBe(octaneControls);
		expect(reactState.controls).toBe(reactControls);
		for (const callbacks of [reactEvents, octaneEvents]) {
			for (const callback of Object.values(callbacks)) callback.mockClear();
		}
		for (const type of ['change', 'mouseDown', 'mouseUp', 'objectChange'] as const) {
			(reactControls as any).dispatchEvent({ type });
			(octaneControls as any).dispatchEvent({ type });
		}
		expect(octaneEvents.change.mock.calls.length).toBe(reactEvents.change.mock.calls.length);
		expect(octaneEvents.down.mock.calls.length).toBe(reactEvents.down.mock.calls.length);
		expect(octaneEvents.up.mock.calls.length).toBe(reactEvents.up.mock.calls.length);
		expect(octaneEvents.object.mock.calls.length).toBe(reactEvents.object.mock.calls.length);

		const mountedOctaneControls = octaneControls;
		const mountedReactControls = reactControls;
		octaneRoot.unmount();
		await reactThreeAct(async () => reactRoot.unmount());
		expect(mountedOctaneControls.object).toBeUndefined();
		expect(mountedReactControls.object).toBeUndefined();
		expect(octaneRoot.store.getState().controls).toBe(reactState.get().controls);
	});

	it('matches explicit object attachment instead of the child group', async () => {
		const object = new THREE.Object3D();
		object.name = 'external';
		let controls!: TransformControlsImpl;
		const root = await createOctaneThree(TransformControlsScene, {
			object,
			makeDefault: false,
			enabled: true,
			axis: null,
			mode: 'translate',
			translationSnap: null,
			rotationSnap: null,
			scaleSnap: null,
			space: 'world',
			size: 1,
			showX: true,
			showY: true,
			showZ: true,
			ref: (value: TransformControlsImpl) => (controls = value),
		});
		expect(controls.object).toBe(object);
		root.unmount();
	});
});
