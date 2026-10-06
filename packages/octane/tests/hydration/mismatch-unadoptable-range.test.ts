import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createRoot, flushSync, hydrateRoot } from '../../src/index.js';
import { condition, load } from 'octane/hydration';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// A renderable value whose server range holds what the value cannot adopt:
// nothing, text, or another element. As in React, the server HTML does not
// match, so nothing is repaired in place: with no Suspense boundary around the
// value, the root renders on the client (no server node survives); inside a
// @try/@pending arm, the arm does, and the host around it keeps its identity.
// onRecoverableError fires once. An arm whose hydration suspends first keeps
// its server DOM until it resumes, then falls back and reports once.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/unadoptable-range.tsrx',
);
const FILE = 'unadoptable-range.tsrx';
const SOURCE = readFileSync(FIXTURE, 'utf8');
const MISMATCH = /^Hydration failed because the server rendered HTML didn't match the client\./;
const WARNING = new RegExp(
	`^Octane hydration mismatch at [^ ]*${FILE.replace('.', '\\.')}:\\d+:\\d+: the client expected .+ ` +
		'but the server rendered .+\\. The nearest Suspense or Hydrate boundary, or the root, will be ' +
		'regenerated on the client\\.$',
);

/** Element and text markup, ignoring hydration comments. */
function markup(node: Element): string {
	const copy = node.cloneNode(true) as Element;
	const walker = document.createTreeWalker(copy, NodeFilter.SHOW_COMMENT);
	const comments: Node[] = [];
	while (walker.nextNode()) comments.push(walker.currentNode);
	for (const comment of comments) comment.parentNode!.removeChild(comment);
	return copy.innerHTML;
}

