import * as React from 'react';
import {
	act as reactThreeAct,
	createRoot as createReactThreeRoot,
	extend as extendReactThree,
	flushGlobalEffects as flushReactEffects,
	useThree as reactUseThree,
	type RootState as ReactRootState,
} from '@react-three/fiber';
import { useCamera as reactUseCamera } from '@react-three/drei/core/useCamera.js';
import { useIntersect as reactUseIntersect } from '@react-three/drei/core/useIntersect.js';
import { flushGlobalEffects as flushOctaneEffects } from '@octanejs/three';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CameraHookScene, IntersectHookScene } from './_fixtures/hooks.three.tsrx';

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
		renderLists: { dispose() {} },
		forceContextLoss() {},
		dispose() {},
	} as unknown as THREE.WebGLRenderer;
}

async function reactRoot(Component: React.ComponentType) {
	const canvas = document.createElement('canvas');
	const root = createReactThreeRoot(canvas);
	let get!: () => ReactRootState;
	function Capture() {
		get = reactUseThree((state) => state.get);
		return React.createElement(Component);
	}
	await root.configure({
		gl: renderer(canvas),
		frameloop: 'never',
		dpr: 1,
		size: { width: 400, height: 200, top: 0, left: 0 },
	});
	await reactThreeAct(async () => root.render(React.createElement(Capture)));
	return { root, getState: () => get() };
}

describe('camera and intersection hooks', () => {
	it('matches useCamera ray construction and configured raycaster properties', async () => {
		const camera = new THREE.PerspectiveCamera(60, 2, 0.1, 100);
		camera.position.set(2, 3, 4);
		camera.lookAt(0, 0, 0);
		camera.updateMatrixWorld();
		let reactRaycast!: THREE.Object3D['raycast'];
		function ReactCameraHook() {
			reactRaycast = reactUseCamera(camera, { near: 1.25, far: 40 });
			return null;
		}
		const react = await reactRoot(ReactCameraHook);
		let octaneRaycast!: THREE.Object3D['raycast'];
		const octane = await createOctaneThree(CameraHookScene, {
			camera,
			raycasterProps: { near: 1.25, far: 40 },
			onValue: (value: THREE.Object3D['raycast']) => (octaneRaycast = value),
		});
		const snapshot = (raycast: THREE.Object3D['raycast']) => {
			let ray!: THREE.Ray;
			class Probe extends THREE.Object3D {
				override raycast(raycaster: THREE.Raycaster) {
					ray = raycaster.ray.clone();
					expect(raycaster.near).toBe(1.25);
					expect(raycaster.far).toBe(40);
				}
			}
			const probe = new Probe();
			raycast.call(probe, new THREE.Raycaster(), []);
			return { origin: ray.origin.toArray(), direction: ray.direction.toArray() };
		};
		expect(snapshot(octaneRaycast)).toEqual(snapshot(reactRaycast));
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
	});

	it('matches useIntersect visibility transitions and restores onBeforeRender', async () => {
		const reactChanges: boolean[] = [];
		let reactObject: THREE.Mesh | null = null;
		const original = () => undefined;
		function ReactIntersectHook() {
			const ref = reactUseIntersect<THREE.Mesh>((visible) => reactChanges.push(visible));
			return React.createElement('mesh', {
				ref: (value: THREE.Mesh | null) => {
					if (value) value.onBeforeRender = original;
					ref.current = value!;
					reactObject = value;
				},
			});
		}
		const react = await reactRoot(ReactIntersectHook);
		const octaneChanges: boolean[] = [];
		const octane = await createOctaneThree(IntersectHookScene, {
			onChange: (visible: boolean) => octaneChanges.push(visible),
		});
		const octaneObject = octane.scene.children[0] as THREE.Mesh;
		flushReactEffects('before', 0);
		reactObject!.onBeforeRender(null!, null!, null!, null!, null!, null!);
		flushReactEffects('after', 0);
		flushOctaneEffects('before', 0);
		octaneObject.onBeforeRender(null!, null!, null!, null!, null!, null!);
		flushOctaneEffects('after', 0);
		expect(octaneChanges).toEqual(reactChanges);
		flushReactEffects('before', 1);
		flushReactEffects('after', 1);
		flushOctaneEffects('before', 1);
		flushOctaneEffects('after', 1);
		expect(octaneChanges).toEqual(reactChanges);
		expect(octaneChanges).toEqual([true, false]);
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
		expect(reactObject).toBeNull();
	});
});
