import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// The server renders each component's @if first arm and the client its @else
// arm, whose @switch or @if has no server range of its own.
//
// OCTANE DIVERGENCE: Octane's control-flow ranges are part of its hydration
// protocol, as React's Suspense markers are part of React's. A client branch
// whose server output has no range is a structural mismatch even where the
// elements inside it match, where React, which has no range markers, would
// adopt them. As in React, nothing is repaired in place: the nearest fallback
// owner discards its server DOM and renders on the client, reporting once.
// Inside a deferred <Hydrate> boundary that owner is the island, so the
// elements around it keep their identity; the arm renders from client data,
// suspends until its value resolves, and the branch then owns exactly what it
// rendered as later cases replace it. Without a boundary the root renders on
// the client.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/markerless-arm-retry.tsrx',
);
const FILE = 'markerless-arm-retry.tsrx';
const SOURCE = readFileSync(FIXTURE, 'utf8');
const MISMATCH = /^Hydration failed because the server rendered HTML didn't match the client\./;
const STRUCTURAL =
	/^Octane hydration mismatch at markerless-arm-retry\.tsrx:\d+:\d+: the client expected .+ but the server rendered .+\. The nearest Suspense or Hydrate boundary, or the root, will be regenerated on the client\.$/;

/** Element and text markup, ignoring hydration comments. */
function markup(node: Element): string {
	const copy = node.cloneNode(true) as Element;
	const walker = document.createTreeWalker(copy, NodeFilter.SHOW_COMMENT);
	const comments: Node[] = [];
	while (walker.nextNode()) comments.push(walker.currentNode);
	for (const comment of comments) comment.parentNode!.removeChild(comment);
	return copy.innerHTML;
}

