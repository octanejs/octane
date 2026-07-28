// Node-only timing benchmark for Octane's dual-thread Lynx render path.
//
// It bundles the real background root, async transport, main-thread receiver,
// and host driver with the real Octane compiler, then drives them through a
// cheap fake Element PAPI. Because the fake PAPI does almost no work, the
// reported milliseconds are Octane's own CPU cost per node — the component of
// a native run a framework can actually control. This makes no native paint,
// layout, adoption, or device claim.
process.env.NODE_ENV = 'production';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

import { octane } from '../../packages/octane/src/compiler/vite.js';
import { lynxRenderers } from '../../packages/lynx/src/config.runtime.js';

const ROOT = import.meta.dirname;
const REPO = path.resolve(ROOT, '../..');
const rawIterations = process.argv[2] ?? '5';
const iterations = Number(rawIterations);

if (!Number.isSafeInteger(iterations) || iterations <= 0) {
	throw new TypeError(`iterations must be a positive safe integer, received ${rawIterations}.`);
}

const LYNX_SOURCE = path.join(REPO, 'packages/lynx/src');
const OCTANE_SOURCE = path.join(REPO, 'packages/octane/src');

function timingStat(samples) {
	const sorted = [...samples].sort((first, second) => first - second);
	const median = sorted[Math.floor((sorted.length - 1) / 2)];
	const mean = sorted.reduce((total, value) => total + value, 0) / sorted.length;
	const variance =
		sorted.reduce((total, value) => total + (value - mean) ** 2, 0) / Math.max(1, sorted.length);
	return {
		score: median,
		median,
		min: sorted[0],
		mean,
		p95: sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)],
		sd: Math.sqrt(variance),
		rme: mean === 0 ? 0 : (Math.sqrt(variance) / mean) * 100,
		warmupRatio: 1,
		samples: sorted.length,
	};
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-lynx-render-'));
let payload;

try {
	await build({
		configFile: false,
		root: REPO,
		logLevel: 'silent',
		resolve: {
			alias: [
				{ find: /^@octanejs\/lynx$/, replacement: path.join(LYNX_SOURCE, 'index.ts') },
				{
					find: /^@octanejs\/lynx\/intrinsics\/jsx-runtime$/,
					replacement: path.join(LYNX_SOURCE, 'intrinsics.ts'),
				},
				{ find: /^@octanejs\/lynx\/(.*)$/, replacement: `${LYNX_SOURCE}/$1.ts` },
				{
					find: /^octane\/universal\/native$/,
					replacement: path.join(OCTANE_SOURCE, 'universal-native.ts'),
				},
				{ find: /^octane\/universal$/, replacement: path.join(OCTANE_SOURCE, 'universal.ts') },
				{ find: /^octane$/, replacement: path.join(OCTANE_SOURCE, 'index.ts') },
			],
		},
		plugins: [octane({ renderers: lynxRenderers, ssr: false })],
		define: { 'process.env.NODE_ENV': '"production"' },
		build: {
			write: true,
			minify: false,
			target: 'node22',
			lib: {
				entry: path.join(ROOT, 'workload.ts'),
				formats: ['es'],
				fileName: 'workload',
			},
			outDir: tempDir,
			emptyOutDir: false,
			rollupOptions: { external: [] },
		},
	});

	const workload = await import(pathToFileURL(path.join(tempDir, 'workload.js')).href);

	const failures = [];
	const targets = new Map();
	const record = (name, op, value) => {
		let target = targets.get(name);
		if (target === undefined) targets.set(name, (target = { ops: new Map(), meta: {} }));
		let samples = target.ops.get(op);
		if (samples === undefined) target.ops.set(op, (samples = []));
		samples.push(value);
		return target;
	};

	const cases = [
		['empty_startup_ms', () => workload.runEmptyStartup()],
		['create_1k_rows_ms', () => workload.runCreateRows(1_000)],
		['create_10k_rows_ms', () => workload.runCreateRows(10_000)],
	];

	// One untimed warmup per case so V8 lazy compilation is not attributed to
	// the first sample. Cold-start cost is a separate, deliberately-scoped claim.
	for (const [, run] of cases) await run();

	for (let iteration = 0; iteration < iterations; iteration++) {
		for (const [op, run] of cases) {
			const result = await run();
			if (result.diagnostics.length !== 0) {
				failures.push(`${op}: ${result.diagnostics.join(' | ')}`);
			}
			const target = record('octane-lynx', op, result.durationMs);
			target.meta[op] = {
				createdElements: result.createdElements,
				checksum: result.checksum,
			};
		}
	}

	const click = await workload.runClick(100);
	if (click.diagnostics.length !== 0) {
		failures.push(`native_click: ${click.diagnostics.join(' | ')}`);
	}
	if (click.tokens === 0) {
		failures.push('native_click: no background event tokens reached the Element PAPI.');
	}
	if (!click.engineHookInstalled) {
		failures.push('native_click: the background thread installed no engine publishEvent receiver.');
	}
	if (!click.handled) {
		failures.push('native_click: a delivered native tap did not reach its background handler.');
	}

	payload = {
		suite: 'lynx-render',
		iterations,
		targets: [...targets].map(([name, target]) => ({
			name,
			ops: Object.fromEntries([...target.ops].map(([op, samples]) => [op, timingStat(samples)])),
			meta: { ...target.meta, nativeClick: click },
		})),
		...(failures.length === 0 ? null : { failed: failures.join(' | ') }),
	};

	for (const target of payload.targets) {
		for (const [op, stat] of Object.entries(target.ops)) {
			console.log(
				`${target.name} ${op}: median ${stat.median.toFixed(1)}ms ` +
					`(min ${stat.min.toFixed(1)}ms, rme ${stat.rme.toFixed(1)}%)`,
			);
		}
	}
	console.log(
		`native click: ${click.tokens} tokens installed, handler ${click.handled ? 'ran' : 'DID NOT RUN'}`,
	);
	if (failures.length !== 0) {
		console.error(failures.join('\n'));
		process.exitCode = 1;
	}
} catch (error) {
	const message = error instanceof Error ? error.stack || error.message : String(error);
	payload = { suite: 'lynx-render', iterations, targets: [], failed: message };
	console.error(message);
	process.exitCode = 1;
} finally {
	if (!process.env.LYNX_BENCH_KEEP_BUNDLE) fs.rmSync(tempDir, { recursive: true, force: true });
	else console.log(`bundle: ${path.join(tempDir, 'workload.js')}`);
}

if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(payload, null, '\t') + '\n');
}
