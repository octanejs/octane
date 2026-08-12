import * as React from 'react';
import {
	act as reactThreeAct,
	advance as reactAdvance,
	createRoot as createReactThreeRoot,
	extend as extendReactThree,
	type RootState as ReactRootState,
	useThree as reactUseThree,
} from '@react-three/fiber';
import {
	Environment as ReactEnvironment,
	EnvironmentCube as ReactEnvironmentCube,
	EnvironmentMap as ReactEnvironmentMap,
	EnvironmentPortal as ReactEnvironmentPortal,
} from '@react-three/drei/core/Environment.js';
import { useEnvironment as reactUseEnvironment } from '@react-three/drei/core/useEnvironment.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { useEnvironment } from '../src/index.js';
import {
	EnvironmentCubeScene,
	EnvironmentGroundScene,
	EnvironmentMapRouteScene,
	EnvironmentMapScene,
	EnvironmentPortalScene,
} from './_fixtures/environment-components.three.tsrx';

const originalCubeLoad = THREE.CubeTextureLoader.prototype.load;
const originalCubeUpdate = THREE.CubeCamera.prototype.update;
const cubeUpdates: Array<{ camera: THREE.CubeCamera; scene: THREE.Scene }> = [];

beforeAll(() => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	extendReactThree(THREE as unknown as Record<string, new (...args: any[]) => any>);
	THREE.CubeTextureLoader.prototype.load = function (files, onLoad) {
		const texture = new THREE.CubeTexture();
		texture.name = `cube:${this.path}${files.join('|')}`;
		onLoad?.(texture);
		return texture;
	};
	THREE.CubeCamera.prototype.update = function (_renderer, scene) {
		cubeUpdates.push({ camera: this, scene });
	};
});

afterAll(() => {
	THREE.CubeTextureLoader.prototype.load = originalCubeLoad;
	THREE.CubeCamera.prototype.update = originalCubeUpdate;
});

function renderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
	return {
		domElement: canvas,
		outputColorSpace: THREE.SRGBColorSpace,
		toneMapping: THREE.NoToneMapping,
		autoClear: false,
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

async function flush() {
	await reactThreeAct(async () => {
		for (let index = 0; index < 8; index++) await Promise.resolve();
	});
}

async function reactRoot(element: React.ReactNode) {
	const canvas = document.createElement('canvas');
	const root = createReactThreeRoot(canvas);
	let getState!: () => ReactRootState;
	function Capture() {
		getState = reactUseThree((state) => state.get);
		return null;
	}
	await root.configure({ gl: renderer(canvas), frameloop: 'never' });
	await reactThreeAct(async () =>
		root.render(React.createElement(React.Fragment, null, element, React.createElement(Capture))),
	);
	await flush();
	return { root, getState };
}

function sceneSnapshot(scene: THREE.Scene) {
	return {
		background: (scene.background as THREE.Texture | null)?.name ?? scene.background,
		environment: scene.environment?.name ?? null,
		backgroundBlurriness: scene.backgroundBlurriness,
		backgroundIntensity: scene.backgroundIntensity,
		backgroundRotation: scene.backgroundRotation.toArray(),
		environmentIntensity: scene.environmentIntensity,
		environmentRotation: scene.environmentRotation.toArray(),
	};
}

describe('Environment components', () => {
	it.each([false, true, 'only'] as const)(
		'matches EnvironmentMap assignment and cleanup for background=%s',
		async (background) => {
			const reactMap = new THREE.Texture();
			reactMap.name = 'map';
			const octaneMap = reactMap.clone();
			octaneMap.name = 'map';
			const reactTarget = new THREE.Scene();
			const octaneTarget = new THREE.Scene();
			const reactOldBackground = new THREE.Texture();
			const reactOldEnvironment = new THREE.Texture();
			const octaneOldBackground = reactOldBackground.clone();
			const octaneOldEnvironment = reactOldEnvironment.clone();
			reactTarget.background = reactOldBackground;
			reactTarget.environment = reactOldEnvironment;
			octaneTarget.background = octaneOldBackground;
			octaneTarget.environment = octaneOldEnvironment;
			const config = {
				backgroundBlurriness: 0.35,
				backgroundIntensity: 0.75,
				backgroundRotation: new THREE.Euler(0.1, 0.2, 0.3),
				environmentIntensity: 1.4,
				environmentRotation: new THREE.Euler(0.4, 0.5, 0.6),
			};
			const react = await reactRoot(
				React.createElement(ReactEnvironmentMap, {
					map: reactMap,
					background,
					scene: { current: reactTarget },
					...config,
				}),
			);
			const octane = await createOctaneThree(EnvironmentMapScene, {
				map: octaneMap,
				background,
				targetScene: { current: octaneTarget },
				...config,
			});
			expect(sceneSnapshot(octaneTarget)).toEqual(sceneSnapshot(reactTarget));
			octane.unmount();
			await reactThreeAct(async () => react.root.unmount());
			expect(octaneTarget.background).toBe(octaneOldBackground);
			expect(octaneTarget.environment).toBe(octaneOldEnvironment);
		},
	);

	it('matches EnvironmentCube loading, blur aliasing, scene props, disposal, and restoration', async () => {
		const files = ['/px', '/nx', '/py', '/ny', '/pz', '/nz'];
		const react = await reactRoot(
			React.createElement(
				React.Suspense,
				{ fallback: null },
				React.createElement(ReactEnvironmentCube, {
					files,
					path: '/env/',
					background: true,
					blur: 0.45,
					environmentIntensity: 1.6,
				}),
			),
		);
		const octane = await createOctaneThree(EnvironmentCubeScene, {
			files,
			path: '/env/',
			background: true,
			blur: 0.45,
			environmentIntensity: 1.6,
		});
		await flush();
		expect(sceneSnapshot(octane.scene)).toEqual(sceneSnapshot(react.getState().scene));
		const texture = octane.scene.environment!;
		const dispose = vi.spyOn(texture, 'dispose');
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
		expect(dispose).toHaveBeenCalledOnce();
		useEnvironment.clear({ files });
		reactUseEnvironment.clear({ files });
	});

	it('matches EnvironmentPortal virtual scene ownership, cube camera options, frame budget, and map installation', async () => {
		cubeUpdates.splice(0);
		const reactMap = new THREE.Texture();
		const octaneMap = new THREE.Texture();
		let reactChild!: THREE.Group;
		let octaneChild!: THREE.Group;
		const react = await reactRoot(
			React.createElement(
				ReactEnvironmentPortal,
				{ map: reactMap, background: 'only', frames: 3, near: 0.25, far: 80, resolution: 32 },
				React.createElement('group', {
					ref: (value: THREE.Group) => (reactChild = value),
					name: 'portal-child',
					position: [1, 2, 3],
				}),
			),
		);
		const octane = await createOctaneThree(EnvironmentPortalScene, {
			map: octaneMap,
			background: 'only',
			frames: 3,
			near: 0.25,
			far: 80,
			resolution: 32,
			childRef: (value: THREE.Group) => (octaneChild = value),
		});
		await reactThreeAct(async () => reactAdvance(0.1, true, react.getState()));
		await reactThreeAct(async () => reactAdvance(0.1, true, react.getState()));
		const reactUpdates = cubeUpdates.splice(0);
		octane.advanceFrames(2, 0.1);
		const octaneUpdates = cubeUpdates.splice(0);
		expect(octaneUpdates).toHaveLength(reactUpdates.length);
		expect(octaneChild.parent?.isScene).toBe(reactChild.parent?.isScene);
		expect(octaneChild.position.toArray()).toEqual(reactChild.position.toArray());
		const octaneCamera = octaneChild.parent!.children.find(
			(object) => object.type === 'CubeCamera',
		) as THREE.CubeCamera;
		const reactCamera = reactChild.parent!.children.find(
			(object) => object.type === 'CubeCamera',
		) as THREE.CubeCamera;
		const cameraPlanes = (camera: THREE.CubeCamera) =>
			camera.children.map((child) => ({
				near: (child as THREE.PerspectiveCamera).near,
				far: (child as THREE.PerspectiveCamera).far,
			}));
		expect(cameraPlanes(octaneCamera)).toEqual(cameraPlanes(reactCamera));
		expect(octane.scene.background).toBeTruthy();
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
		expect(octane.scene.background).toBeNull();
	});

	it('routes Environment map and ground modes and matches ground projection configuration', async () => {
		const map = new THREE.Texture();
		const mapRoot = await createOctaneThree(EnvironmentMapRouteScene, { map, background: false });
		for (let index = 0; index < 4; index++) await Promise.resolve();
		expect(mapRoot.scene.environment).toBe(map);
		mapRoot.unmount();

		const files = ['/gx', '/gnx', '/gy', '/gny', '/gz', '/gnz'];
		const react = await reactRoot(
			React.createElement(
				React.Suspense,
				{ fallback: null },
				React.createElement(ReactEnvironment, {
					files,
					ground: { height: 7, radius: 12, scale: 250 },
				}),
			),
		);
		const octane = await createOctaneThree(EnvironmentGroundScene, {
			files,
			ground: { height: 7, radius: 12, scale: 250 },
		});
		await flush();
		const octaneGround = octane.scene.children.find(
			(object) => object instanceof THREE.Mesh,
		) as any;
		const reactGround = react
			.getState()
			.scene.children.find((object) => object instanceof THREE.Mesh) as any;
		expect({
			height: octaneGround.height,
			radius: octaneGround.radius,
			scale: octaneGround.scale.toArray(),
		}).toEqual({
			height: reactGround.height,
			radius: reactGround.radius,
			scale: reactGround.scale.toArray(),
		});
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
		useEnvironment.clear({ files });
		reactUseEnvironment.clear({ files });
	});
});
