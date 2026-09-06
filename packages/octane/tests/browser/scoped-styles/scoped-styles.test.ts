import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import { launchBrowser } from '../../../../../test-utils/playwright-browser.js';
import { createServer, type Plugin, type ViteDevServer } from 'vite';
import { octane } from 'octane/compiler/vite';
import { renderToString } from 'octane/server';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadServerFixture } from '../../_server-fixture.js';

// Plan S2.7 — the RFC tsrx-org/RFCs#1 opening example in a real browser: a
// theme module (`div { color: black } .dark { color: white }`), a component
// applying it, an owned scope (`div { color: purple }`) and a nested `@{}`
// scope (`div { font-weight: bold }`). Computed styles prove the cascade the
// RFC promises: the theme's `.dark` span is white, the local purple rule
// beats the theme's black on the outer div, and the nested div is purple AND
// bold because both scopes reach it.

const HERE = dirname(fileURLToPath(import.meta.url));
const PURPLE = 'rgb(128, 0, 128)';
const WHITE = 'rgb(255, 255, 255)';

let browser: Browser;

beforeAll(async () => {
	browser = await launchBrowser({ headless: true });
});

afterAll(async () => {
	await browser?.close();
});

type Mode = 'dev' | 'prod';
type Kind = 'client' | 'hydrate';

function serverRender(mode: Mode): { html: string; css: string } {
	// Module ids mirror the ones Vite hands the client transform (root-relative
	// to `HERE`) so the position-derived scope hashes agree across the two
	// compilations and hydration adopts the server markup.
	const compileOptions = mode === 'prod' ? { hmr: false } : {};
	const themeModule = loadServerFixture(join(HERE, 'theme.tsrx'), {
		id: '/theme.tsrx',
		compileOptions,
	});
	const panelModule = loadServerFixture(join(HERE, 'panel.tsrx'), {
		id: '/panel.tsrx',
		compileOptions,
		runtimeModules: { './theme.tsrx': themeModule },
	});
	const { html, css } = renderToString(panelModule.Panel);
	return { html, css };
}

async function openPage(
	kind: Kind,
	mode: Mode,
): Promise<{ failures: string[]; page: Page; server: ViteDevServer }> {
	const rendered = kind === 'hydrate' ? serverRender(mode) : { html: '', css: '' };
	const shellPlugin: Plugin = {
		name: 'scoped-styles-shell',
		transformIndexHtml(source) {
			return source
				.replace('<!--octane-css-->', () => rendered.css)
				.replace('<!--octane-ssr-->', () => rendered.html);
		},
	};
	const server = await createServer({
		cacheDir: join(HERE, `../../../../../node_modules/.vite/octane-scoped-styles-${kind}-${mode}`),
		configFile: false,
		root: HERE,
		logLevel: 'error',
		plugins: [shellPlugin, octane(mode === 'prod' ? { hmr: false } : {})],
		server: { host: '127.0.0.1', port: 0 },
	});
	const failures: string[] = [];
	let page: Page | undefined;
	try {
		await server.listen();
		const address = server.httpServer!.address();
		if (!address || typeof address === 'string') {
			throw new Error('Vite did not expose a TCP port');
		}
		page = await browser.newPage();
		page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
		page.on('console', (message) => {
			if (message.type() === 'error' || message.type() === 'warning') {
				failures.push(`${message.type()}: ${message.text()}`);
			}
		});
		await page.goto(`http://127.0.0.1:${address.port}`);
		await page.waitForFunction(() => Boolean(window.__scopedStyles));
		return { failures, page, server };
	} catch (error) {
		await Promise.allSettled([page?.close(), server.close()]);
		throw error;
	}
}

function expectRfcCascade(state: {
	outerColor: string;
	innerColor: string;
	innerWeight: string;
	darkColor: string;
	darkClasses: string[];
	outerClasses: string[];
	innerClasses: string[];
}) {
	expect(state.darkColor).toBe(WHITE);
	expect(state.outerColor).toBe(PURPLE);
	expect(state.innerColor).toBe(PURPLE);
	expect(state.innerWeight).toBe('700');
	expect(state.darkClasses).toContain('dark');
	// outer: its own scope + the theme; inner: outer scope, nested scope, theme.
	expect(state.outerClasses.filter((cls) => cls.startsWith('tsrx-'))).toHaveLength(2);
	expect(state.innerClasses.filter((cls) => cls.startsWith('tsrx-'))).toHaveLength(3);
}

describe.sequential('scoped styles — RFC opening example in a real browser', () => {
	for (const mode of ['dev', 'prod'] as const) {
		it(`${mode} client render: theme span white, outer purple, nested purple and bold`, async () => {
			const { failures, page, server } = await openPage('client', mode);
			try {
				const state = await page.evaluate(() => window.__scopedStyles);
				expect(state.hydrated).toBeNull();
				expectRfcCascade(state.client);
				// One sheet per hash: theme, outer scope, nested scope — no duplicates.
				expect(state.sheetIds).toHaveLength(3);
				expect(new Set(state.sheetIds).size).toBe(3);
				expect(state.sheetIds[0]).toBe(state.themeClass);
				expect(failures).toEqual([]);
			} finally {
				try {
					await page.evaluate(() => window.__scopedStyles.unmount());
				} finally {
					await Promise.allSettled([page.close(), server.close()]);
				}
			}
		});

		it(`${mode} SSR + hydration adopts the server markup with the scope classes intact`, async () => {
			const { failures, page, server } = await openPage('hydrate', mode);
			try {
				const state = await page.evaluate(() => window.__scopedStyles);
				expect(state.hydrated).not.toBeNull();
				expect(state.hydratedSame).toBe(true);
				expect(failures).toEqual([]);
				for (const view of [state.hydrated!, state.client]) {
					expect(view.darkColor).toBe(WHITE);
					expect(view.innerWeight).toBe('700');
					expect(view.darkClasses).toContain('dark');
					expect(view.outerClasses.filter((cls) => cls.startsWith('tsrx-'))).toHaveLength(2);
					expect(view.innerClasses.filter((cls) => cls.startsWith('tsrx-'))).toHaveLength(3);
				}
				// The server-emitted scope sheets were adopted, the theme sheet
				// injected once by the theme module: one sheet per hash, no repeats.
				expect(state.sheetIds).toHaveLength(3);
				expect(new Set(state.sheetIds).size).toBe(3);
			} finally {
				try {
					await page.evaluate(() => window.__scopedStyles.unmount());
				} finally {
					await Promise.allSettled([page.close(), server.close()]);
				}
			}
		});

		// The imported theme's sheet must be part of `renderToString().css` and
		// precede the scope sheets: the theme's `div { color: black }` and the
		// scope's `div { color: purple }` tie on specificity, so only source
		// order lets the local purple rule win on the hydrated page.
		it(`${mode} SSR + hydration keeps the theme sheet ahead of the scopes so the local purple rule wins`, async () => {
			const { page, server } = await openPage('hydrate', mode);
			try {
				const state = await page.evaluate(() => window.__scopedStyles);
				expect(state.sheetIds[0]).toBe(state.themeClass);
				expectRfcCascade(state.hydrated!);
				expectRfcCascade(state.client);
			} finally {
				try {
					await page.evaluate(() => window.__scopedStyles.unmount());
				} finally {
					await Promise.allSettled([page.close(), server.close()]);
				}
			}
		});
	}
});
