import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import type { Browser, Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { launchBrowser } from '../../../../../test-utils/playwright-browser.js';
import { compile } from '../../../src/compiler/index.js';
import type * as Runtime from '../../../src/index.js';
import type * as Signals from '../../../src/signals/index.js';
import type { LiveForm, LiveFormProps } from './live-form.tsrx';

// Chromium blurs a focused control synchronously while a render disables or
// removes it. jsdom does not, so only a real browser runs these listeners from
// inside the render's DOM patch. The listeners still belong to a live component:
// they must run, write signals, and publish those writes like any other event.

declare global {
	interface Window {
		OctaneCommitEvents: Pick<typeof Runtime, 'createRoot' | 'createElement' | 'flushSync'> &
			Pick<typeof Signals, 'createScope'> & { LiveForm: typeof LiveForm };
	}
}

type Scenario = 'disable' | 'remove' | 'focus' | 'throwing-listener';

interface ScenarioResult {
	/** Listener entries logged by the patch, excluding renders. */
	listeners: string[];
	/** The rendered count of blur-listener writes before and after the patch. */
	blurs: [string | null, string | null];
	/** Writes attempted later in the same DOM patch, after the listeners returned. */
	afterListeners: { listeners: string[]; outcome: string }[];
	probe: number;
	/** A public subscriber of the listener-written signal, and what its own write did. */
	subscriber: { events: number; mirror: number; outcomes: string[] };
	/** Renders caused by a source that only the listeners read. */
	unrelatedRenders: number;
}

// Strong mode compiles the same fixture with its purity checks enabled.
const MODES = {
	production: { dev: false, strong: false },
	development: { dev: true, strong: false },
	strong: { dev: false, strong: true },
} as const;
type Mode = keyof typeof MODES;

const packageRoot = fileURLToPath(new URL('../../..', import.meta.url));
const packageRequire = createRequire(new URL('../../../package.json', import.meta.url));
const fixture = fileURLToPath(new URL('./live-form.tsrx', import.meta.url));
const bundles = new Map<Mode, string>();
let browser: Browser;

async function bundle(mode: Mode): Promise<string> {
	const { dev, strong } = MODES[mode];
	const output = await build({
		stdin: {
			contents: `
				export { createRoot, createElement, flushSync } from 'octane';
				export { createScope } from 'octane/signals';
				export { LiveForm } from ${JSON.stringify(fixture)};
			`,
			resolveDir: packageRoot,
			sourcefile: 'signals-commit-events.js',
		},
		bundle: true,
		write: false,
		format: 'iife',
		platform: 'browser',
		globalName: 'OctaneCommitEvents',
		define: {
			'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production'),
			__OCTANE_PROFILE_ENABLED__: 'false',
		},
		plugins: [
			{
				name: 'octane-source',
				setup(plugin) {
					plugin.onResolve({ filter: /^octane(?:\/|$)/ }, ({ path }) => ({
						path: packageRequire.resolve(path),
					}));
					plugin.onLoad({ filter: /\.tsrx$/ }, async ({ path }) => {
						const compiled = compile(await readFile(path, 'utf8'), path, {
							mode: 'client',
							dev,
							hmr: false,
							strong,
						});
						if (compiled.diagnostics.length > 0) {
							throw new Error(JSON.stringify(compiled.diagnostics, null, 2));
						}
						return { contents: compiled.code, loader: 'ts', resolveDir: packageRoot };
					});
				},
			},
		],
	});
	return output.outputFiles[0]!.text;
}

beforeAll(async () => {
	for (const mode of Object.keys(MODES) as Mode[]) bundles.set(mode, await bundle(mode));
	browser = await launchBrowser({ headless: true });
});

afterAll(async () => {
	await browser?.close();
});

async function openPage(mode: Mode): Promise<{ page: Page; errors: string[] }> {
	const page = await browser.newPage();
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(`${error.name}: ${error.message}`));
	page.on('console', (message) => {
		if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text());
	});
	await page.setContent('<!doctype html><body><div id="root"></div></body>');
	await page.addScriptTag({ content: bundles.get(mode)! });
	return { page, errors };
}

