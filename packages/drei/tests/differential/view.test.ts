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
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ViewScene } from '../_fixtures/view.three.tsrx';

beforeAll(() => {
	(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
	extend(THREE as any);
});
type Record = [string, ...unknown[]];
type EventState = {
	events: { connected: unknown };
	setEvents: (value: { connected?: unknown }) => void;
	get?: () => { events: { connected: unknown } };
};
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

function spySetEvents(state: EventState) {
	const history: Array<{ connected?: unknown }> = [];
	const prior = state.get ? state.get().events.connected : state.events.connected;
	const original = state.setEvents.bind(state);
	state.setEvents = function setEvents(value: { connected?: unknown }) {
		history.push(value);
		return original(value);
	};
	return { prior, history };
}

function ReactConnectedProbe({ onState }: { onState: (state: EventState) => void }) {
	const state = useThree((current) => current);
	React.useEffect(() => {
		onState(state as EventState);
	}, [state, onState]);
	return null;
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
	let reactEventSpy: ReturnType<typeof spySetEvents> | undefined;
	let octaneEventSpy: ReturnType<typeof spySetEvents> | undefined;
	function Capture() {
		reactState = useThree();
		return null;
	}
	function onReactPortalState(state: EventState) {
		if (!reactEventSpy) reactEventSpy = spySetEvents(state);
	}
	function onOctanePortalState(state: EventState) {
		if (!octaneEventSpy) octaneEventSpy = spySetEvents(state);
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
					React.createElement(ReactConnectedProbe, { onState: onReactPortalState }),
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
		onConnectedState: onOctanePortalState,
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
		reactEventSpy,
		octaneEventSpy,
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
		expect(invisible.reactEventSpy?.history).toContainEqual({ connected: invisible.reactTrack });
		expect(invisible.octaneEventSpy?.history).toContainEqual({ connected: invisible.octaneTrack });
		await act(async () => reactAdvance(1 / 60, true, invisible.reactState));
		invisible.octaneRoot.store.getState().advance(1 / 60);
		expect(normalize(invisible.octaneRecords)).toEqual(normalize(invisible.reactRecords));
		expect(invisible.octaneRecords.some(([name]) => name === 'render')).toBe(false);
		invisible.octaneRoot.unmount();
		await act(async () => invisible.reactRoot.unmount());
		expect(invisible.reactEventSpy?.history).toContainEqual({
			connected: invisible.reactEventSpy?.prior,
		});
		expect(invisible.octaneEventSpy?.history).toContainEqual({
			connected: invisible.octaneEventSpy?.prior,
		});

		const offscreen = await mountPair({ visible: true }, rect({ top: 200, bottom: 250 }));
		expect(offscreen.reactEventSpy?.history).toContainEqual({ connected: offscreen.reactTrack });
		expect(offscreen.octaneEventSpy?.history).toContainEqual({ connected: offscreen.octaneTrack });
		await act(async () => reactAdvance(1 / 60, true, offscreen.reactState));
		offscreen.octaneRoot.store.getState().advance(1 / 60);
		await act(async () => {
			for (let i = 0; i < 8; i++) await Promise.resolve();
		});
		const reactRendersAfterSettle = offscreen.reactRecords.filter(
			([name]) => name === 'render',
		).length;
		const octaneRendersAfterSettle = offscreen.octaneRecords.filter(
			([name]) => name === 'render',
		).length;
		await act(async () => reactAdvance(2 / 60, true, offscreen.reactState));
		offscreen.octaneRoot.store.getState().advance(2 / 60);
		await act(async () => {
			for (let i = 0; i < 8; i++) await Promise.resolve();
		});
		expect(normalize(offscreen.octaneRecords)).toEqual(normalize(offscreen.reactRecords));
		expect(offscreen.reactRecords.filter(([name]) => name === 'render')).toHaveLength(
			reactRendersAfterSettle,
		);
		expect(offscreen.octaneRecords.filter(([name]) => name === 'render')).toHaveLength(
			octaneRendersAfterSettle,
		);
		offscreen.octaneRoot.unmount();
		await act(async () => offscreen.reactRoot.unmount());
		expect(offscreen.reactEventSpy?.history).toContainEqual({
			connected: offscreen.reactEventSpy?.prior,
		});
		expect(offscreen.octaneEventSpy?.history).toContainEqual({
			connected: offscreen.octaneEventSpy?.prior,
		});
	});
});
