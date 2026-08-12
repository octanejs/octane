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
import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { Html, defaultCalculatePosition } from '../../src/web/Html.three.tsrx';
import { HtmlScene } from '../_fixtures/html.three.tsrx';

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

describe('Html (Octane-only contracts)', () => {
	it('exports the upstream calculate-position behavior', () => {
		const object = new THREE.Object3D();
		const camera = new THREE.PerspectiveCamera();
		camera.position.z = 5;
		camera.updateProjectionMatrix();
		object.updateMatrixWorld();
		camera.updateMatrixWorld();
		expect(defaultCalculatePosition(object, camera, { width: 200, height: 100 })).toEqual([
			100, 50,
		]);
		expect(Html).toBeTypeOf('function');
	});
});
