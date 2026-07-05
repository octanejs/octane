import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile } from 'octane/compiler';
import { hydrateRoot, flushSync } from '../src/index.js';
import * as ServerRT from 'octane/server';
// CLIENT-compiled fixture (registers click delegation at import).
import { Boundary, Siblings } from './_fixtures/ssr-suspense.tsrx';

// Streaming SSR — renderToPipeableStream / renderToReadableStream: shell with
// fallbacks + <template data-oct-b> sentinels, out-of-order hidden segments
// swapped in by the inline $OCTRC runtime, per-boundary hydration seeds.

const FIXTURE = join(process.cwd(), 'packages/octane/tests/_fixtures/ssr-suspense.tsrx');

function serverModule(): Record<string, any> {
	let { code } = compile(readFileSync(FIXTURE, 'utf8'), 'ssr-suspense.tsrx', { mode: 'server' });
	code = code.replace(
		/import\s*\{([^}]*)\}\s*from\s*['"]octane\/server['"];?/g,
		(_m: string, names: string) => `const {${names.replace(/ as /g, ': ')}} = __rt;`,
	);
	code = code.replace(/export const (\w+) =/g, 'const $1 = __exports.$1 =');
	code = code.replace(/export function (\w+)/g, '__exports.$1 = function $1');
	return new Function('__rt', '__exports', code + '\nreturn __exports;')(ServerRT, {});
}
const server = serverModule();

function deferred<T>() {
	let resolve!: (v: T) => void;
	let reject!: (e: any) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

/** Collects chunks; resolves when end() is called. */
function collector() {
	const chunks: string[] = [];
	let end!: () => void;
	const ended = new Promise<void>((res) => (end = res));
	return {
		chunks,
		ended,
		dest: {
			write: (c: string) => chunks.push(c),
			end: () => end(),
		},
	};
}

/** Execute the stream's inline scripts the way a browser would (in order). */
function activate(container: HTMLElement): void {
	for (const s of Array.from(container.querySelectorAll('script'))) {
		if (s.getAttribute('type') === 'application/json') continue;
		// eslint-disable-next-line no-eval
		(0, eval)(s.textContent || '');
		s.remove();
	}
}

let container: HTMLElement;
beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
});
afterEach(() => {
	container.remove();
	delete (window as any).$OCTS;
	delete (window as any).$OCTRC;
	delete (window as any).$OCTRX;
});

