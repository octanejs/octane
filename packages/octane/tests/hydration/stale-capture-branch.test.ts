import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// A Hydrate island is a hydration fallback boundary. When its captures change
// before it activates, the server HTML predates the client's state: a @switch
// whose case changed renders the island on the client, as React client-renders
// a dehydrated boundary it cannot hydrate with the props it now has, without a
// hydration warning or onRecoverableError. With unchanged captures, a case the
// server did not render is a mismatch: the island renders on the client and
// reports it once. Either way the server nodes outside the island stay.

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

const MISMATCH = /^Hydration failed because the server rendered HTML didn't match the client\./;

describe.each([
	{ name: 'development compile', dev: true },
	{ name: 'production compile', dev: false },
])('hydrateRoot — a @switch case changed before its island activated ($name)', ({ dev }) => {
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

	const section = () => container.querySelector('section')!;

	it.each([
		{ k: 'b', html: '<em>e</em>' },
		{ k: 'c', html: '<b>c</b><em>e</em>' },
	])(
		'renders the island on the client with case $k once the pending island resumes',
		async ({ k, html }) => {
			container.innerHTML = ServerRT.renderToString(server.Ranged, {
				server: true,
				k: 'a',
				leaf: Promise.resolve('x'),
			}).html;
			const outer = container.firstElementChild!;
			const serverSection = section();
			const em = container.querySelector('em')!;
			const leaf = pending();
			await hydrate('Ranged', { k: 'a', leaf: leaf.promise });
			expect(markup(serverSection)).toBe('<u>z</u><em>e</em>');

			// While the island is pending, the server HTML stays.
			flushSync(() => root!.render(client.Ranged, { k, leaf: leaf.promise }));
			expect(section()).toBe(serverSection);
			expect(markup(serverSection)).toBe('<u>z</u><em>e</em>');
			await act(async () => leaf.resolve('x'));

			expect(container.firstElementChild).toBe(outer);
			expect(serverSection.isConnected).toBe(false);
			expect(em.isConnected).toBe(false);
			expect(markup(section())).toBe(html);
			expect(recoverable).toEqual([]);
			expect(warnings()).toEqual([]);

			// The slot keeps working as a client branch afterwards.
			const live = section();
			const liveEm = container.querySelector('em');
			flushSync(() => root!.render(client.Ranged, { k: 'a', leaf: leaf.promise }));
			expect(section()).toBe(live);
			expect(markup(live)).toBe('<u>x</u><em>e</em>');
			expect(container.querySelector('em')).toBe(liveEm);
		},
	);

	it('renders a dormant island on the client with the changed case when it activates', async () => {
		container.innerHTML = ServerRT.renderToString(server.Dormant, { k: 'a' }).html;
		const outer = container.firstElementChild!;
		const serverSection = section();
		await hydrate('Dormant', { k: 'a' });
		expect(markup(serverSection)).toBe('<u>z</u><em>e</em>');

		flushSync(() => root!.render(client.Dormant, { k: 'c' }));
		await act(async () => {});

		expect(container.firstElementChild).toBe(outer);
		expect(serverSection.isConnected).toBe(false);
		expect(markup(section())).toBe('<b>c</b><em>e</em>');
		expect(recoverable).toEqual([]);
		expect(warnings()).toEqual([]);
	});

	it('renders the island on the client and reports a case the server did not render when the captures are unchanged', async () => {
		container.innerHTML = ServerRT.renderToString(server.Ranged, {
			server: true,
			k: 'a',
			leaf: Promise.resolve('x'),
		}).html;
		const outer = container.firstElementChild!;
		const serverSection = section();
		await hydrate('Ranged', { k: 'c', leaf: pending().promise });

		expect(container.firstElementChild).toBe(outer);
		expect(serverSection.isConnected).toBe(false);
		expect(markup(section())).toBe('<b>c</b><em>e</em>');
		expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
		expect(warnings()).toEqual(
			dev ? [expect.stringContaining('the client expected <b> but the server rendered <u>')] : [],
		);
	});
});
