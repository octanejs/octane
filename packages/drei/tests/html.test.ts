import * as React from 'react';
import {
	act,
	advance as reactAdvance,
	createRoot as createReactRoot,
	extend,
	type RootState,
	useThree,
} from '@react-three/fiber';
import { Html as ReactHtml } from '@react-three/drei/web/Html.js';
import { createRoot as createOctaneRoot } from '@octanejs/three';
import { flushSync } from 'octane';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { Html, defaultCalculatePosition } from '../src/web/Html.three.tsrx';
import { HtmlScene } from './_fixtures/html.three.tsrx';

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

async function mountPair(props: Record<string, unknown>) {
	const reactOcclusions: boolean[] = [];
	const octaneOcclusions: boolean[] = [];
	let reactState!: RootState;
	let reactElement!: HTMLDivElement;
	let octaneElement!: HTMLDivElement;
	function Capture() {
		reactState = useThree();
		return null;
	}
	const reactHost = document.createElement('main');
	const reactCanvas = document.createElement('canvas');
	reactHost.append(reactCanvas);
	const reactRoot = createReactRoot(reactCanvas);
	await reactRoot.configure({
		gl: renderer(reactCanvas),
		frameloop: 'never',
		size: { width: 200, height: 100, left: 0, top: 0 },
		dpr: 1,
	});
	const { customGeometry, captureOcclusion, raycastOccluder, ...componentProps } = props;
	if (captureOcclusion)
		componentProps.onOcclude = (hidden: boolean) => reactOcclusions.push(hidden);
	await act(async () =>
		reactRoot.render(
			React.createElement(
				React.Fragment,
				null,
				raycastOccluder
					? React.createElement(
							'mesh',
							{ position: [0, 0, 2] },
							React.createElement('planeGeometry', { args: [10, 10] }),
							React.createElement('meshBasicMaterial'),
						)
					: null,
				React.createElement(
					ReactHtml,
					{
						...componentProps,
						geometry: customGeometry ? React.createElement('boxGeometry') : undefined,
						ref: (value: HTMLDivElement) => (reactElement = value),
					},
					React.createElement('button', { className: 'html-content' }, 'dark:label:0'),
				),
				React.createElement(Capture),
			),
		),
	);

	const octaneHost = document.createElement('main');
	const octaneCanvas = document.createElement('canvas');
	octaneHost.append(octaneCanvas);
	const octaneRoot = createOctaneRoot(octaneCanvas);
	await octaneRoot.configure({
		gl: renderer(octaneCanvas),
		frameloop: 'never',
		size: { width: 200, height: 100, left: 0, top: 0 },
		dpr: 1,
	});
	const octaneProps = {
		...props,
		theme: 'dark',
		label: 'label',
		htmlRef: (value: HTMLDivElement) => (octaneElement = value),
	};
	delete octaneProps.captureOcclusion;
	if (captureOcclusion) octaneProps.onOcclude = (hidden: boolean) => octaneOcclusions.push(hidden);
	octaneRoot.render(HtmlScene, octaneProps);
	await act(async () => {
		for (let index = 0; index < 8; index++) await Promise.resolve();
	});
	return {
		reactRoot,
		octaneRoot,
		reactState,
		reactHost,
		octaneHost,
		reactOcclusions,
		octaneOcclusions,
		get reactElement() {
			return reactElement;
		},
		get octaneElement() {
			return octaneElement;
		},
	};
}

function defineSize(element: HTMLElement, width: number, height: number): void {
	Object.defineProperties(element, {
		clientWidth: { configurable: true, value: width },
		clientHeight: { configurable: true, value: height },
	});
}

function meshIn(scene: THREE.Scene): THREE.Mesh {
	let result: THREE.Mesh | undefined;
	scene.traverse((object) => {
		if (!result && object instanceof THREE.Mesh) result = object;
	});
	return result!;
}

function octaneElementStyles(element: HTMLElement) {
	return {
		position: element.style.position,
		top: element.style.top,
		left: element.style.left,
		width: element.style.width,
		height: element.style.height,
		transformStyle: element.style.transformStyle,
		pointerEvents: element.style.pointerEvents,
		transform: element.style.transform,
	};
}

