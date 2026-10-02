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
// holes does. When
// the server rendered the other arm there, the arm's fragment is rebuilt on the
// client with one report, as when its first root is static, instead of
// adopting the other arm's nodes as its own roots: that lost the fragment's
// static roots, and gave the hole's component a server node as its anchor.

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
		// The production runtime checks a lazy template against its source, and
		// reports the error code instead of the message.
		const STRUCTURAL =
			runtime === 'production'
				? /^Minified Octane error #51;/
				: /the mismatched subtree was rebuilt on the client/;

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
			const serverNodes = [...container.firstElementChild!.querySelectorAll('*')];
			const recoverable: string[] = [];
			root = hydrateRoot(container, client[name], clientProps, {
				onRecoverableError: (error: unknown) => recoverable.push((error as Error).message),
			});
			flushSync(() => {});
			// Recoverable reports are delivered after the hydration burst.
			await act(async () => {});
			return { host: container.firstElementChild!, serverNodes, recoverable };
		}

		/** The dev warning for an else-arm fragment rebuilt where the server rendered `actual`. */
		const rebuilt = (actual: string) =>
			compile === 'development' && runtime === 'development'
				? [
						expect.stringMatching(
							new RegExp(
								`^${escape(`Octane hydration mismatch at ${FILE}`)}.*: ` +
									escape(
										'the client expected a fragment with <i> after its leading holes but the ' +
											`server rendered ${actual}. The mismatched subtree was rebuilt on the client.`,
									) +
									'$',
							),
						),
					]
				: [];

		it('rebuilds the fragment over another arm whose nodes differ from its static roots', async () => {
			const { host, serverNodes, recoverable } = await hydrate(
				'ArmHoleFirst',
				{ server: true },
				{},
			);
			const [b, em] = serverNodes;

			expect(markup(host)).toBe('<u>z</u><i>x</i>');
			expect(b.isConnected).toBe(false);
			expect(em.isConnected).toBe(false);
			expect(recoverable).toEqual([expect.stringMatching(STRUCTURAL)]);
			expect(warnings()).toEqual(rebuilt('<em>'));

			flushSync(() => root!.render(client.ArmHoleFirst, { server: true }));
			expect(markup(host)).toBe('<b class="server">server</b><em>e</em>');
			flushSync(() => root!.render(client.ArmHoleFirst, {}));
			expect(markup(host)).toBe('<u>z</u><i>x</i>');
			expect(recoverable).toHaveLength(1);
		});

		it('rebuilds the fragment over another arm that ends before its static roots', async () => {
			const { host, serverNodes, recoverable } = await hydrate(
				'ShortArmHoleFirst',
				{ server: true },
				{},
			);
			const [b] = serverNodes;

			expect(markup(host)).toBe('<u>z</u><i>x</i>');
			expect(b.isConnected).toBe(false);
			expect(recoverable).toEqual([expect.stringMatching(STRUCTURAL)]);
			expect(warnings()).toEqual(
				rebuilt('the end of the parent block (fewer nodes than expected)'),
			);

			flushSync(() => root!.render(client.ShortArmHoleFirst, { server: true }));
			expect(markup(host)).toBe('<b class="server">server</b>');
			flushSync(() => root!.render(client.ShortArmHoleFirst, {}));
			expect(markup(host)).toBe('<u>z</u><i>x</i>');
		});

		it('remounts the keyed component of a rebuilt fragment when its key changes', async () => {
			const { host, recoverable } = await hydrate(
				'KeyedArmHoleFirst',
				{ server: true, k: 'a', tail: 't' },
				{ k: 'a', tail: 't' },
			);
			const [u, i] = host.children;

			expect(markup(host)).toBe('<u>a</u><i>t</i>');
			expect(recoverable).toEqual([expect.stringMatching(STRUCTURAL)]);
			expect(warnings()).toEqual(rebuilt('<em>'));

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
			expect([...host.querySelectorAll('*')]).toEqual(serverNodes);
			expect(recoverable).toEqual([]);
			expect(warnings()).toEqual([]);
		});
	},
);
