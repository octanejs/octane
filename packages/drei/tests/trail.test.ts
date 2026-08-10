import * as React from 'react';
import {
	act as reactThreeAct,
	advance as reactAdvance,
	createRoot as createReactThreeRoot,
	extend as extendReactThree,
	type RootState as ReactRootState,
	useThree as reactUseThree,
} from '@react-three/fiber';
import { Trail as ReactTrail, useTrail as useReactTrail } from '@react-three/drei/core/Trail.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { MeshLineMaterial } from 'meshline';
import * as THREE from 'three';
import {
	TrailDiscoveredScene,
	TrailExternalScene,
	TrailHookScene,
} from './_fixtures/trail.three.tsrx';

beforeAll(() => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	extendReactThree({ ...THREE, MeshLineMaterial } as unknown as Record<
		string,
		new (...args: any[]) => any
	>);
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

function snapshot(mesh: THREE.Mesh) {
	const geometry = mesh.geometry;
	const material = mesh.material as MeshLineMaterial;
	return {
		position:
			geometry.getAttribute('position') && Array.from(geometry.getAttribute('position').array),
		previous:
			geometry.getAttribute('previous') && Array.from(geometry.getAttribute('previous').array),
		next: geometry.getAttribute('next') && Array.from(geometry.getAttribute('next').array),
		counters:
			geometry.getAttribute('counters') && Array.from(geometry.getAttribute('counters').array),
		lineWidth: material.lineWidth,
		color: material.color.getHexString(),
		sizeAttenuation: material.sizeAttenuation,
		resolution: material.resolution.toArray(),
	};
}

async function reactExternal(target: THREE.Object3D) {
	const canvas = document.createElement('canvas');
	const root = createReactThreeRoot(canvas);
	let mesh!: THREE.Mesh;
	let getState!: () => ReactRootState;
	function Capture() {
		getState = reactUseThree((state) => state.get);
		return null;
	}
	await root.configure({
		gl: renderer(canvas),
		frameloop: 'never',
		size: { width: 320, height: 180, top: 0, left: 0 },
	});
	await reactThreeAct(async () =>
		root.render(
			React.createElement(
				React.Fragment,
				null,
				React.createElement(ReactTrail, {
					ref: (value: THREE.Mesh) => (mesh = value),
					target: { current: target },
					width: 0.6,
					length: 2,
					decay: 2,
					local: false,
					stride: 0.2,
					interval: 2,
					color: '#4080c0',
					attenuation: (width: number) => width * width,
				}),
				React.createElement(Capture),
			),
		),
	);
	return { root, mesh, getState };
}

describe('Trail', () => {
	it('matches target refs, world sampling, decay, stride, interval, portal placement, geometry, material, and attenuation', async () => {
		const reactParent = new THREE.Group();
		reactParent.position.set(10, 0, 0);
		const reactTarget = new THREE.Object3D();
		reactTarget.position.set(1, 2, 3);
		reactParent.add(reactTarget);
		reactParent.updateMatrixWorld(true);
		const octaneParent = reactParent.clone(false);
		const octaneTarget = reactTarget.clone(false);
		octaneParent.add(octaneTarget);
		octaneParent.updateMatrixWorld(true);
		const react = await reactExternal(reactTarget);
		let mesh!: THREE.Mesh;
		const octane = await createOctaneThree(
			TrailExternalScene,
			{
				ref: (value: THREE.Mesh) => (mesh = value),
				targetRef: { current: octaneTarget },
				width: 0.6,
				length: 2,
				decay: 2,
				local: false,
				stride: 0.2,
				interval: 2,
				color: '#4080c0',
				attenuation: (width: number) => width * width,
			},
			{ width: 320, height: 180 },
		);
		for (let index = 0; index < 4; index++) await Promise.resolve();
		expect(mesh.parent).toBe(octane.scene);
		expect(react.mesh.parent).toBe(react.getState().scene);
		for (let frame = 0; frame < 4; frame++) {
			reactTarget.position.x += frame === 1 ? 0.05 : 0.5;
			octaneTarget.position.x += frame === 1 ? 0.05 : 0.5;
			reactParent.updateMatrixWorld(true);
			octaneParent.updateMatrixWorld(true);
			await reactThreeAct(async () => reactAdvance(0.25, true, react.getState()));
			octane.advanceFrames(1, 0.25);
		}
		expect(snapshot(mesh)).toEqual(snapshot(react.mesh));
		octane.unmount();
		await reactThreeAct(async () => react.root.unmount());
	});

	it('discovers its first Object3D child and applies the first meshLineMaterial override', async () => {
		let mesh!: THREE.Mesh;
		let target!: THREE.Group;
		const root = await createOctaneThree(TrailDiscoveredScene, {
			ref: (value: THREE.Mesh) => (mesh = value),
			targetRef: (value: THREE.Group) => (target = value),
			width: 0.2,
			color: 'hotpink',
			position: [2, 3, 4],
			overrideColor: 'lime',
			overrideWidth: 0.75,
		});
		root.advanceFrames(1, 0.25);
		expect(target.type).toBe('Group');
		expect((mesh.material as MeshLineMaterial).color.getHexString()).toBe('00ff00');
		expect((mesh.material as MeshLineMaterial).lineWidth).toBe(0.75);
		root.unmount();
	});

	it('matches useTrail initialization and leaves a missing target unresolved', async () => {
		const target = new THREE.Object3D();
		target.position.set(2, 4, 6);
		let reactPoints!: React.RefObject<Float32Array | null>;
		const canvas = document.createElement('canvas');
		const reactRoot = createReactThreeRoot(canvas);
		function ReactScene() {
			reactPoints = useReactTrail(target, { length: 1, local: true });
			return null;
		}
		await reactRoot.configure({ gl: renderer(canvas), frameloop: 'never' });
		await reactThreeAct(async () => reactRoot.render(React.createElement(ReactScene)));
		let octanePoints!: { current: Float32Array | null };
		const octane = await createOctaneThree(TrailHookScene, {
			target,
			settings: { length: 1, local: true },
			onPoints: (value: { current: Float32Array | null }) => (octanePoints = value),
		});
		expect(Array.from(octanePoints.current!)).toEqual(Array.from(reactPoints.current!));
		octane.unmount();
		await reactThreeAct(async () => reactRoot.unmount());

		let missing!: { current: Float32Array | null };
		const missingRoot = await createOctaneThree(TrailHookScene, {
			target: null,
			settings: { length: 1 },
			onPoints: (value: { current: Float32Array | null }) => (missing = value),
		});
		expect(missing.current).toBeNull();
		missingRoot.unmount();
	});
});
