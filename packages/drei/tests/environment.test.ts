import * as React from 'react';
import { act as reactThreeAct, createRoot as createReactThreeRoot } from '@react-three/fiber';
import { useEnvironment as reactUseEnvironment } from '@react-three/drei/core/useEnvironment.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { EXRLoader, RGBELoader } from 'three-stdlib';
import { useEnvironment, type EnvironmentLoaderProps } from '../src/index.js';
import {
	DefaultEnvironmentBoundary,
	EnvironmentBoundary,
} from './_fixtures/environment.three.tsrx';

const originalCubeLoad = THREE.CubeTextureLoader.prototype.load;
const originalRgbeLoad = RGBELoader.prototype.load;
const originalExrLoad = EXRLoader.prototype.load;
const requests: Array<{ kind: string; input: string | string[]; path: string }> = [];

beforeAll(() => {
	THREE.CubeTextureLoader.prototype.load = function (files, onLoad) {
		requests.push({ kind: 'cube', input: [...files], path: this.path });
		const texture = new THREE.CubeTexture();
		texture.name = `cube:${this.path}${files.join('|')}`;
		onLoad?.(texture);
		return texture;
	};
	RGBELoader.prototype.load = function (url, onLoad) {
		requests.push({ kind: 'hdr', input: url, path: this.path });
		const texture = new THREE.DataTexture();
		texture.name = `hdr:${this.path}${url}`;
		onLoad?.(texture as never);
		return texture as never;
	};
	EXRLoader.prototype.load = function (url, onLoad) {
		requests.push({ kind: 'exr', input: url, path: this.path });
		const texture = new THREE.DataTexture();
		texture.name = `exr:${this.path}${url}`;
		onLoad?.(texture as never);
		return texture as never;
	};
});

afterAll(() => {
	THREE.CubeTextureLoader.prototype.load = originalCubeLoad;
	RGBELoader.prototype.load = originalRgbeLoad;
	EXRLoader.prototype.load = originalExrLoad;
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

async function flush() {
	await reactThreeAct(async () => {
		for (let index = 0; index < 8; index++) await Promise.resolve();
	});
}

function snapshot(texture: THREE.Texture) {
	return { name: texture.name, mapping: texture.mapping, colorSpace: texture.colorSpace };
}

describe('useEnvironment', () => {
	it('restores defaults after the compiler-injected trailing slot', async () => {
		const textures: THREE.Texture[] = [];
		const root = await createOctaneThree(DefaultEnvironmentBoundary, {
			onLoad: (texture: THREE.Texture) => textures.push(texture),
		});
		await flush();
		expect(textures.at(-1)).toBeInstanceOf(THREE.CubeTexture);
		root.unmount();
		useEnvironment.clear();
	});

	it.each([
		['cube', { files: ['/px', '/nx', '/py', '/ny', '/pz', '/nz'], path: '/cube/' }],
		['hdr', { files: '/studio.hdr', path: '/hdr/' }],
		['exr data URI', { files: 'data:application/exr;base64,AAAA' }],
		['preset', { preset: 'sunset' }],
	] as const)('matches the pinned React Drei oracle for %s', async (_name, options) => {
		const reactTextures: THREE.Texture[] = [];
		const octaneTextures: THREE.Texture[] = [];
		function ReactReader() {
			const texture = reactUseEnvironment(options as Partial<EnvironmentLoaderProps>);
			reactTextures.push(texture);
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
				React.createElement(React.Suspense, { fallback: null }, React.createElement(ReactReader)),
			),
		);
		const octaneRoot = await createOctaneThree(EnvironmentBoundary, {
			options,
			onLoad: (texture: THREE.Texture) => octaneTextures.push(texture),
		});
		await flush();

		expect(snapshot(octaneTextures.at(-1)!)).toEqual(snapshot(reactTextures.at(-1)!));

		octaneRoot.unmount();
		await reactThreeAct(async () => reactRoot.unmount());
		useEnvironment.clear(options as Partial<EnvironmentLoaderProps>);
		reactUseEnvironment.clear(options as Partial<EnvironmentLoaderProps>);
	});

	it('matches validation and static API behavior', () => {
		expect(() => useEnvironment.preload({ files: '/gainmap.jpg' })).toThrow(
			'Preloading gainmaps is not supported',
		);
		expect(() => reactUseEnvironment.preload({ files: '/gainmap.jpg' })).toThrow(
			'Preloading gainmaps is not supported',
		);
		expect(() => useEnvironment.preload({ files: '/unknown.txt' })).toThrow(
			'Unrecognized file extension',
		);
		expect(() => useEnvironment.preload({ preset: 'invalid' as never })).toThrow(
			'Preset must be one of',
		);
		expect(typeof useEnvironment.preload).toBe(typeof reactUseEnvironment.preload);
		expect(typeof useEnvironment.clear).toBe(typeof reactUseEnvironment.clear);
	});
});
