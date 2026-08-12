import * as React from 'react';
import {
	act as reactThreeAct,
	createRoot as createReactThreeRoot,
	extend as extendReactThree,
} from '@react-three/fiber';
import { Effects as ReactEffects } from '@react-three/drei/core/Effects.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { EffectComposer, GammaCorrectionShader, ShaderPass } from 'three-stdlib';
import { EffectsScene } from './_fixtures/effects.three.tsrx';

beforeAll(() => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	extendReactThree(THREE as unknown as Record<string, new (...args: any[]) => any>);
});

function renderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
	return {
		domElement: canvas,
		outputColorSpace: THREE.SRGBColorSpace,
		toneMapping: THREE.NoToneMapping,
		render() {},
		setPixelRatio() {},
		setSize() {},
		setRenderTarget() {},
		getRenderTarget() {
			return null;
		},
		renderLists: { dispose() {} },
		forceContextLoss() {},
		dispose() {},
	} as unknown as THREE.WebGLRenderer;
}

function snapshot(composer: EffectComposer) {
	return {
		passes: composer.passes.map((pass) => pass.constructor.name),
		width: composer.renderTarget1.width,
		height: composer.renderTarget1.height,
		samples: composer.renderTarget1.samples,
		depthBuffer: composer.renderTarget1.depthBuffer,
		stencilBuffer: composer.renderTarget1.stencilBuffer,
		anisotropy: composer.renderTarget1.texture.anisotropy,
		type: composer.renderTarget1.texture.type,
		colorSpace: composer.renderTarget1.texture.colorSpace,
	};
}

async function reactEffects(props: Record<string, unknown>) {
	const canvas = document.createElement('canvas');
	const root = createReactThreeRoot(canvas);
	let composer!: EffectComposer;
	await root.configure({
		gl: renderer(canvas),
		frameloop: 'never',
		dpr: 1,
		size: { width: 320, height: 180, top: 0, left: 0 },
	});
	await reactThreeAct(async () =>
		root.render(
			React.createElement(ReactEffects, {
				...props,
				ref: (value: EffectComposer) => (composer = value),
			}),
		),
	);
	return { root, composer };
}

describe('Effects', () => {
	it('matches target configuration, default passes, sizing, and ref identity', async () => {
		const props = {
			multisamping: 4,
			type: THREE.UnsignedByteType,
			colorSpace: THREE.SRGBColorSpace,
			depthBuffer: false,
			stencilBuffer: true,
			anisotropy: 3,
			disableRender: true,
		};
		const react = await reactEffects(props);
		let octaneComposer!: EffectComposer;
		const octane = await createOctaneThree(
			EffectsScene,
			{
				...props,
				ref: (value: EffectComposer) => (octaneComposer = value),
				renderIndex: 1,
				disableGamma: false,
				disableRenderPass: false,
			},
			{ width: 320, height: 180 },
		);
		expect(snapshot(octaneComposer)).toEqual(snapshot(react.composer));
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
	});

	it('matches independently disabled built-in passes', async () => {
		const props = { disableRender: true, disableRenderPass: true, disableGamma: true };
		const react = await reactEffects(props);
		let octaneComposer!: EffectComposer;
		const octane = await createOctaneThree(
			EffectsScene,
			{
				...props,
				ref: (value: EffectComposer) => (octaneComposer = value),
				multisamping: 8,
				colorSpace: undefined,
				type: undefined,
				renderIndex: 1,
				depthBuffer: true,
				stencilBuffer: false,
				anisotropy: 1,
			},
			{ width: 320, height: 180 },
		);
		expect(snapshot(octaneComposer)).toEqual(snapshot(react.composer));
		expect(octaneComposer.passes).toEqual([]);
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
	});

	it('matches custom child pass ordering and attachment', async () => {
		const reactPass = new ShaderPass(GammaCorrectionShader);
		const octanePass = new ShaderPass(GammaCorrectionShader);
		const props = {
			disableRender: true,
			children: React.createElement('primitive', { object: reactPass }),
		};
		const react = await reactEffects(props);
		let octaneComposer!: EffectComposer;
		const octane = await createOctaneThree(
			EffectsScene,
			{
				ref: (value: EffectComposer) => (octaneComposer = value),
				pass: octanePass,
				multisamping: 8,
				colorSpace: undefined,
				type: undefined,
				renderIndex: 1,
				disableGamma: false,
				disableRenderPass: false,
				disableRender: true,
				depthBuffer: true,
				stencilBuffer: false,
				anisotropy: 1,
			},
			{ width: 320, height: 180 },
		);
		expect(snapshot(octaneComposer)).toEqual(snapshot(react.composer));
		expect(octaneComposer.passes[2]).toBe(octanePass);
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
	});
});
