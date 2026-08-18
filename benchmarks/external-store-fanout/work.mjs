// Deterministic notification work over the existing production-built fan-out
// fixture. Keep count instrumentation separate from the ordinary timing run.
process.env.NODE_ENV = 'production';

import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { STORE_SUBSCRIBER_COUNT } from '../runtime-stress/shared.js';

const requireFromNews = createRequire(new URL('../news/package.json', import.meta.url));
const { chromium } = requireFromNews('playwright');
const appDirectory = fileURLToPath(new URL('../news/octane-tsrx/', import.meta.url));
const NOTIFICATION_BURST = 100;
const CHANGED_INDEX = 17;

let browser;
let productionServer;
let observed;
let failure;

function ensure(condition, message) {
	if (!condition) throw new Error(message);
}

try {
	let target = process.env.EXTERNAL_STORE_WORK_URL;
	if (!target) {
		const { build, preview } = await import(pathToFileURL(requireFromNews.resolve('vite')).href);
		await build({
			root: appDirectory,
			logLevel: 'error',
			build: {
				outDir: 'dist/runtime-stress',
				emptyOutDir: true,
				minify: 'esbuild',
				rollupOptions: {
					input: path.join(appDirectory, 'runtime-stress.html'),
					output: {
						chunkFileNames: 'assets/[name]-[hash].js',
						entryFileNames: 'assets/[name]-[hash].js',
					},
				},
			},
		});
		productionServer = await preview({
			root: appDirectory,
			logLevel: 'error',
			build: { outDir: 'dist/runtime-stress' },
			preview: { host: '127.0.0.1', port: 0, strictPort: true },
		});
		const address = productionServer.httpServer.address();
		ensure(
			address !== null && typeof address !== 'string',
			'The production external-store fixture did not expose a TCP port',
		);
		target = `http://127.0.0.1:${address.port}/runtime-stress.html`;
	}

	browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
	const page = await browser.newPage();
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
	await page.goto(target, { waitUntil: 'load' });
	await page.waitForFunction(() => window.__runtimeStress?.ready === true);
	await page.locator('#store-toggle').click();
	await page.waitForFunction(
		(count) =>
			document.querySelectorAll('[data-subscriber-index]').length === count &&
			window.__runtimeStress.store.size === count,
		STORE_SUBSCRIBER_COUNT,
	);
	await page.evaluate(() => {
		window.__externalStoreWorkNodes = Array.from(
			document.querySelectorAll('[data-subscriber-index]'),
		);
	});

	const phases = {};
	for (const name of ['unchanged', 'broad', 'narrow']) {
		const notification = await page.evaluate(
			({ name, burst, changedIndex }) => {
				const {
					store,
					stats: { store: stats },
				} = window.__runtimeStress;
				const before = {
					notifications: stats.notifications,
					renders: stats.renders.reduce((sum, value) => sum + value, 0),
					snapshotCalls: stats.snapshotCalls,
				};
				for (let index = 0; index < burst; index++) {
					if (name === 'narrow') store.writeOne(changedIndex, burst + index + 1);
					else store.writeAll(name === 'unchanged' ? 0 : index + 1);
				}
				// Read this before the browser task returns: later render/commit reads
				// are a different, necessary part of observing the final snapshot.
				return {
					before,
					notifications: stats.notifications - before.notifications,
					notificationSnapshotCalls: stats.snapshotCalls - before.snapshotCalls,
				};
			},
			{ name, burst: NOTIFICATION_BURST, changedIndex: CHANGED_INDEX },
		);
		await page.waitForFunction(
			({ count, name, burst, changedIndex }) => {
				const nodes = Array.from(document.querySelectorAll('[data-subscriber-index]'));
				return (
					nodes.length === count &&
					nodes.every((node, index) => {
						const value =
							name === 'unchanged'
								? 0
								: name === 'narrow' && index === changedIndex
									? burst * 2
									: burst;
						return (
							node === window.__externalStoreWorkNodes[index] && node.textContent === String(value)
						);
					})
				);
			},
			{
				count: STORE_SUBSCRIBER_COUNT,
				name,
				burst: NOTIFICATION_BURST,
				changedIndex: CHANGED_INDEX,
			},
		);
		const settled = await page.evaluate((before) => {
			const stats = window.__runtimeStress.stats.store;
			return {
				renders: stats.renders.reduce((sum, value) => sum + value, 0) - before.renders,
				snapshotCalls: stats.snapshotCalls - before.snapshotCalls,
			};
		}, notification.before);
		ensure(
			notification.notifications === STORE_SUBSCRIBER_COUNT * NOTIFICATION_BURST,
			`${name}: the notification burst did not reach every subscriber`,
		);
		phases[name] = {
			notifications: notification.notifications,
			notificationSnapshotCalls: notification.notificationSnapshotCalls,
			...settled,
		};
	}

	await page.locator('#store-toggle').click();
	await page.waitForFunction(
		() =>
			document.querySelectorAll('[data-subscriber-index]').length === 0 &&
			window.__runtimeStress.store.size === 0,
	);
	const cleanup = await page.evaluate(() => {
		const {
			store,
			stats: { store: stats },
		} = window.__runtimeStress;
		delete window.__externalStoreWorkNodes;
		return {
			retainedSubscribers: store.size,
			subscribeCalls: stats.subscribeCalls,
			unsubscribeCalls: stats.unsubscribeCalls,
		};
	});
	ensure(cleanup.subscribeCalls >= STORE_SUBSCRIBER_COUNT, 'Subscribers never connected');
	ensure(
		cleanup.subscribeCalls === cleanup.unsubscribeCalls,
		'Subscription acquisition and removal were unbalanced',
	);
	ensure(cleanup.retainedSubscribers === 0, 'The store retained an unmounted subscriber');
	ensure(errors.length === 0, errors.join('; '));
	observed = { phases, cleanup };
} catch (error) {
	failure = error instanceof Error ? (error.stack ?? error.message) : String(error);
} finally {
	try {
		await browser?.close();
	} finally {
		await productionServer?.close();
	}
}

