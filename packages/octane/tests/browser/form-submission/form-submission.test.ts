import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import {
	build,
	createServer,
	preview,
	type InlineConfig,
	type Plugin,
	type PreviewServer,
	type ViteDevServer,
} from 'vite';
import { octane } from 'octane/compiler/vite';
import { earlySignalBootstrapScript, renderToString } from 'octane/server';
import { launchBrowser } from '../../../../../test-utils/playwright-browser.js';
import { loadServerFixture } from '../../_server-fixture.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type * as FormFixture from './Form.tsrx';
import type {} from './main.js';

const HERE = dirname(fileURLToPath(import.meta.url));
let browser: Browser;

beforeAll(async () => {
	browser = await launchBrowser({ headless: true });
});
afterAll(async () => {
	await browser?.close();
});

for (const production of [false, true]) {
	describe.sequential(
		`parser-time form submission commands in Chromium (${production ? 'production build and runtime' : 'Vite development runtime'})`,
		() => {
			let server: ViteDevServer | PreviewServer;
			let baseUrl: string;
			let scratch: string;
			let page: Page | undefined;
			let releaseCurrent: (() => void) | undefined;
			let failures: string[] = [];

			beforeAll(async () => {
				scratch = await mkdtemp(join(tmpdir(), 'octane-form-submission-'));
				const fixture = loadServerFixture<typeof FormFixture>(join(HERE, 'Form.tsrx'), {
					id: join(HERE, 'Form.tsrx'),
					compileOptions: { dev: !production, hmr: false },
					runtimeModules: { './actions.js': { recordClick() {}, recordHydrated() {} } },
				});
				const shellPlugin: Plugin = {
					name: 'compiled-native-form-command-shell',
					transformIndexHtml(source, context) {
						const filename = basename(context.filename);
						const html = renderToString(
							fixture.Form,
							{
								opted: filename !== 'plain.html',
								button: filename !== 'implicit.html',
								controls: filename === 'controls.html',
							},
							{
								earlySignalBootstrap: 'external',
								independentHydration: {
									buildId: 'form-submission-build',
									resolve: (moduleId) => ({ moduleId, styles: [] }),
								},
							},
						).html;
						return source
							.replace('<!--octane-early-->', () =>
								earlySignalBootstrapScript({ independentHydration: true, formSubmissions: true }),
							)
							.replace('<!--octane-ssr-->', () => html);
					},
				};
				const config: InlineConfig = {
					configFile: false,
					root: HERE,
					logLevel: 'error',
					cacheDir: resolve(
						HERE,
						`../../../../../node_modules/.vite/octane-form-submission-${production ? 'prod' : 'dev'}`,
					),
					plugins: [shellPlugin, octane({ hmr: !production })],
					define: {
						'process.env.NODE_ENV': JSON.stringify(production ? 'production' : 'development'),
					},
					build: {
						outDir: join(scratch, 'dist'),
						emptyOutDir: false,
						rollupOptions: {
							input: Object.fromEntries(
								['index', 'implicit', 'plain', 'controls'].map((name) => [
									name,
									join(HERE, `${name}.html`),
								]),
							),
						},
					},
					server: { host: '127.0.0.1', port: 0 },
					preview: { host: '127.0.0.1', port: 0 },
				};
				if (production) {
					const previous = process.env.OCTANE_COMPILE_FROZEN_AST;
					process.env.OCTANE_COMPILE_FROZEN_AST = '0';
					try {
						await build(config);
					} finally {
						if (previous === undefined) delete process.env.OCTANE_COMPILE_FROZEN_AST;
						else process.env.OCTANE_COMPILE_FROZEN_AST = previous;
					}
					server = await preview(config);
				} else {
					server = await createServer(config);
					await server.listen();
				}
				const address = server.httpServer!.address();
				if (!address || typeof address === 'string')
					throw new Error('Missing form test server port');
				baseUrl = `http://127.0.0.1:${address.port}`;
			});

			afterEach(async () => {
				const observedFailures = failures.slice();
				releaseCurrent?.();
				try {
					await page?.evaluate(() => window.__formSubmission?.dispose());
				} finally {
					await page?.close();
					page = undefined;
					releaseCurrent = undefined;
					failures = [];
				}
				expect(observedFailures).toEqual([]);
			});
			afterAll(async () => {
				if ('close' in (server ?? {})) await (server as ViteDevServer).close();
				else if (server)
					await new Promise<void>((done, reject) =>
						server.httpServer!.close((error) => (error ? reject(error) : done())),
					);
				if (scratch) await rm(scratch, { recursive: true, force: true });
			});

			async function openPage(filename = 'index', query = '', clock = false) {
				page = await browser.newPage();
				if (clock) await page.clock.install();
				const submissions: Array<{ method: string; body: string | null; url: string }> = [];
				let unblock!: () => void;
				const moduleBarrier = new Promise<void>((done) => {
					unblock = done;
				});
				let moduleRequested!: () => void;
				const requested = new Promise<void>((done) => {
					moduleRequested = done;
				});
				releaseCurrent = unblock;
				failures = [];
				page.on('pageerror', (error) => failures.push(error.message));
				page.on('console', (message) => {
					if (message.type() === 'error' || message.type() === 'warning')
						failures.push(`${message.type()}: ${message.text()}`);
				});
				await page.route('**/*', async (route) => {
					const request = route.request();
					const url = new URL(request.url());
					if (url.pathname === '/submitted') {
						submissions.push({
							method: request.method(),
							body: request.postData(),
							url: request.url(),
						});
						await route.fulfill({
							contentType: 'text/html',
							body: '<!doctype html><title>Submitted natively</title>',
						});
						return;
					}
					if (
						request.resourceType() === 'script' &&
						(url.pathname === '/main.ts' || url.pathname.startsWith('/assets/'))
					) {
						moduleRequested();
						await moduleBarrier;
					}
					await route.continue();
				});
				await page.goto(`${baseUrl}/${filename}.html${query}`, { waitUntil: 'commit' });
				await requested;
				await page.waitForFunction(
					() => document.querySelector('#command-form') && window.__formObservation,
				);
				const current = page;
				return {
					page: current,
					submissions,
					async load() {
						unblock();
						await current.waitForFunction(() => Boolean(window.__formSubmission));
					},
				};
			}

			it('preserves ordinary click holding while implicit Enter and requestSubmit retain their native default', async () => {
				const { page, submissions, load } = await openPage('plain');
				await page.getByLabel('Draft', { exact: true }).fill('A');
				await page.getByRole('button', { name: 'Save', exact: true }).click();
				expect(await page.evaluate(() => window.__formObservation.events.length)).toBe(0);
				expect(submissions).toEqual([]);
				await page.evaluate(() =>
					(document.querySelector('#command-form') as HTMLFormElement).requestSubmit(
						document.querySelector('#save-button') as HTMLButtonElement,
					),
				);
				await expect.poll(() => submissions.length).toBe(1);
				await page.locator('#save-button').evaluate((element) => element.remove());
				await page.getByLabel('Draft', { exact: true }).press('Enter');
				await expect.poll(() => submissions.length).toBe(2);
				await page.evaluate(() =>
					(document.querySelector('#command-form') as HTMLFormElement).requestSubmit(),
				);
				await expect.poll(() => submissions.length).toBe(3);
				expect(submissions.map((request) => request.method)).toEqual(['POST', 'POST', 'POST']);
				expect(
					await page.evaluate(() =>
						window.__formObservation.events.map((event) => event.defaultPrevented),
					),
				).toEqual([false, false, false]);
				await load();
				await page.getByLabel('Draft', { exact: true }).fill('C');
				await page.evaluate(() =>
					(document.querySelector('#command-form') as HTMLFormElement).requestSubmit(),
				);
				expect(await page.evaluate(() => window.__formSubmission.state())).toMatchObject({
					deliveries: [{ fields: [['draft', 'C']], early: false, original: true, trusted: true }],
					nativeSubmissions: 4,
					canceled: [false, false, false, true],
					errors: [],
				});
				expect(submissions).toHaveLength(3);
			});

			for (const path of [
				'button',
				'implicit Enter',
				'requestSubmit with submitter',
				'requestSubmit without submitter',
			] as const) {
				for (const finalValue of ['B', '']) {
					it(`delivers one original accepted ${path} payload after the field is edited to ${JSON.stringify(finalValue)}`, async () => {
						const { page, submissions, load } = await openPage(
							path === 'implicit Enter' ? 'implicit' : 'index',
						);
						await page.getByLabel('Draft', { exact: true }).fill('A');
						if (path === 'button')
							await page.getByRole('button', { name: 'Save', exact: true }).click();
						else if (path === 'implicit Enter')
							await page.getByLabel('Draft', { exact: true }).press('Enter');
						else
							await page.evaluate(
								(withSubmitter) =>
									(document.querySelector('#command-form') as HTMLFormElement).requestSubmit(
										withSubmitter
											? (document.querySelector('#save-button') as HTMLButtonElement)
											: undefined,
									),
								path === 'requestSubmit with submitter',
							);
						expect(
							await page.evaluate(() =>
								window.__formObservation.events.map((event) => event.defaultPrevented),
							),
						).toEqual([true]);
						await page.getByLabel('Draft', { exact: true }).fill(finalValue);
						await load();
						await page.waitForFunction(
							() => window.__formSubmission.state().deliveries.length === 1,
						);
						const state = await page.evaluate(() => window.__formSubmission.state());
						const withSubmitter = path === 'button' || path === 'requestSubmit with submitter';
						expect(state.deliveries).toEqual([
							expect.objectContaining({
								fields: withSubmitter
									? [
											['draft', 'A'],
											['intent', 'save'],
										]
									: [['draft', 'A']],
								early: true,
								immutable: true,
								original: true,
								submitterSame: true,
								trusted: true,
							}),
						]);
						if (withSubmitter)
							expect(state.deliveries[0].submitter).toMatchObject({
								id: 'save-button',
								name: 'intent',
								value: 'save',
								type: 'submit',
							});
						else expect(state.deliveries[0].submitter).toBeNull();
						expect(state).toMatchObject({
							captures: [expect.any(Object)],
							inputSame: true,
							value: finalValue,
							nativeSubmissions: 1,
							canceled: [true],
							errors: [],
						});
						expect(submissions).toEqual([]);
					});
				}
			}

			it('preserves native validation for button clicks and implicit Enter before the client module arrives', async () => {
				const { page, submissions, load } = await openPage();
				await page.evaluate(() => {
					(document.querySelector('#save-button') as HTMLButtonElement).removeAttribute(
						'formnovalidate',
					);
					(document.querySelector('#draft-input') as HTMLInputElement).required = true;
				});
				const input = page.locator('#draft-input');
				await input.fill('');
				expect(
					await input.evaluate((element: HTMLInputElement) => element.validity.valueMissing),
				).toBe(true);
				await page.locator('#save-button').click();
				await input.press('Enter');
				expect(await page.evaluate(() => window.__formObservation.events.length)).toBe(0);
				expect(submissions).toEqual([]);
				await input.fill('valid accepted');
				await page.locator('#save-button').click();
				expect(
					await page.evaluate(() =>
						window.__formObservation.events.map((event) => event.defaultPrevented),
					),
				).toEqual([true]);
				await input.fill('edited afterward');
				await load();
				await page.waitForFunction(() => window.__formSubmission.state().deliveries.length === 1);
				expect(await page.evaluate(() => window.__formSubmission.state())).toMatchObject({
					deliveries: [
						{
							fields: [
								['draft', 'valid accepted'],
								['intent', 'save'],
							],
							early: true,
							original: true,
							submitterSame: true,
							trusted: true,
						},
					],
					nativeSubmissions: 1,
					canceled: [true],
					clicks: [],
					errors: [],
				});
				expect(submissions).toEqual([]);
			});

			it('accepts successful controls, files, external controls and submitter overrides before their DOM values change', async () => {
				const { page, submissions, load } = await openPage('controls');
				await page.locator('#draft-input').fill('A');
				await page.locator('#attachment-input').setInputFiles({
					name: 'original.txt',
					mimeType: 'text/plain',
					buffer: Buffer.from('accepted'),
				});
				await page.locator('#save-button').click();
				await page.locator('#draft-input').fill('B');
				await page.locator('#external-input').fill('changed-external');
				await page.locator('#checked-input').uncheck();
				await page.locator('#second-input').check();
				await page.locator('#options-input').selectOption(['two']);
				await page.locator('#attachment-input').setInputFiles([]);
				await page.evaluate(() => {
					const form = document.querySelector('#command-form') as HTMLFormElement;
					form.setAttribute('action', '/submitted?form=changed');
					form.method = 'get';
					form.enctype = 'text/plain';
					form.target = 'changed-target';
					form.noValidate = true;
					const button = document.querySelector('#save-button') as HTMLButtonElement;
					button.name = 'changed-intent';
					button.value = 'changed-save';
					button.formAction = '/submitted?form=changed-button';
					button.formMethod = 'get';
					button.formEnctype = 'text/plain';
					button.formTarget = 'changed-target';
					button.formNoValidate = false;
				});
				await load();
				await page.waitForFunction(() => window.__formSubmission.state().deliveries.length === 1);
				const state = await page.evaluate(() => window.__formSubmission.state());
				expect(state.deliveries[0]).toMatchObject({
					fields: [
						['draft', 'A'],
						['hidden', 'original-hidden'],
						['action', 'field-action'],
						['getAttribute', 'field-getAttribute'],
						['closest', 'field-closest'],
						['matches', 'field-matches'],
						['contains', 'field-contains'],
						['querySelectorAll', 'field-querySelectorAll'],
						['checked', 'yes'],
						['choice', 'first'],
						['options', 'one'],
						['options', 'three'],
						['attachment', { name: 'original.txt', size: 8, type: 'text/plain' }],
						['intent', 'save'],
						['external', 'original-external'],
					],
					form: {
						id: 'command-form',
						action: `${baseUrl}/submitted?form=base`,
						method: 'post',
						enctype: 'multipart/form-data',
						target: 'navigation-frame',
						noValidate: false,
					},
					submitter: {
						id: 'save-button',
						name: 'intent',
						value: 'save',
						type: 'submit',
						formAction: '/submitted?form=button',
						formMethod: 'post',
						formEnctype: 'application/x-www-form-urlencoded',
						formTarget: 'navigation-frame',
						formNoValidate: true,
					},
					original: true,
					submitterSame: true,
					immutable: true,
				});
				expect(state.nativeSubmissions).toBe(1);
				expect(submissions).toEqual([]);
			});

			it('keeps submit commands separate from island activation and ordinary behavior registration', async () => {
				const { page, submissions, load } = await openPage('index', '?hold');
				await page.getByLabel('Draft', { exact: true }).fill('A');
				await page.getByRole('button', { name: 'Save', exact: true }).click();
				await load();
				await page.waitForFunction(() => window.__formSubmission.state().hydrated === 1);
				let state = await page.evaluate(() => window.__formSubmission.state());
				expect(state).toMatchObject({
					captures: [expect.any(Object)],
					deliveries: [],
					adoptions: [],
					nativeSubmissions: 1,
					islandLoads: 1,
					hydrated: 1,
					clicks: [],
				});
				await page.getByRole('button', { name: 'Activate island', exact: true }).click();
				await page.waitForFunction(() =>
					window.__formSubmission.state().clicks.includes('activate-button'),
				);
				await page.getByLabel('Draft', { exact: true }).fill('B');
				await page.evaluate(() => window.__formSubmission.release());
				await page.waitForFunction(() => window.__formSubmission.state().deliveries.length === 1);
				state = await page.evaluate(() => window.__formSubmission.state());
				expect(state.deliveries[0].fields).toEqual([
					['draft', 'A'],
					['intent', 'save'],
				]);
				expect(state).toMatchObject({
					islandLoads: 1,
					inputSame: true,
					value: 'B',
					clicks: ['activate-button'],
					nativeSubmissions: 1,
				});
				await page.getByRole('button', { name: 'Save', exact: true }).click();
				state = await page.evaluate(() => window.__formSubmission.state());
				expect(state.deliveries.map((entry) => entry.fields)).toEqual([
					[
						['draft', 'A'],
						['intent', 'save'],
					],
					[
						['draft', 'B'],
						['intent', 'save'],
					],
				]);
				expect(
					state.deliveries.every((entry) => entry.original && entry.submitterSame && entry.trusted),
				).toBe(true);
				expect(state).toMatchObject({
					nativeSubmissions: 2,
					clicks: ['activate-button', 'save-button'],
					errors: [],
				});
				expect(submissions).toEqual([]);
			});

			it('delivers repeated click and submit sequences once each without replaying their native defaults', async () => {
				const { page, submissions, load } = await openPage('index', '?hold');
				for (const value of ['A', 'B']) {
					await page.getByLabel('Draft', { exact: true }).fill(value);
					await page.getByRole('button', { name: 'Save', exact: true }).click();
				}
				await page.getByLabel('Draft', { exact: true }).fill('C');
				await load();
				await page.waitForFunction(() => window.__formSubmission.state().hydrated === 1);
				expect(await page.evaluate(() => window.__formSubmission.state())).toMatchObject({
					captures: [expect.any(Object), expect.any(Object)],
					deliveries: [],
					nativeSubmissions: 2,
					clicks: [],
				});
				await page.evaluate(() => window.__formSubmission.release());
				await page.waitForFunction(() => window.__formSubmission.state().deliveries.length === 2);
				const state = await page.evaluate(() => window.__formSubmission.state());
				expect(state.deliveries.map((entry) => entry.fields)).toEqual([
					[
						['draft', 'A'],
						['intent', 'save'],
					],
					[
						['draft', 'B'],
						['intent', 'save'],
					],
				]);
				expect(
					state.deliveries.every((entry) => entry.original && entry.submitterSame && entry.trusted),
				).toBe(true);
				expect(state).toMatchObject({
					nativeSubmissions: 2,
					canceled: [true, true],
					inputSame: true,
					value: 'C',
					clicks: [],
					errors: [],
				});
				expect(submissions).toEqual([]);
			});

			it('drops pending commands when their behavior registration is disposed and releases the native default', async () => {
				const { page, submissions, load } = await openPage('index', '?hold');
				await page.getByLabel('Draft', { exact: true }).fill('A');
				await page.getByRole('button', { name: 'Save', exact: true }).click();
				await load();
				expect((await page.evaluate(() => window.__formSubmission.state())).deliveries).toEqual([]);
				await page.evaluate(() => {
					window.__formSubmission.disposeRegistration();
					window.__formSubmission.release();
				});
				await page.getByLabel('Draft', { exact: true }).fill('B');
				await page.getByRole('button', { name: 'Save', exact: true }).click();
				await expect.poll(() => submissions.length).toBe(1);
				const state = await page.evaluate(() => window.__formSubmission.state());
				expect(state).toMatchObject({
					deliveries: [],
					adoptions: [],
					cleanups: [],
					nativeSubmissions: 2,
					canceled: [true, false],
					errors: [],
				});
			});

			it('releases future native submits after the bounded lease expires without an owner', async () => {
				const { page, submissions, load } = await openPage('index', '?no-owner', true);
				await page.getByLabel('Draft', { exact: true }).fill('A');
				await page.evaluate(() =>
					(document.querySelector('#command-form') as HTMLFormElement).requestSubmit(),
				);
				expect(
					await page.evaluate(() =>
						window.__formObservation.events.map((event) => event.defaultPrevented),
					),
				).toEqual([true]);
				await page.clock.fastForward(30_001);
				await page.getByRole('button', { name: 'Save', exact: true }).click();
				await expect.poll(() => submissions.length).toBe(1);
				await load();
				await page.evaluate(() => window.__formSubmission.register());
				const state = await page.evaluate(() => window.__formSubmission.state());
				expect(state).toMatchObject({
					captures: [],
					deliveries: [],
					nativeSubmissions: 2,
					canceled: [true, false],
					errors: [],
				});
			});

			it('drops an overflowing unowned command sequence and restores native submission', async () => {
				const { page, submissions, load } = await openPage('index', '?no-owner');
				await page.evaluate(() => {
					const form = document.querySelector('#command-form') as HTMLFormElement;
					for (let index = 0; index < 257; index++) form.requestSubmit();
				});
				expect(
					await page.evaluate(() =>
						window.__formObservation.events.map((event) => event.defaultPrevented),
					),
				).toEqual([...Array<boolean>(256).fill(true), false]);
				await expect.poll(() => submissions.length).toBe(1);
				await page.getByRole('button', { name: 'Save', exact: true }).click();
				await expect.poll(() => submissions.length).toBe(2);
				await load();
				await page.evaluate(() => window.__formSubmission.register());
				expect(await page.evaluate(() => window.__formSubmission.state())).toMatchObject({
					captures: [],
					deliveries: [],
					errors: [],
				});
			});
		},
	);
}
