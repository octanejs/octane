// Deterministic production bundle and DOM-work gate for the Octane weather app.
// Internal comment budgets are meaningful only alongside the visible app,
// interaction, DOM-identity, persistence, and same-origin request controls.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { constants, gzipSync } from 'node:zlib';
import { chromium } from 'playwright';
import { censusDomNodes } from '../lib/dom-nodes.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = process.env.WEATHER_DIST || path.join(ROOT, 'octane-tsrx', 'dist');
const TARGET = new URL(process.env.TARGET_URL || 'http://localhost:5292/');
TARGET.searchParams.set('mock', 'true');
TARGET.searchParams.set('benchmark', 'true');

const MAX_GZIP_BYTES = 30_000;
const MAX_COMMENTS = 18;
const ELEMENTS = { loaded: 116, expanded: 135 };

function assert(condition, message) {
	if (!condition) throw new Error(`weather-app-work verify failed: ${message}`);
}

function javascriptFiles(directory) {
	const entries = fs.readdirSync(directory, { withFileTypes: true });
	return entries.flatMap((entry) => {
		const filename = path.join(directory, entry.name);
		if (entry.isDirectory()) return javascriptFiles(filename);
		return /\.(?:m?js)$/.test(entry.name) ? [filename] : [];
	});
}

const files = javascriptFiles(DIST);
assert(files.length > 0, `no production JavaScript in ${DIST}; build the Octane app first`);
const bundles = files.map((filename) => {
	const contents = fs.readFileSync(filename);
	return {
		file: path.relative(DIST, filename),
		rawBytes: contents.length,
		gzipBytes: gzipSync(contents, { level: constants.Z_BEST_COMPRESSION }).length,
	};
});
const javascript = {
	files: bundles,
	rawBytes: bundles.reduce((total, bundle) => total + bundle.rawBytes, 0),
	gzipBytes: bundles.reduce((total, bundle) => total + bundle.gzipBytes, 0),
};

const browser = await chromium.launch({ headless: true });
const pageErrors = [];
const externalRequests = [];
const mockRequests = [];
let results;

