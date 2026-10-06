import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot, lazy } from '../../src/index.js';
import type { ComponentBody } from '../../src/index.js';
import { condition, load } from 'octane/hydration';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// The server rendered a branch arm that holds more than the client's arm, or
// less: server content after the last node the client renders, or a node the
// client renders that the server's arm ends before. As in React, an unhydrated
// server tail inside an element is a mismatch, and nothing is repaired in
// place: with no Suspense boundary around the branch, the root renders on the
// client (no server node survives); inside a @try/@pending arm, only the arm
// does. onRecoverableError fires once, also when a pending component holds the
// first attempt and the mismatch is found when it resumes. Arms whose content
// matches the server's adopt it without a report.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/branch-arm-claim-tail.tsrx',
);
const FILE = 'branch-arm-claim-tail.tsrx';
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

/** `actual` holds exactly the `expected` nodes: the same objects, in order. */
function expectSame(actual: ArrayLike<Node>, expected: readonly Node[]): void {
	expect(actual).toHaveLength(expected.length);
	Array.from(actual).forEach((node, i) => expect(node).toBe(expected[i]));
}

const MISMATCH = /^Hydration failed because the server rendered HTML didn't match the client\./;
const WARNING =
	/^Octane hydration mismatch at branch-arm-claim-tail\.tsrx:\d+:\d+: the client expected .+ but the server rendered .+\. The nearest Suspense or Hydrate boundary, or the root, will be regenerated on the client\.$/;

