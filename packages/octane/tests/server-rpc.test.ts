import { describe, it, expect, vi } from 'vitest';
import { __serverRpc } from 'octane';
import * as devalue from 'devalue';
import {
	executeServerFunction,
	executeServerFunctionStream,
	__registerServerFunction,
	__setServerCallContextSource,
	type ServerCallContext,
} from 'octane/server';

// The dev RPC executor the vite plugin loads via ssrLoadModule('octane/server').
// Wire format is devalue on both sides, mirroring @ripple-ts/adapter's client
// stub: request body = devalue.stringify(args), response = devalue-encoded
// { value } envelope read as devalue.parse(text).value.

function clientCall(args: unknown[]) {
	return devalue.stringify(args);
}
function clientRead(response: string) {
	return devalue.parse(response).value;
}

describe('executeServerFunction', () => {
	it('injects host context without accepting a browser-provided viewer', async () => {
		const request = new Request('https://octane.test/');
		const context = { request, signal: request.signal, viewer: 'authorized-viewer' };
		const read = __registerServerFunction(
			async (id: string, context: ServerCallContext<string>) => ({ id, viewer: context.viewer }),
			1,
			{ id: 'deadbeef', module: '/read.ts', export: 'read' },
		);

		const result = await executeServerFunction(read, clientCall(['A']), context);
		expect(clientRead(result)).toEqual({ id: 'A', viewer: 'authorized-viewer' });
		await expect(
			executeServerFunction(read, clientCall(['A', { viewer: 'attacker' }]), context),
		).rejects.toMatchObject({ code: 'OCTANE_INVALID_RPC_PAYLOAD' });
	});

	it('preserves an omitted optional argument before trusted context', async () => {
		const request = new Request('https://octane.test/');
		const read = __registerServerFunction(
			(label = 'default', context: ServerCallContext<string>) => label + ':' + context.viewer,
			1,
			{ id: 'deadbeef', module: '/read.ts', export: 'read' },
		);
		const result = await executeServerFunction(read, clientCall([]), {
			request,
			signal: request.signal,
			viewer: 'viewer',
		});
		expect(clientRead(result)).toBe('default:viewer');
	});

	it('reauthorizes aliased in-process calls and keeps cancellation local', async () => {
		const request = new Request('https://octane.test/');
		const controller = new AbortController();
		const targets: string[] = [];
		__setServerCallContextSource({
			getStore: () => ({
				invoke(target, options, execute) {
					targets.push(target.export);
					return execute({
						request,
						signal: options.signal ?? request.signal,
						viewer: 'trusted',
					});
				},
			}),
		});
		try {
			const read = __registerServerFunction(
				(_id: string, context: ServerCallContext) => ({
					viewer: context.viewer,
					localSignal: context.signal === controller.signal,
					frozen: Object.isFrozen(context),
				}),
				1,
				{ id: 'deadbeef', module: '/read.ts', export: 'read' },
			);
			const alias = read;
			await expect(alias('A', { signal: controller.signal })).resolves.toEqual({
				viewer: 'trusted',
				localSignal: true,
				frozen: true,
			});
			await alias('B');
			expect(targets).toEqual(['read', 'read']);
			controller.abort();
			await expect(alias('C', { signal: controller.signal })).rejects.toMatchObject({
				name: 'AbortError',
			});
			expect(targets).toEqual(['read', 'read']);
		} finally {
			__setServerCallContextSource({ getStore: () => undefined });
		}
	});

	it('requires trusted request context and never falls back to global authority', async () => {
		const read = __registerServerFunction((context: ServerCallContext) => context.viewer, 0, {
			id: 'deadbeef',
			module: '/read.ts',
			export: 'read',
		});
		__setServerCallContextSource({ getStore: () => undefined });
		await expect(read()).rejects.toThrow('active server request');
		await expect(executeServerFunction(read, clientCall([]))).rejects.toThrow(
			'trusted request context',
		);
	});

	it('applies the decoded argument array and returns the { value } envelope', async () => {
		const add = (a: number, b: number) => a + b;
		const response = await executeServerFunction(add, clientCall([2, 40]));
		expect(clientRead(response)).toBe(42);
	});

	it('awaits async server functions', async () => {
		const fn = async (name: string) => `hi ${name}`;
		const response = await executeServerFunction(fn, clientCall(['octane']));
		expect(clientRead(response)).toBe('hi octane');
	});

	it('round-trips rich values JSON cannot represent', async () => {
		const echo = (v: unknown) => v;
		const payload = {
			when: new Date(0),
			tags: new Map([['a', 1]]),
			set: new Set([1, 2]),
			missing: undefined,
		};
		const response = await executeServerFunction(echo, clientCall([payload]));
		const out = clientRead(response) as typeof payload;
		expect(out.when).toBeInstanceOf(Date);
		expect(out.when.getTime()).toBe(0);
		expect(out.tags).toBeInstanceOf(Map);
		expect(out.tags.get('a')).toBe(1);
		expect(out.set).toBeInstanceOf(Set);
		expect('missing' in out && out.missing === undefined).toBe(true);
	});

	it('propagates a thrown server error as a rejection', async () => {
		const boom = () => {
			throw new Error('nope');
		};
		await expect(executeServerFunction(boom, clientCall([]))).rejects.toThrow('nope');
	});

	it.each(['{', '{}', 'null', '"value"', '[999]'])(
		'rejects malformed or non-array server-function payload %s before invocation',
		async (body) => {
			let invoked = false;
			const fn = () => {
				invoked = true;
			};

			await expect(executeServerFunction(fn, body)).rejects.toMatchObject({
				code: 'OCTANE_INVALID_RPC_PAYLOAD',
			});
			expect(invoked).toBe(false);
		},
	);

	it('is NOT plain-JSON compatible (the devalue graph format is intentional)', async () => {
		const first = (...args: unknown[]) => args.length;
		const response = await executeServerFunction(first, clientCall([1, 2]));
		expect(clientRead(response)).toBe(2);
		// A JSON.parse of the same body would mis-split the indexed graph into
		// the wrong argument count; pin that the encoding really is devalue.
		expect(JSON.parse(clientCall([1, 2]))).not.toEqual([1, 2]);
	});
});

