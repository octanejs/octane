import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// A single-root component call inside a host element that finds no server
// range of its own renders its template against the server element at the
// cursor. When that element is of another tag, the server HTML does not match
// the client render and, with no Suspense boundary around it, the root renders
// on the client as React's does: no server node survives, onRecoverableError
// fires once, and the client-rendered tree updates normally afterwards. A
// hooked call renders through the full component slot, and so does a
// production compile's call whose output reads only constants. Every case runs
// in every compile mode, with the call in the middle of its host element and as
// its last child.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/in-place-mismatch-full.tsrx',
);
const FILE = 'in-place-mismatch-full.tsrx';
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

const STRUCTURAL =
	/^Octane hydration mismatch at in-place-mismatch-full\.tsrx:\d+:\d+: the client expected .+ but the server rendered <u>\. The nearest Suspense or Hydrate boundary, or the root, will be regenerated on the client\.$/;

const CALLS = [
	{
		call: 'a hooked component',
		name: 'Full',
		server: '<em>e</em><u>u</u><b>p</b><hr>',
		client: '<em>e</em><p>p</p><b>p</b><hr>',
	},
	// A development compile renders this hookless call through the lite slot.
	{
		call: 'a constant-output component',
		name: 'ConstantOutput',
		server: '<em>e</em><u>u</u><b>p</b><hr>',
		client: '<em>e</em><p>c</p><b>p</b><hr>',
	},
	{
		call: 'a hooked component as its host element’s last child',
		name: 'FullLast',
		server: '<hr><u>u</u>',
		client: '<hr><p>p</p>',
	},
	{
		call: 'a constant-output component as its host element’s last child',
		name: 'ConstantOutputLast',
		server: '<hr><u>u</u>',
		client: '<hr><p>c</p>',
	},
];

describe.each([
	{ name: 'development compile', dev: true, runtime: 'development' },
	{ name: 'production compile', dev: false, runtime: 'development' },
	{ name: 'production compile and runtime', dev: false, runtime: 'production' },
])(
	'hydrateRoot — a component root of another tag than the server element ($name)',
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

		it.each(CALLS)(
			'renders the root on the client for $call',
			async ({ name, server: serverSection, client: clientSection }) => {
				container.innerHTML = ServerRT.renderToString(server[name], { on: false }).html;
				const serverNodes = [...container.querySelectorAll('*')];
				expect(markup(container.querySelector('section')!)).toBe(serverSection);
				const recoverable: string[] = [];
				root = hydrateRoot(container, client[name], { on: true } as never, {
					onRecoverableError: (error: unknown) => recoverable.push((error as Error).message),
				});
				flushSync(() => {});
				// Recoverable reports are delivered after the hydration burst.
				await act(async () => {});

				expect(markup(container)).toBe(`<div id="r"><section>${clientSection}</section></div>`);
				expect(serverNodes.filter((node) => node.isConnected)).toEqual([]);
				expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
				// Only a development compile knows the template's source location.
				expect(warnings()).toEqual(dev ? [expect.stringMatching(STRUCTURAL)] : []);

				// The client-rendered tree updates like any other.
				flushSync(() => root!.render(client[name], { on: false }));
				expect(markup(container.querySelector('section')!)).toBe(serverSection);
				flushSync(() => root!.render(client[name], { on: true }));
				expect(markup(container.querySelector('section')!)).toBe(clientSection);
				expect(container.querySelectorAll('section')).toHaveLength(1);

				root!.unmount();
				root = null;
				expect(container.innerHTML).toBe('');
				expect(recoverable).toHaveLength(1);
				expect(warnings()).toHaveLength(dev ? 1 : 0);
			},
		);
	},
);