try {
	const context = await browser.newContext({ locale: 'en-US', timezoneId: 'UTC' });
	const page = await context.newPage();
	page.on('pageerror', (error) => pageErrors.push(error.message));
	page.on('request', (request) => {
		const url = new URL(request.url());
		if (url.origin !== TARGET.origin) externalRequests.push(url.href);
		if (url.pathname === '/mocks/weather-data.json') mockRequests.push(url.href);
	});
	await page.goto(TARGET.href, { waitUntil: 'load' });
	await page.waitForFunction(() => {
		const content = document.querySelector('[data-testid="weather-content"]');
		const loading = document.querySelector('[data-testid="loading"]');
		const location = document.querySelector('[data-testid="current-location"]');
		return Boolean(
			content &&
			!content.hidden &&
			loading?.hidden &&
			location?.textContent === 'London, United Kingdom',
		);
	});

	const loaded = await page.evaluate(censusDomNodes, '#main');
	const initial = await page.evaluate(() => ({
		location: document.querySelector('[data-testid="current-location"]')?.textContent,
		temperature: document.querySelector('[data-testid="current-temperature"]')?.textContent,
		pressure: document.querySelector('[data-testid="pressure"]')?.textContent,
		forecastItems: document.querySelectorAll('[data-testid="forecast-item"]').length,
		search: document.querySelector('[data-testid="search-input"]')?.value,
	}));
	assert(initial.location === 'London, United Kingdom', `initial location is ${initial.location}`);
	assert(initial.temperature === '16°C', `initial temperature is ${initial.temperature}`);
	assert(initial.pressure === '1015 hPa', `initial pressure is ${initial.pressure}`);
	assert(initial.forecastItems === 7, `initial forecast contains ${initial.forecastItems} rows`);
	assert(initial.search === 'London', `initial search input is ${initial.search}`);
	assert(loaded.elements === ELEMENTS.loaded, `loaded element count is ${loaded.elements}`);

	const expansion = await page.evaluate(async () => {
		const rows = Array.from(document.querySelectorAll('[data-testid="forecast-item"]'));
		const first = rows[0];
		first.click();
		await new Promise((resolve, reject) => {
			const observer = new MutationObserver(check);
			const timeout = window.setTimeout(() => {
				observer.disconnect();
				reject(new Error('forecast did not expand'));
			}, 5_000);
			function check() {
				if (
					!first.classList.contains('active') ||
					!first.querySelector('.forecast-item__details')
				) {
					return;
				}
				observer.disconnect();
				window.clearTimeout(timeout);
				resolve();
			}
			observer.observe(first, { attributes: true, childList: true, subtree: true });
			check();
		});
		const currentRows = Array.from(document.querySelectorAll('[data-testid="forecast-item"]'));
		return {
			forecastItems: currentRows.length,
			preservedRows: currentRows.every((row, index) => row === rows[index]),
			details: document.querySelectorAll('.forecast-detail-item').length,
			activeRows: document.querySelectorAll('.forecast-item.active').length,
		};
	});
	assert(expansion.forecastItems === 7, 'forecast expansion changed the row count');
	assert(expansion.preservedRows, 'forecast expansion replaced an existing row');
	assert(expansion.details === 6, `forecast expansion contains ${expansion.details} details`);
	assert(expansion.activeRows === 1, `forecast expansion selected ${expansion.activeRows} rows`);
	const expanded = await page.evaluate(censusDomNodes, '#main');
	assert(expanded.elements === ELEMENTS.expanded, `expanded element count is ${expanded.elements}`);

	await page.locator('[data-testid="forecast-item"]').first().click();
	await page.waitForFunction(
		() => document.querySelectorAll('.forecast-item.active, .forecast-item__details').length === 0,
	);

	await page.evaluate(() => {
		const input = document.querySelector('[data-testid="search-input"]');
		const form = document.querySelector('[data-testid="search-form"]');
		if (!(input instanceof HTMLInputElement) || !(form instanceof HTMLFormElement)) {
			throw new Error('search controls are missing');
		}
		input.value = 'Tokyo';
		input.dispatchEvent(new InputEvent('input', { bubbles: true, data: 'Tokyo' }));
		form.requestSubmit();
	});
	await page.waitForFunction(() => {
		const content = document.querySelector('[data-testid="weather-content"]');
		const loading = document.querySelector('[data-testid="loading"]');
		const location = document.querySelector('[data-testid="current-location"]');
		return Boolean(
			content && !content.hidden && loading?.hidden && location?.textContent === 'Tokyo, Japan',
		);
	});
	const searched = await page.evaluate(() => ({
		location: document.querySelector('[data-testid="current-location"]')?.textContent,
		storedLocation: localStorage.getItem('weather-app-location'),
		forecastItems: document.querySelectorAll('[data-testid="forecast-item"]').length,
		temperature: document.querySelector('[data-testid="current-temperature"]')?.textContent,
		pressure: document.querySelector('[data-testid="pressure"]')?.textContent,
	}));
	assert(searched.location === 'Tokyo, Japan', `searched location is ${searched.location}`);
	assert(searched.storedLocation === 'Tokyo', 'successful search was not persisted');
	assert(searched.forecastItems === 7, 'successful search changed the forecast row count');
	assert(searched.temperature === '16°C', `searched temperature is ${searched.temperature}`);
	assert(searched.pressure === '1015 hPa', `searched pressure is ${searched.pressure}`);

	await page.locator('[data-testid="search-input"]').fill('Invalid 123');
	await page.locator('[data-testid="search-form"]').evaluate((form) => form.requestSubmit());
	await page.waitForFunction(() => {
		const error = document.querySelector('[data-testid="error"]');
		const content = document.querySelector('[data-testid="weather-content"]');
		const loading = document.querySelector('[data-testid="loading"]');
		return Boolean(error && !error.hidden && content?.hidden && loading?.hidden);
	});
	const rejected = await page.evaluate(() => ({
		message: document
			.querySelector('[data-testid="error"] .error__message')
			?.textContent?.replace(/\s+/g, ' ')
			.trim(),
		storedLocation: localStorage.getItem('weather-app-location'),
	}));
	assert(
		rejected.message === 'Unable to find location. Please check the city name and try again.',
		`invalid-city error is ${rejected.message}`,
	);
	assert(rejected.storedLocation === 'Tokyo', 'failed search overwrote the last successful city');

	await page.locator('[data-testid="search-input"]').fill('Paris');
	await page.locator('[data-testid="search-form"]').evaluate((form) => form.requestSubmit());
	await page.waitForFunction(() => {
		const content = document.querySelector('[data-testid="weather-content"]');
		const error = document.querySelector('[data-testid="error"]');
		const loading = document.querySelector('[data-testid="loading"]');
		const location = document.querySelector('[data-testid="current-location"]');
		return Boolean(
			content &&
			!content.hidden &&
			error?.hidden &&
			loading?.hidden &&
			location?.textContent === 'Paris, France',
		);
	});
	const recovered = await page.evaluate(() => ({
		location: document.querySelector('[data-testid="current-location"]')?.textContent,
		storedLocation: localStorage.getItem('weather-app-location'),
		forecastItems: document.querySelectorAll('[data-testid="forecast-item"]').length,
		temperature: document.querySelector('[data-testid="current-temperature"]')?.textContent,
		pressure: document.querySelector('[data-testid="pressure"]')?.textContent,
	}));
	assert(recovered.location === 'Paris, France', `recovered location is ${recovered.location}`);
	assert(recovered.storedLocation === 'Paris', 'recovered search was not persisted');
	assert(recovered.forecastItems === 7, 'recovered search changed the forecast row count');
	assert(recovered.temperature === '16°C', `recovered temperature is ${recovered.temperature}`);
	assert(recovered.pressure === '1015 hPa', `recovered pressure is ${recovered.pressure}`);
	assert(
		mockRequests.length === 3,
		`expected three local mock requests, received ${mockRequests.length}`,
	);
	assert(externalRequests.length === 0, `external requests: ${externalRequests.join(', ')}`);
	assert(pageErrors.length === 0, `uncaught page errors: ${pageErrors.join('; ')}`);

	results = { initial, loaded, expansion, expanded, searched, rejected, recovered, javascript };
} finally {
	await browser.close();
}

