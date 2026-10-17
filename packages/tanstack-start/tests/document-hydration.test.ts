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

// The browser export omits the server-only scroll script. The separately bundled
// server fixture retains its Node export and the real script content.
vi.mock('@tanstack/router-core/scroll-restoration-script', async () => {
	const { createRequire } = await import('node:module');
	const { dirname, join } = await import('node:path');
	const { pathToFileURL } = await import('node:url');
	const require = createRequire(import.meta.url);
	const manifest = require.resolve('@tanstack/router-core/package.json');
	const { exports } = require(manifest);
	const entry = exports['./scroll-restoration-script'].browser.import.default;
	return import(/* @vite-ignore */ pathToFileURL(join(dirname(manifest), entry)).href);
});

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
	'adopts the $mode document and its scripts without replacing user input (transport: $transport)',
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
			? new JSDOM(html, {
					runScripts: 'dangerously',
					url: 'https://fixture.test/',
					beforeParse(window: Pick<Window, 'scrollTo'>) {
						// jsdom has no layout; real-browser tests own scroll-position behavior.
						window.scrollTo = () => {};
					},
				})
			: undefined;
		// Hydrate in the parsed document so the app retains its document-level SSR context.
		const doc = parsed?.window.document ?? new DOMParser().parseFromString(html, 'text/html');
		if (transport) {
			expect(html).toContain('data-tsr-stream-part');
			expect(doc.querySelectorAll('script[data-tsr-stream-part]')).toHaveLength(0);
		}
		const container = doc.querySelector('#__app')!;
		expect(container.querySelectorAll('#counter')).toHaveLength(1);
		const button = container.querySelector<HTMLButtonElement>('#counter')!;
		const main = container.querySelector('main');
		const input = container.querySelector<HTMLInputElement>('#draft')!;
		const routeScript = container.querySelector<HTMLScriptElement>('#route-data')!;
		const scrollScript = container.querySelector<HTMLScriptElement>('script:not(#route-data)')!;
		expect(routeScript.textContent).toBe('{"value":"retained"}');
		expect(routeScript.nonce).toBe('fixture-nonce');
		expect(scrollScript.nonce).toBe('fixture-nonce');
		input.value = 'typed before hydration';
		expect(button.textContent?.trim()).toBe('Count: 0');
		const serverScripts = new Set<Node>(container.querySelectorAll('script'));
		const addedScripts: Node[] = [];
		const recordScripts = (records: MutationRecord[]) => {
			for (const record of records) {
				for (const node of record.addedNodes) {
					if (node.nodeType !== 1) continue;
					const element = node as Element;
					if (element.matches('script') && !serverScripts.has(element)) addedScripts.push(element);
					for (const script of element.querySelectorAll('script')) {
						if (!serverScripts.has(script)) addedScripts.push(script);
					}
				}
			}
		};
		const observer = new MutationObserver(recordScripts);
		observer.observe(container, { childList: true, subtree: true });
		const messages: unknown[][] = [];
		const warn = vi.spyOn(console, 'warn').mockImplementation((...args) => messages.push(args));
		const error = vi.spyOn(console, 'error').mockImplementation((...args) => messages.push(args));
		const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

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
			expect.soft(container.querySelector('main')).toBe(main);
			expect.soft(container.querySelector('#draft')).toBe(input);
			expect
				.soft(container.querySelector<HTMLInputElement>('#draft')?.value)
				.toBe('typed before hydration');
			expect.soft(container.querySelector('#counter')).toBe(button);
			flushSync(() => button.click());
			expect.soft(button.textContent?.trim()).toBe('Count: 1');
			expect(errors).toEqual([]);
			await vi.waitFor(() => expect(ready).toHaveBeenCalledOnce());
			expect(ready).toHaveReturnedWith(button);
			expect(container.querySelector('#route-data')).toBe(routeScript);
			expect(routeScript.textContent).toBe('{"value":"retained"}');
			expect(routeScript.nonce).toBe('fixture-nonce');
			expect(scrollScript.isConnected).toBe(false);
			expect(Array.from(container.querySelectorAll('script'))).toEqual([routeScript]);
			recordScripts(observer.takeRecords());
			expect(addedScripts).toEqual([]);
			expect(messages).toEqual([]);
		} finally {
			observer.disconnect();
			warn.mockRestore();
			error.mockRestore();
			scrollTo.mockRestore();
			root.unmount();
			container.remove();
			vi.unstubAllGlobals();
			parsed?.window.close();
		}
	},
);
