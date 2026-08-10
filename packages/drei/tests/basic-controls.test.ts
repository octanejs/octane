import * as React from 'react';
import {
	act as reactThreeAct,
	advance as reactAdvance,
	createRoot as createReactThreeRoot,
	useThree as reactUseThree,
	type RootState as ReactRootState,
} from '@react-three/fiber';
import { ArcballControls as ReactArcballControls } from '@react-three/drei/core/ArcballControls.js';
import { DeviceOrientationControls as ReactDeviceOrientationControls } from '@react-three/drei/core/DeviceOrientationControls.js';
import { FirstPersonControls as ReactFirstPersonControls } from '@react-three/drei/core/FirstPersonControls.js';
import { FlyControls as ReactFlyControls } from '@react-three/drei/core/FlyControls.js';
import { MapControls as ReactMapControls } from '@react-three/drei/core/MapControls.js';
import { OrbitControls as ReactOrbitControls } from '@react-three/drei/core/OrbitControls.js';
import { TrackballControls as ReactTrackballControls } from '@react-three/drei/core/TrackballControls.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
	ArcballControls as ArcballControlsImpl,
	DeviceOrientationControls as DeviceOrientationControlsImpl,
	FirstPersonControls as FirstPersonControlsImpl,
	FlyControls as FlyControlsImpl,
	MapControls as MapControlsImpl,
	OrbitControls as OrbitControlsImpl,
	TrackballControls as TrackballControlsImpl,
} from 'three-stdlib';
import {
	ArcballScene,
	DeviceOrientationScene,
	FirstPersonScene,
	FlyScene,
	MapScene,
	OrbitScene,
	TrackballScene,
} from './_fixtures/basic-controls.three.tsrx';

type Control = {
	connect?: (...args: any[]) => unknown;
	dispose?: () => unknown;
	update?: (...args: any[]) => unknown;
	handleResize?: () => unknown;
	dispatchEvent?: (event: { type: string }) => unknown;
	camera?: THREE.Camera;
	object?: THREE.Camera;
	enableDamping?: boolean;
	movementSpeed?: number;
};

type Stats = { connect: number; dispose: number; update: number; resize: number };
const stats = new WeakMap<object, Stats>();
const originals: Array<{ prototype: any; key: string; value: unknown }> = [];

function record(instance: object): Stats {
	let value = stats.get(instance);
	if (!value) {
		value = { connect: 0, dispose: 0, update: 0, resize: 0 };
		stats.set(instance, value);
	}
	return value;
}

function patch(prototype: any, method: string, key: keyof Stats = method as keyof Stats) {
	originals.push({ prototype, key: method, value: prototype[method] });
	prototype[method] = function () {
		record(this)[key]++;
		return method === 'update' ? false : undefined;
	};
}

const implementations = [
	OrbitControlsImpl,
	MapControlsImpl,
	TrackballControlsImpl,
	ArcballControlsImpl,
	FlyControlsImpl,
	FirstPersonControlsImpl,
	DeviceOrientationControlsImpl,
] as const;

beforeAll(() => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	for (const implementation of implementations) {
		const prototype = implementation.prototype as any;
		if (prototype.connect) patch(prototype, 'connect');
		if (prototype.dispose) patch(prototype, 'dispose');
		if (prototype.update) patch(prototype, 'update');
		if (prototype.handleResize) patch(prototype, 'handleResize', 'resize');
	}
});

