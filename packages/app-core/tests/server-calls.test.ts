import { AsyncLocalStorage } from 'node:async_hooks';
import { describe, expect, it } from 'vitest';
import type { Middleware, RpcRequestOptions } from '@octanejs/app-core';
import { __registerServerFunction, batchServerCalls, type ServerCallContext } from 'octane/server';
import { createContext } from '../src/server/middleware.js';
import { createServerCallHost } from '../src/server/server-calls.js';
import {
	getRequestContext,
	setRequestContextSource,
	tryGetRequestContext,
} from '../src/server/request-context.js';

function host(middlewares: Middleware[]) {
	const storage = new AsyncLocalStorage<Parameters<RpcRequestOptions['asyncContext']['run']>[0]>();
	const parent = createContext(new Request('https://octane.test/'), {});
	const serverCallHost = createServerCallHost(parent, {
		asyncContext: storage,
		origin: 'https://octane.test',
		middlewares,
	});
	setRequestContextSource(storage);
	return {
		parent,
		run: <T>(fn: () => T) => storage.run({ context: parent, serverCallHost }, fn),
	};
}

describe('in-process server-function authorization', () => {
	it('runs an SSR batch through each call authorization without a slow-member barrier', async () => {
		const authorized: string[] = [];
		const request = host([
			async (context, next) => {
				authorized.push(context.rpc!.export!);
				context.viewer = context.rpc!.export;
				return next();
			},
		]);
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const read = (name: string) =>
			__registerServerFunction(
				async (context: ServerCallContext) => {
					if (name === 'slow') await gate;
					return context.viewer;
				},
				0,
				{ id: 'deadbeef', module: '/read.ts', export: name },
			);
		const policy = {
			kind: 'independent-reads',
			authority: 'viewer',
			document: 'document',
		} as const;
		let callbacks = 0;
		try {
			const result = request.run(() =>
				batchServerCalls(policy, () => {
					callbacks++;
					return { slow: read('slow')(), fast: read('fast')() };
				}),
			);
			expect(callbacks).toBe(1);
			await expect(result.fast).resolves.toBe('fast');
			expect(authorized).toEqual(['slow', 'fast']);
			release();
			await expect(result.slow).resolves.toBe('slow');
			expect(() =>
				batchServerCalls({ ...policy, timeoutMs: 0 }, () => {
					callbacks++;
				}),
			).toThrow(RangeError);
			expect(callbacks).toBe(1);
		} finally {
			release();
		}
	});

	it('isolates concurrent invocation targets, viewers, and middleware state', async () => {
		const authorized: string[] = [];
		const request = host([
			async (context, next) => {
				const name = context.rpc!.export!;
				await Promise.resolve();
				context.viewer = name;
				context.state.set('target', name);
				authorized.push(name);
				return next();
			},
		]);
		const makeRead = (name: string) =>
			__registerServerFunction(
				async (context: ServerCallContext) => {
					await Promise.resolve();
					return [
						context.viewer,
						getRequestContext().rpc?.export,
						getRequestContext().state.get('target'),
					];
				},
				0,
				{ id: 'deadbeef', module: '/read.ts', export: name },
			);
		await expect(
			request.run(() => Promise.all([makeRead('A')(), makeRead('B')()])),
		).resolves.toEqual([
			['A', 'A', 'A'],
			['B', 'B', 'B'],
		]);
		expect(authorized).toEqual(['A', 'B']);
		expect(request.parent.rpc).toBeUndefined();
		expect(request.parent.viewer).toBeUndefined();
		expect(request.parent.state.has('target')).toBe(false);
		expect(tryGetRequestContext()).toBeNull();
	});

	it('does not execute a function denied by its invocation middleware', async () => {
		let invoked = false;
		const request = host([() => new Response(null, { status: 403 })]);
		const denied = __registerServerFunction(
			(_context: ServerCallContext) => {
				invoked = true;
			},
			0,
			{ id: 'deadbeef', module: '/read.ts', export: 'denied' },
		);
		await expect(request.run(() => denied())).rejects.toMatchObject({
			code: 'OCTANE_SERVER_CALL_REJECTED',
			status: 403,
			invoked: false,
		});
		expect(invoked).toBe(false);
	});

	it('keeps authorization and request context across later stream pulls and cleanup', async () => {
		const request = host([
			async (context, next) => {
				context.viewer = context.rpc!.export;
				return next();
			},
		]);
		const cleaned: unknown[] = [];
		const read = __registerServerFunction(
			async function* (context: ServerCallContext) {
				try {
					yield [context.viewer, getRequestContext().viewer];
					await Promise.resolve();
					yield [context.viewer, getRequestContext().viewer];
				} finally {
					cleaned.push(getRequestContext().viewer);
				}
			},
			0,
			{ id: 'deadbeef', module: '/read.ts', export: 'stream' },
		);
		const stream = await request.run(() => read());
		// Pull after leaving the caller's async context, as a response consumer does.
		const iterator = stream[Symbol.asyncIterator]();
		expect(tryGetRequestContext()).toBeNull();
		await expect(iterator.next()).resolves.toEqual({ done: false, value: ['stream', 'stream'] });
		await expect(iterator.next()).resolves.toEqual({ done: false, value: ['stream', 'stream'] });
		await iterator.return?.();
		expect(cleaned).toEqual(['stream']);
		expect(tryGetRequestContext()).toBeNull();
	});

	it('fences an in-flight iterator value after explicit iterator cancellation', async () => {
		const request = host([]);
		let release!: (value: IteratorResult<string>) => void;
		let entered!: () => void;
		const started = new Promise<void>((resolve) => {
			entered = resolve;
		});
		const read = __registerServerFunction(
			(_context: ServerCallContext) => ({
				[Symbol.asyncIterator]() {
					return {
						next: () =>
							new Promise<IteratorResult<string>>((resolve) => {
								release = resolve;
								entered();
							}),
						return: async () => ({ done: true, value: undefined }),
					};
				},
			}),
			0,
			{ id: 'deadbeef', module: '/read.ts', export: 'stream' },
		);
		const iterator = (await request.run(() => read()))[Symbol.asyncIterator]();
		const pending = iterator.next();
		await started;
		await iterator.return();
		release({ done: false, value: 'late' });
		await expect(pending).resolves.toEqual({ done: true, value: undefined });
	});

	it('cancels one local invocation without canceling its concurrent sibling', async () => {
		const request = host([]);
		const first = new AbortController();
		const second = new AbortController();
		let release!: () => void;
		const ready = new Promise<void>((resolve) => {
			release = resolve;
		});
		const read = __registerServerFunction(
			async (context: ServerCallContext) => {
				await ready;
				context.signal.throwIfAborted();
				return 'ready';
			},
			0,
			{ id: 'deadbeef', module: '/read.ts', export: 'read' },
		);
		await request.run(async () => {
			const a = read({ signal: first.signal });
			const b = read({ signal: second.signal });
			const rejected = expect(a).rejects.toMatchObject({ name: 'AbortError' });
			first.abort();
			release();
			await rejected;
			await expect(b).resolves.toBe('ready');
		});
		expect(request.parent.request.signal.aborted).toBe(false);
	});
});
