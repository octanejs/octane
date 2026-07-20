// tanstack-start perf harness — REAL production servers, cold and warm, over
// HTTP. This is the app layer of the SSR attribution chain (the raw renderer
// layer is benchmarks/ssr-http): the same Start app measured as three targets
//
//   react          — @tanstack/react-start behind react/serve.mjs (node:http
//                    static fast-path + srvx fetch handler)
//   octane-minimal — @octanejs/tanstack-start behind octane/serve.mjs, a
//                    line-for-line mirror of react's host
//   octane-nitro   — the same octane app as its nitro deployment output
//                    (node .output/server/index.mjs)
//
// octane-minimal vs react isolates the Octane Start/renderer stack;
// octane-nitro vs octane-minimal isolates the nitro host's overhead. The
// correctness gates (compare.mjs three-way structural equivalence + the
// Playwright spec) are the precondition for trusting any number here.
//
// Ops (BENCH_JSON):
//   cold_spawn_to_listen      — process spawn → TCP listen          [mean]
//   cold_listen_to_first_byte — TCP listen → first HTTP body byte   [mean]
//   cold_spawn_to_first_byte  — spawn → first body byte (headline)  [mean]
//   warm_ttfb_posts / warm_total_posts       — warmed request to /posts
//   warm_ttfb_deferred / warm_total_deferred — warmed request to /deferred
//                    with BENCH_DEFER_MS=40; ttfb is the shell's first byte
//                    (a streaming server ships it well before the 40ms defer
//                    floor; a buffering server can't beat the floor — that
//                    outcome is a FINDING, deliberately not a harness gate)
//   warm_stream_tail_deferred — per-sample total − ttfb on /deferred: the
//                    post-shell streaming overhead above the defer floor
//   warm_seq_request_home     — warmed sequential ms/request on / (carries
//                    opsPerSec, the HTTP throughput number)
//
// Cold ops are mean-scored (scoreMode:'mean'): every sample is a genuine cold
// start; the steady-window default would discard them as warmup.
//
// Usage:  node run.mjs [iterations] [--no-build]
//   iterations — cold spawns per target (default 7; the unified runner passes
//                7 normal / 2 --quick). Warm timed requests scale
//                independently: max(20, iterations*4).
//   TARGETS=react,minimal,nitro   substring filter over target names.
//   BENCH_JSON=/path.json         machine-readable results.

process.env.NODE_ENV = 'production';

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scoreOf, summarizeSamples, timingStatForJson } from '../lib/stats.mjs';
import {
	coldStartOnce,
	getFreePort,
	spawnServer,
	stopServer,
	timedGet,
	waitForListen,
} from '../lib/http-timing.mjs';
import { FLAVORS } from './serve-both.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const noBuild = args.includes('--no-build');
const positional = args.filter((a) => !a.startsWith('--'));
const ITER = Math.max(1, parseInt(positional[0] || '7', 10));
// Warm requests cost milliseconds while cold spawns cost ~100ms each, and the
// warm ops sit at sub-2ms scale where 7 samples leave 30-40% RME — so the
// warm sample count scales up independently of the cold-spawn knob.
const WARM_ITER = Math.max(20, ITER * 4);
const WARMUP = Math.min(10, Math.max(3, ITER));
const DEFER_MS = 40;

