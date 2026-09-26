import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { gzipSync, brotliCompressSync, constants } from 'node:zlib';
import { buildFixture, startServer } from '../build.mjs';
import { bodyRows } from '../../fixture/src/data.mjs';

const driverFile = fileURLToPath(import.meta.url);
const driverHash = () => createHash('sha256').update(fs.readFileSync(driverFile)).digest('hex');
const loadedDriverHash = driverHash();

const bytes = (content) => ({
	raw: Buffer.byteLength(content),
	gzip: content.length ? gzipSync(content, { level: 9 }).length : 0,
	brotli: content.length
		? brotliCompressSync(content, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length
		: 0,
});

// Trusted input without actionability's animation-frame wait while EOF is held.
async function clickNative(page, selector) {
	await page
		.locator(selector)
		.evaluate((element) => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
	const box = await page.locator(selector).boundingBox();
	assert.ok(box, `Visible native target ${selector}`);
	await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

async function assertVisibleFrame(page, revision) {
	const rows = bodyRows(20).slice(0, revision * 5);
	const visible = await page.evaluate(() => ({
		progress: [...document.querySelectorAll('#rich-progress li')].map(
			(element) => element.textContent,
		),
		paragraphs: [...document.querySelectorAll('#rich-response p')].map(
			(element) => element.textContent,
		),
		links: [...document.querySelectorAll('#rich-links a')].map((element) => ({
			label: element.textContent,
			href: element.getAttribute('href'),
		})),
	}));
	assert.deepEqual(visible, {
		progress: [
			`Finding places · update ${revision}`,
			`Building the response from ${rows.length} results`,
		],
		paragraphs: rows.map((row) => `${row.answer} Update ${revision}.`),
		links: rows
			.filter((_, index) => index % 3 === 0)
			.map((row) => ({
				label: row.prompt,
				href: `/place/${row.id}?revision=${revision}`,
			})),
	});
}

// Delay the client entry, or the selected renderer fallback, without delaying
// server parsing or delivery. The mailbox proves which frames arrived first.
async function runDelayedActivation(browser, server, mode, iteration, rendererFallback) {
	const context = await browser.newContext();
	const page = await context.newPage();
	const errors = [];
	const requested = new Set();
	const run = randomUUID();
	let releaseEntry;
	const entryGate = new Promise((resolve) => (releaseEntry = resolve));
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
	const heldAsset = rendererFallback
		? '**/assets/chunks/activate-renderer-*.js'
		: '**/assets/behavior.js';
	await page.route(heldAsset, async (route) => {
		await entryGate;
		await route.continue();
	});
	try {
		const requestedEntry = page.waitForRequest(heldAsset, { timeout: 15000 });
		await page.goto(
			`${server.url}/?run=${run}&scenario=rich-waves${mode === 'split' ? '&holdWaves=true' : ''}${rendererFallback ? '&rendererFallback=1' : ''}`,
			{ waitUntil: 'commit' },
		);
		await requestedEntry;
		await page.locator('[data-rich]').waitFor();
		await page.evaluate(() => {
			window.__earlyRich = {
				root: document.querySelector('[data-rich]'),
				title: document.querySelector('#rich-title'),
				progress: document.querySelector('#rich-progress li'),
				response: document.querySelector('#rich-response'),
				draft: document.querySelector('#draft'),
			};
		});
		await page.locator('#draft').fill('Draft typed before activation');
		await page.waitForFunction(async (run) => {
			const trace = await (await fetch(`/trace?run=${run}`)).json();
			return trace.requests.some((request) =>
				request.events.some((event) => event.event === 'auth:held'),
			);
		}, run);
		const release = await fetch(`${server.url}/release?run=${run}`, { method: 'POST' });
		assert.deepEqual(await release.json(), { run, released: 1 });
		const revision = mode === 'split' ? 1 : 4;
		const early = await page.waitForFunction(
			({ revision, complete }) => {
				const frames = window.__octaneStreamedRenderer?.frames ?? [];
				const streams = new Map();
				for (const frame of frames) {
					if (frame.channel !== 'result') continue;
					if (frame.kind === 'value' && frame.value?.[0] === 'object') {
						const encoded = frame.value[1].find(([key]) => key === 'revision')?.[1];
						if (encoded?.[0] === 'number')
							streams.set(frame.identity.nodeKey, { revision: encoded[1], complete: false });
					} else if (frame.kind === 'complete' && streams.has(frame.identity.nodeKey)) {
						streams.get(frame.identity.nodeKey).complete = true;
					}
				}
				const values = [...streams.values()];
				return (
					values.length === 2 &&
					values.every((value) => value.revision === revision && (!complete || value.complete)) &&
					values
				);
			},
			{ revision, complete: mode === 'before' },
		);
		assert.deepEqual(await early.jsonValue(), [
			{ revision, complete: mode === 'before' },
			{ revision, complete: mode === 'before' },
		]);
		assert.equal(await page.locator('html').getAttribute('data-behavior-ready'), null);
		assert.equal(await page.locator('#rich-title').textContent(), 'A trip taking shape');
		assert.equal(await page.locator('#rich-response p').count(), 0);
		releaseEntry();
		await page.waitForFunction(
			() =>
				document.documentElement.dataset.behaviorReady === 'true' ||
				document.documentElement.dataset.bootstrapError,
		);
		assert.equal(await page.locator('html').getAttribute('data-bootstrap-error'), null);
		const initial = await page.evaluate(() => window.__richPresentation.snapshot());
		assert.equal(initial.bodyRevision, revision);
		assert.equal(initial.historyRevision, revision);
		assert.equal(initial.subscriptions, 1);
		assert.deepEqual(initial.recoverableErrors, []);
		assert.equal(
			await page.locator('#rich-title').textContent(),
			`A trip taking shape · title revision ${revision}`,
		);
		assert.equal(await page.locator('#rich-response p').count(), revision * 5);
		await assertVisibleFrame(page, revision);
		assert.equal(await page.locator('#draft').inputValue(), 'Draft typed before activation');
		const adopted = await page.evaluate(() => {
			const { root, title, progress, response, draft } = window.__earlyRich;
			return {
				root: root === document.querySelector('[data-rich]'),
				title: title === document.querySelector('#rich-title'),
				progress: progress === document.querySelector('#rich-progress li'),
				response: response === document.querySelector('#rich-response'),
				draft: draft === document.querySelector('#draft'),
			};
		});
		assert.deepEqual(adopted, {
			root: true,
			title: true,
			progress: true,
			response: true,
			draft: true,
		});
		const click = (selector) => clickNative(page, selector);
		await click('#rich-activate-map');
		await page.locator('#rich-map').waitFor();
		await click('#rich-places li:first-child button');
		await click('#rich-zoom-in');
		await page.evaluate(() => {
			window.__earlyRich.map = document.querySelector('#rich-map-svg');
			window.__earlyRich.paragraph = document.querySelector('#rich-response p');
			window.__earlyRich.place = document.querySelector('#rich-places li');
			window.__earlyRich.button = document.querySelector('#rich-places li:nth-child(2) button');
		});
		if (mode === 'split') {
			const heldTrace = await (await fetch(`${server.url}/trace?run=${run}`)).json();
			const heldEvents = heldTrace.requests.flatMap((request) => request.events);
			for (const name of ['body:yield', 'history:yield'])
				assert.deepEqual(
					heldEvents.filter((event) => event.event === name).map((event) => event.revision),
					[1],
				);
			assert.equal(heldEvents.filter((event) => event.event === 'waves:held').length, 1);
			const releaseWaves = await fetch(`${server.url}/release?run=${run}&phase=waves`, {
				method: 'POST',
			});
			assert.deepEqual(await releaseWaves.json(), { run, released: 1 });
			await page.waitForFunction(() => {
				const state = window.__richPresentation.snapshot();
				return state.bodyComplete && state.historyComplete;
			});
		}
		assert.equal(
			await page.locator('#rich-title').textContent(),
			'A trip taking shape · title revision 4',
		);
		assert.equal(await page.locator('#rich-response p').count(), 20);
		assert.equal(await page.locator('#rich-places li').count(), 20);
		assert.equal(await page.locator('#rich-links a').count(), 7);
		await assertVisibleFrame(page, 4);
		assert.equal(await page.locator('#rich-map-svg').getAttribute('viewBox'), '20 10 60 30');
		assert.equal(
			await page.locator('#rich-places li:first-child button').getAttribute('aria-pressed'),
			'true',
		);
		const survivors = await page.evaluate(() => ({
			root: window.__earlyRich.root === document.querySelector('[data-rich]'),
			title: window.__earlyRich.title === document.querySelector('#rich-title'),
			map: window.__earlyRich.map === document.querySelector('#rich-map-svg'),
			paragraph: window.__earlyRich.paragraph === document.querySelector('#rich-response p'),
			place: window.__earlyRich.place === document.querySelector('#rich-places li'),
		}));
		assert.deepEqual(survivors, {
			root: true,
			title: true,
			map: true,
			paragraph: true,
			place: true,
		});
		const beforeNavigation = await page.evaluate(() => window.__richPresentation.snapshot());
		assert.equal(beforeNavigation.bodyRevision, 4);
		assert.equal(beforeNavigation.historyRevision, 4);
		assert.equal(beforeNavigation.bodyComplete, true);
		assert.equal(beforeNavigation.historyComplete, true);
		assert.deepEqual(beforeNavigation.recoverableErrors, []);
		if (mode === 'split') {
			for (const revision of [2, 3, 4]) {
				assert.ok(beforeNavigation.revisions.some((entry) => entry.body === revision));
				assert.ok(beforeNavigation.revisions.some((entry) => entry.history === revision));
			}
		}
		await click('#rich-visit-b');
		assert.equal(await page.locator('#rich-title').textContent(), 'Conversation B');
		const retired = await page.evaluate(() => {
			const before = window.__richPresentation.snapshot();
			window.__earlyRich.button.click();
			const after = window.__richPresentation.snapshot();
			return {
				detached: !window.__earlyRich.root.isConnected,
				oldButtonDetached: !window.__earlyRich.button.isConnected,
				subscriptions: after.subscriptions,
				intentUnchanged: JSON.stringify(before.intent) === JSON.stringify(after.intent),
			};
		});
		assert.deepEqual(retired, {
			detached: true,
			oldButtonDetached: true,
			subscriptions: 1,
			intentUnchanged: true,
		});
		await click('#rich-return-a');
		assert.equal(
			await page.locator('#rich-title').textContent(),
			'A trip taking shape · title revision 4',
		);
		assert.equal(await page.locator('#rich-map-svg').getAttribute('viewBox'), '20 10 60 30');
		assert.equal(
			await page.locator('#rich-places li:first-child button').getAttribute('aria-pressed'),
			'true',
		);
		assert.equal(await page.locator('#draft').inputValue(), 'Draft typed before activation');
		assert.equal(await page.locator('html').getAttribute('data-client-loader-calls'), null);
		const final = await page.evaluate(() => window.__richPresentation.snapshot());
		assert.equal(final.subscriptions, 1);
		assert.deepEqual(final.recoverableErrors, []);
		const trace = await (await fetch(`${server.url}/trace?run=${run}`)).json();
		const events = trace.requests.flatMap((request) => request.events);
		for (const name of ['auth:start', 'body:start', 'history:start'])
			assert.equal(events.filter((event) => event.event === name).length, 1);
		for (const name of ['body:yield', 'history:yield'])
			assert.deepEqual(
				events.filter((event) => event.event === name).map((event) => event.revision),
				[1, 2, 3, 4],
			);
		assert.equal(
			events.filter((event) => event.event === 'waves:released').length,
			mode === 'split' ? 1 : 0,
		);
		assert.equal(events.filter((event) => event.event === 'request:abort').length, 0);
		assert.deepEqual(errors, []);
		await page.goto('about:blank');
		await context.close();
		assert.deepEqual(errors, []);
		return {
			iteration,
			warmup: iteration < 0,
			mode,
			heldAsset: rendererFallback ? 'renderer-fallback' : 'client-entry',
			earlyRevision: revision,
			adopted,
			survivors,
			retired,
			final,
			requested: [...requested],
			trace,
		};
	} catch (error) {
		const diagnostic = await page
			.evaluate(() => ({
				bootstrapError: document.documentElement.dataset.bootstrapError ?? null,
				state: window.__richPresentation?.snapshot() ?? null,
				title: document.querySelector('#rich-title')?.textContent ?? null,
				paragraphs: document.querySelectorAll('#rich-response p').length,
			}))
			.catch(() => null);
		throw Object.assign(new Error(String(error)), {
			errors,
			requested: [...requested],
			diagnostic,
		});
	} finally {
		releaseEntry();
		await context.close();
	}
}

/** Browser supplied by the caller; never install or silently switch engines. */
export async function runRichBrowser(
	browser,
	{ output, iterations = 3, presentation = 'authored', rendererFallback = false } = {},
) {
	assert.ok(Number.isInteger(iterations) && iterations > 0 && iterations <= 20);
	assert.ok(!rendererFallback || presentation === 'fallback-control');
	const build = await buildFixture(output, { bundler: 'vite', richPresentation: presentation });
	assert.equal(
		build.harnessHashes['rich/run-browser.mjs'],
		loadedDriverHash,
		'Browser driver changed before build',
	);
	const server = await startServer(build);
	const result = {
		suite: 'rich-streamed-presentation',
		build: path.join(build.output, 'build.json'),
		browser: browser.version(),
		presentation,
		rendererFallback,
		driver: { file: driverFile, sha256: loadedDriverHash, finalSha256: null },
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
					const response = await page.goto(
						`${server.url}/?run=${run}&scenario=rich-waves${rendererFallback ? '&rendererFallback=1' : ''}`,
						{
							waitUntil: 'commit',
						},
					);
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
					const click = (selector) => clickNative(page, selector);
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
					assert.deepEqual(final.recoverableErrors, []);
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
			for (const mode of ['before', 'split']) {
				try {
					result.samples.push(
						await runDelayedActivation(browser, server, mode, iteration, rendererFallback),
					);
				} catch (error) {
					result.failures.push({
						iteration,
						mode,
						message: String(error),
						errors: error.errors,
						requested: error.requested,
						diagnostic: error.diagnostic,
					});
				}
			}
		}
		assert.deepEqual(
			result.failures,
			[],
			'Delayed presentation activation must preserve the streamed workload',
		);
		if (presentation === 'fallback-control') {
			const rendererFile = Object.entries(build.outputs).find(([, detail]) =>
				detail.entryPoint?.endsWith('/rich/activate-renderer.ts'),
			)?.[0];
			assert.ok(rendererFile, 'The fallback renderer must be present in the output graph');
			for (const sample of result.samples) {
				const requested = sample.requested ?? sample.eventualAssets;
				assert.equal(
					requested.includes(rendererFile),
					rendererFallback,
					'The renderer must only load when the fallback was selected',
				);
			}
		}
		result.driver.finalSha256 = driverHash();
		assert.equal(
			result.driver.finalSha256,
			loadedDriverHash,
			'Browser driver changed during the run',
		);
		return result;
	} finally {
		fs.writeFileSync(path.join(build.output, 'rich-browser.json'), JSON.stringify(result, null, 2));
		await server.close();
	}
}
