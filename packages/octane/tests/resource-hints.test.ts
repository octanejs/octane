import { describe, it, expect, afterEach, vi } from 'vitest';
import {
	preload,
	preinit,
	preloadModule,
	preinitModule,
	preconnect,
	prefetchDNS,
	resetFloatResourceState,
} from '../src/index.js';
import * as Server from 'octane/server';

// React DOM's resource hints: client calls insert deduped tags into
// document.head; server calls collect into the render's head buffer. The
// shared data-oct-hint key lets a hydrating client dedupe against SSR output.

afterEach(() => {
	document.head
		.querySelectorAll('[data-oct-hint], [data-precedence], [data-oct-res]')
		.forEach((el) => el.remove());
	resetFloatResourceState();
});

describe('resource hints — client', () => {
	it('preload inserts one deduped <link rel="preload">', () => {
		preload('/font.woff2', { as: 'font', crossOrigin: 'anonymous' });
		preload('/font.woff2', { as: 'font', crossOrigin: 'anonymous' }); // deduped
		const links = document.head.querySelectorAll('link[rel="preload"][href="/font.woff2"]');
		expect(links).toHaveLength(1);
		expect(links[0].getAttribute('as')).toBe('font');
		expect(links[0].getAttribute('crossorigin')).toBe('anonymous');
	});

	it('preinit as style/script inserts stylesheet link / async script', () => {
		preinit('/app.css', { as: 'style' });
		preinit('/app.js', { as: 'script' });
		expect(document.head.querySelector('link[rel="stylesheet"][href="/app.css"]')).not.toBeNull();
		const s = document.head.querySelector('script[src="/app.js"]') as HTMLScriptElement;
		expect(s).not.toBeNull();
		expect(s.async).toBe(true);
	});

	it('preloadModule inserts one deduped <link rel="modulepreload">', () => {
		preloadModule('/entry.mjs', { integrity: 'sha384-x' });
		preloadModule('/entry.mjs');
		const links = document.head.querySelectorAll('link[rel="modulepreload"][href="/entry.mjs"]');
		expect(links).toHaveLength(1);
		expect(links[0].getAttribute('integrity')).toBe('sha384-x');
	});

	it('preinitModule inserts one deduped async module script; non-script destinations no-op', () => {
		preinitModule('/boot.mjs', { crossOrigin: 'anonymous' });
		preinitModule('/boot.mjs');
		const scripts = document.head.querySelectorAll('script[src="/boot.mjs"]');
		expect(scripts).toHaveLength(1);
		const s = scripts[0] as HTMLScriptElement;
		expect(s.type).toBe('module');
		expect(s.async).toBe(true);
		expect(s.getAttribute('crossorigin')).toBe('anonymous');
		// Module preinit has only the script destination — others fail closed.
		preinitModule('/styles.mjs', { as: 'style' });
		expect(document.head.querySelector('script[src="/styles.mjs"]')).toBeNull();
		expect(document.head.querySelector('link[href="/styles.mjs"]')).toBeNull();
	});

	it('preinit style/script share Float resource identity (upgrade semantics, one-way)', () => {
		// preinit(style) is a stylesheet resource: precedence-grouped and deduped
		// against the <link rel="stylesheet" precedence> form.
		preinit('/shared.css', { as: 'style' });
		const sheet = document.head.querySelector('link[rel="stylesheet"][href="/shared.css"]');
		expect(sheet).not.toBeNull();
		expect(sheet!.getAttribute('data-precedence')).toBe('default');
		preinit('/shared.css', { as: 'style' }); // deduped
		expect(
			document.head.querySelectorAll('link[rel="stylesheet"][href="/shared.css"]'),
		).toHaveLength(1);
		// A later preload for the initialized sheet adds nothing.
		preload('/shared.css', { as: 'style' });
		expect(document.head.querySelector('link[rel="preload"][href="/shared.css"]')).toBeNull();
		// The reverse order keeps both tags (preload first, then the real sheet).
		preload('/other.css', { as: 'style' });
		preinit('/other.css', { as: 'style' });
		expect(document.head.querySelector('link[rel="preload"][href="/other.css"]')).not.toBeNull();
		expect(
			document.head.querySelectorAll('link[rel="stylesheet"][href="/other.css"]'),
		).toHaveLength(1);

		// preinit(script) is a script resource; a later script preload is a no-op.
		preinit('/boot.js', { as: 'script' });
		const script = document.head.querySelector('script[src="/boot.js"]');
		expect(script).not.toBeNull();
		expect((script as HTMLScriptElement).async).toBe(true);
		preload('/boot.js', { as: 'script' });
		expect(document.head.querySelector('link[rel="preload"][href="/boot.js"]')).toBeNull();
	});

	it('preinit style accepts a precedence option and joins that group', () => {
		preinit('/grouped.css', { as: 'style', precedence: 'high' });
		const sheet = document.head.querySelector('link[href="/grouped.css"]')!;
		expect(sheet.getAttribute('data-precedence')).toBe('high');
	});

	it('preloadModule after preinitModule is a no-op', () => {
		preinitModule('/mod.mjs');
		preloadModule('/mod.mjs');
		expect(document.head.querySelector('link[rel="modulepreload"][href="/mod.mjs"]')).toBeNull();
		expect(document.head.querySelectorAll('script[src="/mod.mjs"]')).toHaveLength(1);
	});

	it('image preloads with imageSrcSet key on the srcset, not the href', () => {
		preload('/hero.png', { as: 'image', imageSrcSet: '/hero@1x.png 1x, /hero@2x.png 2x' });
		preload('/hero.png', { as: 'image', imageSrcSet: '/hero-wide@1x.png 1x' });
		// Same href, different srcsets → two distinct preloads.
		expect(document.head.querySelectorAll('link[rel="preload"][as="image"]')).toHaveLength(2);
		// Same srcset again (different href) → deduped.
		preload('/hero-alt.png', { as: 'image', imageSrcSet: '/hero-wide@1x.png 1x' });
		expect(document.head.querySelectorAll('link[rel="preload"][as="image"]')).toHaveLength(2);
		const first = document.head.querySelector(
			'link[imagesrcset="/hero@1x.png 1x, /hero@2x.png 2x"]',
		);
		expect(first).not.toBeNull();
	});

	it('serializes fetchPriority and media through their canonical attributes', () => {
		preload('/late.css', { as: 'style', fetchPriority: 'low', media: 'print' });
		const l = document.head.querySelector('link[rel="preload"][href="/late.css"]')!;
		expect(l.getAttribute('fetchpriority')).toBe('low');
		expect(l.getAttribute('media')).toBe('print');
	});

	it('dev-warns on malformed options and stays a no-op', () => {
		const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			preload('/nope.woff2', {} as any); // missing `as`
			preinit('/nope.js', { as: 'font' } as any); // invalid preinit destination
			preload('', { as: 'style' }); // empty href
			expect(document.head.querySelector('link[href="/nope.woff2"]')).toBeNull();
			expect(document.head.querySelector('[href="/nope.js"]')).toBeNull();
			const warns = errSpy.mock.calls.map((c) => String(c[0]));
			expect(warns.some((m) => m.includes('preload') && m.includes('as'))).toBe(true);
			expect(warns.some((m) => m.includes('preinit'))).toBe(true);
		} finally {
			errSpy.mockRestore();
		}
	});

	it('preconnect and prefetchDNS insert their links once', () => {
		preconnect('https://cdn.example.com');
		preconnect('https://cdn.example.com');
		prefetchDNS('https://api.example.com');
		expect(
			document.head.querySelectorAll('link[rel="preconnect"][href="https://cdn.example.com"]'),
		).toHaveLength(1);
		expect(
			document.head.querySelectorAll('link[rel="dns-prefetch"][href="https://api.example.com"]'),
		).toHaveLength(1);
	});
});

