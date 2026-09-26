import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import path from 'node:path';

const REPO = path.resolve(import.meta.dirname, '../..');
const require = createRequire(path.join(REPO, 'package.json'));
const argument = process.argv.find((value) => value.startsWith('--build-dir='));
assert.ok(argument, 'Pass --build-dir=/absolute/output from run.mjs');
const directory = path.resolve(argument.slice('--build-dir='.length));
const report = JSON.parse(fs.readFileSync(path.join(directory, 'report.json'), 'utf8'));
assert.equal(report.output, directory, 'Use the recorded build directory');
assert.ok(report.variants.some((variant) => variant.variant === 'baseline'));
assert.ok(report.variants.some((variant) => variant.variant === 'candidate'));
const { chromium } = require('playwright');
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
const browser = await chromium.launch({
	headless: true,
	...(executablePath ? { executablePath } : {}),
});
const snapshots = [];
try {
	for (const variant of report.variants) {
		for (const [file, expected] of Object.entries({ ...variant.files, ...variant.css })) {
			const actual = createHash('sha256')
				.update(fs.readFileSync(path.join(variant.clientDir, file)))
				.digest('hex');
			assert.equal(actual, expected.sha256, `Client asset changed: ${file}`);
		}
		const server = createServer((request, response) => {
			const url = new URL(request.url, 'http://localhost');
			if (url.pathname === '/') {
				response.writeHead(200, {
					'Content-Type': 'text/html; charset=utf-8',
					'Cache-Control': 'no-store',
				});
				response.end(variant.document);
				return;
			}
			if (url.pathname === '/favicon.ico') {
				response.writeHead(204).end();
				return;
			}
			const file = url.pathname.slice(1);
			if (Object.hasOwn(variant.files, file) || Object.hasOwn(variant.css, file)) {
				response.writeHead(200, {
					'Content-Type': file.endsWith('.css') ? 'text/css' : 'text/javascript',
					'Cache-Control': 'no-store',
				});
				response.end(fs.readFileSync(path.join(variant.clientDir, file)));
				return;
			}
			response.writeHead(404).end();
		});
		server.listen(0, '127.0.0.1');
		await once(server, 'listening');
		const context = await browser.newContext();
		try {
			const page = await context.newPage();
			const errors = [];
			const requests = [];
			page.on('pageerror', (error) => errors.push(String(error)));
			page.on('console', (message) => {
				if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text());
			});
			page.on('request', (request) => requests.push(new URL(request.url()).pathname));
			page.on('requestfailed', (request) =>
				errors.push(`${request.url()}: ${request.failure()?.errorText}`),
			);
			let releaseEntry;
			let entryRequested;
			const entryGate = new Promise((resolve) => {
				releaseEntry = resolve;
			});
			const entryWait = new Promise((resolve) => {
				entryRequested = resolve;
			});
			await page.route('**/entry.js', async (route) => {
				entryRequested();
				await entryGate;
				await route.continue();
			});
			const url = `http://127.0.0.1:${server.address().port}/`;
			await page.goto(url, { waitUntil: 'commit' });
			await page.locator('[data-increment]').waitFor();
			await entryWait;
			await page.evaluate(() => {
				window.__beforeShell = document.querySelector('[data-shell]');
				window.__beforeButton = document.querySelector('[data-increment]');
				window.__beforeValue = document.querySelector('[data-counter-value]');
				window.__beforeSibling = document.querySelector('[data-static-sibling]');
				window.__beforeButton.focus();
			});
			releaseEntry();
			await page.waitForFunction(() => document.documentElement.dataset.shellReady === 'true');
			const adopted = await page.evaluate(() => ({
				shell: window.__beforeShell === document.querySelector('[data-shell]'),
				button: window.__beforeButton === document.querySelector('[data-increment]'),
				value: window.__beforeValue === document.querySelector('[data-counter-value]'),
				sibling: window.__beforeSibling === document.querySelector('[data-static-sibling]'),
				focus: document.activeElement === window.__beforeButton,
			}));
			assert.deepEqual(adopted, {
				shell: true,
				button: true,
				value: true,
				sibling: true,
				focus: true,
			});
			for (const expected of ['1', '2']) {
				await page.locator('[data-increment]').click();
				await page.waitForFunction(
					(value) => document.querySelector('[data-counter-value]').textContent === value,
					expected,
				);
			}
			const snapshot = await page.evaluate(() => ({
				heading: document.querySelector('h1').textContent,
				summary: document.querySelector('[data-shell-summary]').textContent,
				label: document.querySelector('[data-counter-label]').textContent,
				value: document.querySelector('[data-counter-value]').textContent,
				siblingText: document.querySelector('[data-static-sibling]').textContent,
				sharedLoads: window.__shellSharedLoads,
				shellOnlyEffectLoads: window.__shellOnlyEffectLoads ?? 0,
				effectOrder: window.__shellEffectOrder,
				shellColor: getComputedStyle(document.querySelector('[data-shell]')).color,
				counterBorder: getComputedStyle(document.querySelector('[data-counter]')).borderTopWidth,
				shellIdentity: window.__beforeShell === document.querySelector('[data-shell]'),
				buttonIdentity: window.__beforeButton === document.querySelector('[data-increment]'),
				valueIdentity: window.__beforeValue === document.querySelector('[data-counter-value]'),
				siblingIdentity: window.__beforeSibling === document.querySelector('[data-static-sibling]'),
			}));
			assert.deepEqual(snapshot, {
				heading: 'A server-authored page with a live child',
				summary: 'A server-authored introduction for Ada.',
				label: 'Shared: counter',
				value: '2',
				siblingText: 'Static sibling after the live child',
				sharedLoads: 1,
				shellOnlyEffectLoads: variant.negativeControl ? 0 : 1,
				effectOrder: variant.negativeControl ? ['shared'] : ['shared', 'shell'],
				shellColor: 'rgb(24, 40, 56)',
				counterBorder: '2px',
				shellIdentity: true,
				buttonIdentity: true,
				valueIdentity: true,
				siblingIdentity: true,
			});
			assert.deepEqual(errors, [], `${variant.variant} hydration/browser errors`);
			const laterChunks = Object.entries(variant.contributions)
				.filter(([, chunk]) =>
					Object.entries(chunk.modules).some(
						([file, info]) => file.endsWith('/later.ts') && info.renderedLength > 0,
					),
				)
				.map(([file]) => '/' + file);
			assert.ok(
				laterChunks.some((file) => requests.includes(file)),
				'The dynamic dependency must actually load',
			);
			snapshots.push({ variant: variant.variant, adopted, snapshot, requests });
		} finally {
			await context.close();
			await new Promise((resolve, reject) =>
				server.close((error) => (error ? reject(error) : resolve())),
			);
		}
	}
} finally {
	await browser.close();
}
const baseline = snapshots.find((snapshot) => snapshot.variant === 'baseline');
for (const snapshot of snapshots) {
	if (snapshot.variant === 'drop-effect') continue;
	assert.deepEqual(
		snapshot.snapshot,
		baseline.snapshot,
		`${snapshot.variant} must do the same visible work`,
	);
}
const result = { browser: browser.version(), snapshots };
fs.writeFileSync(path.join(directory, 'browser.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
