import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	build,
	createServer,
	preview,
	type InlineConfig,
	type PreviewServer,
	type ViteDevServer,
} from 'vite';
import type { Browser } from 'playwright';
import { octane } from 'octane/compiler/vite';
import { launchBrowser } from '../../../../../test-utils/playwright-browser.js';
import type * as ServerFixture from './server.js';
import type {} from './main.js';

const here = dirname(fileURLToPath(import.meta.url));
const initialValues = {
	max: '50',
	unchanged: '100',
	min: '100',
	step: '50',
	'asserted-max': '150',
	'asserted-step': '5.4',
	email: 'a@example.test,b@example.test',
	label: '12',
	spread: '50',
};
const nextValues = {
	max: '150',
	unchanged: '150',
	min: '50',
	step: '57',
	'asserted-max': '180',
	'asserted-step': '6.7',
	email: 'a@example.test, b@example.test',
	label: 'hello',
	spread: '150',
};

describe.each(['development', 'production'] as const)(
	'controlled and uncontrolled inputs in Chromium (%s)',
	(mode) => {
		let browser: Browser;
		let server: ViteDevServer | PreviewServer;
		let url: string;
		let scratch: string;
		let markup: ReturnType<typeof ServerFixture.renderForHydration>;

		beforeAll(async () => {
			const scratchRoot = resolve(here, '../../../../../.test-scratch');
			await mkdir(scratchRoot, { recursive: true });
			scratch = await mkdtemp(join(scratchRoot, 'input-order-'));
			const production = mode === 'production';
			const config: InlineConfig = {
				root: here,
				configFile: false,
				logLevel: 'error',
				mode,
				cacheDir: join(scratch, 'vite'),
				plugins: [octane({ hmr: !production })],
				build: { outDir: join(scratch, 'dist') },
				server: { host: '127.0.0.1', port: 0 },
				preview: { host: '127.0.0.1', port: 0 },
			};
			const vite = await createServer(config);
			try {
				const fixture = (await vite.ssrLoadModule('/server.ts')) as typeof ServerFixture;
				markup = fixture.renderForHydration();
			} finally {
				if (production) await vite.close();
			}
			if (production) {
				await build(config);
				server = await preview(config);
			} else {
				server = vite;
				await vite.listen();
			}
			const address = server.httpServer!.address();
			if (address === null || typeof address === 'string')
				throw new Error('Missing test server port');
			url = `http://127.0.0.1:${address.port}`;
			browser = await launchBrowser({ headless: true });
		});

		afterAll(async () => {
			await browser?.close();
			if (server && 'close' in server) await server.close();
			else if (server) await new Promise<void>((done) => server.httpServer!.close(() => done()));
			if (scratch) await rm(scratch, { recursive: true, force: true });
		});

		async function openPage() {
			const page = await browser.newPage();
			await page.goto(url);
			await page.waitForFunction(() => Boolean(window.runInputUpdate));
			return page;
		}

		async function render(component: Parameters<Window['runInputUpdate']>[0], html?: string) {
			const page = await openPage();
			try {
				return await page.evaluate(([component, html]) => window.runInputUpdate(component, html), [
					component,
					html,
				] as const);
			} finally {
				await page.close();
			}
		}

		it('submits controlled values using the final type and constraints while reading props in order', async () => {
			const result = await render('Values');
			expect(result.keptInputs).toBe(true);
			expect(result.before.forms['values']).toEqual(initialValues);
			expect(result.after.forms['values']).toEqual(nextValues);
			expect(result.resetValues).toEqual(nextValues);
			expect(result.reads).toEqual(['title', 'value', 'max', 'spread value', 'spread max']);
			expect(result.initialReads).toEqual(result.reads);
		});

		it('applies the final constraints and type to createElement inputs', async () => {
			const result = await render('DescriptorValues');
			expect(result.keptInputs).toBe(true);
			expect(result.before.forms['values']).toEqual({ max: '50', label: '12' });
			expect(result.after.forms['values']).toEqual({ max: '150', label: 'hello' });
			expect(result.reads).toEqual(['value', 'max']);
		});

		it.each(['entering', 'leaving'] as const)(
			'preserves an uncontrolled edit when %s range type',
			async (direction) => {
				const page = await openPage();
				try {
					const entering = direction === 'entering';
					const results = await page.evaluate(
						(entering) => window.runUncontrolledTypeChanges(entering),
						entering,
					);
					const edited = entering ? '150' : '75';
					for (const [component, result] of results) {
						expect(result, component).toEqual({
							before: edited,
							after: edited,
							type: entering ? 'range' : 'text',
							max: entering ? '200' : '0',
							reset: '50',
							keptInput: true,
							reads:
								component === 'UncontrolledConstraintFirst' ? ['max', 'type'] : ['type', 'max'],
						});
					}
				} finally {
					await page.close();
				}
			},
		);

		it('keeps both checked radios selected when they exchange names', async () => {
			const result = await render('RadioSwap');
			expect(result.keptInputs).toBe(true);
			expect(result.before.forms['swap']).toEqual({ first: 'a', second: 'b' });
			expect(result.after.forms['swap']).toEqual({ second: 'a', first: 'b' });
			expect(result.after.checked.map((input) => input.checked)).toEqual([true, true]);
		});

		it('keeps stationary radio choices when unchecked radios change name, form, or type', async () => {
			const result = await render('RadioMoves');
			expect(result.keptInputs).toBe(true);
			expect(result.after.forms['destination']).toEqual({
				'by-name': 'fixed',
				'by-form': 'fixed',
				'by-type': 'fixed',
			});
			expect(result.after.forms['other']).toEqual({ 'by-form': 'other' });
			expect(result.after.checked.map((input) => input.checked)).toEqual([false, false, false]);
		});

		it('adopts an edited input and applies the final constraints on the first update', async () => {
			const result = await render('Values', markup.values);
			expect(result.keptInputs).toBe(true);
			expect(result.before.forms['values']).toEqual({ ...initialValues, label: '7' });
			expect(result.after.forms['values']).toEqual(nextValues);
			expect(result.resetValues).toEqual(nextValues);
		});

		it('preserves pre-hydration radio state until reapplying the controlled selection', async () => {
			const result = await render('RadioSwap', markup.radios);
			expect(result.keptInputs).toBe(true);
			expect(result.before.forms['swap']).toEqual({ second: 'b' });
			expect(result.after.forms['swap']).toEqual({ second: 'a', first: 'b' });
		});

		it('preserves the destination radio while adopting an edit from before hydration', async () => {
			const page = await openPage();
			try {
				expect(
					await page.evaluate(
						(html) => window.moveRadioBeforeEditAdoption(html),
						markup.signalRadio,
					),
				).toEqual({
					before: [
						['source', 'moving'],
						['destination', 'peer'],
					],
					after: [['destination', 'peer']],
					name: 'destination',
				});
			} finally {
				await page.close();
			}
		});

		it.each(['mount', 'hydrate'] as const)(
			'reprojects the model when a prop or signal changes the limit after %s',
			async (start) => {
				const page = await openPage();
				try {
					const result = await page.evaluate(
						(html) => window.runSignalUpdate(html),
						start === 'hydrate' ? markup.signals : undefined,
					);
					expect(result.keptInput).toBe(true);
					expect(result.upgraded).toBe(true);
					expect(result.before).toEqual({ model: '100', constraint: '100' });
					expect(result.changedMax).toEqual({ model: '150', constraint: '100' });
					expect(result.changedLimit).toEqual({ model: '150', constraint: '150' });
					expect(result.changedModelAndMax).toEqual({ model: '275', constraint: '150' });
				} finally {
					await page.close();
				}
			},
		);
	},
);
