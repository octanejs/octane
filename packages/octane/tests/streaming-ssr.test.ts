import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { compile } from 'octane/compiler';
import { hydrateRoot, flushSync } from '../src/index.js';
import * as ServerRT from 'octane/server';
import { prerender } from 'octane/static';
// CLIENT-compiled fixture (registers click delegation at import).
import {
	Boundary,
	IdBoundary,
	NestedStreamSeedScopes,
	ReasonBoundary,
	Siblings,
	StyledBoundary,
} from './_fixtures/ssr-suspense.tsrx';

// Streaming SSR — renderToPipeableStream / renderToReadableStream: shell with
// fallbacks + <template data-oct-b> sentinels, out-of-order hidden segments
// swapped in by the inline $OCTRC runtime, per-boundary hydration seeds.

const FIXTURE = join(process.cwd(), 'packages/octane/tests/_fixtures/ssr-suspense.tsrx');
const FIXTURE_ID = '/packages/octane/tests/_fixtures/ssr-suspense.tsrx';

function serverModule(): Record<string, any> {
	// Compile under the SAME root-relative id Vite hands the client transform: the
	// scoped-<style> class hash is filename-derived, so server/client markup
	// only matches (and hydration only adopts) when the ids agree.
	let { code } = compile(readFileSync(FIXTURE, 'utf8'), FIXTURE_ID, { mode: 'server' });
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

function protocolIds(html: string, attr = 'data-oct-b'): string[] {
	return [...html.matchAll(new RegExp(attr + '="([^"]+)"', 'g'))].map((match) => match[1]);
}

function swapCall(id: string): string {
	return '$OCTRC(' + JSON.stringify(id) + ')';
}

function errorCall(id: string): string {
	return '$OCTRX(' + JSON.stringify(id) + ')';
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
		const [id] = protocolIds(shell);
		expect(id).not.toBe('0');
		expect(id).toMatch(/^[a-zA-Z0-9_-]+$/);
		expect(shell).toContain('<template data-oct-b="' + id + '"></template>');
		expect(shell).toContain('loading');
		expect(shell).toContain('$OCTRC=');
		expect(shell).not.toContain('class="ok"');
		expect(events).toEqual(['shell']);

		d.resolve('streamed!');
		await c.ended;
		expect(events).toEqual(['shell', 'all']);
		const tail = c.chunks.slice(1).join('');
		expect(tail).toContain('<div hidden data-oct-s="' + id + '">');
		expect(tail).toContain('class="ok"');
		expect(tail).toContain('streamed!');
		// The boundary's use() seed rides in the segment, not the shell.
		expect(tail).toContain('data-oct-seed');
		expect(tail).toContain(swapCall(id));
		expect(shell).not.toContain('streamed!');
	});

	it('balances canonical counted markers in the inline segment swap runtime', async () => {
		const d = deferred<string>();
		const c = collector();
		const { pipe } = ServerRT.renderToPipeableStream(server.Boundary, { promise: d.promise });
		pipe(c.dest);
		const shell = c.chunks[0];
		d.resolve('done');
		await c.ended;

		// Install the real emitted runtime, then exercise it against a compacted
		// enclosing boundary. The counted close is the scanner's stopping node; a
		// legacy-only parser runs past it and deletes the trailing sibling/segment.
		container.innerHTML = shell;
		const runtimeScript = Array.from(container.querySelectorAll('script')).find((script) =>
			(script.textContent || '').includes('$OCTRC=function'),
		);
		expect(runtimeScript).toBeDefined();
		// eslint-disable-next-line no-eval
		(0, eval)(runtimeScript!.textContent || '');
		container.innerHTML =
			'<!--[2--><template data-oct-b="counted"></template>' +
			'<i class="counted-fallback">loading</i><!--]2-->' +
			'<p class="after-counted">after</p>' +
			'<div hidden data-oct-s="counted"><b class="counted-ready">ready</b></div>';

		(window as any).$OCTRC('counted');
		expect(container.querySelector('.counted-fallback')).toBeNull();
		expect(container.querySelector('.counted-ready')?.textContent).toBe('ready');
		expect(container.querySelector('.after-counted')?.textContent).toBe('after');
		expect(container.querySelector('[data-oct-s]')).toBeNull();
		const comments = Array.from(container.childNodes)
			.filter((node): node is Comment => node.nodeType === Node.COMMENT_NODE)
			.map((node) => node.data);
		expect(comments).toEqual(['[2', 'oct-seed:counted', ']2']);
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
		const [aId, bId] = protocolIds(c.chunks[0]);
		expect(aId).not.toBe(bId);

		a.resolve('alpha');
		b.resolve('beta');
		await c.ended;
		const tail = c.chunks.slice(1).join('');
		expect(tail).toContain('data-oct-s="' + aId + '"');
		expect(tail).toContain('data-oct-s="' + bId + '"');
		expect(tail).toContain('alpha');
		expect(tail).toContain('beta');
	});

	it('uses opaque render-scoped ids when two streams share one document', async () => {
		const a = deferred<string>();
		const b = deferred<string>();
		const first = collector();
		const second = collector();
		ServerRT.renderToPipeableStream(server.Boundary, { promise: a.promise }).pipe(first.dest);
		ServerRT.renderToPipeableStream(server.Boundary, { promise: b.promise }).pipe(second.dest);
		const [firstId] = protocolIds(first.chunks[0]);
		const [secondId] = protocolIds(second.chunks[0]);
		expect(firstId).not.toBe(secondId);

		// Interleave the segment order across two roots. A document-global numeric
		// id would swap both chunks into the first template and cross the seeds.
		b.resolve('second');
		a.resolve('first');
		await Promise.all([first.ended, second.ended]);
		container.innerHTML =
			'<section id="stream-a">' +
			first.chunks[0] +
			'</section><section id="stream-b">' +
			second.chunks[0] +
			'</section>' +
			second.chunks.slice(1).join('') +
			first.chunks.slice(1).join('');
		activate(container);

		const rootA = container.querySelector('#stream-a')!;
		const rootB = container.querySelector('#stream-b')!;
		expect(rootA.querySelector('.ok')!.textContent).toBe('first');
		expect(rootB.querySelector('.ok')!.textContent).toBe('second');
		expect((window as any).$OCTS[firstId]).toContain('first');
		expect((window as any).$OCTS[secondId]).toContain('second');

		const pending = new Promise<string>(() => {});
		const firstNode = rootA.querySelector('.ok');
		const secondNode = rootB.querySelector('.ok');
		const hydratedA = hydrateRoot(rootA, Boundary as any, { promise: pending });
		const hydratedB = hydrateRoot(rootB, Boundary as any, { promise: pending });
		flushSync(() => {});
		expect(rootA.querySelector('.ok')).toBe(firstNode);
		expect(rootB.querySelector('.ok')).toBe(secondNode);
		expect((window as any).$OCTS[firstId]).toContain('first');
		expect((window as any).$OCTS[secondId]).toContain('second');
		hydratedA.unmount();
		hydratedB.unmount();
	});

	it('isolates a nested buffered render from the outer stream registry', async () => {
		const data = deferred<string>();
		const nested: string[] = [];
		const prerenders: Array<Promise<{ html: string; css: string }>> = [];
		const Outer = () => {
			nested.push(ServerRT.renderToString(server.Boundary, { promise: data.promise }).html);
			nested.push(ServerRT.renderToStaticMarkup(server.Boundary, { promise: data.promise }).html);
			if (prerenders.length === 0) {
				prerenders.push(prerender(server.Boundary, { promise: data.promise }));
			}
			return '<main>outer-only</main>';
		};
		const c = collector();
		const onError = vi.fn();
		ServerRT.renderToPipeableStream(Outer as any, undefined, { onError }).pipe(c.dest);
		await vi.waitFor(() => expect(prerenders).toHaveLength(1));
		data.resolve('nested-ready');
		const [, nestedResult] = await Promise.all([c.ended, prerenders[0]]);

		expect(nested).toHaveLength(2);
		for (const html of nested) {
			expect(html).toContain('loading');
			expect(html).not.toContain('data-oct-b');
		}
		expect(nestedResult.html).toContain('nested-ready');
		expect(c.chunks.join('')).toBe('<main>outer-only</main>');
		expect(onError).not.toHaveBeenCalled();
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
		const [aId, bId] = protocolIds(arrivals[0].chunk);
		await ended;

		// Shell + one segment chunk PER boundary. The old settle-all round held
		// alpha's segment until beta landed and shipped both in ONE chunk.
		expect(arrivals).toHaveLength(3);
		const [, first, second] = arrivals;
		expect(first.chunk).toContain('data-oct-s="' + aId + '"');
		expect(first.chunk).toContain('alpha');
		expect(first.chunk).not.toContain('beta');
		expect(second.chunk).toContain('data-oct-s="' + bId + '"');
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
		const [aId, bId] = protocolIds(c.chunks[0]);
		await c.ended;
		expect(c.chunks).toHaveLength(2); // shell + ONE coalesced segment chunk
		expect(c.chunks[1]).toContain('data-oct-s="' + aId + '"');
		expect(c.chunks[1]).toContain('data-oct-s="' + bId + '"');
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
		const [outerId] = protocolIds(c.chunks[0]);
		expect(c.chunks[0]).toContain('outer…');

		outer.resolve('one');
		inner.resolve('two');
		await c.ended;
		const tail = c.chunks.slice(1).join('');
		const [innerId] = protocolIds(tail);
		// The outer segment carries the INNER boundary's template; the inner
		// segment swaps into it afterwards (parent-first discovery order).
		expect(tail.indexOf(swapCall(outerId))).toBeLessThan(tail.indexOf(swapCall(innerId)));
		expect(tail).toContain('one:two');
	});

	it('defers an inner segment until its outer segment introduces the template', async () => {
		const NestedInnerFirst = (props: any, scope: any) =>
			ServerRT.ssrTry(
				scope,
				'outer-inner-first',
				() => {
					const inner = ServerRT.ssrTry(
						scope,
						'inner-first',
						() =>
							ServerRT.ssrBlock(
								'<span class="inner-value">' + ServerRT.use(props.inner, 'inner-value') + '</span>',
							),
						() => ServerRT.ssrBlock('<span class="inner-pending">inner…</span>'),
						null,
					);
					const outer = ServerRT.use(props.outer, 'outer-value');
					return inner + ServerRT.ssrBlock('<span class="outer-value">' + outer + '</span>');
				},
				() => ServerRT.ssrBlock('<span class="outer-pending">outer…</span>'),
				null,
			);
		const outer = deferred<string>();
		const inner = deferred<string>();
		const c = collector();
		const { pipe } = ServerRT.renderToPipeableStream(NestedInnerFirst as any, {
			outer: outer.promise,
			inner: inner.promise,
		});
		pipe(c.dest);
		const [outerId] = protocolIds(c.chunks[0]);

		inner.resolve('inside');
		await new Promise((resolve) => setTimeout(resolve, 20));
		// The inner content is ready, but its template exists only inside the outer
		// segment. Emitting it now would make `$OCTRC` a permanent no-op.
		expect(c.chunks).toHaveLength(1);

		outer.resolve('outside');
		await c.ended;
		const tail = c.chunks.slice(1).join('');
		const [innerId] = protocolIds(tail);
		expect(innerId).toBeTruthy();
		expect(tail.indexOf(swapCall(outerId))).toBeLessThan(tail.indexOf(swapCall(innerId)));

		container.innerHTML = c.chunks.join('');
		activate(container);
		expect(container.querySelector('.inner-value')?.textContent).toBe('inside');
		expect(container.querySelector('.outer-value')?.textContent).toBe('outside');
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
		const [id] = protocolIds(c.chunks[0]);
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
		expect(tail).toContain(errorCall(id));
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
		const [id] = protocolIds(c.chunks[0]);
		abort(new Error('gone'));
		await c.ended;
		expect(c.chunks.join('')).toContain(errorCall(id));
		expect(onError).toHaveBeenCalled();
	});

	it('waits for Node drain before writing the next chunk or ending', async () => {
		const d = deferred<string>();
		const emitter = new EventEmitter();
		const chunks: string[] = [];
		let end!: () => void;
		const ended = new Promise<void>((resolve) => (end = resolve));
		let allReady = false;
		const destination = {
			write(chunk: string) {
				chunks.push(chunk);
				return chunks.length !== 1; // pressure the shell write
			},
			end,
			once: emitter.once.bind(emitter),
			off: emitter.off.bind(emitter),
		};
		ServerRT.renderToPipeableStream(
			server.Boundary,
			{ promise: d.promise },
			{ onAllReady: () => (allReady = true) },
		).pipe(destination);
		expect(chunks).toHaveLength(1);

		d.resolve('after-drain');
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(chunks).toHaveLength(1);
		expect(allReady).toBe(false);

		emitter.emit('drain');
		await ended;
		expect(chunks).toHaveLength(2);
		expect(chunks[1]).toContain('after-drain');
		expect(allReady).toBe(true);
	});

	it('reports late destination write and end failures after rendering completed', async () => {
		const Sync = () => '<p>ready</p>';
		const writeError = new Error('write failed');
		const onWriteError = vi.fn();
		ServerRT.renderToPipeableStream(Sync as any, undefined, { onError: onWriteError }).pipe({
			write() {
				throw writeError;
			},
			end: vi.fn(),
		});
		expect(onWriteError).toHaveBeenCalledTimes(1);
		expect(onWriteError).toHaveBeenCalledWith(writeError);

		const endError = new Error('end failed');
		const onEndError = vi.fn();
		ServerRT.renderToPipeableStream(Sync as any, undefined, { onError: onEndError }).pipe({
			write: () => true,
			end() {
				throw endError;
			},
		});
		expect(onEndError).toHaveBeenCalledTimes(1);
		expect(onEndError).toHaveBeenCalledWith(endError);
		await Promise.resolve();
	});

	it('abort breaks a Node drain wait and still queues degraded recovery', async () => {
		const d = deferred<string>();
		const emitter = new EventEmitter();
		const chunks: string[] = [];
		let end!: () => void;
		const ended = new Promise<void>((resolve) => (end = resolve));
		const onError = vi.fn();
		const render = ServerRT.renderToPipeableStream(
			server.Boundary,
			{ promise: d.promise },
			{ onError },
		);
		render.pipe({
			write(chunk: string) {
				chunks.push(chunk);
				return false;
			},
			end,
			once: emitter.once.bind(emitter),
			off: emitter.off.bind(emitter),
		});
		const [id] = protocolIds(chunks[0]);
		d.resolve('must-not-flush');
		await new Promise((resolve) => setTimeout(resolve, 20));
		render.abort(new Error('stop-under-pressure'));
		await ended;
		expect(chunks.join('')).not.toContain('must-not-flush');
		expect(chunks.join('')).toContain(errorCall(id));
		expect(onError).toHaveBeenCalled();
	});

	it('cancels rendering when a Node destination closes under pressure', async () => {
		const d = deferred<string>();
		const emitter = new EventEmitter();
		const chunks: string[] = [];
		const onError = vi.fn();
		const onAllReady = vi.fn();
		const end = vi.fn();
		ServerRT.renderToPipeableStream(
			server.Boundary,
			{ promise: d.promise },
			{ onError, onAllReady },
		).pipe({
			write(chunk: string) {
				chunks.push(chunk);
				return false;
			},
			end,
			once: emitter.once.bind(emitter),
			off: emitter.off.bind(emitter),
		});

		emitter.emit('close');
		await vi.waitFor(() => expect(onError).toHaveBeenCalled());
		d.resolve('must-not-render');
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(chunks).toHaveLength(1);
		expect(chunks.join('')).not.toContain('must-not-render');
		expect(onAllReady).not.toHaveBeenCalled();
		expect(end).not.toHaveBeenCalled();
	});

	it('cancels rendering when a Node destination errors under pressure', async () => {
		const d = deferred<string>();
		const emitter = new EventEmitter();
		const chunks: string[] = [];
		const onError = vi.fn();
		ServerRT.renderToPipeableStream(server.Boundary, { promise: d.promise }, { onError }).pipe({
			write(chunk: string) {
				chunks.push(chunk);
				return false;
			},
			end: vi.fn(),
			once: emitter.once.bind(emitter),
			off: emitter.off.bind(emitter),
		});
		const reason = new Error('socket failed');
		emitter.emit('error', reason);
		await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(reason));
		d.resolve('must-not-render');
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(chunks).toHaveLength(1);
		expect(chunks.join('')).not.toContain('must-not-render');
	});

	it('puts the CSP nonce on shell, segment, seed, style, and degraded scripts', async () => {
		const nonce = 'stream-"nonce';
		const d = deferred<string>();
		const c = collector();
		ServerRT.renderToPipeableStream(server.StyledBoundary, { promise: d.promise }, { nonce }).pipe(
			c.dest,
		);
		d.resolve('nonce-ok');
		await c.ended;
		const tags = c.chunks.join('').match(/<(?:script|style)\b[^>]*>/g) ?? [];
		expect(tags.length).toBeGreaterThanOrEqual(4);
		for (const tag of tags) expect(tag).toContain('nonce="stream-&quot;nonce"');

		const pending = deferred<string>();
		const aborted = collector();
		const render = ServerRT.renderToPipeableStream(
			server.Boundary,
			{ promise: pending.promise },
			{ nonce },
		);
		render.pipe(aborted.dest);
		const [id] = protocolIds(aborted.chunks[0]);
		render.abort(new Error('stop'));
		await aborted.ended;
		const errorScript = aborted.chunks
			.join('')
			.match(new RegExp('<script[^>]*>' + errorCall(id).replace(/[()$]/g, '\\$&')))?.[0];
		expect(errorScript).toContain('nonce="stream-&quot;nonce"');
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

		const responseText = new Response(stream).text();
		d.resolve('web!');
		await stream.allReady;
		const text = await responseText;
		expect(text).toContain('web!');
		const [id] = protocolIds(text);
		expect(text).toContain(swapCall(id));
	});

	it('holds boundary output until the consumer pulls', async () => {
		const d = deferred<string>();
		const stream = await ServerRT.renderToReadableStream(server.Boundary, {
			promise: d.promise,
		});
		let settled = false;
		stream.allReady.then(() => (settled = true));
		d.resolve('pulled');
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(settled).toBe(false);

		const reader = stream.getReader();
		const shell = await reader.read();
		expect(new TextDecoder().decode(shell.value)).toContain('loading');
		await stream.allReady;
		const segment = await reader.read();
		expect(new TextDecoder().decode(segment.value)).toContain('pulled');
		expect((await reader.read()).done).toBe(true);
	});

	it('consumer cancellation aborts pending rendering and rejects allReady', async () => {
		const d = deferred<string>();
		const onError = vi.fn();
		const onAllReady = vi.fn();
		const stream = await ServerRT.renderToReadableStream(
			server.Boundary,
			{ promise: d.promise },
			{ onError, onAllReady },
		);
		const reason = new Error('reader left');
		await stream.cancel(reason);
		await expect(stream.allReady).rejects.toBe(reason);
		expect(onError).toHaveBeenCalledWith(reason);
		expect(onAllReady).not.toHaveBeenCalled();
		d.resolve('must-not-render');
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(onAllReady).not.toHaveBeenCalled();
	});

	it('external abort rejects allReady even when output is pull-blocked', async () => {
		const d = deferred<string>();
		const aborter = new AbortController();
		const stream = await ServerRT.renderToReadableStream(
			server.Boundary,
			{ promise: d.promise },
			{ signal: aborter.signal },
		);
		d.resolve('must-not-flush');
		await new Promise((resolve) => setTimeout(resolve, 20));
		const reason = new Error('request-left');
		aborter.abort(reason);
		await expect(stream.allReady).rejects.toBe(reason);

		const text = await new Response(stream).text();
		const [id] = protocolIds(text);
		expect(text).not.toContain('must-not-flush');
		expect(text).toContain(errorCall(id));
	});
});

