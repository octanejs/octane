// Bun's test API over Vitest, so the pinned bun:test suite runs unchanged in Vitest.
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	type Mock,
	test,
	vi,
} from 'vitest';

import { NATIVE_MODULE_OVERRIDES } from './native-overrides.ts';

// The suite's setup.ts registers its platform overrides with mock.module; the Vitest
// config resolves those same modules by path instead. Any other module mock is a live
// rebinding Vitest cannot reproduce, so it fails the test rather than being ignored.
const setupModules = new Set([
	'react-native',
	'react-native/index.js',
	...NATIVE_MODULE_OVERRIDES.keys(),
]);

export const mock = Object.assign(
	<T extends (...args: any[]) => any>(implementation?: T) => vi.fn(implementation),
	{
		module(specifier: string) {
			if (!setupModules.has(specifier)) {
				throw new Error(
					`bun:test mock.module(${JSON.stringify(specifier)}) has no Vitest equivalent`,
				);
			}
		},
		restore() {
			vi.restoreAllMocks();
		},
	},
);

export const spyOn = vi.spyOn;
export type { Mock };
export { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, test };
