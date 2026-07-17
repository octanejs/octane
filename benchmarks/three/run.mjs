import fs from 'node:fs';
import { chromium } from 'playwright';
import { scoreOf, summarizeSamples, timingStatForJson } from '../lib/stats.mjs';
import { EVENT_COUNT, EVENT_REPS, FRAME_COUNT, FRAME_REPS, MESH_COUNT } from './src/shared.js';

const ITER = Number.parseInt(process.argv[2] || '10', 10);
const WARMUP = 3;
const TARGETS = [
	{ name: 'octane', url: 'http://localhost:5291/octane.html' },
	{ name: 'r3f-9.6.1', url: 'http://localhost:5291/r3f.html' },
	{ name: 'plain-three', url: 'http://localhost:5291/plain.html' },
];
const OPS = [
	'mount_1k',
	'update_1k',
	'reorder_1k',
	'unmount_tree_1k',
	'reconstruct_dispose_1k',
	'frame_1k_subscribers',
	'raycast_event',
];

function gate(condition, message) {
	if (!condition) throw new Error(`semantic checksum failed: ${message}`);
}

function verify(op, value) {
	if (op === 'mount_1k') {
		gate(value.childCount === MESH_COUNT, `${op} children=${value.childCount}`);
		gate(value.first === 'mesh-0' && value.last === 'mesh-999', `${op} order`);
		gate(value.positionSum === 49_500, `${op} position sum=${value.positionSum}`);
	} else if (op === 'update_1k') {
		gate(value.childCount === MESH_COUNT, `${op} children=${value.childCount}`);
		gate(value.positionSum === 50_500, `${op} position sum=${value.positionSum}`);
		gate(value.retained === MESH_COUNT, `${op} retained=${value.retained}`);
	} else if (op === 'reorder_1k') {
		gate(value.first === 'mesh-999' && value.last === 'mesh-0', `${op} order`);
		gate(value.positionSum === 50_500, `${op} position sum=${value.positionSum}`);
		gate(value.retained === MESH_COUNT, `${op} retained=${value.retained}`);
	} else if (op === 'unmount_tree_1k') {
		gate(value.childCount === 0, `${op} children=${value.childCount}`);
	} else if (op === 'reconstruct_dispose_1k') {
		gate(value.childCount === MESH_COUNT, `${op} children=${value.childCount}`);
		gate(value.versionSum === MESH_COUNT, `${op} version sum=${value.versionSum}`);
		gate(value.retained === 0, `${op} retained=${value.retained}`);
		gate(value.disposalCount === MESH_COUNT, `${op} disposals=${value.disposalCount}`);
	} else if (op === 'frame_1k_subscribers') {
		gate(value.childCount === FRAME_COUNT, `${op} children=${value.childCount}`);
		gate(value.frameCalls === FRAME_COUNT * FRAME_REPS, `${op} calls=${value.frameCalls}`);
		gate(
			value.frameChecksum === ((FRAME_COUNT * (FRAME_COUNT + 1)) / 2) * FRAME_REPS,
			`${op} checksum=${value.frameChecksum}`,
		);
	} else if (op === 'raycast_event') {
		gate(value.childCount === EVENT_COUNT, `${op} children=${value.childCount}`);
		gate(value.eventCalls === EVENT_COUNT * EVENT_REPS, `${op} calls=${value.eventCalls}`);
		gate(
			value.eventChecksum === ((EVENT_COUNT * (EVENT_COUNT + 1)) / 2) * EVENT_REPS,
			`${op} checksum=${value.eventChecksum}`,
		);
	}
}

async function runTarget(browser, target) {
	const context = await browser.newContext();
	const page = await context.newPage();
	const errors = [];
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
	page.on('pageerror', (error) => errors.push(`pageerror: ${String(error)}`));
	await page.goto(target.url, { waitUntil: 'load' });
	await page.waitForFunction(() => globalThis.__threeBench?.ready === true);
	const results = {};
	const checksums = {};
	for (const op of OPS) {
		const samples = [];
		for (let index = 0; index < WARMUP + ITER; index++) {
			await page.evaluate(async (operation) => {
				await globalThis.__threeBench.prepare(operation);
			}, op);
			await page.evaluate(() => globalThis.gc?.());
			const sample = await page.evaluate(async (operation) => {
				const api = globalThis.__threeBench;
				const started = performance.now();
				await api.run(operation);
				let duration = performance.now() - started;
				if (operation === 'frame_1k_subscribers') duration /= 20;
				if (operation === 'raycast_event') duration /= 20;
				return { duration, snapshot: api.snapshot() };
			}, op);
			verify(op, sample.snapshot);
			checksums[op] = sample.snapshot;
			if (index >= WARMUP) samples.push(sample.duration);
			await new Promise((resolve) => setTimeout(resolve, 5));
		}
		results[op] = summarizeSamples(samples);
	}
	gate(errors.length === 0, `${target.name} browser errors: ${errors.join('; ')}`);
	await context.close();
	return { results, checksums };
}

const browser = await chromium.launch({
	headless: true,
	args: ['--disable-extensions', '--no-sandbox', '--js-flags=--expose-gc'],
});
const all = {};
let failed;
try {
	for (const target of TARGETS) {
		console.error(`Running ${target.name} × ${ITER} (+${WARMUP} warmup)…`);
		all[target.name] = await runTarget(browser, target);
	}
} catch (error) {
	failed = error instanceof Error ? error.message : String(error);
	console.error(error);
} finally {
	await browser.close();
}

const payload = {
	suite: 'three-renderer',
	iterations: ITER,
	targets: TARGETS.filter((target) => all[target.name]).map((target) => ({
		name: target.name,
		ops: Object.fromEntries(OPS.map((op) => [op, timingStatForJson(all[target.name].results[op])])),
		meta: { semanticChecksums: all[target.name].checksums },
	})),
};
if (failed) payload.failed = failed;
if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(payload, null, '\t') + '\n');
}

if (!failed) {
	const width = 24;
	console.log(
		`\n${'operation'.padEnd(width)} ${TARGETS.map((target) => target.name.padStart(16)).join(' ')}`,
	);
	for (const op of OPS) {
		console.log(
			`${op.padEnd(width)} ${TARGETS.map((target) => scoreOf(all[target.name].results[op]).toFixed(3).padStart(16)).join(' ')}`,
		);
	}
} else {
	process.exitCode = 1;
}
