import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import * as ServerRT from 'octane/server';
import { act, flushSync, hydrateRoot } from '../../src/index.js';
import { loadServerFixture } from '../_server-fixture.js';
import * as Client from './_fixtures/try-clone-thrower.tsrx';
import type { PageProps } from './_fixtures/try-clone-thrower.tsrx';

// A hydrating try body that throws to its catch arm.
//
// Where the server's body threw the same way, the server rendered the catch
// arm, and hydration adopts it: nothing differs, so nothing is reported. React
// has no counterpart, because its server renderer never renders an error
// boundary's fallback.
//
// Where the server rendered something else, the server HTML does not match, as
// in React: the nearest fallback owner (a @try/@pending arm, or else the root;
// a catch arm is not one) discards its server DOM and renders on the client,
// where the body throws again and its catch arm renders. As React does when
// that client render ends in a caught error, onCaughtError reports the error
// and onRecoverableError reports nothing, for the root as for an arm. A body
// that completes reports the mismatch once. While the root is suspended nothing
// commits, so the server content stays. Recoverable errors publish in dev and
// prod; console diagnostics in dev only.

const server = loadServerFixture(
	'packages/octane/tests/hydration/_fixtures/try-clone-thrower.tsrx',
);
const DEV = process.env.OCTANE_TEST_COMPILE_MODE !== 'prod';
const CATCH_ARM = '<div><h1>before</h1><p class="caught">x</p><button>after</button></div>';
const MISMATCH = /^Hydration failed because the server rendered HTML didn't match the client\./;

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

type Hosts = { div: Element; h1: Element; button: HTMLButtonElement };

function expectAdoptedHosts(hosts: Hosts, onAfter: ReturnType<typeof vi.fn>) {
	expect(container.querySelector('div')).toBe(hosts.div);
	expect(container.querySelector('h1')).toBe(hosts.h1);
	expect(container.querySelector('button')).toBe(hosts.button);
	hosts.button.click();
	expect(onAfter).toHaveBeenCalledTimes(1);
}

/** The root rendered on the client: no server host survives, and the new ones are live. */
function expectClientRoot(hosts: Hosts, onAfter: ReturnType<typeof vi.fn>) {
	expect([hosts.div, hosts.h1, hosts.button].some((host) => host.isConnected)).toBe(false);
	container.querySelector('button')!.click();
	expect(onAfter).toHaveBeenCalledTimes(1);
}

/** Development's diagnostic for the mismatch that failed the fallback owner. */
function expectMismatchDiagnostic() {
	expect(mismatches()).toEqual(
		DEV ? [expect.stringMatching(/the nearest Suspense or Hydrate boundary/i)] : [],
	);
}

/** Pages whose later child updates the page while it renders, by try body kind. */
const RERENDERS = [
	['@try', 'Rerender'],
	['compiled <ErrorBoundary>', 'RerenderBoundary'],
	['@try, from a child with state,', 'RerenderStateful'],
] as const;

/**
 * The development runtime's warning, as React's, that a child updated the page
 * while it rendered. It warns once per pair of components.
 */
function expectCrossRenderWarning(name: (typeof RERENDERS)[number][1]) {
	const child = name === 'RerenderStateful' ? 'StatefulUpdate' : 'Update';
	expect(
		consoleError.mock.calls
			.map(([message]) => String(message))
			.filter((message) => message.startsWith('Cannot update a component')),
	).toEqual(
		process.env.NODE_ENV !== 'production'
			? [
					expect.stringContaining(
						`Cannot update a component (\`${name}\`) while rendering a different component (\`${child}\`)`,
					),
				]
			: [],
	);
}

function expectStructuralReport(recovered: unknown[]) {
	expect(recovered).toEqual([expect.any(Error)]);
	expect((recovered[0] as Error).message).toMatch(MISMATCH);
	expectMismatchDiagnostic();
}

