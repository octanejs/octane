import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import * as ServerRT from 'octane/server';
import { flushSync, hydrateRoot } from '../../src/index.js';
import { loadServerFixture } from '../_server-fixture.js';
import * as Client from './_fixtures/try-clone-thrower.tsrx';
import type { PageProps } from './_fixtures/try-clone-thrower.tsrx';

// A hydrating try body that throws to its catch arm gets a catch arm built on
// the client, which replaces the region. What the body adopted before it threw
// (a template's cloned root, or a template-less component's range) was compared
// against server content that is about to be discarded: often the server's own
// catch arm, rendered because the server's body threw the same way. None of it
// is a mismatch. A body that completes or suspends still reports one; a root
// that suspends reports from the attempt that commits.
// Recoverable errors publish in dev and prod; console diagnostics in dev only.

const server = loadServerFixture(
	'packages/octane/tests/hydration/_fixtures/try-clone-thrower.tsrx',
);
const DEV = process.env.OCTANE_TEST_COMPILE_MODE !== 'prod';
const CATCH_ARM = '<div><h1>before</h1><p class="caught">x</p><button>after</button></div>';
const CLONE_MISMATCH = 'the client expected <i> but the server rendered <b>';

type PageName = Exclude<keyof typeof Client, 'ServerSelection' | 'PassthroughBoundary'>;
type Props = Omit<PageProps, 'onAfter'>;

let container: HTMLElement;
let consoleError: MockInstance<typeof console.error>;
beforeEach(() => {
	container = document.createElement('div');
	document.body.appendChild(container);
	consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
	container.remove();
	consoleError.mockRestore();
});

async function hydrateServerHtml(name: PageName, serverProps: Props, clientProps: Props) {
	container.innerHTML = ServerRT.renderToString(server[name], {
		...serverProps,
		onAfter: () => {},
	}).html;
	const div = container.querySelector('div')!;
	const hosts = { div, h1: div.querySelector('h1')!, button: div.querySelector('button')! };
	const onAfter = vi.fn();
	const recovered: unknown[] = [];
	const caught: unknown[] = [];
	const root = hydrateRoot(
		container,
		Client[name],
		{ ...clientProps, onAfter },
		{
			onRecoverableError: (error) => recovered.push(error),
			onCaughtError: (error) => caught.push(error),
		},
	);
	flushSync(() => {});
	// Recoverable and caught errors are published after the hydrating render.
	await new Promise((resolve) => setTimeout(resolve, 0));
	return { root, hosts, onAfter, recovered, caught };
}

/** The rendered elements and text, without the runtime's range markers. */
function visible(): string {
	return container.innerHTML.replace(/<!--[\s\S]*?-->/g, '');
}

/** Hydration diagnostics logged in development. */
function mismatches(): string[] {
	return consoleError.mock.calls
		.map(([message]) => String(message))
		.filter((message) => message.startsWith('Octane hydration mismatch'));
}

function expectAdoptedHosts(
	hosts: { div: Element; h1: Element; button: HTMLButtonElement },
	onAfter: ReturnType<typeof vi.fn>,
) {
	expect(container.querySelector('div')).toBe(hosts.div);
	expect(container.querySelector('h1')).toBe(hosts.h1);
	expect(container.querySelector('button')).toBe(hosts.button);
	hosts.button.click();
	expect(onAfter).toHaveBeenCalledTimes(1);
}

