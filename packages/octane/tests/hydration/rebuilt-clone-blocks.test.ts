import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { prerender } from 'octane/static';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// When a template's root does not match the server node at the cursor,
// hydration reports the structural mismatch and rebuilds that subtree on the
// client. A block inside the rebuilt subtree has no server range of its own,
// and the cursor still points at server output after the mismatch, so the
// block must mount as client DOM: it must not report a second mismatch for the
// same recovery or claim that server output. A block mismatch inside an
// adopted server element still reports.

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

const STRUCTURAL = /the mismatched subtree was rebuilt on the client/;

/** The one diagnostic a rebuilt leaf reports: its `<i>` against the server `<b>`. */
function rebuilt(leaf: string): string {
	return (
		`Octane hydration mismatch at ${FILE}:${lineOf(`function ${leaf}(`) + 1}:1: the client ` +
		'expected <i> but the server rendered <b>. The mismatched subtree was rebuilt on the client.'
	);
}

describe.each([
	{ name: 'development compile', dev: true },
	{ name: 'production compile', dev: false },
])('hydrateRoot — blocks in a rebuilt template clone ($name)', ({ dev }) => {
	const server = loadServerFixture(FIXTURE, { id: FILE });
	const client = loadCompiledFixtureSource(SOURCE, {
		id: FILE,
		mode: 'client',
		compileOptions: { dev },
	});
	let container: HTMLElement;
	let root: { unmount(): void } | null;
	let errSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
		root = null;
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

	async function hydrate(
		name: string,
		serverProps: Record<string, unknown>,
		clientProps: Record<string, unknown>,
	): Promise<string[]> {
		container.innerHTML = ServerRT.renderToString(server[name], serverProps).html;
		const recoverable: string[] = [];
		root = hydrateRoot(container, client[name], clientProps, {
			onRecoverableError: (error: unknown) => recoverable.push((error as Error).message),
		});
		flushSync(() => {});
		// Recoverable reports are delivered after the hydration burst.
		await act(async () => {});
		return recoverable;
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
	])('reports only the structural rebuild of $block', async ({ name, leaf, props = {}, html }) => {
		const recoverable = await hydrate(name, { ...props, server: true }, props);

		expect(markup(container.firstElementChild!)).toBe(html);
		expect(recoverable).toEqual([expect.stringMatching(STRUCTURAL)]);
		expect(warnings()).toEqual(dev ? [rebuilt(leaf)] : []);
	});

	it.each([
		{ output: 'element', name: 'ForeignNodeBranch', leaf: 'IfLeaf', html: '<s>c</s>ok' },
		{
			output: 'list range',
			name: 'ForeignListBranch',
			leaf: 'ForLeaf',
			html: '<s>x</s><s>y</s>ok',
		},
	])(
		'does not claim a server $output that follows the rebuilt clone',
		async ({ name, leaf, html }) => {
			const recoverable = await hydrate(name, { server: true }, {});

			expect(markup(container.querySelector('i')!)).toBe(html);
			expect(recoverable).toEqual([expect.stringMatching(STRUCTURAL)]);
			expect(warnings()).toEqual(dev ? [rebuilt(leaf)] : []);
		},
	);

	it('still adopts a server sibling that follows the rebuilt clone', async () => {
		container.innerHTML = ServerRT.renderToString(server.SiblingBranch, { server: true }).html;
		const em = container.querySelector('em')!;
		const recoverable: string[] = [];
		root = hydrateRoot(
			container,
			client.SiblingBranch,
			{},
			{
				onRecoverableError: (error: unknown) => recoverable.push((error as Error).message),
			},
		);
		flushSync(() => {});
		await act(async () => {});

		expect(container.querySelector('em')).toBe(em);
		expect(markup(container.querySelector('i')!)).toBe('<s>c</s>ok');
		expect(recoverable).toEqual([expect.stringMatching(STRUCTURAL)]);
		expect(warnings()).toEqual(dev ? [rebuilt('IfLeaf')] : []);
	});

	it('mounts live components in the rebuilt clone and adopts the server component after it', async () => {
		const props = { k: 'a', tag: 'mark', step: 0 };
		container.innerHTML = ServerRT.renderToString(server.ComponentBranch, {
			...props,
			server: true,
		}).html;
		const after = container.querySelector<HTMLButtonElement>('button.after')!;
		const afterLabel = container.querySelector('small.after')!;
		const recoverable: string[] = [];
		const hydrated = hydrateRoot(container, client.ComponentBranch, props, {
			onRecoverableError: (error: unknown) => recoverable.push((error as Error).message),
		});
		root = hydrated;
		flushSync(() => {});
		await act(async () => {});

		expect(markup(container.firstElementChild!)).toBe(
			'<i><button class="inner">inner:0</button><small class="inner">inner</small>' +
				'<button class="keyed">keyed:0</button><mark class="tag">step:0</mark>' +
				'<strong class="badge">badge:0</strong>ok</i>' +
				'<button class="after">after:0</button><small class="after">after</small>',
		);
		expect(container.querySelector('button.after')).toBe(after);
		expect(container.querySelector('small.after')).toBe(afterLabel);
		expect(recoverable).toEqual([expect.stringMatching(STRUCTURAL)]);
		expect(warnings()).toEqual(dev ? [rebuilt('ComponentLeaf')] : []);

		const inner = container.querySelector<HTMLButtonElement>('button.inner')!;
		const keyed = container.querySelector<HTMLButtonElement>('button.keyed')!;
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
		flushSync(() => hydrated.render(client.ComponentBranch, { ...props, step: 1 }));
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
		flushSync(() => hydrated.render(client.ComponentBranch, { ...props, k: 'b', step: 1 }));
		expect(keyed.isConnected).toBe(false);
		expect(container.querySelector('button.keyed')!.textContent).toBe('keyed:0');
		expect([inner, after].map((button) => button.textContent)).toEqual(['inner:1', 'after:1']);
	});

	it("does not read a server sibling's use() seed in a rebuilt block", async () => {
		container.innerHTML = (
			await prerender(server.SeedBranch, {
				server: true,
				leaf: Promise.resolve('server leaf'),
				sibling: Promise.resolve('server sibling'),
			})
		).html;
		let resolveLeaf!: (value: string) => void;
		const leaf = new Promise<string>((resolve) => (resolveLeaf = resolve));
		root = hydrateRoot(container, client.SeedBranch, { leaf, sibling: new Promise(() => {}) });
		flushSync(() => {});
		await act(async () => {});
		await act(async () => resolveLeaf('client leaf'));

		expect(markup(container.querySelector('i')!)).toBe('<s>client leaf</s>ok');
	});

	it.each([
		{
			block: 'an @if arm',
			name: 'IfLabel',
			serverProps: { on: false },
			clientProps: { on: true },
			html: '<i><s>c</s>ok</i>',
			diagnostic: 'the client expected <s> but the server rendered the end of the parent block',
		},
		{
			block: 'a @for item',
			name: 'ListLabel',
			serverProps: { items: ['x'] },
			clientProps: { items: ['x', 'y'] },
			html: '<i><s>x</s><s>y</s>ok</i>',
			diagnostic: 'the client expected another list item but the server rendered nothing',
		},
	])(
		'still reports $block that differs inside an adopted element',
		async ({ name, serverProps, clientProps, html, diagnostic }) => {
			container.innerHTML = ServerRT.renderToString(server[name], serverProps).html;
			const adopted = container.querySelector('i')!;
			const recoverable: string[] = [];
			root = hydrateRoot(container, client[name], clientProps, {
				onRecoverableError: (error: unknown) => recoverable.push((error as Error).message),
			});
			flushSync(() => {});
			await act(async () => {});

			expect(container.querySelector('i')).toBe(adopted);
			expect(markup(container.firstElementChild!)).toBe(html);
			expect(recoverable).toEqual([expect.stringMatching(STRUCTURAL)]);
			expect(warnings()).toEqual(dev ? [expect.stringContaining(diagnostic)] : []);
		},
	);
});
