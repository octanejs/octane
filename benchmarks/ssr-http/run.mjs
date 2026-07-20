// ssr-http bench harness — the raw streaming API over REAL HTTP, cold and
// warm. Where streaming-ssr times in-process warmed renders, this suite
// answers the deployment questions: how long from process spawn to the first
// byte a cold server ever ships, and what streaming costs end-to-end through
// a socket. It reuses streaming-ssr's fixtures (identical page, identical
// data schedules) behind one identical ~20-line node:http host per target
// (server.mjs), so the octane-vs-react gap is the renderer's alone — no
// framework router, no Nitro, no srvx. Together with the tanstack-start suite
// this forms the attribution chain: raw renderer → +Start framework → +host.
//
// Targets: octane renderToPipeableStream ('octane/server') vs React 19 Fizz
// (react-dom/server). Scenarios come from the shared fixtures:
//   staggered — card i resolves at (i+1)*5ms: shell TTFB + streaming shape.
//   all-fast  — every card at ~1ms: per-request engine overhead dominates.
//
// Ops (BENCH_JSON):
//   import_renderer          — fresh-process import() of the built server
//                              entry (module parse+eval; octane's is the
//                              7k-line runtime.server bundled, react's is the
//                              prebuilt react-dom/server) [mean-scored]
//   cold_spawn_to_listen     — process spawn → TCP listen                [mean]
//   cold_listen_to_first_byte— TCP listen → first HTTP body byte         [mean]
//   cold_spawn_to_first_byte — spawn → first body byte (headline)        [mean]
//   http_shell_staggered / http_total_staggered — warm request: first body
//                              byte / stream end (staggered floor ~50ms)
//   http_shell_allfast / http_total_allfast     — same, all-fast;
//                              total_allfast carries opsPerSec (sequential
//                              requests/sec, the HTTP throughput number)
//
// Cold ops are mean-scored (summarizeSamples scoreMode:'mean'): the default
// steady-window score would discard early samples as JIT warmup, but every
// cold sample IS the measurement.
//
// Usage:  node run.mjs [iterations] [--no-build]
//   iterations — cold spawns per target (default 15; the unified runner
//                passes 10 normal / 2 --quick). Warm timed requests scale
//                independently: max(20, iterations*3).
//   --no-build   reuse existing dist/ bundles.
//   TARGETS=octane,react   substring filter, as in streaming-ssr.
//   BENCH_JSON=/path.json  machine-readable results.

process.env.NODE_ENV = 'production';

import { build } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { scoreOf, summarizeSamples, timingStatForJson } from '../lib/stats.mjs';
import { verifyStream } from '../lib/stream-verify.mjs';
import {
	coldStartOnce,
	getFreePort,
	spawnServer,
	stopServer,
	timedGet,
	waitForListen,
} from '../lib/http-timing.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, '..', 'streaming-ssr');
const DIST = path.join(__dirname, 'dist');
const SERVER = path.join(__dirname, 'server.mjs');

const args = process.argv.slice(2);
const noBuild = args.includes('--no-build');
const positional = args.filter((a) => !a.startsWith('--'));
const ITER = Math.max(1, parseInt(positional[0] || '15', 10));
// Warm HTTP requests cost single-digit ms while cold spawns cost ~40ms+, and
// the warm shell ops sit at sub-ms scale — scale warm samples up
// independently of the cold-spawn knob to keep their RME useful.
const WARM_ITER = Math.max(20, ITER * 3);
const WARMUP = Math.min(5, ITER);
const CARD_COUNT = 10;

const TARGETS = [
	{ name: 'octane-tsrx', dir: 'octane' },
	{ name: 'react', dir: 'react' },
];
const TARGET_FILTER = process.env.TARGETS
	? process.env.TARGETS.split(',')
			.map((s) => s.trim())
			.filter(Boolean)
	: null;
const selected = TARGET_FILTER
	? TARGETS.filter((t) => TARGET_FILTER.some((f) => t.name.includes(f)))
	: TARGETS;
if (selected.length === 0) {
	console.error(`✗ TARGETS="${process.env.TARGETS}" matched nothing`);
	process.exit(1);
}

// ── build phase (same vite invocation as streaming-ssr, own outDir) ──────────

