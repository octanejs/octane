import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createRoot, flushSync, hydrateRoot } from '../../src/index.js';
import { condition, load } from 'octane/hydration';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// A list whose server content its client items cannot adopt: a renderable hole
// whose server list the client renders as nothing, a bare server item where
// the client's item needs a range of its own or has another tag, and fewer or
// more server items than client items, in a hole and in compiled @for rows.
// Hydration discards what the client cannot adopt, keeps every item it can,
// builds the rest, and reports the mismatch once. A boundary that retries
// after a suspension neither reports it again nor keeps or duplicates content.

const FIXTURE = join(process.cwd(), 'packages/octane/tests/hydration/_fixtures/list-hole.tsrx');
const FILE = 'list-hole.tsrx';
const SOURCE = readFileSync(FIXTURE, 'utf8');
const LINES = SOURCE.split('\n');

/** 1-based line of the first fixture line containing `text`. */
function lineOf(text: string): number {
	const index = LINES.findIndex((line) => line.includes(text));
	if (index === -1) throw new Error(`fixture has no line containing ${text}`);
	return index + 1;
}

// Where each recovery reports: the hole itself for its whole value, and the
// list's host for an item, which has no site of its own.
const HOLE = lineOf('{pick(props.kind, props.v, props.text)}');
const HOLE_HOST = lineOf('<section class="hole">');
const ROWS_HOST = lineOf('<ul class="rows">');
// A framed row's own bindings also stamp the list's host with their locations,
// so the warning for a framed @for row may name any of them.
const FRAMED_HOST = 0;

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

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

