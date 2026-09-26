import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const here = import.meta.dirname;
const repo = path.resolve(here, '../../..');
const require = createRequire(path.join(repo, 'packages/octane/package.json'));
const { build } = await import(pathToFileURL(require.resolve('esbuild')).href);
const { chromium } = require('playwright');
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
assert.ok(executablePath, 'Set PLAYWRIGHT_EXECUTABLE_PATH to the authorized browser');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-async-intents-'));
const compiled = await build({
	absWorkingDir: repo,
	entryPoints: [path.join(here, 'client.ts')],
	bundle: true,
	write: false,
	metafile: true,
	format: 'iife',
	globalName: 'IntentProbe',
	platform: 'browser',
	target: 'es2022',
	define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
});
const code = compiled.outputFiles[0].contents;
fs.writeFileSync(path.join(output, 'client.js'), code);
const files = new Set([
	...Object.keys(compiled.metafile.inputs).map((file) => path.resolve(repo, file)),
	path.join(here, 'run.mjs'),
	path.join(here, 'README.md'),
	path.join(repo, 'pnpm-lock.yaml'),
]);
const inputs = Object.fromEntries([...files].map((file) => [file, hash(fs.readFileSync(file))]));
const manifest = { inputs, client: hash(code) };
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
const browser = await chromium.launch({ executablePath, headless: true });
const reports = [];
try {
	for (const mode of ['loader', 'async', 'sync', 'dispose']) {
		const context = await browser.newContext();
		const page = await context.newPage();
		const errors = [];
		page.on('pageerror', (error) => errors.push(error.stack ?? String(error)));
		try {
			await page.setContent(
				'<div id="island" data-octane-hydrate-id="fixture" data-octane-hydrate-when="interaction" data-octane-hydrate-interaction-events="click"><button id="action" type="button">Action</button></div>',
			);
			await page.addScriptTag({ content: Buffer.from(code).toString('utf8') });
			await page.evaluate((value) => {
				window.probe = window.IntentProbe.start(value);
			}, mode);
			await page.locator('#action').click();
			if (mode !== 'loader') await page.waitForFunction(() => window.probe.state().entered);
			const before = await page.evaluate(() => window.probe.state());
			if (mode === 'loader' || mode === 'async') {
				await page.locator('#action').click();
				const waiting = await page.evaluate(() => window.probe.state());
				assert.equal(waiting.handled, 0);
				if (mode === 'loader') {
					assert.equal(waiting.entered, false);
					assert.deepEqual(waiting.bubbled, []);
				} else {
					assert.equal(waiting.received.length, 1);
					assert.deepEqual(waiting.bubbled, [{ trusted: true, prevented: false }]);
				}
				await page.evaluate(() => window.probe.release());
				await page.waitForFunction(() => window.probe.state().settled);
				const after = await page.evaluate(() => window.probe.state());
				assert.equal(after.received.length, mode === 'loader' ? 2 : 1);
				assert.ok(
					after.received.every(
						(intent) => intent.trusted && intent.prevented && intent.targetConnected,
					),
				);
				await page.locator('#action').click();
				const control = await page.evaluate(() => window.probe.state());
				assert.equal(control.handled, 1);
				assert.equal(control.bubbled.length, mode === 'loader' ? 1 : 2);
				reports.push({ mode, before, waiting, after, control });
			} else if (mode === 'sync') {
				await page.waitForFunction(() => window.probe.state().settled);
				await page.locator('#action').click();
				const control = await page.evaluate(() => window.probe.state());
				assert.equal(control.received.length, 1);
				assert.deepEqual(control.received[0], {
					trusted: true,
					prevented: true,
					targetConnected: true,
				});
				assert.equal(control.handled, 1);
				assert.deepEqual(control.bubbled, [{ trusted: true, prevented: false }]);
				reports.push({ mode, before, control });
			} else {
				await page.evaluate(() => window.probe.dispose());
				const disposed = await page.evaluate(() => window.probe.state());
				assert.equal(disposed.settled, false);
				assert.equal(disposed.unmounts, 0);
				assert.equal(disposed.contextHasSignal, false);
				await page.evaluate(() => window.probe.release());
				await page.waitForFunction(() => window.probe.state().unmounts === 1);
				const after = await page.evaluate(() => window.probe.state());
				assert.equal(after.lateWork, 1);
				assert.equal(after.settled, true);
				assert.equal(after.received.length, 1);
				await page.evaluate(() => window.probe.dispose());
				assert.equal((await page.evaluate(() => window.probe.state())).unmounts, 1);
				reports.push({ mode, before, disposed, after });
			}
			assert.deepEqual(errors, []);
			assert.deepEqual((await page.evaluate(() => window.probe.state())).errors, []);
			await page.evaluate(() => window.probe.cleanup());
		} finally {
			await context.close();
		}
	}
	for (const [file, digest] of Object.entries(inputs))
		assert.equal(hash(fs.readFileSync(file)), digest, file);
	const result = {
		browser: browser.version(),
		manifest: hash(fs.readFileSync(path.join(output, 'manifest.json'))),
		reports,
	};
	fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
	console.log(
		JSON.stringify({ output, result: path.join(output, 'result.json'), reports }, null, 2),
	);
} finally {
	await browser.close();
}
