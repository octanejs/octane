import * as React from 'react';
import {
	act as reactThreeAct,
	createRoot as createReactThreeRoot,
	extend as extendReactThree,
	useThree as reactUseThree,
	type RootState,
} from '@react-three/fiber';
import { Stage as ReactStage } from '@react-three/drei/core/Stage.js';
import { createRoot as createOctaneRoot } from '@octanejs/three';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { StageScene } from './_fixtures/stage.three.tsrx';

function renderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
	let clearColor: THREE.ColorRepresentation = 'black';
	let clearAlpha = 0;
	return {
		domElement: canvas,
		outputColorSpace: THREE.SRGBColorSpace,
		toneMapping: THREE.NoToneMapping,
		shadowMap: { enabled: false, type: THREE.PCFShadowMap },
		render() {},
		clear() {},
		setRenderTarget() {},
		getRenderTarget() {
			return null;
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

function snapshot(scene: THREE.Scene) {
	const ambient = scene.children.find(
		(child) => (child as THREE.AmbientLight).isAmbientLight,
	) as THREE.AmbientLight;
	const spot = scene.children.find(
		(child) => (child as THREE.SpotLight).isSpotLight,
	) as THREE.SpotLight;
	const point = scene.children.find(
		(child) => (child as THREE.PointLight).isPointLight,
	) as THREE.PointLight;
	const model = scene.getObjectByName('model') as THREE.Mesh;
	const shadowGroup = (scene.getObjectByName('stage-shadows') ??
		scene.children.find(
			(child) => child.type === 'Group' && child.children.length === 0,
		)) as THREE.Group;
	return {
		ambient: ambient.intensity,
		spot: {
			intensity: spot.intensity,
			position: spot.position.toArray(),
			castShadow: spot.castShadow,
			bias: spot.shadow.bias,
			normalBias: spot.shadow.normalBias,
			mapSize: spot.shadow.mapSize.toArray(),
		},
		point: { intensity: point.intensity, position: point.position.toArray() },
		modelPosition: model.position.toArray(),
		shadowPosition: shadowGroup.position.toArray(),
		shadowChildren: shadowGroup.children.map((child) => child.type),
	};
}

describe('Stage', () => {
	it.each(['rembrandt', 'portrait', 'soft'] as const)(
		'matches React lighting, centering, bounds, and disabled shadow/environment routing for %s',
		async (preset) => {
			extendReactThree(THREE as unknown as Record<string, new (...args: any[]) => any>);
			const canvas = document.createElement('canvas');
			const root = createReactThreeRoot(canvas);
			let state!: RootState;
			function Capture() {
				state = reactUseThree();
				return null;
			}
			await root.configure({ gl: renderer(canvas), frameloop: 'never' });
			await reactThreeAct(async () =>
				root.render(
					React.createElement(
						React.Fragment,
						null,
						React.createElement(
							ReactStage,
							{
								preset,
								shadows: false,
								adjustCamera: false,
								environment: null,
								intensity: 0.6,
								name: 'stage-bounds',
							},
							React.createElement(
								'mesh',
								{ name: 'model', position: [1, 2, 3] },
								React.createElement('boxGeometry', { args: [2, 4, 6] }),
								React.createElement('meshBasicMaterial'),
							),
						),
						React.createElement(Capture),
					),
				),
			);
			const octane = await createOctaneThree(StageScene, {
				preset,
				shadows: false,
				intensity: 0.6,
			});
			await flush();
			expect(snapshot(octane.scene)).toEqual(snapshot(state.scene));
			(
				octane.scene.children.find(
					(child) => (child as THREE.AmbientLight).isAmbientLight,
				) as THREE.AmbientLight
			).intensity += 1;
			expect(snapshot(octane.scene)).not.toEqual(snapshot(state.scene));
			octane.unmount();
			await reactThreeAct(async () => root.unmount());
		},
	);

	it.each(['contact', 'accumulative'] as const)(
		'matches React %s shadow routing and generated light/plane structure',
		async (shadows) => {
			extendReactThree(THREE as unknown as Record<string, new (...args: any[]) => any>);
			const reactCanvas = document.createElement('canvas');
			const reactRoot = createReactThreeRoot(reactCanvas);
			let reactState!: RootState;
			function Capture() {
				reactState = reactUseThree();
				return null;
			}
			await reactRoot.configure({ gl: renderer(reactCanvas), frameloop: 'never' });
			await reactThreeAct(async () =>
				reactRoot.render(
					React.createElement(
						React.Fragment,
						null,
						React.createElement(
							ReactStage,
							{
								preset: 'rembrandt',
								shadows,
								adjustCamera: false,
								environment: null,
								intensity: 0.6,
							},
							React.createElement(
								'mesh',
								{ name: 'model', position: [1, 2, 3] },
								React.createElement('boxGeometry', { args: [2, 4, 6] }),
								React.createElement('meshBasicMaterial'),
							),
						),
						React.createElement(Capture),
					),
				),
			);
			const octaneCanvas = document.createElement('canvas');
			const octaneRoot = createOctaneRoot(octaneCanvas);
			await octaneRoot.configure({ gl: renderer(octaneCanvas), frameloop: 'never' });
			octaneRoot.render(StageScene, { preset: 'rembrandt', shadows, intensity: 0.6 });
			for (let index = 0; index < 8; index++) await Promise.resolve();
			const structure = (scene: THREE.Scene) => {
				let groups = 0;
				let meshes = 0;
				let directional = 0;
				let orthographic = 0;
				scene.traverse((object) => {
					if ((object as THREE.Group).isGroup) groups++;
					if ((object as THREE.Mesh).isMesh) meshes++;
					if ((object as THREE.DirectionalLight).isDirectionalLight) directional++;
					if ((object as THREE.OrthographicCamera).isOrthographicCamera) orthographic++;
				});
				return { groups, meshes, directional, orthographic };
			};
			expect(structure(octaneRoot.store.getState().scene)).toEqual(structure(reactState.scene));
			octaneRoot.store.getState().scene.add(new THREE.Group());
			expect(structure(octaneRoot.store.getState().scene)).not.toEqual(structure(reactState.scene));
			octaneRoot.unmount();
			await reactThreeAct(async () => reactRoot.unmount());
		},
	);
});
