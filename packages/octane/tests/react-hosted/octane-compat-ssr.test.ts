/**
 * Phase 4 — React SSR and island hydration
 * (react-hosted-octane-compat-plan.md §9, §14 Phase 4).
 *
 * The SAME `.tsrx` islands run through `octane/react/server` inside real React
 * server rendering (`renderToString` and Fizz streaming), then hydrate through
 * the public client `OctaneCompat`. jsdom covers the DOM-identity, parity, and
 * retry-state evidence; real-browser E2E re-verifies paint-level behavior and
 * streamed `completeBoundary` segment relocation (§13 — deferred).
 */
import { describe, expect, it, vi } from 'vitest';
import * as React from 'react';
import { renderToString as reactRenderToString, renderToPipeableStream } from 'react-dom/server';
import { PassThrough } from 'node:stream';
import { join } from 'node:path';
import { OctaneCompat } from 'octane/react';
import { OctaneCompat as OctaneCompatServer } from 'octane/react/server';
import { loadServerFixture } from '../_server-fixture.js';
import { createLog } from '../_helpers.js';
import { h, mountReactHost, reactAct } from './_react-host.js';
import {
	SsrGreeting as ClientSsrGreeting,
	SsrIdIsland as ClientSsrIdIsland,
	SsrLocallyGuarded as ClientSsrLocallyGuarded,
	SsrThemed as ClientSsrThemed,
} from './_fixtures/ssr-islands.tsrx';

const server = loadServerFixture(
	join(process.cwd(), 'packages/octane/tests/react-hosted/_fixtures/ssr-islands.tsrx'),
);

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((done, fail) => {
		resolve = done;
		reject = fail;
	});
	return { promise, resolve, reject };
}

