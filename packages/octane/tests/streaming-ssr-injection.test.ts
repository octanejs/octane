import { describe, it, expect, afterEach } from 'vitest';
import * as ServerRuntime from 'octane/server';
import { loadServerFixture } from './_server-fixture.js';
import {
	collectPipeableStream,
	collectReadableStream,
	createPipeableCollector,
	deferred,
	resetStreamRuntimeGlobals,
} from './_server-stream.js';

// Streaming SSR — external HTML injection (`StreamOptions.injection`). A
// framework (e.g. TanStack Start) produces `<script>` chunks over time as its
// loaders settle; the renderer merges them into the response stream natively:
// verbatim, in push order, each as its own transport chunk strictly between
// renderer chunks, never before the shell, and — for document renders — before
// the held `</body></html>` tail. The stream stays open until the source's
// `done` promise settles, so late data scripts are never dropped. Without the
// option, streamed output is byte-identical to before.

const FIXTURE = 'packages/octane/tests/_fixtures/ssr-injection.tsrx';
const server = loadServerFixture(FIXTURE);

afterEach(resetStreamRuntimeGlobals);

interface TestInjection {
	source: ServerRuntime.StreamInjectionSource;
	push(html: string): void;
	finish(): void;
	fail(reason: unknown): void;
	readonly subscribed: boolean;
	readonly unsubscribed: boolean;
	readonly renderCompleteCalls: number;
}

function createTestInjection(): TestInjection {
	const queue: string[] = [];
	let notify: (() => void) | null = null;
	let subscribed = false;
	let unsubscribed = false;
	let renderCompleteCalls = 0;
	const done = deferred<void>();
	// The renderer must observe `done` rejections itself; a consumer-side guard
	// here keeps a failed test from dying on an unrelated unhandled rejection.
	done.promise.catch(() => {});
	return {
		source: {
			take: () => queue.splice(0).join(''),
			subscribe(callback) {
				subscribed = true;
				notify = callback;
				return () => {
					unsubscribed = true;
					notify = null;
				};
			},
			done: done.promise,
			renderComplete() {
				renderCompleteCalls += 1;
			},
		},
		push(html) {
			queue.push(html);
			notify?.();
		},
		finish: () => done.resolve(),
		fail: (reason) => done.reject(reason),
		get subscribed() {
			return subscribed;
		},
		get unsubscribed() {
			return unsubscribed;
		},
		get renderCompleteCalls() {
			return renderCompleteCalls;
		},
	};
}

const flushMicrotasks = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

// A document's closing tail: `</body>` followed by nothing but comment markers
// (hydration block markers interleave with the closing tags) and `</html>`.
const DOCUMENT_TAIL = /^<\/body>(?:\s|<!--[^]*?-->)*<\/html>(?:\s|<!--[^]*?-->)*$/;
function tailOf(html: string): string {
	const index = html.lastIndexOf('</body>');
	expect(index).toBeGreaterThan(-1);
	return html.slice(index);
}

