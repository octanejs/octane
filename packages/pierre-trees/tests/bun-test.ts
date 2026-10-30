// The pinned suite takes its runner API from `bun:test`, upstream's runner.
// Both parity lanes run it on Vitest, whose API matches apart from `spyOn`,
// which Vitest keeps on `vi`.
import { vi } from 'vitest';

export { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';
export const spyOn: typeof vi.spyOn = vi.spyOn.bind(vi);

// The suite installs its JSDOM globals with `Object.assign(globalThis, …)`.
// Bun's `navigator` global is writable; Node's is a getter, which throws there.
Object.defineProperty(globalThis, 'navigator', {
	configurable: true,
	value: globalThis.navigator,
	writable: true,
});
