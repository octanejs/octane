// streaming-ssr bench harness — Node-only streaming SSR (NO browser, NO ports,
// NO Playwright). Times the BUILT production SSR bundles of four targets —
// octane renderToPipeableStream ('octane/server'), React 19 Fizz
// (react-dom/server), Solid 2.0 renderToStream ('@solidjs/web'), Ripple's
// stream-mode render ('ripple/server') — rendering the SAME product page: a
// synchronous shell (~50 elements) + 10 Suspense-boundary cards (~20 elements
// each) whose data promises resolve on a deterministic setTimeout schedule.
//
// Scenarios (both run for every target):
//   staggered — card i resolves at (i+1)*5ms (5, 10, …, 50): the streaming
//               shape test. shellTTFB shows shell-flush latency; totalTime is
//               floored at ~50ms by the data schedule for every framework, so
//               differences there are pure engine overhead on top of the wait.
//   all-fast  — every card resolves at ~1ms: per-chunk framework overhead
//               dominates; this is the throughput scenario (renders/sec).
//
// Metrics per render (median over the iteration count): shellTTFB (first
// non-empty chunk), totalTime (stream end), chunkCount, bytesTotal; the
// all-fast scenario additionally reports renders/sec (sequential, from mean
// totalTime — includes the ~1ms timer floor).
//
// Every target's entry-server exports the same contract:
//   renderStream(scenario, onChunk) → Promise<void>  (resolves at stream end)
// Chunk collection happens HERE via that callback (mock { write, end } /
// Writable / web-stream reader loop live in each entry), with performance.now()
// timestamps taken as each chunk lands.
//
// Usage:  node run.mjs [iterations] [--no-build]
//   iterations  — timed renders PER TARGET PER SCENARIO (default 30; the
//                 unified runner passes 3 for --quick). Warmup is 5 renders
//                 (news-suite convention), capped at the iteration count.
//   --no-build    reuse existing dist/ bundles (fast re-runs).
//   TARGETS=octane,react   env: run only targets whose name contains one of
//                 the comma-separated substrings.
//   BENCH_JSON=/path/out.json  env: also write machine-readable results.

// Set BEFORE importing anything that resolves a framework runtime: externalized
// react-dom / @solidjs/web pick their PRODUCTION build off process.env.NODE_ENV.
process.env.NODE_ENV = 'production';

import { build } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { scoreOf, summarizeSamples, timingStatForJson } from '../lib/stats.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, 'dist');

const args = process.argv.slice(2);
const noBuild = args.includes('--no-build');
const positional = args.filter((a) => !a.startsWith('--'));
const ITER = Math.max(1, parseInt(positional[0] || '30', 10));
const WARMUP = Math.min(5, ITER);

// Target name (BENCH_JSON / baselines key) → fixture dir under this suite.
const TARGETS = [
	{ name: 'octane-tsrx', dir: 'octane' },
	{ name: 'react', dir: 'react' },
	{ name: 'solid', dir: 'solid' },
	{ name: 'ripple', dir: 'ripple' },
];
const SCENARIOS = ['staggered', 'all-fast'];
const CARD_COUNT = 10;

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

// ── build phase (production SSR bundles, one per target) ─────────────────────

async function buildSsr(root, outDir) {
	await build({
		root,
		logLevel: 'warn',
		// outDir lives under THIS suite's dist/ (outside the app root);
		// emptyOutDir must be explicit for an out-of-root outDir.
		build: { ssr: 'src/entry-server.ts', outDir, emptyOutDir: true },
		// The React target's compiled output imports @tsrx/react runtime helpers
		// (e.g. `@tsrx/react/runtime/iterable`), which are only installed under
		// the react fixture — bundle them IN so the built entry runs from dist/.
		// react / react-dom / solid-js / @solidjs/web stay external (resolvable
		// from this suite package's own deps); octane and ripple are noExternal'd
		// by their fixtures' vite configs. Merges with each fixture's config;
		// harmless where unused.
		ssr: { noExternal: ['@tsrx/react'] },
	});
}

if (!noBuild) {
	console.error('building streaming SSR bundles (production)…');
	for (const t of selected) {
		console.error(`  → ${t.name}`);
		await buildSsr(path.join(__dirname, t.dir), path.join(DIST, t.name));
	}
}

// ── stats helpers ─────────────────────────────────────────────────────────────

