import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const packageRoot = fileURLToPath(new URL('../..', import.meta.url));
const packageRequire = createRequire(new URL('../../package.json', import.meta.url));
const vitePluginRequire = createRequire(
	new URL('../../../vite-plugin-octane/package.json', import.meta.url),
);
const { default: playwrightWebkit } = await import(
	pathToFileURL(vitePluginRequire.resolve('playwright-webkit')).href
);
const { webkit } = playwrightWebkit;

const frameHtml =
	'<!doctype html><html><body><input aria-label="Draft" value="unsaved draft" /></body></html>';
const parentHtml = '<!doctype html><html><body><main id="app"></main></body></html>';
const modes = ['same', 'cross', 'opaque', 'navigate'];
let browser;
let sources;

async function buildRuntime(dev) {
	const result = await build({
		stdin: {
			contents:
				"import { createElement, createRoot, flushSync } from 'octane';\nexport { createElement, createRoot, flushSync };",
			resolveDir: packageRoot,
			sourcefile: 'iframe-focus-preservation-entry.js',
			loader: 'js',
		},
		bundle: true,
		write: false,
		format: 'iife',
		platform: 'browser',
		globalName: 'OctaneIframeFocus',
		define: {
			'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production'),
			__OCTANE_PROFILE_ENABLED__: 'false',
		},
		plugins: [
			{
				name: 'octane-package-entry',
				setup(plugin) {
					plugin.onResolve({ filter: /^octane(?:\/|$)/ }, ({ path }) => ({
						path: packageRequire.resolve(path),
					}));
				},
			},
		],
	});
	return result.outputFiles[0].text;
}

before(async () => {
	sources = new Map();
	for (const dev of [true, false]) sources.set(dev, await buildRuntime(dev));
	browser = await webkit.launch({ headless: true });
});

after(async () => {
	await browser?.close();
});

describe('WebKit focus preservation through iframe origins', () => {
	for (const dev of [true, false]) {
		for (const shadow of [false, true]) {
			for (const mode of modes) {
				it(`keeps focused editing quiet for ${mode} frames (shadow=${shadow}, dev=${dev})`, async () => {
					const page = await browser.newPage();
					const errors = [];
					page.on('pageerror', (error) => errors.push(error.message));
					page.on('console', (message) => {
						if (message.type() === 'error') errors.push(message.text());
					});
					try {
						await page.route('http://parent.test/**', (route) => {
							const isFrame = new URL(route.request().url()).pathname === '/frame.html';
							return route.fulfill({
								contentType: 'text/html',
								body: isFrame ? frameHtml : parentHtml,
							});
						});
						await page.route('http://child.test/**', (route) =>
							route.fulfill({ contentType: 'text/html', body: frameHtml }),
						);
						await page.goto('http://parent.test/');
						await page.addScriptTag({ content: sources.get(dev) });
						await page.evaluate(
							({ mode, shadow }) => {
								const { createElement, createRoot, flushSync } = window.OctaneIframeFocus;
								const host = document.querySelector('#app');
								const container = shadow ? host.attachShadow({ mode: 'open' }) : host;
								const frameUrl = new URL('/frame.html', location.href);
								if (mode === 'cross') frameUrl.hostname = 'child.test';
								let value = 0;
								function App(props) {
									return createElement(
										'section',
										{},
										createElement('iframe', {
											key: 'frame',
											title: 'Editor',
											src: frameUrl.href,
											sandbox: mode === 'opaque' ? 'allow-scripts' : undefined,
										}),
										createElement('output', { key: 'output' }, String(props.value)),
										createElement('input', {
											key: 'outside',
											'aria-label': 'Outside draft',
											defaultValue: 'outside draft',
										}),
									);
								}
								const root = createRoot(container);
								root.render(App, { value });
								window.octaneFocusPreservation = {
									update() {
										flushSync(() => root.render(App, { value: ++value }));
									},
									navigate() {
										frameUrl.hostname = 'child.test';
										flushSync(() => root.render(App, { value: ++value }));
									},
								};
							},
							{ mode, shadow },
						);

						const input = page.frameLocator('iframe').getByRole('textbox', {
							name: 'Draft',
							exact: true,
						});
						await input.waitFor();
						if (mode === 'navigate') {
							await page.evaluate(() => window.octaneFocusPreservation.navigate());
							await page.waitForFunction(() => {
								const host = document.querySelector('#app');
								const container = host.shadowRoot ?? host;
								return container.querySelector('iframe').src.startsWith('http://child.test/');
							});
							await input.waitFor();
						}

						await input.fill('unsaved edited draft');
						await input.evaluate((element) => {
							element.focus();
							element.setSelectionRange(2, 8);
						});
						for (let index = 0; index < 3; index++) {
							await page.evaluate(() => window.octaneFocusPreservation.update());
						}
						assert.equal(
							await page.locator('output').textContent(),
							mode === 'navigate' ? '4' : '3',
						);
						assert.deepEqual(
							await input.evaluate((element) => ({
								focused: element.ownerDocument.activeElement === element,
								selection: [element.selectionStart, element.selectionEnd],
								value: element.value,
							})),
							{ focused: true, selection: [2, 8], value: 'unsaved edited draft' },
						);

						const outside = page.getByRole('textbox', { name: 'Outside draft', exact: true });
						await outside.fill('parent draft');
						await outside.evaluate((element) => element.setSelectionRange(1, 5));
						await page.evaluate(() => window.octaneFocusPreservation.update());
						assert.deepEqual(
							await outside.evaluate((element) => ({
								focused:
									element.getRootNode() instanceof ShadowRoot
										? element.getRootNode().activeElement === element
										: element.ownerDocument.activeElement === element,
								selection: [element.selectionStart, element.selectionEnd],
								value: element.value,
							})),
							{ focused: true, selection: [1, 5], value: 'parent draft' },
						);
						assert.deepEqual(errors, []);
					} finally {
						await page.close();
					}
				});
			}
		}
	}
});