describe.each([
	{ name: 'development compile', dev: true },
	{ name: 'production compile', dev: false },
])('hydrateRoot — list items that cannot adopt their server content ($name)', ({ dev }) => {
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

	/**
	 * Exactly one report: the recoverable error always, and in DEV one warning
	 * naming `line` (0: any line). Leftover server items (`line` null) report
	 * their discard without a warning; anything else reports a rebuild.
	 */
	async function expectReported(
		recovered: unknown[],
		line: number | null,
		expected = '',
		actual = '',
	) {
		await Promise.resolve();
		expect(recovered).toHaveLength(1);
		expect(String((recovered[0] as Error).message)).toMatch(
			line === null
				? /^Hydration mismatch: the server rendered more list items than the client/
				: /^Hydration mismatch: the server-rendered node did not match the client render/,
		);
		expect(warns()).toEqual(
			dev && line !== null
				? [
						expect.stringMatching(
							new RegExp(
								`^Octane hydration mismatch at [^ ]*${escapeRegExp(FILE)}:${line || '\\d+'}:\\d+: ` +
									`the client expected ${escapeRegExp(expected)} but the server ` +
									`rendered ${escapeRegExp(actual)}\\.`,
							),
						),
					]
				: [],
		);
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

	/** Hydrates `client` over `server` and checks the result against a client render. */
	async function hydrateOver(
		component: string,
		serverProps: Record<string, unknown>,
		clientProps: Record<string, unknown>,
	) {
		serverRender(component, serverProps);
		const section = container.querySelector('section')!;
		const serverNodes = contentNodes(section);
		const tail = container.querySelector('b')!;
		const recovered: unknown[] = [];
		const root = hydrate(component, clientProps, recovered);
		expect(container.querySelector('section')).toBe(section);
		expect(markup(section)).toBe(
			await clientMarkup(component, { text: null, later: null, ...clientProps }),
		);
		expect(container.querySelector('b')).toBe(tail);
		return { root, section, recovered, serverNodes };
	}

	describe('where the server rendered a list and the client renders none', () => {
		it.each([
			{ server: 'pi', client: 'null', expected: 'nothing', actual: '<p>' },
			{ server: 'pi', client: 'empty', expected: 'nothing', actual: '<p>' },
			{ server: 'pi', client: 'text', expected: 'text "A"', actual: '<p>' },
			{ server: 'framed', client: 'null', expected: 'nothing', actual: 'a control-flow block' },
			{ server: 'framed', client: 'empty', expected: 'nothing', actual: 'a control-flow block' },
			{ server: 'text', client: 'null', expected: 'nothing', actual: 'text "A"' },
		])(
			'discards the $server server value for a $client value and reports it once',
			async ({ server: kind, client: next, expected, actual }) => {
				const { root, section, recovered } = await hydrateOver(
					'Hole',
					{ kind, v: 'A' },
					{ kind: next, v: 'A' },
				);
				try {
					await expectReported(recovered, HOLE, expected, actual);
					flushSync(() => root.render(client.Hole, { kind: 'p', v: 'B', text: null, later: null }));
					expect(markup(section)).toBe('<p>B</p><b>B</b>');
				} finally {
					root.unmount();
				}
			},
		);

		it('discards the server items for a list whose items render nothing', async () => {
			const { root, recovered } = await hydrateOver(
				'Hole',
				{ kind: 'pi', v: 'A' },
				{ kind: 'nothing', v: 'A' },
			);
			try {
				await expectReported(recovered, HOLE_HOST, 'another list item', '<p>');
			} finally {
				root.unmount();
			}
		});
	});

	describe('where a bare server item cannot be the client item', () => {
		it.each([
			{ client: 'p', expected: '<p>' },
			{ client: 'p-child', expected: 'another list item' },
		])(
			'builds the $client item over a bare <i> and reports it once',
			async ({ client: next, expected }) => {
				const { root, recovered } = await hydrateOver(
					'Hole',
					{ kind: 'i', v: 'A' },
					{ kind: next, v: 'A' },
				);
				try {
					expect(container.querySelector('i')).toBeNull();
					await expectReported(recovered, HOLE_HOST, expected, '<i>');
				} finally {
					root.unmount();
				}
			},
		);

		it('keeps the items before it', async () => {
			const { root, recovered, serverNodes } = await hydrateOver(
				'Hole',
				{ kind: 'p3', v: 'A' },
				{ kind: 'p-child3', v: 'A' },
			);
			try {
				expect(container.querySelector('p')).toBe(serverNodes[0]);
				await expectReported(recovered, HOLE_HOST, 'another list item', '<p>');
			} finally {
				root.unmount();
			}
		});
	});

	describe('where the server rendered fewer items', () => {
		it.each([
			{ client: 'p3', expected: '<p>' },
			{ client: 'p-child3', expected: 'another list item' },
		])('keeps the server item, builds the rest of $client, and reports once', async (row) => {
			serverRender('Hole', { kind: 'p', v: 'A' });
			const first = container.querySelector('p')!;
			const recovered: unknown[] = [];
			const root = hydrate('Hole', { kind: row.client, v: 'A' }, recovered);
			try {
				expect(markup(container.querySelector('section')!)).toBe(
					await clientMarkup('Hole', { kind: row.client, v: 'A', text: null, later: null }),
				);
				expect(container.querySelector('p')).toBe(first);
				await expectReported(recovered, HOLE_HOST, row.expected, 'nothing');
			} finally {
				root.unmount();
			}
		});

		it.each([
			{ component: 'Rows', line: ROWS_HOST },
			{ component: 'FramedRows', line: FRAMED_HOST },
		])('keeps the server row and builds two more @for rows ($component)', async (row) => {
			serverRender(row.component, { rows: ['a'] });
			const first = container.querySelector('li')!;
			const recovered: unknown[] = [];
			const root = hydrate(row.component, { rows: ['a', 'b', 'c'] }, recovered);
			try {
				expect(markup(container.querySelector('section')!)).toBe(
					await clientMarkup(row.component, { rows: ['a', 'b', 'c'], text: null, later: null }),
				);
				expect(container.querySelector('li')).toBe(first);
				await expectReported(recovered, row.line, 'another list item', 'nothing');
			} finally {
				root.unmount();
			}
		});
	});

	describe('where the server rendered more items', () => {
		it.each(['pi', 'p3'])(
			'keeps the first server item of %s and discards the rest',
			async (kind) => {
				serverRender('Hole', { kind, v: 'A' });
				const first = container.querySelector('p')!;
				const recovered: unknown[] = [];
				const root = hydrate('Hole', { kind: 'p', v: 'A' }, recovered);
				try {
					expect(markup(container.querySelector('section')!)).toBe('<p>A</p><b>A</b>');
					expect(container.querySelector('p')).toBe(first);
					await expectReported(recovered, null);
				} finally {
					root.unmount();
				}
			},
		);
	});

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
			const { root, section, recovered, serverNodes } = await hydrateOver(
				'Hole',
				{ kind, v: 'A' },
				{ kind: next, v: 'A' },
			);
			try {
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

	// The boundary retries hydration over what the failed attempt left: the
	// items it built, the server content it discarded, or its partial items.
	describe('when the boundary suspends', () => {
		it.each([
			{
				value: 'more items, the extra ones suspending',
				component: 'Hole',
				server: { kind: 'p', v: 'A' },
				client: { kind: 'p-child3', v: 'A' },
				wait: 'text',
				line: HOLE_HOST,
				expected: 'another list item',
				actual: 'nothing',
			},
			{
				value: 'a suspending item over a bare server item',
				component: 'Hole',
				server: { kind: 'i', v: 'A' },
				client: { kind: 'p-child', v: 'A' },
				wait: 'text',
				line: HOLE_HOST,
				expected: 'another list item',
				actual: '<i>',
			},
			{
				value: 'more @for rows, the extra ones suspending',
				component: 'FramedRows',
				server: { rows: ['a'] },
				client: { rows: ['a', 'b', 'c'] },
				wait: 'text',
				line: FRAMED_HOST,
				expected: 'another list item',
				actual: 'nothing',
			},
			{
				value: 'a list the client renders as nothing, before a suspending sibling',
				component: 'Hole',
				server: { kind: 'pi', v: 'A' },
				client: { kind: 'null', v: 'A' },
				wait: 'later',
				line: HOLE,
				expected: 'nothing',
				actual: '<p>',
			},
			{
				value: 'more items, before a suspending sibling',
				component: 'Hole',
				server: { kind: 'p', v: 'A' },
				client: { kind: 'p3', v: 'A' },
				wait: 'later',
				line: HOLE_HOST,
				expected: '<p>',
				actual: 'nothing',
			},
			{
				value: 'a bare <i> for a <p>, before a suspending sibling',
				component: 'Hole',
				server: { kind: 'i', v: 'A' },
				client: { kind: 'p', v: 'A' },
				wait: 'later',
				line: HOLE_HOST,
				expected: '<p>',
				actual: '<i>',
			},
			{
				value: 'more direct-host @for rows, before a suspending sibling',
				component: 'Rows',
				server: { rows: ['a'] },
				client: { rows: ['a', 'b', 'c'] },
				wait: 'later',
				line: ROWS_HOST,
				expected: 'another list item',
				actual: 'nothing',
			},
			{
				value: 'more framed @for rows, before a suspending sibling',
				component: 'FramedRows',
				server: { rows: ['a'] },
				client: { rows: ['a', 'b', 'c'] },
				wait: 'later',
				line: FRAMED_HOST,
				expected: 'another list item',
				actual: 'nothing',
			},
			{
				value: 'fewer items, before a suspending sibling',
				component: 'Hole',
				server: { kind: 'pi', v: 'A' },
				client: { kind: 'p', v: 'A' },
				wait: 'later',
				line: null,
				expected: '',
				actual: '',
			},
		])('reports once and builds once for $value', async (row) => {
			// The server renders the suspending sibling's resolved value.
			serverRender(row.component, {
				...row.server,
				later: row.wait === 'later' ? fulfilled('R') : null,
			});
			const section = container.querySelector('section')!;
			const tail = container.querySelector('b')!;
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
				expect(container.querySelector('section')).toBe(section);
				expect(markup(section)).toBe(
					await clientMarkup(row.component, {
						text: null,
						later: null,
						...row.client,
						[row.wait]: Promise.resolve('R'),
					}),
				);
				expect(container.querySelector('b')).toBe(tail);
				await expectReported(recovered, row.line, row.expected, row.actual);
			} finally {
				root.unmount();
			}
		});
	});

	// Captures that changed before a dormant boundary activated legitimately
	// differ from what the server rendered: repair the list without reporting.
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
		])('repairs $component from $server to $client silently', async (row) => {
			const serverProps = { when: condition(false), text: null, later: null, ...row.server };
			container.innerHTML = ServerRT.renderToString(server[row.component], serverProps).html;
			const recovered: unknown[] = [];
			const root = hydrateRoot(container, client[row.component], serverProps, {
				onRecoverableError: (error) => recovered.push(error),
			});
			flushSync(() => {});
			try {
				const section = container.querySelector('section')!;
				const tail = container.querySelector('b')!;
				const clientProps = { text: null, later: null, ...row.client };
				await act(() => root.render(client[row.component], { ...clientProps, when: load() }));
				expect(container.querySelector('section')).toBe(section);
				expect(markup(section)).toBe(
					await clientMarkup(row.component === 'DormantHole' ? 'Hole' : 'FramedRows', clientProps),
				);
				expect(container.querySelector('b')).toBe(tail);
				await expectSilent(recovered);
			} finally {
				root.unmount();
			}
		});
	});
});
