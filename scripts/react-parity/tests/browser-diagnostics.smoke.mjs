// Invoked explicitly in Chromium CI; the Node-only tooling suite needs no browser.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

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

for (const prematureClose of [false, true]) {
	test(
		`Vitest diagnostics preserve ${prematureClose ? 'premature page-close failure' : 'successful tests and normal teardown'}`,
		{ timeout: 60000 },
		async (t) => {
			const directory = temporary(t);
			const server = createServer();
			server.on('upgrade', (_request, socket) =>
				socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'),
			);
			await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
			t.after(() => new Promise((resolveClose) => server.close(resolveClose)));
			const socketUrl = `ws://127.0.0.1:${server.address().port}/socket?token=private-smoke-secret`;
			const fixture = join(directory, 'fixture.test.js');
			writeFileSync(
				fixture,
				`import { test, expect } from 'vitest';
test('browser fixture', async () => {
  await new Promise(resolve => { const socket = new WebSocket(${JSON.stringify(socketUrl)}); socket.onerror = () => resolve(); });
  expect(document.body).toBeTruthy();
});\n`,
			);
			const reporterPath = join(directory, 'fault-reporter.mjs');
			writeFileSync(
				reporterPath,
				`export default class {
  onTestModuleStart(module) {
    if (${prematureClose}) return Promise.all([...module.project.browser.provider.pages.values()].map(page => page.close()));
  }
}\n`,
			);
			const config = join(directory, 'vitest.config.mjs');
			const observer = pathToFileURL(
				join(repo, 'scripts/react-parity/browser-lifecycle-diagnostics.mjs'),
			).href;
			writeFileSync(
				config,
				`import { playwright } from '@vitest/browser-playwright';
import { withBrowserLifecycleDiagnostics } from ${JSON.stringify(observer)};
export default withBrowserLifecycleDiagnostics({ test: { include: [${JSON.stringify(fixture)}], reporters: ['default', ${JSON.stringify(reporterPath)}], browser: { enabled: true, headless: true, provider: playwright(), instances: [{ browser: 'chromium' }] } } });\n`,
			);
			const result = await new Promise((resolveChild, reject) => {
				const child = spawn(
					process.execPath,
					['node_modules/vitest/vitest.mjs', 'run', '--config', config],
					{
						cwd: repo,
						env: {
							...process.env,
							OCTANE_BROWSER_DIAGNOSTICS_DIR: directory,
							REACT_PARITY_BROWSER_DIAGNOSTICS: '1',
						},
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
				trace.some((event) => event.event === 'observation-ready'),
				result.output,
			);
			assert.ok(
				!trace.some((event) => event.event.endsWith('observation-failed')),
				JSON.stringify(trace),
			);
			const close = trace.findIndex((event) => event.event === 'page-close');
			const teardown = trace.findIndex((event) => event.event === 'provider-close-start');
			assert.ok(close >= 0 && teardown >= 0, JSON.stringify(trace));
			assert.equal(close < teardown, prematureClose, JSON.stringify(trace));
			if (!prematureClose) {
				assert.ok(
					trace.some(
						(event) =>
							event.event === 'websocket-frame-error' &&
							event.category === 'other' &&
							event.url.endsWith('/socket'),
					),
					JSON.stringify(trace),
				);
			}
			assert.ok(!JSON.stringify(trace).includes('private-smoke-secret'));
		},
	);
}
