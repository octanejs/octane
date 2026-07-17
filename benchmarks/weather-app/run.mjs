// Weather Front benchmark — a production-browser port of the React weather app
// from lissy93/framework-benchmarks, paired with an idiomatic Octane TSRX twin.
// Every timed operation is driven through the public DOM and verified afterward.

import fs from 'node:fs';
import { chromium } from 'playwright';
import { censusDomNodes, deterministicCount } from '../lib/dom-nodes.mjs';
import { summarizeSamples, timingStatForJson } from '../lib/stats.mjs';

const ITER = parseInt(process.argv[2] || '8', 10);
const FORECAST_PASSES = 5;
const FORECAST_ITEMS = 7;
const FORECAST_UPDATES = FORECAST_PASSES * FORECAST_ITEMS + 1;
const TARGETS = process.env.TARGETS
	? JSON.parse(process.env.TARGETS)
	: [
			{ name: 'octane-tsrx', url: 'http://localhost:5292/' },
			{ name: 'react', url: 'http://localhost:5293/' },
		];

function assert(condition, message) {
	if (!condition) throw new Error(`weather-app verify failed: ${message}`);
}

async function installReadyObserver(context) {
	await context.addInitScript(() => {
		window.__weatherReady = new Promise((resolve, reject) => {
			let settled = false;
			const observer = new MutationObserver(check);
			const timeout = window.setTimeout(() => {
				finish(() => reject(new Error('weather app did not become ready within 10s')));
			}, 10_000);

			function finish(callback) {
				if (settled) return;
				settled = true;
				observer.disconnect();
				window.clearTimeout(timeout);
				callback();
			}

			function check() {
				const content = document.querySelector('[data-testid="weather-content"]');
				const loading = document.querySelector('[data-testid="loading"]');
				const location = document.querySelector('[data-testid="current-location"]');
				if (
					content &&
					!content.hidden &&
					loading?.hidden &&
					location?.textContent?.includes('London')
				) {
					// Window performance time is relative to this document's navigation
					// time origin, so this includes the complete cold navigation and boot.
					finish(() => resolve(performance.now()));
				}
			}

			observer.observe(document, {
				attributes: true,
				childList: true,
				characterData: true,
				subtree: true,
			});
			check();
		});
	});
}

async function openReadyPage(browser, target, pageErrors) {
	// Browser contexts isolate HTTP cache as well as storage. Every measured
	// navigation therefore starts cold without charging context creation itself.
	const context = await browser.newContext({
		timezoneId: 'UTC',
		viewport: { width: 1280, height: 900 },
	});
	await installReadyObserver(context);
	const page = await context.newPage();
	page.on('pageerror', (error) => pageErrors.push(error.message));
	try {
		await page.goto(`${target.url}?mock=true&benchmark=true`, { waitUntil: 'load' });
		const readyMs = await page.evaluate(() => window.__weatherReady);
		return { context, page, readyMs };
	} catch (error) {
		await context.close();
		throw error;
	}
}

async function verifyLoaded(page, expectedLocation, expectedCountry) {
	return await page.evaluate(
		({ locationName, countryName }) => {
			const fail = (message) => {
				throw new Error(`loaded state: ${message}`);
			};
			const expectedDisplayLocation = countryName
				? `${locationName}, ${countryName}`
				: locationName;
			const byTestId = (id) => document.querySelector(`[data-testid="${id}"]`);
			const content = byTestId('weather-content');
			const loading = byTestId('loading');
			const error = byTestId('error');
			const location = byTestId('current-location');
			const pressure = byTestId('pressure');
			const temperature = byTestId('current-temperature');
			const input = byTestId('search-input');

			if (!content || content.hidden) fail('weather content is not visible');
			if (!loading?.hidden) fail('loading state is still visible');
			if (!error?.hidden) fail('error state is visible');
			if (location?.textContent !== expectedDisplayLocation) {
				fail(`location is ${location?.textContent}, expected ${expectedDisplayLocation}`);
			}
			if (temperature?.textContent !== '16°C') fail(`temperature is ${temperature?.textContent}`);
			if (!/^\d+ hPa$/.test(pressure?.textContent || '')) {
				fail(`pressure is not finite: ${pressure?.textContent}`);
			}
			if (document.querySelectorAll('[data-testid="forecast-item"]').length !== 7) {
				fail('forecast does not contain seven items');
			}
			if (input?.value !== locationName) fail(`input is ${input?.value}, expected ${locationName}`);

			return {
				location: location.textContent,
				pressure: pressure.textContent,
				temperature: temperature.textContent,
			};
		},
		{ locationName: expectedLocation, countryName: expectedCountry },
	);
}

