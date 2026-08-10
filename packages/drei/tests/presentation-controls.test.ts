import * as React from 'react';
import { act, advance, createRoot, extend, useThree, type RootState } from '@react-three/fiber';
import { PresentationControls as ReactPresentationControls } from '@react-three/drei/web/PresentationControls.js';
import { createRoot as createOctaneRoot } from '@octanejs/three';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PresentationControlsScene } from './_fixtures/presentation-controls.three.tsrx';

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

function round(values: number[]) {
	return values.map((value) => Number(value.toFixed(6)));
}

function enablePointerCapture(target: HTMLElement) {
	Object.assign(target, {
		setPointerCapture() {},
		releasePointerCapture() {},
		hasPointerCapture() {
			return false;
		},
	});
}

describe('PresentationControls', () => {
	it('matches React global gesture binding, cursor lifecycle, rotation damping, and scale damping', async () => {
		extend(THREE as unknown as Record<string, new (...args: any[]) => any>);
		const props = {
			rotation: [0.1, -0.2, 0.05] as [number, number, number],
			polar: [-0.4, 0.7] as [number, number],
			azimuth: [-0.8, 0.8] as [number, number],
			speed: 1.3,
			zoom: 0.7,
			damping: 0.15,
		};
		let reactChild!: THREE.Group;
		let reactState!: RootState;
		function Capture() {
			reactState = useThree();
			return null;
		}
		const reactTarget = document.createElement('div');
		const reactCanvas = document.createElement('canvas');
		const reactRoot = createRoot(reactCanvas);
		enablePointerCapture(reactTarget);
		await reactRoot.configure({
			gl: renderer(reactCanvas),
			frameloop: 'never',
			size: { width: 400, height: 300, top: 0, left: 0 },
			dpr: 1,
		});
		await act(async () =>
			reactRoot.render(
				React.createElement(
					React.Fragment,
					null,
					React.createElement(
						ReactPresentationControls,
						{ ...props, global: true, domElement: reactTarget },
						React.createElement('group', { ref: (value: THREE.Group) => (reactChild = value) }),
					),
					React.createElement(Capture),
				),
			),
		);
		let octaneChild!: THREE.Group;
		const octaneTarget = document.createElement('div');
		const octaneCanvas = document.createElement('canvas');
		const octaneRoot = createOctaneRoot(octaneCanvas);
		enablePointerCapture(octaneTarget);
		await octaneRoot.configure({
			gl: renderer(octaneCanvas),
			frameloop: 'never',
			size: { width: 400, height: 300, top: 0, left: 0 },
			dpr: 1,
		});
		octaneRoot.render(PresentationControlsScene, {
			...props,
			domElement: octaneTarget,
			childRef: (value: THREE.Group) => (octaneChild = value),
		});
		for (let index = 0; index < 8; index++) await Promise.resolve();
		expect(octaneTarget.style.cursor).toBe(reactTarget.style.cursor);
		for (const target of [reactTarget, octaneTarget]) {
			target.dispatchEvent(
				new PointerEvent('pointerdown', {
					pointerId: 1,
					clientX: 100,
					clientY: 100,
					buttons: 1,
					bubbles: true,
				}),
			);
			window.dispatchEvent(
				new PointerEvent('pointermove', {
					pointerId: 1,
					clientX: 180,
					clientY: 180,
					buttons: 1,
					bubbles: true,
				}),
			);
			window.dispatchEvent(
				new PointerEvent('pointerup', { pointerId: 1, clientX: 180, clientY: 180, bubbles: true }),
			);
		}
		for (let index = 0; index < 90; index++) {
			await act(async () => advance(((index + 1) * 1000) / 60, true, reactState));
			octaneRoot.store.getState().advance(octaneRoot.store.getState().clock.elapsedTime + 1 / 60);
		}
		expect(round(octaneChild.parent!.rotation.toArray().slice(0, 3))).toEqual(
			round(reactChild.parent!.rotation.toArray().slice(0, 3)),
		);
		expect(round(octaneChild.parent!.scale.toArray())).toEqual(
			round(reactChild.parent!.scale.toArray()),
		);
		octaneChild.parent!.rotation.x += 1;
		expect(round(octaneChild.parent!.rotation.toArray().slice(0, 3))).not.toEqual(
			round(reactChild.parent!.rotation.toArray().slice(0, 3)),
		);
		octaneRoot.unmount();
		await act(async () => reactRoot.unmount());
		expect(octaneTarget.style.cursor).toBe(reactTarget.style.cursor);
	});
});
