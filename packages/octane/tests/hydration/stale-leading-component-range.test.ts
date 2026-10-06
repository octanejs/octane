import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

// A stale node, such as one a browser extension inserted, stands before a
// component call's server range in an element. The call finds it where its
// range belongs, so it builds its content on the client and discards the
// stale node, leaving the server range that follows for a later sibling. When
// no sibling claims that range, it is the server's render of the same call,
// and hydration removes it once the element's owner has rendered: exactly one
// copy of the content remains, and the mismatch is reported once.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/stale-leading-component-range.tsrx',
);
const FILE = 'stale-leading-component-range.tsrx';
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

describe.each([
	{ name: 'development compile', dev: true },
	{ name: 'production compile', dev: false },
])('hydrateRoot — a stale node before a component range in an element ($name)', ({ dev }) => {
	const server = loadServerFixture(FIXTURE, { id: FILE });
	const client = loadCompiledFixtureSource(SOURCE, {
		id: FILE,
		mode: 'client',
		compileOptions: { dev, hmr: false },
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

	/** Server-render `name`, put a stale `<em>` first in its section if `stale`, and hydrate. */
	async function hydrate(name: string, stale: boolean) {
		container.innerHTML = ServerRT.renderToString(server[name], { label: 'x' }).html;
		const served = Array.from(container.querySelectorAll('button'));
		if (stale) container.querySelector('section')!.prepend(document.createElement('em'));
		const recoverable: unknown[] = [];
		root = hydrateRoot(
			container,
			client[name],
			{ label: 'x' },
			{ onRecoverableError: (error: unknown) => recoverable.push(error) },
		);
		// Recoverable reports are delivered after the hydration burst.
		await act(async () => {});
		return { served, recoverable };
	}

	it.each([
		{ name: 'Only', buttons: 1, hydrated: '<section><button>x</button></section>' },
		{
			name: 'BeforeTail',
			buttons: 1,
			hydrated: '<section><button>x</button><i>tail</i></section>',
		},
		{
			name: 'Pair',
			buttons: 2,
			hydrated: '<section><button>x</button><button>x2</button></section>',
		},
		{
			name: 'Sibling',
			buttons: 2,
			hydrated: '<div><section><button>x</button></section><p><button>x2</button></p></div>',
		},
		{ name: 'Nested', buttons: 1, hydrated: '<div><section><button>x</button></section></div>' },
		{ name: 'Arm', buttons: 1, hydrated: '<div><section><button>x</button></section></div>' },
		{ name: 'Row', buttons: 1, hydrated: '<div><section><button>x</button></section></div>' },
	])(
		'removes the server range left after the rebuilt call ($name)',
		async ({ name, buttons, hydrated }) => {
			const { recoverable } = await hydrate(name, true);
			expect(markup(container)).toBe(hydrated);
			expect(container.querySelectorAll('em')).toHaveLength(0);
			expect(container.querySelectorAll('button')).toHaveLength(buttons);
			expect(recoverable).toHaveLength(1);

			// Every call updates the button it hydrated, and nothing else is reported.
			await act(async () => root!.render(client[name], { label: 'y' }));
			expect(markup(container)).toBe(hydrated.replace(/>x/g, '>y'));
			expect(recoverable).toHaveLength(1);

			root!.unmount();
			root = null;
			expect(container.innerHTML).toBe('');
		},
	);

	it.each(['Only', 'BeforeTail', 'Pair', 'Sibling', 'Nested', 'Arm', 'Row'])(
		'adopts the server ranges when no stale node precedes them (%s)',
		async (name) => {
			const { served, recoverable } = await hydrate(name, false);
			const buttons = container.querySelectorAll('button');
			expect(buttons).toHaveLength(served.length);
			served.forEach((button, index) => expect(buttons[index]).toBe(button));
			expect(recoverable).toHaveLength(0);
			expect(errSpy).not.toHaveBeenCalled();
		},
	);
});
