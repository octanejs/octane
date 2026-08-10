import * as React from 'react';
import { act, createRoot, extend } from '@react-three/fiber';
import { GizmoHelper as ReactGizmoHelper } from '@react-three/drei/core/GizmoHelper.js';
import { GizmoViewcube as ReactGizmoViewcube } from '@react-three/drei/core/GizmoViewcube.js';
import { GizmoViewport as ReactGizmoViewport } from '@react-three/drei/core/GizmoViewport.js';
import { createRoot as createOctaneRoot } from '@octanejs/three';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GizmoWidgetsScene } from './_fixtures/gizmo-helper.three.tsrx';

function renderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
	return {
		domElement: canvas,
		outputColorSpace: THREE.SRGBColorSpace,
		toneMapping: THREE.NoToneMapping,
		autoClear: true,
		capabilities: { getMaxAnisotropy: () => 4 },
		render() {},
		clearDepth() {},
		setPixelRatio() {},
		setSize() {},
		renderLists: { dispose() {} },
		forceContextLoss() {},
		dispose() {},
	} as unknown as THREE.WebGLRenderer;
}

function summarize(root: THREE.Object3D) {
	const result: Array<Record<string, unknown>> = [];
	root.traverse((object) => {
		const mesh = object as THREE.Mesh;
		const materials = (
			Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
		) as THREE.Material[];
		result.push({
			type: object.type,
			position: object.position.toArray(),
			rotation: object.rotation.toArray().slice(0, 3),
			scale: object.scale.toArray(),
			geometry: mesh.geometry?.type,
			materials: materials.map((material) => ({
				type: material.type,
				opacity: material.opacity,
				visible: material.visible,
			})),
		});
	});
	return result;
}

describe('GizmoViewcube and GizmoViewport', () => {
	it('match the pinned React widgets and retain prop-sensitive output', async () => {
		const context = {
			beginPath: vi.fn(),
			arc: vi.fn(),
			closePath: vi.fn(),
			fill: vi.fn(),
			fillRect: vi.fn(),
			strokeRect: vi.fn(),
			fillText: vi.fn(),
		};
		vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as any);
		extend(THREE as unknown as Record<string, new (...args: any[]) => any>);
		let reactChild!: THREE.Group;
		const reactCanvas = document.createElement('canvas');
		const reactRoot = createRoot(reactCanvas);
		await reactRoot.configure({
			gl: renderer(reactCanvas),
			frameloop: 'never',
			size: { width: 300, height: 200, top: 0, left: 0 },
			dpr: 1,
		});
		await act(async () =>
			reactRoot.render(
				React.createElement(
					ReactGizmoHelper,
					null,
					React.createElement(
						'group',
						{ ref: (value: THREE.Group) => (reactChild = value) },
						React.createElement(ReactGizmoViewcube, { faces: ['R', 'L', 'T', 'B', 'F', 'K'] }),
						React.createElement(ReactGizmoViewport, {
							axisColors: ['red', 'green', 'blue'],
							labels: ['A', 'B', 'C'],
						}),
					),
				),
			),
		);
		let octaneChild!: THREE.Group;
		const octaneCanvas = document.createElement('canvas');
		const octaneRoot = createOctaneRoot(octaneCanvas);
		await octaneRoot.configure({
			gl: renderer(octaneCanvas),
			frameloop: 'never',
			size: { width: 300, height: 200, top: 0, left: 0 },
			dpr: 1,
		});
		octaneRoot.render(GizmoWidgetsScene, {
			faces: ['R', 'L', 'T', 'B', 'F', 'K'],
			axisColors: ['red', 'green', 'blue'],
			labels: ['A', 'B', 'C'],
			childRef: (value: THREE.Group) => (octaneChild = value),
		});
		for (let index = 0; index < 8; index++) await Promise.resolve();
		expect(summarize(octaneChild)).toEqual(summarize(reactChild));
		const before = summarize(octaneChild);
		octaneChild.scale.setScalar(2);
		expect(summarize(octaneChild)).not.toEqual(before);
		octaneRoot.unmount();
		await act(async () => reactRoot.unmount());
	});
});
