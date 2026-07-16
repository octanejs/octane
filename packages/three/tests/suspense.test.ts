import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { create } from '@octanejs/three/testing';
import {
	ActivityScene,
	PrimitiveSuspenseScene,
	ReconstructionSuspenseScene,
	SuspenseScene,
} from './_fixtures/suspense.three.tsrx';

interface Deferred<T> {
	readonly promise: Promise<T>;
	resolve(value: T): void;
	reject(error: unknown): void;
}

function deferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((done, fail) => {
		resolve = done;
		reject = fail;
	});
	return { promise, resolve, reject };
}

async function flushSuspenseWork(): Promise<void> {
	for (let index = 0; index < 8; index++) await Promise.resolve();
}

function sceneProps(
	resource: Promise<string> | null,
	external: THREE.Object3D,
	refs: {
		primary: (value: THREE.Group | null) => void;
		fallback: (value: THREE.Group | null) => void;
		geometry: (value: THREE.BoxGeometry | null) => void;
		error: (value: THREE.Group | null) => void;
	},
) {
	return {
		resource,
		name: 'asset-ready',
		external,
		primaryRef: refs.primary,
		fallbackRef: refs.fallback,
		geometryRef: refs.geometry,
		errorRef: refs.error,
	};
}

afterEach(() => {
	vi.useRealTimers();
});

