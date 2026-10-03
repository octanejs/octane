import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// A @switch or @if that the server rendered no range for mounts its arm in the
// place of the server node at the hydration cursor. When that arm suspends
// inside a deferred <Hydrate> boundary, the boundary retries the same arm, or a
// case change replaces it, after its first attempt left it without a boundary
// of its own. Either way the arm's content is what it adopted at the cursor:
// the retry keeps those server nodes, another case replaces exactly them, and
// the sibling after the switch adopts its own server nodes. The case change
// happens before the boundary hydrates, so nothing is a mismatch. An arm that
// does not suspend is bounded the same way.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/markerless-arm-retry.tsrx',
);
const FILE = 'markerless-arm-retry.tsrx';
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

/** The `<!--if-->` and `<!--switch-->` comments in `parent` that nothing closes. */
function unclosed(parent: Element): Node[] {
	const open: Node[] = [];
	for (const node of Array.from(parent.childNodes)) {
		const data = node.nodeType === 8 ? (node as Comment).data : '';
		if (data === 'if' || data === 'switch') open.push(node);
		else if (data === '/if' || data === '/switch') open.pop();
	}
	return open;
}

/** A parent's element and text children, in order. */
function content(parent: Element): Node[] {
	return Array.from(parent.childNodes).filter((node) => node.nodeType !== 8);
}

const SHAPES = [
	{ arm: 'a single root it adopted', name: 'SingleRoot', html: '<u>z</u>' },
	{ arm: 'a single root under @if', name: 'IfArm', html: '<u>z</u>' },
	{ arm: 'a root it suspended before cloning', name: 'BeforeClone', html: '<u>z</u>' },
	{ arm: 'server text', name: 'TextArm', html: 'z' },
	{ arm: 'two roots', name: 'MultiRoot', html: '<s>s</s><i>z</i>' },
	{ arm: 'two roots after a sibling', name: 'LeadSibling', html: '<s>s</s><i>z</i>', lead: true },
	{
		arm: 'two roots, suspending in the second',
		name: 'NestedRoot',
		html: '<s>s</s><p><i>z</i></p>',
	},
];

