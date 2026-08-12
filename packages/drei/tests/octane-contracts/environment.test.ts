import * as React from 'react';
import { act as reactThreeAct, createRoot as createReactThreeRoot } from '@react-three/fiber';
import { useEnvironment as reactUseEnvironment } from '@react-three/drei/core/useEnvironment.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { EXRLoader, RGBELoader } from 'three-stdlib';
import { useEnvironment, type EnvironmentLoaderProps } from '../../src/index.js';
import {
	DefaultEnvironmentBoundary,
	EnvironmentBoundary,
} from '../_fixtures/environment.three.tsrx';

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

describe('useEnvironment (Octane-only contracts)', () => {
	it('rejects unknown extensions and invalid presets', function () {
		expect(function () {
			useEnvironment.preload({ files: '/unknown.txt' });
		}).toThrow('Unrecognized file extension');
		expect(function () {
			useEnvironment.preload({ preset: 'invalid' as never });
		}).toThrow('Preset must be one of');
	});

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
});
