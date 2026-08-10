import * as React from 'react';
import { act as reactThreeAct, createRoot as createReactThreeRoot } from '@react-three/fiber';
import { useCursor as reactUseCursor } from '@react-three/drei/web/useCursor.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { UseCursorDefaultsScene, UseCursorScene } from './_fixtures/use-cursor.three.tsrx';

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

describe('useCursor', () => {
	it('restores defaults after the compiler-injected trailing slot', async () => {
		document.body.style.cursor = '';
		const root = await createOctaneThree(UseCursorDefaultsScene, { hovered: true });
		expect(document.body.style.cursor).toBe('pointer');
		root.unmount();
		await Promise.resolve();
		expect(document.body.style.cursor).toBe('auto');
	});

	it('matches hover, prop updates, custom containers, and cleanup', async () => {
		const reactContainer = document.createElement('div');
		const octaneContainer = document.createElement('div');
		const reactCanvas = document.createElement('canvas');
		const reactRoot = createReactThreeRoot(reactCanvas);
		await reactRoot.configure({ gl: renderer(reactCanvas), frameloop: 'never' });
		function ReactScene(props: { hovered: boolean }) {
			reactUseCursor(props.hovered, 'crosshair', 'wait', reactContainer);
			return null;
		}
		await reactThreeAct(async () =>
			reactRoot.render(React.createElement(ReactScene, { hovered: true })),
		);
		const octane = await createOctaneThree(UseCursorScene, {
			hovered: true,
			over: 'crosshair',
			out: 'wait',
			container: octaneContainer,
		});
		expect(octaneContainer.style.cursor).toBe(reactContainer.style.cursor);
		expect(octaneContainer.style.cursor).toBe('crosshair');

		await reactThreeAct(async () =>
			reactRoot.render(React.createElement(ReactScene, { hovered: false })),
		);
		octane.update(UseCursorScene, {
			hovered: false,
			over: 'crosshair',
			out: 'wait',
			container: octaneContainer,
		});
		await Promise.resolve();
		expect(octaneContainer.style.cursor).toBe(reactContainer.style.cursor);
		expect(octaneContainer.style.cursor).toBe('wait');

		octane.unmount();
		await reactThreeAct(async () => reactRoot.unmount());
	});
});
