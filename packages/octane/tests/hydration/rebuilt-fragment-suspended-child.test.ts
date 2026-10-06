import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXTERNAL_HYDRATION_PROMISE, act, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// A <Hydrate> island's child suspends inside a component where the server
// rendered another component. The island is a fallback boundary: its server
// HTML does not match, so it discards that DOM and renders on the client,
// reporting once, while the host outside the island keeps its server node.
// The outcome is the same whether the child's data is ready during hydration
// or arrives later.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/rebuilt-fragment-suspended-child.tsrx',
);
const FILE = 'rebuilt-fragment-suspended-child.tsrx';
const SOURCE = readFileSync(FIXTURE, 'utf8');
const HYDRATION_FAILED =
	/^Hydration failed because the server rendered HTML didn't match the client/;

const SHAPES = [
	{
		shape: 'a fragment that starts with the suspending child',
		name: 'HoleFirstBranch',
		html: '<u>z</u><i>x</i><em>e</em>',
	},
	{
		shape: 'a fragment that starts with static markup',
		name: 'StaticFirstBranch',
		html: '<i>x</i><u>z</u><em>e</em>',
	},
	{
		shape: 'a fragment whose suspending child renders a range',
		name: 'FramedFirstBranch',
		html: '<u>z</u><s>s</s><i>x</i><em>e</em>',
	},
	{
		shape: 'a fragment whose static root after the child is text',
		name: 'HoleThenTextBranch',
		html: '<u>z</u>x<em>e</em>',
	},
];

