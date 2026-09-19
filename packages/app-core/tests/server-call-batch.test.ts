import { AsyncLocalStorage } from 'node:async_hooks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __serverRpc, batchServerCalls } from 'octane';
import {
	__registerServerFunction,
	executeServerFunction,
	executeServerFunctionBatch,
	executeServerFunctionStream,
	type ServerCallContext,
} from 'octane/server';
import type { Middleware, RpcRequestOptions } from '@octanejs/app-core';
import { handleRpcRequest } from '../src/server/rpc.js';
import { encodeServerResultFrame } from '../../octane/src/server-rpc-protocol.js';

const policy = {
	kind: 'independent-reads',
	authority: 'viewer:A',
	document: 'document:A',
} as const;

function endpoint(
	functions: Record<string, (context: ServerCallContext) => unknown>,
	middlewares: Middleware[] = [],
) {
	const registry = Object.fromEntries(
		Object.entries(functions).map(([hash, fn]) => [
			hash,
			__registerServerFunction(fn, 0, { id: hash, module: '/reads.ts', export: hash }),
		]),
	);
	const requests: Request[] = [];
	const options: RpcRequestOptions = {
		asyncContext: new AsyncLocalStorage(),
		resolveFunction: (hash) => registry[hash] ?? null,
		describeFunction: (hash) => ({ module: '/reads.ts', export: hash }),
		executeServerFunction,
		streamServerFunction: executeServerFunctionStream,
		batchServerFunctions: executeServerFunctionBatch,
		middlewares,
	};
	vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
		// Model browser fetch resolution when an authored base points off-origin.
		const request = new Request(new URL(url, 'https://external-base.test/'), init);
		requests.push(request);
		return handleRpcRequest(request, options);
	});
	return { requests, options };
}

beforeEach(() => vi.stubGlobal('location', { href: 'https://octane.test/page' }));
afterEach(() => vi.unstubAllGlobals());

