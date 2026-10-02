// Issue #1472. Teardown disposes a Block before it detaches the Block's DOM, and
// Chromium dispatches focusout synchronously while it removes a focused host. A
// new dispatch must not start a handler on that retired host: a signal write from
// it reported ScopeDisposedError, and a plain handler ran for an unmounted
// component. React does not call those handlers either. Live handlers, including
// ancestors in the same root and other roots, still receive the native event.
// jsdom never blurs on removal, so this suite uses the real browser behavior.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import type { Browser, Page } from 'playwright';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { launchBrowser } from '../../../../../test-utils/playwright-browser.js';
import { compile } from '../../../src/compiler/index.js';
import type { createElement, createPortal, createRoot, flushSync } from '../../../src/index.js';

const fixtureURL = new URL('./hosts.tsrx', import.meta.url);
const packageRoot = fileURLToPath(new URL('../../..', import.meta.url));
const packageExports = JSON.parse(
	readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
).exports as Record<string, string | { default?: string }>;

const scenarios = {
	// Controls: an ordinary blur still runs the handler and writes the signal.
	'ordinary blur': ['blur', 'write'],
	'root unmount': [],
	'root render(null)': [],
	'portal unmount': [],
	'plain handler on root unmount': [],
	// The outer root's section is live and owns no part of the removed subtree.
	'nested root unmount': ['outer'],
	'other live root after unmount': ['other:blur', 'other:write'],
	'@if arm disposes the owning child': ['parent'],
	'@if arm host with a live owner signal': ['parent'],
	'@for row removal after a list update': ['parent'],
	// The section handler was in the dispatch snapshot before the removal.
	'handler captured before removal': ['remove', 'section'],
} as const;
type Scenario = keyof typeof scenarios;

type Fixture = (props: any) => void;
declare global {
	interface Window {
		OctaneRetiredEventHosts: {
			createRoot: typeof createRoot;
			createElement: typeof createElement;
			createPortal: typeof createPortal;
			flushSync: typeof flushSync;
			fixtures: Record<
				'SignalForm' | 'PlainForm' | 'ChildArm' | 'HostArm' | 'Rows' | 'Captured',
				Fixture
			>;
		};
	}
}

let browser: Browser;
let page: Page | undefined;
let failures: string[];
const sources = new Map<boolean, string>();

