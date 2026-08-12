// Adapted ReactDOMFloat-test.js conformance evidence (slice 3). Each test
// cites its upstream case and asserts Octane's observable outcome through
// public APIs. Upstream whole-document (<html>) containers are replaced by
// ordinary element roots per Octane's root contract; suspensey-commit load
// gating is out of scope (documented divergence), so assertions target tag
// placement, identity, options pass-through, and dedupe — never load timing.
import { describe, it, expect, afterEach } from 'vitest';
import {
	act,
	createRoot,
	hydrateRoot,
	flushSync,
	preinit,
	preload,
	resetFloatResourceState,
} from '../../src/index.js';
import * as Server from 'octane/server';
import { loadServerFixture } from '../_server-fixture.js';
import { mount } from '../_helpers.js';
import {
	EffectPreinit,
	NonceScriptPreinit,
	IntegrityScriptPreinit,
	IntegrityStylePreinit,
	ModulePreinits,
	EscapedSheetQuote,
	EscapedSheetBackslash,
	QUOTE_HREF,
	SLASH_HREF,
	SvgContexts,
	NoscriptScript,
	ScriptForms,
	NonceStyle,
	PlainLinkPage,
	TitleUpdate,
} from '../_fixtures/float-evidence-3.tsrx';

const SVG_NS = 'http://www.w3.org/2000/svg';

const srv = loadServerFixture('packages/octane/tests/_fixtures/float-evidence-3.tsrx') as Record<
	string,
	any
>;

const containers: HTMLElement[] = [];
const roots: Array<{ unmount(): void }> = [];

function mountInto(body: any, props: any = {}): HTMLElement {
	const c = document.createElement('div');
	document.body.appendChild(c);
	containers.push(c);
	const root = createRoot(c);
	roots.push(root);
	root.render(body, props);
	return c;
}

/** Attribute-value (not selector) matching, since hrefs may be selector syntax. */
function headElementsWithAttr(tag: string, attr: string, value: string): Element[] {
	return Array.from(document.head.querySelectorAll(tag)).filter(
		(el) => el.getAttribute(attr) === value,
	);
}

afterEach(() => {
	for (const r of roots.splice(0)) r.unmount();
	for (const c of containers.splice(0)) c.remove();
	// Hoisted metadata is removed by unmount; resources are page-global by
	// contract, so tests reset the page (head + identity state) themselves.
	document.head.innerHTML = '';
	resetFloatResourceState();
});

describe('Float evidence (slice 3) — preinit options', () => {
	it('creates a script resource when preinit(as: "script") runs outside render, in an effect', async () => {
		// Per ReactDOMFloat-test.js:6708
		await act(() => mountInto(EffectPreinit));
		const s = document.head.querySelector('script[src="/fe3-effect.js"]') as HTMLScriptElement;
		expect(s).not.toBeNull();
		expect(s.async).toBe(true);
		expect(document.body.querySelector('script')).toBeNull();
	});

	it('accepts a `nonce` option for as: "script"', async () => {
		// Per ReactDOMFloat-test.js:6767
		await act(() => mountInto(NonceScriptPreinit, { src: 'fe3-nonce-client.js' }));
		const s = document.head.querySelector('script[src="fe3-nonce-client.js"]')!;
		expect(s.getAttribute('nonce')).toBe('R4nD0m');
		expect((s as HTMLScriptElement).async).toBe(true);

		const r = await Server.renderToString(srv.NonceScriptPreinit, { src: 'fe3-nonce-srv.js' });
		const tag = r.html.match(/<script[^>]*src="fe3-nonce-srv\.js"[^>]*>/)?.[0];
		expect(tag).toBeTruthy();
		expect(tag).toContain('nonce="R4nD0m"');
		expect(tag).toContain('async');
	});

	it('accepts an `integrity` option for as: "script"', async () => {
		// Per ReactDOMFloat-test.js:6817
		await act(() =>
			mountInto(IntegrityScriptPreinit, { src: 'fe3-int-client.js', hash: 'client hash' }),
		);
		const s = document.head.querySelector('script[src="fe3-int-client.js"]')!;
		expect(s.getAttribute('integrity')).toBe('client hash');

		const r = await Server.renderToString(srv.IntegrityScriptPreinit, {
			src: 'fe3-int-srv.js',
			hash: 'srv hash',
		});
		const tag = r.html.match(/<script[^>]*src="fe3-int-srv\.js"[^>]*>/)?.[0];
		expect(tag).toBeTruthy();
		expect(tag).toContain('integrity="srv hash"');
	});

	it('accepts an `integrity` option for as: "style"', async () => {
		// Per ReactDOMFloat-test.js:6867
		await act(() =>
			mountInto(IntegrityStylePreinit, { src: 'fe3-int-client.css', hash: 'client hash' }),
		);
		const l = document.head.querySelector('link[rel="stylesheet"][href="fe3-int-client.css"]')!;
		expect(l.getAttribute('integrity')).toBe('client hash');
		expect(l.getAttribute('data-precedence')).toBe('default');

		const r = await Server.renderToString(srv.IntegrityStylePreinit, {
			src: 'fe3-int-srv.css',
			hash: 'srv hash',
		});
		const tag = r.html.match(/<link rel="stylesheet" href="fe3-int-srv\.css"[^>]*>/)?.[0];
		expect(tag).toBeTruthy();
		expect(tag).toContain('integrity="srv hash"');
		expect(tag).toContain('data-precedence="default"');
	});

	it('creates script module resources with explicit `as` and `integrity` options', async () => {
		// Per ReactDOMFloat-test.js:7023
		await act(() => mountInto(ModulePreinits));
		const def = document.head.querySelector(
			'script[src="/fe3-mod-default.mjs"]',
		) as HTMLScriptElement;
		expect(def).not.toBeNull();
		expect(def.type).toBe('module');
		expect(def.async).toBe(true);
		const integ = document.head.querySelector('script[src="/fe3-mod-integrity.mjs"]')!;
		expect(integ.getAttribute('integrity')).toBe('some hash');

		const r = await Server.renderToString(srv.ModulePreinits, {});
		expect(r.html).toContain('type="module" src="/fe3-mod-default.mjs" async');
		const tag = r.html.match(/<script[^>]*src="\/fe3-mod-integrity\.mjs"[^>]*>/)?.[0];
		expect(tag).toBeTruthy();
		expect(tag).toContain('integrity="some hash"');
	});
});

