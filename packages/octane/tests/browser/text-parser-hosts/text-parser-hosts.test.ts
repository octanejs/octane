import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import type { Browser, Page } from 'playwright';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { launchBrowser } from '../../../../../test-utils/playwright-browser.js';
import { compile } from '../../../src/compiler/index.js';
import type { createRoot, flushSync } from '../../../src/index.js';

const fixtureURL = new URL('./hosts.tsrx', import.meta.url);
const packageRoot = fileURLToPath(new URL('../../..', import.meta.url));
const packageExports = JSON.parse(
	readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
).exports as Record<string, string | { default?: string }>;
const cases = {
	TextareaHole: (text: string) => `<textarea id="target">${text}</textarea>`,
	TableHole: (text: string) => `<table id="target">${text}</table>`,
	BodyHole: (text: string) => `<table><tbody id="target">${text}</tbody></table>`,
	RowHole: (text: string) => `<table><tbody><tr id="target">${text}</tr></tbody></table>`,
	ColgroupHole: (text: string) => `<table><colgroup id="target">${text}</colgroup></table>`,
	SelectHole: (text: string) => `<select id="target">${text}</select>`,
	OptionHole: (text: string) => `<select><option id="target">${text}</option></select>`,
	TablePair: (text: string) => `<table id="target">${text}</table><aside id="tail">tail</aside>`,
	BodyPair: (text: string) =>
		`<table><tbody id="target">${text}</tbody></table><aside id="tail">tail</aside>`,
	ColgroupPair: (text: string) =>
		`<table><colgroup id="target">${text}</colgroup></table><aside id="tail">tail</aside>`,
} as const;
type CaseName = keyof typeof cases;

declare global {
	interface Window {
		OctaneTextParserHosts: {
			createRoot: typeof createRoot;
			flushSync: typeof flushSync;
			fixtures: Record<CaseName, (props: { text: string }) => void>;
		};
	}
}

let browser: Browser;
let page: Page | undefined;
let source: string;
let failures: string[];

beforeAll(async () => {
	const compiled = compile(readFileSync(fixtureURL, 'utf8'), fileURLToPath(fixtureURL), {
		mode: 'client',
		dev: false,
		hmr: false,
	});
	expect(compiled.diagnostics).toEqual([]);
	const result = await build({
		stdin: {
			contents: `import { createRoot, flushSync } from 'octane';
import * as fixtures from 'text-parser-hosts-fixture';
export { createRoot, flushSync, fixtures };`,
			resolveDir: fileURLToPath(new URL('.', import.meta.url)),
			sourcefile: 'text-parser-hosts-entry.js',
			loader: 'js',
		},
		bundle: true,
		write: false,
		format: 'iife',
		platform: 'browser',
		globalName: 'OctaneTextParserHosts',
		define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
		plugins: [
			{
				name: 'text-parser-hosts-fixture',
				setup(plugin) {
					plugin.onResolve({ filter: /^octane(?:\/|$)/ }, ({ path: request }) => {
						const entry = packageExports[request === 'octane' ? '.' : `./${request.slice(7)}`];
						const target = typeof entry === 'string' ? entry : entry?.default;
						if (!target) throw new Error(`Unknown Octane export: ${request}`);
						return { path: resolve(packageRoot, target) };
					});
					plugin.onResolve({ filter: /^text-parser-hosts-fixture$/ }, () => ({
						path: 'text-parser-hosts-fixture',
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
	});
	source = result.outputFiles[0].text;
	browser = await launchBrowser({ headless: true });
});

afterEach(async () => {
	await page?.close();
	page = undefined;
	expect(failures).toEqual([]);
});

afterAll(async () => {
	await browser?.close();
});

describe('compiled text-only parser-sensitive hosts in Chromium', () => {
	for (const name of Object.keys(cases) as CaseName[]) {
		it(`${name} preserves mount, update, empty text, and DOM identity`, async () => {
			failures = [];
			page = await browser.newPage();
			page.on('pageerror', (error) => failures.push(error.message));
			await page.addScriptTag({ content: source });
			const result = await page.evaluate((name) => {
				const { createRoot, flushSync, fixtures } = window.OctaneTextParserHosts;
				const container = document.createElement('form');
				document.body.appendChild(container);
				const root = createRoot(container);
				try {
					const Component = fixtures[name];
					root.render(Component, { text: 'X' });
					const target = container.querySelector('#target')!;
					const text = target.firstChild;
					const tail = container.querySelector('#tail');
					const snapshot = () => ({
						html: container.innerHTML,
						childTypes: [...target.childNodes].map((child) => child.nodeType),
						text: target.textContent,
						sameTarget: container.querySelector('#target') === target,
						sameText: target.firstChild === text,
						sameTail: container.querySelector('#tail') === tail,
						tailLast: tail === null || tail === container.lastElementChild,
						topLevelCount: container.children.length,
						value:
							target instanceof HTMLTextAreaElement ||
							target instanceof HTMLSelectElement ||
							target instanceof HTMLOptionElement
								? target.value
								: null,
						defaultValue: target instanceof HTMLTextAreaElement ? target.defaultValue : null,
						parentValue:
							target instanceof HTMLOptionElement
								? (target.parentElement as HTMLSelectElement).value
								: null,
					});
					const initial = snapshot();
					if (target instanceof HTMLTextAreaElement) target.value = 'typed';
					flushSync(() => root.render(Component, { text: 'Y' }));
					const changed = snapshot();
					if (target instanceof HTMLTextAreaElement) container.reset();
					const reset = target instanceof HTMLTextAreaElement ? snapshot() : null;
					flushSync(() => root.render(Component, { text: '' }));
					const empty = snapshot();
					return { initial, changed, reset, empty };
				} finally {
					root.unmount();
					container.remove();
				}
			}, name);
			const markup = cases[name];
			const expectedTopLevelCount = name.endsWith('Pair') ? 2 : 1;
			for (const [stage, value] of [
				['initial', 'X'],
				['changed', 'Y'],
				['empty', ''],
			] as const) {
				expect(result[stage]).toMatchObject({
					html: markup(value),
					childTypes: [3],
					text: value,
					sameTarget: true,
					sameText: true,
					sameTail: true,
					tailLast: true,
					topLevelCount: expectedTopLevelCount,
				});
			}
			if (name === 'TextareaHole') {
				expect(result.initial).toMatchObject({ value: 'X', defaultValue: 'X' });
				expect(result.changed).toMatchObject({ value: 'typed', defaultValue: 'Y' });
				expect(result.reset).toMatchObject({
					html: markup('Y'),
					childTypes: [3],
					text: 'Y',
					sameTarget: true,
					sameText: true,
					value: 'Y',
					defaultValue: 'Y',
				});
				expect(result.empty).toMatchObject({ value: '', defaultValue: '' });
			} else if (name === 'OptionHole') {
				expect(result.initial).toMatchObject({ value: 'X', parentValue: 'X' });
				expect(result.changed).toMatchObject({ value: 'Y', parentValue: 'Y' });
				expect(result.empty).toMatchObject({ value: '', parentValue: '' });
			} else if (name === 'SelectHole') {
				expect(result.initial.value).toBe('');
				expect(result.changed.value).toBe('');
				expect(result.empty.value).toBe('');
			}
		});
	}
});
