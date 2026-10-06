import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'node:path';
import { act, flushSync, hydrateRoot } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadServerFixture } from '../_server-fixture';
import * as Fixtures from './_fixtures/in-place-nested-adoption.tsrx';
import { selectCallee, selectFlip } from './_fixtures/in-place-mismatch-swap-callee.tsrx';

// The server rendered another @if arm, and the client's arm calls a component
// that finds no server range of its own where the server's elements match.
//
// OCTANE DIVERGENCE: when that callee's body is itself a branch, the server
// rendered no range for the branch either. Octane's control-flow ranges are
// part of its hydration protocol, so a branch without one is a structural
// mismatch even where its elements match; React, which has no range markers
// and hydrates elements regardless of which component produced them, adopts
// them. The root renders on the client and reports once, and the client-built
// callee then swaps and converges like any other. Server nodes after a node
// that no client node renders are an unhydrated tail, which falls back the
// same way. The fixture is imported, so its import of the callee is a live
// binding: the `octane` project compiles it for development and `octane-prod`
// for production, where the production runtime runs it too.

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
	const MISMATCH = production
		? /^Minified Octane error #339;/
		: /^Hydration failed because the server rendered HTML didn't match the client\./;

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

	it('renders the root on the client for a single-root callee whose branch has no server range, then swaps it after a flip', async () => {
		const html = (n: string, node: string) => `<section title="${n}"><hr>${node}<hr></section>`;
		container.innerHTML = ServerRT.renderToString(server.SwapLeaf, { on: false, n: 'a' }).html;
		const serverElements = [...container.querySelectorAll('*')];
		selectFlip(true);
		hydrate('SwapLeaf', { on: true, n: 'a' });
		flushSync(() => {});
		// Recoverable reports are delivered after the hydration burst.
		await act(async () => {});
		expect(serverElements.filter((element) => element.isConnected)).toEqual([]);
		const host = container.querySelector('#r')!;
		expect(markup(host)).toBe(html('a', '<b>l</b>'));
		expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);
		const hrs = [...host.querySelectorAll('hr')];

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

	it('renders the root on the client for a single-root callee whose branch has no server range, then swaps it in place', async () => {
		const html = (n: string, node: string) => `<section title="${n}"><hr>${node}<hr></section>`;
		container.innerHTML = ServerRT.renderToString(server.SwapLeaf, { on: false, n: 'a' }).html;
		const serverElements = [...container.querySelectorAll('*')];
		selectFlip(true);
		hydrate('SwapLeaf', { on: true, n: 'a' });
		flushSync(() => {});
		await act(async () => {});
		expect(serverElements.filter((element) => element.isConnected)).toEqual([]);
		const host = container.querySelector('#r')!;
		expect(markup(host)).toBe(html('a', '<b>l</b>'));
		expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);

		selectCallee(true);
		render('SwapLeaf', { on: true, n: 'b' });
		expect(markup(host)).toBe(html('b', '<p>o</p>'));

		root!.unmount();
		root = null;
		expect(container.innerHTML).toBe('');
	});

	// The arm ends with the callee's adopted root, so what the server rendered
	// after it in the arm belongs to no client node.
	it('renders the root on the client for the server arm after the node a whole-arm callee adopted', async () => {
		container.innerHTML = ServerRT.renderToString(server.ArmTail, { on: false }).html;
		const serverHost = container.querySelector('#r')!;
		const serverElements = [...container.querySelectorAll('*')];
		expect(markup(serverHost)).toBe('<b>l</b><i>x</i>');
		selectFlip(true);
		hydrate('ArmTail', { on: true });
		flushSync(() => {});
		await act(async () => {});
		expect(serverElements.filter((element) => element.isConnected)).toEqual([]);
		const host = container.querySelector('#r')!;
		expect(markup(host)).toBe('<b>l</b>');
		expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);

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

	// A callee that is not single-root, whose body is a branch without a server
	// range, falls back like the single-root one. Once client-built, the
	// component its branch renders takes the callee's place exactly once.
	it('renders the root on the client for a callee that is not single-root, then converges its branch', async () => {
		const html = (node: string) => `<section><hr>${node}<hr></section>`;
		container.innerHTML = ServerRT.renderToString(server.Unframed, { on: false, leaf: true }).html;
		const serverElements = [...container.querySelectorAll('*')];
		hydrate('Unframed', { on: true, leaf: true });
		flushSync(() => {});
		await act(async () => {});
		expect(serverElements.filter((element) => element.isConnected)).toEqual([]);
		const host = container.querySelector('#r')!;
		expect(markup(host)).toBe(html('<b>l</b>'));
		expect(recoverable).toEqual([expect.stringMatching(MISMATCH)]);

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
