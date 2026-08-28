// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { resolveOctaneConfig } from '../src/config.js';

describe('Strong mode configuration', () => {
	it('keeps Strong mode opt-in by default', () => {
		expect(resolveOctaneConfig({}).compiler.strong).toBe(false);
	});

	it.each([true, false])('preserves compiler.strong=%s', (strong) => {
		const config = resolveOctaneConfig({ compiler: { strong } });
		expect(config.compiler.strong).toBe(strong);
		expect(resolveOctaneConfig(config).compiler.strong).toBe(strong);
	});

	it.each(['true', 1, null, {}])('rejects non-boolean compiler.strong=%j', (strong) => {
		expect(() =>
			resolveOctaneConfig({
				compiler: {
					// @ts-expect-error JavaScript configuration still receives runtime validation.
					strong,
				},
			}),
		).toThrow('[octane] compiler.strong must be a boolean when provided.');
	});
});

describe('experimental native read configuration', () => {
	it('keeps native reads disabled by default', () => {
		expect(resolveOctaneConfig({}).compiler.nativeReads).toBe(false);
	});

	it.each([true, false])(
		'preserves compiler.nativeReads=%s through re-resolution',
		(nativeReads) => {
			const config = resolveOctaneConfig({ compiler: { nativeReads } });
			expect(config.compiler.nativeReads).toBe(nativeReads);
			expect(resolveOctaneConfig(config).compiler.nativeReads).toBe(nativeReads);
			expect(config.compiler.strong).toBe(false);
		},
	);

	it.each(['true', 1, null, {}])('rejects non-boolean compiler.nativeReads=%j', (nativeReads) => {
		expect(() =>
			resolveOctaneConfig({
				compiler: {
					// @ts-expect-error JavaScript configuration still receives runtime validation.
					nativeReads,
				},
			}),
		).toThrow('[octane] compiler.nativeReads must be a boolean when provided.');
	});
});

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

describe('server-function security configuration', () => {
	it('defaults to a one-mebibyte same-origin request policy', () => {
		expect(resolveOctaneConfig({}).server.rpc).toEqual({
			allowedOrigins: [],
			maxBodyBytes: 1_048_576,
		});
	});

	it('normalizes configured additional browser origins', () => {
		expect(
			resolveOctaneConfig({
				server: {
					rpc: {
						allowedOrigins: ['HTTPS://Trusted.Octane.Test:443'],
						maxBodyBytes: 4096,
					},
				},
			}).server.rpc,
		).toEqual({
			allowedOrigins: ['https://trusted.octane.test'],
			maxBodyBytes: 4096,
		});
	});

	it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
		'rejects the invalid maximum request size %s',
		(maxBodyBytes) => {
			expect(() => resolveOctaneConfig({ server: { rpc: { maxBodyBytes } } })).toThrow(
				'server.rpc.maxBodyBytes must be a positive safe integer',
			);
		},
	);

	it.each([
		'*',
		'null',
		'http://trusted.octane.test/path',
		'https://trusted.octane.test?token=secret',
		'https://user:password@trusted.octane.test',
		'file:///tmp/action',
	])('rejects the unsafe allowed origin %s', (origin) => {
		expect(() => resolveOctaneConfig({ server: { rpc: { allowedOrigins: [origin] } } })).toThrow(
			'server.rpc.allowedOrigins must contain only HTTP or HTTPS origins',
		);
	});

	it('rejects a non-array origin allowlist', () => {
		expect(() =>
			resolveOctaneConfig({
				server: {
					rpc: {
						// @ts-expect-error JavaScript configuration still receives runtime validation.
						allowedOrigins: 'https://trusted.octane.test',
					},
				},
			}),
		).toThrow('server.rpc.allowedOrigins must be an array');
	});
});
