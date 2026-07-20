// ssr-workerd bench harness — streaming SSR inside REAL workerd (the
// Cloudflare Workers runtime) via miniflare, cold and warm. This is the
// deployment layer the Node suites cannot see: Workers cold start is isolate
// spin-up + parsing the ENTIRE worker script (no node_modules — everything
// bundles in), and streaming runs the web-streams path
// (renderToReadableStream) under workerd's scheduler rather than
// renderToPipeableStream under Node. Reuses the streaming-ssr fixtures behind
// one identical ~12-line module Worker per target, so the octane-vs-react gap
// is the renderer's alone.
//
// Targets: octane renderToReadableStream ('octane/server') vs React 19 Fizz
// edge (react-dom/server.edge). Scenarios come from the shared fixtures:
//   staggered — card i resolves at (i+1)*5ms: shell TTFB + streaming shape.
//   all-fast  — every card at ~1ms: per-request engine overhead dominates.
//
// Ops (BENCH_JSON):
//   worker_script_bytes / worker_script_gzip_bytes — the deploy-relevant
//                    bundle size (score = bytes, deterministic)
//   cold_spawn_to_ready      — new Miniflare() → workerd ready        [mean]
//   cold_ready_to_first_byte — ready → first response body chunk      [mean]
//   cold_spawn_to_first_byte — spawn → first body byte (headline)     [mean]
//   workerd_shell_staggered / workerd_total_staggered — warm request: first
//                    body chunk / stream end (staggered floor ~50ms)
//   workerd_shell_allfast / workerd_total_allfast     — same, all-fast;
//                    total_allfast carries opsPerSec (sequential
//                    requests/sec through workerd)
//
// Cold ops are mean-scored (scoreMode:'mean'): every sample is a genuine cold
// workerd process + isolate; the steady-window default would discard them as
// warmup. Note miniflare cold start is a LOCAL approximation of Cloudflare's
// (workerd process spawn included; Cloudflare pre-warms deployments and
// caches compiled scripts platform-side), so treat absolute values as
// comparative, not production predictions.
//
// Usage:  node run.mjs [iterations] [--no-build]
//   iterations — cold isolate starts per target (default 10; the unified
//                runner passes 10 normal / 2 --quick). Warm timed requests
//                scale independently: max(20, iterations*3).
//   TARGETS=octane,react   substring filter, as in streaming-ssr.
//   BENCH_JSON=/path.json  machine-readable results.

process.env.NODE_ENV = 'production';

import { build } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';
import { scoreOf, summarizeSamples, timingStatForJson } from '../lib/stats.mjs';
import { countMatches, semanticHtmlForVerification, verifyStream } from '../lib/stream-verify.mjs';
import { now } from '../lib/http-timing.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, 'dist');

const args = process.argv.slice(2);
const noBuild = args.includes('--no-build');
const positional = args.filter((a) => !a.startsWith('--'));
const ITER = Math.max(1, parseInt(positional[0] || '10', 10));
const WARM_ITER = Math.max(20, ITER * 3);
const WARMUP = Math.min(5, ITER);
const CARD_COUNT = 10;

// Mirror the adapter-cloudflare integration test's workerd configuration.
const COMPAT = { compatibilityDate: '2026-07-14', compatibilityFlags: ['nodejs_compat'] };

