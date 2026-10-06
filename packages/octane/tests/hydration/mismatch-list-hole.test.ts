import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createRoot, flushSync, hydrateRoot } from '../../src/index.js';
import { condition, load } from 'octane/hydration';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// A list inside a @try/@pending arm whose server content its client items do
// not match: a renderable hole whose server list the client renders as
// nothing, a bare server item where the client's item needs a range of its own
// or has another tag, and fewer or more server items than client items, in a
// hole and in compiled @for rows. As in React, nothing is repaired in place:
// the arm discards its server DOM, matching items included, and renders on the
// client, while the host element around the arm keeps its identity.
// onRecoverableError fires once. An arm whose hydration suspends first keeps
// its server DOM until it resumes, then falls back and reports once. Matching
// content adopts silently.

const FIXTURE = join(process.cwd(), 'packages/octane/tests/hydration/_fixtures/list-hole.tsrx');
const FILE = 'list-hole.tsrx';
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

/** The element and text nodes below `node`, in document order. */
function contentNodes(node: Element): Node[] {
	const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
	const nodes: Node[] = [];
	while (walker.nextNode()) nodes.push(walker.currentNode);
	return nodes;
}

/** The server's `<section>` in the arm, and every node below it. */
function armNodes(container: Element): Node[] {
	const section = container.querySelector('section')!;
	return [section, ...contentNodes(section)];
}

/** A thenable `use()` reads synchronously, so the server renders its value. */
function fulfilled(text: string): Promise<string> {
	return Object.assign(Promise.resolve(text), { status: 'fulfilled', value: text });
}

function deferred(): { promise: Promise<string>; resolve: (text: string) => void } {
	let resolve!: (text: string) => void;
	const promise = new Promise<string>((r) => (resolve = r));
	return { promise, resolve };
}

const MISMATCH = /^Hydration failed because the server rendered HTML didn't match the client\./;
const WARNING = new RegExp(
	`^Octane hydration mismatch at [^ ]*${FILE.replace('.', '\\.')}:\\d+:\\d+: the client expected .+ ` +
		'but the server rendered .+\\. The nearest Suspense or Hydrate boundary, or the root, will be ' +
		'regenerated on the client\\.$',
);

// Hole cases whose server value the client value does not match.
const HOLE_MISMATCHES = [
	// The server rendered a list where the client renders none.
	{ server: 'pi', client: 'null' },
	{ server: 'pi', client: 'empty' },
	{ server: 'pi', client: 'text' },
	{ server: 'framed', client: 'null' },
	{ server: 'framed', client: 'empty' },
	{ server: 'text', client: 'null' },
	{ server: 'pi', client: 'nothing' },
	// A bare server item cannot be the client's item.
	{ server: 'i', client: 'p' },
	{ server: 'i', client: 'p-child' },
	{ server: 'p3', client: 'p-child3' },
	// The server rendered fewer items.
	{ server: 'p', client: 'p3' },
	{ server: 'p', client: 'p-child3' },
	// The server rendered more items.
	{ server: 'pi', client: 'p' },
	{ server: 'p3', client: 'p' },
];

