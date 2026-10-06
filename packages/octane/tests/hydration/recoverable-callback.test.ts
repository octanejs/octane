// React 19 root option parity: hydrateRoot's onRecoverableError. As in React, a
// hydration mismatch is never repaired in place: the nearest fallback owner (a
// Suspense or @try arm, a Hydrate island, or else the root) discards its server
// DOM and renders on the client, and the callback fires once per owner that
// falls back, in development and production. Attribute differences keep the
// server value and do not report: React production does not compare them.
// The callback receives only the error (no errorInfo/componentStack), matching
// the documented SSR onError shape.
import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createRoot, hydrateRoot, flushSync, lazy } from '../../src/index.js';
import { condition, load } from 'octane/hydration';
import * as ServerRT from 'octane/server';
import { loadCompiledFixtureSource, loadServerFixture } from '../_server-fixture';

const SWAP = join(process.cwd(), 'packages/octane/tests/hydration/_fixtures/swap.tsrx');
const DISCARDED = join(
	process.cwd(),
	'packages/octane/tests/hydration/_fixtures/discarded-server-range.tsrx',
);

function serverModule(fixture: string, file: string): Record<string, any> {
	return loadServerFixture(fixture, { id: file });
}

function clientModule(fixture: string, file: string, dev: boolean): Record<string, any> {
	return loadCompiledFixtureSource(readFileSync(fixture, 'utf8'), {
		id: file,
		mode: 'client',
		compileOptions: { dev },
	});
}

