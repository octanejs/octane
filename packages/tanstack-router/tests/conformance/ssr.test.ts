// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { attachRouterServerSsrUtils } from '@tanstack/router-core/ssr/server';
import { getScrollRestorationScriptForRouter } from '@tanstack/router-core/scroll-restoration-script';
import { RouterServer, renderRouterToStream, renderRouterToString } from '../../src/ssr/server';
import { makeSsrRouter } from '../_fixtures/ssr.tsrx';

describe('@octanejs/tanstack-router SSR', () => {
	// Per TanStack/router PR #7847 snapshot 753f919e,
	// packages/octane-router/tests/conformance/ssr.test.ts:14.
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
		expect(normalizedHtml).not.toContain('document.currentScript.remove()');
		expect(normalizedHtml).toContain('</script></div></body></html>');
	});

	// Per TanStack/router PR #7847 snapshot 753f919e,
	// packages/octane-router/tests/conformance/ssr.test.ts:52.
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
	it.each([false, 'data-only'] as const)(
		'does not render route UI when ssr is %s',
		async (routeSsr) => {
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
		},
	);

	// Per TanStack/router PR #7847 snapshot 753f919e,
	// packages/octane-router/tests/conformance/ssr.test.ts:90, as retained by
	// the native StreamOptions.injection patch in this repository.
	it('places shell styles inside the route-owned head when streaming', async () => {
		const router = makeSsrRouter();
		attachRouterServerSsrUtils({ router, manifest: undefined });
		await router.load();
		await router.serverSsr.dehydrate();

		const response = await renderRouterToStream({
			request: new Request('http://localhost/', {
				headers: { 'user-agent': 'Mozilla/5.0' },
			}),
			router,
			responseHeaders: new Headers({ 'content-type': 'text/html' }),
			App: RouterServer,
		});
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
});