describe('streamed server-function results', () => {
	function endpoint(fn: (...args: any[]) => unknown) {
		return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
			const request = new Request(new URL(String(input), document.baseURI), init);
			expect(new URL(request.url).origin).toBe(location.origin);
			return new Response(
				executeServerFunctionStream(fn, await request.text(), {
					request,
					signal: request.signal,
					viewer: 'viewer',
				}),
				{ headers: { 'Content-Type': 'application/x-octane-rpc+ndjson' } },
			);
		});
	}

	it('round-trips ready values on the page origin despite an external document base', async () => {
		const fetch = endpoint(() => ({ missing: undefined, value: -0 }));
		const base = document.createElement('base');
		base.href = 'https://external-base.test/';
		document.head.prepend(base);
		try {
			await expect(__serverRpc('deadbeef', [], {}, true)).resolves.toEqual({
				missing: undefined,
				value: -0,
			});
		} finally {
			base.remove();
			fetch.mockRestore();
		}
	});

	it('publishes each yielded value and closes the producer when iteration ends early', async () => {
		let closed = false;
		const fetch = endpoint(async function* () {
			try {
				yield 'first';
				yield 'second';
			} finally {
				closed = true;
			}
		});
		try {
			const values = (await __serverRpc('deadbeef', [], {}, true)) as AsyncIterable<string>;
			const iterator = values[Symbol.asyncIterator]();
			await expect(iterator.next()).resolves.toEqual({ value: 'first', done: false });
			await iterator.return?.();
			expect(closed).toBe(true);
		} finally {
			fetch.mockRestore();
		}
	});

	it('orders overlapping next calls and accepts a stream exceeding one mebibyte', async () => {
		const value = 'x'.repeat(600_000);
		const fetch = endpoint(async function* () {
			yield value;
			yield value + '!';
		});
		try {
			const values = (await __serverRpc('deadbeef', [], {}, true)) as AsyncIterable<string>;
			const iterator = values[Symbol.asyncIterator]();
			await expect(
				Promise.all([iterator.next(), iterator.next(), iterator.next()]),
			).resolves.toEqual([
				{ value, done: false },
				{ value: value + '!', done: false },
				{ value: undefined, done: true },
			]);
		} finally {
			fetch.mockRestore();
		}
	});

	it('rejects unresolved Promise arguments without dispatching the server function', async () => {
		let invoked = false;
		const fetch = endpoint(() => {
			invoked = true;
		});
		try {
			await expect(__serverRpc('deadbeef', [Promise.resolve(1)], {}, true)).rejects.toThrow();
			expect(invoked).toBe(false);
		} finally {
			fetch.mockRestore();
		}
	});

	it('rejects an incomplete response rather than treating the last value as complete', async () => {
		const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response('[1,0,"value",["string","partial"]]\n', {
				headers: { 'Content-Type': 'application/x-octane-rpc+ndjson' },
			}),
		);
		try {
			await expect(__serverRpc('deadbeef', [], {}, true)).rejects.toThrow('terminal frame');
		} finally {
			fetch.mockRestore();
		}
	});

	it('rejects reordered result frames before publishing their values', async () => {
		const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response('[1,99,"value",["string","stale"]]\n[1,100,"complete",null]\n', {
				headers: { 'Content-Type': 'application/x-octane-rpc+ndjson' },
			}),
		);
		try {
			await expect(__serverRpc('deadbeef', [], {}, true)).rejects.toThrow('out-of-order');
		} finally {
			fetch.mockRestore();
		}
	});

	it('distinguishes pre-dispatch cancellation, rejected authorization, and lost acknowledgement', async () => {
		const fetch = vi.spyOn(globalThis, 'fetch');
		const cancellation = new AbortController();
		cancellation.abort();
		try {
			await expect(
				__serverRpc('deadbeef', [], { signal: cancellation.signal }, true),
			).rejects.toMatchObject({ name: 'AbortError' });
			expect(fetch).not.toHaveBeenCalled();
			fetch.mockResolvedValueOnce(
				new Response('{"error":"Denied"}', {
					status: 403,
					headers: { 'Octane-RPC-Outcome': 'rejected' },
				}),
			);
			await expect(__serverRpc('deadbeef', [], {}, true)).rejects.toMatchObject({ status: 403 });
			fetch.mockRejectedValueOnce(new TypeError('Connection lost after accepting the write'));
			await expect(__serverRpc('deadbeef', [], {}, true)).rejects.toMatchObject({
				code: 'OCTANE_RPC_UNCERTAIN',
			});
		} finally {
			fetch.mockRestore();
		}
	});

	it.each(['before any value', 'after a yielded value'])(
		'keeps completed server work uncertain when delivery fails %s',
		async (phase) => {
			const saved: string[] = [];
			const fetch = endpoint(
				phase === 'before any value'
					? () => {
							saved.push('saved');
							throw new Error('private token and database details');
						}
					: async function* () {
							saved.push('saved');
							yield 'first';
							throw new Error('private token and database details');
						},
			);
			try {
				let result = __serverRpc('deadbeef', [], {}, true);
				if (phase === 'after a yielded value') {
					const values = (await result) as AsyncIterable<string>;
					const iterator = values[Symbol.asyncIterator]();
					await expect(iterator.next()).resolves.toEqual({ value: 'first', done: false });
					result = iterator.next();
				}
				await expect(result).rejects.toMatchObject({
					message: 'Server function failed',
					code: 'OCTANE_RPC_UNCERTAIN',
				});
				expect(saved).toEqual(['saved']);
				expect(fetch).toHaveBeenCalledTimes(1);
			} finally {
				fetch.mockRestore();
			}
		},
	);

	it('includes stalled response headers in the invocation deadline', async () => {
		vi.useFakeTimers();
		const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(
			(_url, options) =>
				new Promise((_, reject) => {
					options?.signal?.addEventListener('abort', () => reject(options.signal!.reason), {
						once: true,
					});
				}),
		);
		let outcome: unknown;
		try {
			void __serverRpc('deadbeef', [], {}, true, { timeoutMs: 10 }).catch((error) => {
				outcome = error;
			});
			await vi.advanceTimersByTimeAsync(20);
			expect(outcome).toMatchObject({ code: 'OCTANE_RPC_UNCERTAIN' });
		} finally {
			fetch.mockRestore();
			vi.useRealTimers();
		}
	});

	it('settles authoritative HTTP rejection without waiting for an unframed error body', async () => {
		vi.useFakeTimers();
		const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(new ReadableStream({ cancel: () => new Promise(() => {}) }), {
				status: 403,
				headers: { 'Octane-RPC-Outcome': 'rejected' },
			}),
		);
		let outcome: unknown;
		try {
			void __serverRpc('deadbeef', [], {}, true, { timeoutMs: 10 }).catch((error) => {
				outcome = error;
			});
			await vi.advanceTimersByTimeAsync(20);
			expect(outcome).toMatchObject({ status: 403 });
			expect(outcome).not.toHaveProperty('code', 'OCTANE_RPC_UNCERTAIN');
		} finally {
			fetch.mockRestore();
			vi.useRealTimers();
		}
	});

	it('settles a malformed-result error even when transport cancellation never settles', async () => {
		vi.useFakeTimers();
		const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
			new Response(
				new ReadableStream({
					start(controller) {
						controller.enqueue(new TextEncoder().encode('invalid\n'));
					},
					cancel: () => new Promise(() => {}),
				}),
				{ headers: { 'Content-Type': 'application/x-octane-rpc+ndjson' } },
			),
		);
		let outcome: unknown;
		try {
			void __serverRpc('deadbeef', [], {}, true, { timeoutMs: 10 }).catch((error) => {
				outcome = error;
			});
			await vi.advanceTimersByTimeAsync(20);
			expect(outcome).toMatchObject({ code: 'OCTANE_RPC_UNCERTAIN' });
		} finally {
			fetch.mockRestore();
			vi.useRealTimers();
		}
	});
});