const requiredWork = {
	unchanged_burst_snapshot_reads: STORE_SUBSCRIBER_COUNT * NOTIFICATION_BURST,
	broad_burst_snapshot_reads: STORE_SUBSCRIBER_COUNT,
	narrow_burst_snapshot_reads: (STORE_SUBSCRIBER_COUNT - 1) * NOTIFICATION_BURST + 1,
	// A nonzero reference lets the ratio runner enforce a zero-render ceiling.
	unchanged_burst_renders: 1,
	broad_burst_renders: STORE_SUBSCRIBER_COUNT,
	narrow_burst_renders: 1,
};
const work = observed
	? Object.fromEntries(
			Object.entries(observed.phases).flatMap(([name, phase]) => [
				[`${name}_burst_snapshot_reads`, phase.notificationSnapshotCalls],
				[`${name}_burst_renders`, phase.renders],
			]),
		)
	: {};
const stats = (values) =>
	Object.fromEntries(
		Object.entries(values).map(([name, value]) => [
			name,
			{ median: value, min: value, samples: 1 },
		]),
	);
const payload = {
	suite: 'external-store-fanout-work',
	targets: [
		{
			name: 'octane-tsrx-work',
			ops: stats(work),
			meta: {
				correctness: failure ? 'fail' : 'pass',
				notificationBurst: NOTIFICATION_BURST,
				subscriberCount: STORE_SUBSCRIBER_COUNT,
				...observed,
			},
		},
		{
			name: 'required-work',
			ops: stats(requiredWork),
			meta: {
				basis:
					'One changed notification schedules each reader; unchanged readers still compare snapshots',
			},
		},
	],
	...(failure ? { failed: failure } : {}),
};

if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, `${JSON.stringify(payload, null, '\t')}\n`);
}
if (failure) {
	console.error(`FAIL external-store-fanout-work: ${failure}`);
	process.exitCode = 1;
} else {
	console.log('Production external-store notification work:');
	console.table(work);
	console.log('All external-store notification semantic gates passed.');
}
