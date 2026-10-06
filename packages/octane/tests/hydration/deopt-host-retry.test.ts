import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createRoot, flushSync, hydrateRoot, lazy } from '../../src/index.js';
import { condition, load } from 'octane/hydration';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// A runtime host element (createElement) adopts its server element while
// hydrating. When the server rendered other children than the client's, the
// host does not match, and as in React nothing is repaired in place: its
// boundary, or else the root, discards its server DOM and renders on the
// client, reporting once. A sibling that suspends that client render leaves
// one copy of the host's children and no second report.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/deopt-host-retry.tsrx',
);
const FILE = 'deopt-host-retry.tsrx';
const SOURCE = readFileSync(FIXTURE, 'utf8');
const LINES = SOURCE.split('\n');

/** React's recoverable hydration error. */
const MISMATCH = /server rendered HTML didn't match the client/;

/** 1-based line of the first fixture line containing `text`, after line `from`. */
function lineOf(text: string, from = 0): number {
	const index = LINES.findIndex((line, i) => i >= from && line.includes(text));
	if (index < 0) throw new Error(`fixture has no line containing ${text}`);
	return index + 1;
}

/** The development warning for the hole at the first `site` after `after`. */
function mismatchAt(site: string, after: string, expected: string, actual: string): string {
	const line = lineOf(site, lineOf(after));
	const column = LINES[line - 1].indexOf(site) + 1;
	return (
		`Octane hydration mismatch at ${FILE}:${line}:${column}: the client expected ${expected} ` +
		`but the server rendered ${actual}. The nearest Suspense or Hydrate boundary, or the ` +
		`root, will be regenerated on the client.`
	);
}

/** Element and text markup, ignoring hydration comments. */
function markup(node: Element): string {
	const copy = node.cloneNode(true) as Element;
	const walker = document.createTreeWalker(copy, NodeFilter.SHOW_COMMENT);
	const comments: Node[] = [];
	while (walker.nextNode()) comments.push(walker.currentNode);
	for (const comment of comments) comment.parentNode!.removeChild(comment);
	return copy.innerHTML;
}

/** The markup a user sees: hidden elements and hydration comments dropped. */
function visibleMarkup(node: Element): string {
	const copy = node.cloneNode(true) as Element;
	for (const hidden of copy.querySelectorAll('[style*="display: none"]')) hidden.remove();
	return markup(copy);
}

