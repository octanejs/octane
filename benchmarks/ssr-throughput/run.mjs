// ssr-throughput bench harness — Node-only SSR throughput (NO browser, NO
// ports, NO Playwright). Hand-rolled process.hrtime.bigint timing.
//
// Part 1 — news-page throughput: reuses benchmarks/news's production-build
// methodology (vite build the SSR bundle, import the built entry-server, time
// renderApp()) for three targets — octane render() ('octane/server'), React 19
// react-dom/server renderToString, Solid 2.0 @solidjs/web renderToString — at
// 50 and 500 article cards. benchmarks/news is NEVER modified beyond its own
// gen.mjs re-writing src/data.js (invoked as a child process, deterministic,
// restored to the tracked count-50 dataset afterwards); every build lands in
// THIS suite's dist/ via an outDir override, so news's own dist is untouched.
//
// Part 2 — octane-only self-scaling fixtures (fixtures/src, built once as an
// SSR bundle with the octane vite plugin):
//   waterfall   — D ∈ {1,2,4} sequentially-dependent use(thenable) Suspense
//                 boundaries under a ~1000-node tree: render()'s retry loop
//                 re-renders the FULL tree once per pass (D+1 passes). Plus a
//                 32-in-flight concurrency mode (concurrent render() calls
//                 racing across awaits — stresses the module-global
//                 save/restore in runtime.server.ts render()).
//   deopt-page  — the same page authored compiled-.tsrx vs plain-.ts
//                 createElement descriptors; gate: byte-identical bodies after
//                 stripping comment markers; headline = plain/compiled ratio.
//   escape-heavy — 10k escape-needing text holes; isolates escapeHtml.
//
// Every config reports ops/sec, p50/p95/p99/min latency (ms), RSS + heapUsed
// growth over up to 5k renders (process.memoryUsage deltas, NO forced gc),
// body bytes, and hydration-marker-pair count ('<!--[' occurrences).
//
// Usage:  node run.mjs [seconds] [--no-build] [--quick]
//   seconds   — timed-loop budget PER CONFIG (default 10, or 2 under --quick);
//               also scales the memory-phase render count (seconds*500, capped
//               at 5000).
//   --no-build  reuse existing dist/ bundles (fast re-runs).
//   --quick     reduced smoke pass: 2s loops, news at count-50 ONLY (skips the
//               count-500 gen+build), waterfall depths {1,2} ONLY, and drops the
//               32-in-flight concurrency config. Exercises every distinct code
//               path + correctness gate cheaply; not a representative benchmark.
//   CONFIGS=waterfall,escape   env: run only configs whose name contains one
//               of the comma-separated substrings.
//   BENCH_JSON=/path/out.json  env: also write machine-readable results.

// Set BEFORE importing anything that resolves a framework runtime: externalized
// react-dom / @solidjs/web pick their PRODUCTION build off process.env.NODE_ENV.
process.env.NODE_ENV = 'production';

import { build } from 'vite';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NEWS = path.join(__dirname, '..', 'news');
const FIXTURES = path.join(__dirname, 'fixtures');
const DIST = path.join(__dirname, 'dist');

const args = process.argv.slice(2);
const noBuild = args.includes('--no-build');
const quick = args.includes('--quick');
const positional = args.filter((a) => !a.startsWith('--'));
const SECONDS = Math.max(0.1, parseFloat(positional[0] || (quick ? '2' : '10')));
// Memory-growth phase: up to 5k renders (spec), scaled down for smoke runs and
// additionally time-capped per config (~60s worst case) so a slow config can't
// wedge the run; the actual render count lands in meta.memRenders.
const MEM_RENDERS = Math.max(50, Math.min(5000, Math.round(SECONDS * 500)));
const MEM_TIME_CAP_MS = 60_000;
const CONFIG_FILTER = process.env.CONFIGS
	? process.env.CONFIGS.split(',')
			.map((s) => s.trim())
			.filter(Boolean)
	: null;