describe.each([
	{ name: 'development compile', dev: true },
	{ name: 'production compile', dev: false },
])('hydrateRoot — a branch arm whose server content has another length ($name)', ({ dev }) => {
	const server = loadServerFixture(FIXTURE, { id: FILE });
	const client = loadCompiledFixtureSource(SOURCE, {
		id: FILE,
		mode: 'client',
		compileOptions: { dev },
	});
	let container: HTMLElement;
	let root: { render(component: unknown, props?: unknown): void; unmount(): void } | null;
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

	function expectOneReport(recoverable: string[]): void {
		expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
		// Only a development compile knows the template's source location.
		expect(warnings()).toEqual(dev ? [expect.stringMatching(WARNING)] : []);
	}

	async function hydrate(name: string, serverProps: object, clientProps: object) {
		container.innerHTML = ServerRT.renderToString(server[name], serverProps).html;
		const div = container.firstElementChild!;
		const adopted = Array.from(div.querySelectorAll('*'));
		const recoverable: string[] = [];
		root = hydrateRoot(container, client[name], clientProps, {
			onRecoverableError: (error: unknown) => recoverable.push((error as Error).message),
		});
		flushSync(() => {});
		// Recoverable reports are delivered after the hydration burst.
		await act(async () => {});
		return { div, adopted, recoverable };
	}

	it.each([
		{ shape: 'a tail after hookless components', name: 'Y', html: '<s>s</s><b>a</b>' },
		{ shape: 'a tail after a sole component', name: 'SoleComponent', html: '<s>s</s>' },
		{
			shape: 'a tail after a component with hooks',
			name: 'HookedArm',
			html: '<s>s</s><em>h</em>',
		},
		{
			shape: 'a tail after a nested branch',
			name: 'NestedBranch',
			html: '<s>s</s><b>a</b>',
			props: { inner: true },
		},
		{
			shape: 'a tail after the roots of an @if with no server range',
			name: 'MarkerlessArm',
			html: '<s>s</s><b>a</b>',
			props: { inner: true },
		},
		{
			shape: 'a tail after the roots of a @switch with no server range',
			name: 'MarkerlessSwitch',
			html: '<s>s</s><b>a</b>',
			props: { inner: true },
		},
		{
			shape: 'a tail after the roots of an @if inside another, with no server range',
			name: 'MarkerlessNested',
			html: '<s>s</s><b>a</b>',
			props: { inner: true },
		},
		{
			shape: 'an arm that ends before the client’s second root',
			name: 'MarkerlessShortArm',
			html: '<s>s</s><b>a</b>',
			props: { inner: true },
		},
		{
			shape: 'a first host of another tag and a tail',
			name: 'RebuiltBeforeClaim',
			html: '<em>e</em><s>s</s>',
		},
	])('renders the root on the client for $shape', async ({ name, html, props = {} }) => {
		const { div, adopted, recoverable } = await hydrate(name, { server: true, ...props }, props);

		expect(div.isConnected).toBe(false);
		expect(adopted.filter((node) => node.isConnected)).toEqual([]);
		expect(markup(container)).toBe(`<div>${html}</div>`);
		expectOneReport(recoverable);
	});

	it('renders the root on the client for a tail in a @switch case', async () => {
		const { div, adopted, recoverable } = await hydrate('Switched', { k: 'server' }, { k: 'x' });

		expect(div.isConnected).toBe(false);
		expect(adopted.filter((node) => node.isConnected)).toEqual([]);
		expect(markup(container)).toBe('<div><s>s</s><b>a</b></div>');
		expectOneReport(recoverable);
	});

	it.each(['MarkerlessArm', 'MarkerlessSwitch', 'MarkerlessNested', 'MarkerlessShortArm'])(
		'updates the client-rendered branch of %s',
		async (name) => {
			await hydrate(name, { server: true, inner: true }, { inner: true });
			const div = container.firstElementChild!;

			flushSync(() => root!.render(client[name], { inner: false }));
			expect(markup(div)).toBe('');
			flushSync(() => root!.render(client[name], { inner: true }));
			expect(markup(div)).toBe('<s>s</s><b>a</b>');
			expect(container.firstElementChild).toBe(div);
		},
	);

	it('adopts the arm the server rendered without a report', async () => {
		const { div, adopted, recoverable } = await hydrate('Y', {}, {});

		expect(markup(div)).toBe('<s>s</s><b>a</b>');
		expectSame(div.children, adopted);
		expect(recoverable).toEqual([]);
		expect(warnings()).toEqual([]);
	});

	it.each([
		{
			shape: 'a host its template renders after its last component',
			name: 'SameContent',
			kept: '<s>s</s><b>a</b><u>tail</u>',
		},
		{
			shape: 'a component root after another component',
			name: 'AdoptedAfterClaim',
			kept: '<s>s</s><i>u</i>',
		},
	])('adopts $shape that the server rendered inline', async ({ name, kept }) => {
		const { div, adopted, recoverable } = await hydrate(name, { server: true }, {});

		expect(container.firstElementChild).toBe(div);
		expect(markup(div)).toBe(kept);
		expectSame(div.children, adopted);
		expect(recoverable).toEqual([]);
		expect(warnings()).toEqual([]);
	});

	// OCTANE DIVERGENCE: Octane's control-flow ranges are part of its hydration
	// protocol, as React's Suspense markers are part of React's. A client @if
	// whose server output has no range of its own is a structural mismatch even
	// when the elements inside it match, so the root renders on the client where
	// React, which compiles @if to a plain expression, would adopt.
	it('renders the root on the client for a branch with no server range around matching hosts', async () => {
		const { div, adopted, recoverable } = await hydrate(
			'MarkerlessSameArm',
			{ server: true },
			{ inner: true },
		);

		expect(div.isConnected).toBe(false);
		expect(adopted.filter((node) => node.isConnected)).toEqual([]);
		expect(markup(container)).toBe('<div><s>s</s><b>a</b></div>');
		expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);

		flushSync(() => root!.render(client.MarkerlessSameArm, { inner: false }));
		expect(markup(container.firstElementChild!)).toBe('');
	});

	// A pending component before the tail suspends the attempt first, and a
	// suspension keeps the server HTML; a tail before a pending sibling ends its
	// branch's range first, so the mismatch is found before the suspension.
	it.each([
		{
			shape: 'a tail before a pending sibling',
			name: 'TailThenChild',
			html: '<s>s</s><b>a</b><p>child</p>',
			suspendsFirst: false,
		},
		{
			shape: 'a tail after a pending component',
			name: 'PendingInArm',
			html: '<s>s</s><p>child</p>',
			suspendsFirst: true,
		},
	])('renders the root on the client once for $shape', async ({ name, html, suspendsFirst }) => {
		container.innerHTML = ServerRT.renderToString(server[name], {
			server: true,
			Child: server.Tail,
		}).html;
		const serverNodes = Array.from(container.querySelectorAll('*'));
		const recoverable: string[] = [];
		let deliver!: (module: { default: ComponentBody }) => void;
		const Child = lazy(
			() => new Promise<{ default: ComponentBody }>((accept) => (deliver = accept)),
		);
		await act(() => {
			root = hydrateRoot(
				container,
				client[name],
				{ Child },
				{ onRecoverableError: (error: unknown) => recoverable.push((error as Error).message) },
			);
		});
		if (suspendsFirst) {
			expect(serverNodes.every((node) => node.isConnected)).toBe(true);
			expect(recoverable).toEqual([]);
		}

		await act(async () => deliver({ default: client.Tail }));

		expect(markup(container)).toBe(`<div>${html}</div>`);
		expect(serverNodes.filter((node) => node.isConnected)).toEqual([]);
		expectOneReport(recoverable);
	});

	it.each([
		{
			shape: 'a tail before a pending sibling',
			name: 'TryTailThenChild',
			html: '<s>s</s><b>a</b><p>child</p>',
			suspendsFirst: false,
		},
		{
			shape: 'a tail after a pending component',
			name: 'TryPendingInArm',
			html: '<s>s</s><p>child</p>',
			suspendsFirst: true,
		},
	])(
		'renders only the @try arm on the client once for $shape',
		async ({ name, html, suspendsFirst }) => {
			container.innerHTML = ServerRT.renderToString(server[name], {
				server: true,
				Child: server.Tail,
			}).html;
			const div = container.firstElementChild!;
			const armNodes = Array.from(div.querySelectorAll('*'));
			const recoverable: string[] = [];
			let deliver!: (module: { default: ComponentBody }) => void;
			const Child = lazy(
				() => new Promise<{ default: ComponentBody }>((accept) => (deliver = accept)),
			);
			await act(() => {
				root = hydrateRoot(
					container,
					client[name],
					{ Child },
					{ onRecoverableError: (error: unknown) => recoverable.push((error as Error).message) },
				);
			});
			if (suspendsFirst) {
				expect(armNodes.every((node) => node.isConnected)).toBe(true);
				expect(recoverable).toEqual([]);
			}

			await act(async () => deliver({ default: client.Tail }));

			expect(container.firstElementChild).toBe(div);
			expect(markup(div)).toBe(`<section>${html}</section>`);
			expect(armNodes.filter((node) => node.isConnected)).toEqual([]);
			expectOneReport(recoverable);
		},
	);

	// Captures that changed before a dormant boundary activated legitimately
	// differ from the server's. As React reports nothing for an update that
	// reaches a dehydrated boundary, the island renders on the client silently.
	it('renders a dormant island on the client without reporting when its captures changed', async () => {
		const serverProps = { server: true, when: condition(false) };
		container.innerHTML = ServerRT.renderToString(server.DormantTail, serverProps).html;
		const div = container.firstElementChild!;
		const section = container.querySelector('section')!;
		const islandNodes = [section, ...section.querySelectorAll('*')];
		const recoverable: string[] = [];
		const active = hydrateRoot(container, client.DormantTail, serverProps, {
			onRecoverableError: (error: unknown) => recoverable.push((error as Error).message),
		});
		root = active;
		flushSync(() => {});
		expect(markup(section)).toBe('<s>s</s><b>a</b><u>tail</u>');

		await act(() => active.render(client.DormantTail, { when: load() }));
		await act(async () => {});

		expect(container.firstElementChild).toBe(div);
		expect(markup(container.querySelector('section')!)).toBe('<s>s</s><b>a</b>');
		expect(islandNodes.filter((node) => node.isConnected)).toEqual([]);
		expect(recoverable).toEqual([]);
		expect(warnings()).toEqual([]);
	});
});
