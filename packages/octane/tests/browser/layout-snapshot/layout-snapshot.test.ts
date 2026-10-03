import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import type { Browser, Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { launchBrowser } from '../../../../../test-utils/playwright-browser.js';
import { compile } from '../../../src/compiler/index.js';
import type * as Runtime from '../../../src/index.js';
import type { Deferred, Measured } from './measurement.tsrx';

declare global {
	interface Window {
		OctaneLayoutSnapshot: Pick<typeof Runtime, 'createRoot' | 'createElement'> & {
			Measured: typeof Measured;
			Deferred: typeof Deferred;
		};
	}
}

type Mode = 'production' | 'development';
const packageRoot = fileURLToPath(new URL('../../..', import.meta.url));
const packageRequire = createRequire(new URL('../../../package.json', import.meta.url));
const fixture = fileURLToPath(new URL('./measurement.tsrx', import.meta.url));
const bundles = new Map<Mode, string>();
let browser: Browser;

async function bundle(mode: Mode): Promise<string> {
	const dev = mode === 'development';
	const output = await build({
		stdin: {
			contents: `
				export { createRoot, createElement } from 'octane';
				export { Measured, Deferred } from ${JSON.stringify(fixture)};
			`,
			resolveDir: packageRoot,
			sourcefile: 'layout-snapshot.js',
		},
		bundle: true,
		write: false,
		format: 'iife',
		platform: 'browser',
		globalName: 'OctaneLayoutSnapshot',
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
							strong: true,
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
	for (const mode of ['production', 'development'] as const) bundles.set(mode, await bundle(mode));
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
	await page.setContent(`<!doctype html><style>
		[data-width="140"] { width: 140px; height: 10px; }
		[data-width="260"] { width: 260px; height: 10px; }
	</style><div id="root"></div>`);
	await page.addScriptTag({ content: bundles.get(mode)! });
	return { page, errors };
}

interface Observation {
	width: number;
	output: string | null;
}

interface Result {
	mount: Observation;
	mountSettled: Observation;
	update: Observation;
	updateSettled: Observation;
	cleaned: boolean;
}

function runScenario(page: Page, component: 'Measured' | 'Deferred'): Promise<Result> {
	return page.evaluate(async (component): Promise<Result> => {
		const { createRoot, createElement } = window.OctaneLayoutSnapshot;
		const root = createRoot(document.getElementById('root')!);
		const observe = (): Observation => ({
			width: document.querySelector('[data-width]')!.getBoundingClientRect().width,
			output: document.querySelector('output')!.textContent,
		});
		const nextFrame = () =>
			new Promise<Observation>((resolve) => requestAnimationFrame(() => resolve(observe())));
		const render = async (width: number): Promise<[Observation, Observation]> => {
			// Register before the render. A publication deferred to an rAF by the
			// commit is then too late for this first rendering opportunity.
			const first = nextFrame();
			root.render(createElement(window.OctaneLayoutSnapshot[component], { width }));
			const firstObservation = await first;
			return [firstObservation, await nextFrame()];
		};
		const [mount, mountSettled] = await render(140);
		const [update, updateSettled] = await render(260);
		root.unmount();
		return {
			mount,
			mountSettled,
			update,
			updateSettled,
			cleaned: document.getElementById('root')!.childElementCount === 0,
		};
	}, component);
}

describe.sequential('layout snapshots in Chromium at the next rendering opportunity', () => {
	for (const mode of ['production', 'development'] as const) {
		it(`publishes measured geometry by the first frame in Strong ${mode}`, async () => {
			const { page, errors } = await openPage(mode);
			try {
				const result = await runScenario(page, 'Measured');
				expect(result).toEqual({
					mount: { width: 140, output: '140' },
					mountSettled: { width: 140, output: '140' },
					update: { width: 260, output: '260' },
					updateSettled: { width: 260, output: '260' },
					cleaned: true,
				});
				expect(errors).toEqual([]);
			} finally {
				await page.close();
			}
		});

		it(`detects a deliberately deferred snapshot in Strong ${mode}`, async () => {
			const { page, errors } = await openPage(mode);
			try {
				const result = await runScenario(page, 'Deferred');
				expect(result).toEqual({
					mount: { width: 140, output: '0' },
					mountSettled: { width: 140, output: '140' },
					update: { width: 260, output: '140' },
					updateSettled: { width: 260, output: '260' },
					cleaned: true,
				});
				expect(errors).toEqual([]);
			} finally {
				await page.close();
			}
		});
	}
});