/** The element and text nodes below `node`, in document order, and `node` itself. */
function subtree(node: Element): Node[] {
	const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
	const nodes: Node[] = [node];
	while (walker.nextNode()) nodes.push(walker.currentNode);
	return nodes;
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
	async function expectReported(recovered: unknown[]) {
		await Promise.resolve();
		expect(recovered).toHaveLength(1);
		expect(String((recovered[0] as Error).message)).toMatch(MISMATCH);
		expect(warns()).toEqual(dev ? [expect.stringMatching(WARNING)] : []);
	}

	/** None of the section's server nodes survived. */
	function expectDiscarded(serverNodes: Node[]) {
		expect(serverNodes.filter((node) => node.isConnected)).toEqual([]);
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
		it.each(['list', 'keyed', 'fragment'])(
			'renders the root on the client for a %s',
			async (kind) => {
				container.innerHTML = ServerRT.renderToString(server.Hole, {
					kind: 'empty',
					v: 'A',
					text: null,
				}).html;
				const serverNodes = subtree(container.querySelector('section')!);
				const recovered: unknown[] = [];
				const props = { kind, v: 'A', text: null };
				const root = hydrate(client.Hole, props, recovered);
				try {
					expectDiscarded(serverNodes);
					expect(markup(container.querySelector('section')!)).toBe(
						clientMarkup(client.Hole, props),
					);
					await expectReported(recovered);
					flushSync(() => root.render(client.Hole, { kind: 'text', v: 'B', text: null }));
					expect(markup(container.querySelector('section')!)).toBe('B<b>B</b>');
				} finally {
					root.unmount();
				}
			},
		);

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

		it.each(['list', 'wait-p'])(
			'renders the root on the client for the %s a component returns',
			async (kind) => {
				container.innerHTML = ServerRT.renderToString(server.ReturnHole, {
					kind: 'empty',
					v: 'A',
					text: null,
				}).html;
				const serverNodes = subtree(container.querySelector('section')!);
				const recovered: unknown[] = [];
				const props = { kind, v: 'A', text: null };
				const root = hydrate(client.ReturnHole, props, recovered);
				try {
					expectDiscarded(serverNodes);
					expect(markup(container.querySelector('section')!)).toBe(
						clientMarkup(client.ReturnHole, props),
					);
					await expectReported(recovered);
				} finally {
					root.unmount();
				}
			},
		);
	});

	// A list item whose value has component children adopts the range the
	// server rendered for that item.
	it.each([
		{ server: 'item-empty', actual: 'nothing' },
		{ server: 'item-i', actual: 'an <i>' },
	])(
		'renders the root on the client for a list item where the server rendered $actual',
		async ({ server: kind }) => {
			container.innerHTML = ServerRT.renderToString(server.Hole, { kind, v: 'A', text: null }).html;
			const serverNodes = subtree(container.querySelector('section')!);
			const recovered: unknown[] = [];
			const props = { kind: 'item-p', v: 'A', text: null };
			const root = hydrate(client.Hole, props, recovered);
			try {
				expectDiscarded(serverNodes);
				expect(markup(container.querySelector('section')!)).toBe(
					'<p class="x"><em class="now">A</em></p><b>A</b>',
				);
				await expectReported(recovered);
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
				html: '<p class="x">A</p><em class="waits">R</em><b>A</b>',
			},
			{
				value: 'an element where the server rendered text',
				component: 'SuspendingHole',
				server: 'text',
				client: 'wait-p',
				html: '<p class="x"><em class="waits">R</em></p><b>A</b>',
			},
			{
				value: 'a list item where the server rendered nothing',
				component: 'SuspendingHole',
				server: 'item-empty',
				client: 'item-p',
				html: '<p class="x"><em class="waits">R</em></p><b>A</b>',
			},
			{
				value: 'a returned list where the component rendered nothing',
				component: 'SuspendingReturnHole',
				server: 'empty',
				client: 'wait-list',
				html: '<p class="x">A</p><em class="waits">R</em><b>A</b>',
			},
			{
				value: 'a returned list where the component rendered text',
				component: 'SuspendingReturnHole',
				server: 'text',
				client: 'wait-list',
				html: '<p class="x">A</p><em class="waits">R</em><b>A</b>',
			},
			{
				value: 'a returned element where the component rendered text',
				component: 'SuspendingReturnHole',
				server: 'text',
				client: 'wait-p',
				html: '<p class="x"><em class="waits">R</em></p><b>A</b>',
			},
		])('renders the arm on the client once for $value', async (row) => {
			container.innerHTML = ServerRT.renderToString(server[row.component], {
				kind: row.server,
				v: 'A',
				text: null,
			}).html;
			const main = container.querySelector('main')!;
			const serverNodes = subtree(container.querySelector('section')!);
			let resolve!: (text: string) => void;
			const text = new Promise<string>((r) => (resolve = r));
			const recovered: unknown[] = [];
			const root = hydrate(client[row.component], { kind: row.client, v: 'A', text }, recovered);
			try {
				await act(async () => {
					resolve('R');
					await text;
				});
				expect(container.querySelector('main')).toBe(main);
				expectDiscarded(serverNodes);
				expect(markup(container.querySelector('section')!)).toBe(row.html);
				await expectReported(recovered);
			} finally {
				root.unmount();
			}
		});

		// Captures that changed before a dormant boundary activated legitimately
		// differ from what the server rendered. As React reports nothing for an
		// update that reaches a dehydrated boundary, the arm renders on the client
		// without a report, also when its first attempt suspends.
		it('renders the arm of a dormant boundary whose value became a list before activation without reporting', async () => {
			const serverProps = { when: condition(false), kind: 'empty', v: 'A', text: null };
			container.innerHTML = ServerRT.renderToString(server.DormantHole, serverProps).html;
			const recovered: unknown[] = [];
			const root = hydrate(client.DormantHole, serverProps, recovered);
			let resolve!: (text: string) => void;
			const text = new Promise<string>((r) => (resolve = r));
			try {
				const main = container.querySelector('main')!;
				const section = container.querySelector('section')!;
				const serverNodes = subtree(section);
				expect(markup(section)).toBe('<b>A</b>');
				await act(() =>
					root.render(client.DormantHole, { when: load(), kind: 'wait-list', v: 'A', text }),
				);
				await act(async () => {
					resolve('R');
					await text;
				});
				expect(container.querySelector('main')).toBe(main);
				expectDiscarded(serverNodes);
				expect(markup(container.querySelector('section')!)).toBe(
					'<p class="x">A</p><em class="waits">R</em><b>A</b>',
				);
				await Promise.resolve();
				expect(recovered).toEqual([]);
				expect(warns()).toEqual([]);
			} finally {
				root.unmount();
			}
		});
	});
});
