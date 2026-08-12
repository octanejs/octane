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
	GizmoHelper as ReactGizmoHelper,
	useGizmoContext as reactUseGizmoContext,
} from '@react-three/drei/core/GizmoHelper.js';
import { createRoot as createOctaneRoot } from '@octanejs/three';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GizmoHelperScene } from './_fixtures/gizmo-helper.three.tsrx';

function renderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
	return {
		domElement: canvas,
		outputColorSpace: THREE.SRGBColorSpace,
		toneMapping: THREE.NoToneMapping,
		autoClear: true,
		render() {},
		clearDepth() {},
		setPixelRatio() {},
		setSize() {},
		renderLists: { dispose() {} },
		forceContextLoss() {},
		dispose() {},
	} as unknown as THREE.WebGLRenderer;
}

function round(values: number[]) {
	return values.map((value) => Number(value.toFixed(7)));
}

describe('GizmoHelper', () => {
	it('matches React HUD placement, context API, camera tweening, control updates, and gizmo synchronization', async () => {
		extendReactThree(THREE as unknown as Record<string, new (...args: any[]) => any>);
		let reactApi: any;
		let reactChild!: THREE.Group;
		let reactState!: RootState;
		const reactUpdates = vi.fn();
		function ReactReader() {
			reactApi = reactUseGizmoContext();
			return React.createElement('group', {
				ref: (value: THREE.Group) => (reactChild = value),
				name: 'gizmo-child',
			});
		}
		function Capture() {
			reactState = reactUseThree();
			return null;
		}
		function InstallControls() {
			const set = reactUseThree((state) => state.set);
			React.useLayoutEffect(() => set({ controls: reactControls as any }), [set]);
			return null;
		}
		const reactCanvas = document.createElement('canvas');
		const reactRoot = createReactThreeRoot(reactCanvas);
		await reactRoot.configure({
			gl: renderer(reactCanvas),
			frameloop: 'never',
			size: { width: 300, height: 200, top: 0, left: 0 },
			dpr: 1,
		});
		const reactControls = { target: new THREE.Vector3(), update: reactUpdates };
		await reactThreeAct(async () =>
			reactRoot.render(
				React.createElement(
					React.Fragment,
					null,
					React.createElement(InstallControls),
					React.createElement(
						ReactGizmoHelper,
						{ alignment: 'top-left', margin: [30, 40], renderPriority: 2 },
						React.createElement(ReactReader),
					),
					React.createElement(Capture),
				),
			),
		);
		let octaneApi: any;
		let octaneChild!: THREE.Group;
		const octaneUpdates = vi.fn();
		const octaneCanvas = document.createElement('canvas');
		const octaneRoot = createOctaneRoot(octaneCanvas);
		await octaneRoot.configure({
			gl: renderer(octaneCanvas),
			frameloop: 'never',
			size: { width: 300, height: 200, top: 0, left: 0 },
			dpr: 1,
		});
		octaneRoot.store.setState({
			controls: { target: new THREE.Vector3(), update: octaneUpdates } as any,
		});
		octaneRoot.render(GizmoHelperScene, {
			alignment: 'top-left',
			margin: [30, 40],
			renderPriority: 2,
			onUpdate: undefined,
			onApi: (value: any) => (octaneApi = value),
			childRef: (value: THREE.Group) => (octaneChild = value),
		});
		for (let index = 0; index < 8; index++) await Promise.resolve();
		reactState.camera.position.set(0, 0, 5);
		reactState.camera.lookAt(0, 0, 0);
		reactState.camera.updateMatrixWorld();
		const octaneCamera = octaneRoot.store.getState().camera;
		octaneCamera.position.set(0, 0, 5);
		octaneCamera.lookAt(0, 0, 0);
		octaneCamera.updateMatrixWorld();
		reactApi.tweenCamera(new THREE.Vector3(1, 0, 0));
		octaneApi.tweenCamera(new THREE.Vector3(1, 0, 0));
		for (let index = 0; index < 120; index++) {
			await reactThreeAct(async () => reactAdvance(((index + 1) * 1000) / 60, true, reactState));
			octaneRoot.store.getState().advance(octaneRoot.store.getState().clock.elapsedTime + 1 / 60);
		}
		expect(round(octaneCamera.position.toArray())).toEqual(
			round(reactState.camera.position.toArray()),
		);
		expect(round(octaneCamera.quaternion.toArray())).toEqual(
			round(reactState.camera.quaternion.toArray()),
		);
		expect(round(octaneChild.parent!.position.toArray())).toEqual(
			round(reactChild.parent!.position.toArray()),
		);
		expect(round(octaneChild.parent!.quaternion.toArray())).toEqual(
			round(reactChild.parent!.quaternion.toArray()),
		);
		expect(octaneUpdates).toHaveBeenCalled();
		expect(reactUpdates).toHaveBeenCalled();
		expect(typeof octaneUpdates.mock.calls[0]?.[0]).toBe(typeof reactUpdates.mock.calls[0]?.[0]);
		octaneChild.parent!.position.x += 1;
		expect(round(octaneChild.parent!.position.toArray())).not.toEqual(
			round(reactChild.parent!.position.toArray()),
		);
		octaneRoot.unmount();
		await reactThreeAct(async () => reactRoot.unmount());
	});
});
