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
} from '../_fixtures/trail.three.tsrx';

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

describe('Trail (Octane-only contracts)', () => {
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
});