async function buildSsr(root, outDir) {
	await build({
		root,
		logLevel: 'warn',
		build: { ssr: 'src/entry-server.ts', outDir, emptyOutDir: true },
		// The React target's compiled output imports @tsrx/react runtime helpers,
		// only installed under the react fixture — bundle them in so the built
		// entry runs from this suite's dist/ (react / react-dom stay external,
		// resolvable from this suite package's own deps).
		ssr: { noExternal: ['@tsrx/react'] },
	});
}

if (!noBuild) {
	console.error('building ssr-http production bundles…');
	for (const t of selected) {
		console.error(`  → ${t.name}`);
		await buildSsr(path.join(FIXTURES, t.dir), path.join(DIST, t.name));
	}
}

// ── helpers ──────────────────────────────────────────────────────────────────

function summarizeWarm(samples) {
	const stat = summarizeSamples(samples);
	return { ...stat, opsPerSec: 1000 / stat.score };
}
const summarizeCold = (samples) => summarizeSamples(samples, { scoreMode: 'mean' });

// Module parse+eval cost of the built server entry, measured INSIDE a fresh
// node process (excludes node's own boot; cwd = this suite so externalized
// react-dom resolves from its node_modules).
function importOnce(entryUrl) {
	return new Promise((resolve, reject) => {
		const child = spawn(
			process.execPath,
			[
				'--input-type=module',
				'-e',
				'const t0 = performance.now(); await import(process.argv[1]); console.log((performance.now() - t0).toFixed(3));',
				entryUrl,
			],
			{ cwd: __dirname, env: { ...process.env, NODE_ENV: 'production' } },
		);
		let out = '';
		let err = '';
		child.stdout.on('data', (c) => (out += c));
		child.stderr.on('data', (c) => (err += c));
		child.on('exit', (code) => {
			const ms = parseFloat(out);
			if (code === 0 && Number.isFinite(ms)) resolve(ms);
			else reject(new Error(`import probe exited ${code}: ${err || out}`));
		});
	});
}

function serverEnv(entry, scenario) {
	return { ENTRY: entry, SCENARIO: scenario };
}

// ── run ──────────────────────────────────────────────────────────────────────

const results = [];
const failures = [];

for (const t of selected) {
	const entry = path.join(DIST, t.name, 'entry-server.js');
	if (!fs.existsSync(entry)) {
		failures.push(`${t.name}: missing build output ${entry} (run without --no-build first)`);
		console.error(`  ✗ ${failures[failures.length - 1]}`);
		continue;
	}
	const entryUrl = pathToFileURL(entry).href;
	const target = { name: t.name, ops: {}, meta: {} };
	try {
		// 1) import cost (fresh process per sample).
		console.error(`running ${t.name}/import_renderer (${ITER} fresh-process imports)…`);
		const importSamples = [];
		for (let i = 0; i < ITER; i++) importSamples.push(await importOnce(entryUrl));
		target.ops.import_renderer = summarizeCold(importSamples);

		// 2) cold starts: fresh server process per sample, all-fast scenario so
		//    the staggered data schedule doesn't put a 50ms floor under TTFB.
		console.error(`running ${t.name}/cold (${ITER} spawn→listen→first-byte cycles)…`);
		const spawnToListen = [];
		const listenToFirstByte = [];
		const spawnToFirstByte = [];
		for (let i = 0; i < ITER; i++) {
			const r = await coldStartOnce({
				command: process.execPath,
				args: [SERVER],
				cwd: __dirname,
				env: serverEnv(entry, 'all-fast'),
			});
			if (r.response.status !== 200)
				throw new Error(`cold request returned HTTP ${r.response.status}`);
			spawnToListen.push(r.spawnToListen);
			listenToFirstByte.push(r.listenToFirstByte);
			spawnToFirstByte.push(r.spawnToFirstByte);
		}
		target.ops.cold_spawn_to_listen = summarizeCold(spawnToListen);
		target.ops.cold_listen_to_first_byte = summarizeCold(listenToFirstByte);
		target.ops.cold_spawn_to_first_byte = summarizeCold(spawnToFirstByte);

		// 3) warm HTTP per scenario: one boot, warmups, verify pass (the shared
		//    correctness gate on real wire output), then timed requests.
		for (const scenario of ['staggered', 'all-fast']) {
			const key = scenario === 'all-fast' ? 'allfast' : scenario;
			console.error(
				`running ${t.name}/${scenario} over HTTP (${WARMUP} warmup + ${WARM_ITER} timed requests)…`,
			);
			const port = await getFreePort();
			const { child, logs } = spawnServer(process.execPath, [SERVER], {
				cwd: __dirname,
				env: { ...serverEnv(entry, scenario), PORT: String(port) },
			});
			try {
				await waitForListen(port, child, { logs });
				const url = `http://127.0.0.1:${port}/`;
				for (let i = 0; i < WARMUP; i++) await timedGet(url, { collectBody: false });
				const verifyResponse = await timedGet(url);
				if (verifyResponse.status !== 200)
					throw new Error(`${t.name}/${scenario}: HTTP ${verifyResponse.status}`);
				const gate = verifyStream(
					t.name,
					scenario,
					{
						html: verifyResponse.body,
						firstChunk: verifyResponse.firstChunk,
						total: verifyResponse.totalMs,
					},
					CARD_COUNT,
				);
				const shell = [];
				const total = [];
				const chunkCounts = [];
				let bytes = 0;
				for (let i = 0; i < WARM_ITER; i++) {
					const r = await timedGet(url, { collectBody: false });
					shell.push(r.ttfbMs);
					total.push(r.totalMs);
					chunkCounts.push(r.chunks.length);
					bytes = r.chunks.reduce((a, c) => a + c.bytes, 0);
				}
				target.ops[`http_shell_${key}`] = summarizeSamples(shell);
				target.ops[`http_total_${key}`] = summarizeWarm(total);
				target.meta[`chunks_${key}`] = chunkCounts.sort((a, b) => a - b)[chunkCounts.length >> 1];
				target.meta[`bytes_${key}`] = bytes;
				target.meta[`skeletons_${key}`] = gate.skeletonsInStream;
			} finally {
				await stopServer(child);
			}
		}
		target.meta.serverEntryBytes = fs.statSync(entry).size;
		target.meta.nodeVersion = process.version;
		results.push(target);
	} catch (err) {
		failures.push(`${t.name}: ${err.message}`);
		console.error(`  ✗ ${err.message}`);
	}
}

