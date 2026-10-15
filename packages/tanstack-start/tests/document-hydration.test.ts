import { flushSync, hydrateRoot } from 'octane';
import { renderToString } from 'octane/server';
import { JSDOM } from 'jsdom';
import { attachRouterServerSsrUtils } from '@tanstack/router-core/ssr/server';
import { renderRouterToString } from '@octanejs/tanstack-router/ssr/server';
import { StartClient } from '@octanejs/tanstack-start/client';
import { expect, it, vi } from 'vitest';
import { StartClient as CompiledStartClient } from '@octanejs/tanstack-start/compiled/client';
import { makeDocumentRouter as makeCompiledDocumentRouter } from './_fixtures/document-hydration-compiled.tsrx';
// @ts-expect-error the shared fixture plugin compiles the router graph for the server
import * as compiledServer from './_fixtures/document-hydration-compiled.tsrx?octane-ssr';
import { makeDocumentRouter } from './_fixtures/document-hydration.tsx';
// @ts-expect-error the shared fixture plugin compiles the router graph for the server
import * as server from './_fixtures/document-hydration.tsx?octane-ssr';

const modes = [
	{ mode: 'normal', StartClient, makeDocumentRouter, server },
	{
		mode: 'compiled',
		StartClient: CompiledStartClient,
		makeDocumentRouter: makeCompiledDocumentRouter,
		server: compiledServer,
	},
];

it.each(modes.flatMap((mode) => [false, true].map((transport) => ({ ...mode, transport }))))(
	'hydrates the $mode server route and activates its original button (transport: $transport)',
	async ({ StartClient, makeDocumentRouter, server, transport }) => {
		const serverRouter = server.makeDocumentRouter(true);
		if (transport) attachRouterServerSsrUtils({ router: serverRouter, manifest: undefined });
		await serverRouter.load();
		expect(serverRouter.state.matches.map((match: { status: string }) => match.status)).toEqual([
			'success',
			'success',
		]);
		let html: string;
		if (transport) {
			await serverRouter.serverSsr.dehydrate();
			html = await (
				await renderRouterToString({
					router: serverRouter,
					responseHeaders: new Headers(),
					App: server.StartServer,
				})
			).text();
		} else {
			({ html } = renderToString(server.StartServer, { router: serverRouter }));
		}
		// Execute the real transport's self-removing tags before adopting the DOM,
		// as the browser does before the Start client entry hydrates the app.
		const parsed = transport
			? new JSDOM(html, { runScripts: 'dangerously', url: 'https://fixture.test/' })
			: undefined;
		const doc = parsed?.window.document ?? new DOMParser().parseFromString(html, 'text/html');
		if (transport) {
			expect(html).toContain('data-tsr-stream-part');
			expect(doc.querySelectorAll('script')).toHaveLength(0);
		}
		const container = doc.querySelector('#__app')!;
		expect(container.querySelectorAll('#counter')).toHaveLength(1);
		const button = container.querySelector<HTMLButtonElement>('#counter')!;
		expect(button.textContent?.trim()).toBe('Count: 0');
		document.body.append(container);

		const clientRouter = makeDocumentRouter(false);
		await clientRouter.load();
		expect(clientRouter.state.matches.map((match) => match.status)).toEqual(['success', 'success']);
		const errors: unknown[] = [];
		const ready = vi.fn(() => container.querySelector('#counter'));
		vi.stubGlobal('$_TSR', { h: ready });
		const root = hydrateRoot(
			container,
			StartClient,
			{ router: clientRouter },
			{
				onRecoverableError: (error) => errors.push(error),
			},
		);
		try {
			flushSync(() => {});
			expect.soft(container.querySelectorAll('main')).toHaveLength(1);
			expect.soft(container.querySelector('#counter')).toBe(button);
			flushSync(() => button.click());
			expect.soft(button.textContent?.trim()).toBe('Count: 1');
			expect(errors).toEqual([]);
			await vi.waitFor(() => expect(ready).toHaveBeenCalledOnce());
			expect(ready).toHaveReturnedWith(button);
		} finally {
			root.unmount();
			container.remove();
			vi.unstubAllGlobals();
			parsed?.window.close();
		}
	},
);
