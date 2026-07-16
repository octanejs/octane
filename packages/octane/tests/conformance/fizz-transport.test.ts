import { afterEach, describe, expect, it, vi } from 'vitest';
import * as ServerRuntime from 'octane/server';
import { loadServerFixture } from '../_server-fixture.js';
import {
	activateStreamedMarkup,
	createPipeableCollector,
	deferred,
	resetStreamRuntimeGlobals,
} from '../_server-stream.js';

const FIXTURE = 'packages/octane/tests/conformance/_fixtures/fizz-transport.tsrx';
const server = loadServerFixture(FIXTURE);

function never<T>(): Promise<T> {
	return new Promise<T>(() => {});
}

function parseStreamed(html: string): HTMLDivElement {
	const container = document.createElement('div');
	container.dataset.fizzTransportRoot = '';
	document.body.appendChild(container);
	container.innerHTML = html;
	activateStreamedMarkup(container);
	return container;
}

afterEach(() => {
	resetStreamRuntimeGlobals();
	document.querySelectorAll('[data-fizz-transport-root]').forEach((node) => node.remove());
});

async function abortTwoReadableBoundaries(reason: unknown) {
	const controller = new AbortController();
	const errors: unknown[] = [];
	const stream = await ServerRuntime.renderToReadableStream(
		server.TwoPendingBoundaries,
		{ promise: never() },
		{
			signal: controller.signal,
			onError: (error) => errors.push(error),
			timeoutMs: 0,
		},
	);
	const response = new Response(stream).text();
	controller.abort(reason);
	const html = await response;
	await expect(stream.allReady).rejects.toBe(reason);
	return { errors, html };
}