describe('streamed page → swap runtime → hydration (end to end)', () => {
	it('hydrates completed boundary useId values in its opaque stream namespace', async () => {
		const d = deferred<string>();
		const c = collector();
		const { pipe } = ServerRT.renderToPipeableStream(
			server.IdBoundary,
			{ promise: d.promise },
			{ identifierPrefix: 'page-' },
		);
		pipe(c.dest);
		const [id] = protocolIds(c.chunks[0]);
		d.resolve('ready');
		await c.ended;

		container.innerHTML = c.chunks.join('');
		activate(container);
		const rootId = ':page-in-0:';
		const boundaryId = ':page-b' + id + '-in-0:';
		expect(container.querySelector('#id-box')!.getAttribute('data-root-id')).toBe(rootId);
		expect(container.querySelector('.id-ok')!.getAttribute('data-boundary-id')).toBe(boundaryId);

		const seen: Array<[string, string]> = [];
		const content = container.querySelector('.id-ok');
		const clientPending = new Promise<string>(() => {});
		const root = hydrateRoot(
			container,
			IdBoundary as any,
			{ promise: clientPending, onId: (arm: string, value: string) => seen.push([arm, value]) },
			{ identifierPrefix: 'page-' },
		);
		flushSync(() => {});
		expect(container.querySelector('.id-ok')).toBe(content);
		expect(seen).toContainEqual(['root', rootId]);
		expect(seen).toContainEqual(['content', boundaryId]);
		root.unmount();
	});

	it('hydrates a pending shell with the template boundary useId namespace', async () => {
		const d = deferred<string>();
		const c = collector();
		const render = ServerRT.renderToPipeableStream(
			server.IdBoundary,
			{ promise: d.promise },
			{ identifierPrefix: 'page-' },
		);
		render.pipe(c.dest);
		const [id] = protocolIds(c.chunks[0]);
		container.innerHTML = c.chunks[0];
		activate(container);

		const rootId = ':page-in-0:';
		const boundaryId = ':page-b' + id + '-in-0:';
		expect(container.querySelector('#id-box')!.getAttribute('data-root-id')).toBe(rootId);
		expect(container.querySelector('.id-loading')!.getAttribute('data-boundary-id')).toBe(
			boundaryId,
		);

		const seen: Array<[string, string]> = [];
		const clientPending = new Promise<string>(() => {});
		// A still-pending shell intentionally takes mountTry's documented degraded
		// client-render path; keep its expected structural warning out of test output.
		const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const root = hydrateRoot(
			container,
			IdBoundary as any,
			{ promise: clientPending, onId: (arm: string, value: string) => seen.push([arm, value]) },
			{ identifierPrefix: 'page-' },
		);
		flushSync(() => {});
		errSpy.mockRestore();
		expect(seen).toContainEqual(['root', rootId]);
		expect(seen).toContainEqual(['pending', boundaryId]);
		root.unmount();
		render.abort(new Error('test complete'));
		await c.ended;
	});

	it('hydrates a streamed catch arm from a rejection seed without replacing its DOM', async () => {
		const d = deferred<string>();
		const c = collector();
		const { pipe } = ServerRT.renderToPipeableStream(
			server.IdBoundary,
			{ promise: d.promise },
			{ identifierPrefix: 'page-' },
		);
		pipe(c.dest);
		const [id] = protocolIds(c.chunks[0]);
		d.reject({ name: 'PlainFailure', message: 'server-no' });
		await c.ended;

		container.innerHTML = c.chunks.join('');
		activate(container);
		const rootId = ':page-in-0:';
		const boundaryId = ':page-b' + id + '-in-0:';
		const errorSpan = container.querySelector('.id-error');
		expect(errorSpan!.textContent).toBe('server-no');
		expect(errorSpan!.getAttribute('data-boundary-id')).toBe(boundaryId);

		const seen: Array<[string, string]> = [];
		const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const clientPending = new Promise<string>(() => {});
		const root = hydrateRoot(
			container,
			IdBoundary as any,
			{ promise: clientPending, onId: (arm: string, value: string) => seen.push([arm, value]) },
			{ identifierPrefix: 'page-' },
		);
		flushSync(() => {});
		expect(container.querySelector('.id-error')).toBe(errorSpan);
		expect(container.querySelector('.id-loading')).toBeNull();
		expect(seen).toContainEqual(['root', rootId]);
		expect(seen).toContainEqual(['catch', boundaryId]);
		expect(errSpy).not.toHaveBeenCalled();
		errSpy.mockRestore();
		root.unmount();
	});

	it('preserves primitive and plain-object reasons in streamed catch hydration', async () => {
		const cases = [
			{ reason: 'stream-string', text: 'stream-string:', kind: 'string', code: '' },
			{
				reason: { message: 'stream-object', code: 'E_STREAM' },
				text: 'stream-object:E_STREAM',
				kind: 'object',
				code: 'E_STREAM',
			},
		] as const;

		for (const testCase of cases) {
			const d = deferred<string>();
			const c = collector();
			const { pipe } = ServerRT.renderToPipeableStream(server.ReasonBoundary, {
				promise: d.promise,
			});
			pipe(c.dest);
			d.reject(testCase.reason);
			await c.ended;

			container.innerHTML = c.chunks.join('');
			activate(container);
			const serverCatch = container.querySelector('.reason-error');
			let caught: any;
			const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
			const root = hydrateRoot(container, ReasonBoundary as any, {
				promise: new Promise<string>(() => {}),
				onCatch: (reason: unknown) => (caught = reason),
			});
			flushSync(() => {});

			expect(container.querySelector('.reason-error')).toBe(serverCatch);
			expect(serverCatch!.textContent).toBe(testCase.text);
			expect(serverCatch!.getAttribute('data-kind')).toBe(testCase.kind);
			expect(serverCatch!.getAttribute('data-code')).toBe(testCase.code);
			if (typeof testCase.reason === 'string') expect(caught).toBe(testCase.reason);
			else expect(caught).toEqual(testCase.reason);
			expect(errorSpy).not.toHaveBeenCalled();
			errorSpy.mockRestore();
			root.unmount();
		}
	});

	it('swaps the segment into place, scopes its seeds, and hydrates byte-for-byte', async () => {
		const d = deferred<string>();
		const c = collector();
		const { pipe } = ServerRT.renderToPipeableStream(server.Boundary, { promise: d.promise });
		pipe(c.dest);
		const [id] = protocolIds(c.chunks[0]);
		d.resolve('streamed!');
		await c.ended;

		// Build the browser-equivalent DOM: parse the full stream, run its scripts.
		container.innerHTML = c.chunks.join('');
		activate(container);
		// Post-swap: fallback gone, content live, seed comment + stash in place.
		expect(container.querySelector('.loading')).toBeNull();
		expect(container.querySelector('.ok')!.textContent).toBe('streamed!');
		expect(container.querySelector('[data-oct-s]')).toBeNull();
		expect((window as any).$OCTS[id]).toContain('streamed!');

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
		expect((window as any).$OCTS[id]).toContain('streamed!');
		errSpy.mockRestore();
		root.unmount();
	});

	it('hydrates a shell whose leading <style data-octane> tags precede the body', async () => {
		// The shell flushes scoped styles BEFORE the body markup (so painted
		// fallbacks are styled) — the container's first children are <style>
		// tags, and hydrateRoot must skip them when positioning the cursor.
		const d = deferred<string>();
		const c = collector();
		const { pipe } = ServerRT.renderToPipeableStream(server.StyledBoundary, {
			promise: d.promise,
		});
		pipe(c.dest);
		d.resolve('styled!');
		await c.ended;
		expect(c.chunks[0].startsWith('<style data-octane=')).toBe(true);

		container.innerHTML = c.chunks.join('');
		activate(container);
		expect(container.firstElementChild!.tagName).toBe('STYLE');
		expect(container.querySelector('.ok')!.textContent).toBe('styled!');

		const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const okSpan = container.querySelector('.ok');
		const clientPending = new Promise<string>(() => {});
		const root = hydrateRoot(container, StyledBoundary as any, { promise: clientPending });
		flushSync(() => {});
		expect(container.querySelector('.ok')).toBe(okSpan); // adopted, not rebuilt
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

	it('gives a pending nested stream boundary an empty seed scope', async () => {
		const outer = deferred<string>();
		const inner = deferred<string>();
		const later = deferred<string>();
		const c = collector();
		const render = ServerRT.renderToPipeableStream(server.NestedStreamSeedScopes, {
			outer: outer.promise,
			inner: inner.promise,
			later: later.promise,
		});
		render.pipe(c.dest);
		outer.resolve('outer-ready');
		later.resolve('later-ready');
		await vi.waitFor(() => expect(c.chunks.length).toBeGreaterThan(1));

		container.innerHTML = c.chunks.join('');
		activate(container);
		const outerNode = container.querySelector('.outer-seed');
		const pendingNode = container.querySelector('.inner-seed-pending');
		const laterNode = container.querySelector('.later-seed');
		expect(outerNode!.textContent).toBe('outer-ready');
		expect(pendingNode!.textContent).toBe('inner pending');
		expect(laterNode!.textContent).toBe('later-ready');

		const clientOuter: any = new Promise<string>(() => {});
		const clientInner: any = new Promise<string>(() => {});
		const clientLater: any = new Promise<string>(() => {});
		// A still-pending nested template takes the existing degraded structural
		// recovery path; this regression observes seed ownership on the thenables.
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const root = hydrateRoot(container, NestedStreamSeedScopes as any, {
			outer: clientOuter,
			inner: clientInner,
			later: clientLater,
		});
		flushSync(() => {});

		expect(clientOuter.status).toBe('fulfilled');
		expect(clientOuter.value).toBe('outer-ready');
		// The inner template owns an EMPTY scope. Without the guard it consumes
		// the outer segment's `later-ready` seed and becomes spuriously fulfilled.
		expect(clientInner.status).toBe('pending');
		expect(clientInner.value).toBeUndefined();
		errorSpy.mockRestore();
		root.unmount();
		render.abort(new Error('test complete'));
		await c.ended;
	});
});
