import { resolve } from 'node:path';
import * as React from 'react';
import {
	act as reactThreeAct,
	createPortal as createReactThreePortal,
	createRoot as createReactThreeRoot,
	extend as extendReactThree,
	type ReconcilerRoot,
	type RootStore,
} from '@react-three/fiber';
import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createPortal as createOctaneThreePortal } from '@octanejs/three';
import { createThreeTestRenderer, type ThreeTestRenderer } from '@octanejs/three/testing';
import { PortalDifferentialScene } from './_fixtures/portal-differential.three.tsrx';
import { serializeThreeGraph } from './_helpers.js';

interface PortalItem {
	readonly id: string;
	readonly name: string;
	readonly position: readonly [number, number, number];
	readonly size: readonly [number, number, number];
	readonly color: string;
}

interface SceneInput {
	readonly portalName: string;
	readonly portalPosition: readonly [number, number, number];
	readonly items: readonly PortalItem[];
}

interface SceneProps extends SceneInput {
	readonly target: THREE.Object3D;
	readonly portal: typeof createReactThreePortal;
}

interface ReactSceneModule {
	readonly PortalDifferentialScene?: React.ComponentType<SceneProps>;
}

const previousActEnvironment = (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
	.IS_REACT_ACT_ENVIRONMENT;

beforeAll(() => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	extendReactThree(THREE as unknown as Record<string, new (...args: any[]) => any>);
});

afterAll(() => {
	if (previousActEnvironment === undefined) {
		delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
	} else {
		(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
			previousActEnvironment;
	}
});

function noWebGLRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
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

function createPortalTarget(): { target: THREE.Group; unmanaged: THREE.Object3D } {
	const target = new THREE.Group();
	target.name = 'external-target';
	const unmanaged = new THREE.Object3D();
	unmanaged.name = 'unmanaged-child';
	target.add(unmanaged);
	return { target, unmanaged };
}

function childByName(parent: THREE.Object3D, name: string): THREE.Object3D {
	const child = parent.children.find((value) => value.name === name);
	if (child === undefined) throw new Error(`Expected ${JSON.stringify(name)} child.`);
	return child;
}

async function loadReactScene(): Promise<React.ComponentType<SceneProps>> {
	const file = resolve(__dirname, '.react-cache/portal-differential.three.js');
	const module = (await import(/* @vite-ignore */ file)) as ReactSceneModule;
	if (module.PortalDifferentialScene === undefined) {
		throw new Error('The @tsrx/react oracle did not export PortalDifferentialScene.');
	}
	return module.PortalDifferentialScene;
}

const initialItems: readonly PortalItem[] = [
	{
		id: 'amber',
		name: 'amber',
		position: [-1, 0, 0],
		size: [1, 2, 1],
		color: '#ffbf00',
	},
	{
		id: 'blue',
		name: 'blue',
		position: [1, 0, 0],
		size: [2, 1, 1],
		color: '#0066ff',
	},
];

describe('R3F 9.6.1 portal scene oracle', () => {
	it('matches external target placement across mount, update, and unmount', async () => {
		const ReactScene = await loadReactScene();
		const octaneTarget = createPortalTarget();
		const reactTarget = createPortalTarget();
		const reactCanvas = document.createElement('canvas');
		const reactRoot: ReconcilerRoot<HTMLCanvasElement> = createReactThreeRoot(reactCanvas);
		let reactStore!: RootStore;
		let octaneRoot: ThreeTestRenderer | null = null;
		let octaneUnmounted = false;

		const initial: SceneInput = {
			portalName: 'portal-group',
			portalPosition: [0, 1, 0],
			items: initialItems,
		};
		const renderReact = async (input: SceneInput) => {
			await reactThreeAct(async () => {
				reactStore = reactRoot.render(
					React.createElement(ReactScene, {
						...input,
						target: reactTarget.target,
						portal: createReactThreePortal,
					}),
				);
			});
		};

		try {
			await reactRoot.configure({
				gl: noWebGLRenderer(reactCanvas),
				frameloop: 'never',
				dpr: 1,
				size: { width: 64, height: 64, top: 0, left: 0 },
			});
			octaneRoot = await createThreeTestRenderer(PortalDifferentialScene, {
				...initial,
				target: octaneTarget.target,
				portal: createOctaneThreePortal,
			});
			await renderReact(initial);

			expect(serializeThreeGraph(octaneRoot.scene)).toEqual(
				serializeThreeGraph(reactStore.getState().scene),
			);
			expect(serializeThreeGraph(octaneTarget.target)).toEqual(
				serializeThreeGraph(reactTarget.target),
			);
			expect(octaneTarget.target.children[0]).toBe(octaneTarget.unmanaged);
			expect(reactTarget.target.children[0]).toBe(reactTarget.unmanaged);
			const initialOctanePortal = childByName(octaneTarget.target, 'portal-group');
			const initialReactPortal = childByName(reactTarget.target, 'portal-group');

			const updated: SceneInput = {
				portalName: 'updated-portal-group',
				portalPosition: [2, 3, 4],
				items: [
					{ ...initialItems[1], position: [3, 0, 0], color: '#00aaff' },
					{ ...initialItems[0], position: [-3, 0, 0], color: '#ff3300' },
				],
			};
			octaneRoot.update(PortalDifferentialScene, {
				...updated,
				target: octaneTarget.target,
				portal: createOctaneThreePortal,
			});
			await renderReact(updated);

			expect(serializeThreeGraph(octaneRoot.scene)).toEqual(
				serializeThreeGraph(reactStore.getState().scene),
			);
			expect(serializeThreeGraph(octaneTarget.target)).toEqual(
				serializeThreeGraph(reactTarget.target),
			);
			expect(childByName(octaneTarget.target, 'updated-portal-group')).toBe(initialOctanePortal);
			expect(childByName(reactTarget.target, 'updated-portal-group')).toBe(initialReactPortal);
			expect(octaneTarget.target.children[0]).toBe(octaneTarget.unmanaged);
			expect(reactTarget.target.children[0]).toBe(reactTarget.unmanaged);

			octaneRoot.unmount();
			octaneUnmounted = true;
			await reactThreeAct(async () => {
				reactRoot.render(null);
			});

			expect(serializeThreeGraph(octaneRoot.scene)).toEqual(
				serializeThreeGraph(reactStore.getState().scene),
			);
			expect(serializeThreeGraph(octaneTarget.target)).toEqual(
				serializeThreeGraph(reactTarget.target),
			);
			expect(octaneTarget.target.children).toEqual([octaneTarget.unmanaged]);
			expect(reactTarget.target.children).toEqual([reactTarget.unmanaged]);
		} finally {
			if (!octaneUnmounted) {
				octaneRoot?.unmount();
			}
			await reactThreeAct(async () => reactRoot.unmount());
			reactCanvas.remove();
		}
	});
});
