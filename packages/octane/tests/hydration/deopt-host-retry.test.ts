import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createRoot, flushSync, hydrateRoot, lazy } from '../../src/index.js';
import { condition, load } from 'octane/hydration';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// A runtime host element (createElement) adopts its server element while
// hydrating. When the server rendered other children than the client's, which
// need ranges of their own, the client builds its children in the adopted
// host and reports the mismatch. If a sibling then suspends, the next attempt
// adopts the same server host, which holds the first attempt's children: it
// must leave one copy of them and must not report the recovery again.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/deopt-host-retry.tsrx',
);
const FILE = 'deopt-host-retry.tsrx';
const SOURCE = readFileSync(FIXTURE, 'utf8');
const LINES = SOURCE.split('\n');

/** 1-based line of the first fixture line containing `text`, after line `from`. */
function lineOf(text: string, from = 0): number {
	const index = LINES.findIndex((line, i) => i >= from && line.includes(text));
	if (index < 0) throw new Error(`fixture has no line containing ${text}`);
	return index + 1;
}

/** The development warning for the hole at the first `site` after `after`, rebuilt on the client. */
function rebuilt(site: string, after: string, expected: string, actual: string): string {
	const line = lineOf(site, lineOf(after));
	const column = LINES[line - 1].indexOf(site) + 1;
	return (
		`Octane hydration mismatch at ${FILE}:${line}:${column}: the client expected ${expected} ` +
		`but the server rendered ${actual}. The mismatched subtree was rebuilt on the client.`
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

describe.each([
	{ name: 'development compile', dev: true },
	{ name: 'production compile', dev: false },
])('hydrateRoot — runtime host children built before a retry ($name)', ({ dev }) => {
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
	 * the client's while its lazy sibling suspends the first attempt, and let
	 * the next attempt finish.
	 */
	async function hydrateAcrossRetry(name: string, kind: string): Promise<string[]> {
		container.innerHTML = ServerRT.renderToString(server[name], {
			kind,
			server: true,
			v: 'q',
			Tail: server.Tail,
		}).html;
		const section = container.querySelector('section');
		const host = container.querySelector('#host');
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
		await act(async () => deliver({ default: client.Tail }));
		// The retry adopts the same server elements.
		expect(container.querySelector('section')).toBe(section);
		expect(container.querySelector('#host')).toBe(host);
		expect(markup(container)).toBe(
			clientMarkup(name, { kind, server: false, v: 'q', Tail: client.Tail }),
		);
		return recoverable;
	}

	describe.each([
		{ retry: 'its boundary', name: 'BoundaryRetry' },
		{ retry: 'the root', name: 'RootRetry' },
	])('when $retry retries', ({ name }) => {
		it.each([
			{ kind: 'host', what: 'a host element with a component in it', reports: 1 },
			{ kind: 'nested', what: 'nested host elements', reports: 1 },
			{ kind: 'component', what: 'a component', reports: 1 },
			{ kind: 'list', what: 'a keyed list', reports: 1 },
			// Children where the server rendered none are not reported, as for an
			// only-child hole; the retry must not report them either.
			{ kind: 'empty', what: 'children where the server rendered none', reports: 0 },
		])('builds $what once', async ({ kind, reports }) => {
			const recoverable = await hydrateAcrossRetry(name, kind);
			expect(recoverable).toHaveLength(reports);
			for (const message of recoverable) expect(message).toMatch(/hydration mismatch/i);
		});

		it.each(['host', 'nested'])(
			'warns once at the hole that renders the runtime host (%s)',
			async (kind) => {
				await hydrateAcrossRetry(name, kind);
				const expected = kind === 'host' ? '<span>' : '<b>';
				expect(warnings()).toEqual(
					dev ? [rebuilt('{el}', `function ${name}(`, expected, 'text "hello"')] : [],
				);
			},
		);

		it('updates the one rebuilt child in place after hydrating', async () => {
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

	it('rebuilds a host child that changed before its boundary activated without reporting', async () => {
		const serverProps = { when: condition(false), server: true };
		container.innerHTML = ServerRT.renderToString(server.DormantHost, serverProps).html;
		const recoverable: string[] = [];
		root = hydrateRoot(container, client.DormantHost, serverProps, {
			onRecoverableError: (error: unknown) => recoverable.push((error as Error).message),
		});
		flushSync(() => {});
		await act(() => root!.render(client.DormantHost, { when: load(), server: false }));
		await act(async () => {});

		expect(markup(container.querySelector('#host')!)).toBe('<span><em>q</em></span>');
		expect(recoverable).toEqual([]);
		expect(warnings()).toEqual([]);
	});

	it('builds the host child once when a use() sibling suspends its boundary', async () => {
		container.innerHTML = ServerRT.renderToString(server.UseRetry, {
			server: true,
			text: null,
		}).html;
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
		await act(async () => resolve('done'));

		expect(markup(container)).toBe(
			'<main><section><div id="host"><span><em>q</em></span></div>' +
				'<p><em class="waits">done</em></p></section></main>',
		);
		expect(recoverable).toHaveLength(1);
		expect(warnings()).toEqual(
			dev
				? [
						rebuilt('{el}', 'function UseRetry(', '<span>', 'text "hello"'),
						rebuilt('{props.text', 'function UseRetry(', 'a renderable range', 'text "A"'),
					]
				: [],
		);
	});
});
