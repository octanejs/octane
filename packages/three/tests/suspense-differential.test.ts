import { resolve } from 'node:path';
import * as React from 'react';
import {
	act as reactThreeAct,
	createRoot as createReactThreeRoot,
	extend as extendReactThree,
	type ReconcilerRoot,
	type RootStore,
} from '@react-three/fiber';
import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { create as createOctaneThreeRoot, type ThreeTestRenderer } from '@octanejs/three/testing';
import { use as octaneUse } from '@octanejs/three/renderer';
import { SuspenseDifferentialScene } from './_fixtures/suspense-differential.three.tsrx';
import { serializeThreeGraph } from './_helpers.js';

interface DeferredResource {
	readonly promise: Promise<string>;
	resolve(value: string): void;
}

interface SceneProps {
	readonly resource: Promise<string>;
	readonly read: (resource: Promise<string>) => string;
	readonly primaryRef: (value: THREE.Group | null) => void;
	readonly fallbackRef: (value: THREE.Group | null) => void;
}

interface ReactSceneModule {
	readonly SuspenseDifferentialScene?: React.ComponentType<SceneProps>;
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

function createResource(): DeferredResource {
	let settle!: (value: string) => void;
	const promise = new Promise<string>((resolvePromise) => {
		settle = resolvePromise;
	});
	return {
		promise,
		resolve(nextValue) {
			settle(nextValue);
		},
	};
}

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

function props(
	resource: Promise<string>,
	read: (resource: Promise<string>) => string,
	primaryRef: (value: THREE.Group | null) => void,
	fallbackRef: (value: THREE.Group | null) => void,
): SceneProps {
	return { resource, read, primaryRef, fallbackRef };
}

function childByName(scene: THREE.Scene, name: string): THREE.Object3D | undefined {
	return scene.children.find((child) => child.name === name);
}

function expectMatchedGraph(octaneScene: THREE.Scene, reactScene: THREE.Scene): void {
	expect(serializeThreeGraph(octaneScene)).toEqual(serializeThreeGraph(reactScene));
}

async function loadReactScene(): Promise<React.ComponentType<SceneProps>> {
	const file = resolve(__dirname, '.react-cache/suspense-differential.three.js');
	const module = (await import(/* @vite-ignore */ file)) as ReactSceneModule;
	if (module.SuspenseDifferentialScene === undefined) {
		throw new Error('The @tsrx/react oracle did not export SuspenseDifferentialScene.');
	}
	return module.SuspenseDifferentialScene;
}

async function resolveResources(
	octaneResource: DeferredResource,
	reactResource: DeferredResource,
	value: string,
): Promise<void> {
	await reactThreeAct(async () => {
		octaneResource.resolve(value);
		reactResource.resolve(value);
		await Promise.all([octaneResource.promise, reactResource.promise]);
		for (let index = 0; index < 8; index++) await Promise.resolve();
	});
}

describe('R3F 9.6.1 Suspense scene oracle', () => {
	it('matches fallback, retained hidden content, resolution, and Three identity', async () => {
		const ReactScene = await loadReactScene();
		const initialOctaneResource = createResource();
		const initialReactResource = createResource();
		let octanePrimary: THREE.Group | null = null;
		let reactPrimary: THREE.Group | null = null;
		let octaneFallback: THREE.Group | null = null;
		let reactFallback: THREE.Group | null = null;
		const octaneProps = props(
			initialOctaneResource.promise,
			(resource) => octaneUse(resource),
			(value) => (octanePrimary = value),
			(value) => (octaneFallback = value),
		);
		const reactProps = props(
			initialReactResource.promise,
			(resource) => React.use(resource),
			(value) => (reactPrimary = value),
			(value) => (reactFallback = value),
		);
		let octaneRoot: ThreeTestRenderer | null = null;
		const reactCanvas = document.createElement('canvas');
		const reactRoot: ReconcilerRoot<HTMLCanvasElement> = createReactThreeRoot(reactCanvas);
		let reactStore!: RootStore;

		try {
			octaneRoot = await createOctaneThreeRoot(SuspenseDifferentialScene, octaneProps);
			await reactRoot.configure({
				gl: noWebGLRenderer(reactCanvas),
				frameloop: 'never',
				dpr: 1,
				size: { width: 64, height: 64, top: 0, left: 0 },
			});
			await reactThreeAct(async () => {
				reactStore = reactRoot.render(React.createElement(ReactScene, reactProps));
			});

			const reactScene = reactStore.getState().scene;
			expectMatchedGraph(octaneRoot.scene, reactScene);
			expect(octaneRoot.scene.children.map((child) => child.name)).toEqual(['asset-pending']);
			expect(octanePrimary).toBeNull();
			expect(reactPrimary).toBeNull();
			expect(octaneFallback?.visible).toBe(true);
			expect(reactFallback?.visible).toBe(true);

			await resolveResources(initialOctaneResource, initialReactResource, 'asset-one');
			expectMatchedGraph(octaneRoot.scene, reactScene);
			const firstOctanePrimary = childByName(octaneRoot.scene, 'asset-one') as THREE.Group;
			const firstReactPrimary = childByName(reactScene, 'asset-one') as THREE.Group;
			expect(octanePrimary).toBe(firstOctanePrimary);
			expect(reactPrimary).toBe(firstReactPrimary);
			expect(firstOctanePrimary.visible).toBe(true);
			expect(firstReactPrimary.visible).toBe(true);
			expect(childByName(octaneRoot.scene, 'asset-pending')).toBeUndefined();
			expect(childByName(reactScene, 'asset-pending')).toBeUndefined();

			const updatedOctaneResource = createResource();
			const updatedReactResource = createResource();
			octaneRoot.update(
				SuspenseDifferentialScene,
				props(
					updatedOctaneResource.promise,
					(resource) => octaneUse(resource),
					(value) => (octanePrimary = value),
					(value) => (octaneFallback = value),
				),
			);
			await reactThreeAct(async () => {
				reactRoot.render(
					React.createElement(
						ReactScene,
						props(
							updatedReactResource.promise,
							(resource) => React.use(resource),
							(value) => (reactPrimary = value),
							(value) => (reactFallback = value),
						),
					),
				);
			});

			expectMatchedGraph(octaneRoot.scene, reactScene);
			expect(childByName(octaneRoot.scene, 'asset-one')).toBe(firstOctanePrimary);
			expect(childByName(reactScene, 'asset-one')).toBe(firstReactPrimary);
			expect(firstOctanePrimary.visible).toBe(false);
			expect(firstReactPrimary.visible).toBe(false);
			expect(firstOctanePrimary.getObjectByName('asset-mesh')?.visible).toBe(true);
			expect(firstReactPrimary.getObjectByName('asset-mesh')?.visible).toBe(true);
			expect(firstOctanePrimary.getObjectByName('authored-hidden-mesh')?.visible).toBe(false);
			expect(firstReactPrimary.getObjectByName('authored-hidden-mesh')?.visible).toBe(false);
			expect(childByName(octaneRoot.scene, 'asset-pending')?.visible).toBe(true);
			expect(childByName(reactScene, 'asset-pending')?.visible).toBe(true);

			await resolveResources(updatedOctaneResource, updatedReactResource, 'asset-two');
			expectMatchedGraph(octaneRoot.scene, reactScene);
			expect(childByName(octaneRoot.scene, 'asset-two')).toBe(firstOctanePrimary);
			expect(childByName(reactScene, 'asset-two')).toBe(firstReactPrimary);
			expect(firstOctanePrimary.visible).toBe(true);
			expect(firstReactPrimary.visible).toBe(true);
			expect(firstOctanePrimary.getObjectByName('asset-mesh')?.visible).toBe(true);
			expect(firstReactPrimary.getObjectByName('asset-mesh')?.visible).toBe(true);
			expect(firstOctanePrimary.getObjectByName('authored-hidden-mesh')?.visible).toBe(false);
			expect(firstReactPrimary.getObjectByName('authored-hidden-mesh')?.visible).toBe(false);
			expect(childByName(octaneRoot.scene, 'asset-pending')).toBeUndefined();
			expect(childByName(reactScene, 'asset-pending')).toBeUndefined();
		} finally {
			octaneRoot?.unmount();
			await reactThreeAct(async () => reactRoot.unmount());
			reactCanvas.remove();
		}
	});
});
