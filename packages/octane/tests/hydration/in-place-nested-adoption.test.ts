import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadServerFixture } from '../_server-fixture';
import * as Fixtures from './_fixtures/in-place-nested-adoption.tsrx';
import { selectCallee, selectFlip } from './_fixtures/in-place-mismatch-swap-callee.tsrx';

// A component call that finds no server range of its own renders in place of
// the server node at its position. When the callee's body is a branch whose
// arm renders another component, and that component's root adopts the node,
// the callee adopted it too: the adopted node is the callee's root, which a
// later swap of the callee removes, and the server nodes after it belong to
// later siblings or to no client node at all. The fixture is imported, so its
// import of the callee is a live binding: the `octane` project compiles it for
// development and `octane-prod` for production, where the production runtime
// runs it too.

const FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/in-place-nested-adoption.tsrx',
);
const CALLEE_FIXTURE = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/in-place-mismatch-swap-callee.tsrx',
);

/** Element and text markup, ignoring hydration comments. */
function markup(node: Element): string {
	const copy = node.cloneNode(true) as Element;
	const walker = document.createTreeWalker(copy, NodeFilter.SHOW_COMMENT);
	const comments: Node[] = [];
	while (walker.nextNode()) comments.push(walker.currentNode);
	for (const comment of comments) comment.parentNode!.removeChild(comment);
	return copy.innerHTML;
}

describe('hydrateRoot — a component call whose branch adopts the server node in place', () => {
	const server = loadServerFixture(FIXTURE, {
		id: 'in-place-nested-adoption.tsrx',
		runtimeModules: {
			'./in-place-mismatch-swap-callee.tsrx': loadServerFixture(CALLEE_FIXTURE, {
				id: 'in-place-mismatch-swap-callee.tsrx',
			}),
		},
	});
	const production = process.env.OCTANE_TEST_COMPILE_MODE === 'prod';
	const client = Fixtures as Record<string, (props: object) => void>;
	// A production runtime reports the error code instead of the message.
	const TAIL_MISMATCH = production
		? /^Minified Octane error #51;/
		: /the server-rendered node did not match the client render/;

	let container: HTMLElement;
	let root: ReturnType<typeof hydrateRoot> | null;
	let recoverable: string[];
	let errSpy: ReturnType<typeof vi.spyOn>;

	function hydrate(name: string, props: object): void {
		root = hydrateRoot(container, client[name], props as never, {
			onRecoverableError: (error: unknown) => recoverable.push((error as Error).message),
		});
	}

	function render(name: string, props: object): void {
		flushSync(() => root!.render(client[name], props as never));
	}

	beforeEach(() => {
		selectFlip(false);
		container = document.createElement('div');
		document.body.appendChild(container);
		root = null;
		recoverable = [];
		errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		if (production) vi.stubEnv('NODE_ENV', 'production');
	});

	afterEach(() => {
		root?.unmount();
		vi.unstubAllEnvs();
		container.remove();
		errSpy.mockRestore();
		selectFlip(false);
		selectCallee(false);
	});

	it('swaps a single-root callee after its branch adopted the server node and flipped', async () => {
		const html = (n: string, node: string) => `<section title="${n}"><hr>${node}<hr></section>`;
		container.innerHTML = ServerRT.renderToString(server.SwapLeaf, { on: false, n: 'a' }).html;
		const host = container.querySelector('#r')!;
		const b = host.querySelector('b')!;
		const hrs = [...host.querySelectorAll('hr')];
		selectFlip(true);
		hydrate('SwapLeaf', { on: true, n: 'a' });
		flushSync(() => {});
		// Recoverable reports are delivered after the hydration burst.
		await act(async () => {});
		expect(markup(host)).toBe(html('a', '<b>l</b>'));
		expect(host.querySelector('b')).toBe(b);
		expect(recoverable).toEqual([]);

		selectFlip(false);
		render('SwapLeaf', { on: true, n: 'b' });
		expect(markup(host)).toBe(html('b', '<p>f</p>'));

		// The new callee replaces the branch's whole range.
		selectCallee(true);
		render('SwapLeaf', { on: true, n: 'c' });
		expect(markup(host)).toBe(html('c', '<p>o</p>'));
		expect(hrs.every((hr) => hr.isConnected)).toBe(true);

		selectCallee(false);
		render('SwapLeaf', { on: true, n: 'd' });
		expect(markup(host)).toBe(html('d', '<p>p</p>'));

		root!.unmount();
		root = null;
		expect(container.innerHTML).toBe('');
	});

	it('swaps a single-root callee whose branch still renders the adopted node', async () => {
		const html = (n: string, node: string) => `<section title="${n}"><hr>${node}<hr></section>`;
		container.innerHTML = ServerRT.renderToString(server.SwapLeaf, { on: false, n: 'a' }).html;
		const host = container.querySelector('#r')!;
		selectFlip(true);
		hydrate('SwapLeaf', { on: true, n: 'a' });
		flushSync(() => {});
		await act(async () => {});
		expect(markup(host)).toBe(html('a', '<b>l</b>'));

		selectCallee(true);
		render('SwapLeaf', { on: true, n: 'b' });
		expect(markup(host)).toBe(html('b', '<p>o</p>'));

		root!.unmount();
		root = null;
		expect(container.innerHTML).toBe('');
	});

	// The arm ends with the callee's adopted root, so what the server rendered
	// after it in the arm belongs to no client node.
	it('discards the server arm after the node a whole-arm callee adopted', async () => {
		container.innerHTML = ServerRT.renderToString(server.ArmTail, { on: false }).html;
		const host = container.querySelector('#r')!;
		const b = host.querySelector('b')!;
		expect(markup(host)).toBe('<b>l</b><i>x</i>');
		selectFlip(true);
		hydrate('ArmTail', { on: true });
		flushSync(() => {});
		await act(async () => {});
		expect(markup(host)).toBe('<b>l</b>');
		expect(host.querySelector('b')).toBe(b);
		expect(recoverable).toEqual([expect.stringMatching(TAIL_MISMATCH)]);

		selectFlip(false);
		render('ArmTail', { on: true });
		expect(markup(host)).toBe('<p>f</p>');
		selectCallee(true);
		render('ArmTail', { on: true });
		expect(markup(host)).toBe('<p>o</p>');
		render('ArmTail', { on: false });
		expect(markup(host)).toBe('<b>l</b><i>x</i>');

		root!.unmount();
		root = null;
		expect(container.innerHTML).toBe('');
	});

	// A callee that is not single-root renders unframed in place of the server
	// node. Whether or not the component its branch renders adopts that node,
	// that component's root takes the node's place exactly once.
	it('converges a callee that is not single-root whose branch renders a component there', async () => {
		const html = (node: string) => `<section><hr>${node}<hr></section>`;
		container.innerHTML = ServerRT.renderToString(server.Unframed, { on: false, leaf: true }).html;
		const host = container.querySelector('#r')!;
		hydrate('Unframed', { on: true, leaf: true });
		flushSync(() => {});
		await act(async () => {});
		expect(markup(host)).toBe(html('<b>l</b>'));

		render('Unframed', { on: true, leaf: false });
		expect(markup(host)).toBe(html('<p>f</p><p>g</p>'));
		render('Unframed', { on: true, leaf: true });
		expect(markup(host)).toBe(html('<b>l</b>'));
		render('Unframed', { on: false, leaf: true });
		expect(markup(host)).toBe(html('<b>l</b>'));

		root!.unmount();
		root = null;
		expect(container.innerHTML).toBe('');
	});
});