describe('Float evidence (slice 3) — href text is matched by value, never selector syntax', () => {
	it('matches rendered stylesheet resources whose hrefs contain selector metacharacters', async () => {
		// Per ReactDOMFloat-test.js:7656
		await act(() => {
			mountInto(EscapedSheetQuote);
			mountInto(EscapedSheetQuote); // deduped by exact href value
			mountInto(EscapedSheetBackslash);
			mountInto(EscapedSheetBackslash); // deduped by exact href value
		});
		const quote = headElementsWithAttr('link[rel="stylesheet"]', 'href', QUOTE_HREF);
		const slash = headElementsWithAttr('link[rel="stylesheet"]', 'href', SLASH_HREF);
		expect(quote).toHaveLength(1);
		expect(quote[0].getAttribute('data-precedence')).toBe('style');
		expect(slash).toHaveLength(1);

		// SSR serializes the attribute escaped, exactly once per identity.
		const App = () =>
			Server.createElement(
				'div',
				null,
				Server.createElement(srv.EscapedSheetQuote, null),
				Server.createElement(srv.EscapedSheetQuote, null),
				Server.createElement(srv.EscapedSheetBackslash, null),
			) as any;
		const r = await Server.renderToString(App as any);
		expect(r.html.split('fe3-style&quot;][rel=&quot;stylesheet').length - 1).toBe(1);
		expect(r.html.split('fe3-with\\slashes').length - 1).toBe(1);
	});

	it('matches preload and preinit calls whose hrefs contain selector metacharacters', async () => {
		// Per ReactDOMFloat-test.js:7735
		// SSR emits a preload + a stylesheet resource, then the head lands in the
		// document the way a served page arrives.
		const App = () => {
			Server.preload('fe3-esc-preload', { as: 'style' });
			Server.preload('fe3-esc\nnewline', { as: 'style' });
			return Server.createElement(
				'div',
				null,
				Server.createElement(srv.EscapedSheetBackslash, null),
			) as any;
		};
		const r = await Server.renderToString(App as any);
		document.head.insertAdjacentHTML('afterbegin', r.html.slice(0, r.html.indexOf('<div')));

		// Client calls whose href text is selector syntax must neither throw nor
		// cross-match the SSR-emitted tags; repeats of SSR hrefs are no-ops.
		preload('fe3-esc-preload"][rel="preload', { as: 'style' });
		preinit('fe3-esc-style"][rel="stylesheet', { as: 'style', precedence: 'style' });
		preload('fe3-esc-preload', { as: 'style' });
		preload('fe3-esc\nnewline', { as: 'style' });
		preinit('fe3-with\\slashes', { as: 'style', precedence: 'style' });

		expect(headElementsWithAttr('link[rel="preload"]', 'href', 'fe3-esc-preload')).toHaveLength(1);
		expect(headElementsWithAttr('link[rel="preload"]', 'href', 'fe3-esc\nnewline')).toHaveLength(1);
		expect(
			headElementsWithAttr('link[rel="preload"]', 'href', 'fe3-esc-preload"][rel="preload'),
		).toHaveLength(1);
		expect(
			headElementsWithAttr('link[rel="stylesheet"]', 'href', 'fe3-esc-style"][rel="stylesheet'),
		).toHaveLength(1);
		expect(
			headElementsWithAttr('link[rel="stylesheet"]', 'href', 'fe3-with\\slashes'),
		).toHaveLength(1);
	});
});

