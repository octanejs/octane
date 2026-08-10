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
import { AsciiRendererScene } from '../_fixtures/ascii-renderer.three.tsrx';

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

describe('AsciiRenderer (Octane-only contracts)', () => {
	it('retains upstream defaults as a negative control', async () => {
		const dom = parentedCanvas();
		const root = createOctaneThreeRoot(dom.canvas);
		await root.configure({ gl: renderer(dom.canvas), frameloop: 'never', dpr: 1 });
		await octaneAct(async () => root.render(AsciiRendererScene, {}));
		const effect = mocks.instances.at(-1)!;
		expect(effect.characters).toBe(' .:-+*=%@#');
		expect(effect.options).toEqual({ invert: true, color: false, resolution: 0.15 });
		root.unmount();
	});
});
