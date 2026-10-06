import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot, type Root } from '../../src/index.js';
import { renderToString } from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture.js';

// A root with no Suspense boundary keeps showing the server's content while
// its hydrating attempt is suspended. As in React, a mismatch makes the root
// render on the client instead, and nothing commits while that render is
// suspended either: the server content stays as the server rendered it until
// the render commits, which replaces it and reports the mismatch once, as a
// hydration that never suspended reports it.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/root-suspended-clone-mismatch.tsrx',
);
type Fixture = typeof import('./_fixtures/root-suspended-clone-mismatch.tsrx');
type Component = Exclude<keyof Fixture, 'gate'>;

const server = loadServerFixture<Fixture>(FIXTURE, { id: 'root-suspended-clone-mismatch.tsrx' });

let container: HTMLElement;
let root: Root | undefined;
let error: MockInstance<typeof console.error>;
beforeEach(() => {
	container = document.createElement('div');
	document.body.append(container);
	error = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
	root?.unmount();
	root = undefined;
	container.remove();
	error.mockRestore();
});

/** Published structural mismatch diagnostics. */
const structural = () =>
	error.mock.calls
		.map((call) => String(call[0]))
		.filter((m) => m.includes('hydration mismatch') && m.includes('the client expected'));

/** Element and text markup, ignoring hydration comments. */
const markup = () => container.innerHTML.replace(/<!--[^]*?-->/g, '');

/** Every element and text node in the container, in document order. */
function serverNodes(): Node[] {
	const nodes: Node[] = [];
	const walker = document.createTreeWalker(
		container,
		NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
	);
	while (walker.nextNode()) nodes.push(walker.currentNode);
	return nodes;
}

