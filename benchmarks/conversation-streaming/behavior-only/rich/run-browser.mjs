import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { gzipSync, brotliCompressSync, constants } from 'node:zlib';
import { buildFixture, startServer } from '../build.mjs';

const bytes = (content) => ({
	raw: Buffer.byteLength(content),
	gzip: content.length ? gzipSync(content, { level: 9 }).length : 0,
	brotli: content.length
		? brotliCompressSync(content, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length
		: 0,
});

/** Browser supplied by the caller; never install or silently switch engines. */
export async function runRichBrowser(
	browser,
	{ output, iterations = 3, presentation = 'authored' } = {},
) {
	assert.ok(Number.isInteger(iterations) && iterations > 0 && iterations <= 20);
	const build = await buildFixture(output, { bundler: 'vite', richPresentation: presentation });
	const server = await startServer(build);
	const result = {
		suite: 'rich-streamed-presentation',
		build: path.join(build.output, 'build.json'),
		browser: browser.version(),
		presentation,
		samples: [],
		failures: [],
	};
	try {
		for (let iteration = -1; iteration < iterations; iteration++) {
			for (const mode of ['stay', 'roundtrip']) {
				const context = await browser.newContext();
				const page = await context.newPage();
				const errors = [],
					requested = new Set();
				page.setDefaultTimeout(15000);
				page.on('pageerror', (error) => errors.push(String(error)));
				page.on('console', (message) => {
					if (message.type() === 'error') errors.push(message.text());
				});
				page.on('requestfailed', (request) =>
					errors.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`),
				);
				page.on('request', (request) => {
					if (request.url().includes('/assets/')) requested.add(request.url().split('/assets/')[1]);
				});
				const run = randomUUID();
				try {
					await page.addInitScript(() => {
						window.__richMarks = [];
						window.__richIdentity = {};
						let prior = '';
						new MutationObserver(() => {
							// Capture first visible lifetimes, independently of later import/click latency.
							const identity = window.__richIdentity;
							identity.map ??= document.querySelector('#rich-map-svg');
							identity.paragraph ??= document.querySelector('#rich-response p');
							identity.place ??= document.querySelector('#rich-places li');
							identity.removedParagraph ??= document.querySelector('[data-paragraph="turn-2"]');
							identity.removedPlace ??= document.querySelector('[data-place-row="turn-2"]');
							const title = document.querySelector('#rich-title')?.textContent;
							const paragraphs = document.querySelectorAll('#rich-response p').length;
							const progress = document.querySelector('#rich-progress')?.textContent;
							const key = JSON.stringify([title, paragraphs, progress]);
							if (key !== prior) {
								prior = key;
								window.__richMarks.push({
									at: performance.now(),
									title,
									paragraphs,
									progress,
									paragraphKeys: [...document.querySelectorAll('#rich-response p')].map((node) =>
										node.getAttribute('data-paragraph'),
									),
									placeKeys: [...document.querySelectorAll('#rich-places li')].map((node) =>
										node.getAttribute('data-place-row'),
									),
								});
							}
						}).observe(document, { childList: true, subtree: true, characterData: true });
					});
					const response = await page.goto(`${server.url}/?run=${run}&scenario=rich-waves`, {
						waitUntil: 'commit',
					});
					await page.waitForFunction(
						() =>
							document.documentElement.dataset.behaviorReady === 'true' ||
							document.documentElement.dataset.bootstrapError,
						null,
						{ polling: 20 },
					);
					assert.equal(await page.locator('html').getAttribute('data-bootstrap-error'), null);
					assert.equal(await page.locator('#rich-title').textContent(), 'A trip taking shape');
					assert.equal(await page.locator('#rich-map-placeholder').count(), 1);
					assert.equal(await page.locator('#rich-response p').count(), 0);
					const startupAssets = [...requested];
					const startupInline = await page.evaluate(() => {
						const scripts = [...document.scripts].filter((script) => !script.src);
						return {
							earlyCapture:
								document.head.querySelector('script[data-octane-stream]')?.textContent ?? '',
							executable: scripts
								.filter((script) => script.type !== 'application/json')
								.map((script) => script.textContent)
								.join('\n'),
							data: scripts
								.filter((script) => script.type === 'application/json')
								.map((script) => script.textContent)
								.join('\n'),
						};
					});
					assert.ok(
						!startupAssets.some((file) => file.includes('map-interaction')),
						'Map controls must remain cold at startup',
					);
					await page.locator('#draft').fill('Draft survives the entire stream');
					// Trusted input without actionability's animation-frame wait while EOF is held.
					const click = async (selector) => {
						await page
							.locator(selector)
							.evaluate((element) =>
								element.scrollIntoView({ block: 'center', behavior: 'instant' }),
							);
						const box = await page.locator(selector).boundingBox();
						assert.ok(box, `Visible native target ${selector}`);
						await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
					};
					const activateMap = async () => {
						await click('#rich-activate-map');
						await page.locator('#rich-map').waitFor();
						return page.evaluate(() => {
							const state = window.__richPresentation.snapshot();
							return {
								bodyRevision: state.bodyRevision,
								historyRevision: state.historyRevision,
								bodyComplete: state.bodyComplete,
								historyComplete: state.historyComplete,
							};
						});
					};
					// The identity lane must observe places from their first insertion. The
					// roundtrip lane separately exercises cold activation after streaming begins.
					let postActivationState = mode === 'stay' ? await activateMap() : undefined;
					const release = await fetch(`${server.url}/release?run=${run}`, { method: 'POST' });
					assert.equal(release.status, 200);
					await page.waitForFunction(
						() => document.querySelectorAll('#rich-response p').length >= 5,
						null,
						{ polling: 10 },
					);
					if (mode === 'roundtrip') postActivationState = await activateMap();
					await click('#rich-places li:first-child button');
					await click('#rich-zoom-in');
					assert.equal(await page.locator('#rich-map-svg').getAttribute('viewBox'), '20 10 60 30');
					assert.equal(
						await page.locator('#rich-places li:first-child button').getAttribute('aria-pressed'),
						'true',
					);
					assert.deepEqual(
						await page.evaluate((mode) => {
							const names = ['map', 'paragraph', 'place'];
							if (mode === 'stay') names.push('removedParagraph', 'removedPlace');
							return names.filter((name) => !window.__richIdentity[name]);
						}, mode),
						[],
						'Every asserted node lifetime must have been observed before deletion',
					);
					const activationAssets = [...requested];
					assert.ok(activationAssets.some((file) => file.includes('map-interaction')));
					if (mode === 'roundtrip') {
						await click('#rich-visit-b');
						assert.equal(await page.locator('#rich-title').textContent(), 'Conversation B');
						assert.equal(await page.locator('#rich-response p').count(), 0);
					}
					await page.waitForFunction(
						() => {
							const snapshot = window.__richPresentation.snapshot();
							return snapshot.bodyComplete && snapshot.historyComplete;
						},
						null,
						{ polling: 20 },
					);
					if (mode === 'roundtrip') {
						assert.equal(
							await page.locator('#rich-title').textContent(),
							'Conversation B',
							'Late A frames must not rewrite B',
						);
						assert.equal(await page.locator('#rich-response p').count(), 0);
						await click('#rich-return-a');
					}
					assert.equal(
						await page.locator('#rich-title').textContent(),
						'A trip taking shape · title revision 4',
					);
					assert.equal(await page.locator('#rich-response p').count(), 20);
					assert.equal(await page.locator('#rich-places li').count(), 20);
					assert.equal(await page.locator('#rich-links a').count(), 7);
					assert.equal(
						await page.locator('#rich-links a').first().getAttribute('href'),
						'/place/turn-1?revision=4',
					);
					assert.equal(await page.locator('#rich-map-svg').getAttribute('viewBox'), '20 10 60 30');
					assert.equal(
						await page.locator('#rich-places li:first-child button').getAttribute('aria-pressed'),
						'true',
					);
					const identity = await page.evaluate(() => ({
						map: window.__richIdentity.map === document.querySelector('#rich-map-svg'),
						paragraph:
							window.__richIdentity.paragraph === document.querySelector('#rich-response p'),
						place: window.__richIdentity.place === document.querySelector('#rich-places li'),
					}));
					assert.deepEqual(identity, {
						map: mode === 'stay',
						paragraph: mode === 'stay',
						place: mode === 'stay',
					});
					if (mode === 'stay') {
						const marks = await page.evaluate(() => window.__richMarks);
						const third = marks.find(
							(mark) => mark.progress?.includes('update 3') && mark.placeKeys.length === 14,
						);
						assert.ok(third, 'The third frame must visibly delete and reorder prior results');
						const reordered = [
							'turn-1',
							...Array.from({ length: 13 }, (_, index) => `turn-${15 - index}`),
						];
						assert.deepEqual(third.paragraphKeys, reordered);
						assert.deepEqual(third.placeKeys, reordered);
						assert.equal(
							await page.evaluate(
								() =>
									window.__richIdentity.removedParagraph !==
										document.querySelector('[data-paragraph="turn-2"]') &&
									window.__richIdentity.removedPlace !==
										document.querySelector('[data-place-row="turn-2"]') &&
									!window.__richIdentity.removedParagraph.isConnected &&
									!window.__richIdentity.removedPlace.isConnected,
							),
							true,
							'A reintroduced key receives fresh nodes after its prior lifetime ended',
						);
					}
					assert.equal(
						await page.locator('#draft').inputValue(),
						'Draft survives the entire stream',
					);
					assert.equal(await page.locator('html').getAttribute('data-client-loader-calls'), null);
					const final = await page.evaluate(() => window.__richPresentation.snapshot());
					assert.equal(final.subscriptions, 1);
					assert.ok(
						final.revisions.some((entry) => entry.body !== entry.history),
						'Independent sources must be observed interleaving',
					);
					const trace = await (await fetch(`${server.url}/trace?run=${run}`)).json();
					const events = trace.requests.flatMap((request) => request.events);
					for (const name of ['auth:start', 'body:start', 'history:start'])
						assert.equal(events.filter((event) => event.event === name).length, 1);
					assert.equal(events.filter((event) => event.event === 'request:abort').length, 0);
					assert.deepEqual(errors, []);
					const html = await response.text();
					const markup = await page.evaluate(() => ({
						inline: [...document.scripts]
							.filter((script) => !script.src)
							.map((script) => script.textContent)
							.join('\n'),
						css: [...document.querySelectorAll('style')]
							.map((style) => style.textContent)
							.join('\n'),
					}));
					const sample = {
						iteration,
						warmup: iteration < 0,
						mode,
						postActivationState,
						html: bytes(html),
						inline: bytes(markup.inline),
						css: bytes(markup.css),
						startupInline: Object.fromEntries(
							Object.entries(startupInline).map(([name, content]) => [name, bytes(content)]),
						),
						startupAssets,
						activationAssets,
						eventualAssets: [...requested],
						identity,
						final,
						marks: await page.evaluate(() => window.__richMarks),
						trace,
					};
					// Observe real nonpersisted pagehide and context teardown before accepting a sample.
					await page.goto('about:blank');
					await context.close();
					assert.deepEqual(errors, []);
					result.samples.push(sample);
				} catch (error) {
					result.failures.push({
						iteration,
						mode,
						message: String(error),
						errors,
						requested: [...requested],
						document: await page
							.evaluate(() => ({
								state: document.readyState,
								html: document.documentElement.outerHTML.slice(0, 24000),
							}))
							.catch(() => null),
					});
					throw error;
				} finally {
					await context.close();
				}
			}
		}
		return result;
	} finally {
		fs.writeFileSync(path.join(build.output, 'rich-browser.json'), JSON.stringify(result, null, 2));
		await server.close();
	}
}
