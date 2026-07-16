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
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createUniversalRoot } from 'octane/universal';
import { createThreeContainer, createThreeDriver } from '../src/core/driver.js';
import { BasicScene } from './_fixtures/basic.three.tsrx';
import { serializeThreeGraph } from './_helpers.js';

interface SceneItem {
	readonly id: string;
	readonly name: string;
	readonly position: readonly [number, number, number];
	readonly scale: readonly [number, number, number];
	readonly size: readonly [number, number, number];
	readonly color: string;
}

interface SceneInput {
	readonly groupArgs: readonly unknown[];
	readonly name: string;
	readonly position: readonly [number, number, number];
	readonly items: readonly SceneItem[];
}

interface SceneProps extends SceneInput {
	readonly groupRef: (value: THREE.Group | null) => void;
}

interface OraclePair {
	readonly octaneContainer: ReturnType<typeof createThreeContainer>;
	readonly octaneRoot: ReturnType<typeof createUniversalRoot>;
	readonly octaneRefs: Array<THREE.Group | null>;
	readonly reactCanvas: HTMLCanvasElement;
	readonly reactRoot: ReconcilerRoot<HTMLCanvasElement>;
	readonly reactStore: RootStore;
	readonly reactRefs: Array<THREE.Group | null>;
	render(input: SceneInput): Promise<void>;
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
	} as unknown as THREE.WebGLRenderer;
}

function rootGroup(scene: THREE.Scene): THREE.Group {
	const group = scene.children[0];
	if (!(group instanceof THREE.Group)) throw new Error('Expected one root Three.Group.');
	return group;
}

function meshesByName(group: THREE.Group): Map<string, THREE.Mesh> {
	return new Map(
		group.children.map((child) => {
			if (!(child instanceof THREE.Mesh)) throw new Error('Expected only Three.Mesh children.');
			return [child.name, child];
		}),
	);
}

function expectMatchedGraph(pair: OraclePair): void {
	expect(serializeThreeGraph(pair.octaneContainer.scene)).toEqual(
		serializeThreeGraph(pair.reactStore.getState().scene),
	);
}

async function loadReactScene(): Promise<React.ComponentType<SceneProps>> {
	const file = resolve(__dirname, '.react-cache/basic.three.js');
	const module = (await import(/* @vite-ignore */ file)) as {
		BasicScene?: React.ComponentType<SceneProps>;
	};
	if (module.BasicScene === undefined) {
		throw new Error('The @tsrx/react oracle did not export BasicScene.');
	}
	return module.BasicScene;
}

async function mountOraclePair(input: SceneInput): Promise<OraclePair> {
	const ReactScene = await loadReactScene();
	const octaneRefs: Array<THREE.Group | null> = [];
	const reactRefs: Array<THREE.Group | null> = [];
	const octaneRef = (value: THREE.Group | null) => {
		octaneRefs.push(value);
	};
	const reactRef = (value: THREE.Group | null) => {
		reactRefs.push(value);
	};
	const octaneContainer = createThreeContainer({
		environment: {
			// Tests drain explicitly after asserting ref/layout ordering.
			scheduleDispose() {},
		},
	});
	const octaneRoot = createUniversalRoot(octaneContainer, createThreeDriver());
	const reactCanvas = document.createElement('canvas');
	const reactRoot = createReactThreeRoot(reactCanvas);
	const renderer = noWebGLRenderer(reactCanvas);
	const getContext = vi.spyOn(reactCanvas, 'getContext');
	await reactRoot.configure({
		gl: renderer,
		frameloop: 'never',
		dpr: 1,
		size: { width: 64, height: 64, top: 0, left: 0 },
	});

	octaneRoot.render(BasicScene, { ...input, groupRef: octaneRef });
	let reactStore!: RootStore;
	await reactThreeAct(async () => {
		reactStore = reactRoot.render(
			React.createElement(ReactScene, { ...input, groupRef: reactRef }),
		);
	});
	expect(getContext).not.toHaveBeenCalled();

	return {
		octaneContainer,
		octaneRoot,
		octaneRefs,
		reactCanvas,
		reactRoot,
		reactStore,
		reactRefs,
		async render(nextInput) {
			octaneRoot.render(BasicScene, { ...nextInput, groupRef: octaneRef });
			await reactThreeAct(async () => {
				reactRoot.render(React.createElement(ReactScene, { ...nextInput, groupRef: reactRef }));
			});
		},
	};
}