describe('hydrateRoot — a try body throws to the catch arm the server also rendered', () => {
	it.each<[string, PageName, Props, Props, string?]>([
		['a template clone', 'Clone', { value: 'x' }, {}],
		['a host with a class binding', 'Adopted', { value: 'x' }, {}],
		['a template-less range', 'Plain', { value: 'x' }, {}],
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
		['an outer clone, in the outer @try that catches it', 'Uncaught', { value: 'x' }, {}],
	])(
		'%s adopts it without a report',
		async (_, name, serverProps, clientProps, expected = CATCH_ARM) => {
			const { root, hosts, onAfter, recovered, caught } = await hydrateServerHtml(
				name,
				serverProps,
				{
					value: 'x',
					...clientProps,
				},
			);
			expect(visible()).toBe(expected);
			expectAdoptedHosts(hosts, onAfter);
			expect(caught).toEqual(['x']);
			expect(recovered).toEqual([]);
			expect(consoleError).not.toHaveBeenCalled();
			root.unmount();
		},
	);
});

describe('hydrateRoot — a try body throws to its catch arm where the server rendered another arm', () => {
	it.each<[string, PageName, Props, Props]>([
		['a template clone', 'Branch', { server: true }, {}],
		['a template-less range', 'Branch', { server: true }, { unframed: true }],
		[
			'a template clone in an inner @try, before the outer body throws',
			'Nested',
			{ server: true },
			{ value: undefined, outer: 'x' },
		],
	])(
		'%s renders the root on the client and reports only the caught error',
		async (_, name, serverProps, clientProps) => {
			const { root, hosts, onAfter, recovered, caught } = await hydrateServerHtml(
				name,
				serverProps,
				{
					value: 'x',
					...clientProps,
				},
			);
			expect(visible()).toBe(CATCH_ARM);
			expectClientRoot(hosts, onAfter);
			expect(caught).toEqual(['x']);
			expect(recovered).toEqual([]);
			expectMismatchDiagnostic();
			root.unmount();
		},
	);

	// The arm renders on the client and throws to the catch arm of the same
	// @try, which replaces the arm before it commits.
	it('a template clone in a @try with @pending renders its catch arm without a report', async () => {
		const { root, hosts, onAfter, recovered, caught } = await hydrateServerHtml(
			'PendingBranch',
			{ server: true },
			{ value: 'x' },
		);
		expect(visible()).toBe(CATCH_ARM);
		expectAdoptedHosts(hosts, onAfter);
		expect(caught).toEqual(['x']);
		expect(recovered).toEqual([]);
		root.unmount();
	});

	it('a template clone in an inner @try without @catch renders the outer catch arm without a report', async () => {
		const { root, hosts, onAfter, recovered, caught } = await hydrateServerHtml(
			'Uncaught',
			{ server: true },
			{ value: 'x' },
		);
		expect(visible()).toBe(CATCH_ARM);
		expectAdoptedHosts(hosts, onAfter);
		expect(caught).toEqual(['x']);
		expect(recovered).toEqual([]);
		root.unmount();
	});

	// The body throws only on the client while its inner @try arm hydrates, so
	// that arm fails and renders on the client, where the error repeats. As in
	// React, an error from client-rendered content reaches the outer catch arm
	// as any client error does: only the outer region is replaced.
	it('a client-only throw in an inner @try arm renders the outer catch arm without a report', async () => {
		const { root, hosts, onAfter, recovered, caught } = await hydrateServerHtml(
			'Uncaught',
			{},
			{ value: 'x' },
		);
		expect(visible()).toBe(CATCH_ARM);
		expectAdoptedHosts(hosts, onAfter);
		expect(caught).toEqual(['x']);
		expect(recovered).toEqual([]);
		expect(mismatches()).toEqual([]);
		root.unmount();
	});

	it('a passthrough boundary above the range owner renders the root on the client and reports only the caught error', async () => {
		container.innerHTML = ServerRT.renderToString(server.ServerSelection).html;
		const served = container.querySelector('b')!;
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
		expect(served.isConnected).toBe(false);
		expect(caught).toEqual(['x']);
		expect(recovered).toEqual([]);
		expectMismatchDiagnostic();
		root.unmount();
	});

	// An update that a hydrating render schedules for another component, here
	// the parent, applies after the hydration it interrupts, as in React: the
	// server, which ignores such an update, rendered the state before it, so the
	// server output hydrates first, then the update replaces only the arm it
	// changes. A child without state of its own is another component too.
	it.each(RERENDERS)(
		'applies an update scheduled while hydrating a %s body, which throws, after hydrating',
		async (_, name) => {
			const { root, hosts, onAfter, recovered, caught } = await hydrateServerHtml(
				name,
				{ value: 'x' },
				{ value: 'x', update: true },
			);
			await act(async () => {});
			expect(visible()).toBe(
				'<div><h1>before</h1><p class="caught">x</p><span>update</span><button>after</button></div>',
			);
			expectAdoptedHosts(hosts, onAfter);
			expect(caught).toEqual(['x']);
			expect(recovered).toEqual([]);
			expect(mismatches()).toEqual([]);
			expectCrossRenderWarning(name);
			root.unmount();
		},
	);
});

