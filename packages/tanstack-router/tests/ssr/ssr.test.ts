import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'octane/server';
import { attachRouterServerSsrUtils } from '@tanstack/router-core/ssr/server';
import { getScrollRestorationScriptForRouter } from '@tanstack/router-core/scroll-restoration-script';
import { RouterServer, renderRouterToStream, renderRouterToString } from '../../src/ssr/server';
import { finalizeDocumentShell } from '../../src/ssr/renderRouterToStream';
import { ManagedHeadOwners, makeSsrRouter } from '../_fixtures/ssr.tsrx';
import { renderReactHeadContent } from './_react-head-oracle.js';
import type { ServerManifest } from '@tanstack/router-core';

describe('@octanejs/tanstack-router SSR', () => {
	// Per TanStack/router PR #7847 snapshot 753f919e,
	// packages/octane-router/tests/conformance/ssr.test.ts:14.
	// @parity-case adapted:tanstack-router-ssr
	it('renders the route-owned document and app mount boundary', async () => {
		const router = makeSsrRouter();
		attachRouterServerSsrUtils({ router, manifest: undefined });
		await router.load();
		await router.serverSsr.dehydrate();

		const response = await renderRouterToString({
			router,
			responseHeaders: new Headers({ 'content-type': 'text/html' }),
			App: RouterServer,
		});
		const html = await response.text();
		const normalizedHtml = html.replace(/<!--[\s\S]*?-->/g, '');

		expect(response.status).toBe(200);
		expect(normalizedHtml).toContain('<!DOCTYPE html>');
		expect(normalizedHtml).toContain('<html lang="en">');
		expect(normalizedHtml).toContain('<title data-tsr-managed-key="head:');
		expect(normalizedHtml).toContain('>Octane Router SSR</title>');
		expect(normalizedHtml).toContain('<meta name="description" content="Rendered by Octane"');
		expect(normalizedHtml).toContain(':root { --route-style: present; }');
		expect(normalizedHtml).toContain('<body class="document-body"><div id="__app">');
		expect(normalizedHtml).toMatch(
			/<main id="content" class="tsrx-[^"]+">Rendered on the server<\/main>/,
		);
		expect(normalizedHtml).toMatch(
			/<head>[\s\S]*<style data-octane="[^"]+" nonce="octane-csp">[\s\S]*rgb\(12, 34, 56\)[\s\S]*<\/style>[\s\S]*<\/head>/,
		);
		expect(normalizedHtml).toContain('<script src="/entry.js"');
		expect(normalizedHtml).toContain('globalThis.__octaneRouterSsr=true');
		// router-core 1.171.34's hydration scripts self-remove (`document.currentScript
		// .remove()`) as part of its streaming-cleanup format; this is injected by the
		// router's own transform and octane hydration adopts the app range without
		// those scripts. (The former assertion that the output contained no self-remove
		// pinned Octane's old native-injection behavior.) Real SSR+hydration is covered
		// by the rsbuild integration test and the document-hydration suite.
		expect(normalizedHtml).toContain('</body></html>');
	});

	it("keeps independently rendered document managers from claiming one another's assets", async () => {
		const router = makeSsrRouter({ multipleManagers: true });
		attachRouterServerSsrUtils({ router, manifest: undefined });
		await router.load();
		await router.serverSsr.dehydrate();

		const response = await renderRouterToString({
			router,
			responseHeaders: new Headers({ 'content-type': 'text/html' }),
			App: RouterServer,
		});
		const html = await response.text();
		const titleKeys = Array.from(
			html.matchAll(/<title\b[^>]*data-tsr-managed-key="([^"]+)"[^>]*>/g),
			(match) => match[1],
		);
		const entryKeys = Array.from(
			html.matchAll(
				/<script\b(?=[^>]*src="\/entry\.js")(?=[^>]*data-tsr-managed-key="([^"]+)")[^>]*>/g,
			),
			(match) => match[1],
		);

		expect(titleKeys).toHaveLength(2);
		expect(new Set(titleKeys).size).toBe(2);
		expect(entryKeys).toHaveLength(2);
		expect(new Set(entryKeys).size).toBe(2);
		expect(html).toContain('nonce="octane-csp"');
	});

	it('keeps document metadata and nonce-protected scripts in clean static markup', async () => {
		const router = makeSsrRouter();
		attachRouterServerSsrUtils({ router, manifest: undefined });
		await router.load();
		await router.serverSsr.dehydrate();

		try {
			const { html } = renderToStaticMarkup(
				RouterServer as any,
				{ router },
				{
					nonce: 'octane-csp',
				},
			);
			expect(html).toContain('>Octane Router SSR</title>');
			expect(html).toContain('name="description"');
			expect(html).toContain('src="/entry.js"');
			expect(html).toContain('nonce="octane-csp"');
			expect(html).not.toContain('<!--');
		} finally {
			router.serverSsr.cleanup();
		}
	});

	// Upstream @tanstack/react-router@1.170.18 headContentUtils.tsx:140-151
	// emits one script preload per matched route's manifest `preloads`, after
	// meta and before route links. The oracle is real react-router rendering
	// the same routes and manifest through react-dom/server.
	it('emits manifest modulepreload links in the head as react-router does', async () => {
		const manifest: ServerManifest = {
			routes: {
				__root__: {
					preloads: ['/assets/entry.js', { href: '/assets/shared.js', crossOrigin: 'anonymous' }],
				},
				'/': { preloads: ['/assets/index.js'] },
			},
		};
		const head = () => ({
			meta: [{ title: 'Preloads' }],
			links: [{ rel: 'icon', href: '/favicon.ico' }],
		});

		const octaneRouter = makeSsrRouter();
		octaneRouter.routeTree.options.head = head;
		attachRouterServerSsrUtils({ router: octaneRouter, manifest });
		await octaneRouter.load();
		let octaneHtml: string;
		try {
			octaneHtml = renderToStaticMarkup(
				ManagedHeadOwners as any,
				{ router: octaneRouter, secondary: false },
				{ nonce: 'octane-csp' },
			).html;
		} finally {
			octaneRouter.serverSsr!.cleanup();
		}

		const reactHtml = await renderReactHeadContent({ head, manifest, nonce: 'octane-csp' });

		const headTags = (html: string) =>
			Array.from(html.matchAll(/<(title|meta|link)\b[^>]*>/g), ([tag]) =>
				tag
					.replace(/\s+data-tsr-managed-key="[^"]*"/, '')
					.replace(/\s*\/?>$/, '>')
					.replace(/crossorigin=/, 'crossOrigin='),
			);

		expect(headTags(octaneHtml)).toEqual(headTags(reactHtml));
		expect(headTags(octaneHtml).filter((tag) => tag.includes('modulepreload'))).toEqual([
			'<link rel="modulepreload" href="/assets/entry.js" nonce="octane-csp">',
			'<link rel="modulepreload" href="/assets/shared.js" crossOrigin="anonymous" nonce="octane-csp">',
			'<link rel="modulepreload" href="/assets/index.js" nonce="octane-csp">',
		]);
	});

	// Per TanStack/router PR #7847 snapshot 753f919e,
	// packages/octane-router/tests/conformance/ssr.test.ts:52.
	// @parity-case adapted:tanstack-router-ssr-scroll
	it('emits the pre-hydration scroll restoration script when enabled', async () => {
		const router = makeSsrRouter({ scrollRestoration: true });
		attachRouterServerSsrUtils({ router, manifest: undefined });
		await router.load();
		await router.serverSsr.dehydrate();
		const script = getScrollRestorationScriptForRouter(router);

		const response = await renderRouterToString({
			router,
			responseHeaders: new Headers({ 'content-type': 'text/html' }),
			App: RouterServer,
		});

		expect(script).toBeTruthy();
		expect(await response.text()).toContain(script);
	});

	// Per TanStack/router PR #7847 snapshot 753f919e,
	// packages/octane-router/tests/conformance/ssr.test.ts:71.
	async function assertSsrDisabledRouteUi(routeSsr: false | 'data-only') {
		const router = makeSsrRouter({ routeSsr });
		attachRouterServerSsrUtils({ router, manifest: undefined });
		await router.load();
		await router.serverSsr.dehydrate();

		const response = await renderRouterToString({
			router,
			responseHeaders: new Headers({ 'content-type': 'text/html' }),
			App: RouterServer,
		});

		expect(await response.text()).not.toContain('Rendered on the server');
	}

	// @parity-case adapted:tanstack-router-ssr-disabled-false
	it('does not render route UI when ssr is false', async () => {
		await assertSsrDisabledRouteUi(false);
	});

	// @parity-case adapted:tanstack-router-ssr-disabled-data-only
	it('does not render route UI when ssr is data-only', async () => {
		await assertSsrDisabledRouteUi('data-only');
	});

	// Per TanStack/router PR #7847 snapshot 753f919e,
	// packages/octane-router/tests/conformance/ssr.test.ts:90, as retained by
	// the native StreamOptions.injection patch in this repository.
	// @parity-case adapted:tanstack-router-ssr-stream
	it('places shell styles inside the route-owned head when streaming', async () => {
		const router = makeSsrRouter();
		attachRouterServerSsrUtils({ router, manifest: undefined });
		await router.load();
		await router.serverSsr.dehydrate();

		// router-core 1.171.34's streaming handler returns a stream-response wrapper
		// ({ response, dispose }) so the request handler can tear down the stream on
		// cleanup; a direct caller unwraps `.response`.
		const streamResult = await renderRouterToStream({
			request: new Request('http://localhost/', {
				headers: { 'user-agent': 'Mozilla/5.0' },
			}),
			router,
			responseHeaders: new Headers({ 'content-type': 'text/html' }),
			App: RouterServer,
		});
		const response =
			streamResult instanceof Response
				? streamResult
				: (streamResult as { response: Response }).response;
		const html = await response.text();
		const doctype = html.indexOf('<!DOCTYPE html>');
		const document = html.indexOf('<html');
		const head = html.indexOf('<head');
		const style = html.indexOf('<style data-octane=');
		const headClose = html.indexOf('</head>');

		expect(doctype).toBe(0);
		expect(document).toBeGreaterThan(doctype);
		expect(head).toBeGreaterThan(document);
		expect(style).toBeGreaterThan(head);
		expect(headClose).toBeGreaterThan(style);
		expect(html.slice(0, document)).not.toContain('<style data-octane=');
		expect(html.slice(style, headClose)).toContain('nonce="octane-csp"');
		expect(html.slice(style, headClose)).toContain('rgb(12, 34, 56)');
	});

	// The document-shell finalizer buffers and rewrites the prefix through
	// `</head>`, then streams the body. A multi-byte UTF-8 character whose bytes
	// straddle the chunk boundary at `</head>` must survive: the finalizer keeps
	// decoding through one streaming decoder instead of passing raw bytes, so the
	// held leading bytes are joined to the continuation in the next chunk.
	it('preserves a multi-byte character split across the head boundary while streaming', async () => {
		const coffee = new TextEncoder().encode('☕'); // E2 98 95
		// Chunk 1 holds the whole shell through `</head>` plus the first two bytes of
		// `☕`; chunk 2 carries its final byte and the rest of the body.
		const chunk1 = new Uint8Array([
			...new TextEncoder().encode('<html><head></head><body>caf'),
			coffee[0]!,
			coffee[1]!,
		]);
		const chunk2 = new Uint8Array([coffee[2]!, ...new TextEncoder().encode('</body></html>')]);
		const source = new ReadableStream<Uint8Array>({
			start(controller) {
				controller.enqueue(chunk1);
				controller.enqueue(chunk2);
				controller.close();
			},
		});

		const reader = finalizeDocumentShell(source).getReader();
		const parts: Array<Uint8Array> = [];
		for (;;) {
			const { value, done } = await reader.read();
			if (done) break;
			if (value) parts.push(value);
		}
		const merged = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
		let offset = 0;
		for (const part of parts) {
			merged.set(part, offset);
			offset += part.length;
		}
		const html = new TextDecoder('utf-8', { fatal: false }).decode(merged);

		expect(html).toBe('<!DOCTYPE html><html><head></head><body>caf☕</body></html>');
		expect(html).toContain('caf☕');
		expect(html).not.toContain('�'); // no replacement character from a dropped byte
	});
});
