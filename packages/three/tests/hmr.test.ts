import { describe, expect, it, vi } from 'vitest';
import type * as THREE from 'three';
import { hmrUniversalComponent, UNIVERSAL_HMR, type UniversalComponent } from 'octane/universal';
import { flushSync } from '@octanejs/three';
import { create } from '@octanejs/three/testing';
import {
	getCompatibleHmrScene,
	getInitialHmrScene,
	getReconstructedHmrScene,
	type HmrProbe,
} from './_fixtures/hmr.three.tsrx';

type HotComponent<P> = UniversalComponent<P> & {
	readonly [UNIVERSAL_HMR]: {
		update(incoming: UniversalComponent<P>): void;
	};
};

function updateHotComponent<P>(
	component: UniversalComponent<P>,
	incoming: UniversalComponent<P>,
): void {
	flushSync(() => (component as HotComponent<P>)[UNIVERSAL_HMR].update(incoming));
}

describe('@octanejs/three HMR', () => {
	it('retains compatible objects and reconstructs changed args without stale ownership', async () => {
		const events: string[] = [];
		const meshRefs: Array<THREE.Mesh | null> = [];
		const geometryRefs: Array<THREE.BufferGeometry | null> = [];
		const probe: HmrProbe = {
			events,
			meshRef: (value) => meshRefs.push(value),
			geometryRef: (value) => geometryRefs.push(value),
		};
		const Scene = hmrUniversalComponent('three', getInitialHmrScene());
		const testRoot = await create(Scene, { probe });
		const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});

		try {
			const initialMesh = testRoot.scene.children[0] as THREE.Mesh;
			const initialGeometry = initialMesh.geometry;
			const disposeInitialGeometry = vi
				.spyOn(initialGeometry, 'dispose')
				.mockImplementation(() => {});

			await testRoot.fireEvent(initialMesh, 'pointerDown');
			updateHotComponent(Scene, getCompatibleHmrScene());

			const compatibleMesh = testRoot.scene.children[0] as THREE.Mesh;
			expect(compatibleMesh).toBe(initialMesh);
			expect(compatibleMesh.geometry).toBe(initialGeometry);
			expect(compatibleMesh.name).toBe('hmr-compatible');
			expect(compatibleMesh.position.toArray()).toEqual([2, 0, 0]);
			expect(compatibleMesh.renderOrder).toBe(0);
			expect(meshRefs).toEqual([initialMesh]);
			expect(geometryRefs).toEqual([initialGeometry]);
			expect(disposeInitialGeometry).not.toHaveBeenCalled();

			await testRoot.fireEvent(compatibleMesh, 'pointerDown');
			expect(events).toEqual(['initial', 'compatible']);

			vi.useFakeTimers();
			updateHotComponent(Scene, getReconstructedHmrScene());
			await vi.runOnlyPendingTimersAsync();

			const reconstructedMesh = testRoot.scene.children[0] as THREE.Mesh;
			const reconstructedGeometry = reconstructedMesh.geometry;
			expect(reconstructedMesh).not.toBe(initialMesh);
			expect(reconstructedGeometry).not.toBe(initialGeometry);
			expect(reconstructedMesh.name).toBe('hmr-reconstructed');
			expect(reconstructedMesh.position.toArray()).toEqual([3, 0, 0]);
			expect(meshRefs).toEqual([initialMesh, null, reconstructedMesh]);
			expect(geometryRefs).toEqual([initialGeometry, null, reconstructedGeometry]);
			expect(disposeInitialGeometry).toHaveBeenCalledOnce();

			// The retired object is no longer a public event target. Only the newly
			// committed object can reach the replacement handler.
			await testRoot.fireEvent(initialMesh, 'pointerDown');
			expect(events).toEqual(['initial', 'compatible']);
			expect(warning).toHaveBeenCalledOnce();
			await testRoot.fireEvent(reconstructedMesh, 'pointerDown');
			expect(events).toEqual(['initial', 'compatible', 'reconstructed']);

			testRoot.unmount();
			expect(meshRefs.at(-1)).toBeNull();
			expect(geometryRefs.at(-1)).toBeNull();
			expect(disposeInitialGeometry).toHaveBeenCalledOnce();
		} finally {
			testRoot.unmount();
			warning.mockRestore();
			vi.useRealTimers();
		}
	});
});