describe('hydrateRoot — a try body that does not reach its catch arm still reports', () => {
	it.each<[string, PageName, Props, string]>([
		[
			'a template clone that completes',
			'Branch',
			{},
			'<div><h1>before</h1><i>ok</i><button>after</button></div>',
		],
		[
			'a template-less range that completes',
			'Branch',
			{ unframed: true },
			'<div><h1>before</h1>settled<button>after</button></div>',
		],
		[
			'a template clone that completes in a compiled <ErrorBoundary>',
			'Boundary',
			{},
			'<div><h1>before</h1><i>ok</i><button>after</button></div>',
		],
		[
			'a template clone that completes in an inner @try, and the outer body completes',
			'Nested',
			{ outer: undefined },
			'<div><h1>before</h1><section><i>ok</i><i>ok</i></section><button>after</button></div>',
		],
	])('%s renders the root on the client', async (_, name, clientProps, expected) => {
		const { root, hosts, onAfter, recovered, caught } = await hydrateServerHtml(
			name,
			{ server: true },
			{ value: undefined, ...clientProps },
		);
		expect(visible()).toBe(expected);
		expectClientRoot(hosts, onAfter);
		expect(caught).toEqual([]);
		expectStructuralReport(recovered);
		root.unmount();
	});

	// A body that throws only while hydrating fails the root's hydration even
	// though its catch arm would catch the error. As in React, the client render
	// completes without throwing, so the root reports its failed hydration, with
	// the thrown error as the cause, and the catch arm never renders.
	it('a body that throws only while hydrating renders the root on the client and reports the error', async () => {
		const { root, hosts, onAfter, recovered, caught } = await hydrateServerHtml(
			'Flaky',
			{},
			{ once: { thrown: false } },
		);
		expect(visible()).toBe('<div><h1>before</h1><i>ok</i><button>after</button></div>');
		expectClientRoot(hosts, onAfter);
		expect(caught).toEqual([]);
		expect(recovered).toEqual([expect.any(Error)]);
		expect((recovered[0] as Error).message).toMatch(/^There was an error while hydrating/);
		expect((recovered[0] as Error & { cause?: unknown }).cause).toEqual(
			new Error('hydration only'),
		);
		expect(mismatches()).toEqual([]);
		root.unmount();
	});

	it('a template clone that completes in a @try with @pending renders only the arm on the client', async () => {
		const { root, hosts, onAfter, recovered, caught } = await hydrateServerHtml(
			'PendingBranch',
			{ server: true },
			{ value: undefined },
		);
		expect(visible()).toBe('<div><h1>before</h1><i>ok</i><button>after</button></div>');
		expectAdoptedHosts(hosts, onAfter);
		expect(caught).toEqual([]);
		expectStructuralReport(recovered);
		root.unmount();
	});

	it('keeps the server class of a host that completes and warns in development', async () => {
		const { root, hosts, onAfter, recovered, caught } = await hydrateServerHtml(
			'Adopted',
			{ server: true },
			{ value: undefined },
		);
		expect(visible()).toBe(
			'<div><h1>before</h1><p class="server"><b>ok</b></p><button>after</button></div>',
		);
		expectAdoptedHosts(hosts, onAfter);
		expect(caught).toEqual([]);
		// A class difference is never patched, and is not a recoverable error.
		expect(recovered).toEqual([]);
		expect(mismatches()).toEqual(
			DEV
				? [
						expect.stringContaining(
							'attribute `class`: the server rendered "server", the client "client"',
						),
					]
				: [],
		);
		root.unmount();
	});

	it('keeps the server content while a root that renders on the client is suspended', async () => {
		let resolve!: (value: string) => void;
		const promise = new Promise<string>((done) => (resolve = done));
		const { root, hosts, onAfter, recovered, caught } = await hydrateServerHtml(
			'Branch',
			{ server: true },
			{ value: undefined, promise },
		);
		expect(visible()).toBe(
			'<div><h1>before</h1><b class="server">server</b><button>after</button></div>',
		);
		expect(recovered).toEqual([]);
		expect(mismatches()).toEqual([]);

		await act(async () => {
			resolve('ok');
			await promise;
		});
		expect(visible()).toBe('<div><h1>before</h1><i>ok</i><button>after</button></div>');
		expectClientRoot(hosts, onAfter);
		expect(caught).toEqual([]);
		expectStructuralReport(recovered);
		root.unmount();
	});

	// OCTANE DIVERGENCE: the server's @if range shows that it rendered another
	// arm before the client arm renders, so the mismatch is found before the arm
	// suspends. The @try arm renders on the client at once and shows its
	// @pending arm until the value resolves, where React, which first compares
	// host elements, suspends while it still shows the server's content.
	it('renders a mismatched @try arm on the client and shows its @pending arm until the value resolves', async () => {
		let resolve!: (value: string) => void;
		const promise = new Promise<string>((done) => (resolve = done));
		const { root, hosts, onAfter, recovered, caught } = await hydrateServerHtml(
			'PendingBranch',
			{ server: true },
			{ value: undefined, promise },
		);
		expect(visible()).toBe(
			'<div><h1>before</h1><span class="pending">pending</span><button>after</button></div>',
		);
		expectStructuralReport(recovered);

		await act(async () => {
			resolve('ok');
			await promise;
		});
		expect(visible()).toBe('<div><h1>before</h1><i>ok</i><button>after</button></div>');
		expectAdoptedHosts(hosts, onAfter);
		expect(caught).toEqual([]);
		expect(recovered).toHaveLength(1);
		root.unmount();
	});

	it.each(RERENDERS)(
		'applies an update scheduled while hydrating a %s body, which completes, after hydrating',
		async (_, name) => {
			const { root, hosts, onAfter, recovered, caught } = await hydrateServerHtml(
				name,
				{ value: undefined },
				{ value: undefined, update: true },
			);
			await act(async () => {});
			expect(visible()).toBe(
				'<div><h1>before</h1><i>ok</i><span>update</span><button>after</button></div>',
			);
			expectAdoptedHosts(hosts, onAfter);
			expect(caught).toEqual([]);
			expect(recovered).toEqual([]);
			expect(mismatches()).toEqual([]);
			root.unmount();
		},
	);

	it('renders the root on the client for a passthrough boundary whose clone completes', async () => {
		container.innerHTML = ServerRT.renderToString(server.ServerSelection).html;
		const served = container.querySelector('b')!;
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
		expect(served.isConnected).toBe(false);
		expectStructuralReport(recovered);
		root.unmount();
	});
});