/** A parent's element and text descendants, in order. */
function content(parent: Element): Node[] {
	const nodes: Node[] = [];
	const walker = document.createTreeWalker(parent, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
	while (walker.nextNode()) nodes.push(walker.currentNode);
	return nodes;
}

const SHAPES = [
	{ arm: 'a single root', name: 'SingleRoot', html: '<u>z</u>' },
	{ arm: 'a single root under @if', name: 'IfArm', html: '<u>z</u>' },
	{ arm: 'a root it suspends before cloning', name: 'BeforeClone', html: '<u>z</u>' },
	{ arm: 'text', name: 'TextArm', html: 'z' },
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
	/** The `<em>` that the sibling after the branch renders. */
	const tail = () => section().lastElementChild;
	const island = () => container.querySelector('[data-octane-hydrate-id]');

	/**
	 * Hydrate `name` with `props` over its server render of the @if's first arm.
	 * Returns the server's outer element, island wrapper, and section content.
	 */
	async function hydrate(name: string, props: Record<string, unknown>) {
		container.innerHTML = ServerRT.renderToString(server[name], {
			server: true,
			k: 'a',
			leaf: Promise.resolve('unused'),
		}).html;
		const served = {
			outer: container.firstElementChild,
			island: island(),
			nodes: [section(), ...content(section())],
		};
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

	/** Only the island rendered on the client, reporting once. */
	function expectIslandFallback(served: {
		outer: Element | null;
		island: Element | null;
		nodes: Node[];
	}) {
		expect(container.firstElementChild).toBe(served.outer);
		expect(island()).toBe(served.island);
		expect(served.nodes.filter((node) => node.isConnected)).toEqual([]);
		expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
		expect(warnings()).toEqual(dev ? [expect.stringMatching(STRUCTURAL)] : []);
	}

	describe.each(SHAPES)('an arm whose content is $arm', ({ name, html: arm, lead }) => {
		const html = (lead ? '<em>e</em>' : '') + arm;
		const lone = lead ? '<em>e</em>' : '';
		it('renders the island on the client and shows the arm once its value resolves', async () => {
			const { leaf, resolveLeaf, ...served } = await hydratePending(name);
			await act(async () => resolveLeaf('z'));

			expect(markup(section())).toBe(html + '<em>e</em>');
			expectIslandFallback(served);

			// The branch owns exactly what its arm rendered.
			const em = tail();
			render(name, 'b', leaf);
			expect(markup(section())).toBe(lone + '<em>e</em>');
			expect(tail()).toBe(em);
			render(name, 'c', leaf);
			expect(markup(section())).toBe(lone + '<b>c</b><em>e</em>');
			render(name, 'a', leaf);
			expect(markup(section())).toBe(html + '<em>e</em>');
			expect(tail()).toBe(em);
			expect(recoverable).toHaveLength(1);
		});

		it.each([
			{ k: 'b', next: '' },
			{ k: 'c', next: '<b>c</b>' },
		])('replaces the pending client arm with case $k', async ({ k, next }) => {
			const { leaf, resolveLeaf, ...served } = await hydratePending(name);
			render(name, k, leaf);
			await act(async () => {});
			await act(async () => resolveLeaf('z'));

			expect(markup(section())).toBe(lone + next + '<em>e</em>');
			expectIslandFallback(served);

			const em = tail();
			render(name, 'a', leaf);
			expect(markup(section())).toBe(html + '<em>e</em>');
			render(name, k, leaf);
			expect(markup(section())).toBe(lone + next + '<em>e</em>');
			expect(tail()).toBe(em);
			expect(recoverable).toHaveLength(1);
		});
	});

	it('renders an arm component that first renders after the value resolves', async () => {
		const { resolveLeaf, ...served } = await hydratePending('LaterSlot');
		await act(async () => resolveLeaf('z'));

		expect(markup(section())).toBe('<s>s</s><i>z</i><i>z</i><em>e</em>');
		expectIslandFallback(served);
	});

	// The arm's last root is static, after the component that suspends.
	const TRAILING = [
		{ arm: 'an @if arm', name: 'TrailingRoot' },
		{ arm: 'the body of a component whose identity differs on the client', name: 'TrailingFrame' },
		{ arm: 'an @if arm that suspends before it clones', name: 'TrailingClone' },
		{ arm: 'the body of a component in a descriptor list item', name: 'TrailingDescriptor' },
		{ arm: 'the body of a component in a keyed @for row', name: 'TrailingRow' },
	];

	it.each(TRAILING)(
		'owns the static last root of $arm after the island falls back',
		async ({ name }) => {
			const { leaf, resolveLeaf, ...served } = await hydratePending(name);
			await act(async () => resolveLeaf('z'));

			expect(markup(section())).toBe('<s>s</s><i>z</i><b>b</b><em>e</em>');
			expectIslandFallback(served);

			const em = tail();
			render(name, 'c', leaf);
			expect(markup(section())).toBe('<p>c</p><em>e</em>');
			expect(tail()).toBe(em);
			render(name, 'b', leaf);
			expect(markup(section())).toBe('<em>e</em>');
			render(name, 'a', leaf);
			expect(markup(section())).toBe('<s>s</s><i>z</i><b>b</b><em>e</em>');
			expect(tail()).toBe(em);
		},
	);

	it.each(TRAILING)(
		'replaces every root of $arm while its client render is pending',
		async ({ name }) => {
			const { leaf, resolveLeaf, ...served } = await hydratePending(name);
			render(name, 'c', leaf);
			await act(async () => {});
			await act(async () => resolveLeaf('z'));

			expect(markup(section())).toBe('<p>c</p><em>e</em>');
			expectIslandFallback(served);

			const em = tail();
			render(name, 'a', leaf);
			expect(markup(section())).toBe('<s>s</s><i>z</i><b>b</b><em>e</em>');
			expect(tail()).toBe(em);
		},
	);

	// Without a boundary, the root renders on the client.
	it.each([
		{
			arm: 'whose render ends inside its root',
			name: 'NestedTail',
			html: '<p><i>z</i></p><em>e</em>',
			next: '<b>c</b><em>e</em>',
		},
		{
			arm: 'that runs up to the end of its parent arm',
			name: 'LastArm',
			html: '<s>s</s><i>z</i>',
			next: '<b>c</b>',
		},
	])('renders the root on the client for an arm $arm', async ({ name, html, next }) => {
		const served = await hydrate(name, { k: 'a' });

		expect(markup(section())).toBe(html);
		expect(served.outer!.isConnected).toBe(false);
		expect(served.nodes.filter((node) => node.isConnected)).toEqual([]);
		expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
		expect(warnings()).toEqual(dev ? [expect.stringMatching(STRUCTURAL)] : []);

		const rendered = section();
		flushSync(() => root!.render(client[name], { k: 'c' }));
		expect(markup(section())).toBe(next);
		flushSync(() => root!.render(client[name], { k: 'a' }));
		expect(markup(section())).toBe(html);
		expect(section()).toBe(rendered);
	});
});
