import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import type { Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { launchBrowser } from '../../../../../test-utils/playwright-browser.js';
import { compile } from '../../../src/compiler/index.js';
import type { createRoot, flushSync, OctaneNode } from '../../../src/index.js';

const packageRoot = fileURLToPath(new URL('../../..', import.meta.url));
const packageRequire = createRequire(new URL('../../../package.json', import.meta.url));
const fixtureSource = `
export function DynamicFrame(props: { src: string }) @{
	<iframe sandbox="allow-scripts allow-same-origin" src={props.src} />
}

export function SpreadFrame(props: { src: string }) @{
	<iframe {...{ sandbox: 'allow-scripts allow-same-origin', src: props.src }} />
}
`;
type FixtureName = 'DynamicFrame' | 'SpreadFrame';
type FrameComponent = (props: { src: string }) => OctaneNode;

declare global {
	interface Window {
		OctaneIframeNavigation: {
			createRoot: typeof createRoot;
			flushSync: typeof flushSync;
			ordinary: Record<FixtureName, FrameComponent>;
			native: Record<FixtureName, FrameComponent>;
		};
		iframeNavigation: {
			messages: string[];
			update(src: string): boolean;
		};
	}
}

let browser: Browser;
const sources = new Map<boolean, string>();

beforeAll(async () => {
	for (const dev of [false, true]) {
		const compiled = new Map<string, string>(
			(['ordinary', 'native'] as const).map((kind) => {
				const result = compile(
					(kind === 'native' ? "import 'octane/signals';\n" : '') + fixtureSource,
					`/iframe-navigation-${kind}.tsrx`,
					{ mode: 'client', dev, hmr: false },
				);
				expect(result.diagnostics).toEqual([]);
				return [`${kind}-iframe-fixture`, result.code] as const;
			}),
		);
		const result = await build({
			stdin: {
				contents: `import { createRoot, flushSync } from 'octane';
import * as ordinary from 'ordinary-iframe-fixture';
import * as native from 'native-iframe-fixture';
export { createRoot, flushSync, ordinary, native };`,
				resolveDir: packageRoot,
				sourcefile: 'iframe-navigation-entry.js',
				loader: 'js',
			},
			bundle: true,
			write: false,
			format: 'iife',
			platform: 'browser',
			globalName: 'OctaneIframeNavigation',
			define: {
				'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production'),
				__OCTANE_PROFILE_ENABLED__: 'false',
			},
			plugins: [
				{
					name: 'iframe-navigation-fixtures',
					setup(plugin) {
						plugin.onResolve({ filter: /^octane(?:\/|$)/ }, ({ path }) => ({
							path: packageRequire.resolve(path),
						}));
						plugin.onResolve({ filter: /^(ordinary|native)-iframe-fixture$/ }, ({ path }) => ({
							path,
							namespace: 'compiled-fixture',
						}));
						plugin.onLoad({ filter: /.*/, namespace: 'compiled-fixture' }, ({ path }) => ({
							contents: compiled.get(path),
							loader: 'js',
							resolveDir: packageRoot,
						}));
					},
				},
			],
		});
		sources.set(dev, result.outputFiles[0].text);
	}
	browser = await launchBrowser({ headless: true });
});

afterAll(async () => {
	await browser?.close();
});

describe.sequential('compiled iframe navigation in Chromium', () => {
	for (const dev of [false, true]) {
		for (const kind of ['ordinary', 'native'] as const) {
			it.each(['DynamicFrame', 'SpreadFrame'] as const)(
				`%s starts with its foreign sandbox URL and navigates updates (${kind}, dev=${dev})`,
				async (name) => {
					const page = await browser.newPage();
					const failures: string[] = [];
					page.on('pageerror', (error) => failures.push(error.message));
					page.on('console', (message) => {
						if (message.type() === 'warning' || message.type() === 'error') {
							failures.push(message.text());
						}
					});
					try {
						await page.route('http://parent.test/**', (route) =>
							route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' }),
						);
						await page.route('https://foreign.test/**', (route) =>
							route.fulfill({
								contentType: 'text/html',
								body: `<script>parent.postMessage({token:'iframe-navigation',path:${JSON.stringify(new URL(route.request().url()).pathname)}},'*')</script>`,
							}),
						);
						await page.goto('http://parent.test/');
						await page.addScriptTag({ content: sources.get(dev)! });
						const initial = await page.evaluate(
							({ kind, name }) => {
								const { createRoot, flushSync } = window.OctaneIframeNavigation;
								const container = document.createElement('div');
								document.body.appendChild(container);
								const root = createRoot(container);
								const Component = window.OctaneIframeNavigation[kind][name];
								const messages: string[] = [];
								window.addEventListener('message', (event) => {
									if (
										event.origin === 'https://foreign.test' &&
										event.data?.token === 'iframe-navigation'
									) {
										messages.push(event.data.path);
									}
								});
								root.render(Component, { src: 'https://foreign.test/initial' });
								const iframe = container.querySelector('iframe')!;
								window.iframeNavigation = {
									messages,
									update(src) {
										flushSync(() => root.render(Component, { src }));
										return iframe === container.querySelector('iframe');
									},
								};
								return iframe.getAttribute('src');
							},
							{ kind, name },
						);
						await page.waitForFunction(() => window.iframeNavigation.messages.includes('/initial'));
						expect(initial).toBe('https://foreign.test/initial');
						expect(
							await page.evaluate(() =>
								window.iframeNavigation.update('https://foreign.test/updated'),
							),
						).toBe(true);
						await page.waitForFunction(() => window.iframeNavigation.messages.includes('/updated'));
						expect(await page.locator('iframe').getAttribute('src')).toBe(
							'https://foreign.test/updated',
						);
						expect(await page.evaluate(() => window.iframeNavigation.messages)).toEqual([
							'/initial',
							'/updated',
						]);
						// Connecting without src first creates an inherited-origin about:blank
						// document and makes Chromium warn about this otherwise foreign sandbox.
						expect(failures).toEqual([]);
					} finally {
						await page.close();
					}
				},
			);
		}
	}
});
