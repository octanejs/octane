import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// A deferred boundary whose first attempt suspends keeps that attempt's blocks
// and retries from where it stopped. When a mounted parent changes the
// boundary's captures while it is pending, the retry reconciles what it already
// adopted as an update, and that update can create content the server never
// rendered: a swapped component, a new keyed row, or a renderable hole's new
// value. That content must not adopt or rebuild over a server node that
// another block owns, including when it suspends and a later retry resumes
// it. The server HTML predates the captures, so nothing is reported.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/stale-deferred-retry.tsrx',
);
const FILE = 'stale-deferred-retry.tsrx';
const SOURCE = readFileSync(FIXTURE, 'utf8');

/** Element and text markup, ignoring hydration comments. */
function markup(node: Element): string {
	const copy = node.cloneNode(true) as Element;
	const walker = document.createTreeWalker(copy, NodeFilter.SHOW_COMMENT);
	const comments: Node[] = [];
	while (walker.nextNode()) comments.push(walker.currentNode);
	for (const comment of comments) comment.parentNode!.removeChild(comment);
	return copy.innerHTML;
}

function rows(items: string[]): string {
	return items.map((item) => `<s>${item}</s>`).join('');
}

function pending(): { promise: Promise<string>; resolve: (value: string) => void } {
	let resolve!: (value: string) => void;
	const promise = new Promise<string>((done) => (resolve = done));
	return { promise, resolve };
}

/** What each HoleProbe `k` renders in the hole. */
const HOLE: Record<string, string> = {
	a: '<b>A</b>',
	b: '<i>B</i>',
	s: '<i>S</i>',
	l: '<b>A</b><i>B</i>',
	L: '<b>A</b><i>S</i>',
	n: '',
};
const hole = (k: string) => HOLE[k] ?? k;

