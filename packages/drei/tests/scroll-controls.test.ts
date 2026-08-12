import * as React from 'react';
import {
	act,
	advance as reactAdvance,
	createRoot as createReactRoot,
	extend,
	type RootState,
	useThree,
} from '@react-three/fiber';
import {
	Scroll as ReactScroll,
	ScrollControls as ReactScrollControls,
	type ScrollControlsState as ReactScrollState,
	useScroll as useReactScroll,
} from '@react-three/drei/web/ScrollControls.js';
import { createRoot as createOctaneRoot } from '@octanejs/three';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { ScrollControls, type ScrollControlsState } from '../src/web/ScrollControls.three.tsrx';
import { ScrollControlsScene } from './_fixtures/scroll-controls.three.tsrx';

beforeAll(() => {
	(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
	extend(THREE as any);
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
	} as any;
}
function defineScrollSize(el: HTMLElement, width: number, height: number) {
	Object.defineProperties(el, {
		scrollWidth: { value: width, configurable: true },
		scrollHeight: { value: height, configurable: true },
	});
}
function snapshot(state: ReactScrollState | ScrollControlsState) {
	return {
		offset: state.offset,
		delta: state.delta,
		range: state.range(0.2, 0.4, 0.1),
		curve: state.curve(0.2, 0.4, 0.1),
		visible: state.visible(0.2, 0.4, 0.1),
		el: {
			position: state.el.style.position,
			width: state.el.style.width,
			height: state.el.style.height,
			overflowX: state.el.style.overflowX,
			overflowY: state.el.style.overflowY,
		},
		fill: {
			width: state.fill.style.width,
			height: state.fill.style.height,
			pointerEvents: state.fill.style.pointerEvents,
		},
	};
}

async function mountPair(props: Record<string, unknown>) {
	const frames: FrameRequestCallback[] = [];
	const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
		frames.push(cb);
		return frames.length;
	});
	let reactState!: ReactScrollState;
	let octaneState!: ScrollControlsState;
	let reactRootState!: RootState;
	let reactGroup!: THREE.Group;
	let octaneGroup!: THREE.Group;
	let reactHtml!: HTMLDivElement;
	let octaneHtml!: HTMLDivElement;
	function Capture() {
		reactState = useReactScroll();
		return null;
	}
	function RootCapture() {
		reactRootState = useThree();
		return null;
	}
	const reactHost = document.createElement('div');
	const reactCanvas = document.createElement('canvas');
	reactHost.append(reactCanvas);
	const reactRoot = createReactRoot(reactCanvas);
	await reactRoot.configure({
		gl: renderer(reactCanvas),
		frameloop: 'never',
		size: { width: 200, height: 100, left: 0, top: 0 },
		dpr: 1,
	});
	const reactTree = React.createElement(
		React.Fragment,
		null,
		React.createElement(
			ReactScrollControls,
			props,
			React.createElement(Capture),
			React.createElement(
				ReactScroll,
				{ ref: (v: THREE.Group) => (reactGroup = v) },
				React.createElement('mesh', { name: 'scroll-child' }),
			),
			React.createElement(ReactScroll, {
				html: true,
				ref: (v: HTMLDivElement) => (reactHtml = v),
				style: { color: 'red' },
			}),
		),
		React.createElement(RootCapture),
	);
	await act(async () => reactRoot.render(reactTree));
	const octaneHost = document.createElement('div');
	const octaneCanvas = document.createElement('canvas');
	octaneHost.append(octaneCanvas);
	const octaneRoot = createOctaneRoot(octaneCanvas);
	await octaneRoot.configure({
		gl: renderer(octaneCanvas),
		frameloop: 'never',
		size: { width: 200, height: 100, left: 0, top: 0 },
		dpr: 1,
	});
	octaneRoot.render(ScrollControlsScene, {
		...props,
		onState: (v: ScrollControlsState) => (octaneState = v),
		groupRef: (v: THREE.Group) => (octaneGroup = v),
		htmlRef: (v: HTMLDivElement) => (octaneHtml = v),
	});
	await act(async () => {
		for (let i = 0; i < 8; i++) await Promise.resolve();
		for (const cb of frames.splice(0)) cb(0);
		for (let i = 0; i < 4; i++) await Promise.resolve();
	});
	await act(async () => reactRoot.render(reactTree));
	octaneRoot.render(ScrollControlsScene, {
		...props,
		onState: (v: ScrollControlsState) => (octaneState = v),
		groupRef: (v: THREE.Group) => (octaneGroup = v),
		htmlRef: (v: HTMLDivElement) => (octaneHtml = v),
	});
	await act(async () => {
		for (let i = 0; i < 4; i++) await Promise.resolve();
	});
	return {
		reactRoot,
		octaneRoot,
		reactHost,
		octaneHost,
		reactState,
		octaneState,
		reactRootState,
		get reactGroup() {
			return reactGroup;
		},
		get octaneGroup() {
			return octaneGroup;
		},
		get reactHtml() {
			return reactHtml;
		},
		get octaneHtml() {
			return octaneHtml;
		},
		raf,
	};
}
async function advancePair(pair: Awaited<ReturnType<typeof mountPair>>, n = 30) {
	for (let i = 0; i < n; i++) {
		await act(async () => reactAdvance((i + 1) / 60, true, pair.reactRootState));
		pair.octaneRoot.store.getState().advance((i + 1) / 60);
	}
}