describe('streaming injection — fragment renders', () => {
	it('delivers pushed HTML verbatim, in order, as its own chunks between renderer chunks', async () => {
		const value = deferred<string>();
		const injection = createTestInjection();
		const scriptA = '<script data-inject="a">window.__a=1</script>';
		const scriptB = '<script data-inject="b">window.__b=1</script>';

		const result = collectPipeableStream(
			server.FragmentApp,
			{ promise: value.promise },
			{
				injection: injection.source,
			},
		);
		// Data available while the boundary is still pending.
		await flushMicrotasks();
		injection.push(scriptA);
		await flushMicrotasks();
		value.resolve('streamed');
		await flushMicrotasks();
		injection.push(scriptB);
		injection.finish();

		const { html, chunks } = await result;
		// Verbatim + ordered: A before B, both after the shell chunk.
		expect(html).toContain(scriptA);
		expect(html).toContain(scriptB);
		expect(html.indexOf(scriptA)).toBeLessThan(html.indexOf(scriptB));
		expect(html.indexOf('shell')).toBeLessThan(html.indexOf(scriptA));
		// Each injected payload is its own transport chunk — never spliced into
		// the middle of a renderer chunk.
		expect(chunks).toContain(scriptA);
		expect(chunks).toContain(scriptB);
		// The revealed boundary content still streamed normally.
		expect(html).toContain('streamed');
	});

	it('holds the stream open until `done` settles and drains idle pushes promptly', async () => {
		const value = deferred<string>();
		const injection = createTestInjection();
		const collector = createPipeableCollector();
		let allReady = false;
		let ended = false;
		void collector.ended.then(() => {
			ended = true;
		});

		ServerRuntime.renderToPipeableStream(
			server.FragmentApp,
			{ promise: value.promise },
			{
				injection: injection.source,
				onAllReady: () => {
					allReady = true;
				},
			},
		).pipe(collector.destination);

		value.resolve('streamed');
		await flushMicrotasks();
		await flushMicrotasks();
		// Rendering is complete, but the injection source is not done: the
		// response must stay open.
		expect(ended).toBe(false);

		// A push while the renderer is idle still reaches the wire without any
		// renderer output to piggyback on.
		const late = '<script data-inject="late">window.__late=1</script>';
		injection.push(late);
		await flushMicrotasks();
		expect(collector.chunks).toContain(late);
		expect(ended).toBe(false);

		// The renderer told the source rendering finished (exactly once) while
		// the stream was still open — that signal is what lets a source finalize
		// and eventually settle `done`.
		expect(injection.renderCompleteCalls).toBe(1);

		injection.finish();
		await collector.ended;
		expect(allReady).toBe(true);
		expect(injection.unsubscribed).toBe(true);
		expect(collector.chunks.join('')).toContain('streamed');
	});

	it('never emits injected HTML before the shell', async () => {
		const value = deferred<string>();
		const injection = createTestInjection();
		// Queued before the render even starts.
		const early = '<script data-inject="early">window.__early=1</script>';
		injection.push(early);
		value.resolve('streamed');
		injection.finish();

		const { html, chunks } = await collectPipeableStream(
			server.FragmentApp,
			{ promise: value.promise },
			{ injection: injection.source },
		);
		expect(html).toContain(early);
		expect(chunks[0]).not.toContain(early);
		expect(html.indexOf('shell')).toBeLessThan(html.indexOf(early));
	});

	it('merges through the web-stream API identically', async () => {
		const value = deferred<string>();
		const injection = createTestInjection();
		const script = '<script data-inject="w">window.__w=1</script>';
		value.resolve('streamed');

		const result = collectReadableStream(
			server.FragmentApp,
			{ promise: value.promise },
			{
				injection: injection.source,
			},
		);
		await flushMicrotasks();
		injection.push(script);
		injection.finish();

		const { html } = await result;
		expect(html).toContain(script);
		expect(html).toContain('streamed');
		expect(html.indexOf('shell')).toBeLessThan(html.indexOf(script));
	});
});

describe('streaming injection — document renders', () => {
	it('holds </body></html> until render and injection both finish', async () => {
		const value = deferred<string>();
		const injection = createTestInjection();
		const dataScript = '<script data-inject="doc">window.__doc=1</script>';

		const result = collectPipeableStream(
			server.DocumentApp,
			{ promise: value.promise },
			{
				injection: injection.source,
			},
		);
		await flushMicrotasks();
		value.resolve('streamed');
		await flushMicrotasks();
		injection.push(dataScript);
		injection.finish();

		const { html, chunks } = await result;
		// The response is a well-formed document that ends with the tail…
		expect(tailOf(html)).toMatch(DOCUMENT_TAIL);
		// …the tail appears exactly once…
		expect(html.match(/<\/body>/g)).toHaveLength(1);
		expect(html.match(/<\/html>/g)).toHaveLength(1);
		// …and the injected script AND the streamed boundary content precede it,
		// i.e. they live inside <body>.
		expect(html.indexOf(dataScript)).toBeLessThan(html.indexOf('</body>'));
		expect(html.indexOf('streamed')).toBeLessThan(html.indexOf('</body>'));
		// The shell chunk no longer carries the tail; the tail is the final chunk.
		expect(chunks[0]).not.toContain('</body>');
		expect(chunks[chunks.length - 1]).toMatch(DOCUMENT_TAIL);
	});

	it('keeps document output byte-identical when no injection source is supplied', async () => {
		const value = deferred<string>();
		value.resolve('streamed');
		const { chunks } = await collectPipeableStream(server.DocumentApp, {
			promise: value.promise,
		});
		// Without injection the shell still contains the closing tags and no
		// document-mode additions — the pre-feature stream shape is preserved.
		expect(chunks[0]).toContain('</body>');
		expect(chunks[0]).toContain('</html>');
		expect(chunks[0]).not.toContain('<!DOCTYPE html>');
	});

	it('leads the document with <!DOCTYPE html> under injection', async () => {
		const value = deferred<string>();
		const injection = createTestInjection();
		value.resolve('streamed');
		injection.finish();

		const { html, chunks } = await collectPipeableStream(
			server.DocumentApp,
			{ promise: value.promise },
			{ injection: injection.source },
		);
		// The doctype is the very first bytes of the response — a misplaced
		// doctype (or none) drops browsers into quirks mode.
		expect(chunks[0].startsWith('<!DOCTYPE html>')).toBe(true);
		expect(html.match(/<!DOCTYPE html>/g)).toHaveLength(1);
	});

	it('folds leading scoped styles into <head> under injection', async () => {
		const value = deferred<string>();
		const injection = createTestInjection();
		value.resolve('streamed');
		injection.finish();

		const { html } = await collectPipeableStream(
			server.StyledDocumentApp,
			{ promise: value.promise },
			{ injection: injection.source },
		);
		const headOpen = html.indexOf('<head');
		const headClose = html.indexOf('</head>');
		const styleAt = html.indexOf('<style data-octane=');
		expect(headOpen).toBeGreaterThan(-1);
		// Renderer-owned scoped styles live inside the authored <head>, not
		// before <html>.
		expect(styleAt).toBeGreaterThan(headOpen);
		expect(styleAt).toBeLessThan(headClose);
		// The document still starts with the doctype (styles no longer precede it).
		expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
	});

	it('keeps leading styles ahead of the markup for documents without injection', async () => {
		const value = deferred<string>();
		value.resolve('streamed');
		const { html } = await collectPipeableStream(server.StyledDocumentApp, {
			promise: value.promise,
		});
		// The established fragment-friendly shape: renderer styles precede the
		// rendered markup when no injection source opted into document mode.
		expect(html.indexOf('<style data-octane=')).toBeLessThan(html.indexOf('<html'));
	});
});

