import * as React from 'react';
import { act, createRoot, extend } from '@react-three/fiber';
import { createRoot as createOctaneRoot } from '@octanejs/three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

const mocks = vi.hoisted(() => ({
	preloadFont: vi.fn((_options: unknown, done: () => void) => done()),
	dispose: vi.fn(),
	sync: vi.fn((_done: () => void) => _done()),
}));

vi.mock('troika-three-text', async () => {
	const ThreeModule = await import('three');
	return {
		Text: class MockText extends ThreeModule.Mesh {
			text = '';
			font?: string;
			fontSize = 1;
			anchorX: string | number = 'center';
			anchorY: string | number = 'middle';
			sdfGlyphSize = 64;
			sync = mocks.sync;
			dispose = mocks.dispose;
		},
		preloadFont: mocks.preloadFont,
	};
});

import { Text as ReactText } from '@react-three/drei/core/Text.js';
import { TextScene } from './_fixtures/text.three.tsrx';

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

describe('Text', () => {
	beforeEach(() => vi.clearAllMocks());

	it('matches React text extraction, defaults, nested children, sync, and cleanup', async () => {
		extend(THREE as unknown as Record<string, new (...args: any[]) => any>);
		let reactText: any;
		const reactSync = vi.fn();
		const reactCanvas = document.createElement('canvas');
		const reactRoot = createRoot(reactCanvas);
		await reactRoot.configure({ gl: renderer(reactCanvas), frameloop: 'never' });
		await act(async () =>
			reactRoot.render(
				React.createElement(
					React.Suspense,
					{ fallback: null },
					React.createElement(
						ReactText,
						{
							ref: (value: any) => (reactText = value),
							font: '/font.woff',
							fontSize: 2,
							color: 'hotpink',
							onSync: reactSync,
						},
						'Hello 7',
						React.createElement('mesh', { name: 'nested-child' }),
					),
				),
			),
		);
		for (let index = 0; index < 8; index++) await Promise.resolve();

		let octaneText: any;
		const octaneSync = vi.fn();
		const octaneCanvas = document.createElement('canvas');
		const octaneRoot = createOctaneRoot(octaneCanvas);
		await octaneRoot.configure({ gl: renderer(octaneCanvas), frameloop: 'never' });
		octaneRoot.render(TextScene, {
			textRef: (value: any) => (octaneText = value),
			font: '/font.woff',
			fontSize: 2,
			color: 'hotpink',
			label: 'Hello 7',
			onSync: octaneSync,
		});
		for (let index = 0; index < 8; index++) await Promise.resolve();

		expect({
			text: octaneText.text,
			font: octaneText.font,
			fontSize: octaneText.fontSize,
			anchorX: octaneText.anchorX,
			anchorY: octaneText.anchorY,
			sdfGlyphSize: octaneText.sdfGlyphSize,
			children: octaneText.children.map((child: THREE.Object3D) => child.name),
		}).toEqual({
			text: reactText.text,
			font: reactText.font,
			fontSize: reactText.fontSize,
			anchorX: reactText.anchorX,
			anchorY: reactText.anchorY,
			sdfGlyphSize: reactText.sdfGlyphSize,
			children: reactText.children.map((child: THREE.Object3D) => child.name),
		});
		expect(octaneSync).toHaveBeenCalledWith(octaneText);
		expect(reactSync).toHaveBeenCalledWith(reactText);
		octaneText.text = 'mutated';
		expect(octaneText.text).not.toBe(reactText.text);
		octaneRoot.unmount();
		await act(async () => reactRoot.unmount());
		expect(mocks.dispose).toHaveBeenCalledTimes(2);
	});
});