function summarize(samples) {
	const stat = summarizeSamples(samples);
	return {
		...stat,
		opsPerSec: 1000 / stat.score,
	};
}

// One measured render: drive renderStream(), timestamping every chunk as it
// lands. Zero-length chunks (e.g. ripple's empty stream-open enqueue) don't
// count as chunks. `collect` concatenates the HTML — verify pass only, so the
// timed loop isn't paying for string growth.
async function renderOnce(mod, scenario, collect = false) {
	const chunks = [];
	let html = '';
	const t0 = performance.now();
	await mod.renderStream(scenario, (chunk) => {
		if (chunk.length === 0) return;
		chunks.push({ t: performance.now() - t0, bytes: Buffer.byteLength(chunk) });
		if (collect) html += chunk;
	});
	const total = performance.now() - t0;
	return {
		shell: chunks.length > 0 ? chunks[0].t : NaN,
		total,
		chunkCount: chunks.length,
		bytes: chunks.reduce((a, c) => a + c.bytes, 0),
		html,
	};
}

const countMatches = (s, re) => (s.match(re) || []).length;

// Correctness gate (throws on failure). It asserts SEMANTICS — the stream must
// carry the whole page (shell exactly once, all ten card payloads) and, for
// the staggered schedule, must genuinely have streamed (first chunk out before
// the slowest data could have resolved). It deliberately does NOT assert chunk
// granularity: how a framework frames its output (React splits the shell
// across view-buffer writes, Solid inlines boundaries that resolve before its
// first flush, octane batches a whole round into one segment chunk) is itself
// a measured result, reported via chunkCount / skeletonsInStream.
function verify(target, scenario, r) {
	const tag = `${target}/${scenario}`;
	if (countMatches(r.html, /class="masthead"/g) !== 1)
		throw new Error(`${tag}: expected exactly one shell masthead`);
	const articles = countMatches(r.html, /<article[\s>]/g);
	if (articles !== CARD_COUNT)
		throw new Error(`${tag}: expected ${CARD_COUNT} <article> cards, got ${articles}`);
	for (let i = 0; i < CARD_COUNT; i++) {
		if (!r.html.includes(`Card ${i} — `))
			throw new Error(`${tag}: card ${i} payload missing from stream`);
	}
	if (!r.firstChunk.includes('class="masthead"'))
		throw new Error(`${tag}: first chunk lacks the shell`);
	if (scenario === 'staggered') {
		// The slowest card resolves at 50ms; a first chunk carrying its payload
		// means the renderer buffered the page instead of streaming the shell.
		if (r.firstChunk.includes(`Card ${CARD_COUNT - 1} — `))
			throw new Error(`${tag}: slowest card's payload in the first chunk — buffered, not streamed`);
		if (r.total < 40)
			throw new Error(
				`${tag}: stream ended at ${r.total.toFixed(1)}ms — before the 50ms data schedule`,
			);
	}
	return { skeletonsInStream: countMatches(r.html, /class="skeleton"/g) };
}

// ── run ───────────────────────────────────────────────────────────────────────

const results = [];
const failures = [];
for (const t of selected) {
	const entry = path.join(DIST, t.name, 'entry-server.js');
	if (!fs.existsSync(entry)) {
		failures.push(`${t.name}: missing build output ${entry} (run without --no-build first)`);
		console.error(`  ✗ ${failures[failures.length - 1]}`);
		continue;
	}
	const mod = await import(pathToFileURL(entry).href);
	const target = { name: t.name, scenarios: {} };
	for (const scenario of SCENARIOS) {
		console.error(`running ${t.name}/${scenario} (${WARMUP} warmup + ${ITER} timed renders)…`);
		try {
			// Warm up FIRST (template compilation, JIT), then verify against a warm
			// render — cold-run chunk framing differs (e.g. Solid's first flush
			// lands later on a cold module, inlining more boundaries).
			for (let i = 0; i < WARMUP; i++) await renderOnce(mod, scenario);
			// Verify pass (collects HTML + first chunk for the gate).
			let firstChunk = '';
			let html = '';
			const vt0 = performance.now();
			let vChunks = 0;
			await mod.renderStream(scenario, (chunk) => {
				if (chunk.length === 0) return;
				if (vChunks === 0) firstChunk = chunk;
				vChunks++;
				html += chunk;
			});
			const gate = verify(t.name, scenario, {
				html,
				firstChunk,
				total: performance.now() - vt0,
			});
			const shell = [];
			const total = [];
			const chunkCounts = [];
			let bytes = 0;
			for (let i = 0; i < ITER; i++) {
				const r = await renderOnce(mod, scenario);
				shell.push(r.shell);
				total.push(r.total);
				chunkCounts.push(r.chunkCount);
				bytes = r.bytes;
			}
			target.scenarios[scenario] = {
				shell: summarize(shell),
				total: summarize(total),
				chunkCount: chunkCounts.sort((a, b) => a - b)[chunkCounts.length >> 1],
				bytes,
				skeletonsInStream: gate.skeletonsInStream,
			};
		} catch (err) {
			failures.push(`${t.name}/${scenario}: ${err.message}`);
			console.error(`  ✗ ${err.message}`);
		}
	}
	if (Object.keys(target.scenarios).length > 0) results.push(target);
}