// Target name (BENCH_JSON / baselines key) → serve-both flavor.
const TARGETS = [
	{ name: 'react', flavor: 'react', bundleDir: 'react/dist/server' },
	{ name: 'octane-minimal', flavor: 'octane-minimal', bundleDir: 'octane/dist/server' },
	{ name: 'octane-nitro', flavor: 'octane-nitro', bundleDir: 'octane/.output/server' },
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

// Route → marker the rendered HTML must contain (content gate; from the
// shared fixture, identical across flavors).
const ROUTE_MARKERS = {
	'/': 'Welcome Home!!!',
	'/posts': 'Post 1: deterministic title A',
	'/deferred': 'Hello deferred!',
};

if (!noBuild) {
	console.error('building all tanstack-start flavors (production)…');
	const r = spawnSync('pnpm', ['--filter', 'tanstack-start-bench', 'build'], {
		cwd: __dirname,
		stdio: ['ignore', 'inherit', 'inherit'],
	});
	if (r.status !== 0) {
		console.error('✗ build failed');
		process.exit(1);
	}
}

const summarizeCold = (samples) => summarizeSamples(samples, { scoreMode: 'mean' });
function summarizeWarm(samples, withOps = false) {
	const stat = summarizeSamples(samples);
	return withOps ? { ...stat, opsPerSec: 1000 / stat.score } : stat;
}

function dirBytes(dir) {
	let total = 0;
	for (const entry of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
		if (entry.isFile()) total += fs.statSync(path.join(entry.parentPath, entry.name)).size;
	}
	return total;
}

function flavorSpawnSpec(flavorName) {
	const spec = FLAVORS[flavorName];
	return { command: spec.command, args: spec.args, cwd: path.join(__dirname, spec.dir) };
}

// ── run ──────────────────────────────────────────────────────────────────────

const results = [];
const failures = [];

for (const t of selected) {
	const spec = flavorSpawnSpec(t.flavor);
	const target = { name: t.name, ops: {}, meta: {} };
	try {
		// 1) cold starts: fresh server process per sample, first request is `/`.
		console.error(`running ${t.name}/cold (${ITER} spawn→listen→first-byte cycles)…`);
		const spawnToListen = [];
		const listenToFirstByte = [];
		const spawnToFirstByte = [];
		for (let i = 0; i < ITER; i++) {
			const r = await coldStartOnce({ ...spec, path: '/' });
			if (r.response.status !== 200)
				throw new Error(`cold request returned HTTP ${r.response.status}`);
			if (!r.response.body.includes(ROUTE_MARKERS['/']))
				throw new Error(`cold / response is missing its content marker`);
			spawnToListen.push(r.spawnToListen);
			listenToFirstByte.push(r.listenToFirstByte);
			spawnToFirstByte.push(r.spawnToFirstByte);
		}
		target.ops.cold_spawn_to_listen = summarizeCold(spawnToListen);
		target.ops.cold_listen_to_first_byte = summarizeCold(listenToFirstByte);
		target.ops.cold_spawn_to_first_byte = summarizeCold(spawnToFirstByte);

		// 2) warm phase: one boot with the defer floor, warm every route, then
		//    timed sequential requests per route.
		console.error(`running ${t.name}/warm (${WARMUP} warmups + ${WARM_ITER} requests per route)…`);
		const port = await getFreePort();
		const { child, logs } = spawnServer(spec.command, spec.args, {
			cwd: spec.cwd,
			env: { PORT: String(port), BENCH_DEFER_MS: String(DEFER_MS) },
		});
		try {
			await waitForListen(port, child, { logs });
			const url = (route) => `http://127.0.0.1:${port}${route}`;
			// Content gate on every route once, warm the JIT along the way.
			for (const [route, marker] of Object.entries(ROUTE_MARKERS)) {
				const r = await timedGet(url(route));
				if (r.status !== 200) throw new Error(`${route}: HTTP ${r.status}`);
				if (!r.body.includes(marker)) throw new Error(`${route}: content marker missing`);
			}
			for (let i = 0; i < WARMUP; i++) {
				await timedGet(url('/'), { collectBody: false });
				await timedGet(url('/posts'), { collectBody: false });
				await timedGet(url('/deferred'), { collectBody: false });
			}
			const posts = { ttfb: [], total: [] };
			for (let i = 0; i < WARM_ITER; i++) {
				const r = await timedGet(url('/posts'), { collectBody: false });
				posts.ttfb.push(r.ttfbMs);
				posts.total.push(r.totalMs);
			}
			target.ops.warm_ttfb_posts = summarizeWarm(posts.ttfb);
			target.ops.warm_total_posts = summarizeWarm(posts.total);

			const deferred = { ttfb: [], total: [], tail: [], chunks: [], bytes: 0 };
			for (let i = 0; i < WARM_ITER; i++) {
				const r = await timedGet(url('/deferred'), { collectBody: false });
				deferred.ttfb.push(r.ttfbMs);
				deferred.total.push(r.totalMs);
				deferred.tail.push(r.totalMs - r.ttfbMs);
				deferred.chunks.push(r.chunks.length);
				deferred.bytes = r.chunks.reduce((a, c) => a + c.bytes, 0);
			}
			target.ops.warm_ttfb_deferred = summarizeWarm(deferred.ttfb);
			target.ops.warm_total_deferred = summarizeWarm(deferred.total);
			target.ops.warm_stream_tail_deferred = summarizeWarm(deferred.tail);
			target.meta.deferredChunks = deferred.chunks.sort((a, b) => a - b)[
				deferred.chunks.length >> 1
			];
			target.meta.deferredBytes = deferred.bytes;

			const home = [];
			for (let i = 0; i < WARM_ITER; i++) {
				const r = await timedGet(url('/'), { collectBody: false });
				home.push(r.totalMs);
			}
			target.ops.warm_seq_request_home = summarizeWarm(home, true);
		} finally {
			await stopServer(child);
		}
		target.meta.serverBundleBytes = dirBytes(path.join(__dirname, t.bundleDir));
		target.meta.nodeVersion = process.version;
		results.push(target);
	} catch (err) {
		failures.push(`${t.name}: ${err.message}`);
		console.error(`  ✗ ${err.message}`);
	}
}

// ── report ───────────────────────────────────────────────────────────────────

const f2 = (n) => (Number.isFinite(n) ? n.toFixed(2).padStart(9) : '      n/a');
console.log(`\ntanstack-start — cold TTFB + warm HTTP (${ITER} iterations, production builds)`);
console.log(
	'target         | spawn→listen | listen→byte | spawn→byte | ttfb posts | ttfb defer | tail defer | home ms | req/s | bundle KB',
);
console.log(
	'---------------+--------------+-------------+------------+------------+------------+------------+---------+-------+----------',
);
for (const r of results) {
	const o = r.ops;
	console.log(
		`${r.name.padEnd(14)} |${f2(scoreOf(o.cold_spawn_to_listen))}    |${f2(scoreOf(o.cold_listen_to_first_byte))}   |${f2(scoreOf(o.cold_spawn_to_first_byte))}  |${f2(scoreOf(o.warm_ttfb_posts))} |${f2(scoreOf(o.warm_ttfb_deferred))} |${f2(scoreOf(o.warm_stream_tail_deferred))} |${f2(scoreOf(o.warm_seq_request_home))}|${f2(o.warm_seq_request_home?.opsPerSec)}| ${(r.meta.serverBundleBytes / 1024).toFixed(0).padStart(8)}`,
	);
}

const byName = new Map(results.map((r) => [r.name, r]));
function printRatios(label, aName, bName) {
	const a = byName.get(aName);
	const b = byName.get(bName);
	if (!a || !b) return;
	console.log(`\nratios ${label} (>1 means ${aName} slower):`);
	for (const op of Object.keys(a.ops)) {
		const av = scoreOf(a.ops[op]);
		const bv = scoreOf(b.ops[op]);
		if (av != null && bv != null && bv > 0)
			console.log(`  ${op.padEnd(26)} ${(av / bv).toFixed(2)}x`);
	}
}
printRatios('octane-minimal vs react', 'octane-minimal', 'react');
printRatios('octane-nitro vs octane-minimal', 'octane-nitro', 'octane-minimal');

if (failures.length > 0) {
	console.error(`\n✗ failures:\n  - ${failures.join('\n  - ')}`);
}

// ── BENCH_JSON contract ──────────────────────────────────────────────────────
if (process.env.BENCH_JSON) {
	const out = {
		suite: 'tanstack-start',
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