describe('Three Suspense and Activity lifecycle', () => {
	it('publishes only the fallback while an initially suspended asset has no scene object', async () => {
		const asset = deferred<string>();
		const external = new THREE.Object3D();
		const primaryRefs: Array<THREE.Group | null> = [];
		let fallback: THREE.Group | null = null;
		let geometry: THREE.BoxGeometry | null = null;
		const testRoot = await create(
			SuspenseScene,
			sceneProps(asset.promise, external, {
				primary: (value) => primaryRefs.push(value),
				fallback: (value) => (fallback = value),
				geometry: (value) => (geometry = value),
				error() {},
			}),
		);

		try {
			expect(testRoot.scene.children).toEqual([fallback]);
			expect(fallback?.name).toBe('asset-pending');
			expect(primaryRefs).toEqual([]);
			expect(geometry).toBeNull();
			expect(external.parent).toBeNull();

			asset.resolve('asset-loaded');
			await asset.promise;
			await flushSuspenseWork();

			const primary = testRoot.scene.children[0] as THREE.Group;
			expect(testRoot.scene.children).toEqual([primary]);
			expect(primary.name).toBe('asset-loaded');
			expect(primary.visible).toBe(true);
			expect(primaryRefs).toEqual([primary]);
			expect(external.parent).toBe(primary);
			expect(geometry).toBeInstanceOf(THREE.BoxGeometry);
		} finally {
			testRoot.unmount();
		}
	});

	it('keeps committed Three identity hidden beside a fallback and restores it on resolve', async () => {
		const asset = deferred<string>();
		const external = new THREE.Object3D();
		const primaryRefs: Array<THREE.Group | null> = [];
		const fallbackRefs: Array<THREE.Group | null> = [];
		const refs = {
			primary: (value: THREE.Group | null) => primaryRefs.push(value),
			fallback: (value: THREE.Group | null) => fallbackRefs.push(value),
			geometry() {},
			error() {},
		};
		const testRoot = await create(SuspenseScene, sceneProps(null, external, refs));

		try {
			const primary = testRoot.scene.children[0] as THREE.Group;
			expect(primary.name).toBe('asset-ready');

			testRoot.update(SuspenseScene, sceneProps(asset.promise, external, refs));
			const fallback = testRoot.scene.children[1] as THREE.Group;
			expect(testRoot.scene.children).toEqual([primary, fallback]);
			expect(primary.visible).toBe(false);
			expect(fallback.name).toBe('asset-pending');
			expect(fallback.visible).toBe(true);
			expect(primaryRefs).toEqual([primary, null]);

			asset.resolve('asset-updated');
			await asset.promise;
			await flushSuspenseWork();

			expect(testRoot.scene.children).toEqual([primary]);
			expect(primary.visible).toBe(true);
			expect(primary.name).toBe('asset-updated');
			expect(primaryRefs).toEqual([primary, null, primary]);
			expect(fallbackRefs.at(-1)).toBeNull();
		} finally {
			testRoot.unmount();
		}
	});

	it('releases rejected owned resources without disposing external primitives or double-disposing', async () => {
		const asset = deferred<string>();
		const external = Object.assign(new THREE.Object3D(), { dispose: vi.fn() });
		let geometry: THREE.BoxGeometry | null = null;
		const refs = {
			primary() {},
			fallback() {},
			geometry: (value: THREE.BoxGeometry | null) => {
				if (value !== null) geometry = value;
			},
			error() {},
		};
		const testRoot = await create(SuspenseScene, sceneProps(null, external, refs));
		const ownedGeometry = geometry!;
		const disposeOwned = vi.spyOn(ownedGeometry, 'dispose');

		testRoot.update(SuspenseScene, sceneProps(asset.promise, external, refs));
		asset.reject(new Error('asset unavailable'));
		await asset.promise.catch(() => undefined);
		await flushSuspenseWork();

		expect(testRoot.scene.children).toHaveLength(1);
		expect(testRoot.scene.children[0].name).toBe('asset-error:asset unavailable');
		expect(external.parent).toBeNull();
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
		expect(disposeOwned).toHaveBeenCalledOnce();
		expect(external.dispose).not.toHaveBeenCalled();

		testRoot.unmount();
		expect(disposeOwned).toHaveBeenCalledOnce();
		expect(external.dispose).not.toHaveBeenCalled();
	});

	it('retains one Activity object while toggling its public visibility', async () => {
		const refs: Array<THREE.Group | null> = [];
		const objectRef = (value: THREE.Group | null) => refs.push(value);
		const testRoot = await create(ActivityScene, {
			mode: 'hidden',
			visible: true,
			objectRef,
		});

		try {
			const object = testRoot.scene.children[0] as THREE.Group;
			expect(object.name).toBe('activity-object');
			expect(object.visible).toBe(false);

			testRoot.update(ActivityScene, { mode: 'visible', visible: true, objectRef });
			expect(testRoot.scene.children[0]).toBe(object);
			expect(object.visible).toBe(true);

			testRoot.update(ActivityScene, { mode: 'hidden', visible: true, objectRef });
			expect(testRoot.scene.children[0]).toBe(object);
			expect(object.visible).toBe(false);

			testRoot.update(ActivityScene, { mode: 'hidden', visible: false, objectRef });
			testRoot.update(ActivityScene, { mode: 'visible', visible: false, objectRef });
			expect(testRoot.scene.children[0]).toBe(object);
			expect(object.visible).toBe(false);
		} finally {
			testRoot.unmount();
		}
	});

	it('restores hidden primitive visibility when alternating suspended assets leave the scene', async () => {
		const firstAsset = deferred<THREE.Object3D>();
		const secondAsset = deferred<THREE.Object3D>();
		const first = new THREE.Object3D();
		first.name = 'first';
		const second = new THREE.Object3D();
		second.name = 'second';
		const fallback = new THREE.Object3D();
		fallback.name = 'primitive-pending';
		const testRoot = await create(PrimitiveSuspenseScene, {
			resource: firstAsset.promise,
			fallback,
		});

		try {
			expect(testRoot.scene.children).toEqual([fallback]);
			expect(first.visible).toBe(true);

			firstAsset.resolve(first);
			await firstAsset.promise;
			await flushSuspenseWork();
			expect(testRoot.scene.children).toEqual([first]);

			testRoot.update(PrimitiveSuspenseScene, {
				resource: secondAsset.promise,
				fallback,
			});
			expect(testRoot.scene.children).toEqual([first, fallback]);
			expect(first.visible).toBe(false);
			expect(second.visible).toBe(true);

			secondAsset.resolve(second);
			await secondAsset.promise;
			await flushSuspenseWork();
			expect(testRoot.scene.children).toEqual([second]);
			expect(first.parent).toBeNull();
			expect(first.visible).toBe(true);
			expect(fallback.parent).toBeNull();
			expect(fallback.visible).toBe(true);

			testRoot.update(PrimitiveSuspenseScene, {
				resource: firstAsset.promise,
				fallback,
			});
			expect(testRoot.scene.children).toEqual([first]);
			expect(second.parent).toBeNull();
			expect(second.visible).toBe(true);
		} finally {
			testRoot.unmount();
		}
	});

	it('publishes reconstructed attachments, refs, and layout only after suspended work completes', async () => {
		const asset = deferred<string>();
		const attached: Array<{ object: THREE.Group; children: string[] }> = [];
		const referenced: Array<{ object: THREE.Group; children: string[] } | null> = [];
		const layouts: Array<{ object: THREE.Group; children: string[] }> = [];
		const attach = (parentValue: unknown, selfValue: unknown) => {
			const parent = parentValue as THREE.Group;
			const object = selfValue as THREE.Group;
			attached.push({ object, children: object.children.map((child) => child.name) });
			parent.userData.tool = object;
			return () => {
				if (parent.userData.tool === object) delete parent.userData.tool;
			};
		};
		const objectRef = (object: THREE.Group | null) =>
			referenced.push(
				object === null ? null : { object, children: object.children.map((child) => child.name) },
			);
		const onLayout = (object: THREE.Group) =>
			layouts.push({ object, children: object.children.map((child) => child.name) });
		const initialArgs = [1] as const;
		const replacementArgs = [2] as const;
		const testRoot = await create(ReconstructionSuspenseScene, {
			resource: null,
			args: initialArgs,
			attach,
			objectRef,
			onLayout,
		});

		try {
			const parent = testRoot.scene.children[0] as THREE.Group;
			const initial = parent.userData.tool as THREE.Group;
			expect(attached).toEqual([{ object: initial, children: ['complete-child'] }]);
			expect(referenced).toEqual([{ object: initial, children: ['complete-child'] }]);
			expect(layouts).toEqual([{ object: initial, children: ['complete-child'] }]);

			testRoot.update(ReconstructionSuspenseScene, {
				resource: asset.promise,
				args: replacementArgs,
				attach,
				objectRef,
				onLayout,
			});
			expect(parent.userData.tool).toBeUndefined();
			expect(parent.children.map((child) => child.name)).toEqual(['reconstruction-pending']);
			expect(attached).toHaveLength(1);
			expect(referenced).toEqual([{ object: initial, children: ['complete-child'] }, null]);
			expect(layouts).toHaveLength(1);

			asset.resolve('reconstruction-updated');
			await asset.promise;
			await flushSuspenseWork();
			const replacement = parent.userData.tool as THREE.Group;
			expect(replacement).not.toBe(initial);
			expect(parent.children).toEqual([]);
			expect(attached).toEqual([
				{ object: initial, children: ['complete-child'] },
				{ object: replacement, children: ['complete-child'] },
			]);
			expect(referenced.at(-1)).toEqual({
				object: replacement,
				children: ['complete-child'],
			});
			expect(layouts.at(-1)).toEqual({
				object: replacement,
				children: ['complete-child'],
			});
		} finally {
			testRoot.unmount();
		}
	});
});