describe('ScrollControls', () => {
	it('matches vertical DOM, APIs, damping, canvas/html paths and cleanup', async () => {
		const pair = await mountPair({
			pages: 3,
			distance: 2,
			damping: 0,
			prepend: false,
			style: { backgroundColor: 'blue' },
		});
		defineScrollSize(pair.reactState.el, 200, 600);
		defineScrollSize(pair.octaneState.el, 200, 600);
		pair.reactState.el.dispatchEvent(new Event('scroll'));
		pair.octaneState.el.dispatchEvent(new Event('scroll'));
		pair.reactState.el.scrollTop = 251;
		pair.octaneState.el.scrollTop = 251;
		pair.reactState.el.dispatchEvent(new Event('scroll'));
		pair.octaneState.el.dispatchEvent(new Event('scroll'));
		await advancePair(pair, 2);
		expect(snapshot(pair.octaneState)).toEqual(snapshot(pair.reactState));
		expect(pair.octaneGroup.position.toArray()).toEqual(pair.reactGroup.position.toArray());
		const reactHtml = pair.reactState.fixed.firstElementChild as HTMLDivElement;
		const octaneHtml = pair.octaneState.fixed.firstElementChild as HTMLDivElement;
		expect(pair.octaneHtml).toBe(octaneHtml);
		expect(octaneHtml.style.transform).toBe(reactHtml.style.transform);
		expect(pair.octaneHost.lastElementChild).toBe(pair.octaneState.el);
		pair.octaneState.offset += 0.2;
		expect(snapshot(pair.octaneState)).not.toEqual(snapshot(pair.reactState));
		pair.octaneRoot.unmount();
		await act(async () => pair.reactRoot.unmount());
		expect(pair.octaneHost.contains(pair.octaneState.el)).toBe(false);
		expect(pair.reactHost.contains(pair.reactState.el)).toBe(false);
		pair.raf.mockRestore();
	});

	it('matches horizontal wheel, prepend/fill, enabled=false and infinite wrap', async () => {
		const pair = await mountPair({
			horizontal: true,
			pages: 4,
			distance: 1.5,
			damping: 0,
			prepend: true,
			infinite: true,
			enabled: false,
		});
		defineScrollSize(pair.reactState.el, 800, 100);
		defineScrollSize(pair.octaneState.el, 800, 100);
		for (const state of [pair.reactState, pair.octaneState]) {
			state.el.dispatchEvent(new WheelEvent('wheel', { deltaY: 100 }));
			state.el.dispatchEvent(new Event('scroll'));
		}
		await advancePair(pair, 2);
		expect(snapshot(pair.octaneState)).toEqual(snapshot(pair.reactState));
		expect(pair.octaneState.offset).toBe(0);
		expect(pair.octaneState.el.scrollLeft).toBe(pair.reactState.el.scrollLeft);
		expect(pair.octaneHost.firstElementChild).toBe(pair.octaneState.el);
		pair.octaneRoot.unmount();
		await act(async () => pair.reactRoot.unmount());
		pair.raf.mockRestore();
	});

	it('matches enabled infinite edge wrapping and touch boundary', async () => {
		const pair = await mountPair({ pages: 2, damping: 0, infinite: true, enabled: true });
		defineScrollSize(pair.reactState.el, 200, 300);
		defineScrollSize(pair.octaneState.el, 200, 300);
		for (const state of [pair.reactState, pair.octaneState]) {
			state.el.scrollTop = 200;
			state.el.dispatchEvent(new Event('scroll'));
		}
		await new Promise((resolve) => setTimeout(resolve, 45));
		for (const state of [pair.reactState, pair.octaneState]) {
			state.el.scrollTop = 200;
			state.el.dispatchEvent(new Event('scroll'));
		}
		await new Promise((resolve) => setTimeout(resolve, 45));
		for (const state of [pair.reactState, pair.octaneState]) {
			state.el.scrollTop = 200;
			state.el.dispatchEvent(new Event('scroll'));
			state.el.dispatchEvent(new Event('touchmove'));
		}
		expect(pair.octaneState.el.scrollTop).toBe(pair.reactState.el.scrollTop);
		expect(pair.octaneState.offset).toBe(pair.reactState.offset);
		// jsdom does not perform native overflow layout, but both registered infinite-scroll paths remain behaviorally aligned.
		expect(pair.octaneState.el.scrollTop).toBe(pair.reactState.el.scrollTop);
		pair.octaneRoot.unmount();
		await act(async () => pair.reactRoot.unmount());
		pair.raf.mockRestore();
	});
});
