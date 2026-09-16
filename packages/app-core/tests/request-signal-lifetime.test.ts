// @vitest-environment node
import { AsyncLocalStorage } from 'node:async_hooks';
import { describe, expect, it } from 'vitest';
import {
	captureSignalOwner,
	currentSignalOwner,
	installSignalOwnerEnvironment,
	retireSignalOwnerIdentity,
	signal$,
} from 'octane/signals';
import type { RpcRequestOptions, SignalRequestHooks } from '@octanejs/app-core';
import { createContext } from '../src/server/middleware.js';
import { runServerRequest } from '../src/server/signal-owners.js';

describe('request-owned module signals', () => {
	it('rejects a context provider that defers synchronous signal entry without running late work', async () => {
		let environment!: Parameters<SignalRequestHooks['install']>[0];
		const storage: RpcRequestOptions['asyncContext'] = {
			getStore: () => undefined,
			async run(_store, callback) {
				await Promise.resolve();
				return callback();
			},
		};
		const hooks: SignalRequestHooks = {
			install(value) {
				environment = value;
				return () => {};
			},
			retire: retireSignalOwnerIdentity,
		};
		const context = createContext(new Request('https://octane.test/'), {});
		await runServerRequest(storage, { context }, hooks, async () => new Response(null));
		let invoked = false;
		expect(() =>
			environment.run({ scopeKey: 'explicit' }, () => {
				invoked = true;
			}),
		).toThrow('synchronous request-context entry');
		await Promise.resolve();
		expect(invoked).toBe(false);
	});

	it('isolates concurrent requests through later body pulls and fences completed request callbacks', async () => {
		const storage = new AsyncLocalStorage<
			NonNullable<ReturnType<RpcRequestOptions['asyncContext']['getStore']>>
		>();
		let restore = () => {};
		const hooks: SignalRequestHooks = {
			install(environment) {
				restore = installSignalOwnerEnvironment(environment);
				return restore;
			},
			retire: retireSignalOwnerIdentity,
		};
		const draft$ = signal$('request-draft', '');
		let lateRead!: () => string;
		const request = async (name: string) => {
			const context = createContext(new Request('https://octane.test/'), {});
			const response = await runServerRequest(storage, { context }, hooks, async () => {
				draft$.set(name);
				const capture = captureSignalOwner(currentSignalOwner()!);
				if (name === 'A') lateRead = () => capture(() => draft$.get());
				await Promise.resolve();
				expect(draft$.get()).toBe(name);
				return new Response(
					new ReadableStream(
						{
							pull(controller) {
								controller.enqueue(new TextEncoder().encode(draft$.get()));
								controller.close();
							},
						},
						{ highWaterMark: 0 },
					),
				);
			});
			return response.text();
		};
		try {
			await expect(Promise.all([request('A'), request('B')])).resolves.toEqual(['A', 'B']);
			expect(lateRead).toThrow(/retired|disposed/i);
		} finally {
			restore();
		}
	});

	it('retires a canceled response even when its source ignores cancellation', async () => {
		const storage = new AsyncLocalStorage<
			NonNullable<ReturnType<RpcRequestOptions['asyncContext']['getStore']>>
		>();
		let restore = () => {};
		const hooks: SignalRequestHooks = {
			install(environment) {
				restore = installSignalOwnerEnvironment(environment);
				return restore;
			},
			retire: retireSignalOwnerIdentity,
		};
		const state$ = signal$('canceled-request', 'ready');
		const cancellation = new AbortController();
		const context = createContext(
			new Request('https://octane.test/', { signal: cancellation.signal }),
			{},
		);
		let lateRead!: () => string;
		try {
			await runServerRequest(storage, { context }, hooks, async () => {
				expect(state$.get()).toBe('ready');
				const capture = captureSignalOwner(currentSignalOwner()!);
				lateRead = () => capture(() => state$.get());
				return new Response(new ReadableStream({ cancel: () => new Promise(() => {}) }));
			});
			cancellation.abort();
			expect(lateRead).toThrow(/retired|disposed/i);
		} finally {
			restore();
		}
	});
});