describe('hydrateRoot — onRecoverableError', () => {
	let container: HTMLElement;
	let errSpy: MockInstance<typeof console.error>;
	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
		errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
	});
	afterEach(() => {
		container.remove();
		errSpy.mockRestore();
	});

	const srv = serverModule(SWAP, 'swap.tsrx');
	const cliDev = clientModule(SWAP, 'swap.tsrx', true);
	const cliProd = clientModule(SWAP, 'swap.tsrx', false);

	it('fires after a structural mismatch client-renders the root (dev compile)', async () => {
		const { html } = await ServerRT.renderToString(srv.Swap, { host: true });
		container.innerHTML = html;
		const onRecoverableError = vi.fn();
		const serverHost = container.querySelector('#swap');
		hydrateRoot(container, cliDev.Swap, { host: false }, { onRecoverableError });
		flushSync(() => {});
		// The fallback is synchronous; the report is delivered after the burst.
		await Promise.resolve();
		expect(container.querySelector('b.inner')).not.toBeNull();
		expect(container.querySelector('p.host')).toBeNull();
		expect(serverHost!.isConnected).toBe(false);
		expect(onRecoverableError).toHaveBeenCalledTimes(1);
		expect(String((onRecoverableError.mock.calls[0][0] as Error).message)).toMatch(
			/server rendered HTML didn't match the client/,
		);
	});

	it('fires in PROD compile too (the fallback runs everywhere; only the warning is dev-only)', async () => {
		const { html } = await ServerRT.renderToString(srv.Swap, { host: true });
		container.innerHTML = html;
		const onRecoverableError = vi.fn();
		hydrateRoot(container, cliProd.Swap, { host: false }, { onRecoverableError });
		flushSync(() => {});
		await Promise.resolve();
		expect(container.querySelector('b.inner')).not.toBeNull();
		expect(onRecoverableError).toHaveBeenCalledTimes(1);
	});

	it('reports a root fallback once', async () => {
		// The server rendered the host branch and the client renders the component
		// branch: the root falls back once, however much of it differs.
		const { html } = await ServerRT.renderToString(srv.Swap, { host: true });
		container.innerHTML = html;
		const onRecoverableError = vi.fn();
		hydrateRoot(container, cliDev.Swap, { host: false }, { onRecoverableError });
		flushSync(() => {});
		await Promise.resolve();
		await Promise.resolve();
		expect(onRecoverableError).toHaveBeenCalledTimes(1);
	});

	it('keeps recoverable reports isolated between separate hydrating roots', async () => {
		const other = document.createElement('div');
		document.body.appendChild(other);
		try {
			const { html } = await ServerRT.renderToString(srv.Swap, { host: true });
			container.innerHTML = html;
			other.innerHTML = html;
			const first = vi.fn();
			const second = vi.fn();
			hydrateRoot(container, cliDev.Swap, { host: false }, { onRecoverableError: first });
			hydrateRoot(other, cliDev.Swap, { host: false }, { onRecoverableError: second });
			flushSync(() => {});
			await Promise.resolve();
			expect(first).toHaveBeenCalledTimes(1);
			expect(second).toHaveBeenCalledTimes(1);
			expect(container.querySelector('b.inner')).not.toBeNull();
			expect(other.querySelector('b.inner')).not.toBeNull();
		} finally {
			other.remove();
		}
	});

	it('retains the fallback report when the root updates before callback delivery', async () => {
		const { html } = await ServerRT.renderToString(srv.Swap, { host: true });
		container.innerHTML = html;
		const onRecoverableError = vi.fn();
		const root = hydrateRoot(container, cliDev.Swap, { host: false }, { onRecoverableError });
		flushSync(() => root.render(cliDev.Swap, { host: true }));
		expect(container.querySelector('p.host')).not.toBeNull();
		expect(onRecoverableError).not.toHaveBeenCalled();
		await Promise.resolve();
		expect(onRecoverableError).toHaveBeenCalledTimes(1);
	});

	it('reports a throwing recovery callback without undoing the client-rendered DOM', async () => {
		const { html } = await ServerRT.renderToString(srv.Swap, { host: true });
		container.innerHTML = html;
		const failure = new Error('recovery callback failed');
		const onRecoverableError = vi.fn(() => {
			throw failure;
		});
		hydrateRoot(container, cliDev.Swap, { host: false }, { onRecoverableError });
		flushSync(() => {});
		await Promise.resolve();
		expect(onRecoverableError).toHaveBeenCalledTimes(1);
		expect(errSpy.mock.calls.some((call) => call[0] === failure)).toBe(true);
		expect(container.querySelector('b.inner')).not.toBeNull();
	});

	it('control: a MATCHED hydration never fires the callback', async () => {
		const { html } = await ServerRT.renderToString(srv.Swap, { host: true });
		container.innerHTML = html;
		const onRecoverableError = vi.fn();
		hydrateRoot(container, cliDev.Swap, { host: true }, { onRecoverableError });
		flushSync(() => {});
		await Promise.resolve();
		expect(onRecoverableError).not.toHaveBeenCalled();
	});

	it('control: a mismatch without the option still client-renders and warns in development', async () => {
		const { html } = await ServerRT.renderToString(srv.Swap, { host: true });
		container.innerHTML = html;
		hydrateRoot(container, cliDev.Swap, { host: false });
		flushSync(() => {});
		expect(container.querySelector('b.inner')).not.toBeNull();
		const warns = errSpy.mock.calls.map((c) => String(c[0]));
		expect(warns.some((m) => m.includes('hydration mismatch'))).toBe(true);
	});
});

