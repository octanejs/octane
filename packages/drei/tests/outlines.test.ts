import * as React from 'react';
import {
	act as reactThreeAct,
	createRoot as createReactThreeRoot,
	extend as extendReactThree,
} from '@react-three/fiber';
import { Outlines as ReactOutlines } from '@react-three/drei/core/Outlines.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { OutlinesScene } from './_fixtures/outlines.three.tsrx';

function renderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
	return {
		domElement: canvas,
		outputColorSpace: THREE.SRGBColorSpace,
		toneMapping: THREE.NoToneMapping,
		getDrawingBufferSize(target: THREE.Vector2) {
			return target.set(160, 90);
		},
		render() {},
		setPixelRatio() {},
		setSize() {},
		renderLists: { dispose() {} },
		forceContextLoss() {},
		dispose() {},
	} as unknown as THREE.WebGLRenderer;
}

function snapshot(parent: THREE.Mesh) {
	const group = parent.getObjectByName('outlines') as THREE.Group;
	const outline = group.children[0] as THREE.Mesh;
	const material = outline.material as THREE.ShaderMaterial & Record<string, any>;
	return {
		geometryShared: outline.geometry === parent.geometry,
		positionCount: outline.geometry.getAttribute('position').count,
		order: outline.renderOrder,
		side: material.side,
		color: material.color.getHexString(),
		opacity: material.opacity,
		transparent: material.transparent,
		screenspace: material.screenspace,
		thickness: material.thickness,
		size: material.size.toArray(),
		polygonOffset: material.polygonOffset,
		polygonOffsetFactor: material.polygonOffsetFactor,
	};
}

describe('Outlines', () => {
	it.each([0, Math.PI / 3])(
		'matches React parent geometry derivation and material configuration for angle=%s',
		async (angle) => {
			extendReactThree(THREE as unknown as Record<string, new (...args: any[]) => any>);
			let reactParent!: THREE.Mesh;
			const canvas = document.createElement('canvas');
			const root = createReactThreeRoot(canvas);
			await root.configure({
				gl: renderer(canvas),
				frameloop: 'never',
				size: { width: 160, height: 90, top: 0, left: 0 },
				dpr: 1,
			});
			await reactThreeAct(async () =>
				root.render(
					React.createElement(
						'mesh',
						{ ref: (value: THREE.Mesh) => (reactParent = value), name: 'parent' },
						React.createElement('boxGeometry', { args: [1, 2, 3] }),
						React.createElement('meshBasicMaterial'),
						React.createElement(ReactOutlines, {
							name: 'outlines',
							angle,
							color: '#123456',
							opacity: 0.65,
							transparent: true,
							screenspace: true,
							thickness: 0.08,
							renderOrder: 4,
							polygonOffset: true,
							polygonOffsetFactor: -2,
						}),
					),
				),
			);
			let octaneParent!: THREE.Mesh;
			const octane = await createOctaneThree(
				OutlinesScene,
				{
					parentRef: (value: THREE.Mesh) => (octaneParent = value),
					angle,
					color: '#123456',
					opacity: 0.65,
					transparent: true,
					screenspace: true,
					thickness: 0.08,
					renderOrder: 4,
				},
				{ width: 160, height: 90 },
			);
			expect(snapshot(octaneParent)).toEqual(snapshot(reactParent));
			(octaneParent.getObjectByName('outlines')!.children[0] as THREE.Mesh).renderOrder += 1;
			expect(snapshot(octaneParent)).not.toEqual(snapshot(reactParent));
			octane.unmount();
			await reactThreeAct(async () => root.unmount());
		},
	);
});
