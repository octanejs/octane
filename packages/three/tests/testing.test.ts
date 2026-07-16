import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { create } from '@octanejs/three/testing';
import { TestingScene } from './_fixtures/testing.three.tsrx';

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('@octanejs/three deterministic testing helper', () => {
	it('mounts and updates a real root, then advances its public frame loop', async () => {
		const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
		const deltas: number[] = [];
		const testRoot = await create(
			TestingScene,
			{
				name: 'initial',
				position: [1, 2, 3],
				onFrame: (delta: number) => deltas.push(delta),
			},
			{ width: 320, height: 180 },
		);

		try {
			const group = testRoot.scene.children[0] as THREE.Group;
			expect(testRoot.root.store).toBe(testRoot.store);
			expect(testRoot.store.getState().scene).toBe(testRoot.scene);
			expect(testRoot.store.getState().size).toEqual({
				width: 320,
				height: 180,
				top: 0,
				left: 0,
			});
			expect(testRoot.store.getState().viewport.dpr).toBe(1);
			expect(testRoot.store.getState().frameloop).toBe('never');
			expect(group.name).toBe('initial');
			expect(group.position.toArray()).toEqual([1, 2, 3]);
			expect(getContext).not.toHaveBeenCalled();

			testRoot.advanceFrames(3, [0.25, 0.5]);

			expect(deltas).toEqual([0.25, 0.5, 0.5]);
			expect(group.rotation.x).toBe(1.25);
			expect(testRoot.renderer.frameCount).toBe(3);
			expect(testRoot.renderer.lastScene).toBe(testRoot.scene);
			expect(testRoot.renderer.lastCamera).toBe(testRoot.store.getState().camera);

			testRoot.update(TestingScene, {
				name: 'updated',
				position: [-1, 0, 2],
				onFrame: (delta: number) => deltas.push(delta * 10),
			});
			expect(testRoot.scene.children[0]).toBe(group);
			expect(group.name).toBe('updated');
			expect(group.position.toArray()).toEqual([-1, 0, 2]);

			testRoot.advanceFrames(1, 0.25);
			expect(deltas).toEqual([0.25, 0.5, 0.5, 2.5]);
			expect(group.rotation.x).toBe(1.5);
			expect(testRoot.renderer.frameCount).toBe(4);
		} finally {
			testRoot.unmount();
		}

		expect(testRoot.scene.children).toEqual([]);
		expect(testRoot.renderer.disposed).toBe(true);
	});

	it('uses a plain canvas-like target when no DOM is available', async () => {
		vi.stubGlobal('document', undefined);
		const testRoot = await create(TestingScene, {
			name: 'headless',
			position: [0, 0, 0],
			onFrame() {},
		});

		try {
			expect(testRoot.canvas).toEqual({
				width: 1280,
				height: 800,
				parentElement: null,
			});
			expect(testRoot.scene.getObjectByName('headless')).toBeInstanceOf(THREE.Group);
			testRoot.advanceFrames(1);
			expect(testRoot.renderer.frameCount).toBe(1);
		} finally {
			testRoot.unmount();
		}
	});
});
