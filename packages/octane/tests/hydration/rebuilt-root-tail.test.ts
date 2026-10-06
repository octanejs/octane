import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// A component's server range can start with an element of another tag than
// the single root the client renders as that range's content, followed by more
// server content: the server rendered another component there, or more from
// this one. As in React, the server HTML does not match and nothing is
// repaired in place: with no Suspense boundary, the root renders on the client
// (no server node survives, including the siblings both sides render) and
// onRecoverableError fires once; inside a @try/@pending arm, only the arm
// does. Matching server content is adopted without a report.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/rebuilt-root-tail.tsrx',
);
const FILE = 'rebuilt-root-tail.tsrx';
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

const WARNING =
	/^Octane hydration mismatch at rebuilt-root-tail\.tsrx:\d+:\d+: the client expected .+ but the server rendered <b>\. The nearest Suspense or Hydrate boundary, or the root, will be regenerated on the client\.$/;

const SERVER_HTML = '<b class="server">server</b><em class="tail">tail</em><em>e</em>';

const SHAPES = [
	{ shape: 'a lite component in another arm’s range', name: 'Branch' },
	{ shape: 'a component with hooks in another arm’s range', name: 'StateBranch' },
	{ shape: 'a component whose identity differs on the client', name: 'DynamicIdentity' },
	{ shape: 'a template component whose identity differs on the client', name: 'DynamicTemplate' },
	{ shape: 'a lite component in a renderable hole', name: 'RenderableHole' },
	{ shape: 'a component that returns less on the client', name: 'ConditionalReturn' },
	{ shape: 'a component in a list item range', name: 'ListItem' },
	{ shape: 'a call that inherits its component’s range', name: 'InheritedCall' },
];

const CONTROLS = [
	{
		control: 'a later call’s server range',
		name: 'ClaimedTail',
		html: '<b class="server">server</b><em>e</em><s class="tail">s</s>',
	},
	{
		control: 'the template’s element after a hole',
		name: 'HoleThenElement',
		html: '<b class="server">server</b><em>e</em><s class="tail">s</s>',
	},
];

describe.each([
	{ name: 'development compile', dev: true, runtime: 'development' },
	{ name: 'production compile', dev: false, runtime: 'development' },
	{ name: 'production compile and runtime', dev: false, runtime: 'production' },
])(
	'hydrateRoot — a component range whose server root has another tag ($name)',
	({ dev, runtime }) => {
		const server = loadServerFixture(FIXTURE, { id: FILE });
		const client = loadCompiledFixtureSource(SOURCE, {
			id: FILE,
			mode: 'client',
			compileOptions: { dev },
		});
		// A production runtime reports the error code instead of the message.
		const MISMATCH =
			runtime === 'production'
				? /^Minified Octane error #339;/
				: /^Hydration failed because the server rendered HTML didn't match the client\./;
		let container: HTMLElement;
		let root: { render(component: unknown, props?: unknown): void; unmount(): void } | null;
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

		function render(name: string, props: Record<string, unknown>): Element {
			container.innerHTML = ServerRT.renderToString(server[name], props).html;
			return container.firstElementChild!;
		}

		async function hydrate(name: string, props: Record<string, unknown>): Promise<string[]> {
			const recoverable: string[] = [];
			root = hydrateRoot(container, client[name], props as never, {
				onRecoverableError: (error: unknown) => recoverable.push((error as Error).message),
			}) as never;
			flushSync(() => {});
			// Recoverable reports are delivered after the hydration burst.
			await act(async () => {});
			return recoverable;
		}

		function expectRootFallback(serverNodes: Element[], recoverable: string[]): void {
			expect(serverNodes.filter((node) => node.isConnected)).toEqual([]);
			expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
			// Only a development compile knows the template's source location.
			expect(warnings()).toEqual(dev ? [expect.stringMatching(WARNING)] : []);
		}

		it.each(SHAPES)('renders the root on the client for $shape', async ({ name }) => {
			const section = render(name, { server: true });
			expect(markup(section)).toBe(SERVER_HTML);
			const serverNodes = [section, ...section.querySelectorAll('*')];

			const recoverable = await hydrate(name, {});

			expect(markup(container)).toBe('<section><p>p</p><em>e</em></section>');
			expectRootFallback(serverNodes, recoverable);

			// The client-rendered tree updates in place.
			const clientSection = container.firstElementChild!;
			await act(async () => root!.render(client[name], { server: true }));
			expect(markup(clientSection)).toBe(SERVER_HTML);
			await act(async () => root!.render(client[name], {}));
			expect(markup(clientSection)).toBe('<p>p</p><em>e</em>');
			expect(container.firstElementChild).toBe(clientSection);
			expect(recoverable).toHaveLength(1);
			expect(warnings()).toHaveLength(dev ? 1 : 0);
		});

		it('renders only the @try arm on the client for a root whose child suspends', async () => {
			const section = render('SuspendedBranch', { server: true, value: Promise.resolve('') });
			expect(markup(section)).toBe(SERVER_HTML);
			const armNodes = [...section.querySelectorAll('*')];
			let resolve!: (value: string) => void;
			const value = new Promise<string>((done) => (resolve = done));

			const recoverable = await hydrate('SuspendedBranch', { value });

			// The root mismatches before its child suspends: the arm's server
			// content is gone, and its client render waits for the value.
			expect(armNodes.filter((node) => node.isConnected)).toEqual([]);
			expect(section.querySelector('span')!.textContent).toBe('loading');

			await act(async () => resolve('z'));

			expect(container.firstElementChild).toBe(section);
			expect(section.querySelector('span')).toBeNull();
			expect(markup(section.querySelector('p')!)).toBe('<i>z</i>');
			expect(section.querySelector('em')!.textContent).toBe('e');
			expect(section.children).toHaveLength(2);
			expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
			expect(warnings()).toEqual(dev ? [expect.stringMatching(WARNING)] : []);
		});

		it.each(CONTROLS)(
			'renders the root on the client for $control after a root of another tag',
			async ({ name, html }) => {
				const section = render(name, { server: true });
				expect(markup(section)).toBe(html);
				const serverNodes = [section, ...section.querySelectorAll('*')];

				const recoverable = await hydrate(name, {});

				expect(markup(container)).toBe('<section><p>p</p><em>e</em></section>');
				expectRootFallback(serverNodes, recoverable);
			},
		);

		it('renders the root on the client for a branch with no server range over another tag', async () => {
			const section = render('MarkerlessRebuilt', { server: true });
			const serverNodes = [section, ...section.querySelectorAll('*')];

			const recoverable = await hydrate('MarkerlessRebuilt', { inner: true });

			expect(markup(container)).toBe('<section><p>p</p><em>e</em></section>');
			expect(serverNodes.filter((node) => node.isConnected)).toEqual([]);
			expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
			expect(warnings()).toHaveLength(dev ? 1 : 0);
		});

		it.each([
			...SHAPES.map(({ shape, name }) => ({ shape, name })),
			...CONTROLS.map(({ control, name }) => ({ shape: control, name })),
		])('adopts the server render of the client’s $shape without a report', async ({ name }) => {
			const section = render(name, {});
			const html = markup(section);
			const nodes = [...section.querySelectorAll('*')];

			const recoverable = await hydrate(name, {});

			expect(container.firstElementChild).toBe(section);
			expect(markup(section)).toBe(html);
			const adopted = [...section.querySelectorAll('*')];
			expect(adopted).toHaveLength(nodes.length);
			adopted.forEach((node, index) => expect(node).toBe(nodes[index]));
			expect(recoverable).toEqual([]);
			expect(warnings()).toEqual([]);
		});
	},
);
