import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { version as react } from 'react';
import { countNamedFunctions } from '../../lib/precise-work.mjs';
import { summarizeSamples, timingStatForJson } from '../../lib/stats.mjs';

const iterations = Number(process.argv[2] ?? 12);
const throttle = Number(process.env.CHAT_SWITCH_THROTTLE ?? 1);
assert.ok(
	Number.isSafeInteger(iterations) && iterations > 0 && process.argv.length <= 3,
	'Usage: node run.mjs [positive number of rounds]',
);
assert.ok(throttle === 1 || throttle === 4, 'CHAT_SWITCH_THROTTLE must be 1 or 4');
const warmups = 2;
const viewport = { width: 1024, height: 768 };
const origin = 'http://127.0.0.1/';
const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

// An explicit oracle independent of the application's LRU. Oldest first.
const schedule = [
	['first_fill', [0, 1]],
	['retained', [1, 0]],
	['cold_evict', [0, 2]],
	['remount_evict', [2, 1]],
	['cold_evict', [1, 3]],
	['retained', [3, 1]],
	['remount_evict', [1, 0]],
];

const metrics = [
	'attachObserver',
	'stopObserver',
	'runObserver',
	'refreshLean',
	'recomputeLean',
	'subscribeToStore',
	'checkIfSnapshotChanged',
	'connectChannel',
	'disconnectChannel',
	'receiveChannel',
];

async function runPass(profile) {
	const { outputFiles } = await build({
		absWorkingDir: import.meta.dirname,
		entryPoints: ['app.jsx'],
		bundle: true,
		format: 'esm',
		jsx: 'automatic',
		define: { 'process.env.NODE_ENV': '"production"' },
		minify: !profile,
		write: false,
	});
	const script = outputFiles[0].contents;
	const sha256 = createHash('sha256').update(html).update(script).digest('hex');
	const browser = await chromium.launch({ args: profile ? ['--js-flags=--jitless'] : [] });
	try {
		const page = await browser.newPage({ viewport });
		const errors = [];
		page.on('pageerror', (error) => errors.push(error.message));
		page.on('console', (message) => {
			if (message.type() === 'error') errors.push(message.text());
		});
		await page.route('**/*', (route) => {
			switch (route.request().url()) {
				case origin:
					return route.fulfill({ contentType: 'text/html', body: html });
				case origin + 'assets/app.js':
					return route.fulfill({ contentType: 'text/javascript', body: Buffer.from(script) });
				default:
					return route.abort();
			}
		});
		const cdp = await page.context().newCDPSession(page);
		if (profile) {
			await cdp.send('Profiler.enable');
			await cdp.send('Profiler.startPreciseCoverage', { callCount: true, detailed: false });
		} else {
			await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
		}
		await page.goto(origin);
		const samples = {};
		const work = [];
		async function observe(phase, operation) {
			if (!profile) return operation();
			await cdp.send('Profiler.takePreciseCoverage');
			const result = await operation();
			const coverage = await cdp.send('Profiler.takePreciseCoverage');
			work.push({ phase, ...countNamedFunctions(coverage, metrics) });
			return result;
		}
		async function journey(record) {
			async function verify(rooms, tick) {
				await page.evaluate((args) => window.bench.verify(...args), [rooms, tick, !record]);
				assert.deepEqual(errors, []);
			}
			await observe('mount 0', () => page.evaluate(() => window.bench.start()));
			let current = [0];
			let tick = 0;
			await verify(current, tick);
			for (const [kind, rooms] of schedule) {
				const destination = rooms.at(-1);
				const phase = `${kind} ${current.at(-1)}→${destination}`;
				await observe(`background ${++tick}`, () => page.evaluate(() => window.bench.advance()));
				await verify(current, tick);
				const sample = await observe(phase, async () => {
					await page.locator(`button[data-target="${destination}"]`).click();
					return page.evaluate(() => window.bench.settled());
				});
				if (profile && current.length === rooms.length) {
					const { attachObserver, stopObserver } = work.at(-1);
					assert.equal(attachObserver, stopObserver, `${phase}: live observer count changed`);
				}
				tick += 2;
				await verify(rooms, tick);
				const { commit, ready, frame, staleAtCommit } = sample;
				assert.ok(
					[commit, ready, frame].every(Number.isFinite) &&
						commit >= 0 &&
						ready >= commit &&
						frame >= ready &&
						typeof staleAtCommit === 'boolean',
					`${phase}: invalid sample ${JSON.stringify(sample)}`,
				);
				if (record) (samples[kind] ??= []).push(sample);
				current = rooms;
			}
			await observe('dispose', () => page.evaluate(() => window.bench.dispose()));
			assert.deepEqual(errors, []);
		}
		const rounds = profile ? 1 : warmups + iterations;
		for (let i = 0; i < rounds; i++) {
			let timer;
			try {
				const timeout = new Promise((_, reject) => {
					timer = setTimeout(
						() => reject(new Error(`Round ${i + 1} timed out. ${errors.join(' ')}`)),
						30_000,
					);
				});
				await Promise.race([journey(!profile && i >= warmups), timeout]);
			} finally {
				clearTimeout(timer);
			}
		}
		return { sha256, chromium: browser.version(), samples, work };
	} finally {
		await browser.close();
	}
}

const timing = await runPass(false);
const diagnostic = await runPass(true);
const { work } = diagnostic;
const total = (metric) => work.reduce((count, row) => count + row[metric], 0);
for (const metric of metrics) assert.ok(total(metric) > 0, `Missing call coverage for ${metric}`);
assert.equal(total('attachObserver'), total('stopObserver'), 'unbalanced graph observations');
assert.equal(total('connectChannel'), total('disconnectChannel'), 'unbalanced external channels');

const ops = {};
const summary = [];
for (const [kind, samples] of Object.entries(timing.samples)) {
	const row = {
		kind,
		samples: samples.length,
		staleAtCommit: samples.filter((s) => s.staleAtCommit).length,
	};
	for (const key of ['commit', 'ready', 'frame']) {
		const name = key === 'frame' ? 'frame_proxy' : key;
		const times = samples.map((s) => s[key]);
		const stat = timingStatForJson(summarizeSamples(times, { scoreMode: 'mean' }));
		ops[`${kind}_press_to_${name}`] = stat;
		row[`${name}_median`] = stat.median.toFixed(1);
		row[`${name}_p95`] = stat.p95.toFixed(1);
	}
	summary.push(row);
}
const meta = {
	throttle,
	iterations,
	warmups,
	schedule,
	viewport,
	chromium: timing.chromium,
	node: process.version,
	react,
	platform: process.platform,
	arch: process.arch,
	cpu: os.cpus()[0].model,
	timingSha256: timing.sha256,
	diagnosticSha256: diagnostic.sha256,
	samples: timing.samples,
	work,
};
const result = {
	suite: 'chat-switching',
	iterations,
	targets: [{ name: `react-signals-${throttle}x`, ops, meta }],
};
console.log(`PASS chat-switching at ${throttle}× CPU slowdown, ${iterations} measured rounds (ms)`);
console.table(summary);
console.log('Function entries in a separate unthrottled coverage run');
console.table(work);
if (process.env.BENCH_JSON) {
	writeFileSync(process.env.BENCH_JSON, JSON.stringify(result, null, '\t') + '\n');
}
