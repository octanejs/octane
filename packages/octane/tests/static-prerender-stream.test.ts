// React's react-dom/static `prerenderToNodeStream` adapted to Octane: the
// promise resolves only after the await-everything render fully completes
// (identical suspension semantics to `prerender`), and `prelude` is a Node
// Readable carrying the complete document bytes — deduped scoped-style tags
// first, then the folded html — byte-identical to the buffered `prerender`'s
// `css + html`. There is no `postponed` field: Octane has no postpone/resume
// protocol (a documented non-goal), and no `{ prelude }`-with-holes shape.
import { describe, it, expect, vi } from 'vitest';
import * as Server from 'octane/server';
import { prerender, prerenderToNodeStream } from 'octane/static';
import { createScope, type ScopeSeed } from 'octane/signals';
import { loadServerFixture } from './_server-fixture.js';

async function collect(stream: AsyncIterable<unknown>): Promise<string> {
	let out = '';
	for await (const chunk of stream) out += String(chunk);
	return out;
}

function deferred<T>() {
	let resolve!: (v: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

describe('octane/static — prerenderToNodeStream', () => {
	it('resolves only after every use(thenable) settles; prelude carries the full document', async () => {
		const d = deferred<string>();
		const App = () => {
			const v = Server.use(d.promise);
			return Server.createElement('div', { id: 'app' }, String(v)) as any;
		};
		const pending = prerenderToNodeStream(App as any);
		let settled = false;
		void pending.then(() => {
			settled = true;
		});
		await new Promise((r) => setTimeout(r, 0));
		expect(settled).toBe(false); // still awaiting the thenable
		d.resolve('done');
		const { prelude } = await pending;
		const bytes = await collect(prelude as AsyncIterable<unknown>);
		expect(bytes).toContain('id="app"');
		expect(bytes).toContain('done');
	});

	it('prelude bytes equal the buffered prerender css + html (scoped styles first)', async () => {
		const srv = loadServerFixture('packages/octane/tests/_fixtures/float-resources.tsrx') as Record<
			string,
			any
		>;
		const buffered = await prerender(srv.ScopedControl, {});
		expect(buffered.css).not.toBe(''); // the fixture carries scoped CSS
		const { prelude } = await prerenderToNodeStream(srv.ScopedControl, {});
		const bytes = await collect(prelude as AsyncIterable<unknown>);
		expect(bytes).toBe(buffered.css + buffered.html);
	});

	it('an aborted signal rejects like prerender', async () => {
		const controller = new AbortController();
		controller.abort(new Error('static-abort'));
		const App = () => Server.createElement('div', null, 'x') as any;
		await expect(
			prerenderToNodeStream(App as any, undefined, { signal: controller.signal }),
		).rejects.toThrow('static-abort');
	});
});

describe.each([
	{ name: 'prerender', render: prerender },
	{ name: 'prerenderToNodeStream', render: prerenderToNodeStream },
])('octane/static — $name injection cleanup', ({ render }) => {
	function producer() {
		const controller = new AbortController();
		const done = deferred<void>();
		const cancel = vi.fn((reason: unknown) => {
			controller.abort(reason);
			done.resolve();
		});
		return {
			controller,
			cancel,
			finish: done.resolve,
			source: {
				take: () => '',
				subscribe: () => () => {},
				done: done.promise,
				renderComplete: () => done.resolve(),
				cancel,
			},
		};
	}

	it.each(['mismatched', 'duplicate'] as const)(
		'releases the producer with the validation failure for a %s document seed',
		async (kind) => {
			const owner = createScope({ scopeKey: 'request-document' });
			const injection = producer();
			const entry = {
				key: 'route',
				kind: 'signal' as const,
				complete: true,
				value: ['string', 'thread'] as const,
			};
			const seed: ScopeSeed = {
				version: 1,
				scopeKey: kind === 'mismatched' ? 'other-document' : owner.scopeKey,
				entries: kind === 'duplicate' ? [entry, entry] : [],
			};
			try {
				const failure = await render(() => 'ready', {}, {
					signalOwner: owner,
					initialDocumentSignals: seed,
					injection: injection.source,
				} as Server.StreamOptions).catch((error: unknown) => error);
				expect(failure).toBeInstanceOf(Error);
				expect((failure as Error).message).toMatch(/initial document signals/i);
				expect(injection.controller.signal.aborted).toBe(true);
				expect(injection.controller.signal.reason).toBe(failure);
				expect(injection.cancel).toHaveBeenCalledExactlyOnceWith(failure);
			} finally {
				injection.finish();
				owner.dispose();
			}
		},
	);

	it('keeps the seed validation failure when producer cleanup throws', async () => {
		const owner = createScope({ scopeKey: 'request-document' });
		const injection = producer();
		const cleanupFailure = new Error('producer cleanup failed');
		injection.source.cancel = vi.fn((reason: unknown) => {
			injection.cancel(reason);
			throw cleanupFailure;
		});
		try {
			const failure = await render(() => 'ready', {}, {
				signalOwner: owner,
				initialDocumentSignals: { version: 1, scopeKey: 'other-document', entries: [] },
				injection: injection.source,
			} as Server.StreamOptions).catch((error: unknown) => error);
			expect(failure).toBeInstanceOf(Error);
			expect((failure as Error).message).toMatch(/initial document signals/i);
			expect(failure).not.toBe(cleanupFailure);
			expect(injection.controller.signal.reason).toBe(failure);
			expect(injection.cancel).toHaveBeenCalledExactlyOnceWith(failure);
		} finally {
			injection.finish();
			owner.dispose();
		}
	});

	it('releases the producer with an ordinary component failure', async () => {
		const injection = producer();
		const failure = new Error('component failed');
		try {
			await expect(
				render(
					() => {
						throw failure;
					},
					{},
					{ injection: injection.source } as Server.StreamOptions,
				),
			).rejects.toBe(failure);
			expect(injection.controller.signal.reason).toBe(failure);
			expect(injection.cancel).toHaveBeenCalledExactlyOnceWith(failure);
		} finally {
			injection.finish();
		}
	});

	it('completes a valid seeded render without cancelling the producer', async () => {
		const owner = createScope({ scopeKey: 'request-document' });
		const injection = producer();
		try {
			const result = await render(() => 'ready', {}, {
				signalOwner: owner,
				initialDocumentSignals: owner.serialize(),
				injection: injection.source,
			} as Server.StreamOptions);
			expect('html' in result ? result.html : await collect(result.prelude)).toBe('ready');
			expect(injection.controller.signal.aborted).toBe(false);
			expect(injection.cancel).not.toHaveBeenCalled();
		} finally {
			injection.finish();
			owner.dispose();
		}
	});
});