async function timeForecastCycle(page) {
	return await page.evaluate(
		async ({ passes, itemCount }) => {
			const waitFor = (predicate, label) =>
				new Promise((resolve, reject) => {
					let settled = false;
					const observer = new MutationObserver(check);
					const timeout = window.setTimeout(
						() => finish(() => reject(new Error(`timeout waiting for ${label}`))),
						5_000,
					);
					function finish(callback) {
						if (settled) return;
						settled = true;
						observer.disconnect();
						window.clearTimeout(timeout);
						callback();
					}
					function check() {
						if (predicate()) finish(resolve);
					}
					observer.observe(document, { attributes: true, childList: true, subtree: true });
					check();
				});

			const items = Array.from(document.querySelectorAll('[data-testid="forecast-item"]'));
			if (items.length !== itemCount) throw new Error(`expected ${itemCount} forecast items`);
			if (document.querySelector('.forecast-item.active'))
				throw new Error('forecast began expanded');

			const t0 = performance.now();
			for (let pass = 0; pass < passes; pass++) {
				for (let index = 0; index < items.length; index++) {
					items[index].click();
					await waitFor(() => {
						const active = document.querySelectorAll('.forecast-item.active');
						return (
							active.length === 1 &&
							active[0] === items[index] &&
							items[index].querySelectorAll('.forecast-item__details').length === 1
						);
					}, `forecast item ${index}`);
				}
			}
			items[items.length - 1].click();
			await waitFor(
				() => document.querySelectorAll('.forecast-item.active').length === 0,
				'forecast collapse',
			);
			const duration = performance.now() - t0;

			if (document.querySelector('.forecast-item__details')) {
				throw new Error('forecast details remained after collapse');
			}
			return duration;
		},
		{ passes: FORECAST_PASSES, itemCount: FORECAST_ITEMS },
	);
}

async function timeSearch(page, city, country, expectError = false) {
	return await page.evaluate(
		async ({ cityName, countryName, shouldError }) => {
			const waitFor = (predicate, label) =>
				new Promise((resolve, reject) => {
					let settled = false;
					const observer = new MutationObserver(check);
					const timeout = window.setTimeout(
						() => finish(() => reject(new Error(`timeout waiting for ${label}`))),
						5_000,
					);
					function finish(callback) {
						if (settled) return;
						settled = true;
						observer.disconnect();
						window.clearTimeout(timeout);
						callback();
					}
					function check() {
						if (predicate()) finish(resolve);
					}
					observer.observe(document, {
						attributes: true,
						childList: true,
						characterData: true,
						subtree: true,
					});
					check();
				});

			const input = document.querySelector('[data-testid="search-input"]');
			const form = document.querySelector('[data-testid="search-form"]');
			const content = document.querySelector('[data-testid="weather-content"]');
			const loading = document.querySelector('[data-testid="loading"]');
			const error = document.querySelector('[data-testid="error"]');
			if (!(input instanceof HTMLInputElement) || !(form instanceof HTMLFormElement)) {
				throw new Error('search controls are missing');
			}

			input.value = cityName;
			input.dispatchEvent(new InputEvent('input', { bubbles: true, data: cityName }));
			const t0 = performance.now();
			form.requestSubmit();

			if (shouldError) {
				await waitFor(
					() => Boolean(error && !error.hidden && loading?.hidden && content?.hidden),
					'visible weather error',
				);
			} else {
				await waitFor(() => {
					const location = document.querySelector('[data-testid="current-location"]');
					return Boolean(
						content &&
						!content.hidden &&
						loading?.hidden &&
						error?.hidden &&
						location?.textContent === `${cityName}, ${countryName}`,
					);
				}, `${cityName} weather`);
			}
			const duration = performance.now() - t0;

			if (shouldError) {
				const expectedMessage =
					'Unable to find location. Please check the city name and try again.';
				const actualMessage = error
					?.querySelector('.error__message')
					?.textContent?.replace(/\s+/g, ' ')
					.trim();
				if (actualMessage !== expectedMessage) {
					throw new Error(`unexpected error message: ${actualMessage}`);
				}
			} else if (localStorage.getItem('weather-app-location') !== cityName) {
				throw new Error(`successful city ${cityName} was not persisted`);
			}
			return duration;
		},
		{ cityName: city, countryName: country, shouldError: expectError },
	);
}