// kind 'raw'  — identical minimal module Worker calling the renderer directly
//               (octane vs react: the renderer comparison).
// kind 'app'  — the real deployment shape: @octanejs/vite-plugin +
//               @octanejs/adapter-cloudflare worker (octane-only; its delta
//               vs octane-tsrx is the metaframework layer's overhead).
const TARGETS = [
	{ name: 'octane-tsrx', dir: 'octane', kind: 'raw' },
	{ name: 'react', dir: 'react', kind: 'raw' },
	{ name: 'octane-app', dir: 'octane-app', kind: 'app' },
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

// ── build phase (self-contained module Worker per target) ────────────────────

async function buildWorker(root, outDir) {
	await build({
		root,
		logLevel: 'warn',
		build: { ssr: 'src/worker.ts', outDir, emptyOutDir: true },
		// Workers have no node_modules: bundle EVERYTHING (react,
		// react-dom/server.edge, octane, @tsrx/react helpers) into the script.
		ssr: { target: 'webworker', noExternal: true },
	});
}

if (!noBuild) {
	console.error('building ssr-workerd worker bundles…');
	for (const t of selected) {
		console.error(`  → ${t.name}`);
		if (t.kind === 'app') {
			// The vite-plugin's production builder orchestrates the whole app
			// build (client + server + adapter worker) from the app root.
			fs.rmSync(path.join(__dirname, t.dir, 'dist'), { recursive: true, force: true });
			await build({ root: path.join(__dirname, t.dir), logLevel: 'warn' });
		} else {
			await buildWorker(path.join(__dirname, t.dir), path.join(DIST, t.name));
		}
	}
}

// ── helpers ──────────────────────────────────────────────────────────────────

const summarizeCold = (samples) => summarizeSamples(samples, { scoreMode: 'mean' });
function summarizeWarm(samples, withOps = false) {
	const stat = summarizeSamples(samples);
	return withOps ? { ...stat, opsPerSec: 1000 / stat.score } : stat;
}
// Deterministic size "op": every stat field is the byte count.
function sizeOp(bytes) {
	return {
		score: bytes,
		median: bytes,
		min: bytes,
		mean: bytes,
		p95: bytes,
		sd: 0,
		rme: 0,
		samples: 1,
	};
}

function makeWorker(scriptPath) {
	return new Miniflare({
		modules: true,
		scriptPath,
		modulesRules: [{ type: 'ESModule', include: ['**/*.js'], fallthrough: true }],
		...COMPAT,
	});
}

// One request through workerd, timestamping first body chunk and stream end.
// accept-encoding: identity keeps workerd from gzip-buffering the stream —
// chunk timing must observe the renderer's flushes, not the compressor's.
async function timedDispatch(worker, urlPath, collectBody = false) {
	const t0 = now();
	const response = await worker.dispatchFetch(`https://bench.local${urlPath}`, {
		headers: { 'accept-encoding': 'identity' },
	});
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let tFirstByte = NaN;
	let chunkCount = 0;
	let bytes = 0;
	let body = '';
	let firstChunk = '';
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		if (!value || value.length === 0) continue;
		const t = now();
		if (Number.isNaN(tFirstByte)) tFirstByte = t;
		chunkCount++;
		bytes += value.length;
		if (collectBody) {
			const text = decoder.decode(value, { stream: true });
			if (firstChunk === '') firstChunk = text;
			body += text;
		}
	}
	const tEnd = now();
	return {
		status: response.status,
		ttfbMs: tFirstByte - t0,
		totalMs: tEnd - t0,
		chunkCount,
		bytes,
		body,
		firstChunk,
	};
}

// ── run ──────────────────────────────────────────────────────────────────────

const results = [];
const failures = [];

for (const t of selected) {
	const script =
		t.kind === 'app'
			? path.join(__dirname, t.dir, 'dist/server/worker.js')
			: path.join(DIST, t.name, 'worker.js');
	const scriptDir = path.dirname(script);
	const urlFor = (scenario) => (t.kind === 'app' ? `/${scenario}` : `/?scenario=${scenario}`);
	if (!fs.existsSync(script)) {
		failures.push(`${t.name}: missing build output ${script} (run without --no-build first)`);
		console.error(`  ✗ ${failures[failures.length - 1]}`);
		continue;
	}
	const target = { name: t.name, ops: {}, meta: {} };
	try {
		// 1) deploy-relevant script size (the whole outDir — vite may emit
		//    assets chunks beside worker.js; workerd loads them all).
		let raw = 0;
		let gz = 0;
		for (const entry of fs.readdirSync(scriptDir, {
			withFileTypes: true,
			recursive: true,
		})) {
			if (!entry.isFile()) continue;
			const content = fs.readFileSync(path.join(entry.parentPath, entry.name));
			raw += content.length;
			gz += gzipSync(content, { level: 9 }).length;
		}
		target.ops.worker_script_bytes = sizeOp(raw);
		target.ops.worker_script_gzip_bytes = sizeOp(gz);

		// 2) cold isolate starts: fresh Miniflare (workerd process + isolate +
		//    full script parse) per sample, all-fast scenario so the staggered
		//    data schedule doesn't floor TTFB.
		console.error(`running ${t.name}/cold (${ITER} fresh workerd spawns)…`);
		const spawnToReady = [];
		const readyToFirstByte = [];
		const spawnToFirstByte = [];
		for (let i = 0; i < ITER; i++) {
			const worker = makeWorker(script);
			try {
				const t0 = now();
				await worker.ready;
				const tReady = now();
				const r = await timedDispatch(worker, urlFor('all-fast'));
				if (r.status !== 200) throw new Error(`cold request returned HTTP ${r.status}`);
				spawnToReady.push(tReady - t0);
				readyToFirstByte.push(r.ttfbMs);
				spawnToFirstByte.push(tReady - t0 + r.ttfbMs);
			} finally {
				await worker.dispose();
			}
		}
		target.ops.cold_spawn_to_ready = summarizeCold(spawnToReady);
		target.ops.cold_ready_to_first_byte = summarizeCold(readyToFirstByte);
		target.ops.cold_spawn_to_first_byte = summarizeCold(spawnToFirstByte);

		// 3) warm per scenario: one workerd, warmups, verify pass (shared
		//    correctness gate on the wire output), then timed requests.
		const worker = makeWorker(script);
		try {
			await worker.ready;
			for (const scenario of ['staggered', 'all-fast']) {
				const key = scenario === 'all-fast' ? 'allfast' : scenario;
				console.error(
					`running ${t.name}/${scenario} in workerd (${WARMUP} warmup + ${WARM_ITER} timed requests)…`,
				);
				for (let i = 0; i < WARMUP; i++) await timedDispatch(worker, urlFor(scenario));
				const verifyResponse = await timedDispatch(worker, urlFor(scenario), true);
				if (verifyResponse.status !== 200)
					throw new Error(`${t.name}/${scenario}: HTTP ${verifyResponse.status}`);
				// The raw targets must prove streamed-not-buffered shape. The app
				// target wraps the render stream in the index.html template (its
				// first chunk is the <head> prefix, not the shell) and its flush
				// behavior is itself a measured RESULT (visible as shell-vs-total),
				// so it gets content checks only: whole page present, exactly once.
				let gate;
				if (t.kind === 'app') {
					const semantic = semanticHtmlForVerification(t.name, verifyResponse.body);
					if (countMatches(semantic, /class="masthead"/g) !== 1)
						throw new Error(`${t.name}/${scenario}: expected exactly one shell masthead`);
					const articles = countMatches(semantic, /<article[\s>]/g);
					if (articles !== CARD_COUNT)
						throw new Error(
							`${t.name}/${scenario}: expected ${CARD_COUNT} <article> cards, got ${articles}`,
						);
					gate = { skeletonsInStream: countMatches(verifyResponse.body, /class="skeleton"/g) };
				} else {
					gate = verifyStream(
						t.name,
						scenario,
						{
							html: verifyResponse.body,
							firstChunk: verifyResponse.firstChunk,
							total: verifyResponse.totalMs,
						},
						CARD_COUNT,
					);
				}
				const shell = [];
				const total = [];
				const chunkCounts = [];
				let bytes = 0;
				for (let i = 0; i < WARM_ITER; i++) {
					const r = await timedDispatch(worker, urlFor(scenario));
					shell.push(r.ttfbMs);
					total.push(r.totalMs);
					chunkCounts.push(r.chunkCount);
					bytes = r.bytes;
				}
				target.ops[`workerd_shell_${key}`] = summarizeSamples(shell);
				target.ops[`workerd_total_${key}`] = summarizeWarm(total, key === 'allfast');
				target.meta[`chunks_${key}`] = chunkCounts.sort((a, b) => a - b)[chunkCounts.length >> 1];
				target.meta[`bytes_${key}`] = bytes;
				target.meta[`skeletons_${key}`] = gate.skeletonsInStream;
			}
		} finally {
			await worker.dispose();
		}
		target.meta.nodeVersion = process.version;
		results.push(target);
	} catch (err) {
		failures.push(`${t.name}: ${err.message}`);
		console.error(`  ✗ ${err.message}`);
	}
}

