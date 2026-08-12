import * as React from 'react';
import { act as reactThreeAct, createRoot as createReactThreeRoot } from '@react-three/fiber';
import { useCursor as reactUseCursor } from '@react-three/drei/web/useCursor.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { UseCursorDefaultsScene, UseCursorScene } from '../_fixtures/use-cursor.three.tsrx';

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

describe('useCursor (Octane-only contracts)', () => {
	it('restores defaults after the compiler-injected trailing slot', async () => {
		document.body.style.cursor = '';
		const root = await createOctaneThree(UseCursorDefaultsScene, { hovered: true });
		expect(document.body.style.cursor).toBe('pointer');
		root.unmount();
		await Promise.resolve();
		expect(document.body.style.cursor).toBe('auto');
	});
});
