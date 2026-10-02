import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// A component call that finds no server range of its own, because the server
// rendered another @if/@switch arm there, renders its template against the
// server element at the cursor and adopts that element in place when it
// matches. Hydration must then continue after that element, wherever the
// component's own holes left the cursor: the next component adopts its own
// server range instead of the same element. The development compile renders
// these calls through the lite component slot; the production compile through
// the single-root component slot.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/in-place-component-sibling.tsrx',
);
const FILE = 'in-place-component-sibling.tsrx';
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

describe.each([
	{ name: 'development compile', dev: true },
	{ name: 'production compile', dev: false },
])('hydrateRoot — a component after one adopted without a range ($name)', ({ dev }) => {
	const server = loadServerFixture(FIXTURE, { id: FILE });
	const client = loadCompiledFixtureSource(SOURCE, {
		id: FILE,
		mode: 'client',
		compileOptions: { dev },
	});
	let container: HTMLElement;
	let root: ReturnType<typeof hydrateRoot> | null;
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

	/** The server render's elements in the fixture's host, and the hydration's recoverable errors. */
	async function hydrate(
		name: string,
		serverProps: Record<string, unknown>,
		clientProps: Record<string, unknown>,
	): Promise<{ host: Element; serverNodes: Element[]; recoverable: string[] }> {
		container.innerHTML = ServerRT.renderToString(server[name], serverProps).html;
		const host = container.firstElementChild!;
		const serverNodes = [...host.children];
		const recoverable: string[] = [];
		root = hydrateRoot(container, client[name], clientProps, {
			onRecoverableError: (error: unknown) => recoverable.push((error as Error).message),
		});
		flushSync(() => {});
		// Recoverable reports are delivered after the hydration burst.
		await act(async () => {});
		return { host, serverNodes, recoverable };
	}

	it.each([
		{ block: 'an @if arm', name: 'IfArm', first: '<em>x</em>' },
		{ block: 'a @switch arm', name: 'SwitchArm', first: '<em>x</em>' },
		{
			block: 'an @if arm whose first root leaves the cursor inside it',
			name: 'NestedArm',
			first: '<em><b>x</b></em>',
		},
	])('the next component adopts its own server range in $block', async ({ name, first }) => {
		const { host, serverNodes, recoverable } = await hydrate(
			name,
			{ on: false, z: 'z' },
			{ on: true, z: 'z' },
		);

		expect(markup(host)).toBe(`${first}<em>z</em>`);
		expect(host.children).toHaveLength(2);
		expect(host.children[0]).toBe(serverNodes[0]);
		expect(host.children[1]).toBe(serverNodes[1]);
		expect(recoverable).toEqual([]);
		expect(warnings()).toEqual([]);

		// Each component updates the element it adopted.
		flushSync(() => root!.render(client[name], { on: true, z: 'w' }));
		expect(markup(host)).toBe(`${first}<em>w</em>`);
		expect(host.children[1]).toBe(serverNodes[1]);
	});

	it('rebuilds the next component over the server content after the adopted element', async () => {
		const { host, serverNodes, recoverable } = await hydrate(
			'ShortArm',
			{ on: false, z: 'z' },
			{ on: true, z: 'z' },
		);

		expect(markup(host)).toBe('<em>x</em><em>z</em>');
		expect(host.children[0]).toBe(serverNodes[0]);
		expect(serverNodes[1].isConnected).toBe(false);
		expect(recoverable).toEqual([expect.stringMatching(STRUCTURAL)]);
		expect(warnings()).toEqual(
			dev
				? [
						`Octane hydration mismatch at ${FILE}:${lineOf('function Leaf(') + 1}:1: the ` +
							'client expected <em> but the server rendered <s>. The mismatched subtree ' +
							'was rebuilt on the client.',
					]
				: [],
		);
	});

	// The production compile gives Empty a full component slot, which rebuilds a
	// call without a server range rather than rendering it against the cursor.
	it.runIf(dev)('a component that renders nothing leaves the element to the next one', async () => {
		const { host, serverNodes, recoverable } = await hydrate(
			'EmptyFirstArm',
			{ on: false, z: 'z' },
			{ on: true, z: 'z' },
		);

		expect(markup(host)).toBe('<em>x</em><em>z</em>');
		expect(host.children).toHaveLength(2);
		expect(host.children[0]).toBe(serverNodes[0]);
		expect(host.children[1]).toBe(serverNodes[1]);
		expect(recoverable).toEqual([]);
	});

	it('removes a returned single root rebuilt at the end of its server range', async () => {
		const { host, serverNodes, recoverable } = await hydrate(
			'MaybeThenSibling',
			{ shown: false },
			{ shown: true },
		);
		const p = serverNodes[0];

		expect(markup(host)).toBe('<b>m</b><p>p</p>');
		expect(recoverable).toEqual([expect.stringMatching(STRUCTURAL)]);
		expect(warnings()).toEqual(
			dev
				? [
						expect.stringContaining(
							'the client expected <b> but the server rendered the end of the parent block',
						),
					]
				: [],
		);

		flushSync(() => root!.render(client.MaybeThenSibling, { shown: false }));
		expect(markup(host)).toBe('<p>p</p>');
		flushSync(() => root!.render(client.MaybeThenSibling, { shown: true }));
		expect(markup(host)).toBe('<b>m</b><p>p</p>');
		expect(host.querySelector('p')).toBe(p);
	});
});
