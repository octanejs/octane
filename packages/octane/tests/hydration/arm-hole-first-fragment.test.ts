import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// A nested fragment has no server wrapper, so hydration compares its first
// root with the server node at the cursor. When that root is a hole (here a
// component call, text hole, renderable hole, nested block or boundary in an
// @if arm), the server node cannot decide: the first static root after the
// holes does. When the server rendered the other arm there, the server HTML
// does not match the client. No Suspense arm encloses the @if, so, as in
// React 19, the whole root renders on the client and reports once.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/arm-hole-first-fragment.tsrx',
);
const FILE = 'arm-hole-first-fragment.tsrx';
const SOURCE = readFileSync(FIXTURE, 'utf8');
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Element and text markup, ignoring hydration comments. */
function markup(node: Element): string {
	const copy = node.cloneNode(true) as Element;
	const walker = document.createTreeWalker(copy, NodeFilter.SHOW_COMMENT);
	const comments: Node[] = [];
	while (walker.nextNode()) comments.push(walker.currentNode);
	for (const comment of comments) comment.parentNode!.removeChild(comment);
	return copy.innerHTML;
}

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

describe.each([
	{ compile: 'development', runtime: 'development' },
	{ compile: 'production', runtime: 'development' },
	{ compile: 'development', runtime: 'production' },
	{ compile: 'production', runtime: 'production' },
] as const)(
	'hydrateRoot — an @if arm fragment that starts with a hole ($compile compile, $runtime runtime)',
	({ compile, runtime }) => {
		const client = clients[compile];
		// The production runtime reports the error code instead of the message.
		const HYDRATION_FAILED =
			runtime === 'production'
				? /^Minified Octane error #339;/
				: /^Hydration failed because the server rendered HTML didn't match the client/;

		let container: HTMLElement;
		let root: ReturnType<typeof hydrateRoot> | null;
		let errSpy: ReturnType<typeof vi.spyOn>;

		beforeEach(() => {
			container = document.createElement('div');
			document.body.appendChild(container);
			root = null;
			errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
			if (runtime === 'production') vi.stubEnv('NODE_ENV', 'production');
		});

		afterEach(() => {
			root?.unmount();
			vi.unstubAllEnvs();
			container.remove();
			errSpy.mockRestore();
		});

		const warnings = () =>
			errSpy.mock.calls
				.map((call: unknown[]) => String(call[0]))
				.filter((message: string) => message.includes('hydration mismatch'));

		/** The server render's host, and the hydration's recoverable errors. */
		async function hydrate(
			name: string,
			serverProps: Record<string, unknown>,
			clientProps: Record<string, unknown>,
		): Promise<{ host: Element; serverNodes: Element[]; recoverable: string[] }> {
			container.innerHTML = ServerRT.renderToString(server[name], serverProps).html;
			const serverNodes = [...container.querySelectorAll('*')];
			const recoverable: string[] = [];
			root = hydrateRoot(container, client[name], clientProps, {
				onRecoverableError: (error: unknown) => recoverable.push((error as Error).message),
			});
			flushSync(() => {});
			// Recoverable reports are delivered after the hydration burst.
			await act(async () => {});
			return { host: container.firstElementChild!, serverNodes, recoverable };
		}

		/** The root fell back: none of the server's elements is still connected. */
		function expectRootFellBack(serverNodes: Element[], recoverable: string[]): void {
			expect(serverNodes.length).toBeGreaterThan(0);
			for (const node of serverNodes) expect(node.isConnected).toBe(false);
			expect(recoverable).toEqual([expect.stringMatching(HYDRATION_FAILED)]);
		}

		/**
		 * The dev warning for the client's else-arm fragment, at the first node of
		 * the server's then-arm: its <b>.
		 */
		const mismatch = () =>
			compile === 'development' && runtime === 'development'
				? [
						expect.stringMatching(
							new RegExp(
								`^${escape(`Octane hydration mismatch at ${FILE}`)}.*: ` +
									`the client expected .+ but the server rendered ${escape('<b>.')}`,
							),
						),
					]
				: [];

		it('client-renders the root over another arm whose nodes differ from its static roots', async () => {
			const { host, serverNodes, recoverable } = await hydrate(
				'ArmHoleFirst',
				{ server: true },
				{},
			);

			expect(markup(host)).toBe('<u>z</u><i>x</i>');
			expectRootFellBack(serverNodes, recoverable);
			expect(warnings()).toEqual(mismatch());

			flushSync(() => root!.render(client.ArmHoleFirst, { server: true }));
			expect(markup(host)).toBe('<b class="server">server</b><em>e</em>');
			flushSync(() => root!.render(client.ArmHoleFirst, {}));
			expect(markup(host)).toBe('<u>z</u><i>x</i>');
			expect(recoverable).toHaveLength(1);
		});

		it('client-renders the root over another arm that ends before its static roots', async () => {
			const { host, serverNodes, recoverable } = await hydrate(
				'ShortArmHoleFirst',
				{ server: true },
				{},
			);

			expect(markup(host)).toBe('<u>z</u><i>x</i>');
			expectRootFellBack(serverNodes, recoverable);
			expect(warnings()).toEqual(mismatch());

			flushSync(() => root!.render(client.ShortArmHoleFirst, { server: true }));
			expect(markup(host)).toBe('<b class="server">server</b>');
			flushSync(() => root!.render(client.ShortArmHoleFirst, {}));
			expect(markup(host)).toBe('<u>z</u><i>x</i>');
		});

		it('remounts the keyed component of a client-rendered fragment when its key changes', async () => {
			const { host, serverNodes, recoverable } = await hydrate(
				'KeyedArmHoleFirst',
				{ server: true, k: 'a', tail: 't' },
				{ k: 'a', tail: 't' },
			);
			const [u, i] = host.children;

			expect(markup(host)).toBe('<u>a</u><i>t</i>');
			expectRootFellBack(serverNodes, recoverable);
			expect(warnings()).toEqual(mismatch());

			flushSync(() => root!.render(client.KeyedArmHoleFirst, { k: 'b', tail: 'w' }));
			expect(markup(host)).toBe('<u>b</u><i>w</i>');
			expect(u.isConnected).toBe(false);
			expect(host.children[1]).toBe(i);
			expect(recoverable).toHaveLength(1);
		});

		it.each([
			{ name: 'ArmHoleFirst', props: {}, html: '<u>z</u><i>x</i>' },
			{ name: 'TextHoleFirst', props: { on: true, text: 'a' }, html: 'a<i>x</i>' },
			{ name: 'TextHoleFirst', props: { on: true, text: '' }, html: '<i>x</i>' },
			{ name: 'NodeHoleFirst', props: { on: true, node: 'a' }, html: 'a<i>x</i>' },
			{ name: 'NodeHoleFirst', props: { on: true, node: null }, html: '<i>x</i>' },
			{ name: 'BlockHoleFirst', props: { on: true, flag: true }, html: '<b>b</b><i>x</i>' },
			{ name: 'BlockHoleFirst', props: { on: true, flag: false }, html: '<i>x</i>' },
			{ name: 'TwoHolesFirst', props: { on: true, text: 'a' }, html: '<u>z</u>a<i>x</i>' },
			{ name: 'TryHoleFirst', props: { on: true }, html: '<u>z</u><i>x</i>' },
			{ name: 'SuspenseHoleFirst', props: { on: true }, html: '<u>z</u><i>x</i>' },
		])('adopts $name with $props as the server rendered it', async ({ name, props, html }) => {
			const { host, serverNodes, recoverable } = await hydrate(name, props, props);

			expect(markup(host)).toBe(html);
			expect([...container.querySelectorAll('*')]).toEqual(serverNodes);
			expect(recoverable).toEqual([]);
			expect(warnings()).toEqual([]);
		});

		// An @if or @switch at a hole of the client's arm, where the server
		// rendered the other arm's plain hosts. The client render keeps the arm's
		// static <b> across later toggles of the nested block.
		it('client-renders the root for a nested @if at the hole of the other arm', async () => {
			const { host, serverNodes, recoverable } = await hydrate(
				'NestedIfHoleFirst',
				{ server: true },
				{ inner: true },
			);

			expect(markup(host)).toBe('<s>s</s><b>a</b><b>a</b><em>e</em>');
			expectRootFellBack(serverNodes, recoverable);
			const [, , b, em] = host.children;

			flushSync(() => root!.render(client.NestedIfHoleFirst, { inner: false }));
			expect(markup(host)).toBe('<b>a</b><em>e</em>');
			expect(host.children[0]).toBe(b);
			flushSync(() => root!.render(client.NestedIfHoleFirst, { inner: true }));
			expect(markup(host)).toBe('<s>s</s><b>a</b><b>a</b><em>e</em>');
			expect(host.children[2]).toBe(b);
			expect(host.children[3]).toBe(em);
			expect(recoverable).toHaveLength(1);
		});

		it.each([
			{
				name: 'NestedIfHoleFirst',
				props: { inner: false },
				html: '<b>a</b><em>e</em>',
				next: { inner: true },
				updated: '<s>s</s><b>a</b><b>a</b><em>e</em>',
			},
			{
				name: 'NestedIfHoleMid',
				props: { inner: true },
				html: '<i>i</i><s>s</s><b>a</b><b>a</b><em>e</em>',
				next: { inner: false },
				updated: '<i>i</i><b>a</b><em>e</em>',
			},
			{
				name: 'NestedIfHoleMid',
				props: { inner: false },
				html: '<i>i</i><b>a</b><em>e</em>',
				next: { inner: true },
				updated: '<i>i</i><s>s</s><b>a</b><b>a</b><em>e</em>',
			},
			{
				name: 'NestedSwitchHoleFirst',
				props: { inner: 'pair' },
				html: '<s>s</s><b>a</b><b>a</b><em>e</em>',
				next: { inner: 's' },
				updated: '<s>s</s><b>a</b><em>e</em>',
			},
			{
				name: 'NestedSwitchHoleFirst',
				props: { inner: 'p' },
				html: '<p>p</p><b>a</b><em>e</em>',
				next: { inner: 'pair' },
				updated: '<s>s</s><b>a</b><b>a</b><em>e</em>',
			},
			{
				name: 'NestedSwitchHoleFirst',
				props: { inner: 'component' },
				html: '<s>s</s><b>a</b><b>a</b><em>e</em>',
				next: { inner: 'none' },
				updated: '<b>a</b><em>e</em>',
			},
			{
				name: 'NestedSwitchHoleFirst',
				props: { inner: 'none' },
				html: '<b>a</b><em>e</em>',
				next: { inner: 'component' },
				updated: '<s>s</s><b>a</b><b>a</b><em>e</em>',
			},
		])(
			'client-renders the root for $name with $props where the server rendered the other arm',
			async ({ name, props, html, next, updated }) => {
				const { host, serverNodes, recoverable } = await hydrate(name, { server: true }, props);

				expect(markup(host)).toBe(html);
				expectRootFellBack(serverNodes, recoverable);

				flushSync(() => root!.render(client[name], next));
				expect(markup(host)).toBe(updated);
				expect(recoverable).toHaveLength(1);
			},
		);

		// OCTANE DIVERGENCE: React adopts this server HTML, because its hosts
		// (<s>, <b>, <em>) coincide with the client arm's and React emits no
		// markers for conditionals. Octane frames every @switch in a server range,
		// and the server's other arm has none where the client's @switch is, so
		// its markup differs structurally and the root renders on the client.
		it('client-renders the root for a nested @switch whose hosts coincide with the other arm', async () => {
			const { host, serverNodes, recoverable } = await hydrate(
				'NestedSwitchHoleFirst',
				{ server: true },
				{ inner: 's' },
			);

			expect(markup(host)).toBe('<s>s</s><b>a</b><em>e</em>');
			expectRootFellBack(serverNodes, recoverable);

			flushSync(() => root!.render(client.NestedSwitchHoleFirst, { inner: 'p' }));
			expect(markup(host)).toBe('<p>p</p><b>a</b><em>e</em>');
			expect(recoverable).toHaveLength(1);
		});
	},
);
