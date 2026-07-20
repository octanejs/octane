// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { resolveOctaneConfig } from '../src/config.js';

describe('adapter server targets', () => {
	it('accepts the node server target without custom runtime primitives', () => {
		const adapter = { serverTarget: 'node' as const };
		expect(resolveOctaneConfig({ adapter }).adapter).toBe(adapter);
	});

	it('accepts a webworker adapter with platform runtime primitives', () => {
		const adapter = {
			serverTarget: 'webworker' as const,
			runtime: {
				hash: () => '00000000',
				createAsyncContext: <T>() => ({
					run: <R>(_store: T, fn: () => R | Promise<R>) => fn(),
					getStore: (): T | undefined => undefined,
				}),
			},
		};
		expect(resolveOctaneConfig({ adapter }).adapter).toBe(adapter);
	});

	it.each([
		{},
		{ runtime: {} },
		{ runtime: { hash: () => '00000000' } },
		{ runtime: { createAsyncContext: () => ({ run: () => undefined }) } },
	])('rejects a webworker adapter without complete runtime primitives', (shape) => {
		expect(() =>
			resolveOctaneConfig({
				adapter: {
					serverTarget: 'webworker',
					...shape,
				} as never,
			}),
		).toThrow('webworker adapter must provide runtime.hash and runtime.createAsyncContext');
	});

	it('rejects unsupported server targets', () => {
		expect(() =>
			resolveOctaneConfig({
				adapter: {
					// @ts-expect-error Exercise runtime validation for JavaScript configs.
					serverTarget: 'edge',
				},
			}),
		).toThrow("adapter.serverTarget must be 'node' or 'webworker'");
	});
});
