import * as React from 'react';
import {
	act as reactThreeAct,
	advance as reactAdvance,
	createRoot as createReactThreeRoot,
	extend as extendReactThree,
	useThree as reactUseThree,
	type RootState as ReactRootState,
} from '@react-three/fiber';
import { Backdrop as ReactBackdrop } from '@react-three/drei/core/Backdrop.js';
import { BBAnchor as ReactBBAnchor } from '@react-three/drei/core/BBAnchor.js';
import { Billboard as ReactBillboard } from '@react-three/drei/core/Billboard.js';
import { Float as ReactFloat } from '@react-three/drei/core/Float.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
	BackdropScene,
	BBAnchorScene,
	BillboardScene,
	FloatScene,
} from './_fixtures/scene-motion.three.tsrx';

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

async function reactRoot(element: React.ReactNode) {
	const canvas = document.createElement('canvas');
	const root = createReactThreeRoot(canvas);
	let get!: () => ReactRootState;
	function Capture() {
		get = reactUseThree((state) => state.get);
		return element;
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

describe('scene motion helpers', () => {
	it('matches Billboard camera tracking and locked axes', async () => {
		let reactGroup: THREE.Group | null = null;
		const react = await reactRoot(
			React.createElement(
				ReactBillboard,
				{
					lockX: true,
					ref: (value: THREE.Group | null) => (reactGroup = value),
				},
				React.createElement('group', { name: 'content', rotation: [0.2, 0.3, 0.4] }),
			),
		);
		let octaneGroup: THREE.Group | null = null;
		const octane = await createOctaneThree(BillboardScene, {
			follow: true,
			lockX: true,
			lockY: false,
			lockZ: false,
			groupRef: (value: THREE.Group | null) => (octaneGroup = value),
		});
		for (const state of [react.getState(), octane.store.getState()]) {
			state.camera.position.set(4, 3, 2);
			state.camera.lookAt(0, 0, 0);
			state.camera.updateMatrixWorld();
		}
		reactAdvance(1000, true, react.getState());
		octane.advanceFrames(1);
		const rotation = (group: THREE.Group) => group.children[0].rotation.toArray();
		expect(rotation(octaneGroup!)).toEqual(rotation(reactGroup!));
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
	});

	it('matches deterministic Float transforms and invalidation', async () => {
		let reactGroup: THREE.Group | null = null;
		const props = {
			speed: 2,
			rotationIntensity: 1.5,
			floatIntensity: 2,
			floatingRange: [-0.5, 0.75] as [number, number],
			autoInvalidate: true,
		};
		const react = await reactRoot(
			React.createElement(
				ReactFloat,
				{ ...props, ref: (value: THREE.Group | null) => (reactGroup = value) },
				React.createElement('group', { name: 'content' }),
			),
		);
		let octaneGroup: THREE.Group | null = null;
		const octane = await createOctaneThree(FloatScene, {
			...props,
			enabled: true,
			groupRef: (value: THREE.Group | null) => (octaneGroup = value),
		});
		react.getState().clock.stop();
		octane.store.getState().clock.stop();
		react.getState().clock.elapsedTime = 1.25;
		octane.store.getState().clock.elapsedTime = 1.25;
		reactAdvance(1000, true, react.getState());
		octane.advanceFrames(1);
		const invariantSnapshot = (group: THREE.Group) => {
			const cosine = (group.rotation.x * 8) / props.rotationIntensity;
			const sine = (group.rotation.y * 8) / props.rotationIntensity;
			const expectedY =
				THREE.MathUtils.mapLinear(
					sine / 10,
					-0.1,
					0.1,
					props.floatingRange[0],
					props.floatingRange[1],
				) * props.floatIntensity;
			return {
				matrixAutoUpdate: group.matrixAutoUpdate,
				childName: group.children[0].name,
				unitCircle: Math.abs(cosine * cosine + sine * sine - 1) < 1e-10,
				zUsesSamePhase: Math.abs(group.rotation.z - group.rotation.y * 0.4) < 1e-10,
				positionUsesSamePhase: Math.abs(group.position.y - expectedY) < 1e-10,
				matrixCurrent: new THREE.Matrix4()
					.compose(group.position, group.quaternion, group.scale)
					.equals(group.matrix),
			};
		};
		// Float intentionally seeds each instance with Math.random. Compare the
		// phase-independent behavioral invariants rather than expecting identical
		// random offsets from two independently mounted renderers.
		expect(invariantSnapshot(octaneGroup!)).toEqual(invariantSnapshot(reactGroup!));
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
	});

	it('matches Backdrop geometry deformation and normals', async () => {
		const react = await reactRoot(
			React.createElement(
				ReactBackdrop,
				{ floor: 0.4, segments: 4, receiveShadow: true, name: 'backdrop' },
				React.createElement('meshBasicMaterial'),
			),
		);
		const octane = await createOctaneThree(BackdropScene, { floor: 0.4, segments: 4 });
		const reactMesh = react.getState().scene.getObjectByName('backdrop')!.children[0] as THREE.Mesh;
		const octaneMesh = octane.scene.getObjectByName('backdrop')!.children[0] as THREE.Mesh;
		const snapshot = (mesh: THREE.Mesh) => ({
			receiveShadow: mesh.receiveShadow,
			rotation: mesh.rotation.toArray(),
			position: Array.from(mesh.geometry.getAttribute('position').array),
			normal: Array.from(mesh.geometry.getAttribute('normal').array),
		});
		expect(snapshot(octaneMesh)).toEqual(snapshot(reactMesh));
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
	});

	it('matches BBAnchor reparenting and bounding-box position', async () => {
		const react = await reactRoot(
			React.createElement(
				'group',
				{ name: 'root' },
				React.createElement(
					'group',
					{ name: 'bounded', position: [1, 2, 3] },
					React.createElement(
						'mesh',
						null,
						React.createElement('boxGeometry', { args: [2, 4, 6] }),
						React.createElement('meshBasicMaterial'),
					),
					React.createElement(ReactBBAnchor, { anchor: [1, 0, -1], name: 'anchor' }),
				),
			),
		);
		const octane = await createOctaneThree(BBAnchorScene, { anchor: [1, 0, -1] });
		reactAdvance(1000, true, react.getState());
		octane.advanceFrames(1);
		const reactAnchor = react.getState().scene.getObjectByName('anchor')!;
		const octaneAnchor = octane.scene.getObjectByName('anchor')!;
		expect(octaneAnchor.parent?.name).toBe(reactAnchor.parent?.name);
		expect(octaneAnchor.position.toArray()).toEqual(reactAnchor.position.toArray());
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
	});
});
