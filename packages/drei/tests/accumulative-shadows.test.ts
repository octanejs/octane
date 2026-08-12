import * as React from 'react';
import {
	act as reactThreeAct,
	createRoot as createReactThreeRoot,
	extend as extendReactThree,
	useThree as reactUseThree,
	type RootState,
} from '@react-three/fiber';
import {
	AccumulativeShadows as ReactAccumulativeShadows,
	RandomizedLight as ReactRandomizedLight,
} from '@react-three/drei/core/AccumulativeShadows.js';
import { createRoot as createOctaneRoot } from '@octanejs/three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { AccumulativeShadowsScene } from './_fixtures/accumulative-shadows.three.tsrx';

afterEach(() => vi.restoreAllMocks());

function renderer(canvas: HTMLCanvasElement) {
	let target: THREE.WebGLRenderTarget | null = null;
	let clearColor: THREE.ColorRepresentation = 'black';
	let clearAlpha = 0;
	const renderCalls: Array<[THREE.Scene, THREE.Camera]> = [];
	let clearCalls = 0;
	return {
		domElement: canvas,
		outputColorSpace: THREE.SRGBColorSpace,
		toneMapping: THREE.NoToneMapping,
		shadowMap: { enabled: false, type: THREE.PCFShadowMap },
		renderCalls,
		get clearCalls() {
			return clearCalls;
		},
		render(scene: THREE.Scene, camera: THREE.Camera) {
			renderCalls.push([scene, camera]);
		},
		clear() {
			clearCalls++;
		},
		setPixelRatio() {},
		setSize() {},
		setRenderTarget(value: THREE.WebGLRenderTarget | null) {
			target = value;
		},
		getRenderTarget() {
			return target;
		},
		getClearColor(value: THREE.Color) {
			return value.set(clearColor);
		},
		getClearAlpha() {
			return clearAlpha;
		},
		setClearColor(value: THREE.ColorRepresentation, alpha = 1) {
			clearColor = value;
			clearAlpha = alpha;
		},
		renderLists: { dispose() {} },
		forceContextLoss() {},
		dispose() {},
	} as unknown as THREE.WebGLRenderer & {
		renderCalls: Array<[THREE.Scene, THREE.Camera]>;
		clearCalls: number;
	};
}

function snapshot(scene: THREE.Scene, api: any, lightApi: any) {
	const root = scene.getObjectByName('accumulative') as THREE.Group;
	const lightGroup = scene.getObjectByName('randomized') as THREE.Group;
	const plane = root.children.find((child) => (child as THREE.Mesh).isMesh) as THREE.Mesh;
	const material = plane.material as THREE.ShaderMaterial & Record<string, any>;
	return {
		api: {
			temporal: api.temporal,
			frames: api.frames,
			blend: api.blend,
			count: api.count,
			lights: api.lights.size,
			mesh: api.getMesh() === plane,
		},
		lightApi: typeof lightApi.update,
		plane: {
			scale: plane.scale.toArray(),
			rotation: plane.rotation.toArray(),
			receiveShadow: plane.receiveShadow,
			opacity: material.opacity,
			alphaTest: material.alphaTest,
			color: material.color.getHexString(),
			blend: material.blend,
			map: Boolean(material.map?.isTexture),
		},
		lightsVisible: lightGroup.parent?.visible,
		lights: lightGroup.children.map((child) => {
			const light = child as THREE.DirectionalLight;
			const camera = light.shadow.camera as THREE.OrthographicCamera;
			return {
				position: light.position.toArray(),
				intensity: light.intensity,
				castShadow: light.castShadow,
				bias: light.shadow.bias,
				mapSize: light.shadow.mapSize.toArray(),
				camera: [camera.left, camera.right, camera.top, camera.bottom, camera.near, camera.far],
			};
		}),
	};
}

describe('AccumulativeShadows', () => {
	it('matches React progressive buffers, public APIs, randomized lights, material accumulation, and restoration', async () => {
		extendReactThree(THREE as unknown as Record<string, new (...args: any[]) => any>);
		const values = [0.1, 0.7, 0.3, 0.9, 0.2, 0.6, 0.4, 0.8];
		let randomIndex = 0;
		vi.spyOn(Math, 'random').mockImplementation(() => values[randomIndex++ % values.length]);
		let reactApi: any;
		let reactLightApi: any;
		const reactCanvas = document.createElement('canvas');
		const reactGl = renderer(reactCanvas);
		const reactRoot = createReactThreeRoot(reactCanvas);
		let reactState!: RootState;
		function Capture() {
			reactState = reactUseThree();
			return null;
		}
		await reactRoot.configure({ gl: reactGl, frameloop: 'never' });
		await reactThreeAct(async () =>
			reactRoot.render(
				React.createElement(
					React.Fragment,
					null,
					React.createElement(
						ReactAccumulativeShadows,
						{
							ref: (value: any) => (reactApi = value),
							frames: 3,
							blend: 9,
							temporal: false,
							opacity: 0.8,
							alphaTest: 0.6,
							color: '#123456',
							colorBlend: 1.5,
							resolution: 32,
							scale: 4,
							name: 'accumulative',
						},
						React.createElement(ReactRandomizedLight, {
							ref: (value: any) => (reactLightApi = value),
							amount: 3,
							position: [2, 4, 3],
							radius: 2,
							ambient: 0.25,
							intensity: 6,
							bias: 0.002,
							mapSize: 128,
							size: 7,
							near: 0.2,
							far: 80,
							name: 'randomized',
						}),
					),
					React.createElement(Capture),
				),
			),
		);
		randomIndex = 0;
		let octaneApi: any;
		let octaneLightApi: any;
		const octaneCanvas = document.createElement('canvas');
		const octaneGl = renderer(octaneCanvas);
		const octaneRoot = createOctaneRoot(octaneCanvas);
		await octaneRoot.configure({ gl: octaneGl as any, frameloop: 'never' });
		octaneRoot.render(AccumulativeShadowsScene, {
			apiRef: (value: any) => (octaneApi = value),
			lightApiRef: (value: any) => (octaneLightApi = value),
			frames: 3,
			blend: 9,
			temporal: false,
			opacity: 0.8,
			alphaTest: 0.6,
			color: '#123456',
			colorBlend: 1.5,
			resolution: 32,
			scale: 4,
			amount: 3,
		});
		for (let index = 0; index < 8; index++) await Promise.resolve();
		expect(snapshot(octaneRoot.store.getState().scene, octaneApi, octaneLightApi)).toEqual(
			snapshot(reactState.scene, reactApi, reactLightApi),
		);
		expect(octaneGl.renderCalls).toHaveLength(reactGl.renderCalls.length);
		expect(octaneGl.clearCalls).toBe(reactGl.clearCalls);
		octaneApi.getMesh().material.opacity = 0.1;
		expect(snapshot(octaneRoot.store.getState().scene, octaneApi, octaneLightApi)).not.toEqual(
			snapshot(reactState.scene, reactApi, reactLightApi),
		);
		octaneRoot.unmount();
		await reactThreeAct(async () => reactRoot.unmount());
	});
});