// ── report ───────────────────────────────────────────────────────────────────

const f2 = (n) => (Number.isFinite(n) ? n.toFixed(2).padStart(9) : '      n/a');
console.log(`\nssr-http — raw streaming API over HTTP (${ITER} iterations, production builds)`);
console.log(
	'target       | import ms | spawn→listen | listen→byte | spawn→byte | shell stag | total stag | shell fast | total fast | req/s',
);
console.log(
	'-------------+-----------+--------------+-------------+------------+------------+------------+------------+------------+------',
);
for (const r of results) {
	const o = r.ops;
	console.log(
		`${r.name.padEnd(12)} |${f2(scoreOf(o.import_renderer))} |${f2(scoreOf(o.cold_spawn_to_listen))}    |${f2(scoreOf(o.cold_listen_to_first_byte))}   |${f2(scoreOf(o.cold_spawn_to_first_byte))}  |${f2(scoreOf(o.http_shell_staggered))} |${f2(scoreOf(o.http_total_staggered))} |${f2(scoreOf(o.http_shell_allfast))} |${f2(scoreOf(o.http_total_allfast))} |${f2(o.http_total_allfast?.opsPerSec)}`,
	);
}

const byName = new Map(results.map((r) => [r.name, r]));
const octane = byName.get('octane-tsrx');
const react = byName.get('react');
if (octane && react) {
	console.log('\nratios octane-tsrx vs react (>1 means octane slower):');
	for (const op of Object.keys(octane.ops)) {
		const a = scoreOf(octane.ops[op]);
		const b = scoreOf(react.ops[op]);
		if (a != null && b != null && b > 0) console.log(`  ${op.padEnd(26)} ${(a / b).toFixed(2)}x`);
	}
}

if (failures.length > 0) {
	console.error(`\n✗ failures:\n  - ${failures.join('\n  - ')}`);
}

// ── BENCH_JSON contract ──────────────────────────────────────────────────────
if (process.env.BENCH_JSON) {
	const out = {
		suite: 'ssr-http',
		iterations: ITER,
		targets: results.map((r) => ({
			name: r.name,
			ops: Object.fromEntries(Object.entries(r.ops).map(([k, v]) => [k, timingStatForJson(v)])),
			meta: r.meta,
		})),
	};
	if (failures.length > 0) out.failed = failures.join('; ');
	fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(out, null, '\t') + '\n');
	console.error(`\nBENCH_JSON written → ${process.env.BENCH_JSON}`);
}

process.exit(failures.length > 0 ? 1 : 0);