describe.each([
	{ name: 'development compile', dev: true },
	{ name: 'production compile', dev: false },
])('hydrateRoot — a deferred retry after its captures changed ($name)', ({ dev }) => {
	const server = loadServerFixture(FIXTURE, { id: FILE });
	const client = loadCompiledFixtureSource(SOURCE, {
		id: FILE,
		mode: 'client',
		compileOptions: { dev },
	});
	let container: HTMLElement;
	let root: { render(component: unknown, props: unknown): void; unmount(): void } | null;
	let errSpy: ReturnType<typeof vi.spyOn>;
	let recoverable: string[];

	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
		root = null;
		recoverable = [];
		errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		root?.unmount();
		container.remove();
		errSpy.mockRestore();
	});

	/**
	 * Server-render `name` with `props`, then hydrate it with the same props and
	 * a pending leaf, so the first attempt adopts everything before Pend's `<u>`
	 * and suspends there. The server HTML stays on screen. `slow` stays pending
	 * until the test settles it, for a component that an update swaps in.
	 */
	async function hydratePending(name: string, props: Record<string, unknown>) {
		container.innerHTML = ServerRT.renderToString(server[name], {
			...props,
			server: true,
			leaf: Promise.resolve('x'),
			slow: Promise.resolve('S'),
		}).html;
		const section = container.querySelector('section')!;
		const html = markup(section);
		const nodes = {
			section,
			first: section.firstElementChild,
			u: section.querySelector('u'),
			em: section.querySelector('em'),
			rows: new Map([...section.querySelectorAll('s')].map((row) => [row.textContent!, row])),
		};
		const leaf = pending();
		const slow = pending();
		root = hydrateRoot(
			container,
			client[name],
			{ ...props, leaf: leaf.promise, slow: slow.promise },
			{ onRecoverableError: (error: unknown) => recoverable.push((error as Error).message) },
		);
		flushSync(() => {});
		await act(async () => {});
		expect(markup(section)).toBe(html);
		return { nodes, leaf, slow, html };
	}

	/** Resolve the leaf, then anything an update swapped in that suspends. */
	async function settle(leaf: { resolve(value: string): void }, slow: typeof leaf) {
		await act(async () => leaf.resolve('x'));
		await act(async () => slow.resolve('S'));
	}

	function expectNoDiagnostics(): void {
		expect(recoverable).toEqual([]);
		expect(errSpy.mock.calls.map((call: unknown[]) => String(call[0]))).toEqual([]);
	}

	describe('a component call and a keyed list', () => {
		const SERVER_ITEMS = ['x', 'y'];

		it.each([
			{ title: 'swaps the component', k: 'b', items: ['x', 'y'] },
			{ title: 'swaps in a component that suspends', k: 's', items: ['x', 'y'] },
			{ title: 'inserts a row first', k: 'a', items: ['q', 'x', 'y'] },
			{ title: 'inserts a row between', k: 'a', items: ['x', 'q', 'y'] },
			{ title: 'inserts a row after the first', k: 'a', items: ['x', 'q'] },
			{ title: 'appends a row', k: 'a', items: ['x', 'y', 'q'] },
			{ title: 'moves the rows', k: 'a', items: ['y', 'x'] },
			{ title: 'moves and inserts rows', k: 'a', items: ['y', 'q', 'x'] },
			{ title: 'removes a row', k: 'a', items: ['y'] },
			{ title: 'removes every row', k: 'a', items: [] },
			{ title: 'replaces every row', k: 'a', items: ['p', 'q'] },
			{ title: 'swaps the component and inserts a row', k: 'b', items: ['q', 'x', 'y'] },
			{ title: 'swaps the component and moves the rows', k: 'b', items: ['y', 'x'] },
			{ title: 'swaps in a component that suspends and inserts a row', k: 's', items: ['x', 'q'] },
			{ title: 'keeps equal captures', k: 'a', items: ['x', 'y'] },
		])('$title while pending', async ({ k, items }) => {
			const { nodes, leaf, slow, html } = await hydratePending('DynProbe', {
				k: 'a',
				items: SERVER_ITEMS,
			});
			const update = { k, leaf: leaf.promise, slow: slow.promise, items };
			flushSync(() => root!.render(client.DynProbe, update));
			// The boundary is still pending: the server HTML stays as it was.
			expect(markup(nodes.section)).toBe(html);

			await settle(leaf, slow);

			const head = HOLE[k];
			expect(container.querySelector('section')).toBe(nodes.section);
			expect(markup(nodes.section)).toBe(`${head}${rows(items)}<u>x</u><em>e</em>`);
			expect(nodes.section.querySelector('u')).toBe(nodes.u);
			expect(nodes.section.querySelector('em')).toBe(nodes.em);
			if (k === 'a') expect(nodes.section.firstElementChild).toBe(nodes.first);
			for (const row of nodes.section.querySelectorAll('s')) {
				const adopted = nodes.rows.get(row.textContent!);
				if (adopted !== undefined) expect(row).toBe(adopted);
			}
			expectNoDiagnostics();

			// The hydrated blocks own exactly the nodes they show.
			const settled = { leaf: leaf.promise, slow: slow.promise };
			await act(async () =>
				root!.render(client.DynProbe, { ...settled, k: 'a', items: ['y', 'r'] }),
			);
			expect(markup(nodes.section)).toBe(`<b>A</b>${rows(['y', 'r'])}<u>x</u><em>e</em>`);
			await act(async () => root!.render(client.DynProbe, { ...settled, k: 'b', items: [] }));
			expect(markup(nodes.section)).toBe('<i>B</i><u>x</u><em>e</em>');
			expect(nodes.section.querySelector('em')).toBe(nodes.em);
			expectNoDiagnostics();
		});

		it('fills a list the server rendered empty', async () => {
			const { nodes, leaf, slow } = await hydratePending('DynProbe', { k: 'a', items: [] });
			const update = { k: 'a', leaf: leaf.promise, slow: slow.promise, items: ['q', 'r'] };
			flushSync(() => root!.render(client.DynProbe, update));

			await settle(leaf, slow);

			expect(markup(nodes.section)).toBe(`<b>A</b>${rows(['q', 'r'])}<u>x</u><em>e</em>`);
			expect(nodes.section.firstElementChild).toBe(nodes.first);
			expect(nodes.section.querySelector('u')).toBe(nodes.u);
			expect(nodes.section.querySelector('em')).toBe(nodes.em);
			expectNoDiagnostics();
		});

		it('applies several capture changes made while pending', async () => {
			const { nodes, leaf, slow } = await hydratePending('DynProbe', {
				k: 'a',
				items: SERVER_ITEMS,
			});
			const promises = { leaf: leaf.promise, slow: slow.promise };
			flushSync(() =>
				root!.render(client.DynProbe, { ...promises, k: 'b', items: ['q', 'x', 'y'] }),
			);
			flushSync(() => root!.render(client.DynProbe, { ...promises, k: 'a', items: ['y', 'p'] }));

			await settle(leaf, slow);

			expect(markup(nodes.section)).toBe(`<b>A</b>${rows(['y', 'p'])}<u>x</u><em>e</em>`);
			expect(nodes.section.firstElementChild).toBe(nodes.first);
			expect(nodes.section.querySelector('s')).toBe(nodes.rows.get('y'));
			expect(nodes.section.querySelector('em')).toBe(nodes.em);
			expectNoDiagnostics();
		});
	});

	it('keeps a row a retry inserted on the client when a later retry resumes inside it', async () => {
		const gate = pending();
		const { nodes, leaf, slow } = await hydratePending('RowProbe', {
			items: ['x'],
			gate: gate.promise,
		});
		const q = nodes.section.querySelector('q');
		const promises = { leaf: leaf.promise, gate: gate.promise, slow: slow.promise };
		flushSync(() => root!.render(client.RowProbe, { ...promises, items: ['x', 'q'] }));
		// The retry inserts the row, then suspends at Gate.
		await act(async () => leaf.resolve('x'));
		// The next retry opens the row, whose Slow suspends; the one after resumes it.
		flushSync(() => root!.render(client.RowProbe, { ...promises, items: ['x', 'q'], open: 'q' }));
		await act(async () => gate.resolve('g'));
		await act(async () => slow.resolve('S'));

		expect(markup(nodes.section)).toBe('<s>x</s><s>q<i>S</i></s><u>x</u><q>g</q><em>e</em>');
		expect(nodes.section.firstElementChild).toBe(nodes.first);
		expect(nodes.section.querySelector('u')).toBe(nodes.u);
		expect(nodes.section.querySelector('q')).toBe(q);
		expect(nodes.section.querySelector('em')).toBe(nodes.em);
		expectNoDiagnostics();

		await act(async () => root!.render(client.RowProbe, { ...promises, items: ['q'] }));
		expect(markup(nodes.section)).toBe('<s>q</s><u>x</u><q>g</q><em>e</em>');
		expect(nodes.section.querySelector('em')).toBe(nodes.em);
		expectNoDiagnostics();
	});

	it('removes what a retry resumed inside a row when that retry closes the row', async () => {
		const gate = pending();
		const { nodes, leaf, slow } = await hydratePending('RowProbe', {
			items: ['x'],
			gate: gate.promise,
		});
		const promises = { leaf: leaf.promise, gate: gate.promise, slow: slow.promise };
		flushSync(() => root!.render(client.RowProbe, { ...promises, items: ['x', 'q'] }));
		await act(async () => leaf.resolve('x'));
		// The next retry opens the row, whose Slow suspends.
		flushSync(() => root!.render(client.RowProbe, { ...promises, items: ['x', 'q'], open: 'q' }));
		await act(async () => gate.resolve('g'));
		// The retry after that resumes Slow inside the row, then closes the row.
		flushSync(() => root!.render(client.RowProbe, { ...promises, items: ['x', 'q'] }));
		await act(async () => slow.resolve('S'));

		expect(markup(nodes.section)).toBe('<s>x</s><s>q</s><u>x</u><q>g</q><em>e</em>');
		expect(nodes.section.firstElementChild).toBe(nodes.first);
		expect(nodes.section.querySelector('em')).toBe(nodes.em);
		expectNoDiagnostics();
	});

	describe('a renderable hole', () => {
		it.each([
			{ title: 'swaps the component', from: 'a', to: 'b' },
			{ title: 'swaps in a component that suspends', from: 'a', to: 's' },
			{ title: 'replaces text with a component', from: 't', to: 'a' },
			{ title: 'fills an empty hole with a component', from: 'n', to: 'b' },
			{ title: 'replaces a component with a list', from: 'a', to: 'l' },
			{ title: 'replaces a component with a list whose row suspends', from: 'a', to: 'L' },
			{ title: 'fills an empty hole with a list', from: 'n', to: 'l' },
			{ title: 'replaces a list with a component', from: 'l', to: 'b' },
			{ title: 'replaces a component with text', from: 'a', to: 't' },
			{ title: 'empties a component', from: 'a', to: 'n' },
			{ title: 'fills an empty hole with text', from: 'n', to: 't' },
			{ title: 'changes the text', from: 't', to: 'u' },
		])('$title while pending', async ({ from, to }) => {
			const { nodes, leaf, slow, html } = await hydratePending('HoleProbe', { k: from });
			const promises = { leaf: leaf.promise, slow: slow.promise };
			flushSync(() => root!.render(client.HoleProbe, { ...promises, k: to }));
			expect(markup(nodes.section)).toBe(html);

			await settle(leaf, slow);

			expect(markup(nodes.section)).toBe(`<em>e</em>mid${hole(to)}<u>x</u>`);
			expect(nodes.section.querySelector('em')).toBe(nodes.em);
			expect(nodes.section.querySelector('u')).toBe(nodes.u);
			expectNoDiagnostics();

			// The hole owns exactly what it shows.
			await act(async () => root!.render(client.HoleProbe, { ...promises, k: 'b' }));
			expect(markup(nodes.section)).toBe('<em>e</em>mid<i>B</i><u>x</u>');
			await act(async () => root!.render(client.HoleProbe, { ...promises, k: 'n' }));
			expect(markup(nodes.section)).toBe('<em>e</em>mid<u>x</u>');
			expect(nodes.section.querySelector('em')).toBe(nodes.em);
			expectNoDiagnostics();
		});
	});
});