describe('renderToPipeableStream — chunk protocol', () => {
	it('flushes the shell with the fallback + template sentinel, then the segment', async () => {
		const d = deferred<string>();
		const c = collector();
		const events: string[] = [];
		const { pipe } = ServerRT.renderToPipeableStream(
			server.Boundary,
			{ promise: d.promise },
			{
				onShellReady: () => events.push('shell'),
				onAllReady: () => events.push('all'),
			},
		);
		pipe(c.dest);
		// The shell flushes synchronously: fallback + sentinel + swap runtime.
		expect(c.chunks).toHaveLength(1);
		const shell = c.chunks[0];
		expect(shell).toContain('<template data-oct-b="0"></template>');
		expect(shell).toContain('loading');
		expect(shell).toContain('$OCTRC=');
		expect(shell).not.toContain('class="ok"');
		expect(events).toEqual(['shell']);

		d.resolve('streamed!');
		await c.ended;
		expect(events).toEqual(['shell', 'all']);
		const tail = c.chunks.slice(1).join('');
		expect(tail).toContain('<div hidden data-oct-s="0">');
		expect(tail).toContain('class="ok"');
		expect(tail).toContain('streamed!');
		// The boundary's use() seed rides in the segment, not the shell.
		expect(tail).toContain('data-oct-seed');
		expect(tail).toContain('$OCTRC("0")');
		expect(shell).not.toContain('streamed!');
	});

	it('streams independent sibling boundaries as separate segments', async () => {
		const a = deferred<string>();
		const b = deferred<string>();
		const c = collector();
		const { pipe } = ServerRT.renderToPipeableStream(server.Siblings, {
			a: a.promise,
			b: b.promise,
		});
		pipe(c.dest);
		expect(c.chunks[0]).toContain('data-oct-b="0"');
		expect(c.chunks[0]).toContain('data-oct-b="1"');

		a.resolve('alpha');
		b.resolve('beta');
		await c.ended;
		const tail = c.chunks.slice(1).join('');
		expect(tail).toContain('data-oct-s="0"');
		expect(tail).toContain('data-oct-s="1"');
		expect(tail).toContain('alpha');
		expect(tail).toContain('beta');
	});

	it('streams each boundary at its own resolve time, not the wave-set slowest', async () => {
		// REAL timers on purpose (no vi.useFakeTimers): the assertion is about
		// wall-clock chunk arrival. Margins are generous so CI jitter can't flip
		// it — the early chunk must land in [EARLY, LATE - 50], i.e. long before
		// the late boundary's data even resolves.
		const EARLY = 20;
		const LATE = 250;
		const a = new Promise<string>((r) => setTimeout(() => r('alpha'), EARLY));
		const b = new Promise<string>((r) => setTimeout(() => r('beta'), LATE));
		const arrivals: { chunk: string; at: number }[] = [];
		let end!: () => void;
		const ended = new Promise<void>((res) => (end = res));
		const t0 = performance.now();
		const { pipe } = ServerRT.renderToPipeableStream(server.Siblings, { a, b });
		pipe({
			write: (chunk: string) => arrivals.push({ chunk, at: performance.now() - t0 }),
			end: () => end(),
		});
		await ended;

		// Shell + one segment chunk PER boundary. The old settle-all round held
		// alpha's segment until beta landed and shipped both in ONE chunk.
		expect(arrivals).toHaveLength(3);
		const [, first, second] = arrivals;
		expect(first.chunk).toContain('data-oct-s="0"');
		expect(first.chunk).toContain('alpha');
		expect(first.chunk).not.toContain('beta');
		expect(second.chunk).toContain('data-oct-s="1"');
		expect(second.chunk).toContain('beta');
		expect(first.at).toBeGreaterThanOrEqual(EARLY - 5); // not before its data
		expect(first.at).toBeLessThan(LATE - 50); // on the wire while beta still pends
		expect(second.at).toBeGreaterThanOrEqual(LATE - 5);
	});

	it('coalesces resolutions landing in the same wave into one chunk/pass', async () => {
		let ra!: (v: string) => void;
		let rb!: (v: string) => void;
		const a = new Promise<string>((r) => (ra = r));
		const b = new Promise<string>((r) => (rb = r));
		// Both settle in the SAME event-loop turn → they must share one re-pass
		// and flush as one chunk, not cost a wave (and a full pass) each.
		setTimeout(() => {
			ra('alpha');
			rb('beta');
		}, 10);
		const c = collector();
		const { pipe } = ServerRT.renderToPipeableStream(server.Siblings, { a, b });
		pipe(c.dest);
		await c.ended;
		expect(c.chunks).toHaveLength(2); // shell + ONE coalesced segment chunk
		expect(c.chunks[1]).toContain('data-oct-s="0"');
		expect(c.chunks[1]).toContain('data-oct-s="1"');
		expect(c.chunks[1]).toContain('alpha');
		expect(c.chunks[1]).toContain('beta');
	});

	it('streams a nested boundary parent-first', async () => {
		const outer = deferred<string>();
		const inner = deferred<string>();
		const c = collector();
		const { pipe } = ServerRT.renderToPipeableStream(server.Nested, {
			outer: outer.promise,
			inner: inner.promise,
		});
		pipe(c.dest);
		expect(c.chunks[0]).toContain('outer…');

		outer.resolve('one');
		inner.resolve('two');
		await c.ended;
		const tail = c.chunks.slice(1).join('');
		// The outer segment carries the INNER boundary's template; the inner
		// segment swaps into it afterwards (ascending id order).
		expect(tail.indexOf('$OCTRC("0")')).toBeLessThan(tail.indexOf('$OCTRC("1")'));
		expect(tail).toContain('one:two');
	});

	it('streams the @catch arm when the promise rejects', async () => {
		const d = deferred<string>();
		const c = collector();
		const { pipe } = ServerRT.renderToPipeableStream(server.Boundary, { promise: d.promise });
		pipe(c.dest);
		d.reject(new Error('nope'));
		await c.ended;
		const tail = c.chunks.slice(1).join('');
		expect(tail).toContain('class="err"');
		expect(tail).toContain('nope');
	});

	it('abort landing during a wave coalesce cancels the pass — no post-abort segment', async () => {
		const d = deferred<string>();
		const c = collector();
		const onError = vi.fn();
		const events: string[] = [];
		const { pipe, abort } = ServerRT.renderToPipeableStream(
			server.Boundary,
			{ promise: d.promise },
			{ onError, onAllReady: () => events.push('all') },
		);
		pipe(c.dest);
		// Land the abort INSIDE the wave's coalesce window: resolve now (the
		// resolution wins the guarded race), then abort on the same macrotask
		// channel the coalesce yield uses. Our callback is queued BEFORE the
		// wave schedules its own yield (that happens a few microtasks from
		// now), so it runs first — after the race settled, before the wave
		// returns. The wave must still surface the abort instead of spending a
		// pass, flushing the segment, and firing allReady on a dead request.
		d.resolve('too late');
		const afterRaceSettles =
			typeof setImmediate === 'function' ? setImmediate : (fn: () => void) => setTimeout(fn, 0);
		afterRaceSettles(() => abort(new Error('gone')));
		await c.ended;
		const tail = c.chunks.slice(1).join('');
		expect(tail).not.toContain('data-oct-s=');
		expect(tail).not.toContain('too late');
		expect(tail).toContain('$OCTRX("0")');
		expect(events).not.toContain('all');
		expect(onError).toHaveBeenCalled();
	});

	it('abort marks pending boundaries errored and ends the stream', async () => {
		const d = deferred<string>();
		const c = collector();
		const onError = vi.fn();
		const { pipe, abort } = ServerRT.renderToPipeableStream(
			server.Boundary,
			{ promise: d.promise },
			{ onError },
		);
		pipe(c.dest);
		abort(new Error('gone'));
		await c.ended;
		expect(c.chunks.join('')).toContain('$OCTRX("0")');
		expect(onError).toHaveBeenCalled();
	});
});