async function captureDomStates(page) {
	const semantic = () => {
		const root = document.querySelector('#main');
		if (!root) throw new Error('missing #main for semantic census');
		const normalize = (value) => (value || '').replace(/\s+/g, ' ').trim();
		const byTestId = (id) => document.querySelector(`[data-testid="${id}"]`);
		const testText = (id) => normalize(byTestId(id)?.textContent);
		const visibleText = normalize(root.innerText);
		const input = byTestId('search-input');
		const button = byTestId('search-button');
		const condition = byTestId('current-condition');
		const visibility = (id) => {
			const element = byTestId(id);
			return element instanceof HTMLElement ? !element.hidden : null;
		};
		const snapshotElement = (element) => ({
			tag: element.localName,
			attributes: Array.from(element.attributes)
				.map((attribute) => [
					attribute.name,
					attribute.name === 'class'
						? Array.from(element.classList).sort().join(' ')
						: attribute.value,
				])
				.sort(([left], [right]) => left.localeCompare(right)),
			directText: normalize(
				Array.from(element.childNodes)
					.filter((node) => node.nodeType === Node.TEXT_NODE)
					.map((node) => node.data)
					.join(''),
			),
			properties: {
				...(element instanceof HTMLInputElement ? { value: element.value } : {}),
				...(element instanceof HTMLButtonElement ? { disabled: element.disabled } : {}),
			},
			children: Array.from(element.children).map(snapshotElement),
		});
		const observable = {
			visibleText,
			elementTree: Array.from(root.children).map(snapshotElement),
			visibility: {
				loading: visibility('loading'),
				error: visibility('error'),
				weatherContent: visibility('weather-content'),
			},
			search: {
				value: input instanceof HTMLInputElement ? input.value : null,
				disabled: button instanceof HTMLButtonElement ? button.disabled : null,
			},
			current: {
				location: testText('current-location'),
				icon: testText('current-icon'),
				temperature: testText('current-temperature'),
				condition: testText('current-condition'),
				conditionClasses:
					condition instanceof HTMLElement ? Array.from(condition.classList).sort() : null,
				feelsLike: testText('feels-like'),
				humidity: testText('humidity'),
				windSpeed: testText('wind-speed'),
				pressure: testText('pressure'),
				cloudCover: testText('cloud-cover'),
				windDirection: testText('wind-direction'),
			},
			forecast: Array.from(document.querySelectorAll('[data-testid="forecast-item"]')).map(
				(item) => ({
					text: normalize(item.innerText),
					active: item.classList.contains('active'),
					role: item.getAttribute('role'),
					tabIndex: item instanceof HTMLElement ? item.tabIndex : null,
					ariaLabel: item.getAttribute('aria-label'),
				}),
			),
			footerLinks: Array.from(document.querySelectorAll('.footer__link')).map((link) => ({
				text: normalize(link.textContent),
				href: link instanceof HTMLAnchorElement ? link.href : null,
			})),
		};
		return {
			forecastItems: document.querySelectorAll('[data-testid="forecast-item"]').length,
			weatherDetails: document.querySelectorAll('.weather-detail').length,
			forecastDetails: document.querySelectorAll('.forecast-detail-item').length,
			footerLinks: document.querySelectorAll('.footer__link').length,
			visibleChars: visibleText.length,
			observable,
		};
	};

	const collapsed = {
		dom: await page.evaluate(censusDomNodes, '#main'),
		semantic: await page.evaluate(semantic),
	};
	assert(collapsed.semantic.forecastItems === 7, 'collapsed forecast item count');
	assert(collapsed.semantic.weatherDetails === 6, 'collapsed weather detail count');
	assert(collapsed.semantic.forecastDetails === 0, 'collapsed forecast details are mounted');
	assert(collapsed.semantic.footerLinks === 2, 'footer attribution links');

	await page.evaluate(async () => {
		const first = document.querySelector('[data-testid="forecast-item"]');
		if (!first) throw new Error('missing first forecast item');
		first.click();
		await new Promise((resolve, reject) => {
			const observer = new MutationObserver(check);
			const timeout = window.setTimeout(() => {
				observer.disconnect();
				reject(new Error('forecast did not expand'));
			}, 5_000);
			function check() {
				if (first.classList.contains('active') && first.querySelector('.forecast-item__details')) {
					observer.disconnect();
					window.clearTimeout(timeout);
					resolve();
				}
			}
			observer.observe(first, { attributes: true, childList: true, subtree: true });
			check();
		});
	});

	const expanded = {
		dom: await page.evaluate(censusDomNodes, '#main'),
		semantic: await page.evaluate(semantic),
	};
	assert(expanded.semantic.forecastItems === 7, 'expanded forecast item count');
	assert(expanded.semantic.weatherDetails === 6, 'expanded weather detail count');
	assert(expanded.semantic.forecastDetails === 6, 'expanded forecast detail count');

	// Exercise the upstream keyboard contract while returning the sample to its
	// collapsed state. This is an untimed correctness observation.
	await page.evaluate(async () => {
		const first = document.querySelector('[data-testid="forecast-item"]');
		first.dispatchEvent(
			new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }),
		);
		await new Promise((resolve, reject) => {
			const observer = new MutationObserver(check);
			const timeout = window.setTimeout(() => {
				observer.disconnect();
				reject(new Error('keyboard activation did not collapse forecast'));
			}, 5_000);
			function check() {
				if (!document.querySelector('.forecast-item.active')) {
					observer.disconnect();
					window.clearTimeout(timeout);
					resolve();
				}
			}
			observer.observe(document, { attributes: true, childList: true, subtree: true });
			check();
		});
	});

	return { collapsed, expanded };
}

