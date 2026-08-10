import { describe, expect, it } from 'vitest';
import { Suspense } from '../src/index.js';
import { COMPONENT_FLAG_BOUNDARY, hasComponentFlags } from '../src/component-flags.js';

describe('component boundary capabilities', () => {
	it('recognizes own boundary capabilities when Object.hasOwn is unavailable', () => {
		const original = Object.getOwnPropertyDescriptor(Object, 'hasOwn')!;
		let recognized = false;
		let inherited = false;
		function InheritedBoundary() {}
		Object.setPrototypeOf(InheritedBoundary, Suspense);

		try {
			Object.defineProperty(Object, 'hasOwn', {
				configurable: true,
				writable: true,
				value: undefined,
			});
			recognized = hasComponentFlags(Suspense, COMPONENT_FLAG_BOUNDARY);
			inherited = hasComponentFlags(InheritedBoundary, COMPONENT_FLAG_BOUNDARY);
		} finally {
			Object.defineProperty(Object, 'hasOwn', original);
		}

		expect(recognized).toBe(true);
		expect(inherited).toBe(false);
	});
});