function nextTurns(turns = 3): Promise<void> {
	let chain = Promise.resolve();
	for (let i = 0; i < turns; i++) {
		chain = chain.then(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
	}
	return chain;
}

interface StreamedRender {
	html(): string;
	done: Promise<void>;
	errors: unknown[];
}

function streamPage(element: React.ReactNode): StreamedRender {
	let html = '';
	const errors: unknown[] = [];
	const sink = new PassThrough();
	sink.on('data', (chunk: Buffer) => {
		html += chunk.toString();
	});
	let resolveDone!: () => void;
	const done = new Promise<void>((resolve) => {
		resolveDone = resolve;
	});
	sink.on('finish', resolveDone);
	const stream = renderToPipeableStream(element as any, {
		onAllReady() {
			stream.pipe(sink);
		},
		onError(error: unknown) {
			errors.push(error);
		},
	});
	return { html: () => html, done, errors };
}

/** Server-render a page, hand its markup to the client, hydrate with React. */
async function hydratePage(
	serverElement: React.ReactNode,
	clientElement: React.ReactNode,
): Promise<Awaited<ReturnType<typeof mountReactHost>> & { serverHtml: string }> {
	const serverHtml = reactRenderToString(serverElement as any);
	const container = document.createElement('div');
	container.innerHTML = serverHtml;
	document.body.appendChild(container);
	const { hydrateRoot } = await import('react-dom/client');
	let reactRoot!: ReturnType<typeof hydrateRoot>;
	await reactAct(async () => {
		reactRoot = hydrateRoot(container, clientElement as any);
	});
	return {
		container,
		reactRoot: reactRoot as never,
		serverHtml,
		async render(next: React.ReactNode) {
			await reactAct(async () => reactRoot.render(next as any));
		},
		async unmount() {
			await reactAct(async () => reactRoot.unmount());
			container.remove();
		},
		host() {
			const host = container.querySelector('[data-octane-compat]');
			if (host === null) throw new Error('no octane compat host mounted');
			return host as HTMLElement;
		},
	};
}

describe('octane/react/server — buffered SSR + client hydration (§9.3)', () => {
	it('server-renders an island and hydrates it with adopted node identity, state, and events', async () => {
		const serverPage = h(
			'main',
			null,
			h(OctaneCompatServer, null, h(server.SsrGreeting, { name: 'iso' })),
		);
		const clientPage = h(
			'main',
			null,
			h(OctaneCompat, null, h(ClientSsrGreeting as any, { name: 'iso' })),
		);

		const errors = vi.spyOn(console, 'error');
		const mounted = await hydratePage(serverPage, clientPage);
		// The server host carries real island HTML.
		expect(mounted.serverHtml).toContain('island iso');
		const host = mounted.host();
		const serverButton = host.querySelector('.ssr-count');
		expect(serverButton?.textContent).toBe('clicks:0');

		// No hydration mismatch from React OR octane, no descendant rebuild.
		expect(errors).not.toHaveBeenCalled();
		errors.mockRestore();
		expect(host.querySelector('.ssr-count')).toBe(serverButton);

		// Adopted events + state are live.
		await reactAct(async () => (serverButton as HTMLElement).click());
		expect(host.querySelector('.ssr-count')?.textContent).toBe('clicks:1');
		await mounted.unmount();
	});

	it('hydrates Octane useId values byte-identically to the server output', async () => {
		const serverPage = h(
			'main',
			null,
			h(OctaneCompatServer, { key: 'a' } as any, h(server.SsrIdIsland)),
			h(OctaneCompatServer, { key: 'b' } as any, h(server.SsrIdIsland)),
		);
		const clientPage = h(
			'main',
			null,
			h(OctaneCompat, { key: 'a' } as any, h(ClientSsrIdIsland as any)),
			h(OctaneCompat, { key: 'b' } as any, h(ClientSsrIdIsland as any)),
		);
		const mounted = await hydratePage(serverPage, clientPage);
		const serverIds = [...mounted.serverHtml.matchAll(/data-oid="([^"]+)"/g)].map(
			(match) => match[1],
		);
		expect(serverIds).toHaveLength(2);
		expect(serverIds[0]).not.toBe(serverIds[1]);
		const hydratedIds = [...mounted.container.querySelectorAll('.ssr-id')].map((node) =>
			node.getAttribute('data-oid'),
		);
		expect(hydratedIds).toEqual(serverIds);
		await mounted.unmount();
	});

	it('reads a React context on the server via React.use and stays live after hydration', async () => {
		const Theme = React.createContext('unset');
		const serverPage = h(
			Theme,
			{ value: 'ssr-dark' } as any,
			h(OctaneCompatServer, null, h(server.SsrThemed, { themeContext: Theme })),
		);
		function ClientPage(props: { theme: string }) {
			return h(
				Theme,
				{ value: props.theme } as any,
				h(OctaneCompat, null, h(ClientSsrThemed as any, { themeContext: Theme })),
			);
		}
		const mounted = await hydratePage(serverPage, h(ClientPage, { theme: 'ssr-dark' }));
		expect(mounted.serverHtml).toContain('theme:ssr-dark');
		expect(mounted.host().querySelector('.ssr-theme')?.textContent).toBe('theme:ssr-dark');

		// The hydrated island holds a REAL subscription.
		await mounted.render(h(ClientPage, { theme: 'ssr-light' }));
		expect(mounted.host().querySelector('.ssr-theme')?.textContent).toBe('theme:ssr-light');
		await mounted.unmount();
	});

	it('ships a local @pending arm in the shell and lets the client complete it (v1 §9.1)', async () => {
		const never = new Promise<string>(() => {});
		const clientResource = deferred<string>();
		const serverPage = h(
			'main',
			null,
			h(OctaneCompatServer, null, h(server.SsrLocallyGuarded, { resource: never })),
		);
		const clientPage = h(
			'main',
			null,
			h(
				OctaneCompat,
				null,
				h(ClientSsrLocallyGuarded as any, { resource: clientResource.promise }),
			),
		);
		const mounted = await hydratePage(serverPage, clientPage);
		expect(mounted.serverHtml).toContain('local pending');

		await reactAct(async () => {
			clientResource.resolve('client-data');
			await clientResource.promise;
		});
		expect(mounted.host().querySelector('.ssr-inner')?.textContent).toBe('value:client-data');
		await mounted.unmount();
	});

	it('emits island CSS as deduplicated React style resources with octane hashes (§9.2)', async () => {
		const html = reactRenderToString(
			h(
				'main',
				null,
				h(OctaneCompatServer, { key: '1' } as any, h(server.SsrStyled, { name: 'one' })),
				h(OctaneCompatServer, { key: '2' } as any, h(server.SsrStyled, { name: 'two' })),
			) as any,
		);
		// Two islands, identical scoped css → ONE hoisted style resource whose
		// data-href carries the octane hash the client's injectStyle detects.
		const styles = [...html.matchAll(/<style[^>]*data-href="octane-([^"]+)"/g)];
		expect(styles).toHaveLength(1);
		expect(html).toContain('rgb(1, 2, 3)');
	});

	it('rejects hoisted head content from islands (§9.2 v1) — at server COMPILE time', () => {
		// The server compiler already refuses body-hoisted <title>/<meta>/<link>,
		// so the case cannot reach the hosted renderer; the runtime head guard in
		// octane/react/server stays as defense in depth.
		expect(() =>
			loadServerFixture(
				join(process.cwd(), 'packages/octane/tests/react-hosted/_fixtures/ssr-head-hoister.tsrx'),
			),
		).toThrow(/does not support node type HeadHoist/);
	});
});

