import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// The server rendered `<b>` where the client renders a `<u>` whose content
// suspends. The server HTML does not match the client, so, as in React 19, the
// nearest fallback owner (a <Hydrate> island, an `@try` arm, or else the root)
// discards its server DOM and renders on the client, reporting once. The
// client render completes when the data arrives, and the host outside an
// island or arm keeps its server node.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/rebuilt-clone-suspended.tsrx',
);
const FILE = 'rebuilt-clone-suspended.tsrx';
const SOURCE = readFileSync(FIXTURE, 'utf8');
const HYDRATION_FAILED =
	/^Hydration failed because the server rendered HTML didn't match the client/;

/** Element and text markup, ignoring hydration comments. */
function markup(node: Element): string {
	const copy = node.cloneNode(true) as Element;
	const walker = document.createTreeWalker(copy, NodeFilter.SHOW_COMMENT);
	const comments: Node[] = [];
	while (walker.nextNode()) comments.push(walker.currentNode);
	for (const comment of comments) comment.parentNode!.removeChild(comment);
	return copy.innerHTML;
}

const SERVER_SECTION = '<b class="server">server</b><em>e</em>';
// Each switch renders in a different fallback owner: an island, an `@try`
// arm, and the root.
const SWITCHES = [
	{ name: 'DeferredSwitchBranch', owner: 'island' },
	{ name: 'TrySwitchBranch', owner: '@try arm' },
	{ name: 'RootSwitchBranch', owner: 'root' },
];

