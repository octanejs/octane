/**
 * Static SSR differential (Phase F): the SAME `.tsrx` fixture drives
 * createStaticHandler → query(Request) → createStaticRouter →
 * <StaticRouterProvider> on BOTH sides — octane/server renderToString vs
 * react-dom/server renderToString over real react-router — and the outputs
 * must match after stripping framework marker comments (octane emits
 * `<!--[-->` hydration ranges; React emits `<!-- -->` text separators) and
 * collapsing template whitespace. The __staticRouterHydrationData script
 * payload must match exactly (same dual-stringified JSON, same escaping).
 */
import { describe, it, expect } from 'vitest';
import { basename, join, resolve } from 'node:path';
import { renderToString as octaneRenderToString } from 'octane/server';
import { createElement as reactCreateElement } from 'react';
import { renderToString as reactRenderToString } from 'react-dom/server';
import {
	createStaticHandler as octaneCreateStaticHandler,
	createStaticRouter as octaneCreateStaticRouter,
} from '@octanejs/remix-router';
import * as octaneFixture from '../_fixtures/static-ssr-diff.tsrx';

const FIXTURE = resolve(__dirname, '../_fixtures/static-ssr-diff.tsrx');
const CACHE = resolve(__dirname, '../differential/.react-cache');

// Must match _setup.ts / _rig.ts so the cache file name lines up.
function hashString(s: string): string {
	let h = 5381;
	for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
	return Math.abs(h).toString(36);
}

async function loadReactFixture(): Promise<any> {
	const slug = basename(FIXTURE).replace(/\.tsrx$/, '');
	const file = join(CACHE, `${slug}-${hashString(FIXTURE)}.js`);
	return import(/* @vite-ignore */ file);
}

// Strip framework-internal comment markers and collapse whitespace-only text
// between tags (mirrors the client rig's normaliseHtml — octane preserves
// authored template whitespace, React's JSX strips it).
function normalize(html: string): string {
	return html
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/>\s+</g, '><')
		.trim();
}

async function renderOctane(url: string, hydrate?: boolean): Promise<string> {
	const handler = octaneCreateStaticHandler(octaneFixture.routes as any);
	const context = await handler.query(new Request(url));
	if (context instanceof Response) throw new Error('unexpected redirect Response');
	const router = octaneCreateStaticRouter(handler.dataRoutes, context);
	const { html } = octaneRenderToString(octaneFixture.StaticApp as any, {
		router,
		context,
		hydrate,
	});
	return html;
}

async function renderReact(url: string, hydrate?: boolean): Promise<string> {
	const rr = await import('react-router');
	const reactFixture = await loadReactFixture();
	const handler = rr.createStaticHandler(reactFixture.routes);
	const context = await handler.query(new Request(url));
	if (context instanceof Response) throw new Error('unexpected redirect Response');
	const router = rr.createStaticRouter(handler.dataRoutes, context);
	return reactRenderToString(
		reactCreateElement(reactFixture.StaticApp, { router, context, hydrate }),
	);
}

describe('static SSR: octane/server vs react-dom/server over real react-router', () => {
	it('index route markup matches', async () => {
		const i = await renderOctane('http://localhost/', false);
		const r = await renderReact('http://localhost/', false);
		expect(normalize(i)).toBe(normalize(r));
	});

	it('loader-data route markup matches', async () => {
		const i = await renderOctane('http://localhost/data', false);
		const r = await renderReact('http://localhost/data', false);
		expect(normalize(i)).toBe(normalize(r));
		expect(normalize(i)).toContain('value=ssr-data');
	});

	it('thrown-Response errorElement markup matches', async () => {
		const i = await renderOctane('http://localhost/boom', false);
		const r = await renderReact('http://localhost/boom', false);
		expect(normalize(i)).toBe(normalize(r));
		expect(normalize(i)).toContain('status=400:kaboom');
	});

	it('declarative <StaticRouter> + descriptor-children <Routes> markup matches', async () => {
		const { html } = octaneRenderToString(octaneFixture.DeclarativeStaticApp as any, {
			url: '/about',
		});
		const reactFixture = await loadReactFixture();
		const r = reactRenderToString(
			reactCreateElement(reactFixture.DeclarativeStaticApp, { url: '/about' }),
		);
		expect(normalize(html)).toBe(normalize(r));
		expect(normalize(html)).toContain('About');
	});

	it('the __staticRouterHydrationData script payload matches exactly', async () => {
		const extract = (html: string) => {
			const m = html.match(/window\.__staticRouterHydrationData = JSON\.parse\((.*?)\);/s);
			return m?.[1];
		};
		const i = extract(await renderOctane('http://localhost/data'));
		const r = extract(await renderReact('http://localhost/data'));
		expect(i).toBeDefined();
		expect(i).toBe(r);

		// Error serialization round-trips through the same __type tagging.
		// Compare PARSED here: the serialized ErrorResponseImpl's JSON key order
		// is a transpilation artifact (upstream's published dist erases class
		// fields, so keys follow constructor-assignment order; our vendored TS
		// compiles with field defines first) — the payloads are identical.
		const ie = extract(await renderOctane('http://localhost/boom'));
		const re = extract(await renderReact('http://localhost/boom'));
		expect(ie).toContain('RouteErrorResponse');
		const parse = (payload: string) => JSON.parse(JSON.parse(payload));
		expect(parse(ie!)).toEqual(parse(re!));
	});
});
