import * as React from 'react';
import {
	act as reactThreeAct,
	createRoot as createReactThreeRoot,
	useThree as reactUseThree,
	type RootState as ReactRootState,
} from '@react-three/fiber';
import { CycleRaycast as ReactCycleRaycast } from '@react-three/drei/web/CycleRaycast.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CycleRaycastScene } from './_fixtures/cycle-raycast.three.tsrx';

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

async function reactCycle(portal: React.RefObject<HTMLElement>, onChanged: Function) {
	const canvas = document.createElement('canvas');
	const parent = document.createElement('div');
	parent.append(canvas);
	const root = createReactThreeRoot(canvas);
	let get!: () => ReactRootState;
	function Scene() {
		get = reactUseThree((state) => state.get);
		return React.createElement(ReactCycleRaycast, { portal, onChanged });
	}
	await root.configure({ gl: renderer(canvas), frameloop: 'never' });
	await reactThreeAct(async () => root.render(React.createElement(Scene)));
	return { root, getState: () => get() };
}

function intersection(object: THREE.Object3D): THREE.Intersection {
	return { distance: 1, point: new THREE.Vector3(), object };
}

describe('CycleRaycast', () => {
	it('matches hit resets, keyboard/wheel cycling, refresh handlers, status callbacks, and cleanup', async () => {
		const reactPortal = document.createElement('div');
		const octanePortal = document.createElement('div');
		const reactStatuses: unknown[] = [];
		const octaneStatuses: unknown[] = [];
		const status = (target: unknown[]) => (hits: THREE.Intersection[], cycle: number) => {
			target.push([hits.map((hit) => hit.object.name), cycle]);
			return null;
		};
		const react = await reactCycle({ current: reactPortal }, status(reactStatuses));
		const octane = await createOctaneThree(CycleRaycastScene, {
			portal: { current: octanePortal },
			onChanged: status(octaneStatuses),
		});
		const reactRefreshes: string[] = [];
		const octaneRefreshes: string[] = [];
		(react.getState().setEvents as any)({
			handlers: {
				onPointerCancel: () => reactRefreshes.push('cancel'),
				onPointerMove: () => reactRefreshes.push('move'),
			},
		});
		(octane.store.getState().setEvents as any)({
			handlers: {
				onPointerCancel: () => octaneRefreshes.push('cancel'),
				onPointerMove: () => octaneRefreshes.push('move'),
			},
		});
		const reactObjects = ['a', 'b', 'c'].map((name) => {
			const object = new THREE.Object3D();
			object.name = name;
			return object;
		});
		const octaneObjects = ['a', 'b', 'c'].map((name) => {
			const object = new THREE.Object3D();
			object.name = name;
			return object;
		});
		const filter = (state: RootState, objects: THREE.Object3D[]) =>
			state.events.filter!(
				objects.map((object) => intersection(object)),
				state,
			).map((hit) => hit.object.name);
		expect(filter(octane.store.getState() as unknown as RootState, octaneObjects)).toEqual(
			filter(react.getState(), reactObjects),
		);
		const key = new KeyboardEvent('keydown', { key: 'Tab', keyCode: 9, cancelable: true });
		document.dispatchEvent(key);
		expect(key.defaultPrevented).toBe(true);
		expect(filter(octane.store.getState() as unknown as RootState, octaneObjects)).toEqual(
			filter(react.getState(), reactObjects),
		);
		expect(filter(react.getState(), reactObjects)).toEqual(['b', 'c', 'a']);
		const wheel = new WheelEvent('wheel', { deltaY: -1, cancelable: true });
		Object.defineProperty(wheel, 'detail', { value: 3 });
		document.dispatchEvent(wheel);
		expect(octaneStatuses).toEqual(reactStatuses);
		expect(octaneRefreshes).toEqual(reactRefreshes);

		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
		expect(octane.store.getState().events.filter).toBe(react.getState().events.filter);
		expect(octane.store.getState().events.filter).toBeUndefined();
	});
});