describe('finite server-call batches through the HTTP authorization boundary', () => {
	it('settles an outer rejection even when response-body cancellation never resolves', async () => {
		vi.stubGlobal(
			'fetch',
			async () =>
				new Response(new ReadableStream({ cancel: () => new Promise(() => {}) }), {
					status: 406,
					headers: { 'Octane-RPC-Outcome': 'rejected' },
				}),
		);
		const call = batchServerCalls({ ...policy, timeoutMs: 5 }, () =>
			__serverRpc('aaaaaaaa', [], {}, true),
		);
		const result = await Promise.race([
			call.then(
				() => 'fulfilled',
				() => 'rejected',
			),
			new Promise((resolve) => setTimeout(() => resolve('still pending'), 40)),
		]);
		expect(result).toBe('rejected');
	});

	it('preserves an authoritative outer rejection without invoking or retrying a member', async () => {
		const called = vi.fn(() => 1);
		const { options, requests } = endpoint({ aaaaaaaa: called });
		options.batchServerFunctions = undefined;
		const error = await batchServerCalls(policy, () => __serverRpc('aaaaaaaa', [], {}, true)).catch(
			(error: unknown) => error,
		);
		expect(error).toBeInstanceOf(Error);
		expect(error).not.toHaveProperty('code', 'OCTANE_RPC_UNCERTAIN');
		expect(called).not.toHaveBeenCalled();
		expect(requests).toHaveLength(1);
	});

	it('isolates a member that fits alone but exceeds its complete batch frame budget', async () => {
		const value = 'x'.repeat(1024);
		const maxFrameBytes = encodeServerResultFrame(0, { kind: 'value', value }).byteLength;
		const { options } = endpoint({
			aaaaaaaa: () => value,
			bbbbbbbb: async () => {
				await new Promise((resolve) => setTimeout(resolve, 10));
				return 'B';
			},
		});
		options.resultLimits = { maxFrameBytes, maxTotalBytes: 4096 };
		await expect(__serverRpc('aaaaaaaa', [], {}, true, options.resultLimits)).resolves.toBe(value);
		const calls = batchServerCalls({ ...policy, ...options.resultLimits }, () => [
			__serverRpc('aaaaaaaa', [], {}, true),
			__serverRpc('bbbbbbbb', [], {}, true),
		]);
		const results = await Promise.allSettled(calls);
		expect(results[0]).toMatchObject({
			status: 'rejected',
			reason: { code: 'OCTANE_RPC_UNCERTAIN' },
		});
		expect(results[1]).toEqual({ status: 'fulfilled', value: 'B' });
	});

	it('releases a fast member before a slow sibling and authorizes each target separately', async () => {
		let release!: () => void;
		const slow = new Promise<void>((resolve) => {
			release = resolve;
		});
		const authorized: string[] = [];
		const { requests } = endpoint(
			{
				aaaaaaaa: async (context) => {
					await slow;
					return context.viewer;
				},
				bbbbbbbb: (context) => context.viewer,
			},
			[
				async (context, next) => {
					context.viewer = context.rpc?.id;
					authorized.push(context.rpc!.id);
					return next();
				},
			],
		);
		const [a, b] = batchServerCalls(policy, () => [
			__serverRpc('aaaaaaaa', [], {}, true),
			__serverRpc('bbbbbbbb', [], {}, true),
		]);
		let slowSettled = false;
		void a!.then(() => {
			slowSettled = true;
		});
		try {
			await expect(b).resolves.toBe('bbbbbbbb');
			expect(slowSettled).toBe(false);
			expect(authorized.sort()).toEqual(['aaaaaaaa', 'bbbbbbbb']);
			expect(requests).toHaveLength(1);
			expect(requests[0]!.url).toBe('https://octane.test/_$_ripple_rpc_$_/aaaaaaaa');
		} finally {
			release();
		}
		await expect(a).resolves.toBe('aaaaaaaa');
	});

	it('rejects a denied member before private work without rejecting its sibling', async () => {
		const denied = vi.fn();
		endpoint({ aaaaaaaa: denied, bbbbbbbb: () => 'public result' }, [
			(context, next) =>
				context.rpc?.id === 'aaaaaaaa' ? new Response(null, { status: 403 }) : next(),
		]);
		const [a, b] = batchServerCalls(policy, () => [
			__serverRpc('aaaaaaaa', [], {}, true),
			__serverRpc('bbbbbbbb', [], {}, true),
		]);
		const rejected = expect(a).rejects.toThrow('403');
		await expect(b).resolves.toBe('public result');
		await rejected;
		expect(denied).not.toHaveBeenCalled();
	});

	it('detaches a canceled read without aborting or retrying either dispatched member', async () => {
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const entered = vi.fn();
		const { requests } = endpoint({
			aaaaaaaa: async () => {
				entered();
				await gate;
				return 'A';
			},
			bbbbbbbb: async (context) => {
				await gate;
				return context.signal.aborted;
			},
		});
		const cancel = new AbortController();
		const [a, b] = batchServerCalls(policy, () => [
			__serverRpc('aaaaaaaa', [], { signal: cancel.signal }, true),
			__serverRpc('bbbbbbbb', [], {}, true),
		]);
		const rejected = expect(a).rejects.toMatchObject({ code: 'OCTANE_RPC_UNCERTAIN' });
		await vi.waitFor(() => expect(entered).toHaveBeenCalledOnce());
		cancel.abort();
		await rejected;
		release();
		await expect(b).resolves.toBe(false);
		expect(requests).toHaveLength(1);
		expect(entered).toHaveBeenCalledOnce();
	});

	it('does not merge separate document scopes or serialize unresolved Promise arguments', async () => {
		const { requests } = endpoint({ aaaaaaaa: () => 'ready' });
		const a = batchServerCalls(policy, () => __serverRpc('aaaaaaaa', [], {}, true));
		const b = batchServerCalls({ ...policy, document: 'document:B' }, () =>
			__serverRpc('aaaaaaaa', [], {}, true),
		);
		const invalid = batchServerCalls(policy, () =>
			__serverRpc('aaaaaaaa', [Promise.resolve(1)], {}, true),
		);
		await expect(invalid).rejects.toThrow('acyclic plain data');
		await Promise.all([a, b]);
		expect(requests).toHaveLength(2);
	});

	it('rejects malformed member envelopes before executing any member', () => {
		const invoke = vi.fn();
		expect(() =>
			executeServerFunctionBatch(JSON.stringify([1, [[0, 'bad', '[]']]]), invoke),
		).toThrow('Invalid server function arguments');
		expect(invoke).not.toHaveBeenCalled();
	});

	it('settles all 32 staggered finite results without retaining a subscription', async () => {
		const count = 32;
		const functions = Object.fromEntries(
			Array.from({ length: count }, (_, i) => [
				i.toString(16).padStart(8, '0'),
				async () => {
					await Promise.resolve();
					return i;
				},
			]),
		);
		const { requests } = endpoint(functions);
		const results = batchServerCalls(policy, () =>
			Object.keys(functions).map((hash) => __serverRpc(hash, [], {}, true)),
		);
		await expect(Promise.all(results)).resolves.toEqual(Array.from({ length: count }, (_, i) => i));
		expect(requests).toHaveLength(1);
	});
});