describe('conformance: Fizz transport, abort, and shell errors', () => {
	// Per ReactDOMFizzServerNode-test.js:145.
	it('writes the pipeable response only after pipe supplies a destination', async () => {
		const render = ServerRuntime.renderToPipeableStream(server.TextPayload, {
			text: 'hello world',
		});
		await Promise.resolve();

		let output = '<header>host prefix</header>';
		let finish!: () => void;
		const ended = new Promise<void>((resolve) => (finish = resolve));
		render.pipe({
			write(chunk: string) {
				output += chunk;
				return true;
			},
			end: finish,
		});
		await ended;

		expect(output).toBe(
			'<header>host prefix</header><div id="transport-payload">hello world</div>',
		);
	});

	// Per ReactDOMFizzServerNode-test.js:163. The public contract is that work
	// can finish before a destination is attached and the late consumer still
	// receives the resolved UI; transport chunk coalescing is not observable UI.
	it('delivers resolved content when pipe starts after all work is ready', async () => {
		const value = deferred<string>();
		const ready = deferred<void>();
		const render = ServerRuntime.renderToPipeableStream(
			server.PendingPayload,
			{ promise: value.promise },
			{ onAllReady: ready.resolve, timeoutMs: 0 },
		);
		value.resolve('Done');
		await ready.promise;

		const collector = createPipeableCollector();
		render.pipe(collector.destination);
		const container = parseStreamed(await collector.ended);
		expect(container.querySelector('.pending-value')?.textContent).toBe('Done');
		expect(container.querySelector('.pending-fallback')).toBeNull();
	});

	// Per ReactDOMFizzServerNode-test.js:250.
	it('does not report a later abort after a fatal shell error', async () => {
		const renderError = new Error('root failed');
		const errors: unknown[] = [];
		const shellErrors: unknown[] = [];
		const collector = createPipeableCollector();
		const render = ServerRuntime.renderToPipeableStream(
			server.PendingThenRootError,
			{ promise: never(), error: renderError },
			{
				onError: (error) => errors.push(error),
				onShellError: (error) => shellErrors.push(error),
				timeoutMs: 0,
			},
		);
		render.pipe(collector.destination);
		expect(await collector.ended).toBe('');
		expect(errors).toEqual([renderError]);
		expect(shellErrors).toEqual([renderError]);

		render.abort(new Error('too late'));
		expect(errors).toEqual([renderError]);
		expect(shellErrors).toEqual([renderError]);
	});

	// Per ReactDOMFizzServerNode-test.js:281 and
	// ReactDOMFizzServerBrowser-test.js:158.
	it('treats an error thrown by a Suspense fallback as a shell failure', async () => {
		const pipeError = new Error('pipe fallback failed');
		const pipeErrors: unknown[] = [];
		const shellErrors: unknown[] = [];
		const collector = createPipeableCollector();
		ServerRuntime.renderToPipeableStream(
			server.FatalFallback,
			{ promise: never(), error: pipeError },
			{
				onError: (error) => pipeErrors.push(error),
				onShellError: (error) => shellErrors.push(error),
				timeoutMs: 0,
			},
		).pipe(collector.destination);
		expect(await collector.ended).toBe('');
		expect(pipeErrors).toEqual([pipeError]);
		expect(shellErrors).toEqual([pipeError]);

		const readableError = new Error('readable fallback failed');
		const readableErrors: unknown[] = [];
		await expect(
			ServerRuntime.renderToReadableStream(
				server.FatalFallback,
				{ promise: never(), error: readableError },
				{
					onError: (error) => readableErrors.push(error),
					timeoutMs: 0,
				},
			),
		).rejects.toBe(readableError);
		expect(readableErrors).toEqual([readableError]);
	});

	// Per ReactDOMFizzServerNode-test.js:311 and
	// ReactDOMFizzServerBrowser-test.js:183.
	it('keeps the shell valid when content throws inside a Suspense boundary', async () => {
		const pipeError = new Error('pipe content failed');
		const pipeErrors: unknown[] = [];
		const shellErrors: unknown[] = [];
		const allReady = vi.fn();
		const collector = createPipeableCollector();
		ServerRuntime.renderToPipeableStream(
			server.ErrorInsideBoundary,
			{ error: pipeError },
			{
				onError: (error) => pipeErrors.push(error),
				onShellError: (error) => shellErrors.push(error),
				onAllReady: allReady,
			},
		).pipe(collector.destination);
		const pipeContainer = parseStreamed(await collector.ended);
		expect(pipeContainer.querySelector('.error-boundary-fallback')?.textContent).toBe('loading');
		expect(pipeErrors).toEqual([pipeError]);
		expect(shellErrors).toEqual([]);
		expect(allReady).toHaveBeenCalledOnce();

		const readableError = new Error('readable content failed');
		const readableErrors: unknown[] = [];
		const readable = await ServerRuntime.renderToReadableStream(
			server.ErrorInsideBoundary,
			{ error: readableError },
			{ onError: (error) => readableErrors.push(error) },
		);
		const readableContainer = parseStreamed(await new Response(readable).text());
		await expect(readable.allReady).resolves.toBeUndefined();
		expect(readableContainer.querySelector('.error-boundary-fallback')?.textContent).toBe(
			'loading',
		);
		expect(readableErrors).toEqual([readableError]);
	});

	// Per ReactDOMFizzServerNode-test.js:348.
	it('does not render a Suspense fallback when primary content completes synchronously', async () => {
		const onFallback = vi.fn(() => 'loading');
		const collector = createPipeableCollector();
		ServerRuntime.renderToPipeableStream(server.CompleteContent, { onFallback }).pipe(
			collector.destination,
		);
		const html = await collector.ended;
		expect(html).toContain('<strong>ready</strong>');
		expect(html).not.toContain('loading');
		expect(onFallback).not.toHaveBeenCalled();
	});

	// Per ReactDOMFizzServerNode-test.js:412. Octane starts work when pipe() is
	// called, so aborting the returned handle first is the deterministic public
	// equivalent of aborting before React's scheduled work begins.
	it('fails the pipeable shell when aborted before rendering begins', async () => {
		const reason = new Error('request ended');
		const errors: unknown[] = [];
		const shellErrors: unknown[] = [];
		const allReady = vi.fn();
		const render = ServerRuntime.renderToPipeableStream(
			server.PendingPayload,
			{ promise: never() },
			{
				onError: (error) => errors.push(error),
				onShellError: (error) => shellErrors.push(error),
				onAllReady: allReady,
				timeoutMs: 0,
			},
		);
		render.abort(reason);
		const collector = createPipeableCollector();
		render.pipe(collector.destination);

		expect(await collector.ended).toBe('');
		expect(errors).toEqual([reason]);
		expect(shellErrors).toEqual([reason]);
		expect(allReady).not.toHaveBeenCalled();
	});

	// Per ReactDOMFizzServerNode-test.js:455. The pass-based Octane adaptation
	// uses one pending boundary task plus two parallel root tasks.
	it('reports each suspended task on a pre-shell abort but fails the shell once', async () => {
		const boundary = never<string>();
		const one = never<string>();
		const two = never<string>();
		const rootRendered = deferred<void>();
		const reason = new Error('abort reason');
		const errors: unknown[] = [];
		const shellErrors: unknown[] = [];
		const render = ServerRuntime.renderToPipeableStream(
			server.BoundaryAndRootTasks,
			{
				boundary,
				one,
				two,
				onRootRender: rootRendered.resolve,
			},
			{
				onError: (error) => errors.push(error),
				onShellError: (error) => shellErrors.push(error),
				timeoutMs: 0,
			},
		);
		await rootRendered.promise;
		render.abort(reason);
		await vi.waitFor(() => expect(shellErrors).toEqual([reason]));

		expect(errors).toEqual([reason, reason, reason]);
		const collector = createPipeableCollector();
		render.pipe(collector.destination);
		expect(await collector.ended).toBe('');
	});

	// Per ReactDOMFizzServerNode-test.js:495.
	it('completes an emitted shell when both primary content and its fallback are suspended', async () => {
		const errors: unknown[] = [];
		const allReady = vi.fn();
		const collector = createPipeableCollector();
		const render = ServerRuntime.renderToPipeableStream(
			server.SuspendedFallbackAndContent,
			{ content: never(), fallback: never() },
			{
				onError: (error) => errors.push(error),
				onAllReady: allReady,
				timeoutMs: 0,
			},
		);
		render.pipe(collector.destination);
		expect(collector.chunks.join('')).toContain('outer-fallback');
		render.abort();
		const html = await collector.ended;
		const container = parseStreamed(html);
		expect(container.querySelector('.outer-fallback')?.textContent).toBe('Loading');
		expect(errors).toHaveLength(2);
		expect(allReady).toHaveBeenCalledOnce();
	});

	// Per ReactDOMFizzServerBrowser-test.js:205.
	it('closes a readable shell when aborting a boundary whose promise never resolves', async () => {
		const controller = new AbortController();
		const errors: unknown[] = [];
		const stream = await ServerRuntime.renderToReadableStream(
			server.PendingPayload,
			{ promise: never() },
			{
				signal: controller.signal,
				onError: (error) => errors.push(error),
				timeoutMs: 0,
			},
		);
		const response = new Response(stream).text();
		controller.abort();
		const html = await response;
		const container = parseStreamed(html);
		expect(container.querySelector('.pending-fallback')?.textContent).toBe('loading');
		expect(errors).toEqual([controller.signal.reason]);
		await expect(stream.allReady).rejects.toBe(controller.signal.reason);
	});

	// Per ReactDOMFizzServerBrowser-test.js:234.
	it('rejects a readable render aborted before its root shell completes', async () => {
		const controller = new AbortController();
		const errors: unknown[] = [];
		const render = ServerRuntime.renderToReadableStream(
			server.BarePendingRoot,
			{ promise: never() },
			{
				signal: controller.signal,
				onError: (error) => errors.push(error),
				timeoutMs: 0,
			},
		);
		const reason = new Error('aborted before shell');
		controller.abort(reason);

		await expect(render).rejects.toBe(reason);
		expect(errors).toEqual([reason]);
	});

	// Per ReactDOMFizzServerBrowser-test.js:266.
	it('rejects when an AbortSignal is triggered during render before suspension', async () => {
		const controller = new AbortController();
		const errors: unknown[] = [];
		const render = ServerRuntime.renderToReadableStream(
			server.AbortBeforeSuspend,
			{ promise: never(), abort: () => controller.abort() },
			{
				signal: controller.signal,
				onError: (error) => errors.push(error),
				timeoutMs: 0,
			},
		);

		await expect(render).rejects.toBe(controller.signal.reason);
		expect(errors).toEqual([controller.signal.reason]);
	});

	// Per ReactDOMFizzServerBrowser-test.js:301.
	it('rejects immediately when the readable signal is already aborted', async () => {
		const controller = new AbortController();
		const reason = new Error('already aborted');
		controller.abort(reason);
		const errors: unknown[] = [];

		await expect(
			ServerRuntime.renderToReadableStream(
				server.PendingPayload,
				{ promise: never() },
				{
					signal: controller.signal,
					onError: (error) => errors.push(error),
					timeoutMs: 0,
				},
			),
		).rejects.toBe(reason);
		expect(errors).toEqual([reason]);
	});

	// Per ReactDOMFizzServerBrowser-test.js:436.
	it('reports a caller-provided string reason for every aborted boundary', async () => {
		const { errors, html } = await abortTwoReadableBoundaries('request closed');
		expect(errors).toEqual(['request closed', 'request closed']);
		expect(parseStreamed(html).querySelectorAll('.pending-fallback')).toHaveLength(2);
	});

	// Per ReactDOMFizzServerBrowser-test.js:477.
	it('reports a caller-provided Error reason for every aborted boundary', async () => {
		const reason = new Error('request closed');
		const { errors, html } = await abortTwoReadableBoundaries(reason);
		expect(errors).toEqual([reason, reason]);
		expect(parseStreamed(html).querySelectorAll('.pending-fallback')).toHaveLength(2);
	});

	// Per ReactDOMFizzServerBrowser-test.js:519.
	it('encodes title text through the readable document stream', async () => {
		const stream = await ServerRuntime.renderToReadableStream(server.DocumentTitle, {
			title: 'foo & <bar>',
		});
		const html = await new Response(stream).text();
		const document = new DOMParser().parseFromString(html, 'text/html');
		expect(document.title).toBe('foo & <bar>');
		expect(document.querySelector('main')?.textContent).toBe('body');
	});

	// Per ReactDOMFizzServerEdge-test.js:46.
	it('ignores a resource hint scheduled after the readable stream has closed', async () => {
		const lateHint = deferred<void>();
		const errors: unknown[] = [];
		const App = () => {
			void Promise.resolve()
				.then(() => Promise.resolve())
				.then(() => {
					ServerRuntime.preconnect('/too-late');
					lateHint.resolve();
				});
			return ServerRuntime.createElement('main', { children: 'hello' });
		};
		const stream = await ServerRuntime.renderToReadableStream(App, undefined, {
			onError: (error) => errors.push(error),
		});
		const html = await new Response(stream).text();
		await lateHint.promise;

		const template = document.createElement('template');
		template.innerHTML = html;
		expect(template.content.querySelector('main')?.textContent).toBe('hello');
		expect(template.content.querySelector('link[href="/too-late"]')).toBeNull();
		expect(errors).toEqual([]);
	});
});