// ── report ───────────────────────────────────────────────────────────────────

const f2 = (n) => (Number.isFinite(n) ? n.toFixed(2).padStart(9) : '      n/a');
const kb = (n) => (n / 1024).toFixed(0).padStart(6);
console.log(
	`\nssr-workerd — streaming SSR inside workerd (${ITER} cold iterations, production builds)`,
);
console.log(
	'target       | script KB | gzip KB | spawn→ready | ready→byte | spawn→byte | shell stag | total stag | shell fast | total fast | req/s',
);
console.log(
	'-------------+-----------+---------+-------------+------------+------------+------------+------------+------------+------------+------',
);
for (const r of results) {
	const o = r.ops;
	console.log(
		`${r.name.padEnd(12)} | ${kb(scoreOf(o.worker_script_bytes))}    | ${kb(scoreOf(o.worker_script_gzip_bytes))}  |${f2(scoreOf(o.cold_spawn_to_ready))}   |${f2(scoreOf(o.cold_ready_to_first_byte))}  |${f2(scoreOf(o.cold_spawn_to_first_byte))}  |${f2(scoreOf(o.workerd_shell_staggered))} |${f2(scoreOf(o.workerd_total_staggered))} |${f2(scoreOf(o.workerd_shell_allfast))} |${f2(scoreOf(o.workerd_total_allfast))} |${f2(o.workerd_total_allfast?.opsPerSec)}`,
	);
}

const byName = new Map(results.map((r) => [r.name, r]));
function printRatios(label, aName, bName) {
	const a = byName.get(aName);
	const b = byName.get(bName);
	if (!a || !b) return;
	console.log(`\nratios ${label} (>1 means ${aName} slower/bigger):`);
	for (const op of Object.keys(a.ops)) {
		const av = scoreOf(a.ops[op]);
		const bv = scoreOf(b.ops[op]);
		if (av != null && bv != null && bv > 0)
			console.log(`  ${op.padEnd(28)} ${(av / bv).toFixed(2)}x`);
	}
}
printRatios('octane-tsrx vs react', 'octane-tsrx', 'react');
printRatios('octane-app vs octane-tsrx', 'octane-app', 'octane-tsrx');

if (failures.length > 0) {
	console.error(`\n✗ failures:\n  - ${failures.join('\n  - ')}`);
}

// ── BENCH_JSON contract ──────────────────────────────────────────────────────
if (process.env.BENCH_JSON) {
	const out = {
		suite: 'ssr-workerd',
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
