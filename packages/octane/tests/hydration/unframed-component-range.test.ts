import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// The server rendered other content where a client component call renders.
// The server HTML does not match the client, so, as in React 19, the nearest
// fallback owner discards its server DOM and renders on the client, reporting
// once: a <Hydrate> island when one encloses the call, otherwise the root.
// Everything outside the island keeps its server nodes.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/unframed-component-range.tsrx',
);
const FILE = 'unframed-component-range.tsrx';
const SOURCE = readFileSync(FIXTURE, 'utf8');
const HYDRATION_FAILED =
	/^Hydration failed because the server rendered HTML didn't match the client/;

/** Element and text markup, ignoring hydration comments and boundary attributes. */
function markup(node: Element): string {
	const copy = node.cloneNode(true) as Element;
	const walker = document.createTreeWalker(copy, NodeFilter.SHOW_COMMENT);
	const comments: Node[] = [];
	while (walker.nextNode()) comments.push(walker.currentNode);
	for (const comment of comments) comment.parentNode!.removeChild(comment);
	for (const element of copy.querySelectorAll('[data-octane-hydrate-id]'))
		for (const { name } of Array.from(element.attributes)) element.removeAttribute(name);
	return copy.innerHTML;
}

describe.each([
	{ name: 'development compile', dev: true },
	{ name: 'production compile', dev: false },
])('hydrateRoot — a component call where the server rendered other content ($name)', ({ dev }) => {
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

	/**
	 * Server-render `name`'s server arm, then hydrate the client's arm with a
	 * pending `leaf`. `settle` resolves it.
	 */
	async function hydrate(name: string, props: Record<string, unknown> = { server: true }) {
		container.innerHTML = ServerRT.renderToString(server[name], {
			...props,
			leaf: Promise.resolve('unused'),
		}).html;
		const outer = container.firstElementChild!;
		const section = container.querySelector('section')!;
		const nodes = Array.from(section.children);
		const content = [section, ...section.querySelectorAll('*')];
		let resolve!: (value: string) => void;
		const leaf = new Promise<string>((done) => (resolve = done));
		const recoverable: unknown[] = [];
		root = hydrateRoot(
			container,
			client[name],
			{ leaf },
			{ onRecoverableError: (error: unknown) => recoverable.push(error) },
		);
		flushSync(() => {});
		// Recoverable reports are delivered after the hydration burst.
		await act(async () => {});
		const settle = () =>
			act(async () => {
				resolve('z');
				await leaf;
			});
		return { outer, section, nodes, content, recoverable, settle };
	}

	/**
	 * Exactly one recoverable report. A development compile may add one warning
	 * that locates the mismatch; a production compile adds none.
	 */
	function expectReportedOnce(recoverable: unknown[]): void {
		expect(recoverable).toHaveLength(1);
		expect((recoverable[0] as Error).message).toMatch(HYDRATION_FAILED);
		const logged = warnings();
		expect(logged.length).toBeLessThanOrEqual(dev ? 1 : 0);
		for (const message of logged)
			expect(message).toMatch(new RegExp(`^Octane hydration mismatch at ${FILE}:\\d+:\\d+: `));
	}

	const SUSPENDING = [
		{ shape: 'under a <Hydrate> island', name: 'FragBranch', island: true },
		{ shape: 'whose child suspends, under an island', name: 'FragChildBranch', island: true },
		{ shape: 'over another component’s range, under an island', name: 'RangeBranch', island: true },
		{ shape: 'in the root', name: 'FragRoot', island: false },
	];

	it.each(SUSPENDING)(
		'client-renders the owner once a component that suspends $shape resolves',
		async ({ name, island }) => {
			const { outer, content, recoverable, settle } = await hydrate(name);

			await settle();
			expect(markup(container.querySelector('section')!)).toBe('<u>z</u><i>x</i><em>e</em>');
			for (const node of content) expect(node.isConnected).toBe(false);
			// An island is the fallback owner: the host around it keeps its server node.
			expect(outer.isConnected).toBe(island);
			expectReportedOnce(recoverable);
		},
	);

	// React suspends in the component before it reaches a host that could
	// mismatch, so the server HTML stays on screen, and nothing is reported,
	// until the data arrives and the retry finds the mismatch.
	it.each(SUSPENDING)(
		'keeps the server content while a component that suspends $shape is pending',
		async ({ name }) => {
			const { section, nodes, recoverable, settle } = await hydrate(name);

			expect(container.querySelector('section')).toBe(section);
			expect(Array.from(section.children)).toEqual(nodes);
			expect(recoverable).toEqual([]);
			expect(warnings()).toEqual([]);

			await settle();
			expect(recoverable).toHaveLength(1);
		},
	);

	it.each([
		{
			shape: 'a nested <Hydrate> island, under an island',
			name: 'HydrateBranch',
			html: '<div><i>ok</i></div><em>e</em>',
			island: true,
		},
		{
			shape: 'a fragment component',
			name: 'PairBranch',
			html: '<u>u</u><i>x</i><em>e</em>',
			island: false,
		},
		{
			shape: 'a component before a caught @try',
			name: 'CaughtBranch',
			html: '<u>u</u><i>x</i><s>boom</s>',
			island: false,
		},
		// The static range's content exists only in the server HTML: a client
		// render of `<Hydrate split={false} when={never()}>` renders no children
		// (docs/deferred-hydration.md), so the root's fallback drops it.
		{
			shape: 'a component before a <Hydrate> that never hydrates',
			name: 'StaticBranch',
			html: '<u>u</u><i>x</i>',
			island: false,
		},
		{
			shape: 'a component where the server’s arm continues',
			name: 'TailBranch',
			html: '<u>u</u><i>x</i>',
			island: false,
		},
	])('client-renders the owner of $shape', async ({ name, html, island }) => {
		const { outer, content, recoverable } = await hydrate(name);

		expect(markup(container.querySelector('section')!)).toBe(html);
		for (const node of content) expect(node.isConnected).toBe(false);
		expect(outer.isConnected).toBe(island);
		expectReportedOnce(recoverable);
	});

	it('adopts every node when the server rendered the same arm', async () => {
		const { section, nodes, recoverable } = await hydrate('PairBranch', {});

		expect(markup(section)).toBe('<u>u</u><i>x</i><em>e</em>');
		expect(section.children).toHaveLength(nodes.length);
		nodes.forEach((node, index) => expect(section.children[index]).toBe(node));
		expect(recoverable).toEqual([]);
		expect(warnings()).toEqual([]);
	});
});