// Every structural difference falls back and reports once, whichever construct
// found it: an @if arm, a list's items or @empty arm, a branch range the server
// encoded as something else, or a runtime host's content.
describe.each([
	{ name: 'development compile', dev: true },
	{ name: 'production compile', dev: false },
])('hydrateRoot — onRecoverableError for discarded server content ($name)', ({ dev }) => {
	const server = serverModule(DISCARDED, 'discarded-server-range.tsrx');
	const client = clientModule(DISCARDED, 'discarded-server-range.tsrx', dev);
	let container: HTMLElement;
	let errSpy: MockInstance<typeof console.error>;
	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
		errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
	});
	afterEach(() => {
		container.remove();
		errSpy.mockRestore();
	});

	const warns = () =>
		errSpy.mock.calls.map((c) => String(c[0])).filter((m) => m.includes('hydration mismatch'));

	function markup(node: Element): string {
		const copy = node.cloneNode(true) as Element;
		const walker = document.createTreeWalker(copy, NodeFilter.SHOW_COMMENT);
		const comments: Node[] = [];
		while (walker.nextNode()) comments.push(walker.currentNode);
		for (const comment of comments) comment.parentNode!.removeChild(comment);
		return copy.innerHTML;
	}

	function clientMarkup(name: string, props: Record<string, unknown>, selector?: string): string {
		const fresh = document.createElement('div');
		const root = createRoot(fresh);
		flushSync(() => root.render(client[name], props));
		const out = markup(selector === undefined ? fresh : fresh.querySelector(selector)!);
		root.unmount();
		return out;
	}

	async function settledReports(recovered: unknown[]): Promise<unknown[]> {
		// Reports arrive on a microtask after the hydration burst.
		await Promise.resolve();
		await Promise.resolve();
		return recovered;
	}

	it.each([
		{
			what: 'an @if arm only the server rendered',
			name: 'Branch',
			from: { on: true },
			to: { on: false },
		},
		{
			what: 'list items where the client renders @empty',
			name: 'Rows',
			from: { rows: ['a', 'b'] },
			to: { rows: [] },
		},
		{
			what: 'a list @empty arm where the client renders items',
			name: 'Rows',
			from: { rows: [] },
			to: { rows: ['a', 'b'] },
		},
		{
			what: 'runtime host text where the client renders an element',
			name: 'Host',
			from: { text: true },
			to: { text: false },
		},
	])('reports $what once', async ({ name, from, to }) => {
		container.innerHTML = ServerRT.renderToString(server[name], from).html;
		const serverRoot = container.firstElementChild!;
		const recovered: unknown[] = [];
		const root = hydrateRoot(container, client[name], to, {
			onRecoverableError: (error) => recovered.push(error),
		});
		flushSync(() => {});
		try {
			// No boundary encloses the difference, so the whole root renders on the
			// client and no server element survives.
			expect(markup(container)).toBe(clientMarkup(name, to));
			expect(serverRoot.isConnected).toBe(false);
			expect(await settledReports(recovered)).toHaveLength(1);
			expect(String((recovered[0] as Error).message)).toMatch(
				/server rendered HTML didn't match the client/,
			);
		} finally {
			root.unmount();
		}
	});

	it('reports a branch range that the server encoded as a keyed list once', async () => {
		container.innerHTML = ServerRT.renderToString(server.ServerList, { ids: ['x', 'y'] }).html;
		for (const on of [true, false]) {
			const host = document.createElement('div');
			host.innerHTML = container.innerHTML;
			document.body.appendChild(host);
			const recovered: unknown[] = [];
			const root = hydrateRoot(
				host,
				client.ClientBranch,
				{ on },
				{
					onRecoverableError: (error) => recovered.push(error),
				},
			);
			flushSync(() => {});
			try {
				expect(markup(host)).toBe(clientMarkup('ClientBranch', { on }));
				expect(await settledReports(recovered)).toHaveLength(1);
			} finally {
				root.unmount();
				host.remove();
			}
		}
	});

	// A boundary whose list arm differs falls back once, although the boundary
	// also suspends on a sibling.
	it.each([
		{ from: ['a', 'b'], to: [] },
		{ from: [], to: ['a', 'b'] },
	])(
		'reports a list arm swap from $from to $to once when its boundary retries',
		async ({ from, to }) => {
			container.innerHTML = ServerRT.renderToString(server.SuspendedRows, {
				rows: from,
				Tail: server.Tail,
			}).html;
			let deliver!: (module: { default: typeof client.Tail }) => void;
			const Tail = lazy(() => new Promise<{ default: typeof client.Tail }>((r) => (deliver = r)));
			const recovered: unknown[] = [];
			const root = hydrateRoot(
				container,
				client.SuspendedRows,
				{ rows: to, Tail },
				{ onRecoverableError: (error) => recovered.push(error) },
			);
			try {
				await act(async () => {});
				await act(async () => deliver({ default: client.Tail }));
				expect(markup(container)).toBe(
					clientMarkup('SuspendedRows', { rows: to, Tail: client.Tail }),
				);
				expect(await settledReports(recovered)).toHaveLength(1);
				if (dev) expect(warns()).toHaveLength(1);
			} finally {
				root.unmount();
			}
		},
	);

	// A root without a boundary falls back to a client render, which suspends on
	// the sibling. As in React, nothing commits while it is suspended, so the
	// server content stays in place and the report waits for the commit that
	// replaces it.
	it.each([
		{ name: 'RootRows', from: { rows: ['a', 'b'] }, to: { rows: [] } },
		{ name: 'RootRows', from: { rows: [] }, to: { rows: ['a', 'b'] } },
		{ name: 'RootBranch', from: { on: true }, to: { on: false } },
	])(
		'keeps $name server content while the root fallback suspends and reports once at its commit',
		async ({ name, from, to }) => {
			container.innerHTML = ServerRT.renderToString(server[name], {
				...from,
				Tail: server.Tail,
			}).html;
			const serverMarkup = markup(container);
			const serverRoot = container.firstElementChild!;
			let deliver!: (module: { default: typeof client.Tail }) => void;
			const Tail = lazy(() => new Promise<{ default: typeof client.Tail }>((r) => (deliver = r)));
			const recovered: unknown[] = [];
			const root = hydrateRoot(
				container,
				client[name],
				{ ...to, Tail },
				{ onRecoverableError: (error) => recovered.push(error) },
			);
			try {
				await act(async () => {});
				expect(markup(container)).toBe(serverMarkup);
				expect(container.firstElementChild).toBe(serverRoot);
				expect(await settledReports(recovered)).toEqual([]);
				await act(async () => deliver({ default: client.Tail }));
				expect(markup(container)).toBe(clientMarkup(name, { ...to, Tail: client.Tail }));
				expect(serverRoot.isConnected).toBe(false);
				expect(await settledReports(recovered)).toHaveLength(1);
				if (dev) expect(warns()).toHaveLength(1);
			} finally {
				root.unmount();
			}
		},
	);

	// Captures that changed before a dormant boundary activated legitimately
	// differ from the server's: the island renders on the client, but reports
	// nothing.
	it.each([
		{ name: 'DormantRows', from: { rows: ['a', 'b'] }, to: { rows: [] } },
		{ name: 'DormantRows', from: { rows: [] }, to: { rows: ['a', 'b'] } },
		{ name: 'DormantBranch', from: { on: true }, to: { on: false } },
		{ name: 'DormantHost', from: { text: true }, to: { text: false } },
	])(
		'client-renders $name updated before activation without reporting',
		async ({ name, from, to }) => {
			const serverProps = { when: condition(false), ...from };
			container.innerHTML = ServerRT.renderToString(server[name], serverProps).html;
			const recovered: unknown[] = [];
			const root = hydrateRoot(container, client[name], serverProps, {
				onRecoverableError: (error) => recovered.push(error),
			});
			flushSync(() => {});
			try {
				await act(() => root.render(client[name], { when: load(), ...to }));
				// The boundary's own id differs between a hydrated and a fresh root.
				const inner = '[data-octane-hydrate-id]';
				expect(markup(container.querySelector(inner)!)).toBe(
					clientMarkup(name, { when: load(), ...to }, inner),
				);
				expect(await settledReports(recovered)).toEqual([]);
				expect(warns()).toEqual([]);
			} finally {
				root.unmount();
			}
		},
	);
});
