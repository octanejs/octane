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
import type { MotionPathRef } from '../src/index.js';
import { InvalidMotionReader, MotionPathScene } from './_fixtures/motion-path.three.tsrx';

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

describe('MotionPathControls', () => {
	it('matches React context state, imperative ref, damping, looping, focus, and curve traversal', async () => {
		extendReactThree(THREE as unknown as Record<string, new (...args: any[]) => any>);
		const makeCurves = () => [
			new THREE.LineCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(4, 2, -1)),
			new THREE.QuadraticBezierCurve3(
				new THREE.Vector3(4, 2, -1),
				new THREE.Vector3(6, 3, 0),
				new THREE.Vector3(8, 0, 2),
			),
		];
		const reactTarget = new THREE.Object3D();
		const octaneTarget = new THREE.Object3D();
		const reactFocus = new THREE.Object3D();
		reactFocus.position.set(0, 1, -5);
		const octaneFocus = reactFocus.clone();
		let reactMotion: any;
		let reactGroup!: ReactMotionPathRef;
		function ReactReader() {
			reactMotion = reactUseMotion();
			return null;
		}
		const canvas = document.createElement('canvas');
		const root = createReactThreeRoot(canvas);
		let state!: RootState;
		function Capture() {
			state = reactUseThree();
			return null;
		}
		await root.configure({ gl: renderer(canvas), frameloop: 'never' });
		await reactThreeAct(async () =>
			root.render(
				React.createElement(
					React.Fragment,
					null,
					React.createElement(
						ReactMotionPathControls,
						{
							ref: (value: ReactMotionPathRef) => (reactGroup = value),
							curves: makeCurves(),
							object: { current: reactTarget },
							focus: { current: reactFocus },
							loop: true,
							offset: 0.65,
							damping: 0.1,
							focusDamping: 0.1,
							maxSpeed: 10,
							name: 'motion-path',
						},
						React.createElement(ReactReader),
					),
					React.createElement(Capture),
				),
			),
		);
		let octaneMotion: any;
		let octaneGroup!: MotionPathRef;
		const octane = await createOctaneThree(MotionPathScene, {
			groupRef: (value: MotionPathRef) => (octaneGroup = value),
			curves: makeCurves(),
			object: { current: octaneTarget },
			focus: { current: octaneFocus },
			loop: true,
			offset: 0.65,
			damping: 0.1,
			focusDamping: 0.1,
			maxSpeed: 10,
			debug: false,
			onMotion: (value: any) => (octaneMotion = value),
		});
		for (let index = 0; index < 120; index++) {
			await reactThreeAct(async () => reactAdvance(((index + 1) * 1000) / 60, true, state));
			octane.advanceFrames(1, 1 / 60);
		}
		const round = (value: any): any =>
			Array.isArray(value)
				? value.map(round)
				: typeof value === 'number'
					? Number(value.toFixed(8))
					: value;
		expect(round(stateSnapshot(octaneMotion, octaneTarget, octaneGroup))).toEqual(
			round(stateSnapshot(reactMotion, reactTarget, reactGroup)),
		);
		expect(octaneGroup.motion).toBe(octaneMotion);
		octaneMotion.current = 1.4;
		octane.advanceFrames(1, 1 / 60);
		expect(octaneMotion.offset).toBeLessThan(1);
		expect(round(stateSnapshot(octaneMotion, octaneTarget, octaneGroup))).not.toEqual(
			round(stateSnapshot(reactMotion, reactTarget, reactGroup)),
		);
		octane.unmount();
		await reactThreeAct(async () => root.unmount());
	});

	it('rejects useMotion outside MotionPathControls', async () => {
		await expect(createOctaneThree(InvalidMotionReader, {})).rejects.toThrow(
			'useMotion hook must be used in a MotionPathControls component.',
		);
	});
});
