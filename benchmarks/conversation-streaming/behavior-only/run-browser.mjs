import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { bodyRows, historyRows } from '../fixture/src/data.mjs';
import { buildFixture, startServer } from './build.mjs';

// Browser selection belongs to the caller. This supports real Chrome and
// Playwright WebKit without mislabelling WebKit as installed Safari/iOS proof.
export async function runBrowser(browser, { output, iterations = 3 } = {}) {
	assert.ok(Number.isInteger(iterations) && iterations > 0 && iterations <= 50);
	const build = await buildFixture(output);
	const server = await startServer(build);
	const result = {
		suite: build.suite,
		build: path.join(build.output, 'build.json'),
		browser: browser.version(),
		iterations,
		samples: [],
		failures: [],
		limitations: build.limitations,
	};
	try {
		for (let iteration = -1; iteration < iterations; iteration++) {
			for (const mode of ['eager', 'held-modules', 'pristine-restore']) {
				const context = await browser.newContext();
				const page = await context.newPage();
				page.setDefaultTimeout(15_000);
				const errors = [],
					network = [];
				page.on('pageerror', (error) => errors.push(String(error)));
				page.on('requestfailed', (request) =>
					errors.push(`${request.url()}: ${request.failure()?.errorText}`),
				);
				page.on('request', (request) => {
					if (request.url().includes('/assets/')) network.push(request.url().split('/assets/')[1]);
				});
				let releaseModules;
				const run = randomUUID();
				try {
					await page.addInitScript(() => {
						window.__behaviorMarks = {};
						new MutationObserver(() => {
							for (const [name, selector] of [
								['shell', '#draft'],
								['body', '[data-body]'],
								['history', '[data-history]'],
								['bodyComplete', '#body-live'],
								['historyComplete', '#history-live'],
							]) {
								const element = document.querySelector(selector);
								if (
									element &&
									(!name.endsWith('Complete') || element.textContent.startsWith('4:')) &&
									window.__behaviorMarks[name] === undefined
								)
									window.__behaviorMarks[name] = performance.now();
							}
						}).observe(document, { childList: true, subtree: true, characterData: true });
					});
					if (mode === 'held-modules') {
						const gate = new Promise((resolve) => {
							releaseModules = resolve;
						});
						await page.route('**/assets/**', async (route) => {
							await gate;
							await route.continue();
						});
					}
					await page.goto(`${server.url}/?run=${run}&scenario=large-waves`, {
						waitUntil: 'commit',
					});
					await page.locator('#draft').waitFor();
					assert.equal(await page.locator('[data-body-pending]').count(), 1);
					assert.equal(await page.locator('[data-history-pending]').count(), 1);
					assert.equal(await page.locator('[data-turn],[data-conversation]').count(), 0);
					if (mode === 'held-modules') {
						await page.locator('#draft').fill('typed before modules');
						assert.equal(
							await page.locator('#draft-length').textContent(),
							'11',
							'Tiny capture alone is not a live derivation runtime',
						);
						assert.equal(await page.locator('html').getAttribute('data-behavior-ready'), null);
						releaseModules();
					}
					await page.waitForFunction(
						() =>
							document.documentElement.dataset.behaviorReady === 'true' ||
							document.documentElement.dataset.bootstrapError,
						undefined,
						// WebKit can defer animation frames until the held response ends.
						{ polling: 50 },
					);
					assert.equal(await page.locator('html').getAttribute('data-bootstrap-error'), null);
					assert.equal(
						await page.locator('html').getAttribute('data-behavior-ready-state'),
						'loading',
						'Classic import launcher must activate before auth-gated parser EOF',
					);
					let expectedDraft;
					if (mode === 'pristine-restore') {
						await page.evaluate(() => document.dispatchEvent(new Event('restore-draft')));
						assert.equal(await page.locator('html').getAttribute('data-restore-accepted'), 'true');
						expectedDraft = 'restored draft';
					} else {
						if (mode === 'eager') await page.locator('#draft').fill('typed after behavior');
						expectedDraft = mode === 'eager' ? 'typed after behavior' : 'typed before modules';
						await page.evaluate(() => document.dispatchEvent(new Event('restore-draft')));
						assert.equal(await page.locator('html').getAttribute('data-restore-accepted'), 'false');
						// Native edits return to the exact same string: equality cannot
						// substitute for the candidate's framework-owned edit revision.
						await page.locator('#draft').focus();
						await page.locator('#draft').press('End');
						await page.evaluate(() => document.dispatchEvent(new Event('begin-restore')));
						await page.keyboard.type('x');
						await page.keyboard.press('Backspace');
						await page.evaluate(() => document.dispatchEvent(new Event('restore-draft')));
						assert.equal(await page.locator('html').getAttribute('data-restore-accepted'), 'false');
					}
					assert.equal(await page.locator('#draft').inputValue(), expectedDraft);
					assert.equal(
						await page.locator('#draft-length').textContent(),
						String(expectedDraft.length),
					);
					// WebKit can defer animation frames while this response remains open.
					// Send trusted pointer input without Playwright's two-RAF stability wait.
					const day = await page.locator('#day').boundingBox();
					assert.ok(day && day.width > 0 && day.height > 0);
					await page.mouse.click(day.x + day.width / 2, day.y + day.height / 2, { clickCount: 3 });
					assert.equal(await page.locator('#selected-day').textContent(), '3');
					assert.equal(
						network.some((file) => file.includes('optional-')),
						false,
					);
					const held = await (await context.request.get(`${server.url}/trace?run=${run}`)).json();
					assert.equal(
						held.requests[0].events.filter((event) => event.event === 'auth:start').length,
						1,
					);
					assert.equal(
						held.requests[0].events.some(
							(event) => event.event === 'body:start' || event.event === 'history:start',
						),
						false,
					);
					const released = await (
						await context.request.post(`${server.url}/release?run=${run}`)
					).json();
					assert.equal(released.released, 1);
					await page.waitForFunction(
						() =>
							document.getElementById('body-live')?.textContent === '4:20' &&
							document.getElementById('history-live')?.textContent === '4:12',
					);
					await page.waitForLoadState('load');
					assert.deepEqual(
						await page.locator('[data-turn]').evaluateAll((nodes) =>
							nodes.map((node) => ({
								id: node.getAttribute('data-turn'),
								prompt: node.children[0].textContent,
								answer: node.children[1].textContent,
							})),
						),
						bodyRows(5),
					);
					assert.deepEqual(
						await page.locator('[data-conversation]').evaluateAll((nodes) =>
							nodes.map((node) => ({
								id: node.getAttribute('data-conversation'),
								title: node.textContent,
							})),
						),
						historyRows(3).map(({ id, title }) => ({ id, title })),
					);
					await page.locator('#optional').click();
					await page.waitForFunction(() => document.getElementById('optional-value')?.textContent);
					assert.deepEqual(JSON.parse(await page.locator('#optional-value').textContent()), {
						draft: expectedDraft,
						selectedDay: 3,
						body: { revision: 4, total: 20, rows: bodyRows(20) },
						history: { revision: 4, total: 12, rows: historyRows(12) },
					});
					assert.equal(await page.locator('html').getAttribute('data-client-loader-calls'), null);
					await page.evaluate(() => document.dispatchEvent(new Event('verify-control-identity')));
					assert.equal(await page.locator('html').getAttribute('data-control-survived'), 'true');
					const trace = await (await context.request.get(`${server.url}/trace?run=${run}`)).json();
					for (const event of [
						'auth:start',
						'body:start',
						'history:start',
						'body:complete',
						'history:complete',
					])
						assert.equal(
							trace.requests[0].events.filter((item) => item.event === event).length,
							1,
							event,
						);
					assert.deepEqual(errors, []);
					const marks = await page.evaluate(() => ({
						...window.__behaviorMarks,
						behavior: performance.getEntriesByName('behavior-ready')[0].startTime,
					}));
					if (iteration >= 0) result.samples.push({ iteration, mode, marks, network, trace });
				} catch (error) {
					result.failures.push({
						trace: await (
							await context.request.get(`${server.url}/trace?run=${run}`)
						)
							.json()
							.catch(() => null),
						iteration,
						mode,
						error: String(error),
						errors,
						network,
						html: await page.content().catch(() => ''),
						dataset: await page
							.locator('html')
							.evaluate((node) => ({ ...node.dataset }))
							.catch(() => null),
					});
					throw error;
				} finally {
					releaseModules?.();
					await context.close();
				}
			}
		}
	} finally {
		await server.close();
		fs.writeFileSync(path.join(build.output, 'browser.json'), JSON.stringify(result, null, 2));
	}
	return result;
}