describe('streaming injection — failure modes', () => {
	it('a rejected `done` fails the stream after rendering', async () => {
		const value = deferred<string>();
		const injection = createTestInjection();
		value.resolve('streamed');

		const errors: unknown[] = [];
		const boom = new Error('serialization failed');
		const collector = createPipeableCollector();
		let allReady = false;
		ServerRuntime.renderToPipeableStream(
			server.FragmentApp,
			{ promise: value.promise },
			{
				injection: injection.source,
				onError: (error) => {
					errors.push(error);
				},
				onAllReady: () => {
					allReady = true;
				},
			},
		).pipe(collector.destination);

		await flushMicrotasks();
		await flushMicrotasks();
		injection.fail(boom);
		await collector.ended;
		expect(errors).toContain(boom);
		// Degraded terminal completion mirrors the abort path: the consumer's
		// completion callback still fires so surrounding document work ends.
		expect(allReady).toBe(true);
		expect(injection.unsubscribed).toBe(true);
	});

	it('an abort while awaiting `done` still ends the response with the held document tail', async () => {
		const value = deferred<string>();
		const injection = createTestInjection();
		value.resolve('streamed');

		const errors: unknown[] = [];
		const collector = createPipeableCollector();
		const render = ServerRuntime.renderToPipeableStream(
			server.DocumentApp,
			{ promise: value.promise },
			{
				injection: injection.source,
				onError: (error) => {
					errors.push(error);
				},
			},
		);
		render.pipe(collector.destination);
		await flushMicrotasks();
		await flushMicrotasks();
		render.abort(new Error('client disconnected'));
		const html = await collector.ended;
		expect(errors.length).toBeGreaterThan(0);
		// Best-effort well-formedness: the held tail is flushed terminally so the
		// aborted document still closes <body>/<html>.
		expect(tailOf(html)).toMatch(DOCUMENT_TAIL);
		expect(injection.unsubscribed).toBe(true);
	});

	it('signals renderComplete on an aborted render so the source can finalize', async () => {
		const value = deferred<string>();
		const injection = createTestInjection();

		const collector = createPipeableCollector();
		const render = ServerRuntime.renderToPipeableStream(
			server.FragmentApp,
			{ promise: value.promise },
			{ injection: injection.source, onError: () => {} },
		);
		render.pipe(collector.destination);
		await flushMicrotasks();
		// Abort while the boundary is still pending: the source must still learn
		// rendering is over, or its serialization would wait forever.
		render.abort(new Error('client disconnected'));
		await collector.ended;
		expect(injection.renderCompleteCalls).toBe(1);
		expect(injection.unsubscribed).toBe(true);
	});
});