describe('hydrateRoot — a try body throws to its catch arm after adopting', () => {
	it.each<[string, PageName, Props, Props, string?]>([
		['a template clone, where the server rendered the @catch arm', 'Clone', { value: 'x' }, {}],
		['a host with a class binding, adopted from the @catch arm', 'Adopted', { value: 'x' }, {}],
		[
			'a template-less range, where the server rendered the @catch arm',
			'Plain',
			{ value: 'x' },
			{},
		],
		['a template clone, where the server rendered another arm', 'Branch', { server: true }, {}],
		[
			'a template-less range, where the server rendered another arm',
			'Branch',
			{ server: true },
			{ unframed: true },
		],
		['a template clone, in a @try with @pending', 'PendingBranch', { server: true }, {}],
		['a template clone, in a compiled <ErrorBoundary>', 'Boundary', { value: 'x' }, {}],
		[
			'a template clone, in an <ErrorBoundary> component',
			'DynamicBoundary',
			{ value: 'x', fallback: 'x' },
			{ fallback: 'x' },
			'<div><h1>before</h1>x<button>after</button></div>',
		],
		[
			'a template clone, in an inner @try that catches it',
			'Nested',
			{ value: 'x' },
			{ outer: undefined },
			'<div><h1>before</h1><section><p class="inner">x</p><i>ok</i></section><button>after</button></div>',
		],
		[
			'a template clone, in an inner @try, before the outer body throws',
			'Nested',
			{ server: true },
			{ value: undefined, outer: 'x' },
		],
		[
			'a template clone, in an inner @try without @catch',
			'Uncaught',
			{ server: true },
			{ value: 'x' },
		],
		[
			'an outer clone, where the server rendered the outer @catch arm',
			'Uncaught',
			{ value: 'x' },
			{},
		],
	])('%s', async (_, name, serverProps, clientProps, expected = CATCH_ARM) => {
		const { root, hosts, onAfter, recovered, caught } = await hydrateServerHtml(name, serverProps, {
			value: 'x',
			...clientProps,
		});
		expect(visible()).toBe(expected);
		expectAdoptedHosts(hosts, onAfter);
		expect(caught).toEqual(['x']);
		expect(recovered).toEqual([]);
		expect(consoleError).not.toHaveBeenCalled();
		root.unmount();
	});

	it.each([
		['@try', 'Rerender'],
		['compiled <ErrorBoundary>', 'RerenderBoundary'],
	] as const)(
		're-renders a hydrating %s body for a drained update, which throws',
		async (_, name) => {
			const { root, hosts, onAfter, recovered, caught } = await hydrateServerHtml(
				name,
				{ value: 'x' },
				{ value: 'x', update: true },
			);
			expect(visible()).toBe(
				'<div><h1>before</h1><p class="caught">x</p><span>update</span><button>after</button></div>',
			);
			expectAdoptedHosts(hosts, onAfter);
			expect(caught).toEqual(['x']);
			expect(recovered).toEqual([]);
			expect(mismatches()).toEqual([]);
			root.unmount();
		},
	);

	it('throws in a passthrough boundary above the range owner', async () => {
		container.innerHTML = ServerRT.renderToString(server.ServerSelection).html;
		const recovered: unknown[] = [];
		const caught: unknown[] = [];
		const root = hydrateRoot(
			container,
			Client.PassthroughBoundary,
			{ value: 'x' },
			{
				onRecoverableError: (error) => recovered.push(error),
				onCaughtError: (error) => caught.push(error),
			},
		);
		flushSync(() => {});
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(visible()).toBe('<p class="caught">caught</p>');
		expect(caught).toEqual(['x']);
		expect(recovered).toEqual([]);
		expect(consoleError).not.toHaveBeenCalled();
		root.unmount();
	});
});