describe.each([
	{ name: 'development compile', dev: true },
	{ name: 'production compile', dev: false },
])('hydrateRoot — a mismatched template clone that suspends ($name)', ({ dev }) => {
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

	async function hydrate(name: string, clientProps: Record<string, unknown>) {
		root = hydrateRoot(container, client[name], clientProps, {
			onRecoverableError: (error: unknown) => recoverable.push((error as Error).message),
		});
		flushSync(() => {});
		// Recoverable reports are delivered after the hydration burst.
		await act(async () => {});
	}

	/**
	 * One report for the owner that fell back. A development compile may add
	 * one warning that locates the mismatch; a production compile adds none.
	 */
	function expectReportedOnce(): void {
		expect(recoverable).toEqual([expect.stringMatching(HYDRATION_FAILED)]);
		const logged = warnings();
		expect(logged.length).toBeLessThanOrEqual(dev ? 1 : 0);
		for (const message of logged)
			expect(message).toMatch(new RegExp(`^Octane hydration mismatch at ${FILE}:\\d+:\\d+: `));
	}

	function pending(): { promise: Promise<string>; resolve: (value: string) => void } {
		let resolve!: (value: string) => void;
		const promise = new Promise<string>((done) => (resolve = done));
		return { promise, resolve };
	}

	/** The server render: its outermost element, and the section's elements. */
	function serverRender(name: string) {
		container.innerHTML = ServerRT.renderToString(server[name], {
			server: true,
			k: 'a',
			leaf: Promise.resolve('unused'),
		}).html;
		const content = section();
		return {
			outer: container.firstElementChild!,
			serverNodes: [content, ...content.querySelectorAll('*')],
		};
	}

	function expectDiscarded(nodes: Element[]): void {
		expect(nodes.filter((node) => node.isConnected).map((node) => node.outerHTML)).toEqual([]);
	}

	it.each(SWITCHES)(
		'$name: client-renders the $owner once the mismatched @switch arm resumes',
		async ({ name, owner }) => {
			const { outer, serverNodes } = serverRender(name);
			const leaf = pending();
			await hydrate(name, { k: 'a', leaf: leaf.promise });

			await act(async () => leaf.resolve('z'));

			expect(markup(section())).toBe('<u>z</u><em>e</em>');
			expectDiscarded(serverNodes);
			// An island or arm is the fallback owner: the host around it stays.
			if (owner !== 'root') expect(container.firstElementChild).toBe(outer);
			expectReportedOnce();

			// The switch owns the `<u>`, so leaving the case removes it.
			const em = container.querySelector('em');
			flushSync(() => root!.render(client[name], { k: 'b', leaf: leaf.promise }));
			expect(markup(section())).toBe('<em>e</em>');
			expect(container.querySelector('em')).toBe(em);
			flushSync(() => root!.render(client[name], { k: 'c', leaf: leaf.promise }));
			expect(markup(section())).toBe('<i>c</i><em>e</em>');
			expect(container.querySelector('em')).toBe(em);
			expect(recoverable).toHaveLength(1);
		},
	);

	// React does not commit a root's client render while it is suspended, so
	// the server HTML stays on screen until the data arrives.
	it('keeps the server HTML on screen while the root’s client render is pending', async () => {
		const { serverNodes } = serverRender('RootSwitchBranch');
		const leaf = pending();
		await hydrate('RootSwitchBranch', { k: 'a', leaf: leaf.promise });

		expect(serverNodes.filter((node) => !node.isConnected)).toEqual([]);
		expect(markup(section())).toBe(SERVER_SECTION);

		await act(async () => leaf.resolve('z'));
		expect(markup(section())).toBe('<u>z</u><em>e</em>');
	});

	// The island's client render no longer suspends once the case changes.
	it.each([
		{ k: 'b', html: '<em>e</em>' },
		{ k: 'c', html: '<i>c</i><em>e</em>' },
	])(
		'renders case $k when it changes while the island’s client render is suspended',
		async ({ k, html }) => {
			const { outer, serverNodes } = serverRender('DeferredSwitchBranch');
			const leaf = pending();
			await hydrate('DeferredSwitchBranch', { k: 'a', leaf: leaf.promise });
			await act(async () => root!.render(client.DeferredSwitchBranch, { k, leaf: leaf.promise }));

			expect(markup(section())).toBe(html);
			expectDiscarded(serverNodes);
			expect(container.firstElementChild).toBe(outer);

			await act(async () => leaf.resolve('z'));
			expect(markup(section())).toBe(html);
			expectReportedOnce();
		},
	);

	const COMPONENTS = [
		{ shape: 'where the server rendered another element', name: 'DeferredComponentBranch' },
		{ shape: "over another component's range", name: 'DeferredRangeBranch' },
	];

	it.each(COMPONENTS)(
		'client-renders the island once a component that suspends $shape resolves',
		async ({ name }) => {
			const { outer, serverNodes } = serverRender(name);
			const leaf = pending();
			await hydrate(name, { leaf: leaf.promise });

			await act(async () => leaf.resolve('z'));

			expect(markup(section())).toBe('<u>z</u><em>e</em>');
			expectDiscarded(serverNodes);
			expect(container.firstElementChild).toBe(outer);
			expectReportedOnce();
		},
	);

	// The component suspends before it renders a host that could mismatch, so,
	// as in React, the island's server HTML stays on screen, and nothing is
	// reported, until the data arrives.
	it.each(COMPONENTS)(
		'keeps the island’s server HTML while a component that suspends $shape is pending',
		async ({ name }) => {
			const { serverNodes } = serverRender(name);
			const html = markup(section());
			const leaf = pending();
			await hydrate(name, { leaf: leaf.promise });

			expect(serverNodes.filter((node) => !node.isConnected)).toEqual([]);
			expect(markup(section())).toBe(html);
			expect(recoverable).toEqual([]);

			await act(async () => leaf.resolve('z'));
			expect(recoverable).toHaveLength(1);
		},
	);

	it('client-renders the root for a Hydrate wrapper where the server rendered another element', async () => {
		const { serverNodes } = serverRender('HydrateWrapperBranch');
		await hydrate('HydrateWrapperBranch', {});

		const wrapper = section().firstElementChild!;
		expect(wrapper.localName).toBe('div');
		expect(markup(wrapper)).toBe('<i>ok</i>');
		expect(markup(wrapper.nextElementSibling!)).toBe('e');
		expect(section().children).toHaveLength(2);
		expectDiscarded(serverNodes);
		expectReportedOnce();
	});
});
