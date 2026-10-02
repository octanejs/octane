// Issue #1472. Teardown disposes a Block before it detaches the Block's DOM, and
// Chromium dispatches focusout synchronously while it removes a focused host. A
// new dispatch must not start a handler on that retired host: a signal write from
// it reported ScopeDisposedError, and a plain handler ran for an unmounted
// component. React does not call those handlers either. Live handlers, including
// ancestors in the same root and other roots, still receive the native event.
// A pure host in a value hole has no Block to dispose: its removal retires it
// while the Block that rendered it stays live (deopt-hosts.tsrx).
// jsdom never blurs on removal, so this suite uses the real browser behavior.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import type { Browser, Page } from 'playwright';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { launchBrowser } from '../../../../../test-utils/playwright-browser.js';
import { compile } from '../../../src/compiler/index.js';
import type {
	createElement,
	createPortal,
	createRoot,
	flushSync,
	startTransition,
	ViewTransition,
} from '../../../src/index.js';

const fixtureURLs = {
	'retired-event-hosts-fixture': new URL('./hosts.tsrx', import.meta.url),
	'retired-deopt-hosts-fixture': new URL('./deopt-hosts.tsrx', import.meta.url),
};
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
	// A value hole's pure host is removed while its rendering Block stays live.
	'value hole host removal': ['parent'],
	'value hole focused host removal': ['parent'],
	'nested de-opt child removal': ['wrapper', 'parent'],
	'value hole host tag swap': ['parent'],
	'component-bearing host tag swap': ['parent'],
	'component-bearing value hole removal': ['parent'],
	'mapped de-opt row removal': ['parent'],
	'root descriptor replacement': ['outer'],
	// Both handlers were in the click's snapshot before the hole removed the div.
	'value hole handler captured before removal': ['remove', 'div', 'section'],
	// The div's removal began after this click, which keeps its route.
	'value hole host removed by the capture phase': ['remove', 'div', 'section'],
	// A component's own state update removes the host, not a root render.
	'value hole host removal by local state': ['parent'],
	'component-bearing host tag swap by local state': ['parent'],
	// A ViewTransition publishes the removal after its capture; until then the
	// committed host still receives a blur.
	'value hole host removal in a view transition': ['dropped', 'parent', 'publish', 'parent'],
	'component-bearing host tag swap in a view transition': [
		'dropped',
		'parent',
		'publish',
		'parent',
	],
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
			startTransition: typeof startTransition;
			ViewTransition: typeof ViewTransition;
			fixtures: Record<
				'SignalForm' | 'PlainForm' | 'ChildArm' | 'HostArm' | 'Rows' | 'Captured',
				Fixture
			>;
			deoptFixtures: Record<
				| 'HoleHost'
				| 'HoleInput'
				| 'NestedHole'
				| 'SwappedHole'
				| 'SwappedBlockHost'
				| 'BlockHostHole'
				| 'MappedRows'
				| 'HoleCaptured'
				| 'HoleCapturePhase'
				| 'StatefulHole',
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
	const compiled = new Map<string, string>();
	for (const [name, url] of Object.entries(fixtureURLs)) {
		const output = compile(readFileSync(url, 'utf8'), fileURLToPath(url), {
			mode: 'client',
			dev,
			hmr: false,
		});
		expect(output.diagnostics).toEqual([]);
		compiled.set(name, output.code);
	}
	const result = await build({
		stdin: {
			contents: `import { createElement, createPortal, createRoot, flushSync, startTransition, ViewTransition } from 'octane';
import * as fixtures from 'retired-event-hosts-fixture';
import * as deoptFixtures from 'retired-deopt-hosts-fixture';
export { createElement, createPortal, createRoot, flushSync, startTransition, ViewTransition, fixtures, deoptFixtures };`,
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
					plugin.onResolve({ filter: /^retired-(?:event|deopt)-hosts-fixture$/ }, ({ path }) => ({
						path,
						namespace: 'compiled-fixture',
					}));
					plugin.onLoad({ filter: /.*/, namespace: 'compiled-fixture' }, ({ path }) => ({
						contents: compiled.get(path)!,
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
	return page.evaluate(async (scenario) => {
		const {
			createRoot,
			createElement,
			createPortal,
			flushSync,
			startTransition,
			ViewTransition,
			fixtures,
			deoptFixtures,
		} = window.OctaneRetiredEventHosts;
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
				case 'value hole host removal':
				case 'value hole focused host removal':
				case 'nested de-opt child removal':
				case 'value hole host tag swap':
				case 'component-bearing host tag swap':
				case 'component-bearing value hole removal': {
					const Fixture = {
						'value hole host removal': deoptFixtures.HoleHost,
						'value hole focused host removal': deoptFixtures.HoleInput,
						'nested de-opt child removal': deoptFixtures.NestedHole,
						'value hole host tag swap': deoptFixtures.SwappedHole,
						'component-bearing host tag swap': deoptFixtures.SwappedBlockHost,
						'component-bearing value hole removal': deoptFixtures.BlockHostHole,
					}[scenario];
					const root = mount(host);
					flushSync(() => root.render(Fixture, { observe, show: true }));
					focus(host.querySelector('input')!);
					flushSync(() => root.render(Fixture, { observe, show: false }));
					break;
				}
				case 'mapped de-opt row removal': {
					const root = mount(host);
					flushSync(() => root.render(deoptFixtures.MappedRows, { observe, rows: [1, 2] }));
					focus(host.querySelector('input[data-row="1"]')!);
					flushSync(() => root.render(deoptFixtures.MappedRows, { observe, rows: [2] }));
					break;
				}
				case 'root descriptor replacement': {
					const root = mount(byId('outer'));
					const render = (child: unknown) =>
						flushSync(() =>
							root.render(createElement('section', { onBlur: () => observe('outer') }, child)),
						);
					render(
						createElement(
							'div',
							{ onBlur: () => observe('dropped') },
							createElement('input', { onBlur: () => observe('dropped input') }),
						),
					);
					focus(byId('outer').querySelector('input')!);
					render(createElement('p', null, 'gone'));
					break;
				}
				case 'value hole host removal by local state':
				case 'component-bearing host tag swap by local state': {
					const root = mount(host);
					let hide!: () => void;
					flushSync(() =>
						root.render(deoptFixtures.StatefulHole, {
							observe,
							expose: (next: () => void) => (hide = next),
							Fixture:
								scenario === 'value hole host removal by local state'
									? deoptFixtures.HoleHost
									: deoptFixtures.SwappedBlockHost,
						}),
					);
					focus(host.querySelector('input')!);
					flushSync(hide);
					break;
				}
				case 'value hole host removal in a view transition':
				case 'component-bearing host tag swap in a view transition': {
					const Fixture =
						scenario === 'value hole host removal in a view transition'
							? deoptFixtures.HoleHost
							: deoptFixtures.SwappedBlockHost;
					const view = (show: boolean) =>
						createElement(ViewTransition, {
							name: 'retired-host',
							children: createElement(Fixture, { observe, show }),
						});
					const root = mount(host);
					flushSync(() => root.render(view(true)));
					const input = host.querySelector('input')!;
					focus(input);
					const start = document.startViewTransition.bind(document);
					let published: Promise<void> | undefined;
					document.startViewTransition = ((options: any) => {
						const update = async () => {
							// Staged, not yet published: the committed host still blurs.
							if (input.isConnected) {
								input.blur();
								input.focus();
								seen.push('publish');
							}
							await (typeof options === 'function' ? options : options.update)();
						};
						const transition = start(
							typeof options === 'function' ? update : { ...options, update },
						);
						published = transition.updateCallbackDone;
						return transition;
					}) as typeof document.startViewTransition;
					try {
						startTransition(() => root.render(view(false)));
						for (let i = 0; i < 50 && published === undefined; i++)
							await new Promise((resolve) => setTimeout(resolve, 10));
						await published;
					} finally {
						document.startViewTransition = start;
					}
					break;
				}
				case 'value hole handler captured before removal':
				case 'value hole host removed by the capture phase': {
					const root = mount(host);
					const Fixture =
						scenario === 'value hole handler captured before removal'
							? deoptFixtures.HoleCaptured
							: deoptFixtures.HoleCapturePhase;
					const render = (show: boolean) =>
						flushSync(() =>
							root.render(Fixture, {
								observe,
								show,
								remove: () => {
									observe('remove');
									render(false);
								},
							}),
						);
					render(true);
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
