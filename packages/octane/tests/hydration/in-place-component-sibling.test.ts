import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// The server rendered another @if/@switch arm whose elements match the client
// arm's. React hydrates elements regardless of which branch produced them, so
// it adopts them silently. Octane's server frames every component call, so the
// client arm's first call finds the other arm's element without its range: the
// root renders on the client and reports it once, as it does where the server's
// elements differ. The development compile renders these calls through the lite
// component slot; the production compile through the single-root component slot.

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

const MISMATCH = /^Hydration failed because the server rendered HTML didn't match the client\./;

const server = loadServerFixture(FIXTURE, { id: FILE });
const clients = {
	development: loadCompiledFixtureSource(SOURCE, {
		id: FILE,
		mode: 'client',
		compileOptions: { dev: true },
	}),
	production: loadCompiledFixtureSource(SOURCE, {
		id: FILE,
		mode: 'client',
		compileOptions: { dev: false },
	}),
};

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
	client: Record<string, any>,
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

describe.each([
	{ name: 'development compile', dev: true },
	{ name: 'production compile', dev: false },
])('hydrateRoot — components in another arm’s matching markup ($name)', ({ dev }) => {
	const client = dev ? clients.development : clients.production;

	it.each([
		{ block: 'an @if arm', name: 'IfArm', first: '<em>x</em>' },
		{ block: 'a @switch arm', name: 'SwitchArm', first: '<em>x</em>' },
		{
			block: 'an @if arm whose first root leaves the cursor inside it',
			name: 'NestedArm',
			first: '<em><b>x</b></em>',
		},
	])('renders the root on the client for $block', async ({ name, first }) => {
		// OCTANE DIVERGENCE: React adopts the matching server elements.
		const { host, serverNodes, recoverable } = await hydrate(
			client,
			name,
			{ on: false, z: 'z' },
			{ on: true, z: 'z' },
		);

		expect(host.isConnected).toBe(false);
		expect(serverNodes.filter((node) => node.isConnected)).toEqual([]);
		const live = container.firstElementChild!;
		expect(markup(live)).toBe(`${first}<em>z</em>`);
		expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
		expect(warnings()).toHaveLength(dev ? 1 : 0);

		// Each component updates the element it rendered.
		const second = live.children[1];
		flushSync(() => root!.render(client[name], { on: true, z: 'w' }));
		expect(markup(live)).toBe(`${first}<em>w</em>`);
		expect(live.children[1]).toBe(second);
	});

	it('renders the root on the client when the server element after the matching one differs', async () => {
		const { host, serverNodes, recoverable } = await hydrate(
			client,
			'ShortArm',
			{ on: false, z: 'z' },
			{ on: true, z: 'z' },
		);

		expect(host.isConnected).toBe(false);
		expect(serverNodes.filter((node) => node.isConnected)).toEqual([]);
		expect(markup(container.firstElementChild!)).toBe('<em>x</em><em>z</em>');
		expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
		expect(warnings()).toEqual(
			dev
				? [
						`Octane hydration mismatch at ${FILE}:${lineOf('function ShortArm(') + 4}:4: the client ` +
							'expected a component range but the server rendered <em>. The nearest Suspense ' +
							'or Hydrate boundary, or the root, will be regenerated on the client.',
					]
				: [],
		);
	});

	it('renders the root on the client for a returned single root the server did not render', async () => {
		const { host, recoverable } = await hydrate(
			client,
			'MaybeThenSibling',
			{ shown: false },
			{ shown: true },
		);

		expect(host.isConnected).toBe(false);
		const live = container.firstElementChild!;
		expect(markup(live)).toBe('<b>m</b><p>p</p>');
		expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
		expect(warnings()).toEqual(
			dev
				? [
						expect.stringContaining(
							'the client expected <b> but the server rendered the end of the parent block',
						),
					]
				: [],
		);

		const p = live.querySelector('p');
		flushSync(() => root!.render(client.MaybeThenSibling, { shown: false }));
		expect(markup(live)).toBe('<p>p</p>');
		flushSync(() => root!.render(client.MaybeThenSibling, { shown: true }));
		expect(markup(live)).toBe('<b>m</b><p>p</p>');
		expect(live.querySelector('p')).toBe(p);
	});
});

// OCTANE DIVERGENCE: a hookless component that renders nothing, where the
// server's arm rendered no range for it. React adopts the server's elements for
// the components after it; Octane's first call finds no range of its own, and
// the root renders on the client and reports once.
describe('hydrateRoot — a lite component that renders nothing in another arm’s markup', () => {
	it('renders the root on the client', async () => {
		const { host, serverNodes, recoverable } = await hydrate(
			clients.development,
			'EmptyFirstArm',
			{ on: false, z: 'z' },
			{ on: true, z: 'z' },
		);

		expect(host.isConnected).toBe(false);
		expect(serverNodes.filter((node) => node.isConnected)).toEqual([]);
		expect(markup(container.firstElementChild!)).toBe('<em>x</em><em>z</em>');
		expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
	});
});

// OCTANE DIVERGENCE: a component adopted in place whose body is a branch the
// server rendered no range for. Octane's control-flow ranges are part of its
// hydration protocol, so the branch without one is a structural mismatch even
// where its elements match; React, which has no range markers, adopts them.
// The root renders on the client and reports once, and the client-built
// branch then owns exactly what it rendered. As above, only the development
// compile renders this hookless call against the cursor.
describe('hydrateRoot — a branch in a component adopted in place', () => {
	it('renders the root on the client and then owns every root it rendered', async () => {
		const client = clients.development;
		const props = { on: true, shown: true, z: 'z' };
		const { host, serverNodes, recoverable } = await hydrate(
			client,
			'BranchArm',
			{ ...props, on: false },
			props,
		);

		expect(host.isConnected).toBe(false);
		expect(serverNodes.filter((node) => node.isConnected)).toEqual([]);
		const live = container.firstElementChild!;
		expect(markup(live)).toBe('<em>x</em><b>b</b><em>z</em>');
		expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
		expect(warnings()).toHaveLength(1);

		const last = live.children[2];
		flushSync(() => root!.render(client.BranchArm, { ...props, shown: false }));
		expect(markup(live)).toBe('<em>z</em>');
		expect(live.children[0]).toBe(last);
		flushSync(() => root!.render(client.BranchArm, props));
		expect(markup(live)).toBe('<em>x</em><b>b</b><em>z</em>');
	});
});
