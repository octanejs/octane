import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { prerender } from 'octane/static';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// When a template's root does not match the server node at the cursor, the
// server HTML does not match, as in React. Nothing is rebuilt in place: with no
// Suspense or Hydrate boundary the root discards its server DOM and renders on
// the client, reporting once. Blocks inside the client-rendered subtree mount
// as client DOM: they never claim the server output that followed the
// mismatched node, and never report a second time for the same fallback. A
// block that differs inside a matching element is a mismatch of its own.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/rebuilt-clone-blocks.tsrx',
);
const FILE = 'rebuilt-clone-blocks.tsrx';
const SOURCE = readFileSync(FIXTURE, 'utf8');
const LINES = SOURCE.split('\n');

/** 1-based line of the first fixture line containing `text`. */
function lineOf(text: string): number {
	const index = LINES.findIndex((line) => line.includes(text));
	if (index < 0) throw new Error(`fixture has no line containing ${text}`);
	return index + 1;
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

const MISMATCH = /^Hydration failed because the server rendered HTML didn't match the client\./;

/** The one diagnostic a mismatched leaf reports: its `<i>` against the server `<b>`. */
function wrongTag(leaf: string): string {
	return (
		`Octane hydration mismatch at ${FILE}:${lineOf(`function ${leaf}(`) + 1}:1: the client ` +
		'expected <i> but the server rendered <b>. The nearest Suspense or Hydrate boundary, or ' +
		'the root, will be regenerated on the client.'
	);
}

describe.each([
	{ name: 'development compile', dev: true },
	{ name: 'production compile', dev: false },
])('hydrateRoot — blocks in a client-rendered template clone ($name)', ({ dev }) => {
	const server = loadServerFixture(FIXTURE, { id: FILE });
	const client = loadCompiledFixtureSource(SOURCE, {
		id: FILE,
		mode: 'client',
		compileOptions: { dev },
	});
	let container: HTMLElement;
	let root: ReturnType<typeof hydrateRoot> | null;
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

	const warnings = () =>
		errSpy.mock.calls
			.map((call: unknown[]) => String(call[0]))
			.filter((message: string) => message.includes('hydration mismatch'));

	/** Server-render `name` into the container; returns the server's elements. */
	function serve(name: string, serverProps: Record<string, unknown>): Element[] {
		container.innerHTML = ServerRT.renderToString(server[name], serverProps).html;
		return [...container.querySelectorAll('*')];
	}

	async function hydrate(name: string, clientProps: Record<string, unknown>): Promise<void> {
		root = hydrateRoot(container, client[name], clientProps, {
			onRecoverableError: (error: unknown) => recoverable.push((error as Error).message),
		});
		flushSync(() => {});
		// Recoverable reports are delivered after the hydration burst.
		await act(async () => {});
	}

	it.each([
		{ block: 'an @if', name: 'IfBranch', leaf: 'IfLeaf', html: '<i><s>c</s>ok</i>' },
		{ block: 'a @switch', name: 'SwitchBranch', leaf: 'SwitchLeaf', html: '<i><s>a</s>ok</i>' },
		{
			block: 'a @for',
			name: 'ForBranch',
			leaf: 'ForLeaf',
			props: { items: ['x', 'y'] },
			html: '<i><s>x</s><s>y</s>ok</i>',
		},
		{
			block: 'an @empty @for',
			name: 'ForBranch',
			leaf: 'ForLeaf',
			props: { items: [] },
			html: '<i><u>none</u>ok</i>',
		},
		{ block: 'a @try', name: 'TryBranch', leaf: 'TryLeaf', html: '<i><s>t</s>ok</i>' },
		{
			block: 'an Activity',
			name: 'ActivityBranch',
			leaf: 'ActivityLeaf',
			html: '<i><s>a</s>ok</i>',
		},
		{
			block: 'an ErrorBoundary',
			name: 'BoundaryBranch',
			leaf: 'BoundaryLeaf',
			html: '<i><s>b</s>ok</i>',
		},
	])(
		'renders the root on the client once for a mismatched clone holding $block',
		async ({ name, leaf, props = {}, html }) => {
			const served = serve(name, { ...props, server: true });
			await hydrate(name, props);

			expect(markup(container.firstElementChild!)).toBe(html);
			expect(served.filter((node) => node.isConnected)).toEqual([]);
			expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
			expect(warnings()).toEqual(dev ? [wrongTag(leaf)] : []);
		},
	);

	it.each([
		{ output: 'element', name: 'ForeignNodeBranch', leaf: 'IfLeaf', html: '<s>c</s>ok' },
		{
			output: 'list range',
			name: 'ForeignListBranch',
			leaf: 'ForLeaf',
			html: '<s>x</s><s>y</s>ok',
		},
	])(
		'does not claim a server $output that follows the mismatched clone',
		async ({ name, leaf, html }) => {
			const served = serve(name, { server: true });
			await hydrate(name, {});

			expect(markup(container.firstElementChild!)).toBe(`<i>${html}</i>`);
			expect(served.filter((node) => node.isConnected)).toEqual([]);
			expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
			expect(warnings()).toEqual(dev ? [wrongTag(leaf)] : []);
		},
	);

	it('discards a matching server sibling after the mismatched clone with the rest of the root', async () => {
		serve('SiblingBranch', { server: true });
		const em = container.querySelector('em')!;
		await hydrate('SiblingBranch', {});

		expect(markup(container.firstElementChild!)).toBe('<i><s>c</s>ok</i><em>e</em>');
		expect(em.isConnected).toBe(false);
		expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
		expect(warnings()).toEqual(dev ? [wrongTag('IfLeaf')] : []);
	});

	it('mounts live components when the root renders on the client', async () => {
		const props = { k: 'a', tag: 'mark', step: 0 };
		const served = serve('ComponentBranch', { ...props, server: true });
		await hydrate('ComponentBranch', props);

		expect(markup(container.firstElementChild!)).toBe(
			'<i><button class="inner">inner:0</button><small class="inner">inner</small>' +
				'<button class="keyed">keyed:0</button><mark class="tag">step:0</mark>' +
				'<strong class="badge">badge:0</strong>ok</i>' +
				'<button class="after">after:0</button><small class="after">after</small>',
		);
		expect(served.filter((node) => node.isConnected)).toEqual([]);
		expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
		expect(warnings()).toEqual(dev ? [wrongTag('ComponentLeaf')] : []);

		const inner = container.querySelector<HTMLButtonElement>('button.inner')!;
		const keyed = container.querySelector<HTMLButtonElement>('button.keyed')!;
		const after = container.querySelector<HTMLButtonElement>('button.after')!;
		const tag = container.querySelector('mark')!;
		const badge = container.querySelector('strong')!;
		flushSync(() => inner.click());
		flushSync(() => keyed.click());
		flushSync(() => after.click());
		expect([inner, keyed, after].map((button) => button.textContent)).toEqual([
			'inner:1',
			'keyed:1',
			'after:1',
		]);

		// The same key keeps the keyed component; every instance keeps its node.
		flushSync(() => root!.render(client.ComponentBranch, { ...props, step: 1 }));
		expect(container.querySelector('button.keyed')).toBe(keyed);
		expect(container.querySelector('mark')).toBe(tag);
		expect(container.querySelector('strong')).toBe(badge);
		expect([inner, keyed, tag, badge, after].map((node) => node.textContent)).toEqual([
			'inner:1',
			'keyed:1',
			'step:1',
			'badge:1',
			'after:1',
		]);

		// A new key remounts only the keyed component.
		flushSync(() => root!.render(client.ComponentBranch, { ...props, k: 'b', step: 1 }));
		expect(keyed.isConnected).toBe(false);
		expect(container.querySelector('button.keyed')!.textContent).toBe('keyed:0');
		expect([inner, after].map((button) => button.textContent)).toEqual(['inner:1', 'after:1']);
		expect(recoverable).toHaveLength(1);
	});

	it("renders a mismatched @try arm from client data, not a server sibling's use() seed", async () => {
		container.innerHTML = (
			await prerender(server.SeedBranch, {
				server: true,
				leaf: Promise.resolve('server leaf'),
				sibling: Promise.resolve('server sibling'),
			})
		).html;
		const div = container.firstElementChild;
		const em = container.querySelector('em')!;
		let resolveLeaf!: (value: string) => void;
		const leaf = new Promise<string>((resolve) => (resolveLeaf = resolve));
		let resolveSibling!: (value: string) => void;
		const sibling = new Promise<string>((resolve) => (resolveSibling = resolve));
		await hydrate('SeedBranch', { leaf, sibling });

		// Only the arm renders on the client; its host element keeps its identity.
		// OCTANE DIVERGENCE: a template clones its root element before its holes
		// run, so the leaf's `<i>` mismatches before its use() suspends, and the arm
		// renders on the client at once, showing its @pending arm. React reads the
		// value first, so it suspends while it still shows the server's content and
		// renders the arm on the client once the value resolves. Both commit the
		// same output and report once.
		expect(container.firstElementChild).toBe(div);
		expect(em.isConnected).toBe(false);
		expect(container.querySelector('p')!.textContent).toBe('pending');
		expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);

		await act(async () => {
			resolveLeaf('client leaf');
			resolveSibling('client sibling');
		});

		expect(container.firstElementChild).toBe(div);
		expect(markup(container.querySelector('i')!)).toBe('<s>client leaf</s>ok');
		expect(container.querySelector('em')!.textContent).toBe('client sibling');
		expect(container.textContent).not.toContain('server');
		expect(recoverable).toHaveLength(1);
	});

	it.each([
		{
			block: 'an @if arm',
			name: 'IfLabel',
			serverProps: { on: false },
			clientProps: { on: true },
			html: '<i><s>c</s>ok</i>',
		},
		{
			block: 'a @for item',
			name: 'ListLabel',
			serverProps: { items: ['x'] },
			clientProps: { items: ['x', 'y'] },
			html: '<i><s>x</s><s>y</s>ok</i>',
		},
	])(
		'renders the root on the client for $block that differs inside a matching element',
		async ({ name, serverProps, clientProps, html }) => {
			const served = serve(name, serverProps);
			await hydrate(name, clientProps);

			expect(markup(container.firstElementChild!)).toBe(html);
			expect(served.filter((node) => node.isConnected)).toEqual([]);
			expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
			expect(warnings()).toEqual(
				dev
					? [
							expect.stringMatching(
								/^Octane hydration mismatch at rebuilt-clone-blocks\.tsrx:\d+:\d+: the client expected .+ but the server rendered .+\. The nearest Suspense or Hydrate boundary, or the root, will be regenerated on the client\.$/,
							),
						]
					: [],
			);
		},
	);
});
