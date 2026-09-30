import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createRoot, flushSync, hydrateRoot } from '../../src/index.js';
import { condition, load } from 'octane/hydration';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// A renderable value whose server range holds what the value cannot adopt:
// nothing, text, or another element. Hydration builds the value on the client
// and reports the mismatch once. When the value suspends, its Suspense boundary
// retries hydration over what the failed attempt left, and the retry must
// neither report the mismatch again nor keep or duplicate any of that content.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/unadoptable-range.tsrx',
);
const FILE = 'unadoptable-range.tsrx';
const SOURCE = readFileSync(FIXTURE, 'utf8');
const LINES = SOURCE.split('\n');

/** 1-based line of the first fixture line containing `text`. */
function lineOf(text: string): number {
	const index = LINES.findIndex((line) => line.includes(text));
	if (index === -1) throw new Error(`fixture has no line containing ${text}`);
	return index + 1;
}

// Where each kind of value reports: the hole, the component returning the
// value, and the host of a list whose item it is.
const HOLE = lineOf('{pick(props.kind, props.v, props.text)}');
const RETURNS = lineOf('function Returns(');
const LIST_HOST = lineOf('<section>');

/** Element and text markup, ignoring hydration comments. */
function markup(node: Element): string {
	const copy = node.cloneNode(true) as Element;
	const walker = document.createTreeWalker(copy, NodeFilter.SHOW_COMMENT);
	const comments: Node[] = [];
	while (walker.nextNode()) comments.push(walker.currentNode);
	for (const comment of comments) comment.parentNode!.removeChild(comment);
	return copy.innerHTML;
}

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