const failures = [];
if (results.loaded.comments > MAX_COMMENTS) {
	failures.push(`loaded comments: ${results.loaded.comments} exceeds ${MAX_COMMENTS}`);
}
if (results.expanded.comments > MAX_COMMENTS) {
	failures.push(`expanded comments: ${results.expanded.comments} exceeds ${MAX_COMMENTS}`);
}
if (javascript.gzipBytes > MAX_GZIP_BYTES) {
	failures.push(`production JavaScript gzip: ${javascript.gzipBytes} exceeds ${MAX_GZIP_BYTES}`);
}

console.log(`Loaded DOM: ${results.loaded.total} nodes, ${results.loaded.comments} comments`);
console.log(`Expanded DOM: ${results.expanded.total} nodes, ${results.expanded.comments} comments`);
console.log(
	`Production JavaScript: ${javascript.rawBytes} raw, ${javascript.gzipBytes} gzip bytes`,
);

if (process.env.WORK_JSON) {
	fs.writeFileSync(
		process.env.WORK_JSON,
		JSON.stringify(
			{ suite: 'weather-app-work', target: TARGET.href, results, failures },
			null,
			'\t',
		) + '\n',
	);
}
if (failures.length > 0) {
	console.error(failures.join('\n'));
	process.exitCode = 1;
}