describe('renderToReadableStream', () => {
	it('resolves at shell-ready; allReady settles after the last segment', async () => {
		const d = deferred<string>();
		const stream = await ServerRT.renderToReadableStream(server.Boundary, {
			promise: d.promise,
		});
		let settled = false;
		stream.allReady.then(() => (settled = true));
		await Promise.resolve();
		expect(settled).toBe(false); // shell ready, boundary still pending

		d.resolve('web!');
		await stream.allReady;
		const text = await new Response(stream).text();
		expect(text).toContain('web!');
		expect(text).toContain('$OCTRC("0")');
	});
});

describe('streamed page → swap runtime → hydration (end to end)', () => {
	it('swaps the segment into place, scopes its seeds, and hydrates byte-for-byte', async () => {
		const d = deferred<string>();
		const c = collector();
		const { pipe } = ServerRT.renderToPipeableStream(server.Boundary, { promise: d.promise });
		pipe(c.dest);
		d.resolve('streamed!');
		await c.ended;

		// Build the browser-equivalent DOM: parse the full stream, run its scripts.
		container.innerHTML = c.chunks.join('');
		activate(container);
		// Post-swap: fallback gone, content live, seed comment + stash in place.
		expect(container.querySelector('.loading')).toBeNull();
		expect(container.querySelector('.ok')!.textContent).toBe('streamed!');
		expect(container.querySelector('[data-oct-s]')).toBeNull();
		expect((window as any).$OCTS['0']).toContain('streamed!');

		// Hydrate with a client-side pending promise: the scoped seed must satisfy
		// the boundary's use() (no re-suspend, no rebuild, no mismatch warning).
		const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const okSpan = container.querySelector('.ok');
		const clientPending = new Promise<string>(() => {});
		const root = hydrateRoot(container, Boundary as any, { promise: clientPending });
		flushSync(() => {});
		expect(container.querySelector('.ok')).toBe(okSpan); // adopted, not rebuilt
		expect(container.querySelector('.ok')!.textContent).toBe('streamed!');
		expect(errSpy).not.toHaveBeenCalled();
		errSpy.mockRestore();
		root.unmount();
	});

	it('hydrates two streamed sibling boundaries, each from its own seed scope', async () => {
		const a = deferred<string>();
		const b = deferred<string>();
		const c = collector();
		const { pipe } = ServerRT.renderToPipeableStream(server.Siblings, {
			a: a.promise,
			b: b.promise,
		});
		pipe(c.dest);
		// Resolve in REVERSE order so segments stream out-of-order vs tree order.
		b.resolve('beta');
		await new Promise((r) => setTimeout(r, 0));
		a.resolve('alpha');
		await c.ended;

		container.innerHTML = c.chunks.join('');
		activate(container);
		expect(container.querySelector('.a')!.textContent).toBe('alpha');
		expect(container.querySelector('.b')!.textContent).toBe('beta');

		const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const pending = new Promise<string>(() => {});
		const root = hydrateRoot(container, Siblings as any, { a: pending, b: pending });
		flushSync(() => {});
		expect(container.querySelector('.a')!.textContent).toBe('alpha');
		expect(container.querySelector('.b')!.textContent).toBe('beta');
		expect(errSpy).not.toHaveBeenCalled();
		errSpy.mockRestore();
		root.unmount();
	});
});
