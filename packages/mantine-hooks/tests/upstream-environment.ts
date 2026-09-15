import { vi } from 'vitest';

// Preserve the pinned Jest environment while running the identical suite in Vitest.
Object.assign(globalThis, { jest: vi });
await import('../upstream-artifact/git-support/jsdom.mocks');

// Upstream assigns page coordinates after MouseEvent construction. Preserve the
// normal jsdom getters, while allowing those legacy fixture assignments.
for (const property of ['pageX', 'pageY'] as const) {
	const descriptor = Object.getOwnPropertyDescriptor(MouseEvent.prototype, property)!;
	Object.defineProperty(MouseEvent.prototype, property, {
		...descriptor,
		set(value: number) {
			Object.defineProperty(this, property, {
				configurable: true,
				enumerable: true,
				writable: true,
				value,
			});
		},
	});
}
