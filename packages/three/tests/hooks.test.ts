import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createUniversalRoot, defineUniversalComponent } from 'octane/universal';
import { createThreeContainer, createThreeDriver } from '../src/core/driver.js';
import {
	buildGraph,
	getRootState,
	useFrame,
	useStore,
	type Instance,
	type ObjectMap,
	type RefObject,
	type RootState,
	type RootStore,
} from '@octanejs/three';
import { createThreeTestRenderer } from '@octanejs/three/testing';
import { HookScene } from './_fixtures/hooks.three.tsrx';

interface Selection {
	readonly width: number;
	readonly height: number;
}

interface LayoutObservation {
	readonly store: RootStore;
	readonly selectedWidth: number;
	readonly scene: THREE.Scene;
	readonly selection: Selection;
	readonly graph: ObjectMap;
	readonly object: THREE.Group;
	readonly instance: Instance<THREE.Group>;
	readonly instanceHandle: RefObject<Instance<THREE.Group>>;
}

interface FrameObservation {
	readonly state: RootState;
	readonly delta: number;
	readonly object: THREE.Group;
	readonly instance: { readonly object: THREE.Group };
}

async function flushUniversalUpdates(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
}

describe('Three hooks and graph helpers', () => {
	// OCTANE DIVERGENCE[build-graph-named-only][adapted:three-build-graph]
	// @parity-case adapted:three-build-graph
	it('collects the public named object graph', () => {
		const root = new THREE.Group();
		const firstMaterial = new THREE.MeshBasicMaterial();
		firstMaterial.name = 'shared';
		const secondMaterial = new THREE.MeshBasicMaterial();
		secondMaterial.name = 'shared';
		const first = new THREE.Mesh(new THREE.BoxGeometry(), firstMaterial);
		first.name = 'first';
		const second = new THREE.Mesh(new THREE.SphereGeometry(), secondMaterial);
		second.name = 'second';
		const unnamedFirst = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
		const unnamedSecond = new THREE.Mesh(new THREE.SphereGeometry(), new THREE.MeshBasicMaterial());
		root.add(first, unnamedFirst, second, unnamedSecond);

		const graph = buildGraph(root);

		expect(graph.nodes).toEqual({ first, second });
		expect(graph.meshes).toEqual({ first, second });
		expect(graph.materials).toEqual({ shared: firstMaterial });
	});

	it('reports the Canvas-only hook contract outside a configured root', () => {
		const Scene = defineUniversalComponent('three', () => {
			useStore();
			return null;
		});
		const container = createThreeContainer();
		const root = createUniversalRoot(container, createThreeDriver());

		expect(() => root.render(Scene, undefined)).toThrow(
			'R3F: Hooks can only be used within the Canvas component!',
		);
	});

	it('keeps the last accepted frame callback when a replacement render fails', async () => {
		const frames: string[] = [];
		const Scene = defineUniversalComponent(
			'three',
			(props: { callback: () => void; fail: boolean }) => {
				useFrame(props.callback);
				if (props.fail) throw new Error('frame callback render rejected');
				return null;
			},
		);
		const initial = () => frames.push('initial');
		const rejected = () => frames.push('rejected');
		const accepted = () => frames.push('accepted');
		const root = await createThreeTestRenderer(Scene, { callback: initial, fail: false });

		try {
			root.advanceFrames(1);
			expect(() => root.update(Scene, { callback: rejected, fail: true })).toThrow(
				'frame callback render rejected',
			);
			root.advanceFrames(1);
			expect(frames).toEqual(['initial', 'initial']);

			root.update(Scene, { callback: accepted, fail: false });
			root.advanceFrames(1);
			expect(frames).toEqual(['initial', 'initial', 'accepted']);
		} finally {
			root.unmount();
		}
	});

	// OCTANE DIVERGENCE[order-based-callable-selector][adapted:three-store-selector]
	// @parity-case adapted:three-store-selector
	it('selects root state, exposes managed handles, and keeps frame callbacks current', async () => {
		const graphRoot = new THREE.Group();
		const material = new THREE.MeshBasicMaterial();
		material.name = 'fixture-material';
		const graphMesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
		graphMesh.name = 'fixture-mesh';
		graphRoot.add(graphMesh);
		const layouts: LayoutObservation[] = [];
		const firstFrames: FrameObservation[] = [];
		const secondFrames: FrameObservation[] = [];
		const equalSelection = (previous: Selection, next: Selection) => previous.width === next.width;
		const baseProps = {
			graph: graphRoot,
			priority: 1,
			equalSelection,
			onLayout: (observation: LayoutObservation) => layouts.push(observation),
		};
		const root = await createThreeTestRenderer(
			HookScene,
			{
				...baseProps,
				onFrame: (observation: FrameObservation) => firstFrames.push(observation),
			},
			{ width: 0, height: 0 },
		);
		const { scene, store } = root;

		try {
			expect(layouts).toHaveLength(1);
			const initial = layouts[0];
			expect(initial.store).toBe(store);
			expect(initial.selectedWidth).toBe(0);
			expect(initial.scene).toBe(scene);
			expect(initial.selection).toEqual({ width: 0, height: 0 });
			expect(initial.object).toBeInstanceOf(THREE.Group);
			expect(initial.instance.object).toBe(initial.object);
			expect(initial.instanceHandle.current).toBe(initial.instance);
			expect(initial.instance.root.commits.length).toBeGreaterThan(0);
			expect(initial.graph.nodes['fixture-mesh']).toBe(graphMesh);
			expect(initial.graph.meshes['fixture-mesh']).toBe(graphMesh);
			expect(initial.graph.materials['fixture-material']).toBe(material);
			expect(getRootState(initial.object)).toBe(store.getState());

			store.getState().advance(100);
			expect(firstFrames).toEqual([
				{
					state: store.getState(),
					delta: 100,
					object: initial.object,
					instance: initial.instance,
				},
			]);

			// The custom equality function deliberately ignores height. A height-only
			// update therefore preserves the selection and does not publish a new layout.
			store.getState().setSize(0, 20);
			await flushUniversalUpdates();
			expect(layouts).toHaveLength(1);

			store.getState().setSize(10, 20);
			await flushUniversalUpdates();
			expect(layouts.at(-1)?.selectedWidth).toBe(10);
			expect(layouts.at(-1)?.selection).toEqual({ width: 10, height: 20 });

			root.update(HookScene, {
				...baseProps,
				onFrame: (observation: FrameObservation) => secondFrames.push(observation),
			});
			store.getState().advance(200);
			expect(firstFrames).toHaveLength(1);
			expect(secondFrames).toHaveLength(1);
			expect(secondFrames[0].object).toBe(initial.object);
			expect(secondFrames[0].instance).toBe(initial.instance);

			root.unmount();
			store.getState().advance(300);
			expect(firstFrames).toHaveLength(1);
			expect(secondFrames).toHaveLength(1);
			expect(initial.instanceHandle.current).toBeNull();
			expect(getRootState(initial.object)).toBeUndefined();
		} finally {
			root.unmount();
		}
	});
});
