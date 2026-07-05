import { describe, it, expect, afterEach } from 'vitest';
import { preload, preinit, preconnect, prefetchDNS } from '../src/index.js';
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
});