const NEWS_TARGETS = ['octane-tsrx', 'react', 'solid'];
const CARD_COUNTS = quick ? [50] : [50, 500];
const WATERFALL_DEPTHS = quick ? [1, 2] : [1, 2, 4];
// parallel-k*: K INDEPENDENT ~4ms fetches in one body (Parallel.tsrx). The SSR
// parallel-use mirror batches them into ONE await round, so p50 stays ~flat
// across k; serial registration costs ~k*4ms (linear = regression).
const PARALLEL_KS = quick ? [4] : [4, 8];
const WATERFALL_CONCURRENCY = 32;

// ── build phase ───────────────────────────────────────────────────────────────

function gen(count) {
	// news's own generator, run as a child process (we never edit news files
	// ourselves). Deterministic (seeded mulberry32), so re-running at 50 restores
	// the tracked src/data.js byte-for-byte.
	execFileSync(process.execPath, [path.join(NEWS, 'gen.mjs'), String(count)], {
		stdio: 'ignore',
	});
}

async function buildSsr(root, outDir) {
	await build({
		root,
		logLevel: 'warn',
		// outDir lives under THIS suite's dist/ (outside the app root), so the
		// target app's own dist/ is untouched; emptyOutDir must be explicit for an
		// out-of-root outDir.
		build: { ssr: 'src/entry-server.ts', outDir, emptyOutDir: true },
		// The React target compiles `.tsrx` via @tsrx/react, whose output imports
		// the @tsrx/react runtime helpers (e.g. `@tsrx/react/runtime/iterable`).
		// By default vite externalizes node_modules in an SSR build, but @tsrx/react
		// is only installed under the news/react app — NOT resolvable from this
		// suite's dist/ at runtime — so bundle its runtime IN. (react / react-dom /
		// solid-js / @solidjs/web / octane stay external or are handled by each
		// app's own config; those ARE resolvable from this package's deps.) Merges
		// (concatenates) with each app's own ssr.noExternal; harmless where unused.
		ssr: { noExternal: ['@tsrx/react'] },
	});
}

if (!noBuild) {
	console.error('building SSR bundles (production)…');
	try {
		for (const size of CARD_COUNTS) {
			gen(size);
			for (const target of NEWS_TARGETS) {
				console.error(`  → news-${size}/${target}`);
				await buildSsr(path.join(NEWS, target), path.join(DIST, `news-${size}`, target));
			}
		}
	} finally {
		gen(50); // restore the tracked count-50 dataset whatever happened above
	}
	console.error('  → fixtures');
	await buildSsr(FIXTURES, path.join(DIST, 'fixtures'));
}

// ── timing / stats helpers ────────────────────────────────────────────────────

const hr = () => process.hrtime.bigint();

