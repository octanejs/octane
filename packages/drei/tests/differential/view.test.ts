import * as React from 'react';
import {
	act,
	advance as reactAdvance,
	createRoot as createReactRoot,
	extend,
	type RootState,
	useThree,
} from '@react-three/fiber';
import { View as ReactView } from '@react-three/drei/web/View.js';
import { createRoot as createOctaneRoot } from '@octanejs/three';
import { createRoot as createOctaneDomRoot } from 'octane';
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { View } from '../../src/web/View.three.tsrx';
import { ViewDomBoundary } from '../_fixtures/view-dom-boundary.tsrx';
import { ViewPortScene, ViewScene } from '../_fixtures/view.three.tsrx';

beforeAll(() => {
	(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
	extend(THREE as any);
});
type Record = [string, ...unknown[]];
function renderer(canvas: HTMLCanvasElement, records: Record[]) {
	let autoClear = true;
	return {
		domElement: canvas,
		get autoClear() {
			return autoClear;
		},
		set autoClear(v) {
			autoClear = v;
		},
		outputColorSpace: THREE.SRGBColorSpace,
		toneMapping: THREE.NoToneMapping,
		render(scene: THREE.Scene, camera: THREE.Camera) {
			records.push(['render', scene, camera]);
		},
		setViewport(...v: number[]) {
			records.push(['viewport', ...v]);
		},
		setScissor(...v: number[]) {
			records.push(['scissor', ...v]);
		},
		setScissorTest(v: boolean) {
			records.push(['scissorTest', v]);
		},
		getClearColor(v: THREE.Color) {
			return v.set('black');
		},
		getClearAlpha() {
			return 1;
		},
		setClearColor() {},
		clear(...v: boolean[]) {
			records.push(['clear', ...v]);
		},
		setPixelRatio() {},
		setSize() {},
		renderLists: { dispose() {} },
		forceContextLoss() {},
		dispose() {},
	} as any;
}
function rect(values: Partial<DOMRect> = {}): DOMRect {
	return {
		x: 10,
		y: 20,
		left: 10,
		top: 20,
		right: 110,
		bottom: 70,
		width: 100,
		height: 50,
		toJSON() {},
		...values,
	} as DOMRect;
}

async function mountPair(props: any, trackRect = rect()) {
	const reactRecords: Record[] = [];
	const octaneRecords: Record[] = [];
	const reactTrack = document.createElement('div');
	const octaneTrack = document.createElement('div');
	reactTrack.getBoundingClientRect = () => trackRect;
	octaneTrack.getBoundingClientRect = () => trackRect;
	let reactState!: RootState;
	let reactGroup!: THREE.Group;
	let octaneGroup!: THREE.Group;
	function Capture() {
		reactState = useThree();
		return null;
	}
	const reactHost = document.createElement('div');
	const reactCanvas = document.createElement('canvas');
	reactHost.append(reactCanvas);
	const reactRoot = createReactRoot(reactCanvas);
	await reactRoot.configure({
		gl: renderer(reactCanvas, reactRecords),
		frameloop: 'never',
		size: { width: 200, height: 100, left: 0, top: 0 },
		dpr: 1,
	});
	await act(async () =>
		reactRoot.render(
			React.createElement(
				React.Fragment,
				null,
				React.createElement(
					ReactView,
					{ ...props, track: { current: reactTrack }, ref: (v: THREE.Group) => (reactGroup = v) },
					React.createElement('mesh', { name: 'view-child' }),
				),
				React.createElement(Capture),
			),
		),
	);
	const octaneHost = document.createElement('div');
	const octaneCanvas = document.createElement('canvas');
	octaneHost.append(octaneCanvas);
	const octaneRoot = createOctaneRoot(octaneCanvas);
	await octaneRoot.configure({
		gl: renderer(octaneCanvas, octaneRecords),
		frameloop: 'never',
		size: { width: 200, height: 100, left: 0, top: 0 },
		dpr: 1,
	});
	octaneRoot.render(ViewScene, {
		...props,
		track: { current: octaneTrack },
		viewRef: (v: THREE.Group) => (octaneGroup = v),
	});
	await act(async () => {
		for (let i = 0; i < 8; i++) await Promise.resolve();
	});
	return {
		reactRoot,
		octaneRoot,
		reactState,
		reactRecords,
		octaneRecords,
		reactTrack,
		octaneTrack,
		reactGroup,
		octaneGroup,
	};
}
function normalize(records: Record[]) {
	return records.map(([name, ...values]) => [
		name,
		...values.map((v) =>
			v instanceof THREE.Scene ? 'scene' : v instanceof THREE.Camera ? 'camera' : v,
		),
	]);
}

describe('View', () => {
	// @parity-case differential:view-rendering
	it('matches tracked rect, viewport/scissor/render restoration, frames and refs', async () => {
		const pair = await mountPair({ index: 2, frames: 1, visible: true, name: 'view-group' });
		for (let i = 0; i < 3; i++) {
			await act(async () => reactAdvance((i + 1) / 60, true, pair.reactState));
			pair.octaneRoot.store.getState().advance((i + 1) / 60);
		}
		expect(normalize(pair.octaneRecords)).toEqual(normalize(pair.reactRecords));
		expect(pair.octaneGroup.name).toBe(pair.reactGroup.name);
		expect(pair.octaneRecords.filter(([name]) => name === 'render')).toHaveLength(3);
		expect((pair.octaneRoot.store.getState().gl as any).autoClear).toBe(true);
		pair.octaneRecords.push(['mutation']);
		expect(normalize(pair.octaneRecords)).not.toEqual(normalize(pair.reactRecords));
		pair.octaneRoot.unmount();
		await act(async () => pair.reactRoot.unmount());
	});

	// @parity-case differential:view-visibility
	it('matches invisible and offscreen clear/render boundaries and event connection cleanup', async () => {
		const invisible = await mountPair({ visible: false }, rect());
		await act(async () => reactAdvance(1 / 60, true, invisible.reactState));
		invisible.octaneRoot.store.getState().advance(1 / 60);
		expect(normalize(invisible.octaneRecords)).toEqual(normalize(invisible.reactRecords));
		expect(invisible.octaneRecords.some(([name]) => name === 'render')).toBe(false);
		invisible.octaneRoot.unmount();
		await act(async () => invisible.reactRoot.unmount());
		const offscreen = await mountPair({ visible: true }, rect({ top: 200, bottom: 250 }));
		await act(async () => reactAdvance(1 / 60, true, offscreen.reactState));
		offscreen.octaneRoot.store.getState().advance(1 / 60);
		expect(normalize(offscreen.octaneRecords)).toEqual(normalize(offscreen.reactRecords));
		offscreen.octaneRoot.unmount();
		await act(async () => offscreen.reactRoot.unmount());
	});

	// @parity-case differential:view-port-surface
	it('preserves the View.Port static surface', () => {
		expect(View.Port).toBeTypeOf('function');
		expect(ReactView.Port).toBeTypeOf('function');
	});

	// @parity-case differential:view-renderer-boundary
	// OCTANE DIVERGENCE[view-renderer-boundary][differential:view-renderer-boundary]
	it('documents the outside-DOM renderer boundary while keeping View.Port callable', () => {
		const root = createOctaneDomRoot(document.createElement('div'));
		expect(() => root.render(ViewDomBoundary, {})).toThrow(
			'Universal hooks may only run while a universal component is rendering.',
		);
		expect(() => View.Port).not.toThrow();
	});
});
