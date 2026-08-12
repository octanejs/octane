import * as React from 'react';
import {
	act as reactThreeAct,
	createRoot as createReactThreeRoot,
	useThree as reactUseThree,
	type RootState as ReactRootState,
} from '@react-three/fiber';
import { AsciiRenderer as ReactAsciiRenderer } from '@react-three/drei/core/AsciiRenderer.js';
import { act as octaneAct } from 'octane';
import { createRoot as createOctaneThreeRoot } from '@octanejs/three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { AsciiRendererScene } from './_fixtures/ascii-renderer.three.tsrx';

type MockEffect = {
	domElement: HTMLDivElement;
	characters: string;
	options: Record<string, unknown>;
	setSize: ReturnType<typeof vi.fn>;
	render: ReturnType<typeof vi.fn>;
};

const mocks = vi.hoisted(() => {
	const instances: MockEffect[] = [];
	class Effect {
		domElement = document.createElement('div');
		setSize = vi.fn();
		render = vi.fn();
		constructor(
			readonly renderer: unknown,
			readonly characters: string,
			readonly options: Record<string, unknown>,
		) {
			instances.push(this);
		}
	}
	return { instances, Effect };
});

vi.mock('three-stdlib', async (importOriginal) => ({
	...(await importOriginal<typeof import('three-stdlib')>()),
	AsciiEffect: mocks.Effect,
}));

beforeEach(() => {
	mocks.instances.length = 0;
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

function parentedCanvas() {
	const parent = document.createElement('div');
	const canvas = document.createElement('canvas');
	parent.appendChild(canvas);
	return { parent, canvas };
}

function snapshot(effect: MockEffect, canvas: HTMLCanvasElement) {
	return {
		characters: effect.characters,
		options: effect.options,
		position: effect.domElement.style.position,
		top: effect.domElement.style.top,
		left: effect.domElement.style.left,
		pointerEvents: effect.domElement.style.pointerEvents,
		color: effect.domElement.style.color,
		backgroundColor: effect.domElement.style.backgroundColor,
		canvasOpacity: canvas.style.opacity,
		attached: effect.domElement.parentNode === canvas.parentNode,
		setSize: effect.setSize.mock.calls,
	};
}

describe('AsciiRenderer', () => {
	it('matches the pinned React Drei effect configuration, styling, size, frame priority, and cleanup', async () => {
		const props = {
			renderIndex: 2,
			bgColor: 'navy',
			fgColor: 'gold',
			characters: 'xo',
			invert: false,
			color: true,
			resolution: 0.25,
		};
		const reactDom = parentedCanvas();
		const reactRoot = createReactThreeRoot(reactDom.canvas);
		await reactRoot.configure({
			gl: renderer(reactDom.canvas),
			frameloop: 'never',
			dpr: 1,
			size: { width: 320, height: 180, top: 0, left: 0 },
		});
		let reactState!: ReactRootState;
		function ReactScene() {
			reactState = reactUseThree();
			return React.createElement(ReactAsciiRenderer, props);
		}
		await reactThreeAct(async () => reactRoot.render(React.createElement(ReactScene)));
		const reactEffect = mocks.instances.at(-1)!;

		const octaneDom = parentedCanvas();
		const octaneRoot = createOctaneThreeRoot(octaneDom.canvas);
		await octaneRoot.configure({
			gl: renderer(octaneDom.canvas),
			frameloop: 'never',
			dpr: 1,
			size: { width: 320, height: 180, top: 0, left: 0 },
		});
		await octaneAct(async () => octaneRoot.render(AsciiRendererScene, props));
		const octaneEffect = mocks.instances.at(-1)!;

		expect(snapshot(octaneEffect, octaneDom.canvas)).toEqual(
			snapshot(reactEffect, reactDom.canvas),
		);
		await reactThreeAct(async () => reactState.advance(1 / 60, true));
		octaneRoot.store.getState().advance(1 / 60);
		expect(octaneEffect.render).toHaveBeenCalledTimes(reactEffect.render.mock.calls.length);
		expect(octaneEffect.render).toHaveBeenLastCalledWith(
			octaneRoot.store.getState().scene,
			octaneRoot.store.getState().camera,
		);

		octaneRoot.unmount();
		await reactThreeAct(async () => reactRoot.unmount());
		expect(octaneDom.canvas.style.opacity).toBe('1');
		expect(reactDom.canvas.style.opacity).toBe('1');
		expect(octaneEffect.domElement.parentNode).toBeNull();
		expect(reactEffect.domElement.parentNode).toBeNull();
	});
});