async function bundle(dev: boolean): Promise<string> {
	const compiled = compile(readFileSync(fixtureURL, 'utf8'), fileURLToPath(fixtureURL), {
		mode: 'client',
		dev,
		hmr: false,
	});
	expect(compiled.diagnostics).toEqual([]);
	const result = await build({
		stdin: {
			contents: `import { createElement, createPortal, createRoot, flushSync } from 'octane';
import * as fixtures from 'retired-event-hosts-fixture';
export { createElement, createPortal, createRoot, flushSync, fixtures };`,
			resolveDir: fileURLToPath(new URL('.', import.meta.url)),
			sourcefile: 'retired-event-hosts-entry.js',
			loader: 'js',
		},
		bundle: true,
		write: false,
		format: 'iife',
		platform: 'browser',
		globalName: 'OctaneRetiredEventHosts',
		define: {
			'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production'),
			__OCTANE_PROFILE_ENABLED__: 'false',
		},
		plugins: [
			{
				name: 'retired-event-hosts-fixture',
				setup(plugin) {
					plugin.onResolve({ filter: /^octane(?:\/|$)/ }, ({ path: request }) => {
						const entry = packageExports[request === 'octane' ? '.' : `./${request.slice(7)}`];
						const target = typeof entry === 'string' ? entry : entry?.default;
						if (!target) throw new Error(`Unknown Octane export: ${request}`);
						return { path: resolve(packageRoot, target) };
					});
					plugin.onResolve({ filter: /^retired-event-hosts-fixture$/ }, () => ({
						path: 'retired-event-hosts-fixture',
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
	return result.outputFiles[0].text;
}

beforeAll(async () => {
	for (const dev of [false, true]) sources.set(dev, await bundle(dev));
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

async function run(dev: boolean, scenario: Scenario) {
	failures = [];
	page = await browser.newPage();
	page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
	page.on('console', (message) => {
		if (message.type() === 'error' || message.type() === 'warning')
			failures.push(`${message.type()}: ${message.text()}`);
	});
	await page.setContent(
		'<!doctype html><body><div id="outer"></div><div id="root"></div>' +
			'<div id="portal"></div><div id="other"></div><button id="outside">outside</button></body>',
	);
	await page.addScriptTag({ content: sources.get(dev)! });
	return page.evaluate((scenario) => {
		const { createRoot, createElement, createPortal, flushSync, fixtures } =
			window.OctaneRetiredEventHosts;
		const seen: string[] = [];
		const observe = (entry: string) => seen.push(entry);
		const byId = (id: string) => document.getElementById(id)!;
		const outside = byId('outside');
		const roots: ReturnType<typeof createRoot>[] = [];
		const mount = (host: Element) => {
			const root = createRoot(host);
			roots.push(root);
			return root;
		};
		let host = byId('root');
		let focused = false;
		const focus = (input: HTMLInputElement) => {
			input.focus();
			focused = document.activeElement === input;
		};
		try {
			switch (scenario) {
				case 'ordinary blur':
				case 'root unmount':
				case 'root render(null)': {
					const root = mount(host);
					flushSync(() => root.render(fixtures.SignalForm, { observe }));
					focus(host.querySelector('input')!);
					if (scenario === 'ordinary blur') outside.focus();
					else if (scenario === 'root unmount') root.unmount();
					else flushSync(() => root.render(null));
					break;
				}
				case 'portal unmount': {
					const portal = byId('portal');
					const root = mount(host);
					flushSync(() =>
						root.render(createPortal(createElement(fixtures.SignalForm, { observe }), portal)),
					);
					focus(portal.querySelector('input')!);
					root.unmount();
					break;
				}
				case 'plain handler on root unmount': {
					const root = mount(host);
					flushSync(() => root.render(fixtures.PlainForm, { observe }));
					focus(host.querySelector('input')!);
					root.unmount();
					break;
				}
				case 'nested root unmount': {
					const outer = mount(byId('outer'));
					flushSync(() =>
						outer.render(
							createElement(
								'section',
								{ onBlur: () => observe('outer') },
								createElement('div', { id: 'nested' }),
							),
						),
					);
					host = byId('nested');
					const root = mount(host);
					flushSync(() => root.render(fixtures.SignalForm, { observe }));
					focus(host.querySelector('input')!);
					root.unmount();
					break;
				}
				case 'other live root after unmount': {
					const root = mount(host);
					const other = mount(byId('other'));
					flushSync(() => root.render(fixtures.SignalForm, { observe }));
					flushSync(() =>
						other.render(fixtures.SignalForm, {
							observe: (entry: string) => observe(`other:${entry}`),
						}),
					);
					focus(host.querySelector('input')!);
					root.unmount();
					byId('other').querySelector('input')!.focus();
					outside.focus();
					break;
				}
				case '@if arm disposes the owning child':
				case '@if arm host with a live owner signal': {
					const Fixture =
						scenario === '@if arm disposes the owning child' ? fixtures.ChildArm : fixtures.HostArm;
					const root = mount(host);
					flushSync(() => root.render(Fixture, { observe, show: true }));
					focus(host.querySelector('input')!);
					flushSync(() => root.render(Fixture, { observe, show: false }));
					break;
				}
				case '@for row removal after a list update': {
					const root = mount(host);
					const props = (rows: number[], label: string) => ({
						observe,
						rows,
						onRowBlur: () => observe(label),
					});
					flushSync(() => root.render(fixtures.Rows, props([1, 2], 'first')));
					// A fresh bare function republishes each row's slot during the update.
					flushSync(() => root.render(fixtures.Rows, props([1, 2], 'second')));
					focus(host.querySelector('input[data-row="1"]')!);
					flushSync(() => root.render(fixtures.Rows, props([2], 'third')));
					break;
				}
				case 'handler captured before removal': {
					const root = mount(host);
					flushSync(() =>
						root.render(fixtures.Captured, {
							observe,
							remove: () => {
								observe('remove');
								flushSync(() => root.render(null));
							},
						}),
					);
					focused = true;
					host.querySelector('button')!.click();
					break;
				}
			}
			return { focused, seen: [...seen] };
		} finally {
			for (const root of roots.reverse()) root.unmount();
		}
	}, scenario);
}

describe('new native events skip retired renderer hosts (#1472)', () => {
	for (const dev of [false, true]) {
		for (const scenario of Object.keys(scenarios) as Scenario[]) {
			it(`${scenario} (${dev ? 'development' : 'production'})`, async () => {
				const result = await run(dev, scenario);
				expect(result.focused).toBe(true);
				expect(result.seen).toEqual(scenarios[scenario]);
			});
		}
	}
});