describe.each([
	{ name: 'development compile', dev: true },
	{ name: 'production compile', dev: false },
])('hydrateRoot — list items that do not match their server content ($name)', ({ dev }) => {
	const server = loadServerFixture(FIXTURE, { id: FILE });
	const client = loadCompiledFixtureSource(SOURCE, {
		id: FILE,
		mode: 'client',
		compileOptions: { dev },
	});
	let container: HTMLElement;
	let errSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
		errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		container.remove();
		errSpy.mockRestore();
	});

	const warns = () =>
		errSpy.mock.calls
			.map((call: unknown[]) => String(call[0]))
			.filter((message: string) => message.includes('hydration mismatch'));

	/** Exactly one report: the recoverable error always, the warning in DEV. */
	async function expectReported(recovered: unknown[]) {
		await Promise.resolve();
		expect(recovered).toHaveLength(1);
		expect(String((recovered[0] as Error).message)).toMatch(MISMATCH);
		expect(warns()).toEqual(dev ? [expect.stringMatching(WARNING)] : []);
	}

	async function expectSilent(recovered: unknown[]) {
		await Promise.resolve();
		expect(recovered).toEqual([]);
		expect(warns()).toEqual([]);
	}

	/** The markup a client render of the same props puts in the `<section>`. */
	async function clientMarkup(component: string, props: Record<string, unknown>) {
		const node = document.createElement('div');
		const root = createRoot(node);
		await act(() => root.render(client[component], props));
		try {
			return markup(node.querySelector('section')!);
		} finally {
			root.unmount();
		}
	}

	function serverRender(component: string, props: Record<string, unknown>) {
		container.innerHTML = ServerRT.renderToString(server[component], {
			text: null,
			later: null,
			...props,
		}).html;
	}

	function hydrate(component: string, props: Record<string, unknown>, recovered: unknown[]) {
		const root = hydrateRoot(
			container,
			client[component],
			{ text: null, later: null, ...props },
			{ onRecoverableError: (error) => recovered.push(error) },
		);
		flushSync(() => {});
		return root;
	}

	/**
	 * The arm rendered on the client: the `<main>` around it is the server's, but
	 * none of the arm's server nodes survived, and its content is a client render's.
	 */
	async function expectArmFallback(
		main: Element,
		serverNodes: Node[],
		component: string,
		clientProps: Record<string, unknown>,
	) {
		expect(container.querySelector('main')).toBe(main);
		expect(serverNodes.filter((node) => node.isConnected)).toEqual([]);
		expect(markup(container.querySelector('section')!)).toBe(
			await clientMarkup(component, { text: null, later: null, ...clientProps }),
		);
	}

	it.each(HOLE_MISMATCHES)(
		'renders the arm on the client for a $client value over a $server server value',
		async ({ server: kind, client: next }) => {
			serverRender('Hole', { kind, v: 'A' });
			const main = container.querySelector('main')!;
			const serverNodes = armNodes(container);
			const recovered: unknown[] = [];
			const root = hydrate('Hole', { kind: next, v: 'A' }, recovered);
			try {
				await expectArmFallback(main, serverNodes, 'Hole', { kind: next, v: 'A' });
				await expectReported(recovered);
				// The client-rendered arm updates like any other.
				flushSync(() => root.render(client.Hole, { kind: 'p', v: 'B', text: null, later: null }));
				expect(markup(container.querySelector('section')!)).toBe('<p>B</p><b>B</b>');
				expect(container.querySelector('main')).toBe(main);
			} finally {
				root.unmount();
			}
		},
	);

	it.each([
		{ component: 'Rows', server: ['a'], client: ['a', 'b', 'c'] },
		{ component: 'FramedRows', server: ['a'], client: ['a', 'b', 'c'] },
		{ component: 'Rows', server: ['a', 'b', 'c'], client: ['a'] },
		{ component: 'FramedRows', server: ['a', 'b', 'c'], client: ['a'] },
	])(
		'renders the arm on the client for $client.length @for rows over $server.length server rows ($component)',
		async (row) => {
			serverRender(row.component, { rows: row.server });
			const main = container.querySelector('main')!;
			const serverNodes = armNodes(container);
			const recovered: unknown[] = [];
			const root = hydrate(row.component, { rows: row.client }, recovered);
			try {
				await expectArmFallback(main, serverNodes, row.component, { rows: row.client });
				await expectReported(recovered);
			} finally {
				root.unmount();
			}
		},
	);

	describe('where the server content matches', () => {
		it.each([
			['pi', 'pi'],
			['framed', 'framed'],
			['p3', 'p3'],
			['null', 'empty'],
			['empty', 'null'],
			['empty', 'nothing'],
			['text', 'text'],
		])('adopts a %s server value for a %s client value silently', async (kind, next) => {
			serverRender('Hole', { kind, v: 'A' });
			const section = container.querySelector('section')!;
			const serverNodes = contentNodes(section);
			const recovered: unknown[] = [];
			const root = hydrate('Hole', { kind: next, v: 'A' }, recovered);
			try {
				expect(container.querySelector('section')).toBe(section);
				const nodes = contentNodes(section);
				expect(nodes).toHaveLength(serverNodes.length);
				nodes.forEach((node, index) => expect(node).toBe(serverNodes[index]));
				await expectSilent(recovered);
			} finally {
				root.unmount();
			}
		});

		it.each(['Rows', 'FramedRows'])('adopts every @for row silently (%s)', async (component) => {
			serverRender(component, { rows: ['a', 'b', 'c'] });
			const rows = [...container.querySelectorAll('li')];
			const recovered: unknown[] = [];
			const root = hydrate(component, { rows: ['a', 'b', 'c'] }, recovered);
			try {
				const hydrated = container.querySelectorAll('li');
				expect(hydrated).toHaveLength(3);
				rows.forEach((row, index) => expect(hydrated[index]).toBe(row));
				await expectSilent(recovered);
			} finally {
				root.unmount();
			}
		});
	});

	// The arm's hydration suspends, before or after it reaches the mismatch. A
	// suspension never falls back by itself; once the arm resumes, the mismatch
	// renders it on the client and reports once.
	describe('when the arm suspends', () => {
		it.each([
			{
				value: 'more items, the extra ones suspending',
				component: 'Hole',
				server: { kind: 'p', v: 'A' },
				client: { kind: 'p-child3', v: 'A' },
				wait: 'text',
			},
			{
				value: 'a suspending item over a bare server item',
				component: 'Hole',
				server: { kind: 'i', v: 'A' },
				client: { kind: 'p-child', v: 'A' },
				wait: 'text',
			},
			{
				value: 'more @for rows, the extra ones suspending',
				component: 'FramedRows',
				server: { rows: ['a'] },
				client: { rows: ['a', 'b', 'c'] },
				wait: 'text',
			},
			{
				value: 'a list the client renders as nothing, before a suspending sibling',
				component: 'Hole',
				server: { kind: 'pi', v: 'A' },
				client: { kind: 'null', v: 'A' },
				wait: 'later',
			},
			{
				value: 'more items, before a suspending sibling',
				component: 'Hole',
				server: { kind: 'p', v: 'A' },
				client: { kind: 'p3', v: 'A' },
				wait: 'later',
			},
			{
				value: 'a bare <i> for a <p>, before a suspending sibling',
				component: 'Hole',
				server: { kind: 'i', v: 'A' },
				client: { kind: 'p', v: 'A' },
				wait: 'later',
			},
			{
				value: 'more direct-host @for rows, before a suspending sibling',
				component: 'Rows',
				server: { rows: ['a'] },
				client: { rows: ['a', 'b', 'c'] },
				wait: 'later',
			},
			{
				value: 'more framed @for rows, before a suspending sibling',
				component: 'FramedRows',
				server: { rows: ['a'] },
				client: { rows: ['a', 'b', 'c'] },
				wait: 'later',
			},
			{
				value: 'fewer items, before a suspending sibling',
				component: 'Hole',
				server: { kind: 'pi', v: 'A' },
				client: { kind: 'p', v: 'A' },
				wait: 'later',
			},
		])('renders the arm on the client once for $value', async (row) => {
			// The server renders the suspending sibling's resolved value.
			serverRender(row.component, {
				...row.server,
				later: row.wait === 'later' ? fulfilled('R') : null,
			});
			const main = container.querySelector('main')!;
			const serverNodes = armNodes(container);
			const pending = deferred();
			const recovered: unknown[] = [];
			const root = hydrate(
				row.component,
				{ ...row.client, [row.wait]: pending.promise },
				recovered,
			);
			try {
				await act(async () => {
					pending.resolve('R');
					await pending.promise;
				});
				await expectArmFallback(main, serverNodes, row.component, {
					...row.client,
					[row.wait]: Promise.resolve('R'),
				});
				await expectReported(recovered);
			} finally {
				root.unmount();
			}
		});
	});

	// Captures that changed before a dormant boundary activated legitimately
	// differ from what the server rendered. As React reports nothing for an
	// update that reaches a dehydrated boundary, the arm renders on the client
	// without a report.
	describe('in a dormant boundary whose captures changed before activation', () => {
		it.each([
			{
				component: 'DormantHole',
				server: { kind: 'pi', v: 'A' },
				client: { kind: 'null', v: 'A' },
			},
			{ component: 'DormantHole', server: { kind: 'i', v: 'A' }, client: { kind: 'p', v: 'A' } },
			{ component: 'DormantHole', server: { kind: 'p', v: 'A' }, client: { kind: 'p3', v: 'A' } },
			{ component: 'DormantHole', server: { kind: 'pi', v: 'A' }, client: { kind: 'p', v: 'A' } },
			{ component: 'DormantRows', server: { rows: ['a'] }, client: { rows: ['a', 'b', 'c'] } },
			{ component: 'DormantRows', server: { rows: ['a', 'b', 'c'] }, client: { rows: ['a'] } },
		])('renders $component from $server to $client silently', async (row) => {
			const serverProps = { when: condition(false), text: null, later: null, ...row.server };
			container.innerHTML = ServerRT.renderToString(server[row.component], serverProps).html;
			const recovered: unknown[] = [];
			const root = hydrateRoot(container, client[row.component], serverProps, {
				onRecoverableError: (error) => recovered.push(error),
			});
			flushSync(() => {});
			try {
				const host = container.firstElementChild!;
				const serverNodes = armNodes(container);
				const clientProps = { text: null, later: null, ...row.client };
				await act(() => root.render(client[row.component], { ...clientProps, when: load() }));
				expect(container.firstElementChild).toBe(host);
				expect(serverNodes.filter((node) => node.isConnected)).toEqual([]);
				expect(markup(container.querySelector('section')!)).toBe(
					await clientMarkup(row.component === 'DormantHole' ? 'Hole' : 'FramedRows', clientProps),
				);
				await expectSilent(recovered);
			} finally {
				root.unmount();
			}
		});
	});
});