const firstItems: readonly SceneItem[] = [
	{
		id: 'amber',
		name: 'amber',
		position: [-2, 0, 0],
		scale: [1, 1, 1],
		size: [1, 2, 1],
		color: '#ffbf00',
	},
	{
		id: 'blue',
		name: 'blue',
		position: [0, 0, 0],
		scale: [1, 1, 1],
		size: [2, 1, 1],
		color: '#0066ff',
	},
	{
		id: 'cyan',
		name: 'cyan',
		position: [2, 0, 0],
		scale: [1, 1, 1],
		size: [1, 1, 2],
		color: '#00ffff',
	},
];

describe('R3F 9.6.1 scene oracle', () => {
	it('matches mount, prop updates, keyed moves, reconstruction, and unmount', async () => {
		const initial: SceneInput = {
			groupArgs: ['revision-one'],
			name: 'root',
			position: [0, 1, 0],
			items: firstItems,
		};
		const pair = await mountOraclePair(initial);
		let octaneUnmounted = false;
		try {
			expectMatchedGraph(pair);
			const initialOctaneRoot = rootGroup(pair.octaneContainer.scene);
			const initialReactRoot = rootGroup(pair.reactStore.getState().scene);
			const initialOctaneMeshes = meshesByName(initialOctaneRoot);
			const initialReactMeshes = meshesByName(initialReactRoot);
			const initialOctaneAmberGeometry = initialOctaneMeshes.get('amber')!.geometry;
			const initialOctaneAmberMaterial = initialOctaneMeshes.get('amber')!.material;
			const initialReactAmberGeometry = initialReactMeshes.get('amber')!.geometry;
			const initialReactAmberMaterial = initialReactMeshes.get('amber')!.material;
			expect(initialOctaneRoot.children.map((child) => child.name)).toEqual([
				'amber',
				'blue',
				'cyan',
			]);
			expect(pair.octaneRefs).toEqual([initialOctaneRoot]);
			expect(pair.reactRefs).toEqual([initialReactRoot]);

			const updatedItems: readonly SceneItem[] = [
				{
					...firstItems[0],
					position: [-3, 1, 0],
					scale: [1.5, 1.5, 1.5],
					color: '#ff3300',
				},
				firstItems[1],
				firstItems[2],
			];
			await pair.render({
				...initial,
				name: 'updated-root',
				position: [0, 2, 0],
				items: updatedItems,
			});
			expectMatchedGraph(pair);
			const updatedOctaneRoot = rootGroup(pair.octaneContainer.scene);
			const updatedReactRoot = rootGroup(pair.reactStore.getState().scene);
			expect(updatedOctaneRoot).toBe(initialOctaneRoot);
			expect(updatedReactRoot).toBe(initialReactRoot);
			expect(meshesByName(updatedOctaneRoot).get('amber')).toBe(initialOctaneMeshes.get('amber'));
			expect(meshesByName(updatedReactRoot).get('amber')).toBe(initialReactMeshes.get('amber'));
			expect(initialOctaneMeshes.get('amber')!.geometry).toBe(initialOctaneAmberGeometry);
			expect(initialOctaneMeshes.get('amber')!.material).toBe(initialOctaneAmberMaterial);
			expect(initialReactMeshes.get('amber')!.geometry).toBe(initialReactAmberGeometry);
			expect(initialReactMeshes.get('amber')!.material).toBe(initialReactAmberMaterial);
			expect(pair.octaneRefs).toHaveLength(1);
			expect(pair.reactRefs).toHaveLength(1);

			const reorderedItems = [updatedItems[2], updatedItems[0], updatedItems[1]];
			await pair.render({
				...initial,
				name: 'updated-root',
				position: [0, 2, 0],
				items: reorderedItems,
			});
			expectMatchedGraph(pair);
			const reorderedOctaneRoot = rootGroup(pair.octaneContainer.scene);
			const reorderedReactRoot = rootGroup(pair.reactStore.getState().scene);
			expect(reorderedOctaneRoot.children).toEqual([
				initialOctaneMeshes.get('cyan'),
				initialOctaneMeshes.get('amber'),
				initialOctaneMeshes.get('blue'),
			]);
			expect(reorderedReactRoot.children).toEqual([
				initialReactMeshes.get('cyan'),
				initialReactMeshes.get('amber'),
				initialReactMeshes.get('blue'),
			]);

			const octaneOldDispose = vi.fn();
			const reactOldDispose = vi.fn();
			Object.assign(reorderedOctaneRoot, { dispose: octaneOldDispose });
			Object.assign(reorderedReactRoot, { dispose: reactOldDispose });
			const orderedOctaneChildren = [...reorderedOctaneRoot.children];
			const orderedReactChildren = [...reorderedReactRoot.children];
			await pair.render({
				groupArgs: ['revision-two'],
				name: 'updated-root',
				position: [0, 2, 0],
				items: reorderedItems,
			});
			pair.octaneContainer.flushDisposals();
			expectMatchedGraph(pair);
			const reconstructedOctaneRoot = rootGroup(pair.octaneContainer.scene);
			const reconstructedReactRoot = rootGroup(pair.reactStore.getState().scene);
			expect(reconstructedOctaneRoot).not.toBe(reorderedOctaneRoot);
			expect(reconstructedReactRoot).not.toBe(reorderedReactRoot);
			expect(reconstructedOctaneRoot.children).toEqual(orderedOctaneChildren);
			expect(reconstructedReactRoot.children).toEqual(orderedReactChildren);
			expect(pair.octaneRefs).toEqual([reorderedOctaneRoot, null, reconstructedOctaneRoot]);
			expect(pair.reactRefs[0]).toBe(reorderedReactRoot);
			expect(pair.reactRefs.at(-1)).toBe(reconstructedReactRoot);
			expect(pair.reactRefs.slice(1).every((value) => value === reconstructedReactRoot)).toBe(true);
			expect(octaneOldDispose).toHaveBeenCalledOnce();
			expect(reactOldDispose).toHaveBeenCalledOnce();

			const octaneFinalDispose = vi.fn();
			const reactFinalDispose = vi.fn();
			Object.assign(reconstructedOctaneRoot, { dispose: octaneFinalDispose });
			Object.assign(reconstructedReactRoot, { dispose: reactFinalDispose });
			pair.octaneRoot.unmount();
			octaneUnmounted = true;
			pair.octaneContainer.flushDisposals();
			await reactThreeAct(async () => {
				pair.reactRoot.render(null);
			});
			expectMatchedGraph(pair);
			expect(pair.octaneContainer.scene.children).toEqual([]);
			expect(pair.reactStore.getState().scene.children).toEqual([]);
			expect(pair.octaneContainer.instanceCount).toBe(0);
			expect(pair.octaneRefs.at(-1)).toBeNull();
			expect(pair.reactRefs.at(-1)).toBeNull();
			expect(octaneFinalDispose).toHaveBeenCalledOnce();
			expect(reactFinalDispose).toHaveBeenCalledOnce();
		} finally {
			if (!octaneUnmounted) {
				pair.octaneRoot.unmount();
				pair.octaneContainer.flushDisposals();
			}
			await reactThreeAct(async () => pair.reactRoot.unmount());
			pair.reactCanvas.remove();
		}
	});
});
