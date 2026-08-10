import * as React from 'react';
import { act as reactThreeAct, createRoot as createReactThreeRoot } from '@react-three/fiber';
import { useFont as reactUseFont } from '@react-three/drei/core/useFont.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import type { Font } from 'three-stdlib';
import { useFont, type FontData } from '../src/index.js';
import { FontBoundary } from './_fixtures/font.three.tsrx';

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

describe('useFont', () => {
	it('matches the pinned React Drei parser, suspension, cache, preload, and clear behavior', async () => {
		const reactFonts: Font[] = [];
		const octaneFonts: Font[] = [];
		function ReactFontReader() {
			const font = reactUseFont(fontData);
			reactFonts.push(font);
			return null;
		}
		const canvas = document.createElement('canvas');
		const reactRoot = createReactThreeRoot(canvas);
		await reactRoot.configure({
			gl: renderer(canvas),
			frameloop: 'never',
			dpr: 1,
			size: { width: 64, height: 64, top: 0, left: 0 },
		});
		await reactThreeAct(async () =>
			reactRoot.render(
				React.createElement(
					React.Suspense,
					{ fallback: null },
					React.createElement(ReactFontReader),
				),
			),
		);
		const octaneRoot = await createOctaneThree(FontBoundary, {
			font: fontData,
			onLoad: (font: Font) => octaneFonts.push(font),
		});
		await flush();

		expect(snapshot(octaneFonts.at(-1)!)).toEqual(snapshot(reactFonts.at(-1)!));
		const first = octaneFonts.at(-1);
		octaneRoot.update(FontBoundary, {
			font: fontData,
			onLoad: (font: Font) => octaneFonts.push(font),
		});
		expect(octaneFonts.at(-1)).toBe(first);
		expect(typeof useFont.preload).toBe(typeof reactUseFont.preload);
		expect(typeof useFont.clear).toBe(typeof reactUseFont.clear);

		octaneRoot.unmount();
		await reactThreeAct(async () => reactRoot.unmount());
	});
});
