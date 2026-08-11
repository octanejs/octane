import { describe, it, expect, afterEach } from 'vitest';
import {
	preload,
	preinit,
	preloadModule,
	preinitModule,
	preconnect,
	prefetchDNS,
} from '../src/index.js';
import * as Server from 'octane/server';

// React DOM's resource hints: client calls insert deduped tags into
// document.head; server calls collect into the render's head buffer. The
// shared data-oct-hint key lets a hydrating client dedupe against SSR output.

afterEach(() => {
	document.head.querySelectorAll('[data-oct-hint]').forEach((el) => el.remove());
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
