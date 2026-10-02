import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { prerender } from 'octane/static';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// When a template's root does not match the server node at the cursor,
// hydration reports the structural mismatch and rebuilds that subtree on the
// client. The rebuilt root takes the place of the server node it replaced:
// server siblings that later client siblings adopt stay after it, the range
// that renders it owns it, and server output that nothing on the client claims
// is removed as part of the same recovery.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/rebuilt-clone-order.tsrx',
);
const FILE = 'rebuilt-clone-order.tsrx';
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

const STRUCTURAL = /the mismatched subtree was rebuilt on the client/;

/** The one dev diagnostic for a Leaf-shaped `<i>` rebuilt over the server `<b>`. */
function rebuiltLeaf(component: string): string {
	return (
		`Octane hydration mismatch at ${FILE}:${lineOf(`function ${component}(`) + 1}:1: the client ` +
		'expected <i> but the server rendered <b>. The mismatched subtree was rebuilt on the client.'
	);
}

describe.each([
	{ name: 'development compile', dev: true },
	{ name: 'production compile', dev: false },
])('hydrateRoot — position of a rebuilt template clone ($name)', ({ dev }) => {
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

	function expectOneRebuild(component: string): void {
		expect(recoverable).toEqual([expect.stringMatching(STRUCTURAL)]);
		expect(warnings()).toEqual(dev ? [rebuiltLeaf(component)] : []);
	}

	it('keeps an adopted server sibling after the rebuilt root', async () => {
		container.innerHTML = ServerRT.renderToString(server.SiblingBranch, { server: true }).html;
		const em = container.querySelector('em');
		await hydrate('SiblingBranch', {});

		expect(markup(container.firstElementChild!)).toBe('<i>ok</i><em>e</em>');
		expect(container.querySelector('em')).toBe(em);
		expectOneRebuild('Leaf');
	});

	it('removes server output after the rebuilt root that nothing claims', async () => {
		container.innerHTML = ServerRT.renderToString(server.TailBranch, { server: true }).html;
		await hydrate('TailBranch', {});

		expect(markup(container.firstElementChild!)).toBe('<i>ok</i>');
		expectOneRebuild('Leaf');
	});

	it('keeps server output after the rebuilt root that a later sibling adopts', async () => {
		container.innerHTML = ServerRT.renderToString(server.AdoptedTailBranch, { server: true }).html;
		const p = container.querySelector('p');
		await hydrate('AdoptedTailBranch', {});

		expect(markup(container.firstElementChild!)).toBe('<i>ok</i><p>p</p>');
		expect(container.querySelector('p')).toBe(p);
		expectOneRebuild('Leaf');
	});

	it('keeps an adopted renderable hole after the rebuilt root', async () => {
		container.innerHTML = ServerRT.renderToString(server.HoleBranch, {
			server: true,
			text: 'tail',
		}).html;
		await hydrate('HoleBranch', { text: 'tail' });

		expect(markup(container.firstElementChild!)).toBe('<i>ok</i>tail');
		expectOneRebuild('Leaf');
	});

	it('keeps the rebuilt root inside a @switch arm the server did not render', async () => {
		container.innerHTML = ServerRT.renderToString(server.SwitchBranch, {
			server: true,
			k: 'a',
		}).html;
		await hydrate('SwitchBranch', { k: 'a' });

		expect(markup(container.firstElementChild!)).toBe('<i>ok</i>');
		expectOneRebuild('Leaf');

		// The switch owns the rebuilt root, so another case replaces it.
		flushSync(() => root!.render(client.SwitchBranch, { k: 'b' }));
		expect(markup(container.firstElementChild!)).toBe('<u>z</u>');
		flushSync(() => root!.render(client.SwitchBranch, { k: 'a' }));
		expect(markup(container.firstElementChild!)).toBe('<i>ok</i>');
	});

	it('keeps an adopted server sibling after a @switch arm the server did not render', async () => {
		container.innerHTML = ServerRT.renderToString(server.SwitchSiblingBranch, {
			server: true,
			k: 'a',
		}).html;
		const em = container.querySelector('em');
		await hydrate('SwitchSiblingBranch', { k: 'a' });

		expect(markup(container.firstElementChild!)).toBe('<i>ok</i><em>e</em>');
		expect(container.querySelector('em')).toBe(em);
		expectOneRebuild('Leaf');

		flushSync(() => root!.render(client.SwitchSiblingBranch, { k: 'b' }));
		expect(markup(container.firstElementChild!)).toBe('<u>z</u><em>e</em>');
		expect(container.querySelector('em')).toBe(em);
	});

	it('resumes a suspended boundary without rebuilding the adopted sibling again', async () => {
		const html = (
			await prerender(server.SeedBranch, {
				server: true,
				leaf: Promise.resolve('server leaf'),
				sibling: Promise.resolve('server sibling'),
			})
		).html;
		container.innerHTML = html;
		const em = container.querySelector('em');
		let resolveLeaf!: (value: string) => void;
		const leaf = new Promise<string>((resolve) => (resolveLeaf = resolve));
		await hydrate('SeedBranch', { leaf, sibling: new Promise(() => {}) });
		expect(container.querySelector('em')).toBe(em);

		await act(async () => resolveLeaf('client leaf'));

		expect(markup(container.firstElementChild!)).toBe(
			'<i><s>client leaf</s>ok</i><em>server sibling</em>',
		);
		expect(container.querySelector('em')).toBe(em);
		expectOneRebuild('ReaderLeaf');
	});
	it('resumes a @switch arm that adopted the server node in place before suspending', async () => {
		container.innerHTML = (
			await prerender(server.AdoptedSwitchSeedBranch, {
				server: true,
				k: 'a',
				leaf: Promise.resolve('unused'),
				sibling: Promise.resolve('sibling'),
			})
		).html;
		const u = container.querySelector('u');
		let resolveLeaf!: (value: string) => void;
		const leaf = new Promise<string>((resolve) => (resolveLeaf = resolve));
		// The server seed settles this reader during hydration.
		const sibling = new Promise<string>(() => {});
		await hydrate('AdoptedSwitchSeedBranch', { k: 'a', leaf, sibling });
		await act(async () => resolveLeaf('z'));

		expect(markup(container.firstElementChild!)).toBe('<em>sibling</em><u>z</u><em>e</em>');
		expect(container.querySelector('u')).toBe(u);
		expect(recoverable).toEqual([]);
		expect(warnings()).toEqual([]);

		// The switch owns the adopted `<u>`, so leaving the case removes it.
		flushSync(() => root!.render(client.AdoptedSwitchSeedBranch, { k: 'b', leaf, sibling }));
		expect(markup(container.firstElementChild!)).toBe('<em>sibling</em><em>e</em>');
	});
	it('retries a deferred @switch arm that adopted the server node in place before suspending', async () => {
		container.innerHTML = ServerRT.renderToString(server.DeferredSwitchBranch, {
			server: true,
			k: 'a',
			leaf: Promise.resolve('unused'),
		}).html;
		const section = container.querySelector('section')!;
		const u = container.querySelector('u');
		const em = container.querySelector('em');
		let resolveLeaf!: (value: string) => void;
		const leaf = new Promise<string>((resolve) => (resolveLeaf = resolve));
		await hydrate('DeferredSwitchBranch', { k: 'a', leaf });
		await act(async () => resolveLeaf('z'));

		expect(markup(section)).toBe('<u>z</u><em>e</em>');
		expect(container.querySelector('u')).toBe(u);
		expect(container.querySelector('em')).toBe(em);
		expect(recoverable).toEqual([]);
		expect(warnings()).toEqual([]);

		// The switch owns the adopted `<u>`, so leaving the case removes it.
		flushSync(() => root!.render(client.DeferredSwitchBranch, { k: 'b', leaf }));
		expect(markup(section)).toBe('<em>e</em>');
	});
	it.each([
		{ k: 'b', html: '<em>e</em>' },
		{ k: 'c', html: '<b>c</b><em>e</em>' },
	])(
		'replaces a pending deferred @switch arm that adopted the server node when the case changes to $k',
		async ({ k, html }) => {
			container.innerHTML = ServerRT.renderToString(server.DeferredSwitchBranch, {
				server: true,
				k: 'a',
				leaf: Promise.resolve('unused'),
			}).html;
			const section = container.querySelector('section')!;
			const em = container.querySelector('em');
			let resolveLeaf!: (value: string) => void;
			const leaf = new Promise<string>((resolve) => (resolveLeaf = resolve));
			await hydrate('DeferredSwitchBranch', { k: 'a', leaf });
			flushSync(() => root!.render(client.DeferredSwitchBranch, { k, leaf }));
			await act(async () => resolveLeaf('z'));

			expect(markup(section)).toBe(html);
			expect(container.querySelector('em')).toBe(em);
			expect(recoverable).toEqual([]);
			expect(warnings()).toEqual([]);
		},
	);
});