describe('hydrateRoot — a try body that does not reach its catch arm still reports', () => {
	it.each<[string, PageName, Props, string, string]>([
		[
			'a template clone that completes',
			'Branch',
			{},
			'<div><h1>before</h1><i>ok</i><button>after</button></div>',
			CLONE_MISMATCH,
		],
		[
			'a template-less range that completes',
			'Branch',
			{ unframed: true },
			'<div><h1>before</h1>settled<button>after</button></div>',
			'the client expected a component range but the server rendered <b>',
		],
		[
			'a template clone that completes in a @try with @pending',
			'PendingBranch',
			{},
			'<div><h1>before</h1><i>ok</i><button>after</button></div>',
			CLONE_MISMATCH,
		],
		[
			'a template clone that completes in a compiled <ErrorBoundary>',
			'Boundary',
			{},
			'<div><h1>before</h1><i>ok</i><button>after</button></div>',
			CLONE_MISMATCH,
		],
		[
			'a template clone that completes in an inner @try, and the outer body completes',
			'Nested',
			{ outer: undefined },
			'<div><h1>before</h1><section><i>ok</i><i>ok</i></section><button>after</button></div>',
			CLONE_MISMATCH,
		],
	])('%s', async (_, name, clientProps, expected, message) => {
		const { root, hosts, onAfter, recovered, caught } = await hydrateServerHtml(
			name,
			{ server: true },
			{ value: undefined, ...clientProps },
		);
		expect(visible()).toBe(expected);
		expectAdoptedHosts(hosts, onAfter);
		expect(caught).toEqual([]);
		expect(recovered).toHaveLength(1);
		if (DEV) expect(mismatches()).toContainEqual(expect.stringContaining(message));
		else expect(consoleError).not.toHaveBeenCalled();
		root.unmount();
	});

	it('reports a class binding on a host that completes', async () => {
		const { root, hosts, onAfter, recovered, caught } = await hydrateServerHtml(
			'Adopted',
			{ server: true },
			{ value: undefined },
		);
		expect(visible()).toBe(
			'<div><h1>before</h1><p class="client"><b>ok</b></p><button>after</button></div>',
		);
		expectAdoptedHosts(hosts, onAfter);
		expect(caught).toEqual([]);
		// A class value mismatch patches the value without a recoverable error.
		expect(recovered).toEqual([]);
		expect(mismatches()).toEqual(
			DEV ? [expect.stringContaining('server rendered attribute `class` "server"')] : [],
		);
		root.unmount();
	});

	it('reports a template clone that suspends in a @try with @pending', async () => {
		const { root, recovered, caught } = await hydrateServerHtml(
			'PendingBranch',
			{ server: true },
			{ value: undefined, promise: new Promise(() => {}) },
		);
		expect(caught).toEqual([]);
		expect(recovered).toHaveLength(1);
		expect(mismatches()).toEqual(DEV ? [expect.stringContaining(CLONE_MISMATCH)] : []);
		root.unmount();
	});

	// Without @pending the root suspends, keeps the server content, and the
	// attempt that commits after the promise resolves reports the clone.
	it('reports a template clone that suspends its root once the root commits', async () => {
		let resolve!: (value: string) => void;
		const promise = new Promise<string>((done) => (resolve = done));
		const { root, recovered, caught } = await hydrateServerHtml(
			'Branch',
			{ server: true },
			{ value: undefined, promise },
		);
		expect(visible()).toBe(
			'<div><h1>before</h1><b class="server">server</b><button>after</button></div>',
		);
		expect(recovered).toEqual([]);
		expect(mismatches()).toEqual([]);

		resolve('ok');
		await promise;
		await new Promise((done) => setTimeout(done, 0));
		expect(visible()).toBe('<div><h1>before</h1><i>ok</i><button>after</button></div>');
		expect(caught).toEqual([]);
		expect(recovered).toHaveLength(1);
		expect(mismatches()).toEqual(DEV ? [expect.stringContaining(CLONE_MISMATCH)] : []);
		root.unmount();
	});

	it.each([
		['@try', 'Rerender'],
		['compiled <ErrorBoundary>', 'RerenderBoundary'],
	] as const)(
		'reports a hydrating %s body re-rendered for a drained update, which completes',
		async (_, name) => {
			const { root, hosts, onAfter, recovered, caught } = await hydrateServerHtml(
				name,
				{ value: undefined },
				{ value: undefined, update: true },
			);
			expect(visible()).toBe(
				'<div><h1>before</h1><i>ok</i><span>update</span><button>after</button></div>',
			);
			expectAdoptedHosts(hosts, onAfter);
			expect(caught).toEqual([]);
			expect(recovered).toHaveLength(1);
			if (DEV) expect(mismatches()).toContainEqual(expect.stringContaining('expected <i>'));
			else expect(mismatches()).toEqual([]);
			root.unmount();
		},
	);

	it('reports a passthrough boundary whose clone completes', async () => {
		container.innerHTML = ServerRT.renderToString(server.ServerSelection).html;
		const recovered: unknown[] = [];
		const root = hydrateRoot(
			container,
			Client.PassthroughBoundary,
			{ value: undefined },
			{ onRecoverableError: (error) => recovered.push(error) },
		);
		flushSync(() => {});
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(visible()).toBe('<i>ok</i>');
		expect(recovered).toHaveLength(1);
		if (DEV) expect(mismatches()).toContainEqual(expect.stringContaining(CLONE_MISMATCH));
		else expect(consoleError).not.toHaveBeenCalled();
		root.unmount();
	});
});