describe('Html', () => {
	it('matches projected positioning, DOM props, refs, prepend and cleanup', async () => {
		const calculatePosition = vi.fn(() => [30, 40] as [number, number]);
		const pair = await mountPair({
			calculatePosition,
			center: true,
			prepend: true,
			className: 'label',
			wrapperClass: 'wrapper',
			style: { color: 'red' },
			distanceFactor: 2,
		});
		await act(async () => reactAdvance(1 / 60, true, pair.reactState));
		pair.octaneRoot.store.getState().advance(1 / 60);
		expect(pair.octaneElement.textContent).toBe(pair.reactElement.textContent);
		expect(pair.octaneElement.className).toBe(pair.reactElement.className);
		expect(pair.octaneElement.style.color).toBe(pair.reactElement.style.color);
		expect(pair.octaneElement.parentElement?.className).toBe('wrapper');
		expect(pair.octaneElement.parentElement?.style.transform).toBe(
			pair.reactElement.parentElement?.style.transform,
		);
		expect(pair.octaneElement.parentElement?.style.zIndex).toBe(
			pair.reactElement.parentElement?.style.zIndex,
		);
		expect(pair.octaneHost.firstElementChild).not.toBe(pair.octaneHost.querySelector('canvas'));
		pair.octaneRoot.unmount();
		await act(async () => pair.reactRoot.unmount());
		expect(pair.octaneHost.querySelector('.html-content')).toBeNull();
	});

	it('forwards a pre-lowered DOM region with context, state and lifecycle intact', async () => {
		let mounts = 0;
		let cleanups = 0;
		const pair = await mountPair({ onMount: () => mounts++, onCleanup: () => cleanups++ });
		const button = pair.octaneHost.querySelector('.html-content') as HTMLButtonElement;
		expect(button.textContent).toBe('dark:label:0');
		flushSync(() => button.click());
		expect(button.textContent).toBe('dark:label:1');
		expect(mounts).toBe(1);
		pair.octaneRoot.unmount();
		expect(cleanups).toBe(1);
		await act(async () => pair.reactRoot.unmount());
	});

	it('matches every transform DOM layer, matrices, pointer events, blending state and plane shaders', async () => {
		const pair = await mountPair({
			transform: true,
			sprite: true,
			pointerEvents: 'none',
			occlude: 'blending',
			castShadow: true,
			receiveShadow: true,
		});
		await act(async () => reactAdvance(1 / 60, true, pair.reactState));
		pair.octaneRoot.store.getState().advance(1 / 60);
		const reactCanvas = pair.reactHost.querySelector('canvas')!;
		const octaneCanvas = pair.octaneHost.querySelector('canvas')!;
		expect(octaneCanvas.style.zIndex).toBe(reactCanvas.style.zIndex);
		expect(octaneCanvas.style.pointerEvents).toBe(reactCanvas.style.pointerEvents);
		const reactInner = pair.reactElement.parentElement as HTMLDivElement;
		const octaneInner = pair.octaneElement.parentElement as HTMLDivElement;
		const reactOuter = reactInner.parentElement as HTMLDivElement;
		const octaneOuter = octaneInner.parentElement as HTMLDivElement;
		const reactWrapper = reactOuter.parentElement as HTMLDivElement;
		const octaneWrapper = octaneOuter.parentElement as HTMLDivElement;
		expect(octaneElementStyles(octaneOuter)).toEqual(octaneElementStyles(reactOuter));
		expect(octaneElementStyles(octaneInner)).toEqual(octaneElementStyles(reactInner));
		expect(octaneElementStyles(pair.octaneElement)).toEqual(octaneElementStyles(pair.reactElement));
		expect(octaneWrapper.style.cssText).toBe(reactWrapper.style.cssText);
		expect(octaneOuter.style.transform).toContain('matrix3d');
		expect(octaneInner.style.transform).toContain('matrix3d');
		expect(octaneOuter.style.pointerEvents).toBe('none');
		expect(octaneInner.style.pointerEvents).toBe('none');
		expect(pair.octaneElement.style.pointerEvents).toBe('');
		const plane = meshIn(pair.octaneRoot.store.getState().scene);
		expect(plane.castShadow).toBe(true);
		expect(plane.receiveShadow).toBe(true);
		const material = plane.material as THREE.ShaderMaterial;
		const reactMaterial = meshIn(pair.reactState.scene).material as THREE.ShaderMaterial;
		expect(material.vertexShader).toBe(reactMaterial.vertexShader);
		expect(material.fragmentShader).toContain('vec4(0.0, 0.0, 0.0, 0.0)');
		pair.octaneRoot.unmount();
		await act(async () => pair.reactRoot.unmount());
		expect(octaneCanvas.style.cssText).toBe(reactCanvas.style.cssText);
	});

	it('matches behind-camera display and onOcclude callback semantics', async () => {
		const displayPair = await mountPair({ position: [0, 0, 10] });
		await act(async () => reactAdvance(1 / 60, true, displayPair.reactState));
		displayPair.octaneRoot.store.getState().advance(1 / 60);
		expect(displayPair.octaneElement.parentElement?.style.display).toBe(
			displayPair.reactElement.parentElement?.style.display,
		);
		displayPair.octaneRoot.unmount();
		await act(async () => displayPair.reactRoot.unmount());

		const callbackPair = await mountPair({ position: [0, 0, 10], captureOcclusion: true });
		await act(async () => reactAdvance(1 / 60, true, callbackPair.reactState));
		callbackPair.octaneRoot.store.getState().advance(1 / 60);
		expect(callbackPair.octaneOcclusions).toEqual(callbackPair.reactOcclusions);
		expect(callbackPair.octaneOcclusions).toEqual([true]);
		expect(callbackPair.octaneElement.parentElement?.style.display).toBe('');
		callbackPair.octaneRoot.unmount();
		await act(async () => callbackPair.reactRoot.unmount());
	});

	it('matches raycast occlusion visibility and its upper-half z-index range', async () => {
		const pair = await mountPair({ occlude: true, raycastOccluder: true, zIndexRange: [100, 0] });
		await act(async () => reactAdvance(1 / 60, true, pair.reactState));
		pair.octaneRoot.store.getState().advance(1 / 60);
		const reactWrapper = pair.reactElement.parentElement!;
		const octaneWrapper = pair.octaneElement.parentElement!;
		expect(octaneWrapper.style.display).toBe(reactWrapper.style.display);
		expect(octaneWrapper.style.display).toBe('none');
		expect(octaneWrapper.style.zIndex).toBe(reactWrapper.style.zIndex);
		pair.octaneRoot.unmount();
		await act(async () => pair.reactRoot.unmount());
	});

	it('matches transform plane sizing for default perspective and custom geometry scale', async () => {
		const perspective = await mountPair({
			transform: true,
			occlude: 'blending',
			distanceFactor: 20,
		});
		defineSize(perspective.reactElement.parentElement!, 80, 40);
		defineSize(perspective.octaneElement.parentElement!, 80, 40);
		await act(async () => reactAdvance(1 / 60, true, perspective.reactState));
		perspective.octaneRoot.store.getState().advance(1 / 60);
		expect(meshIn(perspective.octaneRoot.store.getState().scene).scale.toArray()).toEqual(
			meshIn(perspective.reactState.scene).scale.toArray(),
		);
		perspective.octaneRoot.unmount();
		await act(async () => perspective.reactRoot.unmount());

		const custom = await mountPair({
			transform: true,
			occlude: 'blending',
			customGeometry: true,
			scale: [2, 4, 5],
		});
		defineSize(custom.reactElement.parentElement!, 80, 40);
		defineSize(custom.octaneElement.parentElement!, 80, 40);
		await act(async () => reactAdvance(1 / 60, true, custom.reactState));
		custom.octaneRoot.store.getState().advance(1 / 60);
		expect(meshIn(custom.octaneRoot.store.getState().scene).scale.toArray()).toEqual(
			meshIn(custom.reactState.scene).scale.toArray(),
		);
		expect(meshIn(custom.octaneRoot.store.getState().scene).scale.toArray()).toEqual([
			0.5, 0.25, 0.2,
		]);
		custom.octaneRoot.unmount();
		await act(async () => custom.reactRoot.unmount());
	});
});