describe('octane/react/server — Fizz streaming retry state (§9.1)', () => {
	it('completes a suspended island through Fizz with a request-local session (no fresh-pass loop)', async () => {
		const log = createLog();
		const resource = deferred<string>();
		const render = streamPage(
			h(
				'main',
				null,
				h(
					React.Suspense,
					{ fallback: h('p', null, 'island loading') },
					h(
						OctaneCompatServer,
						null,
						h(server.SsrAsync, { resource: resource.promise, log: log.push }),
					),
				),
			),
		);
		await nextTurns();
		// One pass rendered and suspended; Fizz streams the fallback meanwhile.
		expect(log.drain()).toEqual(['render:async']);

		resource.resolve('streamed');
		await render.done;
		expect(render.errors).toEqual([]);
		expect(render.html()).toContain('value:streamed');
		// Exactly one replay: the session replayed the settled stratum and the
		// fresh pass completed — bounded, no retry spin.
		expect(log.drain()).toEqual(['render:async']);
	});

	it('drives sequential strata with one replay per stratum', async () => {
		const log = createLog();
		const first = deferred<string>();
		const seconds = new Map<string, ReturnType<typeof deferred<string>>>();
		const makeSecond = (from: string) => {
			let entry = seconds.get(from);
			if (entry === undefined) {
				entry = deferred<string>();
				seconds.set(from, entry);
			}
			return entry.promise;
		};
		const render = streamPage(
			h(
				'main',
				null,
				h(
					React.Suspense,
					{ fallback: h('p', null, 'island loading') },
					h(
						OctaneCompatServer,
						null,
						h(server.SsrChained, { first: first.promise, makeSecond, log: log.push }),
					),
				),
			),
		);
		await nextTurns();
		expect(log.drain()).toEqual(['render:chained']);

		first.resolve('A');
		await nextTurns();
		// Replay reached stratum 2 and suspended on the dependent fetch.
		expect(log.drain()).toEqual(['render:chained']);

		seconds.get('A')!.resolve('B');
		await render.done;
		expect(render.errors).toEqual([]);
		expect(render.html()).toContain('A+B');
		expect(log.drain()).toEqual(['render:chained']);
	});

	it('starts independent fetches together and resolves the stratum with one replay', async () => {
		const log = createLog();
		const fetches: string[] = [];
		const a = deferred<string>();
		const b = deferred<string>();
		const fetchA = () => {
			fetches.push('A');
			return a.promise;
		};
		const fetchB = () => {
			fetches.push('B');
			return b.promise;
		};
		const render = streamPage(
			h(
				'main',
				null,
				h(
					React.Suspense,
					{ fallback: h('p', null, 'island loading') },
					h(OctaneCompatServer, null, h(server.SsrParallel, { fetchA, fetchB, log: log.push })),
				),
			),
		);
		await nextTurns();
		expect(log.drain()).toEqual(['render:parallel']);
		// Both independent creations started in the FIRST pass (parallel-use), and
		// the session memo keeps their identity across replays — no re-fetch.
		expect(fetches).toEqual(['A', 'B']);

		a.resolve('one');
		b.resolve('two');
		await render.done;
		expect(render.errors).toEqual([]);
		expect(render.html()).toContain('one+two');
		expect(log.drain()).toEqual(['render:parallel']);
		expect(fetches).toEqual(['A', 'B']);
	});

	it('routes a rejected island fetch to Fizz error handling exactly once', async () => {
		const resource = deferred<string>();
		const render = streamPage(
			h(
				'main',
				null,
				h(
					React.Suspense,
					{ fallback: h('p', null, 'island loading') },
					h(OctaneCompatServer, null, h(server.SsrRejecting, { resource: resource.promise })),
				),
			),
		);
		await nextTurns();
		resource.reject(new Error('island fetch failed'));
		await render.done;
		expect(render.errors.map((error) => (error as Error).message)).toEqual(['island fetch failed']);
		expect(render.html()).toContain('island loading');
		expect(render.html()).not.toContain('ssr-async');
	});

	it('keeps sessions request-local across overlapping streams', async () => {
		const one = deferred<string>();
		const two = deferred<string>();
		// Distinct props objects per render = distinct Fizz-stable session keys.
		const renderOne = streamPage(
			h(
				React.Suspense,
				{ fallback: h('p', null, 'loading') },
				h(OctaneCompatServer, null, h(server.SsrAsync, { resource: one.promise })),
			),
		);
		const renderTwo = streamPage(
			h(
				React.Suspense,
				{ fallback: h('p', null, 'loading') },
				h(OctaneCompatServer, null, h(server.SsrAsync, { resource: two.promise })),
			),
		);
		await nextTurns();
		two.resolve('second');
		one.resolve('first');
		await Promise.all([renderOne.done, renderTwo.done]);
		expect(renderOne.html()).toContain('value:first');
		expect(renderTwo.html()).toContain('value:second');
		expect(renderOne.html()).not.toContain('second');
		expect(renderTwo.html()).not.toContain('first');
	});
});
