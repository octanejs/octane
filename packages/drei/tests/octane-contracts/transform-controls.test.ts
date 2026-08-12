import * as React from 'react';
import {
	act as reactThreeAct,
	createRoot as createReactThreeRoot,
	extend as extendReactThree,
	useThree as reactUseThree,
	type RootState as ReactRootState,
} from '@react-three/fiber';
import { TransformControls as ReactTransformControls } from '@react-three/drei/core/TransformControls.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { TransformControls as TransformControlsImpl } from 'three-stdlib';
import { TransformControlsScene } from '../_fixtures/transform-controls.three.tsrx';

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

function snapshot(controls: TransformControlsImpl) {
	return {
		enabled: controls.enabled,
		axis: controls.axis,
		mode: controls.mode,
		translationSnap: controls.translationSnap,
		rotationSnap: controls.rotationSnap,
		scaleSnap: controls.scaleSnap,
		space: controls.space,
		size: controls.size,
		showX: controls.showX,
		showY: controls.showY,
		showZ: controls.showZ,
		objectName: controls.object?.name,
	};
}

describe('TransformControls (Octane-only contracts)', () => {
	it('matches explicit object attachment instead of the child group', async () => {
		const object = new THREE.Object3D();
		object.name = 'external';
		let controls!: TransformControlsImpl;
		const root = await createOctaneThree(TransformControlsScene, {
			object,
			makeDefault: false,
			enabled: true,
			axis: null,
			mode: 'translate',
			translationSnap: null,
			rotationSnap: null,
			scaleSnap: null,
			space: 'world',
			size: 1,
			showX: true,
			showY: true,
			showZ: true,
			ref: (value: TransformControlsImpl) => (controls = value),
		});
		expect(controls.object).toBe(object);
		root.unmount();
	});
});
