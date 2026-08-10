import * as React from 'react';
import {
	act as reactThreeAct,
	createRoot as createReactThreeRoot,
	extend as extendReactThree,
} from '@react-three/fiber';
import { Text3D as ReactText3D } from '@react-three/drei/core/Text3D.js';
import { useFont as reactUseFont } from '@react-three/drei/core/useFont.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { useFont, type FontData } from '../src/index.js';
import { Text3DScene } from './_fixtures/text3d.three.tsrx';

const font: FontData = {
	boundingBox: { yMax: 900, yMin: -200 },
	familyName: 'Parity Sans',
	glyphs: {
		O: { _cachedOutline: [], ha: 700, o: 'm 0 0 l 0 700 l 500 700 l 500 0' },
		c: { _cachedOutline: [], ha: 500, o: 'm 500 0 l 0 0 l 0 500 l 500 500' },
		t: { _cachedOutline: [], ha: 400, o: 'm 200 0 l 200 700' },
		a: { _cachedOutline: [], ha: 500, o: 'm 0 0 l 500 0 l 500 500 l 0 500' },
		n: { _cachedOutline: [], ha: 500, o: 'm 0 0 l 0 500 l 500 500 l 500 0' },
		e: { _cachedOutline: [], ha: 500, o: 'm 0 0 l 500 0 l 500 500 l 0 500' },
		'7': { _cachedOutline: [], ha: 500, o: 'm 0 700 l 500 700 l 200 0' },
		'?': { _cachedOutline: [], ha: 500, o: 'm 0 0 l 500 500' },
	},
	resolution: 1000,
	underlineThickness: 50,
};

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

async function flush() {
	await reactThreeAct(async () => {
		for (let index = 0; index < 8; index++) await Promise.resolve();
	});
}

function snapshot(mesh: THREE.Mesh) {
	const geometry = mesh.geometry as THREE.BufferGeometry & {
		parameters?: { text?: string; options?: Record<string, unknown> };
	};
	return {
		name: mesh.name,
		text: geometry.parameters?.text,
		material: (mesh.material as THREE.Material).type,
		positionCount: geometry.getAttribute('position').count,
		boundingBox: geometry.boundingBox?.toArray(),
	};
}

describe('Text3D', () => {
	it('matches the pinned React component for text extraction, geometry options, material children, smoothing, and refs', async () => {
		extendReactThree(THREE as unknown as Record<string, new (...args: any[]) => any>);
		let reactMesh!: THREE.Mesh;
		const canvas = document.createElement('canvas');
		const reactRoot = createReactThreeRoot(canvas);
		await reactRoot.configure({ gl: renderer(canvas), frameloop: 'never' });
		await reactThreeAct(async () =>
			reactRoot.render(
				React.createElement(
					React.Suspense,
					{ fallback: null },
					React.createElement(
						ReactText3D,
						{
							ref: (value: THREE.Mesh) => (reactMesh = value),
							font,
							size: 1.25,
							height: 0.3,
							bevelEnabled: true,
							bevelSize: 0.025,
							letterSpacing: 0.1,
							lineHeight: 1.2,
							smooth: 0.001,
							name: 'text',
						},
						'Octane',
						7,
						React.createElement('meshBasicMaterial', { color: 'hotpink' }),
					),
				),
			),
		);
		let octaneMesh!: THREE.Mesh;
		const octaneRoot = await createOctaneThree(Text3DScene, {
			meshRef: (value: THREE.Mesh) => (octaneMesh = value),
			font,
			size: 1.25,
			height: 0.3,
			bevelEnabled: true,
			bevelSize: 0.025,
			letterSpacing: 0.1,
			lineHeight: 1.2,
			smooth: 0.001,
		});
		await flush();
		expect(snapshot(octaneMesh)).toEqual(snapshot(reactMesh));
		const octaneParameters = (octaneMesh.geometry as any).parameters;
		const originalText = octaneParameters.text;
		octaneParameters.text = 'parity-negative-control';
		expect(snapshot(octaneMesh)).not.toEqual(snapshot(reactMesh));
		octaneParameters.text = originalText;
		octaneRoot.unmount();
		await reactThreeAct(async () => reactRoot.unmount());
		useFont.clear(font);
		reactUseFont.clear(font);
	});
});