// ── report ────────────────────────────────────────────────────────────────────

const f2 = (n) => n.toFixed(2).padStart(8);
const kb = (n) => (n / 1024).toFixed(1).padStart(7);
console.log(
	`\nstreaming-ssr — shell TTFB + stream-end totals (${ITER} renders/scenario, production builds)`,
);
for (const scenario of SCENARIOS) {
	console.log(`\n[${scenario}]`);
	console.log(
		'target       | shell score |  (min)   | total score |  (min)   | chunks | bytes KB | renders/s',
	);
	console.log(
		'-------------+-------------+----------+-------------+----------+--------+----------+----------',
	);
	for (const r of results) {
		const s = r.scenarios[scenario];
		if (!s) continue;
		console.log(
			`${r.name.padEnd(12)} |${f2(s.shell.score)} |${f2(s.shell.min)} |${f2(s.total.score)} |${f2(s.total.min)} | ${String(s.chunkCount).padStart(6)} | ${kb(s.bytes)} |${f2(s.total.opsPerSec)}`,
		);
	}
}

const byName = new Map(results.map((r) => [r.name, r]));
const octane = byName.get('octane-tsrx');
if (octane) {
	console.log('\nratios vs octane-tsrx (score; >1 means slower than octane):');
	for (const r of results) {
		if (r.name === 'octane-tsrx') continue;
		for (const scenario of SCENARIOS) {
			const a = r.scenarios[scenario];
			const b = octane.scenarios[scenario];
			if (!a || !b) continue;
			console.log(
				`  ${r.name.padEnd(8)} ${scenario.padEnd(10)} shell ${(scoreOf(a.shell) / scoreOf(b.shell)).toFixed(2)}x  total ${(scoreOf(a.total) / scoreOf(b.total)).toFixed(2)}x`,
			);
		}
	}
}

if (failures.length > 0) {
	console.error(`\n✗ correctness gate failures:\n  - ${failures.join('\n  - ')}`);
}

// ── BENCH_JSON contract ───────────────────────────────────────────────────────
if (process.env.BENCH_JSON) {
	const out = {
		suite: 'streaming-ssr',
		iterations: ITER,
		targets: results.map((r) => {
			const st = r.scenarios['staggered'];
			const af = r.scenarios['all-fast'];
			const ops = {};
			if (st) {
				ops.shell_staggered = timingStatForJson(st.shell);
				ops.total_staggered = timingStatForJson(st.total);
			}
			if (af) {
				ops.shell_allfast = timingStatForJson(af.shell);
				ops.total_allfast = timingStatForJson(af.total);
			}
			return {
				name: r.name,
				ops,
				meta: {
					chunksStaggered: st ? st.chunkCount : null,
					bytesStaggered: st ? st.bytes : null,
					skeletonsStaggered: st ? st.skeletonsInStream : null,
					chunksAllFast: af ? af.chunkCount : null,
					bytesAllFast: af ? af.bytes : null,
					skeletonsAllFast: af ? af.skeletonsInStream : null,
					rendersPerSecAllFast: af ? af.total.opsPerSec : null,
				},
			};
		}),
	};
	if (failures.length > 0) out.failed = failures.join('; ');
	fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(out, null, '\t') + '\n');
	console.error(`\nBENCH_JSON written → ${process.env.BENCH_JSON}`);
}

process.exit(failures.length > 0 ? 1 : 0);