async function runScenario(page, readyMs) {
	await verifyLoaded(page, 'London', 'United Kingdom');
	const forecastCycle = await timeForecastCycle(page);
	const searchCity = await timeSearch(page, 'Tokyo', 'Japan');
	await verifyLoaded(page, 'Tokyo', 'Japan');
	const searchError = await timeSearch(page, 'InvalidCity123', '', true);
	const searchRecover = await timeSearch(page, 'Paris', 'France');
	await verifyLoaded(page, 'Paris', 'France');
	const dom = await captureDomStates(page);
	return { readyMs, forecastCycle, searchCity, searchError, searchRecover, dom };
}

function constantMetric(samples, read, label) {
	const values = samples.map(read);
	const unique = new Set(values);
	assert(unique.size === 1, `${label} varied across samples: ${values.join(', ')}`);
	return deterministicCount(values[0]);
}

function assertConstantSnapshot(samples, read, label) {
	const values = samples.map((sample) => JSON.stringify(read(sample)));
	assert(new Set(values).size === 1, `${label} varied across samples`);
}

async function runTarget(target) {
	const browser = await chromium.launch({
		headless: true,
		args: ['--disable-extensions', '--js-flags=--expose-gc'],
	});
	const pageErrors = [];

	try {
		// Warm the browser process and preview server in a throwaway context. Sample
		// contexts remain isolated, so their asset and mock fetches are still cold.
		const warmup = await openReadyPage(browser, target, pageErrors);
		try {
			await runScenario(warmup.page, warmup.readyMs);
		} finally {
			await warmup.context.close();
		}

		const samples = [];
		for (let index = 0; index < ITER; index++) {
			const sample = await openReadyPage(browser, target, pageErrors);
			try {
				samples.push(await runScenario(sample.page, sample.readyMs));
			} finally {
				await sample.context.close();
			}
		}

		assert(pageErrors.length === 0, `uncaught page errors: ${pageErrors.join('; ')}`);
		const summarize = (read) =>
			timingStatForJson(summarizeSamples(samples.map(read), { scoreMode: 'mean' }));
		const collapsed = (sample) => sample.dom.collapsed;
		const expanded = (sample) => sample.dom.expanded;
		assertConstantSnapshot(
			samples,
			(sample) => collapsed(sample).semantic.observable,
			'collapsed observable snapshot',
		);
		assertConstantSnapshot(
			samples,
			(sample) => expanded(sample).semantic.observable,
			'expanded observable snapshot',
		);

		return {
			name: target.name,
			ops: {
				initial_ready: summarize((sample) => sample.readyMs),
				forecast_cycle: summarize((sample) => sample.forecastCycle),
				search_city: summarize((sample) => sample.searchCity),
				search_error: summarize((sample) => sample.searchError),
				search_recover: summarize((sample) => sample.searchRecover),
				nodes_loaded: constantMetric(
					samples,
					(sample) => collapsed(sample).dom.total,
					'nodes_loaded',
				),
				elements_loaded: constantMetric(
					samples,
					(sample) => collapsed(sample).dom.elements,
					'elements_loaded',
				),
				text_loaded: constantMetric(samples, (sample) => collapsed(sample).dom.text, 'text_loaded'),
				comments_loaded: constantMetric(
					samples,
					(sample) => collapsed(sample).dom.comments,
					'comments_loaded',
				),
				nodes_expanded: constantMetric(
					samples,
					(sample) => expanded(sample).dom.total,
					'nodes_expanded',
				),
				elements_expanded: constantMetric(
					samples,
					(sample) => expanded(sample).dom.elements,
					'elements_expanded',
				),
				text_expanded: constantMetric(
					samples,
					(sample) => expanded(sample).dom.text,
					'text_expanded',
				),
				comments_expanded: constantMetric(
					samples,
					(sample) => expanded(sample).dom.comments,
					'comments_expanded',
				),
				visible_chars_loaded: constantMetric(
					samples,
					(sample) => collapsed(sample).semantic.visibleChars,
					'visible_chars_loaded',
				),
				visible_chars_expanded: constantMetric(
					samples,
					(sample) => expanded(sample).semantic.visibleChars,
					'visible_chars_expanded',
				),
				forecast_items: deterministicCount(FORECAST_ITEMS),
				weather_details: deterministicCount(6),
				forecast_details_expanded: deterministicCount(6),
			},
			meta: {
				gate: 'passed',
				forecastUpdates: FORECAST_UPDATES,
				mockMode: true,
				upstreamCommit: 'd3f0dcd07c9223c4847baddf9bfa49f060adf24a',
				dom: samples[0].dom,
			},
		};
	} finally {
		await browser.close();
	}
}