describe('Float evidence (slice 3) — classification contexts', () => {
	it('does not create script resources inside an <svg> context; <foreignObject> re-enables hoisting', async () => {
		// Per ReactDOMFloat-test.js:8760
		// The <foreignObject> arms also pin the re-enable halves of
		// ReactDOMFloat-test.js:7797 (stylesheet resource) and :9301 (meta
		// hoist); their svg-inline halves are tracked as planned work — Octane's
		// compiler currently hoists <link>/<meta> from inside <svg> context.
		await act(() => mountInto(SvgContexts));
		const path = document.querySelector('.fe3-svg-path')!;
		const inline = path.querySelector('script')!;
		expect(inline).not.toBeNull();
		expect(inline.getAttribute('src')).toBe('/fe3-svg-script.js');
		expect(document.head.querySelector('script[src="/fe3-svg-script.js"]')).toBeNull();
		expect(document.head.querySelector('script[src="/fe3-fo-script.js"]')).not.toBeNull();
		// SVG <title> is an accessibility title, never the document title.
		const svgTitle = path.querySelector('title')!;
		expect(svgTitle).not.toBeNull();
		expect(svgTitle.namespaceURI).toBe(SVG_NS);
		expect(svgTitle.textContent).toBe('svg inline title');
		expect(document.head.querySelector('title')).toBeNull();
		// <foreignObject> content is back under HTML rules: resource + hoist.
		const hoisted = document.head.querySelector('link[href="/fe3-fo-sheet.css"]')!;
		expect(hoisted).not.toBeNull();
		expect(hoisted.getAttribute('data-precedence')).toBe('default');
		expect(document.head.querySelector('meta[name="fe3-fo-meta"]')).not.toBeNull();

		const r = await Server.renderToString(srv.SvgContexts, {});
		const bodyStart = r.html.indexOf('<section');
		expect(r.html.slice(0, bodyStart)).toContain('/fe3-fo-script.js');
		expect(r.html.slice(0, bodyStart)).toContain('/fe3-fo-sheet.css');
		expect(r.html.slice(0, bodyStart)).toContain('fe3-fo-meta');
		expect(r.html.slice(0, bodyStart)).not.toContain('/fe3-svg-script.js');
		expect(r.html.slice(0, bodyStart)).not.toContain('svg inline title');
		expect(r.html.slice(bodyStart)).toContain('/fe3-svg-script.js');
		expect(r.html.slice(bodyStart)).toContain('svg inline title');
		expect(r.html.slice(bodyStart)).not.toContain('/fe3-fo-sheet.css');
	});

	it('does not create script resources inside a <noscript> context', async () => {
		// Per ReactDOMFloat-test.js:8820
		await act(() => mountInto(NoscriptScript));
		const ns = document.querySelector('.fe3-nss noscript')!;
		expect(ns).not.toBeNull();
		expect(ns.innerHTML).toContain('/fe3-noscript.js');
		expect(document.head.querySelector('script[src="/fe3-noscript.js"]')).toBeNull();

		const r = await Server.renderToString(srv.NoscriptScript, {});
		const nsStart = r.html.indexOf('<noscript');
		expect(nsStart).toBeGreaterThan(-1);
		expect(r.html.slice(0, nsStart)).not.toContain('/fe3-noscript.js');
		expect(r.html.slice(nsStart, r.html.indexOf('</noscript>'))).toContain('/fe3-noscript.js');
	});

	it('treats only handler-free external async scripts as resources', async () => {
		// Per ReactDOMFloat-test.js:8681
		const c = document.createElement('div');
		document.body.appendChild(c);
		containers.push(c);
		const root = createRoot(c);
		await act(() => root.render(ScriptForms, { onLoad: () => {} }));

		const res = document.head.querySelector('script[src="/fe3-resource.js"]') as HTMLScriptElement;
		expect(res).not.toBeNull();
		expect(res.async).toBe(true);
		const section = c.querySelector('.fe3-scripts')!;
		expect(section.querySelector('script[src="/fe3-handler.js"]')).not.toBeNull();
		expect(section.querySelector('script[src="/fe3-plain.js"]')).not.toBeNull();
		const deferred = section.querySelector('script[src="/fe3-defer.js"]')!;
		expect(deferred.hasAttribute('defer')).toBe(true);
		expect(document.head.querySelector('script[src="/fe3-handler.js"]')).toBeNull();
		expect(document.head.querySelector('script[src="/fe3-plain.js"]')).toBeNull();

		// Unmount: the resource persists; per-site scripts leave with their tree.
		root.unmount();
		expect(document.head.querySelector('script[src="/fe3-resource.js"]')).not.toBeNull();
		expect(c.querySelector('script')).toBeNull();

		const r = await Server.renderToString(srv.ScriptForms, { onLoad: () => {} });
		const bodyStart = r.html.indexOf('<section');
		expect(r.html.slice(0, bodyStart)).toContain('/fe3-resource.js');
		const body = r.html.slice(bodyStart);
		expect(body).not.toContain('/fe3-resource.js');
		expect(body).toContain('/fe3-handler.js');
		expect(body).toContain('/fe3-plain.js');
		expect(body).toContain('/fe3-defer.js');
		expect(body).not.toMatch(/onload/i);
	});
});

