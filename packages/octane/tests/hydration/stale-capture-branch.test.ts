import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// When a Hydrate boundary's captures change before it activates, the server
// HTML predates the client's state. A @switch whose case changed builds the new
// case on the client and keeps the server siblings around it, without a
// hydration warning or onRecoverableError. With unchanged captures, a case the
// server did not render is still reported.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/stale-capture-branch.tsrx',
);
const FILE = 'stale-capture-branch.tsrx';
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

describe.each([
	{ name: 'development compile', dev: true },
	{ name: 'production compile', dev: false },
])('hydrateRoot — a @switch case changed before its boundary activated ($name)', ({ dev }) => {
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

	function pending(): { promise: Promise<string>; resolve: (value: string) => void } {
		let resolve!: (value: string) => void;
		const promise = new Promise<string>((done) => (resolve = done));
		return { promise, resolve };
	}

	async function hydrate(name: string, props: Record<string, unknown>) {
		root = hydrateRoot(container, client[name], props, {
			onRecoverableError: (error: unknown) => recoverable.push((error as Error).message),
		});
		flushSync(() => {});
		// Recoverable reports are delivered after the hydration burst.
		await act(async () => {});
	}

	it.each([
		{ k: 'b', html: '<em>e</em>' },
		{ k: 'c', html: '<b>c</b><em>e</em>' },
	])(
		'builds case $k over the adopted case a while the boundary is pending',
		async ({ k, html }) => {
			container.innerHTML = ServerRT.renderToString(server.Ranged, {
				server: true,
				k: 'a',
				leaf: Promise.resolve('x'),
			}).html;
			const section = container.querySelector('section')!;
			const em = container.querySelector('em');
			const leaf = pending();
			await hydrate('Ranged', { k: 'a', leaf: leaf.promise });
			expect(markup(section)).toBe('<u>z</u><em>e</em>');

			flushSync(() => root!.render(client.Ranged, { k, leaf: leaf.promise }));
			expect(markup(section)).toBe('<u>z</u><em>e</em>');
			await act(async () => leaf.resolve('x'));

			expect(container.querySelector('section')).toBe(section);
			expect(markup(section)).toBe(html);
			expect(container.querySelector('em')).toBe(em);
			expect(recoverable).toEqual([]);
			expect(warnings()).toEqual([]);

			// The slot keeps working as a client branch afterwards.
			flushSync(() => root!.render(client.Ranged, { k: 'a', leaf: leaf.promise }));
			expect(markup(section)).toBe('<u>x</u><em>e</em>');
			expect(container.querySelector('em')).toBe(em);
		},
	);

	it('builds the changed case over the server case when the boundary activates', async () => {
		container.innerHTML = ServerRT.renderToString(server.Dormant, { k: 'a' }).html;
		const section = container.querySelector('section')!;
		const em = container.querySelector('em');
		await hydrate('Dormant', { k: 'a' });
		expect(markup(section)).toBe('<u>z</u><em>e</em>');

		flushSync(() => root!.render(client.Dormant, { k: 'c' }));
		await act(async () => {});

		expect(container.querySelector('section')).toBe(section);
		expect(markup(section)).toBe('<b>c</b><em>e</em>');
		expect(container.querySelector('em')).toBe(em);
		expect(recoverable).toEqual([]);
		expect(warnings()).toEqual([]);
	});

	it('still reports a case the server did not render when the captures are unchanged', async () => {
		container.innerHTML = ServerRT.renderToString(server.Ranged, {
			server: true,
			k: 'a',
			leaf: Promise.resolve('x'),
		}).html;
		const section = container.querySelector('section')!;
		const em = container.querySelector('em');
		await hydrate('Ranged', { k: 'c', leaf: pending().promise });

		expect(markup(section)).toBe('<b>c</b><em>e</em>');
		expect(container.querySelector('em')).toBe(em);
		expect(recoverable).toEqual([expect.stringMatching(STRUCTURAL)]);
		expect(warnings()).toEqual(
			dev ? [expect.stringContaining('the client expected <b> but the server rendered <u>')] : [],
		);
	});
});
