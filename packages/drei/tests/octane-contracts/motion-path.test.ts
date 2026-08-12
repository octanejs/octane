import * as React from 'react';
import {
	act as reactThreeAct,
	advance as reactAdvance,
	createRoot as createReactThreeRoot,
	extend as extendReactThree,
	useThree as reactUseThree,
	type RootState,
} from '@react-three/fiber';
import {
	MotionPathControls as ReactMotionPathControls,
	useMotion as reactUseMotion,
	type MotionPathRef as ReactMotionPathRef,
} from '@react-three/drei/core/MotionPathControls.js';
import { create as createOctaneThree } from '@octanejs/three/testing';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { MotionPathRef } from '../../src/index.js';
import { InvalidMotionReader, MotionPathScene } from '../_fixtures/motion-path.three.tsrx';

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

function stateSnapshot(motion: any, target: THREE.Object3D, group: THREE.Group) {
	return {
		current: motion.current,
		offset: motion.offset,
		point: motion.point.toArray(),
		tangent: motion.tangent.toArray(),
		next: motion.next.toArray(),
		curveCount: motion.path.curves.length,
		target: target.position.toArray(),
		quaternion: target.quaternion.toArray(),
		groupName: group.name,
	};
}

describe('MotionPathControls (Octane-only contracts)', () => {
	it('rejects useMotion outside MotionPathControls', async () => {
		await expect(createOctaneThree(InvalidMotionReader, {})).rejects.toThrow(
			'useMotion hook must be used in a MotionPathControls component.',
		);
	});
});
