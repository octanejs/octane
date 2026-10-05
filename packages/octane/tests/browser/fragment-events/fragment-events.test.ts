// Native abort algorithms run before abort event handlers. jsdom runs them
// in registration order, so re-registration from an earlier handler needs
// a real browser to exercise the native listener lifetime.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import type { Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { launchBrowser } from '../../../../../test-utils/playwright-browser.js';
import { compile } from '../../../src/compiler/index.js';
import type { createRoot, flushSync, FragmentInstance } from '../../../src/index.js';

declare global {
	interface Window {
		OctaneFragmentEvents: {
			createRoot: typeof createRoot;
			flushSync: typeof flushSync;
			SingleChild: (props: { fragRef: { current: FragmentInstance | null } }) => void;
		};
	}
}

let browser: Browser;
const sources = new Map<boolean, string>();
const packageRoot = fileURLToPath(new URL('../../..', import.meta.url));
const packageExports = JSON.parse(
	readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
).exports as Record<string, string | { default?: string }>;
const fixture = new URL('../../conformance/_fixtures/fragment-refs-events.tsrx', import.meta.url);

beforeAll(async () => {
	for (const production of [false, true]) {
		const compiled = compile(readFileSync(fixture, 'utf8'), fileURLToPath(fixture), {
			mode: 'client',
			dev: !production,
			hmr: false,
		});
		expect(compiled.diagnostics).toEqual([]);
		const result = await build({
			stdin: {
				contents:
					"export { createRoot, flushSync } from 'octane'; export { SingleChild } from 'fragment-events-fixture';",
				resolveDir: fileURLToPath(new URL('.', import.meta.url)),
				loader: 'js',
			},
			plugins: [
				{
					name: 'fragment-events-fixture',
					setup(plugin) {
						plugin.onResolve({ filter: /^octane(?:\/|$)/ }, ({ path: request }) => {
							const entry = packageExports[request === 'octane' ? '.' : `./${request.slice(7)}`];
							const target = typeof entry === 'string' ? entry : entry?.default;
							if (!target) throw new Error(`Unknown Octane export: ${request}`);
							return { path: resolve(packageRoot, target) };
						});
						plugin.onResolve({ filter: /^fragment-events-fixture$/ }, ({ path }) => ({
							path,
							namespace: 'compiled-fixture',
						}));
						plugin.onLoad({ filter: /.*/, namespace: 'compiled-fixture' }, () => ({
							contents: compiled.code,
							loader: 'js',
							resolveDir: packageRoot,
						}));
					},
				},
			],
			bundle: true,
			write: false,
			format: 'iife',
			platform: 'browser',
			globalName: 'OctaneFragmentEvents',
			define: {
				'process.env.NODE_ENV': JSON.stringify(production ? 'production' : 'development'),
				__OCTANE_PROFILE_ENABLED__: 'false',
			},
		});
		sources.set(production, result.outputFiles[0].text);
	}
	browser = await launchBrowser({ headless: true });
});

afterAll(async () => {
	await browser?.close();
});

for (const production of [false, true]) {
	describe(production ? 'production runtime' : 'development runtime', () => {
		for (const targetKind of ['native', 'fragment'] as const) {
			it(`${targetKind} can replace a listener from an earlier abort handler`, async () => {
				const page = await browser.newPage();
				const errors: string[] = [];
				page.on('pageerror', (error) => errors.push(error.message));
				try {
					await page.setContent('<!doctype html><div id="root"></div>');
					await page.addScriptTag({ content: sources.get(production)! });
					const seen = await page.evaluate((kind) => {
						const { createRoot, flushSync, SingleChild } = window.OctaneFragmentEvents;
						const ref: { current: FragmentInstance | null } = { current: null };
						const root = createRoot(document.querySelector('#root')!);
						flushSync(() => root.render(SingleChild, { fragRef: ref }));
						const button = document.querySelector<HTMLButtonElement>('#k')!;
						const target = kind === 'native' ? button : ref.current!;
						const first = new AbortController();
						const second = new AbortController();
						const events: string[] = [];
						const listener = () => events.push('click');
						try {
							first.signal.addEventListener('abort', () => {
								target.addEventListener('click', listener, { signal: second.signal });
							});
							target.addEventListener('click', listener, { signal: first.signal });
							first.abort();
							button.click();
							second.abort();
							button.click();
							return events;
						} finally {
							first.abort();
							second.abort();
							root.unmount();
						}
					}, targetKind);
					expect(seen).toEqual(['click']);
					expect(errors).toEqual([]);
				} finally {
					await page.close();
				}
			});
		}
	});
}
