import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { create, fireEvent, type MockSyntheticEvent } from '@octanejs/three/testing';
import {
	ContinuousTestingEventScene,
	PrimitiveEventScene,
	ScopedEventScene,
} from './_fixtures/events.three.tsrx';

function primitiveProps(object: THREE.Mesh, onPointerDown?: (event: MockSyntheticEvent) => void) {
	return {
		object,
		objectRef: null,
		onPointerDown,
		onPointerMove: undefined,
		onPointerOver: undefined,
		onPointerOut: undefined,
		onPointerLeave: undefined,
		onPointerMissed: undefined,
	};
}

describe('@octanejs/three direct testing events', () => {
	it('accepts handler and camel-case aliases with an R3F-shaped payload', async () => {
		const object = new THREE.Mesh();
		const received: MockSyntheticEvent[] = [];
		const testRoot = await create(
			PrimitiveEventScene,
			primitiveProps(object, (event) => received.push(event)),
		);

		try {
			const sourceEvent = { offsetX: 12, offsetY: 34, label: 'direct' };
			await fireEvent(object, 'onPointerDown', sourceEvent);
			await testRoot.fireEvent(object, 'pointerDown', { label: 'renderer' });

			expect(received).toHaveLength(2);
			expect(received[0].camera).toBe(testRoot.store.getState().camera);
			expect(received[0].sourceEvent).toBe(sourceEvent);
			expect(received[0]).toMatchObject(sourceEvent);
			expect(received[0].target).toBe(object);
			expect(received[0].currentTarget).toBe(object);
			expect(() => received[0].stopPropagation()).not.toThrow();
			expect(received[1].label).toBe('renderer');
		} finally {
			testRoot.unmount();
		}
	});

	it('uses the latest committed handler and warns without invoking a different event', async () => {
		const object = new THREE.Mesh();
		const calls: string[] = [];
		const testRoot = await create(
			PrimitiveEventScene,
			primitiveProps(object, () => calls.push('initial')),
		);
		const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});

		try {
			await testRoot.fireEvent(object, 'pointerDown');
			testRoot.update(
				PrimitiveEventScene,
				primitiveProps(object, () => calls.push('updated')),
			);
			await testRoot.fireEvent(object, 'onPointerDown');
			const missing = await testRoot.fireEvent(object, 'onPointerUp');

			expect(calls).toEqual(['initial', 'updated']);
			expect(missing).toBeUndefined();
			expect(warning).toHaveBeenCalledOnce();
			expect(warning).toHaveBeenCalledWith(expect.stringContaining('onPointerUp'));
		} finally {
			warning.mockRestore();
			testRoot.unmount();
		}
	});

	it('awaits and returns an asynchronous handler result', async () => {
		const object = new THREE.Mesh();
		let completed = false;
		const testRoot = await create(
			PrimitiveEventScene,
			primitiveProps(object, async () => {
				await Promise.resolve();
				completed = true;
				return 'handled';
			}),
		);

		try {
			const result = await testRoot.fireEvent(object, 'pointerDown');

			expect(result).toBe('handled');
			expect(completed).toBe(true);
		} finally {
			testRoot.unmount();
		}
	});

	it('commits discrete handler updates before returning to the test', async () => {
		const calls: string[] = [];
		const testRoot = await create(ScopedEventScene, {
			onEvent: (name: string) => calls.push(name),
		});

		try {
			const front = testRoot.scene.getObjectByName('front');
			expect(front).toBeInstanceOf(THREE.Mesh);
			expect(testRoot.scene.getObjectByName('rear')).toBeInstanceOf(THREE.Mesh);

			await testRoot.fireEvent(front!, 'pointerDown');

			expect(calls).toEqual(['front']);
			expect(testRoot.scene.getObjectByName('rear')).toBeUndefined();
		} finally {
			testRoot.unmount();
		}
	});

	it('settles continuous handler updates before the returned promise resolves', async () => {
		const onEvent = vi.fn();
		const testRoot = await create(ContinuousTestingEventScene, { onEvent });

		try {
			const object = testRoot.scene.getObjectByName('before');
			expect(object).toBeInstanceOf(THREE.Mesh);

			await testRoot.fireEvent(object!, 'pointerMove');

			expect(onEvent).toHaveBeenCalledOnce();
			expect(testRoot.scene.getObjectByName('after')).toBe(object);
		} finally {
			testRoot.unmount();
		}
	});
});