afterAll(() => {
	for (const { prototype, key, value } of originals) prototype[key] = value;
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

const cases = [
	{
		name: 'OrbitControls',
		ReactComponent: ReactOrbitControls,
		OctaneComponent: OrbitScene,
		Implementation: OrbitControlsImpl,
		disposes: true,
		prop: (control: Control) => control.enableDamping,
		expectedProp: true,
	},
	{
		name: 'MapControls',
		ReactComponent: ReactMapControls,
		OctaneComponent: MapScene,
		Implementation: MapControlsImpl,
		disposes: true,
		prop: (control: Control) => control.enableDamping,
		expectedProp: true,
	},
	{
		name: 'TrackballControls',
		ReactComponent: ReactTrackballControls,
		OctaneComponent: TrackballScene,
		Implementation: TrackballControlsImpl,
		disposes: true,
	},
	{
		name: 'ArcballControls',
		ReactComponent: ReactArcballControls,
		OctaneComponent: ArcballScene,
		Implementation: ArcballControlsImpl,
		disposes: true,
	},
	{
		name: 'FlyControls',
		ReactComponent: ReactFlyControls,
		OctaneComponent: FlyScene,
		Implementation: FlyControlsImpl,
		disposes: true,
	},
	{
		name: 'FirstPersonControls',
		ReactComponent: ReactFirstPersonControls,
		OctaneComponent: FirstPersonScene,
		Implementation: FirstPersonControlsImpl,
		disposes: false,
		prop: (control: Control) => control.movementSpeed,
		expectedProp: 3,
	},
	{
		name: 'DeviceOrientationControls',
		ReactComponent: ReactDeviceOrientationControls,
		OctaneComponent: DeviceOrientationScene,
		Implementation: DeviceOrientationControlsImpl,
		disposes: true,
	},
] as const;

describe('basic controls', () => {
	for (const testCase of cases) {
		it(`matches ${testCase.name} construction, lifecycle, frames, events, refs, and default state`, async () => {
			let reactControl: Control | null = null;
			let octaneControl: Control | null = null;
			let reactChanges = 0;
			let octaneChanges = 0;
			const reactProps: Record<string, unknown> = {
				ref: (value: Control | null) => (reactControl = value),
				makeDefault: true,
				onChange: () => reactChanges++,
			};
			if (testCase.name === 'FirstPersonControls') reactProps.movementSpeed = 3;
			if (
				testCase.name === 'OrbitControls' ||
				testCase.name === 'TrackballControls' ||
				testCase.name === 'ArcballControls'
			)
				reactProps.regress = true;
			const react = await reactRoot(
				React.createElement(testCase.ReactComponent as any, reactProps),
			);
			const octane = await createOctaneThree(testCase.OctaneComponent, {
				controlRef: (value: Control | null) => (octaneControl = value),
				onChange: () => octaneChanges++,
			});
			expect(octaneControl).toBeInstanceOf(testCase.Implementation);
			expect(reactControl).toBeInstanceOf(testCase.Implementation);
			expect(octane.store.getState().controls).toBe(octaneControl);
			expect(react.getState().controls).toBe(reactControl);
			expect((octaneControl as Control).camera ?? (octaneControl as Control).object).toBe(
				octane.store.getState().camera,
			);
			expect((reactControl as Control).camera ?? (reactControl as Control).object).toBe(
				react.getState().camera,
			);
			if ('prop' in testCase) {
				expect(testCase.prop(octaneControl as Control)).toBe(testCase.expectedProp);
				expect(testCase.prop(reactControl as Control)).toBe(testCase.expectedProp);
			}
			expect(record(octaneControl as object).connect).toBe(record(reactControl as object).connect);
			reactAdvance(1000, true, react.getState());
			octane.advanceFrames(1);
			expect(record(octaneControl as object).update).toBe(record(reactControl as object).update);
			if (testCase.name !== 'FirstPersonControls') {
				const reactBefore = reactChanges;
				const octaneBefore = octaneChanges;
				(octaneControl as Control).dispatchEvent?.({ type: 'change' });
				await reactThreeAct(async () => {
					(reactControl as Control).dispatchEvent?.({ type: 'change' });
				});
				expect(octaneChanges - octaneBefore).toBe(reactChanges - reactBefore);
				expect(octaneChanges - octaneBefore).toBe(1);
			}
			const mountedReactControl = reactControl as object;
			const mountedOctaneControl = octaneControl as object;
			let reactDisposed = 0;
			let octaneDisposed = 0;
			(reactControl as Control).dispose = () => void reactDisposed++;
			(octaneControl as Control).dispose = () => void octaneDisposed++;
			const reactDefault = react.getState().controls;
			const octaneDefault = octane.store.getState().controls;
			octane.unmount();
			await reactThreeAct(async () => react.root.unmount());
			expect(octane.store.getState().controls).not.toBe(octaneDefault);
			expect(react.getState().controls).not.toBe(reactDefault);
			expect(record(mountedOctaneControl).dispose).toBe(record(mountedReactControl).dispose);
			expect(octaneDisposed).toBe(reactDisposed);
			expect(octaneDisposed).toBe(testCase.disposes ? 1 : 0);
		});
	}
});
