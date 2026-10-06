import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import type { Browser, Page } from 'playwright';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { launchBrowser } from '../../../../../test-utils/playwright-browser.js';
import { compile } from '../../../src/compiler/index.js';
import type * as Runtime from '../../../src/index.js';
import type { CaptureForm, edits$ } from './capture-form.tsrx';

// One signal batch covers the delegated handlers of one native event, so a
// capture handler's write publishes after the bubble handlers have run. The
// browser checkpoints microtasks after every listener of an event it dispatches
// itself, between the root's capture and bubble listeners. A synthetic
// dispatchEvent() keeps the dispatching script on the stack and cannot show
// that checkpoint, so only real browser input exercises this contract.

declare global {
	interface Window {
		OctaneTrustedBatch: Pick<typeof Runtime, 'createRoot' | 'createElement' | 'flushSync'> & {
			CaptureForm: typeof CaptureForm;
			edits$: typeof edits$;
		};
		__trustedBatch: {
			log: string[];
			trusted: boolean[];
			state(): { output: string | null; level: string; draft: string };
		};
	}
}

const MODES = {
	production: { dev: false },
	development: { dev: true },
} as const;
type Mode = keyof typeof MODES;

const packageRoot = fileURLToPath(new URL('../../..', import.meta.url));
const packageRequire = createRequire(new URL('../../../package.json', import.meta.url));
const fixture = fileURLToPath(new URL('./capture-form.tsrx', import.meta.url));
const bundles = new Map<Mode, string>();
let browser: Browser;
let page: Page | undefined;
let errors: string[] = [];

async function bundle(mode: Mode): Promise<string> {
	const { dev } = MODES[mode];
	const output = await build({
		stdin: {
			contents: `
				export { createRoot, createElement, flushSync } from 'octane';
				export { CaptureForm, edits$ } from ${JSON.stringify(fixture)};
			`,
			resolveDir: packageRoot,
			sourcefile: 'signals-trusted-event-batch.js',
		},
		bundle: true,
		write: false,
		format: 'iife',
		platform: 'browser',
		globalName: 'OctaneTrustedBatch',
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

afterEach(async () => {
	await page?.close();
	page = undefined;
	expect(errors).toEqual([]);
	errors = [];
});

afterAll(async () => {
	await browser?.close();
});

/** `stop` adds a native listener on each input that stops propagation below the root. */
async function openForm(mode: Mode, stop: boolean): Promise<Page> {
	page = await browser.newPage();
	page.on('pageerror', (error) => errors.push(`${error.name}: ${error.message}`));
	page.on('console', (message) => {
		if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text());
	});
	await page.setContent('<!doctype html><body><div id="root"></div></body>');
	await page.addScriptTag({ content: bundles.get(mode)! });
	await page.evaluate((stop) => {
		const { createRoot, createElement, flushSync, CaptureForm, edits$ } = window.OctaneTrustedBatch;
		const log: string[] = [];
		const trusted: boolean[] = [];
		// A subscriber runs when the event's batch publishes the capture write.
		edits$.subscribe(() => log.push('notify:' + edits$.get()));
		document.addEventListener('input', (event) => trusted.push(event.isTrusted), true);
		const root = createRoot(document.getElementById('root')!);
		flushSync(() =>
			root.render(createElement(CaptureForm, { observe: (entry) => log.push(entry) })),
		);
		const [level, draft] = document.querySelectorAll('input');
		if (stop) {
			for (const input of [level, draft]) {
				input.addEventListener('input', (event) => {
					log.push('native:' + input.value);
					event.stopPropagation();
				});
			}
		}
		window.__trustedBatch = {
			log,
			trusted,
			state: () => ({
				output: document.querySelector('output')!.textContent,
				level: level.value,
				draft: draft.value,
			}),
		};
	}, stop);
	return page;
}

async function settle(page: Page): Promise<{
	log: string[];
	state: ReturnType<Window['__trustedBatch']['state']>;
}> {
	// A timer the browser event queued runs before this later same-page timer.
	await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
	return page.evaluate(() => {
		const { log, trusted, state } = window.__trustedBatch;
		if (trusted.length === 0 || !trusted.every(Boolean)) {
			throw new Error('Expected only browser-dispatched input events');
		}
		return { log: [...log], state: state() };
	});
}

describe.sequential('signal writes from a capture handler during trusted input', () => {
	for (const mode of Object.keys(MODES) as Mode[]) {
		describe(mode, () => {
			it('publish after the bubble handler accepts a keyboard range edit', async () => {
				const page = await openForm(mode, false);
				await page.getByLabel('Level').focus();
				await page.keyboard.press('ArrowRight');
				await page.keyboard.press('ArrowRight');
				expect(await settle(page)).toEqual({
					log: ['capture', 'level:2', 'notify:1', 'capture', 'level:3', 'notify:2'],
					state: { output: '2', level: '3', draft: '' },
				});
			});

			it('publish after the bubble handler accepts a pointer range edit', async () => {
				const page = await openForm(mode, false);
				const box = (await page.getByLabel('Level').boundingBox())!;
				await page.mouse.click(box.x + box.width - 2, box.y + box.height / 2);
				expect(await settle(page)).toEqual({
					log: ['capture', 'level:4', 'notify:1'],
					state: { output: '1', level: '4', draft: '' },
				});
			});

			it('publish after the bubble handler accepts typed text', async () => {
				const page = await openForm(mode, false);
				await page.getByLabel('Draft').click();
				await page.keyboard.type('ab');
				expect(await settle(page)).toEqual({
					log: ['capture', 'draft:a', 'notify:1', 'capture', 'draft:ab', 'notify:2'],
					state: { output: '2', level: '1', draft: 'ab' },
				});
			});

			it('publish once the browser finishes a propagation stopped below the root', async () => {
				const page = await openForm(mode, true);
				await page.getByLabel('Level').focus();
				await page.keyboard.press('ArrowRight');
				// The target's own listener sees the browser's value before the write
				// publishes. Without a bubble handler the controlled range then reverts.
				expect(await settle(page)).toEqual({
					log: ['capture', 'native:2', 'notify:1'],
					state: { output: '1', level: '1', draft: '' },
				});
			});
		});
	}
});