describe('Float evidence (slice 3) — style-resource nonce and hoistable lifecycle', () => {
	it('emits style resources with a nonce', async () => {
		// Per ReactDOMFloat-test.js:8599
		// OCTANE DIVERGENCE: one <style> tag per resource (no same-precedence rule
		// merging) and a single RenderOptions.nonce channel rather than per-kind
		// nonce options; the nonce asserted here rides the authored prop.
		await act(() => mountInto(NonceStyle));
		const style = document.head.querySelector('style[data-href="fe3-nonce-css"]')!;
		expect(style).not.toBeNull();
		expect(style.getAttribute('nonce')).toBe('R4nD0m');
		expect(style.getAttribute('data-precedence')).toBe('default');
		expect(style.textContent).toContain('hotpink');

		const r = await Server.renderToString(srv.NonceStyle, {});
		const tag = r.html.match(/<style[^>]*data-href="fe3-nonce-css"[^>]*>/)?.[0];
		expect(tag).toBeTruthy();
		expect(tag).toContain('nonce="R4nD0m"');
	});

	it('hoists non-stylesheet link tags on the server and hydrates them on the client', async () => {
		// Per ReactDOMFloat-test.js:8937
		const r = await Server.renderToString(srv.PlainLinkPage, {});
		const bodyStart = r.html.indexOf('<main');
		expect(bodyStart).toBeGreaterThan(-1);
		document.head.innerHTML = r.html.slice(0, bodyStart);
		const c = document.createElement('div');
		document.body.appendChild(c);
		containers.push(c);
		c.innerHTML = r.html.slice(bodyStart);
		const serverLink = document.head.querySelector('link[href="/fe3-author"]')!;
		expect(serverLink).not.toBeNull();
		expect(serverLink.getAttribute('data-foo')).toBe('data');
		expect(serverLink.getAttribute('rel')).toBe('author');

		const root = hydrateRoot(c, PlainLinkPage, {});
		flushSync(() => {});
		// Adopted, not duplicated.
		expect(document.head.querySelector('link[href="/fe3-author"]')).toBe(serverLink);
		expect(document.head.querySelectorAll('link[href="/fe3-author"]')).toHaveLength(1);

		root.unmount();
		expect(serverLink.isConnected).toBe(false);
	});

	it('updates hoisted title text and attributes in place', () => {
		// Per ReactDOMFloat-test.js:9408
		const m = mount(TitleUpdate as any, { text: 'a title', foo: 'foo' });
		const title = document.head.querySelector('title')!;
		expect(title).not.toBeNull();
		expect(title.textContent).toBe('a title');
		expect(title.getAttribute('data-foo')).toBe('foo');

		m.update(TitleUpdate as any, { text: 'another title', foo: 'bar' });
		expect(document.head.querySelector('title')).toBe(title);
		expect(title.textContent).toBe('another title');
		expect(title.getAttribute('data-foo')).toBe('bar');

		m.unmount();
		expect(title.isConnected).toBe(false);
	});
});