function runScenario(page: Page, scenario: Scenario): Promise<ScenarioResult> {
	return page.evaluate(async (scenario): Promise<ScenarioResult> => {
		const { createRoot, createElement, flushSync, createScope, LiveForm } =
			window.OctaneCommitEvents;
		const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
		const log: string[] = [];
		const listeners = () => log.filter((entry) => entry !== 'render');
		const afterListeners: ScenarioResult['afterListeners'] = [];
		const scope = createScope({ scopeKey: 'commit-events' });
		const probe$ = scope.signal$('probe', 0);
		const unrelated$ = scope.signal$('unrelated', 0);
		const events$ = scope.signal$('events', 0);
		const mirror$ = scope.signal$('mirror', 0);
		const subscriberOutcomes: string[] = [];
		const unsubscribe = events$.subscribe(() => {
			try {
				mirror$.set(events$.get());
				subscriberOutcomes.push('ok');
			} catch (error) {
				subscriberOutcomes.push((error as Error).name);
			}
		});
		const root = createRoot(document.getElementById('root')!);
		const props: LiveFormProps = {
			attributes: {},
			showInput: true,
			unrelated$,
			events$,
			fail: scenario === 'throwing-listener',
			observe: (entry) => log.push(entry),
		};
		const render = (next: Partial<LiveFormProps>) =>
			flushSync(() => root.render(createElement(LiveForm, { ...props, ...next })));
		const output = () => document.querySelector('output')!.textContent;
		render({});
		const [draft, next] = document.querySelectorAll('input');
		// An ordinary focus outside rendering is the control for the blur scenarios.
		if (scenario !== 'focus') {
			draft.focus();
			if (document.activeElement !== draft) throw new Error('The draft input did not focus');
		}
		await frame();
		const before = output();
		log.length = 0;
		// Attribute order is write order, so this stringification runs later in
		// the same patch, after the browser's synchronous listeners returned.
		const afterProbe = {
			toString() {
				let outcome = 'write escaped';
				try {
					probe$.set(1);
				} catch (error) {
					outcome = (error as Error).name;
				}
				afterListeners.push({ listeners: listeners(), outcome });
				return 'checked';
			},
		};
		if (scenario === 'remove') {
			render({ showInput: false });
		} else if (scenario === 'focus') {
			// The renderer never focuses mid-patch itself, but code its patch reaches
			// can, and that focus dispatches synchronously all the same.
			const moveFocus = {
				toString() {
					next.focus();
					return 'moved';
				},
			};
			render({ attributes: { 'data-focus': moveFocus, 'data-after': afterProbe } });
		} else {
			render({ attributes: { disabled: true, 'data-after': afterProbe } });
		}
		await frame();
		const after = output();
		const patchListeners = listeners();
		log.length = 0;
		flushSync(() => unrelated$.set(1));
		await frame();
		const result: ScenarioResult = {
			listeners: patchListeners,
			blurs: [before, after],
			afterListeners,
			probe: probe$.get(),
			subscriber: { events: events$.get(), mirror: mirror$.get(), outcomes: subscriberOutcomes },
			unrelatedRenders: log.filter((entry) => entry === 'render').length,
		};
		// Blur during unmount reaches a disposed component, a separate contract.
		(document.activeElement as HTMLElement | null)?.blur();
		unsubscribe();
		root.unmount();
		scope.dispose();
		return result;
	}, scenario);
}

const BLUR = ['blur-capture', 'blur-capture-write', 'blur', 'blur-write'];

function expectLiveListeners(
	result: ScenarioResult,
	listeners: string[],
	expected: { blurs: [string, string]; events: number },
): void {
	expect(result.listeners).toEqual(listeners);
	expect(result.blurs).toEqual(expected.blurs);
	// Subscribers of a listener write run with the listener, not with the render.
	expect(result.subscriber.events).toBe(expected.events);
	expect(result.subscriber.mirror).toBe(expected.events);
	expect(new Set(result.subscriber.outcomes)).toEqual(new Set(['ok']));
	// Listener reads are not dependencies of the render whose patch fired them.
	expect(result.unrelatedRenders).toBe(0);
}

