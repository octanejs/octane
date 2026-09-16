// Invoked explicitly in the Chromium CI job; the Node-only tooling suite needs no browser.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { chromium } from 'playwright';
import BrowserLifecycleReporter from '../browser-lifecycle-reporter.mjs';

const repo = resolve(import.meta.dirname, '../../..');
function temporary(t) {
	// Keep fixture resolution in this repository's dependency tree.
	const directory = mkdtempSync(join(repo, '.browser-diagnostics-smoke-'));
	t.after(() => rmSync(directory, { recursive: true, force: true }));
	return directory;
}
function events(directory) {
	return readFileSync(join(directory, 'browser-events.jsonl'), 'utf8')
		.trim()
		.split('\n')
		.map(JSON.parse);
}

test(
	'Chromium transport errors retain error text without socket secrets',
	{ timeout: 30000 },
	async (t) => {
		const directory = temporary(t);
		const server = createServer();
		server.on('upgrade', (_request, socket) =>
			socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'),
		);
		await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
		t.after(() => new Promise((resolveClose) => server.close(resolveClose)));
		const browser = await chromium.launch({ headless: true });
		t.after(() => browser.close());
		const page = await browser.newPage();
		const reporter = new BrowserLifecycleReporter({ directory });
		reporter.observePage(page, 'transport-smoke');
		await page.evaluate(
			(url) =>
				new Promise((resolveError) => {
					const socket = new WebSocket(url);
					socket.onerror = () => resolveError();
				}),
			`ws://127.0.0.1:${server.address().port}/socket?token=private-smoke-secret`,
		);
		await page.close();
		await browser.close();
		const trace = events(directory);
		assert.ok(
			trace.some(
				(event) => event.event === 'websocket-error' && /403|handshake/i.test(event.error),
			),
		);
		assert.ok(trace.some((event) => event.event === 'page-close' && !event.finished));
		assert.ok(trace.some((event) => event.event === 'browser-disconnected'));
		assert.ok(!JSON.stringify(trace).includes('private-smoke-secret'));
	},
);

for (const prematureClose of [false, true]) {
	test(
		`Vitest preserves ${prematureClose ? 'premature page-close failure' : 'successful tests and normal teardown'}`,
		{ timeout: 60000 },
		async (t) => {
			const directory = temporary(t);
			const fixture = join(directory, 'fixture.test.js');
			writeFileSync(
				fixture,
				`import { test, expect } from 'vitest';\ntest('browser fixture', async () => { await new Promise(resolve => setTimeout(resolve, 200)); expect(document.body).toBeTruthy(); });\n`,
			);
			const reporterPath = join(directory, 'reporter.mjs');
			writeFileSync(
				reporterPath,
				`import Reporter from ${JSON.stringify(pathToFileURL(join(repo, 'scripts/react-parity/browser-lifecycle-reporter.mjs')).href)};
export default class extends Reporter {
  onTestModuleStart(module) {
    if (${prematureClose}) return Promise.all([...module.project.browser.provider.pages.values()].map(page => page.close()));
  }
}\n`,
			);
			const config = join(directory, 'vitest.config.mjs');
			writeFileSync(
				config,
				`import { playwright } from '@vitest/browser-playwright';
export default { test: { include: [${JSON.stringify(fixture)}], reporters: ['default', ${JSON.stringify(reporterPath)}], browser: { enabled: true, headless: true, provider: playwright(), instances: [{ browser: 'chromium' }] } } };\n`,
			);
			const result = await new Promise((resolveChild, reject) => {
				const child = spawn(
					process.execPath,
					['node_modules/vitest/vitest.mjs', 'run', '--config', config],
					{
						cwd: repo,
						env: { ...process.env, OCTANE_BROWSER_DIAGNOSTICS_DIR: directory },
						stdio: ['ignore', 'pipe', 'pipe'],
						timeout: 45000,
					},
				);
				let output = '';
				child.stdout.on('data', (data) => (output += data));
				child.stderr.on('data', (data) => (output += data));
				child.once('error', reject);
				child.once('close', (code, signal) => resolveChild({ code, signal, output }));
			});
			assert.equal(result.signal, null, result.output);
			assert.equal(result.code, prematureClose ? 1 : 0, result.output);
			const trace = events(directory);
			assert.ok(
				trace.some((event) => event.event === 'websocket-open'),
				result.output,
			);
			assert.ok(trace.some((event) => event.event === 'main-frame-navigation'));
			assert.ok(
				!trace.some((event) => /observer-(error|unavailable)/.test(event.event)),
				JSON.stringify(trace),
			);
			const close = trace.find((event) => event.event === 'page-close');
			assert.ok(close, JSON.stringify(trace));
			assert.equal(close.finished, !prematureClose, JSON.stringify(trace));
			assert.ok(trace.some((event) => event.event === 'provider-close-called'));
			assert.ok(
				trace.some(
					(event) =>
						event.event === 'run-end' &&
						(prematureClose ? event.errorCount > 0 : event.errorCount === 0),
				),
			);
		},
	);
}
