import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// When a template's root does not match the server node at the cursor,
// hydration rebuilds that subtree on the client. When the rebuilt subtree
// suspends before it commits, the server node stays on screen, and the attempt
// that completes finds the same server DOM: its root replaces that node, and
// the server siblings after it are still there for later client siblings to
// adopt. The mismatch is reported once.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/rebuilt-clone-suspended.tsrx',
);
const FILE = 'rebuilt-clone-suspended.tsrx';
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

const STRUCTURAL = /the mismatched subtree was rebuilt on the client/;
const SERVER_SECTION = '<b class="server">server</b><em>e</em>';
const SWITCHES = ['DeferredSwitchBranch', 'TrySwitchBranch', 'RootSwitchBranch'];

describe.each([
	{ name: 'development compile', dev: true },
	{ name: 'production compile', dev: false },
])('hydrateRoot — a rebuilt template clone that suspends ($name)', ({ dev }) => {
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

	async function hydrate(name: string, clientProps: Record<string, unknown>) {
		root = hydrateRoot(container, client[name], clientProps, {
			onRecoverableError: (error: unknown) => recoverable.push((error as Error).message),
		});
		flushSync(() => {});
		// Recoverable reports are delivered after the hydration burst.
		await act(async () => {});
	}

	/** One report of the `<u>` rebuilt over the server's `serverTag`. */
	function expectOneRebuild(serverTag = 'b'): void {
		expect(recoverable).toEqual([expect.stringMatching(STRUCTURAL)]);
		expect(warnings()).toEqual(
			dev
				? [
						expect.stringContaining(
							`the client expected <u> but the server rendered <${serverTag}>`,
						),
					]
				: [],
		);
	}

	function pending(): { promise: Promise<string>; resolve: (value: string) => void } {
		let resolve!: (value: string) => void;
		const promise = new Promise<string>((done) => (resolve = done));
		return { promise, resolve };
	}

	function serverRender(name: string): void {
		container.innerHTML = ServerRT.renderToString(server[name], {
			server: true,
			k: 'a',
			leaf: Promise.resolve('unused'),
		}).html;
	}

	it.each(SWITCHES)(
		'%s: keeps the adopted server sibling when the rebuilt @switch arm resumes',
		async (name) => {
			serverRender(name);
			const section = container.querySelector('section')!;
			const em = container.querySelector('em');
			const leaf = pending();
			await hydrate(name, { k: 'a', leaf: leaf.promise });
			expect(markup(section)).toBe(SERVER_SECTION);
			expect(container.querySelector('em')).toBe(em);

			await act(async () => leaf.resolve('z'));

			expect(container.querySelector('section')).toBe(section);
			expect(markup(section)).toBe('<u>z</u><em>e</em>');
			expect(container.querySelector('em')).toBe(em);
			expectOneRebuild();

			// The switch owns the rebuilt `<u>`, so leaving the case removes it.
			flushSync(() => root!.render(client[name], { k: 'b', leaf: leaf.promise }));
			expect(markup(section)).toBe('<em>e</em>');
			expect(container.querySelector('em')).toBe(em);
			flushSync(() => root!.render(client[name], { k: 'c', leaf: leaf.promise }));
			expect(markup(section)).toBe('<i>c</i><em>e</em>');
			expect(container.querySelector('em')).toBe(em);
		},
	);

	// The deferred boundary's suspended arm keeps its blocks, so the case change
	// replaces the arm that had already taken the server node's place.
	it.each([
		{ k: 'b', html: '<em>e</em>' },
		{ k: 'c', html: '<i>c</i><em>e</em>' },
	])(
		'replaces the server node with case $k when it changes before the deferred arm resumes',
		async ({ k, html }) => {
			serverRender('DeferredSwitchBranch');
			const section = container.querySelector('section')!;
			const em = container.querySelector('em');
			const leaf = pending();
			await hydrate('DeferredSwitchBranch', { k: 'a', leaf: leaf.promise });
			flushSync(() => root!.render(client.DeferredSwitchBranch, { k, leaf: leaf.promise }));
			expect(markup(section)).toBe(SERVER_SECTION);
			await act(async () => leaf.resolve('z'));

			expect(markup(section)).toBe(html);
			expect(container.querySelector('em')).toBe(em);
			expect(recoverable).toEqual([expect.stringMatching(STRUCTURAL)]);
		},
	);

	it('keeps the adopted server sibling when a rebuilt component root resumes', async () => {
		serverRender('DeferredComponentBranch');
		const section = container.querySelector('section')!;
		const em = container.querySelector('em');
		const leaf = pending();
		await hydrate('DeferredComponentBranch', { leaf: leaf.promise });
		expect(markup(section)).toBe(SERVER_SECTION);

		await act(async () => leaf.resolve('z'));

		expect(markup(section)).toBe('<u>z</u><em>e</em>');
		expect(container.querySelector('em')).toBe(em);
		expectOneRebuild();
	});

	it("keeps the adopted server sibling when a root rebuilt over another component's range resumes", async () => {
		serverRender('DeferredRangeBranch');
		const section = container.querySelector('section')!;
		const em = container.querySelector('em');
		const leaf = pending();
		await hydrate('DeferredRangeBranch', { leaf: leaf.promise });
		expect(markup(section)).toBe('<p>p</p><em>e</em>');

		await act(async () => leaf.resolve('z'));

		expect(markup(section)).toBe('<u>z</u><em>e</em>');
		expect(container.querySelector('em')).toBe(em);
		expectOneRebuild('p');
	});

	it('replaces the server node with a rebuilt Hydrate wrapper', async () => {
		serverRender('HydrateWrapperBranch');
		const section = container.querySelector('section')!;
		const em = container.querySelector('em');
		await hydrate('HydrateWrapperBranch', {});

		const wrapper = section.firstElementChild!;
		expect(wrapper.localName).toBe('div');
		expect(markup(wrapper)).toBe('<i>ok</i>');
		expect(wrapper.nextElementSibling).toBe(em);
		expect(section.children).toHaveLength(2);
		expect(recoverable).toEqual([expect.stringMatching(STRUCTURAL)]);
	});
});