const targetResults = [];
const failures = [];
for (const target of TARGETS) {
	console.error(`Running ${target.name} (${target.url}) × ${ITER}…`);
	try {
		targetResults.push(await runTarget(target));
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		failures.push(`${target.name}: ${message}`);
		targetResults.push({ name: target.name, ops: {}, meta: { gate: 'failed', error: message } });
	}
}

const octaneResult = targetResults.find((target) => target.name === 'octane-tsrx');
const reactResult = targetResults.find((target) => target.name === 'react');
if (octaneResult?.meta.gate === 'passed' && reactResult?.meta.gate === 'passed') {
	for (const operation of [
		'elements_loaded',
		'elements_expanded',
		'visible_chars_loaded',
		'visible_chars_expanded',
		'forecast_items',
		'weather_details',
		'forecast_details_expanded',
	]) {
		const octaneValue = octaneResult.ops[operation].median;
		const reactValue = reactResult.ops[operation].median;
		if (octaneValue !== reactValue) {
			failures.push(
				`semantic parity: ${operation} differs (${octaneValue} Octane vs ${reactValue} React)`,
			);
		}
	}
	for (const state of ['collapsed', 'expanded']) {
		const octaneSnapshot = octaneResult.meta.dom[state].semantic.observable;
		const reactSnapshot = reactResult.meta.dom[state].semantic.observable;
		if (JSON.stringify(octaneSnapshot) !== JSON.stringify(reactSnapshot)) {
			failures.push(`semantic parity: ${state} observable snapshot differs`);
		}
	}
}

console.log();
const operationWidth = 28;
console.log(
	'Op'.padEnd(operationWidth) + '| ' + TARGETS.map((target) => target.name.padEnd(24)).join('| '),
);
console.log('-'.repeat(operationWidth) + '+-' + TARGETS.map(() => '-'.repeat(24)).join('+-'));
for (const operation of [
	'initial_ready',
	'forecast_cycle',
	'search_city',
	'search_error',
	'search_recover',
	'nodes_loaded',
	'elements_loaded',
	'text_loaded',
	'comments_loaded',
	'nodes_expanded',
	'elements_expanded',
	'text_expanded',
	'comments_expanded',
	'visible_chars_loaded',
	'visible_chars_expanded',
]) {
	const cells = targetResults.map((target) => {
		const result = target.ops[operation];
		if (!result) return 'failed'.padEnd(24);
		const value = result.score ?? result.median;
		const suffix =
			operation.includes('ready') || operation.includes('cycle') || operation.startsWith('search_')
				? 'ms'
				: '';
		return `${Number(value).toFixed(suffix ? 2 : 0)}${suffix}`.padEnd(24);
	});
	console.log(operation.padEnd(operationWidth) + '| ' + cells.join('| '));
}

const payload = {
	suite: 'weather-app',
	iterations: ITER,
	targets: targetResults,
	...(failures.length === 0 ? {} : { failed: failures.join('; ') }),
};
if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(payload, null, '\t') + '\n');
	console.error(`BENCH_JSON written to ${process.env.BENCH_JSON}`);
}
if (failures.length > 0) {
	console.error(failures.join('\n'));
	process.exitCode = 1;
}