describe('resource hints — server', () => {
	it('render-time hints fold into the head output, deduped', async () => {
		const App = (_props: any, scope: any) => {
			Server.preload('/font.woff2', { as: 'font' });
			Server.preload('/font.woff2', { as: 'font' });
			Server.preconnect('https://cdn.example.com');
			return Server.createElement('div', { id: 'app' }, 'hi') as any;
		};
		const r = await Server.renderToString(App as any);
		const preloads = r.html.match(/rel="preload"/g) || [];
		expect(preloads).toHaveLength(1);
		expect(r.html).toContain('rel="preconnect"');
		expect(r.html).toContain('data-oct-hint');
		expect(r.html).toContain('id="app"');
	});

	it('a client call for an SSR-emitted hint is a no-op (shared dedupe key)', async () => {
		const App = () => {
			Server.prefetchDNS('https://dns.example.com');
			return Server.createElement('div', null, 'x') as any;
		};
		const r = await Server.renderToString(App as any);
		// Simulate the SSR head landing in the document, then the client calling.
		document.head.insertAdjacentHTML('afterbegin', r.html.split('<div')[0]);
		prefetchDNS('https://dns.example.com');
		expect(
			document.head.querySelectorAll('link[rel="dns-prefetch"][href="https://dns.example.com"]'),
		).toHaveLength(1);
	});

	it('SSR mirrors the unified identity and image keying', async () => {
		const App = () => {
			Server.preinit('/srv.css', { as: 'style', precedence: 'low' });
			Server.preload('/srv.css', { as: 'style' }); // no-op after init
			Server.preinit('/srv.js', { as: 'script' });
			Server.preload('/srv.js', { as: 'script' }); // no-op after init
			Server.preload('/pic.png', { as: 'image', imageSrcSet: '/pic@2x.png 2x' });
			Server.preload('/pic-alt.png', { as: 'image', imageSrcSet: '/pic@2x.png 2x' }); // same srcset → deduped
			return Server.createElement('div', null, 'x') as any;
		};
		const r = await Server.renderToString(App as any);
		expect(r.html.match(/rel="preload"/g) || []).toHaveLength(1); // only the image preload
		expect(r.html).toContain('data-precedence="low"');
		expect(r.html.match(/\/srv\.css/g) || []).toHaveLength(1);
		expect(r.html).toContain('src="/srv.js"');
		expect(r.html.match(/imagesrcset/g) || []).toHaveLength(1);
	});

	it('module hints fold into head output and share the client dedupe key', async () => {
		const App = () => {
			Server.preloadModule('/entry.mjs');
			Server.preloadModule('/entry.mjs');
			Server.preinitModule('/boot.mjs');
			Server.preinitModule('/skip.css', { as: 'style' }); // fails closed
			return Server.createElement('div', null, 'x') as any;
		};
		const r = await Server.renderToString(App as any);
		expect(r.html.match(/rel="modulepreload"/g) || []).toHaveLength(1);
		expect(r.html).toContain('<script type="module" src="/boot.mjs" async');
		expect(r.html).not.toContain('/skip.css');
		// SSR head lands in the document; the hydrating client's calls are no-ops.
		document.head.insertAdjacentHTML('afterbegin', r.html.split('<div')[0]);
		preloadModule('/entry.mjs');
		preinitModule('/boot.mjs');
		expect(
			document.head.querySelectorAll('link[rel="modulepreload"][href="/entry.mjs"]'),
		).toHaveLength(1);
		expect(document.head.querySelectorAll('script[src="/boot.mjs"]')).toHaveLength(1);
	});
});
