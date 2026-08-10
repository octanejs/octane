import * as React from 'react';
import {
	act as reactThreeAct,
	advance as reactAdvance,
	createRoot as createReactThreeRoot,
	extend as extendReactThree,
	useThree as reactUseThree,
	type RootState,
} from '@react-three/fiber';
import { ContactShadows as ReactContactShadows } from '@react-three/drei/core/ContactShadows.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ContactShadowsScene } from './_fixtures/contact-shadows.three.tsrx';

function renderer(canvas: HTMLCanvasElement) {
	let target: THREE.WebGLRenderTarget | null = null;
	const renderCalls: Array<[THREE.Object3D, THREE.Camera]> = [];
	return {
		domElement: canvas,
		outputColorSpace: THREE.SRGBColorSpace,
		toneMapping: THREE.NoToneMapping,
		renderCalls,
		render(scene: THREE.Object3D, camera: THREE.Camera) {
			renderCalls.push([scene, camera]);
		},
		setPixelRatio() {},
		setSize() {},
		setRenderTarget(value: THREE.WebGLRenderTarget | null) {
			target = value;
		},
		getRenderTarget() {
			return target;
		},
		renderLists: { dispose() {} },
		forceContextLoss() {},
		dispose() {},
	} as unknown as THREE.WebGLRenderer & { renderCalls: Array<[THREE.Object3D, THREE.Camera]> };
}

function snapshot(group: THREE.Group) {
	const mesh = group.children.find((child) => (child as THREE.Mesh).isMesh) as THREE.Mesh;
	const camera = group.children.find(
		(child) => (child as THREE.OrthographicCamera).isOrthographicCamera,
	) as THREE.OrthographicCamera;
	const geometry = mesh.geometry as THREE.PlaneGeometry;
	const material = mesh.material as THREE.MeshBasicMaterial;
	return {
		rotation: group.rotation.toArray(),
		plane: [geometry.parameters.width, geometry.parameters.height],
		meshScale: mesh.scale.toArray(),
		order: mesh.renderOrder,
		camera: [camera.left, camera.right, camera.top, camera.bottom, camera.near, camera.far],
		opacity: material.opacity,
		depthWrite: material.depthWrite,
		mipmaps: material.map?.generateMipmaps,
	};
}

describe('ContactShadows', () => {
	it('matches React geometry, camera, material, finite rendering, blur passes, and scene restoration', async () => {
		extendReactThree(THREE as unknown as Record<string, new (...args: any[]) => any>);
		let reactGroup!: THREE.Group;
		const canvas = document.createElement('canvas');
		const gl = renderer(canvas);
		const root = createReactThreeRoot(canvas);
		let state!: RootState;
		function Capture() {
			state = reactUseThree();
			return null;
		}
		await root.configure({ gl, frameloop: 'never' });
		await reactThreeAct(async () =>
			root.render(
				React.createElement(
					React.Fragment,
					null,
					React.createElement(ReactContactShadows, {
						ref: (value: THREE.Group) => (reactGroup = value),
						scale: [4, 6],
						width: 2,
						height: 0.5,
						frames: 2,
						opacity: 0.7,
						blur: 1.5,
						near: 0.2,
						far: 12,
						resolution: 64,
						smooth: true,
						color: '#123456',
						depthWrite: true,
						renderOrder: 3,
						name: 'contact-shadows',
					}),
					React.createElement(Capture),
				),
			),
		);
		let octaneGroup!: THREE.Group;
		const octane = await createOctaneThree(ContactShadowsScene, {
			groupRef: (value: THREE.Group) => (octaneGroup = value),
			scale: [4, 6],
			width: 2,
			height: 0.5,
			frames: 2,
			opacity: 0.7,
			blur: 1.5,
			near: 0.2,
			far: 12,
			resolution: 64,
			smooth: true,
			color: '#123456',
			depthWrite: true,
			renderOrder: 3,
		});
		const background = new THREE.Color('white');
		state.scene.background = background;
		octane.scene.background = background;
		await reactThreeAct(async () => reactAdvance(0.1, true, state));
		await reactThreeAct(async () => reactAdvance(0.1, true, state));
		await reactThreeAct(async () => reactAdvance(0.1, true, state));
		octane.advanceFrames(3, 0.1);
		expect(snapshot(octaneGroup)).toEqual(snapshot(reactGroup));
		expect((octane.renderer as any).renderCalls).toHaveLength(gl.renderCalls.length);
		expect(octane.scene.background).toBe(background);
		expect(octane.scene.overrideMaterial).toBeNull();
		octaneGroup.visible = false;
		expect(snapshot(octaneGroup)).toEqual(snapshot(reactGroup));
		expect(octaneGroup.visible).not.toBe(reactGroup.visible);
		octane.unmount();
		await reactThreeAct(async () => root.unmount());
	});
});