describe.each([true, false])('suspended root that falls back during hydration (dev=%s)', (dev) => {
	const client = loadCompiledFixtureSource<Fixture>(readFileSync(FIXTURE, 'utf8'), {
		id: 'root-suspended-clone-mismatch.tsrx',
		mode: 'client',
		compileOptions: { dev },
	});

	function hydrate(component: Component, recoverable: unknown[], uncaught?: unknown[]): void {
		root = hydrateRoot(
			container,
			client[component],
			{},
			{
				onRecoverableError: (reason) => recoverable.push(reason),
				...(uncaught === undefined ? {} : { onUncaughtError: (reason) => uncaught.push(reason) }),
			},
		);
		flushSync(() => {});
	}

	/** Server-render the content the client cannot adopt; the client's gate throws `thrown`. */
	function serve(component: Component, thrown: unknown): void {
		server.gate.thrown = undefined;
		container.innerHTML = renderToString(server[component], { server: true }).html;
		client.gate.thrown = thrown;
	}

	/** Suspend the client's gate until the returned function resolves it. */
	function suspend(component: Component): () => Promise<void> {
		let resolve!: () => void;
		const promise = new Promise<void>((done) => {
			resolve = done;
		});
		serve(component, promise);
		return () =>
			act(async () => {
				client.gate.thrown = undefined;
				resolve();
				await promise;
			});
	}

	/** What hydrating the same server content publishes when the client never suspends. */
	async function control(component: Component) {
		serve(component, undefined);
		const recoverable: unknown[] = [];
		hydrate(component, recoverable);
		await act(() => {});
		const published = { html: markup(), structural: structural(), recoverable: recoverable.length };
		root!.unmount();
		root = undefined;
		error.mockClear();
		return published;
	}

	it('keeps the server content while pending and reports the mismatch once at the commit', async () => {
		const expected = await control('RootBranch');
		expect(expected.html).toBe('<div><i>ok</i></div>');
		expect(expected.recoverable).toBe(1);
		expect(expected.structural).toHaveLength(dev ? 1 : 0);

		const resume = suspend('RootBranch');
		const serverBranch = container.querySelector('b.server');
		expect(serverBranch).not.toBeNull();
		const recoverable: unknown[] = [];
		hydrate('RootBranch', recoverable);
		await act(() => {});

		expect(container.querySelector('b.server')).toBe(serverBranch);
		expect(markup()).toBe('<div><b class="server">server</b></div>');
		expect(structural()).toEqual([]);
		expect(recoverable).toEqual([]);

		await resume();
		expect(markup()).toBe(expected.html);
		expect(serverBranch!.isConnected).toBe(false);
		expect(recoverable).toHaveLength(1);
		expect(structural()).toEqual(expected.structural);
	});

	// A root fallback discards input typed before hydration, as React's does;
	// until the client render commits, the server's input keeps it.
	it('keeps the server content and user input while pending, then client-renders the root once', async () => {
		const expected = await control('RootForm');
		expect(expected.recoverable).toBe(1);
		expect(expected.structural).toHaveLength(dev ? 1 : 0);

		const resume = suspend('RootForm');
		const serverBranch = container.querySelector('b.server');
		const input = container.querySelector('input')!;
		input.value = 'user draft';
		const recoverable: unknown[] = [];
		hydrate('RootForm', recoverable);
		await act(() => {});

		expect(container.querySelector('b.server')).toBe(serverBranch);
		expect(container.querySelector('s')).toBeNull();
		expect(container.querySelector('input')).toBe(input);
		expect(input.value).toBe('user draft');
		expect(markup()).toBe('<div><input class="draft"><b class="server">server</b></div>');
		expect(structural()).toEqual([]);
		expect(recoverable).toEqual([]);

		await resume();
		expect(markup()).toBe(expected.html);
		expect(input.isConnected).toBe(false);
		expect(container.querySelector('input')!.value).toBe('');
		expect(structural()).toEqual(expected.structural);
		expect(recoverable).toHaveLength(expected.recoverable);
	});

	// React leaves the server DOM alone until the client render commits, so it
	// is never detached meanwhile: a focused server input keeps its focus.
	it('never detaches the server DOM while the client render is pending', async () => {
		const resume = suspend('RootForm');
		const input = container.querySelector('input')!;
		input.focus();
		const served = serverNodes();
		const removed: Node[] = [];
		const observer = new MutationObserver((records) => {
			for (const record of records) removed.push(...record.removedNodes);
		});
		observer.observe(container, { childList: true, subtree: true });
		const recoverable: unknown[] = [];
		try {
			hydrate('RootForm', recoverable);
			await act(() => {});
			for (const record of observer.takeRecords()) removed.push(...record.removedNodes);

			expect(removed.filter((node) => served.includes(node))).toEqual([]);
			expect(document.activeElement).toBe(input);
			expect(recoverable).toEqual([]);
		} finally {
			observer.disconnect();
		}

		await resume();
		expect(input.isConnected).toBe(false);
		expect(recoverable).toHaveLength(1);
	});

	/** Suspend the client's gate; returns the resolver to run inside act. */
	function gatePromise(): () => Promise<void> {
		let resolve!: () => void;
		const promise = new Promise<void>((done) => {
			resolve = done;
		});
		client.gate.thrown = promise;
		return () =>
			act(async () => {
				client.gate.thrown = undefined;
				resolve();
				await promise;
			});
	}

	// A <body> container keeps its document resources, as React's
	// clearContainerSparingly does, and its server content until the commit.
	it('keeps a body container’s server content until the commit, then keeps its resources', async () => {
		const doc = document.implementation.createHTMLDocument('fallback');
		server.gate.thrown = undefined;
		doc.body.innerHTML =
			renderToString(server.RootBody, { server: true }).html +
			'<script type="application/json" id="data">{}</script>';
		const serverMain = doc.querySelector('main')!;
		const script = doc.getElementById('data')!;
		const resume = gatePromise();
		const recoverable: unknown[] = [];
		root = hydrateRoot(
			doc.body,
			client.RootBody,
			{},
			{
				onRecoverableError: (reason) => recoverable.push(reason),
			},
		);
		flushSync(() => {});
		await act(() => {});

		expect(doc.querySelector('main')).toBe(serverMain);
		expect(doc.querySelector('b.server')!.isConnected).toBe(true);
		expect(recoverable).toEqual([]);

		await resume();
		expect(serverMain.isConnected).toBe(false);
		expect(doc.querySelector('main')!.innerHTML.replace(/<!--[^]*?-->/g, '')).toBe('<i>ok</i>');
		expect(script.isConnected).toBe(true);
		expect(recoverable).toHaveLength(1);
		expect(structural()).toHaveLength(dev ? 1 : 0);
	});

	// A document cannot hold the client's root element beside the server's, but
	// a pending client render still leaves the server's document in place.
	it('keeps a document’s server content until the client render commits', async () => {
		server.gate.thrown = undefined;
		const html = renderToString(server.RootDocument, { server: true }).html;
		const doc = new DOMParser().parseFromString('<!DOCTYPE html>' + html, 'text/html');
		const serverRoot = doc.documentElement;
		const serverBranch = doc.querySelector('b.server')!;
		const resume = gatePromise();
		const recoverable: unknown[] = [];
		root = hydrateRoot(
			doc,
			client.RootDocument,
			{},
			{
				onRecoverableError: (reason) => recoverable.push(reason),
			},
		);
		flushSync(() => {});
		await act(() => {});

		expect(doc.documentElement).toBe(serverRoot);
		expect(serverBranch.isConnected).toBe(true);
		expect(recoverable).toEqual([]);

		await resume();
		expect(serverBranch.isConnected).toBe(false);
		expect(doc.body.textContent).toBe('ok');
		expect(doc.doctype).not.toBeNull();
		expect(recoverable).toHaveLength(1);
	});

	// React 19 reuses an <html> container's <head> and <body> as host
	// singletons and keeps the scripts, styles and stylesheet links in them
	// (react-dom 19.2.7 probe: one head and one body, both the server's). Octane
	// has no host singletons, so the client's <head> and <body> replace the
	// server's, as a Document container's client <html> replaces the server's.
	it.each([false, true])(
		'replaces an html container’s head and body with the client’s (suspended=%s)',
		async (suspended) => {
			server.gate.thrown = undefined;
			const html = renderToString(server.RootHtml, { server: true }).html;
			const doc = new DOMParser().parseFromString(
				'<!DOCTYPE html><html>' + html + '</html>',
				'text/html',
			);
			doc.head.insertAdjacentHTML('beforeend', '<link rel="stylesheet" href="/third.css">');
			doc.body.insertAdjacentHTML('beforeend', '<script type="application/json">{}</script>');
			const serverHead = doc.head;
			const serverBody = doc.body;
			const resume = suspended ? gatePromise() : undefined;
			const recoverable: unknown[] = [];
			root = hydrateRoot(
				doc.documentElement,
				client.RootHtml,
				{},
				{
					onRecoverableError: (reason) => recoverable.push(reason),
				},
			);
			flushSync(() => {});
			await act(() => {});

			if (resume !== undefined) {
				expect(doc.head).toBe(serverHead);
				expect(doc.body).toBe(serverBody);
				expect(doc.querySelectorAll('head, body')).toHaveLength(2);
				expect(doc.body.textContent).toBe('serverok{}');
				expect(recoverable).toEqual([]);
				await resume();
			}

			expect(doc.querySelectorAll('head')).toHaveLength(1);
			expect(doc.querySelectorAll('body')).toHaveLength(1);
			expect(doc.head).not.toBe(serverHead);
			expect(doc.body).not.toBe(serverBody);
			expect(doc.body.textContent).toBe('clientok');
			expect(doc.head.querySelectorAll('meta[name="side"]')).toHaveLength(1);
			expect(doc.querySelector('link, script')).toBeNull();
			expect(recoverable).toHaveLength(1);
		},
	);

	// Each kind of mismatch before the root suspends: an arm of a boundary that
	// falls back on its own, a renderable or only-child hole over server text,
	// list shapes the server rendered differently, and a lite call's template in
	// its host. The commit reports exactly what a hydration that never
	// suspended does.
	it.each<Component>([
		'RootNestedArm',
		'RootHole',
		'RootOnlyChild',
		'RootFewerItems',
		'RootEmptyList',
		'RootLiteHost',
	])(
		'%s keeps the server content while pending and reports as if it never suspended',
		async (component) => {
			const expected = await control(component);
			expect(expected.recoverable).toBe(1);
			if (dev) expect(expected.structural.length).toBeGreaterThan(0);
			else expect(expected.structural).toEqual([]);

			const resume = suspend(component);
			const html = markup();
			const nodes = serverNodes();
			const recoverable: unknown[] = [];
			hydrate(component, recoverable);
			await act(() => {});

			expect(markup()).toBe(html);
			const kept = serverNodes();
			expect(kept).toHaveLength(nodes.length);
			kept.forEach((node, i) => expect(node).toBe(nodes[i]));
			expect(structural()).toEqual([]);
			expect(recoverable).toEqual([]);

			await resume();
			expect(markup()).toBe(expected.html);
			expect(structural()).toEqual(expected.structural);
			expect(recoverable).toHaveLength(expected.recoverable);
		},
	);

	// Nothing commits, so there is no mismatch to report: React reports the
	// uncaught error alone.
	it('reports nothing for a fallback that ends in an uncaught error', async () => {
		const failure = new Error('gate failed');
		serve('RootBranch', failure);
		const recoverable: unknown[] = [];
		const uncaught: unknown[] = [];
		hydrate('RootBranch', recoverable, uncaught);
		await act(() => {});

		expect(uncaught).toEqual([failure]);
		expect(structural()).toEqual([]);
		expect(recoverable).toEqual([]);
	});
});