function escape(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

/** A client-owned resource: hydration reads it rather than a server seed. */
function external<T extends object>(promise: T) {
	return Object.assign(promise, { [EXTERNAL_HYDRATION_PROMISE]: true as const });
}

function fulfilled(value: string) {
	return external(Object.assign(Promise.resolve(value), { status: 'fulfilled', value }));
}

function pending() {
	let resolve!: (value: string) => void;
	const promise = external(new Promise<string>((res) => (resolve = res)));
	return { promise, resolve };
}

describe.each([
	{ name: 'development compile', dev: true },
	{ name: 'production compile', dev: false },
])('hydrateRoot — a suspended child of a mismatched <Hydrate> island ($name)', ({ dev }) => {
	const server = loadServerFixture(FIXTURE, { id: FILE });
	const client = loadCompiledFixtureSource(SOURCE, {
		id: FILE,
		mode: 'client',
		compileOptions: { dev },
	});
	let container: HTMLElement;
	let root: { render(component: unknown, props?: unknown): void; unmount(): void } | null;
	let recoverable: string[];
	let errSpy: ReturnType<typeof vi.spyOn>;

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

	/** The server render: the host around the island, and the island's content. */
	function render(name: string, props: Record<string, unknown>) {
		container.innerHTML = ServerRT.renderToString(server[name], props).html;
		const outer = container.firstElementChild!;
		const content = section();
		return { outer, island: [content, ...content.querySelectorAll('*')] };
	}

	async function hydrate(name: string, props: Record<string, unknown>): Promise<void> {
		root = hydrateRoot(container, client[name] as never, props as never, {
			onRecoverableError: (error: unknown) => recoverable.push((error as Error).message),
		}) as never;
		flushSync(() => {});
		await act(async () => {});
	}

	/**
	 * Only the island fell back: the host around it is the server's, none of
	 * the island's server elements is connected, and it reported once.
	 */
	function expectIslandFellBack(outer: Element, island: Element[]): void {
		expect(container.firstElementChild).toBe(outer);
		expect(island.length).toBeGreaterThan(0);
		expect(island.filter((node) => node.isConnected).map((n) => n.outerHTML)).toEqual([]);
		expect(recoverable).toEqual([expect.stringMatching(HYDRATION_FAILED)]);
		expect(warnings()).toEqual(
			dev
				? [expect.stringMatching(new RegExp(`^Octane hydration mismatch at ${escape(FILE)}\\b`))]
				: [],
		);
	}

	it.each(SHAPES)(
		'client-renders the island for $shape over another component once its child resolves',
		async ({ name, html }) => {
			const { outer, island } = render(name, { server: true, leaf: fulfilled('unused') });
			const leaf = pending();

			await hydrate(name, { leaf: leaf.promise });
			await act(async () => leaf.resolve('z'));

			expect(markup(section())).toBe(html);
			expectIslandFellBack(outer, island);

			// The client-rendered child updates in place.
			const em = section().querySelector('em');
			await act(async () => root!.render(client[name], { leaf: fulfilled('w') }));
			expect(markup(section())).toBe(html.replace('<u>z</u>', '<u>w</u>'));
			expect(section().querySelector('em')).toBe(em);
			expect(recoverable).toHaveLength(1);
		},
	);

	it.each(SHAPES)(
		'client-renders the island for $shape over another component when its data is ready',
		async ({ name, html }) => {
			const { outer, island } = render(name, { server: true, leaf: fulfilled('unused') });

			await hydrate(name, { leaf: fulfilled('z') });

			expect(markup(section())).toBe(html);
			expectIslandFellBack(outer, island);
		},
	);

	// The suspending child comes before any host of the client's arm, so, as in
	// React, hydration suspends before it can reach a mismatch: the island's
	// server HTML stays on screen, and nothing is reported, until the data
	// arrives.
	it.each(SHAPES.filter(({ name }) => name !== 'StaticFirstBranch'))(
		'keeps the island’s server HTML while the leading child of $shape is pending',
		async ({ name }) => {
			const { island } = render(name, { server: true, leaf: fulfilled('unused') });
			const leaf = pending();

			await hydrate(name, { leaf: leaf.promise });
			expect(island.filter((node) => !node.isConnected).map((node) => node.outerHTML)).toEqual([]);
			expect(recoverable).toEqual([]);

			await act(async () => leaf.resolve('z'));
			expect(recoverable).toHaveLength(1);
		},
	);

	it.each(SHAPES)(
		'keeps every server node of $shape when the server rendered it',
		async ({ name, html }) => {
			render(name, { leaf: fulfilled('z') });
			const adopted = [...section().querySelectorAll('*')];
			const leaf = pending();

			await hydrate(name, { leaf: leaf.promise });
			await act(async () => leaf.resolve('z'));

			expect(markup(section())).toBe(html);
			expect([...section().querySelectorAll('*')]).toEqual(adopted);
			expect(recoverable).toEqual([]);
			expect(warnings()).toEqual([]);
		},
	);

	it.each([
		{
			shape: 'a single root whose child starts with the next server tag',
			name: 'RebuiltRootBranch',
			html: '<p><em>z</em><s>s</s></p><em>e</em>',
		},
		{
			shape: "a call that inherits its wrapper's range",
			name: 'InheritedRootBranch',
			html: '<p><em>z</em><s>s</s></p><em>e</em>',
		},
		{
			shape: 'the value of a renderable hole',
			name: 'RebuiltHoleValueBranch',
			html: '<p data-tag="p"><em>z</em><s>s</s></p><em>e</em>',
		},
		{
			shape: "a component's return value",
			name: 'ReturnBranch',
			html: '<p><em>z</em><s>s</s></p><em>e</em>',
		},
		{
			shape: 'a component that suspends before its template',
			name: 'SetupRootBranch',
			html: '<p>z</p><em>e</em>',
		},
		{
			shape: 'a component that suspends inside its template',
			name: 'InlineRootBranch',
			html: '<p>z</p><em>e</em>',
		},
		{
			shape: 'a component with hooks that suspends inside its template',
			name: 'StateInlineRootBranch',
			html: '<p data-tag="p">z</p><em>e</em>',
		},
		{
			shape: 'a lite component whose leading hole suspends',
			name: 'RebuiltHoleBranch',
			html: '<p><em>z</em><s>s</s></p><i>x</i><em>e</em>',
		},
		{
			shape: 'a component with hooks whose leading hole suspends',
			name: 'StateRebuiltHoleBranch',
			html: '<p><em>z</em><s>s</s></p><i>x</i><em>e</em>',
		},
		{
			shape: 'a fragment component that suspends before its template',
			name: 'SetupFirstBranch',
			html: '<u>z</u>x<em>e</em>',
		},
	])(
		'client-renders the island once for $shape, whether its data is ready or pending',
		async ({ name, html }) => {
			const ready = render(name, { server: true, leaf: fulfilled('unused') });
			await hydrate(name, { leaf: fulfilled('z') });
			expect(markup(section())).toBe(html);
			expectIslandFellBack(ready.outer, ready.island);
			root!.unmount();
			recoverable = [];
			errSpy.mockClear();

			const later = render(name, { server: true, leaf: fulfilled('unused') });
			const leaf = pending();
			await hydrate(name, { leaf: leaf.promise });
			await act(async () => leaf.resolve('z'));

			expect(markup(section())).toBe(html);
			expectIslandFellBack(later.outer, later.island);
		},
	);
});