describe.each([
	{ name: 'development compile', dev: true },
	{ name: 'production compile', dev: false },
])('hydrateRoot — a renderable value that cannot adopt its server range ($name)', ({ dev }) => {
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

	/** Exactly one report: the recoverable error always, the warning in DEV only. */
	async function expectReported(
		recovered: unknown[],
		line: number,
		expected: string,
		actual: string,
	) {
		await Promise.resolve();
		expect(recovered).toHaveLength(1);
		expect(String((recovered[0] as Error).message)).toMatch(/hydration mismatch/i);
		expect(warns()).toEqual(
			dev
				? [
						expect.stringMatching(
							new RegExp(
								`^Octane hydration mismatch at [^ ]*${escapeRegExp(FILE)}:${line}:\\d+: ` +
									`the client expected ${escapeRegExp(expected)} but the server ` +
									`rendered ${escapeRegExp(actual)}\\.`,
							),
						),
					]
				: [],
		);
	}

	/** The markup a client render of the same props puts in the `<section>`. */
	function clientMarkup(component: unknown, props: Record<string, unknown>): string {
		const node = document.createElement('div');
		const root = createRoot(node);
		flushSync(() => root.render(component as never, props));
		try {
			return markup(node.querySelector('section')!);
		} finally {
			root.unmount();
		}
	}

	function hydrate(component: unknown, props: Record<string, unknown>, recovered: unknown[]) {
		const root = hydrateRoot(container, component as never, props, {
			onRecoverableError: (error) => recovered.push(error),
		});
		flushSync(() => {});
		return root;
	}

	describe('where the server rendered nothing', () => {
		it.each(['list', 'keyed', 'fragment'])('builds a %s and reports it once', async (kind) => {
			container.innerHTML = ServerRT.renderToString(server.Hole, {
				kind: 'empty',
				v: 'A',
				text: null,
			}).html;
			const section = container.querySelector('section')!;
			const tail = container.querySelector('b')!;
			const recovered: unknown[] = [];
			const props = { kind, v: 'A', text: null };
			const root = hydrate(client.Hole, props, recovered);
			try {
				expect(container.querySelector('section')).toBe(section);
				expect(markup(section)).toBe(clientMarkup(client.Hole, props));
				expect(container.querySelector('b')).toBe(tail);
				await expectReported(recovered, HOLE, 'a renderable list range', 'nothing');
				flushSync(() => root.render(client.Hole, { kind: 'text', v: 'B', text: null }));
				expect(markup(section)).toBe('B<b>B</b>');
			} finally {
				root.unmount();
			}
		});

		it('adopts the empty range for a list that renders nothing', async () => {
			container.innerHTML = ServerRT.renderToString(server.Hole, {
				kind: 'empty',
				v: 'A',
				text: null,
			}).html;
			const tail = container.querySelector('b')!;
			const recovered: unknown[] = [];
			const root = hydrate(client.Hole, { kind: 'none', v: 'A', text: null }, recovered);
			try {
				expect(markup(container.querySelector('section')!)).toBe('<b>A</b>');
				expect(container.querySelector('b')).toBe(tail);
				await Promise.resolve();
				expect(recovered).toEqual([]);
				expect(warns()).toEqual([]);
			} finally {
				root.unmount();
			}
		});

		// A component that returned nothing lends its own range to its value,
		// which has no site of its own, so the warning names the component.
		it.each([
			{ kind: 'list', expected: 'a renderable list range' },
			{ kind: 'wait-p', expected: '<p>' },
		])('builds the $kind a component returns and reports it once', async ({ kind, expected }) => {
			container.innerHTML = ServerRT.renderToString(server.ReturnHole, {
				kind: 'empty',
				v: 'A',
				text: null,
			}).html;
			const section = container.querySelector('section')!;
			const tail = container.querySelector('b')!;
			const recovered: unknown[] = [];
			const props = { kind, v: 'A', text: null };
			const root = hydrate(client.ReturnHole, props, recovered);
			try {
				expect(container.querySelector('section')).toBe(section);
				expect(markup(section)).toBe(clientMarkup(client.ReturnHole, props));
				expect(container.querySelector('b')).toBe(tail);
				await expectReported(recovered, RETURNS, expected, 'nothing');
			} finally {
				root.unmount();
			}
		});
	});

	// A list item whose value has component children adopts the range the
	// server rendered for that item. The item has no site of its own, so the
	// warning names the list's host.
	it.each([
		{ server: 'item-empty', actual: 'nothing' },
		{ server: 'item-i', actual: '<i>' },
	])(
		'builds a list item where the server rendered $actual and reports it once',
		async ({ server: kind, actual }) => {
			container.innerHTML = ServerRT.renderToString(server.Hole, { kind, v: 'A', text: null }).html;
			const section = container.querySelector('section')!;
			const tail = container.querySelector('b')!;
			const recovered: unknown[] = [];
			const props = { kind: 'item-p', v: 'A', text: null };
			const root = hydrate(client.Hole, props, recovered);
			try {
				expect(container.querySelector('section')).toBe(section);
				expect(markup(section)).toBe('<p class="x"><em class="now">A</em></p><b>A</b>');
				expect(container.querySelector('b')).toBe(tail);
				await expectReported(recovered, LIST_HOST, '<p>', actual);
			} finally {
				root.unmount();
			}
		},
	);

	describe('when the value suspends', () => {
		it.each([
			{
				value: 'a list where the server rendered nothing',
				component: 'SuspendingHole',
				server: 'empty',
				client: 'wait-list',
				line: HOLE,
				expected: 'a renderable list range',
				actual: 'nothing',
				html: '<p class="x">A</p><em class="waits">R</em><b>A</b>',
			},
			{
				value: 'an element where the server rendered text',
				component: 'SuspendingHole',
				server: 'text',
				client: 'wait-p',
				line: HOLE,
				expected: '<p>',
				actual: 'text "A"',
				html: '<p class="x"><em class="waits">R</em></p><b>A</b>',
			},
			{
				value: 'a list item where the server rendered nothing',
				component: 'SuspendingHole',
				server: 'item-empty',
				client: 'item-p',
				line: LIST_HOST,
				expected: '<p>',
				actual: 'nothing',
				html: '<p class="x"><em class="waits">R</em></p><b>A</b>',
			},
			{
				value: 'a returned list where the component rendered nothing',
				component: 'SuspendingReturnHole',
				server: 'empty',
				client: 'wait-list',
				line: RETURNS,
				expected: 'a renderable list range',
				actual: 'nothing',
				html: '<p class="x">A</p><em class="waits">R</em><b>A</b>',
			},
			{
				value: 'a returned list where the component rendered text',
				component: 'SuspendingReturnHole',
				server: 'text',
				client: 'wait-list',
				line: RETURNS,
				expected: 'a renderable list range',
				actual: 'text "A"',
				html: '<p class="x">A</p><em class="waits">R</em><b>A</b>',
			},
			{
				value: 'a returned element where the component rendered text',
				component: 'SuspendingReturnHole',
				server: 'text',
				client: 'wait-p',
				line: RETURNS,
				expected: '<p>',
				actual: 'text "A"',
				html: '<p class="x"><em class="waits">R</em></p><b>A</b>',
			},
		])('reports once and builds once for $value', async (row) => {
			container.innerHTML = ServerRT.renderToString(server[row.component], {
				kind: row.server,
				v: 'A',
				text: null,
			}).html;
			const section = container.querySelector('section')!;
			const tail = container.querySelector('b')!;
			let resolve!: (text: string) => void;
			const text = new Promise<string>((r) => (resolve = r));
			const recovered: unknown[] = [];
			const root = hydrate(client[row.component], { kind: row.client, v: 'A', text }, recovered);
			try {
				await act(async () => {
					resolve('R');
					await text;
				});
				expect(container.querySelector('section')).toBe(section);
				expect(markup(section)).toBe(row.html);
				expect(container.querySelector('b')).toBe(tail);
				await expectReported(recovered, row.line, row.expected, row.actual);
			} finally {
				root.unmount();
			}
		});

		// The dormant boundary's retry runs after the activation that knew its
		// captures had changed, so it must learn that from the first attempt.
		it('repairs a dormant boundary whose value became a list before activation without reporting', async () => {
			const serverProps = { when: condition(false), kind: 'empty', v: 'A', text: null };
			container.innerHTML = ServerRT.renderToString(server.DormantHole, serverProps).html;
			const recovered: unknown[] = [];
			const root = hydrate(client.DormantHole, serverProps, recovered);
			let resolve!: (text: string) => void;
			const text = new Promise<string>((r) => (resolve = r));
			try {
				const section = container.querySelector('section')!;
				const tail = container.querySelector('b')!;
				expect(markup(section)).toBe('<b>A</b>');
				await act(() =>
					root.render(client.DormantHole, { when: load(), kind: 'wait-list', v: 'A', text }),
				);
				await act(async () => {
					resolve('R');
					await text;
				});
				expect(container.querySelector('section')).toBe(section);
				expect(markup(section)).toBe('<p class="x">A</p><em class="waits">R</em><b>A</b>');
				expect(container.querySelector('b')).toBe(tail);
				await Promise.resolve();
				expect(recovered).toEqual([]);
				expect(warns()).toEqual([]);
			} finally {
				root.unmount();
			}
		});
	});
});
