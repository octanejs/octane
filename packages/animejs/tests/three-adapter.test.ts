import { describe, expect, it } from 'vitest';
import type * as THREE from 'three';
import { animate, createScope, type JSAnimation } from '@octanejs/animejs';
import { commitChanges, getInstances, threeAdapter } from '@octanejs/animejs/adapters/three';
import { create } from '@octanejs/three/testing';
import { AnimeThreeScene } from './_fixtures/three-scene.three.tsrx';

describe('Anime.js Three adapter', () => {
	it('animates the raw object owned by @octanejs/three and leaves rendering to its frame loop', async () => {
		let mesh: THREE.Mesh | null = null;
		const root = await create(AnimeThreeScene, {
			capture(next: THREE.Mesh | null) {
				mesh = next;
			},
		});
		const scope = createScope();
		let animation: JSAnimation | undefined;
		let invalidations = 0;

		try {
			expect(mesh).not.toBeNull();
			const material = mesh!.material as THREE.MeshBasicMaterial;
			expect(threeAdapter).toBeDefined();
			expect(getInstances(mesh!)).toBeDefined();
			expect(commitChanges).toBeTypeOf('function');

			root.store.getState().setFrameloop('demand');
			scope.add(() => {
				animation = animate(mesh!, {
					x: 10,
					rotateY: 180,
					opacity: 0.25,
					duration: 1_000,
					ease: 'linear',
					autoplay: false,
					onRender: () => {
						invalidations++;
						root.store.getState().invalidate();
					},
				});
			});
			animation!.seek(500);

			expect(mesh!.position.x).toBeCloseTo(5);
			expect(mesh!.rotation.y).toBeCloseTo(Math.PI / 2);
			expect(material.opacity).toBeCloseTo(0.625);
			expect(mesh!.material).toBe(material);
			expect(invalidations).toBeGreaterThan(0);
			expect(root.renderer.frameCount).toBe(0);

			root.store.getState().advance(1);
			expect(root.renderer.frameCount).toBe(1);

			root.store.getState().setFrameloop('never');
			root.store.getState().invalidate();
			expect(root.renderer.frameCount).toBe(1);
			root.advanceFrames(1);
			expect(root.renderer.frameCount).toBe(2);

			root.store.getState().setFrameloop('always');
			root.store.getState().advance(2);
			expect(root.renderer.frameCount).toBe(3);

			scope.revert();
			expect(mesh!.position.x).toBe(0);
			expect(mesh!.rotation.y).toBe(0);
			expect(material.opacity).toBe(1);
			expect(mesh!.material).toBe(material);
		} finally {
			scope.revert();
			root.unmount();
		}
	});
});
