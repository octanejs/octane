import * as React from 'react';
import { act, advance, createRoot, extend, useThree, type RootState } from '@react-three/fiber';
import { Caustics as ReactCaustics } from '@react-three/drei/core/Caustics.js';
import { createRoot as createOctaneRoot } from '@octanejs/three';
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CausticsScene } from './_fixtures/caustics.three.tsrx';

beforeAll(() => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	extend(THREE as unknown as Record<string, new (...args: any[]) => any>);
});

type RenderRecord = { target: THREE.WebGLRenderTarget | null; object: THREE.Object3D };
function renderer(canvas: HTMLCanvasElement, records: RenderRecord[]): THREE.WebGLRenderer {
	let target: THREE.WebGLRenderTarget | null = null;
	return {
		domElement: canvas,
		outputColorSpace: THREE.SRGBColorSpace,
		toneMapping: THREE.NoToneMapping,
		setRenderTarget(value: THREE.WebGLRenderTarget | null) {
			target = value;
		},
		getRenderTarget() {
			return target;
		},
		clear() {},
		render(object: THREE.Object3D) {
			records.push({ target, object });
		},
		setPixelRatio() {},
		setSize() {},
		renderLists: { dispose() {} },
		forceContextLoss() {},
		dispose() {},
	} as unknown as THREE.WebGLRenderer;
}

function snapshot(group: THREE.Group) {
	const scene = group.children.find((child): child is THREE.Scene => child.type === 'Scene')!;
	const plane = group.children.find((child): child is THREE.Mesh => child.type === 'Mesh')!;
	const material = plane.material as THREE.ShaderMaterial;
	return {
		childNames: scene.children.map((child) => child.name || child.type),
		sceneVisible: scene.visible,
		planeScale: plane.scale.toArray(),
		planePosition: plane.position.toArray(),
		planeRotation: plane.rotation.toArray().slice(0, 3),
		material: {
			color: material.uniforms.color.value.getHex(),
			blending: material.blending,
			depthWrite: material.depthWrite,
			transparent: material.transparent,
		},
	};
}

function targetSnapshot(records: RenderRecord[]) {
	return records.map(({ target, object }) => ({
		objectType: object.type,
		width: target?.width,
		height: target?.height,
		textureType: target?.texture.type,
		minFilter: target?.texture.minFilter,
		depth: Boolean(target?.depthTexture),
	}));
}

describe('Caustics', () => {
	it('matches React render passes, projection state, frame limits, imperative refs, and independent mutation', async () => {
		const props = {
			frames: 1,
			debug: false,
			causticsOnly: true,
			backside: true,
			ior: 1.25,
			backsideIOR: 1.4,
			worldRadius: 0.2,
			intensity: 0.08,
			color: '#80c0ff',
			resolution: 16,
			lightSource: [5, 5, 5] as [number, number, number],
		};
		const reactRecords: RenderRecord[] = [];
		let reactState!: RootState;
		let reactGroup!: THREE.Group;
		function Capture() {
			reactState = useThree();
			return null;
		}
		const reactCanvas = document.createElement('canvas');
		const reactRoot = createRoot(reactCanvas);
		await reactRoot.configure({ gl: renderer(reactCanvas, reactRecords), frameloop: 'never' });
		await act(async () =>
			reactRoot.render(
				React.createElement(
					React.Fragment,
					null,
					React.createElement(
						ReactCaustics,
						{ ...props, ref: (value: THREE.Group) => (reactGroup = value) },
						React.createElement(
							'mesh',
							{ name: 'caustic-subject' },
							React.createElement('boxGeometry'),
							React.createElement('meshBasicMaterial'),
						),
					),
					React.createElement(Capture),
				),
			),
		);
		const octaneRecords: RenderRecord[] = [];
		let octaneGroup!: THREE.Group;
		const octaneCanvas = document.createElement('canvas');
		const octaneRoot = createOctaneRoot(octaneCanvas);
		await octaneRoot.configure({ gl: renderer(octaneCanvas, octaneRecords), frameloop: 'never' });
		octaneRoot.render(CausticsScene, {
			...props,
			ref: (value: THREE.Group) => (octaneGroup = value),
		});
		for (let index = 0; index < 8; index++) await Promise.resolve();
		await act(async () => advance(1000 / 60, true, reactState));
		octaneRoot.store.getState().advance(1 / 60);
		expect(snapshot(octaneGroup)).toEqual(snapshot(reactGroup));
		expect(octaneRecords.map((record) => record.target === null)).toEqual(
			reactRecords.map((record) => record.target === null),
		);
		expect(targetSnapshot(octaneRecords)).toEqual(targetSnapshot(reactRecords));
		expect(octaneRecords).toHaveLength(reactRecords.length);
		const reactTargetRecords = reactRecords.filter((record) => record.target).length;
		const octaneTargetRecords = octaneRecords.filter((record) => record.target).length;
		await act(async () => advance(2000 / 60, true, reactState));
		octaneRoot.store.getState().advance(2 / 60);
		expect(reactRecords.filter((record) => record.target)).toHaveLength(reactTargetRecords);
		expect(octaneRecords.filter((record) => record.target)).toHaveLength(octaneTargetRecords);
		octaneGroup.position.x = 7;
		expect(octaneGroup.position.x).not.toBe(reactGroup.position.x);
		octaneRoot.unmount();
		await act(async () => reactRoot.unmount());
	});
});
