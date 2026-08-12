import * as React from 'react';
import { act as reactThreeAct, createRoot as createReactThreeRoot } from '@react-three/fiber';
import { useFont as reactUseFont } from '@react-three/drei/core/useFont.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { Font } from 'three-stdlib';
import { useFont, type FontData } from '../../src/index.js';
import { FontBoundary } from '../_fixtures/font.three.tsrx';

const fontData: FontData = {
	boundingBox: { yMax: 900, yMin: -200 },
	familyName: 'Parity Sans',
	glyphs: {
		A: { _cachedOutline: [], ha: 700, o: 'm 0 0 l 350 700 l 700 0' },
	},
	resolution: 1000,
	underlineThickness: 50,
};

afterEach(() => {
	useFont.clear(fontData);
	reactUseFont.clear(fontData);
	vi.unstubAllGlobals();
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

function snapshot(font: Font) {
	return {
		familyName: font.data.familyName,
		resolution: font.data.resolution,
		boundingBox: font.data.boundingBox,
		glyphA: font.data.glyphs.A,
	};
}

async function flush(): Promise<void> {
	await reactThreeAct(async () => {
		for (let index = 0; index < 8; index++) await Promise.resolve();
	});
}

describe('useFont (Octane-only contracts)', () => {
	it('preloads URL data once and refetches only after clear', async () => {
		const url = '/font.typeface.json';
		const fetchMock = vi.fn(async () => ({ json: async () => fontData }));
		vi.stubGlobal('fetch', fetchMock);
		useFont.preload(url);
		useFont.preload(url);
		await flush();
		expect(fetchMock).toHaveBeenCalledTimes(1);
		useFont.clear(url);
		useFont.preload(url);
		await flush();
		expect(fetchMock).toHaveBeenCalledTimes(2);
		useFont.clear(url);
	});
});
