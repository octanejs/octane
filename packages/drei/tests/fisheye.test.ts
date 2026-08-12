import * as React from 'react';
import {
	act as reactThreeAct,
	advance as reactAdvance,
	createRoot as createReactThreeRoot,
	extend as extendReactThree,
	useThree as reactUseThree,
	type RootState,
} from '@react-three/fiber';
import { Fisheye as ReactFisheye } from '@react-three/drei/core/Fisheye.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FisheyeScene } from './_fixtures/fisheye.three.tsrx';

const originalUpdate = THREE.CubeCamera.prototype.update;
beforeAll(() => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	extendReactThree(THREE as unknown as Record<string, new (...args: any[]) => any>);
	THREE.CubeCamera.prototype.update = function () {};
});
afterAll(() => {
	THREE.CubeCamera.prototype.update = originalUpdate;
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

function snapshot(mesh: THREE.Mesh, child: THREE.Group) {
	const geometry = mesh.geometry as THREE.SphereGeometry;
	const material = mesh.material as THREE.MeshBasicMaterial;
	const cubeCamera = mesh.children.find((object) => object.type === 'CubeCamera') as
		THREE.CubeCamera | undefined;
	return {
		name: mesh.name,
		scale: mesh.scale.toArray(),
		segments: [
			(geometry.parameters as any).widthSegments,
			(geometry.parameters as any).heightSegments,
		],
		envMap: Boolean(material.envMap?.isCubeTexture),
		cubeResolution:
			(material.envMap as any)?.image?.[0]?.width ??
			(material.envMap as any)?.source?.data?.[0]?.width,
		childInPortal: child.parent?.isScene,
		cubePosition: cubeCamera?.position.toArray(),
	};
}

describe('Fisheye', () => {
	it('matches React radius, sphere segments, cube texture projection, portal ownership, and camera synchronization', async () => {
		let reactMesh!: THREE.Mesh;
		let reactChild!: THREE.Group;
		const canvas = document.createElement('canvas');
		const root = createReactThreeRoot(canvas);
		let state!: RootState;
		function Capture() {
			state = reactUseThree();
			return null;
		}
		await root.configure({
			gl: renderer(canvas),
			frameloop: 'never',
			size: { width: 120, height: 80, top: 0, left: 0 },
			dpr: 1,
		});
		await reactThreeAct(async () =>
			root.render(
				React.createElement(
					React.Fragment,
					null,
					React.createElement(
						ReactFisheye,
						{
							ref: (value: THREE.Mesh) => (reactMesh = value),
							zoom: 0.4,
							segments: 12,
							resolution: 32,
							renderPriority: 1,
							name: 'fisheye',
						},
						React.createElement('group', {
							ref: (value: THREE.Group) => (reactChild = value),
							name: 'fisheye-child',
						}),
					),
					React.createElement(Capture),
				),
			),
		);
		let octaneMesh!: THREE.Mesh;
		let octaneChild!: THREE.Group;
		const octane = await createOctaneThree(
			FisheyeScene,
			{
				meshRef: (value: THREE.Mesh) => (octaneMesh = value),
				childRef: (value: THREE.Group) => (octaneChild = value),
				zoom: 0.4,
				segments: 12,
				resolution: 32,
				renderPriority: 1,
			},
			{ width: 120, height: 80 },
		);
		state.camera.position.set(2, 3, 4);
		state.camera.updateMatrixWorld();
		octane.store.getState().camera.position.set(2, 3, 4);
		octane.store.getState().camera.updateMatrixWorld();
		await reactThreeAct(async () => reactAdvance(0.1, true, state));
		octane.advanceFrames(1, 0.1);
		expect(snapshot(octaneMesh, octaneChild)).toEqual(snapshot(reactMesh, reactChild));
		octaneMesh.scale.x += 1;
		expect(snapshot(octaneMesh, octaneChild)).not.toEqual(snapshot(reactMesh, reactChild));
		octane.unmount();
		await reactThreeAct(async () => root.unmount());
	});
});
