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
// Everything outside the island keeps its server nodes. Where the server's
// elements are exactly what the call renders, the call adopts them, whether
// or not it suspended first.

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
		expectDiagnosedOnce();
	}

	/** A development compile may add one warning that locates the mismatch. */
	function expectDiagnosedOnce(): void {
		const logged = warnings();
		expect(logged.length).toBeLessThanOrEqual(dev ? 1 : 0);
		for (const message of logged)
			expect(message).toMatch(new RegExp(`^Octane hydration mismatch at ${FILE}:\\d+:\\d+: `));
	}

	const FRAG = '<u>z</u><i>x</i><em>e</em>';
	const SUSPENDING = [
		{ shape: 'under a <Hydrate> island', name: 'FragBranch', html: FRAG, island: true },
		{
			shape: 'whose child suspends, under an island',
			name: 'FragChildBranch',
			html: FRAG,
			island: true,
		},
		{
			shape: 'over another component’s range, under an island',
			name: 'RangeBranch',
			html: FRAG,
			island: true,
		},
		{ shape: 'in the root', name: 'FragRoot', html: FRAG, island: false },
		{
			shape: 'where the server rendered nothing, under an island',
			name: 'EmptyBranch',
			html: '<u>z</u><i>x</i>',
			island: true,
		},
		// The call before it adopted the server's last element.
		{
			shape: 'after the server’s last element, under an island',
			name: 'LateBranch',
			html: '<b>a</b><p>z</p>',
			island: true,
		},
	];

	it.each(SUSPENDING)(
		'client-renders the owner once a component that suspends $shape resolves',
		async ({ name, html, island }) => {
			const { outer, content, recoverable, settle } = await hydrate(name);

			await settle();
			expect(markup(container.querySelector('section')!)).toBe(html);
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

	// The server rendered exactly the elements the component renders once its
	// data arrives. React's retry hydrates them, as a render that never
	// suspended would: nothing is replaced or reported.
	it.each([
		{ shape: 'under a <Hydrate> island', name: 'MatchBranch' },
		{ shape: 'whose child suspends, under an island', name: 'MatchChildBranch' },
		{ shape: 'in the root', name: 'MatchRoot' },
	])(
		'adopts the server elements of a component that suspends $shape once it resolves',
		async ({ name }) => {
			const { section, nodes, recoverable, settle } = await hydrate(name);

			await settle();
			expect(container.querySelector('section')).toBe(section);
			expect(markup(section)).toBe(FRAG);
			expect(section.children).toHaveLength(nodes.length);
			nodes.forEach((node, index) => expect(section.children[index]).toBe(node));
			expect(recoverable).toEqual([]);
			expect(warnings()).toEqual([]);
		},
	);

	// The component around the call suspends first, inside its own server
	// range, and the call suspends only once the island retries.
	it('adopts the server elements of a component that suspends after the island resumed', async () => {
		container.innerHTML = ServerRT.renderToString(server.GateBranch, {
			server: true,
			gate: Promise.resolve('unused'),
			leaf: Promise.resolve('unused'),
		}).html;
		const section = container.querySelector('section')!;
		const nodes = Array.from(section.children);
		let open!: (value: string) => void;
		let resolve!: (value: string) => void;
		const gate = new Promise<string>((done) => (open = done));
		const leaf = new Promise<string>((done) => (resolve = done));
		const recoverable: unknown[] = [];
		root = hydrateRoot(
			container,
			client.GateBranch,
			{ gate, leaf },
			{ onRecoverableError: (error: unknown) => recoverable.push(error) },
		);
		flushSync(() => {});
		await act(async () => {
			open('y');
			await gate;
		});
		await act(async () => {
			resolve('z');
			await leaf;
		});

		expect(container.querySelector('section')).toBe(section);
		expect(markup(section)).toBe(FRAG);
		expect(section.children).toHaveLength(nodes.length);
		nodes.forEach((node, index) => expect(section.children[index]).toBe(node));
		expect(recoverable).toEqual([]);
		expect(warnings()).toEqual([]);
	});

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
		// The root's client render throws to the @catch arm, so, as in React, it
		// reports that caught error alone, not its failed hydration.
		{
			shape: 'a component before a caught @try',
			name: 'CaughtBranch',
			html: '<u>u</u><i>x</i><s>boom</s>',
			island: false,
			caught: true,
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
		// The call before it adopted the server's last element.
		{
			shape: 'a component after the server’s last element, under an island',
			name: 'TailCallBranch',
			html: '<b>a</b><p>z</p>',
			island: true,
		},
	])('client-renders the owner of $shape', async ({ name, html, island, caught }) => {
		const { outer, content, recoverable } = await hydrate(name);

		expect(markup(container.querySelector('section')!)).toBe(html);
		for (const node of content) expect(node.isConnected).toBe(false);
		expect(outer.isConnected).toBe(island);
		if (caught) {
			expect(recoverable).toEqual([]);
			expectDiagnosedOnce();
		} else expectReportedOnce(recoverable);
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