function expectRenderStillGuarded(result: ScenarioResult, listeners: string[]): void {
	const probed = result.afterListeners.filter((entry) =>
		listeners.every((listener) => entry.listeners.includes(listener)),
	);
	expect(probed.length).toBeGreaterThan(0);
	expect(result.afterListeners.map((entry) => entry.outcome)).toEqual(
		result.afterListeners.map(() => 'SignalWriteError'),
	);
	expect(result.probe).toBe(0);
}

describe.sequential('native listeners fired synchronously by a render DOM patch', () => {
	for (const mode of Object.keys(MODES) as Mode[]) {
		describe(mode, () => {
			it('run and write signals when the render disables their focused input', async () => {
				const { page, errors } = await openPage(mode);
				try {
					const result = await runScenario(page, 'disable');
					// The setup focus wrote `events$` once, outside rendering.
					expectLiveListeners(result, BLUR, { blurs: ['0', '2'], events: 3 });
					expectRenderStillGuarded(result, BLUR);
					expect(errors).toEqual([]);
				} finally {
					await page.close();
				}
			});

			it('run and write signals when the render removes their focused input', async () => {
				const { page, errors } = await openPage(mode);
				try {
					const result = await runScenario(page, 'remove');
					expectLiveListeners(result, BLUR, { blurs: ['0', '2'], events: 3 });
					expect(errors).toEqual([]);
				} finally {
					await page.close();
				}
			});

			it('run and write signals when focus moves during the patch', async () => {
				const { page, errors } = await openPage(mode);
				try {
					const result = await runScenario(page, 'focus');
					const listeners = ['focus', 'focus-write'];
					// Nothing re-renders afterwards, so a leaked listener read would persist.
					expectLiveListeners(result, listeners, { blurs: ['0', '0'], events: 1 });
					expectRenderStillGuarded(result, listeners);
					expect(errors).toEqual([]);
				} finally {
					await page.close();
				}
			});

			it('report a throwing listener and keep the rest of the render guarded', async () => {
				const { page, errors } = await openPage(mode);
				try {
					const result = await runScenario(page, 'throwing-listener');
					expectLiveListeners(result, BLUR, { blurs: ['0', '2'], events: 3 });
					expectRenderStillGuarded(result, BLUR);
					expect(errors).toEqual(['Error: listener failed']);
				} finally {
					await page.close();
				}
			});

			it('still reject writes from a listener invoked inside a pure computation', async () => {
				const { page, errors } = await openPage(mode);
				try {
					const result = await page.evaluate(() => {
						const { createRoot, createElement, flushSync, createScope, LiveForm } =
							window.OctaneCommitEvents;
						const log: string[] = [];
						const scope = createScope({ scopeKey: 'commit-events-pure' });
						const root = createRoot(document.getElementById('root')!);
						flushSync(() =>
							root.render(
								createElement(LiveForm, {
									attributes: {},
									showInput: true,
									unrelated$: scope.signal$('unrelated', 0),
									events$: scope.signal$('events', 0),
									fail: false,
									observe: (entry: string) => log.push(entry),
								}),
							),
						);
						const draft = document.querySelector('input')!;
						draft.focus();
						log.length = 0;
						scope
							.derived$('blur', () => {
								draft.blur();
								return 1;
							})
							.get();
						const listeners = log.filter((entry) => entry !== 'render');
						root.unmount();
						scope.dispose();
						return listeners;
					});
					// Each listener is reported separately; neither may write.
					expect(result).toEqual(['blur-capture', 'blur']);
					expect(errors).toEqual([
						expect.stringMatching(/^SignalWriteError:/),
						expect.stringMatching(/^SignalWriteError:/),
					]);
				} finally {
					await page.close();
				}
			});
		});
	}
});
