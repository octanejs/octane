import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// A single-root component call inside a host element that finds no server
// range of its own renders its template against the server element at the
// cursor. When that element does not match, hydration rebuilds the component's
// root in its place: it reports the mismatch once, keeps the server siblings
// around it adopted, and the rebuilt root later unmounts and remounts with the
// rest of its arm. A hooked call renders through the full component slot, and
// so does a production compile's call whose output reads only constants. Every
// case runs in every compile mode. When the call is its host's last child, the
// rebuilt root is appended where the server element stood.

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

const STRUCTURAL = /the client expected <p> but the server rendered <u>\. The mismatched subtree/;
const SERVER_SECTION = '<em>e</em><u>u</u><b>p</b><hr>';
const SERVER_LAST_SECTION = '<hr><u>u</u>';

const CALLS = [
	{ call: 'a hooked component', name: 'Full', rebuilt: '<p>p</p>' },
	// A development compile renders this hookless call through the lite slot, which
	// rebuilds it in place the same way.
	{ call: 'a constant-output component', name: 'ConstantOutput', rebuilt: '<p>c</p>' },
];
const LAST_CALLS = [
	{ call: 'a hooked component', name: 'FullLast', rebuilt: '<p>p</p>' },
	{ call: 'a constant-output component', name: 'ConstantOutputLast', rebuilt: '<p>c</p>' },
];

describe.each([
	{ name: 'development compile', dev: true, runtime: 'development' },
	{ name: 'production compile', dev: false, runtime: 'development' },
	{ name: 'production compile and runtime', dev: false, runtime: 'production' },
])('hydrateRoot — a full component slot rebuilt in place ($name)', ({ dev, runtime }) => {
	const server = loadServerFixture(FIXTURE, { id: FILE });
	const client = loadCompiledFixtureSource(SOURCE, {
		id: FILE,
		mode: 'client',
		compileOptions: { dev },
	});
	// A production runtime reports the error code instead of the message.
	const MISMATCH =
		runtime === 'production'
			? /^Minified Octane error #51;/
			: /the server-rendered node did not match the client render/;
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
		'rebuilds the root of $call over the server element',
		async ({ name, rebuilt }) => {
			container.innerHTML = ServerRT.renderToString(server[name], { on: false }).html;
			const section = container.querySelector('section')!;
			const [em, u, b, hr] = section.children;
			expect(markup(section)).toBe(SERVER_SECTION);
			const recoverable: string[] = [];
			root = hydrateRoot(container, client[name], { on: true } as never, {
				onRecoverableError: (error: unknown) => recoverable.push((error as Error).message),
			});
			flushSync(() => {});
			// Recoverable reports are delivered after the hydration burst.
			await act(async () => {});

			const expected = `<em>e</em>${rebuilt}<b>p</b><hr>`;
			expect(container.querySelector('section')).toBe(section);
			expect(markup(section)).toBe(expected);
			expect(u.isConnected).toBe(false);
			expect([section.children[0], section.children[2], section.children[3]]).toEqual([em, b, hr]);
			expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
			// Only a development compile knows the template's source location.
			expect(warnings()).toEqual(dev ? [expect.stringMatching(STRUCTURAL)] : []);

			// The arm unmounts the rebuilt root with the rest of its content.
			flushSync(() => root!.render(client[name], { on: false }));
			expect(markup(container.querySelector('section')!)).toBe(SERVER_SECTION);
			expect(container.querySelectorAll('p')).toHaveLength(0);
			flushSync(() => root!.render(client[name], { on: true }));
			expect(markup(container.querySelector('section')!)).toBe(expected);
			expect(container.querySelectorAll('section')).toHaveLength(1);

			root!.unmount();
			root = null;
			expect(container.innerHTML).toBe('');
			expect(warnings()).toHaveLength(dev ? 1 : 0);
		},
	);

	it.each(LAST_CALLS)(
		"appends the rebuilt root of $call that is its host element's last child",
		async ({ name, rebuilt }) => {
			container.innerHTML = ServerRT.renderToString(server[name], { on: false }).html;
			const section = container.querySelector('section')!;
			const [hr, u] = section.children;
			expect(markup(section)).toBe(SERVER_LAST_SECTION);
			const recoverable: string[] = [];
			root = hydrateRoot(container, client[name], { on: true } as never, {
				onRecoverableError: (error: unknown) => recoverable.push((error as Error).message),
			});
			flushSync(() => {});
			await act(async () => {});

			const expected = `<hr>${rebuilt}`;
			expect(container.querySelector('section')).toBe(section);
			expect(markup(section)).toBe(expected);
			expect(u.isConnected).toBe(false);
			expect(section.firstElementChild).toBe(hr);
			expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
			expect(warnings()).toEqual(dev ? [expect.stringMatching(STRUCTURAL)] : []);

			flushSync(() => root!.render(client[name], { on: false }));
			expect(markup(container.querySelector('section')!)).toBe(SERVER_LAST_SECTION);
			flushSync(() => root!.render(client[name], { on: true }));
			expect(markup(container.querySelector('section')!)).toBe(expected);

			root!.unmount();
			root = null;
			expect(container.innerHTML).toBe('');
		},
	);
});