describe.each([
	{ name: 'development compile', dev: true },
	{ name: 'production compile', dev: false },
])('hydrateRoot — runtime host children that differ from the server ($name)', ({ dev }) => {
	const server = loadServerFixture(FIXTURE, { id: FILE });
	const client = loadCompiledFixtureSource(SOURCE, {
		id: FILE,
		mode: 'client',
		compileOptions: { dev },
	});
	let container: HTMLElement;
	let root: { render(...args: unknown[]): void; unmount(): void } | null;
	let errSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
		root = null;
		errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		root?.unmount();
		container.remove();
		errSpy.mockRestore();
	});

	const warnings = () =>
		errSpy.mock.calls
			.map((call: unknown[]) => String(call[0]))
			.filter((message: string) => message.includes('hydration mismatch'));

	function clientMarkup(name: string, props: Record<string, unknown>): string {
		const fresh = document.createElement('div');
		const freshRoot = createRoot(fresh);
		flushSync(() => freshRoot.render(client[name], props));
		const out = markup(fresh);
		freshRoot.unmount();
		return out;
	}

	/**
	 * Server-render `name` with the server's children, then hydrate it with
	 * the client's while its lazy sibling suspends, and let the sibling load.
	 */
	async function hydrateAcrossRetry(name: string, kind: string) {
		container.innerHTML = ServerRT.renderToString(server[name], {
			kind,
			server: true,
			v: 'q',
			Tail: server.Tail,
		}).html;
		const main = container.querySelector('main');
		const section = container.querySelector('section')!;
		const host = container.querySelector('#host')!;
		let deliver!: (module: { default: typeof client.Tail }) => void;
		const Tail = lazy(() => new Promise<{ default: typeof client.Tail }>((r) => (deliver = r)));
		const recoverable: string[] = [];
		root = hydrateRoot(
			container,
			client[name],
			{ kind, server: false, v: 'q', Tail },
			{ onRecoverableError: (error: unknown) => recoverable.push((error as Error).message) },
		);
		await act(async () => {});
		const pending = visibleMarkup(container);
		await act(async () => deliver({ default: client.Tail }));
		// The server's host and its section are discarded, never adopted again.
		expect(section.isConnected).toBe(false);
		expect(host.isConnected).toBe(false);
		expect(markup(container)).toBe(
			clientMarkup(name, { kind, server: false, v: 'q', Tail: client.Tail }),
		);
		return { recoverable, main, pending };
	}

	describe.each([
		{ retry: 'its boundary', name: 'BoundaryRetry' },
		{ retry: 'the root', name: 'RootRetry' },
	])('when $retry falls back', ({ name }) => {
		it.each([
			{ kind: 'host', what: 'a host element with a component in it' },
			{ kind: 'nested', what: 'nested host elements' },
			{ kind: 'component', what: 'a component' },
			{ kind: 'list', what: 'a keyed list' },
			{ kind: 'empty', what: 'children where the server rendered none' },
		])('client-renders $what once and reports it once', async ({ kind }) => {
			const { recoverable } = await hydrateAcrossRetry(name, kind);
			expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
		});

		it.each(['host', 'nested'])(
			'warns once at the hole that renders the runtime host (%s)',
			async (kind) => {
				await hydrateAcrossRetry(name, kind);
				const expected = kind === 'host' ? '<span>' : '<b>';
				expect(warnings()).toEqual(
					dev ? [mismatchAt('{el}', `function ${name}(`, expected, 'text "hello"')] : [],
				);
			},
		);

		it('updates the client-rendered child in place after hydrating', async () => {
			await hydrateAcrossRetry(name, 'host');
			const span = container.querySelector('#host > span');
			flushSync(() =>
				root!.render(client[name], {
					kind: 'host',
					server: false,
					v: 'r',
					Tail: client.Tail,
				}),
			);
			expect(markup(container.querySelector('#host')!)).toBe('<span><em>r</em></span>');
			expect(container.querySelector('#host > span')).toBe(span);
		});
	});

	// The boundary's client render shows its pending arm while the sibling
	// loads, as React shows a client-rendered Suspense boundary's fallback; the
	// root around the boundary keeps its server element.
	it('shows the pending arm of a boundary that falls back while its sibling loads', async () => {
		const { main, pending } = await hydrateAcrossRetry('BoundaryRetry', 'host');
		expect(pending).toBe('<main><i>loading</i></main>');
		expect(container.querySelector('main')).toBe(main);
	});

	it('client-renders a dormant island silently when its host child changed before activation', async () => {
		const serverProps = { when: condition(false), server: true };
		container.innerHTML = ServerRT.renderToString(server.DormantHost, serverProps).html;
		const host = container.querySelector('#host')!;
		const recoverable: string[] = [];
		root = hydrateRoot(container, client.DormantHost, serverProps, {
			onRecoverableError: (error: unknown) => recoverable.push((error as Error).message),
		});
		flushSync(() => {});
		await act(() => root!.render(client.DormantHost, { when: load(), server: false }));
		await act(async () => {});

		expect(host.isConnected).toBe(false);
		expect(markup(container.querySelector('#host')!)).toBe('<span><em>q</em></span>');
		expect(recoverable).toEqual([]);
		expect(warnings()).toEqual([]);
	});

	it('client-renders the boundary once when a use() sibling suspends its client render', async () => {
		container.innerHTML = ServerRT.renderToString(server.UseRetry, {
			server: true,
			text: null,
		}).html;
		const main = container.querySelector('main');
		const host = container.querySelector('#host')!;
		let resolve!: (value: string) => void;
		const text = new Promise<string>((r) => (resolve = r));
		const recoverable: string[] = [];
		root = hydrateRoot(
			container,
			client.UseRetry,
			{ server: false, text },
			{ onRecoverableError: (error: unknown) => recoverable.push((error as Error).message) },
		);
		await act(async () => {});
		expect(visibleMarkup(container)).toBe('<main><i>loading</i></main>');
		await act(async () => resolve('done'));

		expect(markup(container)).toBe(
			'<main><section><div id="host"><span><em>q</em></span></div>' +
				'<p><em class="waits">done</em></p></section></main>',
		);
		expect(container.querySelector('main')).toBe(main);
		expect(host.isConnected).toBe(false);
		expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
		expect(warnings()).toEqual(
			dev ? [mismatchAt('{el}', 'function UseRetry(', '<span>', 'text "hello"')] : [],
		);
	});
});
