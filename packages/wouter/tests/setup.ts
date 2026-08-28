import { afterEach, beforeEach } from 'vitest';
import { cleanup } from '@octanejs/testing-library';

export function withoutLocation<T>(fn: () => T): T {
	const original = globalThis.location;
	// @ts-expect-error intentionally removing location for SSR simulation
	delete globalThis.location;
	try {
		return fn();
	} finally {
		globalThis.location = original;
	}
}

beforeEach(function resetHistory() {
	if (typeof history !== 'undefined') {
		history.replaceState(null, '', '/');
	}
});

afterEach(function cleanupDom() {
	cleanup();
});