function summarize(samples) {
	const s = [...samples].sort((a, b) => a - b);
	const n = s.length;
	const mean = s.reduce((a, b) => a + b, 0) / n;
	const sd = Math.sqrt(s.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
	const q = (p) => s[Math.min(n - 1, Math.floor(n * p))];
	return {
		median: s[n >> 1],
		min: s[0],
		p95: q(0.95),
		p99: q(0.99),
		sd,
		samples: n,
		opsPerSec: 1000 / mean,
	};
}

// Warm up (≥3 runs, ~10% of the budget), then sample fn() latencies until the
// budget elapses. All numbers are milliseconds.
async function timeLoop(fn) {
	const wEnd = hr() + BigInt(Math.round(Math.max(0.2, SECONDS * 0.1) * 1e9));
	let w = 0;
	while (w < 3 || hr() < wEnd) {
		await fn();
		w++;
	}
	const samples = [];
	const end = hr() + BigInt(Math.round(SECONDS * 1e9));
	do {
		const t0 = hr();
		await fn();
		samples.push(Number(hr() - t0) / 1e6);
	} while (hr() < end && samples.length < 200_000);
	return summarize(samples);
}

// RSS/heapUsed growth over a fixed render count (NO forced gc — this measures
// how the allocator behaves under sustained SSR load, not a leak proof).
async function memGrowth(fn, renders) {
	const before = process.memoryUsage();
	const end = hr() + BigInt(MEM_TIME_CAP_MS) * 1_000_000n;
	let done = 0;
	while (done < renders && hr() < end) {
		await fn();
		done++;
	}
	const after = process.memoryUsage();
	return {
		memRenders: done,
		rssGrowthBytes: after.rss - before.rss,
		heapUsedGrowthBytes: after.heapUsed - before.heapUsed,
	};
}

const countMatches = (s, re) => (s.match(re) || []).length;
const stripComments = (html) => html.replace(/<!--[\s\S]*?-->/g, '');
const escapeHtml = (v) =>
	String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function bodyMeta(body) {
	return {
		bodyBytes: Buffer.byteLength(body),
		hydrationMarkerPairs: countMatches(body, /<!--\[/g),
	};
}

const modCache = new Map();
async function loadEntry(entryPath) {
	if (!modCache.has(entryPath)) {
		if (!fs.existsSync(entryPath)) {
			throw new Error(`missing build output ${entryPath} (run without --no-build first)`);
		}
		modCache.set(entryPath, await import(pathToFileURL(entryPath).href));
	}
	return modCache.get(entryPath);
}

// ── config table ──────────────────────────────────────────────────────────────
// Each config: { name, group, entry, fn(mod) → per-render async fn,
//                verify(mod) → meta (throws on gate failure), batch? }.

const FIXTURE_ENTRY = path.join(DIST, 'fixtures', 'entry-server.js');
const configs = [];

for (const size of CARD_COUNTS) {
	for (const target of NEWS_TARGETS) {
		configs.push({
			name: `news-${size}/${target}`,
			group: `news-${size}`,
			entry: path.join(DIST, `news-${size}`, target, 'entry-server.js'),
			fn: (mod) => () => mod.renderApp(),
			verify: async (mod) => {
				const { body } = await mod.renderApp();
				const cards = countMatches(body, /<article[\s>]/g);
				if (cards !== size) throw new Error(`expected ${size} article cards, got ${cards}`);
				return bodyMeta(body);
			},
		});
	}
}

for (const k of PARALLEL_KS) {
	configs.push({
		name: `parallel-k${k}`,
		group: 'waterfall',
		entry: FIXTURE_ENTRY,
		fn: (mod) => () => mod.renderParallel(k),
		verify: async (mod) => {
			const { body } = await mod.renderParallel(k);
			const expected = `sum = ${mod.expectedParallelSum(k)}`;
			if (!body.includes(expected)) throw new Error(`parallel sum "${expected}" missing`);
			if (body.includes('PARALLEL-PENDING'))
				throw new Error('pending fallback leaked into the final body');
			return bodyMeta(body);
		},
	});
}

for (const depth of WATERFALL_DEPTHS) {
	configs.push({
		name: `waterfall-d${depth}`,
		group: 'waterfall',
		entry: FIXTURE_ENTRY,
		fn: (mod) => () => mod.renderWaterfall(depth),
		verify: async (mod) => {
			const { body } = await mod.renderWaterfall(depth);
			const expected = `level ${depth} = ${mod.expectedChainValue(depth)}`;
			if (!body.includes(expected)) throw new Error(`final chain value "${expected}" missing`);
			if (body.includes('WATERFALL-PENDING'))
				throw new Error('pending fallback leaked into the final body');
			return { ...bodyMeta(body), suspensePasses: depth + 1 };
		},
	});
}

if (!quick)
	configs.push({
		name: `waterfall-d4-x${WATERFALL_CONCURRENCY}`,
		group: 'waterfall',
		entry: FIXTURE_ENTRY,
		batch: WATERFALL_CONCURRENCY, // one sample = one Promise.all of 32 renders
		fn: (mod) => () =>
			Promise.all(Array.from({ length: WATERFALL_CONCURRENCY }, () => mod.renderWaterfall(4))),
		verify: async (mod) => {
			// Concurrent renders interleave at every suspense await; if render()'s
			// module-global save/restore leaked across renders, bodies would diverge.
			const serial = (await mod.renderWaterfall(4)).body;
			const batch = await Promise.all(
				Array.from({ length: WATERFALL_CONCURRENCY }, () => mod.renderWaterfall(4)),
			);
			if (!batch.every((r) => r.body === serial))
				throw new Error('concurrent render() bodies diverged from the serial body');
			return { ...bodyMeta(serial), concurrency: WATERFALL_CONCURRENCY, suspensePasses: 5 };
		},
	});

// The deopt byte-identity gate, shared by both deopt configs so each can run
// standalone under a CONFIGS filter.
async function deoptGate(mod) {
	const fast = (await mod.renderDeoptFast()).body;
	const plain = (await mod.renderDeoptPlain()).body;
	const f = stripComments(fast);
	const p = stripComments(plain);
	if (f !== p) {
		let i = 0;
		while (i < f.length && i < p.length && f[i] === p[i]) i++;
		throw new Error(
			`deopt page bodies differ after comment strip @${i}: ` +
				`fast "…${f.slice(Math.max(0, i - 40), i + 40)}…" vs ` +
				`plain "…${p.slice(Math.max(0, i - 40), i + 40)}…"`,
		);
	}
	return { fast, plain };
}

configs.push({
	name: 'deopt-page/octane-fast',
	group: 'deopt-page',
	entry: FIXTURE_ENTRY,
	fn: (mod) => () => mod.renderDeoptFast(),
	verify: async (mod) => bodyMeta((await deoptGate(mod)).fast),
});
configs.push({
	name: 'deopt-page/octane-deopt',
	group: 'deopt-page',
	entry: FIXTURE_ENTRY,
	fn: (mod) => () => mod.renderDeoptPlain(),
	verify: async (mod) => bodyMeta((await deoptGate(mod)).plain),
});

configs.push({
	name: 'escape-heavy',
	group: 'escape-heavy',
	entry: FIXTURE_ENTRY,
	fn: (mod) => () => mod.renderEscapeHeavy(),
	verify: async (mod) => {
		const { body } = await mod.renderEscapeHeavy();
		if (!body.includes(escapeHtml(mod.ESCAPE_PROBE)))
			throw new Error('escaped probe string missing from body');
		if (body.includes('<script')) throw new Error('raw <script leaked (escapeHtml broken)');
		const holes = countMatches(body, /<li class="e">/g);
		if (holes !== 10000) throw new Error(`expected 10000 holes, got ${holes}`);
		return bodyMeta(body);
	},
});

// ── run ───────────────────────────────────────────────────────────────────────

const selected = CONFIG_FILTER
	? configs.filter((c) => CONFIG_FILTER.some((f) => c.name.includes(f)))
	: configs;
if (selected.length === 0) {
	console.error(`✗ CONFIGS="${process.env.CONFIGS}" matched nothing`);
	process.exit(1);
}

const results = [];
const failures = [];
for (const cfg of selected) {
	console.error(`running ${cfg.name} (${SECONDS}s timed + ≤${MEM_RENDERS} memory renders)…`);
	try {
		const mod = await loadEntry(cfg.entry);
		const meta = await cfg.verify(mod);
		const fn = cfg.fn(mod);
		const stats = await timeLoop(fn);
		const mem = await memGrowth(fn, cfg.batch ? Math.ceil(MEM_RENDERS / cfg.batch) : MEM_RENDERS);
		if (cfg.batch) {
			mem.memRenders *= cfg.batch;
			// stats time whole batches; surface the effective per-render throughput.
			meta.rendersPerSec = stats.opsPerSec * cfg.batch;
		}
		results.push({ name: cfg.name, group: cfg.group, stats, meta: { ...meta, ...mem } });
	} catch (err) {
		failures.push(`${cfg.name}: ${err.message}`);
		console.error(`  ✗ ${err.message}`);
	}
}

// ── report ────────────────────────────────────────────────────────────────────

const f2 = (n) => n.toFixed(2).padStart(9);
const f3 = (n) => n.toFixed(3).padStart(9);
const kb = (n) => (n / 1024).toFixed(0).padStart(8);
console.log(
	`\nssr-throughput — Node SSR ops/sec + latency (${SECONDS}s/config, production builds)`,
);
console.log(
	'\nconfig                     |   ops/sec |    p50 ms |    p95 ms |    p99 ms |    min ms | samples',
);
console.log(
	'---------------------------+-----------+-----------+-----------+-----------+-----------+--------',
);
for (const r of results) {
	const s = r.stats;
	console.log(
		`${r.name.padEnd(26)} |${f2(s.opsPerSec)} |${f3(s.median)} |${f3(s.p95)} |${f3(s.p99)} |${f3(s.min)} | ${String(s.samples).padStart(6)}`,
	);
}

console.log(
	'\nconfig                     |  body KB | markers | mem renders |  rss Δ KB | heap Δ KB',
);
console.log(
	'---------------------------+----------+---------+-------------+-----------+----------',
);
for (const r of results) {
	const m = r.meta;
	console.log(
		`${r.name.padEnd(26)} |${kb(m.bodyBytes)} | ${String(m.hydrationMarkerPairs).padStart(7)} | ${String(m.memRenders).padStart(11)} |${kb(m.rssGrowthBytes).padStart(10)} |${kb(m.heapUsedGrowthBytes).padStart(9)}`,
	);
}

const byName = new Map(results.map((r) => [r.name, r]));
const ratio = (a, b) => byName.get(a).stats.median / byName.get(b).stats.median;
const have = (...names) => names.every((n) => byName.has(n));

for (const size of CARD_COUNTS) {
	const base = `news-${size}/octane-tsrx`;
	if (!byName.has(base)) continue;
	console.log(`\nnews-${size} ratios vs ${base} (median; >1 means slower than octane):`);
	for (const target of NEWS_TARGETS.slice(1)) {
		const other = `news-${size}/${target}`;
		if (!byName.has(other)) continue;
		const x = ratio(other, base);
		console.log(`  ${target.padEnd(12)} ${x.toFixed(2)}x octane's render time`);
	}
}
if (have('waterfall-d1', 'waterfall-d2')) {
	console.log('\nwaterfall pass scaling (ideal ≈ passes ratio: d2/d1=1.5, d4/d1=2.5):');
	console.log(`  d2/d1  ${ratio('waterfall-d2', 'waterfall-d1').toFixed(2)}x`);
	if (have('waterfall-d4'))
		console.log(`  d4/d1  ${ratio('waterfall-d4', 'waterfall-d1').toFixed(2)}x`);
}
if (have(`waterfall-d4-x${WATERFALL_CONCURRENCY}`, 'waterfall-d4')) {
	const eff =
		ratio(`waterfall-d4-x${WATERFALL_CONCURRENCY}`, 'waterfall-d4') / WATERFALL_CONCURRENCY;
	console.log(
		`  x${WATERFALL_CONCURRENCY} batch overhead  ${eff.toFixed(2)}x per render (1.00 = concurrency is free)`,
	);
}
if (have('deopt-page/octane-deopt', 'deopt-page/octane-fast')) {
	console.log(
		`\nHEADLINE deopt-page ratio (plain-.ts createElement / compiled .tsrx): ` +
			`${ratio('deopt-page/octane-deopt', 'deopt-page/octane-fast').toFixed(2)}x`,
	);
}

if (failures.length > 0) {
	console.error(`\n✗ correctness gate failures:\n  - ${failures.join('\n  - ')}`);
}

// ── BENCH_JSON contract ───────────────────────────────────────────────────────
if (process.env.BENCH_JSON) {
	const out = {
		suite: 'ssr-throughput',
		// This suite is time-budgeted, not iteration-counted: `iterations` carries
		// the per-config seconds budget; each op reports its own sample count.
		iterations: SECONDS,
		targets: results.map((r) => ({
			name: r.name,
			ops: { render: r.stats },
			meta: r.meta,
		})),
	};
	if (failures.length > 0) out.failed = failures.join('; ');
	fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(out, null, '\t') + '\n');
	console.error(`\nBENCH_JSON written → ${process.env.BENCH_JSON}`);
}

process.exit(failures.length > 0 ? 1 : 0);
