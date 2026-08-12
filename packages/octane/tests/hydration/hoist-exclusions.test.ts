// React's document-metadata hoist EXCLUSIONS, adapted (ReactDOMFloat-test.js
// "does not hoist anything with an itemprop prop" and "does not hoist inside
// noscript context"): itemProp-bearing <meta>/<link> belong to their itemScope
// host, and metadata/resources inside <noscript> are fallback-only — both stay
// in authored position on the client AND the server, so hydration adopts the
// identical shape.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRoot, hydrateRoot, flushSync, resetFloatResourceState } from '../../src/index.js';
import * as ServerRT from 'octane/server';
import { loadServerFixture } from '../_server-fixture.js';
import { Microdata, MicrodataResources, NoscriptMeta } from './_fixtures/hoist-exclusions.tsrx';

const srv = loadServerFixture(
	'packages/octane/tests/hydration/_fixtures/hoist-exclusions.tsrx',
) as Record<string, any>;

describe('document-metadata hoist exclusions (itemProp + noscript)', () => {
	let container: HTMLElement;
	let errSpy: ReturnType<typeof vi.spyOn>;
	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
		errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
	});
	afterEach(() => {
		container.remove();
		document.head
			.querySelectorAll('[data-precedence], [data-oct-res], [data-oct-hint], meta, link')
			.forEach((el) => el.remove());
		resetFloatResourceState();
		errSpy.mockRestore();
	});

	// Per ReactDOMFloat-test.js — 'does not hoist anything with an itemprop prop'
	it('client: itemProp metadata stays inside its itemScope host', () => {
		const root = createRoot(container);
		root.render(Microdata, {});
		flushSync(() => {});
		const host = container.querySelector('#md')!;
		expect(host.querySelector('meta[itemprop="name"]')).not.toBeNull();
		expect(host.querySelector('link[itemprop="url"]')).not.toBeNull();
		expect(document.head.querySelector('meta[itemprop], link[itemprop]')).toBeNull();
		root.unmount();
	});

	it('server: itemProp metadata serializes inside the host, not the head', async () => {
		const r = await ServerRT.renderToString(srv.Microdata, {});
		const hostStart = r.html.indexOf('<section');
		expect(hostStart).toBeGreaterThan(-1);
		const hostHtml = r.html.slice(hostStart);
		// Octane serializes authored attribute casing (native-names policy);
		// HTML treats itemProp/itemprop identically.
		expect(hostHtml).toMatch(/itemprop="name"/i);
		expect(hostHtml).toMatch(/itemprop="url"/i);
		expect(r.html.slice(0, hostStart)).not.toMatch(/itemprop/i);
	});

	it('hydration adopts the itemProp host without mismatch warnings', async () => {
		const r = await ServerRT.renderToString(srv.Microdata, {});
		container.innerHTML = r.html;
		hydrateRoot(container, Microdata, {});
		flushSync(() => {});
		const warns = errSpy.mock.calls.map((c) => String(c[0]));
		expect(warns.filter((m) => m.includes('hydration mismatch'))).toEqual([]);
		expect(container.querySelector('#md meta[itemprop="name"]')).not.toBeNull();
	});

	it('client + server: itemProp disqualifies the Float RESOURCE forms too', async () => {
		const root = createRoot(container);
		root.render(MicrodataResources, {});
		flushSync(() => {});
		const host = container.querySelector('#mdr')!;
		expect(host.querySelector('link[itemprop="sheet"]')).not.toBeNull();
		expect(host.querySelector('script[itemprop="loader"]')).not.toBeNull();
		expect(document.head.querySelector('link[href="/mdr.css"]')).toBeNull();
		expect(document.head.querySelector('script[src="/mdr.js"]')).toBeNull();
		root.unmount();

		const r = await ServerRT.renderToString(srv.MicrodataResources, {});
		const hostStart = r.html.indexOf('<section');
		expect(r.html.slice(0, hostStart)).not.toContain('/mdr.');
		const hostHtml = r.html.slice(hostStart);
		expect(hostHtml).toContain('/mdr.css');
		expect(hostHtml).toContain('/mdr.js');
	});

	// Per ReactDOMFloat-test.js — 'does not hoist inside noscript context'
	it('client: noscript metadata/resources stay inside the noscript', () => {
		const root = createRoot(container);
		root.render(NoscriptMeta, {});
		flushSync(() => {});
		const ns = container.querySelector('#ns-host noscript')!;
		expect(ns).not.toBeNull();
		const inner = ns.innerHTML;
		expect(inner).toContain('ns-desc');
		expect(inner).toContain('/ns.css');
		expect(document.head.querySelector('meta[name="ns-desc"]')).toBeNull();
		expect(document.head.querySelector('link[href="/ns.css"]')).toBeNull();
		root.unmount();
	});

	it('server: noscript metadata/resources serialize inside the noscript', async () => {
		const r = await ServerRT.renderToString(srv.NoscriptMeta, {});
		const nsStart = r.html.indexOf('<noscript');
		expect(nsStart).toBeGreaterThan(-1);
		expect(r.html.slice(0, nsStart)).not.toContain('ns-desc');
		expect(r.html.slice(0, nsStart)).not.toContain('/ns.css');
		const nsEnd = r.html.indexOf('</noscript>');
		const nsHtml = r.html.slice(nsStart, nsEnd);
		expect(nsHtml).toContain('ns-desc');
		expect(nsHtml).toContain('/ns.css');
	});

	it('hydration adopts the noscript host without mismatch warnings', async () => {
		const r = await ServerRT.renderToString(srv.NoscriptMeta, {});
		container.innerHTML = r.html;
		hydrateRoot(container, NoscriptMeta, {});
		flushSync(() => {});
		const warns = errSpy.mock.calls.map((c) => String(c[0]));
		expect(warns.filter((m) => m.includes('hydration mismatch'))).toEqual([]);
		expect(container.querySelector('#ns-host noscript')).not.toBeNull();
	});
});