describe.each([
	{ name: 'development compile', dev: true },
	{ name: 'production compile', dev: false },
])('hydrateRoot — a branch arm with no server range ($name)', ({ dev }) => {
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

	const warnings = () =>
		errSpy.mock.calls
			.map((call: unknown[]) => String(call[0]))
			.filter((message: string) => message.includes('hydration mismatch'));

	const section = () => container.querySelector('section')!;
	/** The server `<em>` that the sibling after the switch adopts. */
	const tail = () => section().lastElementChild;

	/** The section's element and text nodes are exactly the server's `nodes`. */
	function expectAdopted(nodes: Node[]): void {
		const current = content(section());
		expect(current).toHaveLength(nodes.length);
		current.forEach((node, i) => expect(node).toBe(nodes[i]));
	}

	/**
	 * Hydrate `name` with `props` over its server render of the @if's first arm.
	 * Returns the server's element and text nodes and its last `<em>`.
	 */
	async function hydrate(name: string, props: Record<string, unknown>) {
		container.innerHTML = ServerRT.renderToString(server[name], {
			server: true,
			k: 'a',
			leaf: Promise.resolve('unused'),
		}).html;
		const served = { nodes: content(section()), em: tail() };
		root = hydrateRoot(container, client[name], props, {
			onRecoverableError: (error: unknown) => recoverable.push((error as Error).message),
		});
		flushSync(() => {});
		// Recoverable reports are delivered after the hydration burst.
		await act(async () => {});
		return served;
	}

	/** Hydrate `name` while the client's value is pending. */
	async function hydratePending(name: string) {
		let resolveLeaf!: (value: string) => void;
		const leaf = new Promise<string>((resolve) => (resolveLeaf = resolve));
		return { leaf, resolveLeaf, ...(await hydrate(name, { k: 'a', leaf })) };
	}

	function render(name: string, k: string, leaf: Promise<string>) {
		flushSync(() => root!.render(client[name], { k, leaf }));
	}

	describe.each(SHAPES)('an arm whose content is $arm', ({ name, html: arm, lead }) => {
		const html = (lead ? '<em>e</em>' : '') + arm;
		const lone = lead ? '<em>e</em>' : '';
		it('keeps the server nodes when the boundary retries the arm', async () => {
			const { leaf, resolveLeaf, nodes, em } = await hydratePending(name);
			await act(async () => resolveLeaf('z'));

			expect(markup(section())).toBe(html + '<em>e</em>');
			expectAdopted(nodes);
			expect(unclosed(section())).toEqual([]);
			expect(recoverable).toEqual([]);
			expect(warnings()).toEqual([]);

			// The switch owns exactly what its arm adopted.
			render(name, 'b', leaf);
			expect(markup(section())).toBe(lone + '<em>e</em>');
			expect(tail()).toBe(em);
			render(name, 'c', leaf);
			expect(markup(section())).toBe(lone + '<b>c</b><em>e</em>');
			render(name, 'a', leaf);
			expect(markup(section())).toBe(html + '<em>e</em>');
			expect(tail()).toBe(em);
		});

		it.each([
			{ k: 'b', next: '' },
			{ k: 'c', next: '<b>c</b>' },
		])('replaces the pending arm with case $k', async ({ k, next }) => {
			const { leaf, resolveLeaf, em } = await hydratePending(name);
			render(name, k, leaf);
			await act(async () => {});
			await act(async () => resolveLeaf('z'));

			expect(markup(section())).toBe(lone + next + '<em>e</em>');
			expect(tail()).toBe(em);
			expect(unclosed(section())).toEqual([]);
			expect(recoverable).toEqual([]);
			expect(warnings()).toEqual([]);

			render(name, 'a', leaf);
			expect(markup(section())).toBe(html + '<em>e</em>');
			render(name, k, leaf);
			expect(markup(section())).toBe(lone + next + '<em>e</em>');
			expect(tail()).toBe(em);
		});
	});

	it('keeps the server nodes of an arm slot that first renders in the retry', async () => {
		const { resolveLeaf, nodes } = await hydratePending('LaterSlot');
		await act(async () => resolveLeaf('z'));

		expect(markup(section())).toBe('<s>s</s><i>z</i><i>z</i><em>e</em>');
		expectAdopted(nodes);
		expect(recoverable).toEqual([]);
		expect(warnings()).toEqual([]);
	});

	// The arm's last root is static. Neither the arm's first render nor its
	// retry rests the cursor on that root, so only where its template's roots
	// end says the arm owns it.
	const TRAILING = [
		{ arm: 'an @if arm', name: 'TrailingRoot' },
		{ arm: 'the body of a component the client adopted', name: 'TrailingFrame' },
		{ arm: 'an @if arm that suspends before it clones', name: 'TrailingClone' },
	];

	it.each(TRAILING)('keeps and owns the static last root of $arm', async ({ name }) => {
		const { leaf, resolveLeaf, nodes, em } = await hydratePending(name);
		await act(async () => resolveLeaf('z'));

		expect(markup(section())).toBe('<s>s</s><i>z</i><b>b</b><em>e</em>');
		expectAdopted(nodes);
		expect(recoverable).toEqual([]);
		expect(warnings()).toEqual([]);

		render(name, 'c', leaf);
		expect(markup(section())).toBe('<p>c</p><em>e</em>');
		expect(tail()).toBe(em);
		render(name, 'b', leaf);
		expect(markup(section())).toBe('<em>e</em>');
		render(name, 'a', leaf);
		expect(markup(section())).toBe('<s>s</s><i>z</i><b>b</b><em>e</em>');
		expect(tail()).toBe(em);
	});

	it.each(TRAILING)('replaces every root of $arm while it is pending', async ({ name }) => {
		const { leaf, resolveLeaf, em } = await hydratePending(name);
		render(name, 'c', leaf);
		await act(async () => {});
		await act(async () => resolveLeaf('z'));

		expect(markup(section())).toBe('<p>c</p><em>e</em>');
		expect(tail()).toBe(em);
		expect(recoverable).toEqual([]);
		expect(warnings()).toEqual([]);

		render(name, 'a', leaf);
		expect(markup(section())).toBe('<s>s</s><i>z</i><b>b</b><em>e</em>');
		expect(tail()).toBe(em);
	});

	it('bounds an arm whose render ends inside its root', async () => {
		const { nodes, em } = await hydrate('NestedTail', { k: 'a' });

		expect(markup(section())).toBe('<p><i>z</i></p><em>e</em>');
		expectAdopted(nodes);
		expect(recoverable).toEqual([]);
		expect(warnings()).toEqual([]);

		flushSync(() => root!.render(client.NestedTail, { k: 'c' }));
		expect(markup(section())).toBe('<b>c</b><em>e</em>');
		expect(tail()).toBe(em);
	});

	it('bounds an arm that runs up to the end of its parent arm', async () => {
		const { nodes } = await hydrate('LastArm', { k: 'a' });

		expect(markup(section())).toBe('<s>s</s><i>z</i>');
		expectAdopted(nodes);
		expect(recoverable).toEqual([]);
		expect(warnings()).toEqual([]);

		flushSync(() => root!.render(client.LastArm, { k: 'c' }));
		expect(markup(section())).toBe('<b>c</b>');
		flushSync(() => root!.render(client.LastArm, { k: 'a' }));
		expect(markup(section())).toBe('<s>s</s><i>z</i>');
	});
});
