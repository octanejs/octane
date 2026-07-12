// Unified Octane benchmark runner — the CI/regression layer that makes every
// per-suite number load-bearing.
//
// It knows how to, for each suite: production-build the fixture apps, start
// their preview servers (pnpm --filter <pkg> preview), wait for their strict
// ports, run the suite's harness with BENCH_JSON pointed at a temp file, collect
// the machine-readable results, then kill the servers by port. Suites run
// SEQUENTIALLY so ports and CPU never contend. The collected JSON per suite
// lands in the results dir (default benchmarks/results, gitignored) and drives
// three checks:
//
//   --record    write the current numbers as the committed absolute baselines
//               (baselines/local/<suite>.json).
//   --compare   fail if any op regressed vs those baselines (noise-aware rule).
//   --ratios    fail if any committed ratio guard (baselines/ratios.json) is
//               breached. Ratios are hardware-INDEPENDENT (target/reference on
//               the SAME machine in the SAME run), so CI can enforce them from
//               day one — unlike absolute baselines, which are machine-specific.
//
// Absolute-baseline comparison (--record / --compare) is LOCAL-ONLY by design:
// the committed baselines/local numbers are whatever machine recorded them, so
// they are a personal regression aid, not a CI gate. CI runs --ratios only.
//
// Usage:
//   node benchmarks/bench.mjs [suite ...]        # default: all suites
//   node benchmarks/bench.mjs --quick js-framework memo-wall
//   node benchmarks/bench.mjs --record           # refresh local baselines
//   node benchmarks/bench.mjs --compare          # regression check vs baselines
//   node benchmarks/bench.mjs --ratios           # ratio-guard check (CI gate)
//   node benchmarks/bench.mjs --record --ratios  # also write ratios.suggested.json
//   flags: --quick  --baseline-dir=<dir>  --results-dir=<dir>  --list
//
// See benchmarks/README.md for the manifest / how to add a suite.

import { spawn, spawnSync, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
const BENCH = __dirname;

// ── manifest ────────────────────────────────────────────────────────────────
// Each suite: name, cwd (where its harness resolves its deps — playwright/vite
// live in the fixture package's node_modules, so the harness MUST run from the
// suite dir), servers [{ filter, port }] to build and boot in production preview
// mode, and runs[] — one or more harness invocations whose BENCH_JSON payloads
// are MERGED (their `targets` arrays concatenated) into a single suite result.
// `iter` supplies the iteration knob (normal vs quick) each run's argv builder
// receives.
//
// `env(iter, quick)` returns extra process env for a run — used by the deopt
// suites to pair a tuned fixture against its naive/de-opt twin via TARGETS.

const url = (port) => `http://localhost:${port}/`;

// Harness gate (correctness) failures are fatal unless the suite has an ACTIVE
// waiver here. A waiver needs a reason (ideally an issue link) and an expiry
// date — when it lapses the failure becomes fatal again and must be re-triaged,
// so a known-bug exemption cannot quietly become permanent.
const HARNESS_FAILURE_ALLOWLIST = {
	'js-framework-reorder': {
		reason: "ripple's keyed reorder drops row identity — upstream ripple bug, not octane",
		expires: '2026-10-01',
	},
};
const todayISO = () => new Date().toISOString().slice(0, 10);

const SUITES = [
	{
		name: 'js-framework',
		cwd: 'js-framework',
		servers: [
			{ filter: 'react-jsbench', port: 5175 },
			{ filter: 'octane-tsrx-jsbench', port: 5176 },
			{ filter: 'octane-jsx-jsbench', port: 5177 },
			{ filter: 'ripple-jsbench', port: 5178 },
			{ filter: 'solid-jsbench', port: 5179 },
			{ filter: 'vue-vapor-jsbench', port: 5180 },
		],
		iter: { normal: 8, quick: 3 },
		runs: [{ script: 'run.mjs', args: (n) => [String(n)] }],
	},
	{
		name: 'js-framework-reorder',
		cwd: 'js-framework',
		servers: [
			{ filter: 'react-jsbench', port: 5175 },
			{ filter: 'octane-tsrx-jsbench', port: 5176 },
			{ filter: 'octane-jsx-jsbench', port: 5177 },
			{ filter: 'ripple-jsbench', port: 5178 },
			{ filter: 'solid-jsbench', port: 5179 },
			{ filter: 'vue-vapor-jsbench', port: 5180 },
		],
		iter: { normal: 8, quick: 3 },
		runs: [{ script: 'run-reorder.mjs', args: (n) => [String(n)] }],
	},
	{
		name: 'todomvc',
		cwd: 'todomvc',
		servers: [
			{ filter: 'octane-tsrx-todomvc', port: 5240 },
			{ filter: 'react-todomvc', port: 5241 },
			{ filter: 'solid-todomvc', port: 5242 },
			{ filter: 'ripple-todomvc', port: 5243 },
			{ filter: 'vue-vapor-todomvc', port: 5244 },
		],
		iter: { normal: 8, quick: 3 },
		runs: [{ script: 'run.mjs', args: (n) => [String(n)] }],
	},
	{
		name: 'chat-stream',
		cwd: 'chat-stream',
		servers: [
			{ filter: 'octane-tsrx-chat-stream', port: 5250 },
			{ filter: 'react-chat-stream', port: 5251 },
			{ filter: 'solid-chat-stream', port: 5252 },
			{ filter: 'ripple-chat-stream', port: 5253 },
			{ filter: 'vue-vapor-chat-stream', port: 5254 },
		],
		iter: { normal: 8, quick: 3 },
		runs: [{ script: 'run.mjs', args: (n) => [String(n)] }],
	},
	{
		name: 'dbmon',
		cwd: 'dbmon',
		servers: [
			{ filter: 'octane-tsrx-dbmon-bench', port: 5196 },
			{ filter: 'octane-jsx-dbmon-bench', port: 5197 },
			{ filter: 'react-dbmon-bench', port: 5198 },
			{ filter: 'ripple-dbmon-bench', port: 5199 },
			{ filter: 'solid-dbmon-bench', port: 5200 },
			{ filter: 'vue-vapor-dbmon-bench', port: 5220 },
		],
		iter: { normal: 30, quick: 3 },
		runs: [{ script: 'run.mjs', args: (n) => [String(n)] }],
	},
	{
		name: 'recursive-context',
		cwd: 'recursive-context',
		servers: [
			{ filter: 'ripple-recursive-bench', port: 5184 },
			{ filter: 'octane-tsrx-recursive-bench', port: 5185 },
			{ filter: 'react-recursive-bench', port: 5186 },
			{ filter: 'solid-recursive-bench', port: 5187 },
			{ filter: 'octane-jsx-recursive-bench', port: 5188 },
			{ filter: 'vue-vapor-recursive-bench', port: 5189 },
		],
		iter: { normal: 20, quick: 3 },
		runs: [{ script: 'run.mjs', args: (n) => [String(n)] }],
	},
	{
		name: 'signal-favoring',
		cwd: 'signal-favoring',
		servers: [
			{ filter: 'octane-tsrx-signal-bench', port: 5190 },
			{ filter: 'solid-signal-bench', port: 5191 },
			{ filter: 'react-signal-bench', port: 5192 },
			{ filter: 'ripple-signal-bench', port: 5193 },
			{ filter: 'octane-jsx-signal-bench', port: 5194 },
			{ filter: 'vue-vapor-signal-bench', port: 5183 },
		],
		iter: { normal: 20, quick: 3 },
		runs: [{ script: 'run.mjs', args: (n) => [String(n)] }],
	},
	{
		// News is build-based (no preview servers): its harness vite-builds each
		// target and times the built SSR + hydration. One invocation per target;
		// the per-target single-target payloads are merged into one `news` result.
		name: 'news',
		cwd: 'news',
		servers: [],
		iter: { normal: 20, quick: 3 },
		runs: ['octane-tsrx', 'octane-jsx', 'react', 'ripple', 'solid', 'vue-vapor'].map((target) => ({
			label: target,
			script: 'run.mjs',
			args: (n) => [target, String(n)],
		})),
	},
	{
		name: 'effectful-list',
		cwd: 'effectful-list',
		servers: [
			{ filter: 'octane-tsrx-effectful-list-bench', port: 5201 },
			{ filter: 'octane-jsx-effectful-list-bench', port: 5202 },
			{ filter: 'react-effectful-list-bench', port: 5203 },
			{ filter: 'solid-effectful-list-bench', port: 5204 },
			{ filter: 'ripple-effectful-list-bench', port: 5205 },
			{ filter: 'vue-vapor-effectful-list-bench', port: 5221 },
		],
		iter: { normal: 30, quick: 3 },
		runs: [{ script: 'run.mjs', args: (n) => [String(n)] }],
	},
	{
		name: 'memo-wall',
		cwd: 'memo-wall',
		servers: [
			{ filter: 'octane-tsrx-memowall-bench', port: 5206 },
			{ filter: 'octane-jsx-memowall-bench', port: 5207 },
			{ filter: 'react-memowall-bench', port: 5208 },
			{ filter: 'solid-memowall-bench', port: 5182 },
			{ filter: 'ripple-memowall-bench', port: 5225 },
			{ filter: 'vue-vapor-memowall-bench', port: 5223 },
		],
		iter: { normal: 20, quick: 3 },
		runs: [{ script: 'run.mjs', args: (n) => [String(n)] }],
	},
	{
		name: 'portal-swarm',
		cwd: 'portal-swarm',
		servers: [
			{ filter: 'octane-tsrx-portal-swarm-bench', port: 5210 },
			{ filter: 'react-portal-swarm-bench', port: 5211 },
			{ filter: 'solid-portal-swarm-bench', port: 5212 },
			{ filter: 'ripple-portal-swarm-bench', port: 5224 },
			{ filter: 'vue-vapor-portal-swarm-bench', port: 5181 },
		],
		iter: { normal: 20, quick: 3 },
		runs: [{ script: 'run.mjs', args: (n) => [String(n)] }],
	},
	{
		// Node-only (no servers, no browser). Time-budgeted: the iteration knob is a
		// per-config SECONDS budget; --quick passes the harness's own --quick flag.
		name: 'ssr-throughput',
		cwd: 'ssr-throughput',
		servers: [],
		iter: { normal: 10, quick: 2 },
		runs: [{ script: 'run.mjs', args: (n, quick) => (quick ? ['--quick'] : [String(n)]) }],
	},
	{
		// Node-only streaming SSR (no servers, no browser): shell TTFB, stream-end
		// total, chunk framing + all-fast throughput for octane
		// renderToPipeableStream vs React Fizz vs Solid renderToStream vs Ripple's
		// stream mode. Iteration-counted (renders per target per scenario).
		name: 'streaming-ssr',
		cwd: 'streaming-ssr',
		servers: [],
		iter: { normal: 30, quick: 3 },
		runs: [{ script: 'run.mjs', args: (n) => [String(n)] }],
	},
	{
		// De-opt cliff (dbmon): tuned .tsrx fixture vs the plain-.ts createElement
		// twin, driven through dbmon's own harness via a TARGETS pairing.
		name: 'dbmon-deopt',
		cwd: 'dbmon',
		servers: [
			{ filter: 'octane-tsrx-dbmon-bench', port: 5196 },
			{ filter: 'octane-deopt-dbmon-bench', port: 5209 },
		],
		iter: { normal: 30, quick: 3 },
		runs: [
			{
				script: 'run.mjs',
				args: (n) => [String(n)],
				env: () => ({
					TARGETS: JSON.stringify([
						{ name: 'octane-tsrx', url: url(5196) },
						{ name: 'octane-deopt', url: url(5209) },
					]),
				}),
			},
		],
	},
	{
		// De-opt cliff (js-framework): tuned .tsrx baseline vs the naive triplet
		// (tsrx-naive / jsx-naive / plain-.ts), via a TARGETS pairing through the
		// existing js-framework harness.
		name: 'js-framework-deopt',
		cwd: 'js-framework',
		servers: [
			{ filter: 'octane-tsrx-jsbench', port: 5176 },
			{ filter: 'octane-tsrx-naive-jsbench', port: 5213 },
			{ filter: 'octane-jsx-naive-jsbench', port: 5214 },
			{ filter: 'octane-ts-jsbench', port: 5215 },
		],
		iter: { normal: 8, quick: 3 },
		runs: [
			{
				script: 'run.mjs',
				args: (n) => [String(n)],
				env: () => ({
					TARGETS: JSON.stringify([
						{ name: 'octane-tsrx', url: url(5176), ready: '#run' },
						{ name: 'octane-tsrx-naive', url: url(5213), ready: '#run' },
						{ name: 'octane-jsx-naive', url: url(5214), ready: '#run' },
						{ name: 'octane-ts', url: url(5215), ready: '#run' },
					]),
				}),
			},
		],
	},
	{
		// Async data-loading model (10 nested async levels, 16ms simulated latency
		// per level): React's nested `use()` serializes the fetches (the suspense
		// waterfall, ≈10-19× the latency floor). Octane compiles the SAME idiomatic
		// nested-use code with the parallelUse pipeline (memoized creations +
		// batched unwrap + fetch-tree warming — docs/suspense-parallel-use-plan.md)
		// and lands at the parallel floor alongside Solid 2.0 / ripple (≈1.2×).
		// Guarded both ways: ≤0.25× React, ≤1.5× solid/ripple.
		name: 'async-waterfall',
		cwd: 'async-waterfall',
		servers: [
			{ filter: 'octane-tsrx-async-bench', port: 5216 },
			{ filter: 'react-async-bench', port: 5217 },
			{ filter: 'solid-async-bench', port: 5218 },
			{ filter: 'ripple-async-bench', port: 5219 },
		],
		iter: { normal: 10, quick: 2 },
		runs: [{ script: 'run.mjs', args: (n) => [String(n)] }],
	},
	{
		// Compiled-output size (Node-only, seconds-fast): compiles a fixed
		// .tsrx/.tsx corpus through octane/compiler with prod settings and reports
		// raw/minified/gzip bytes as `source` vs `compiled` targets — the per-commit
		// codegen-size regression signal. Deterministic; the iteration knob is unused.
		name: 'codegen-size',
		cwd: 'codegen-size',
		servers: [],
		iter: { normal: 1, quick: 1 },
		runs: [{ script: 'run.mjs', args: () => [] }],
	},
	{
		// Shipped-bytes comparison (Node-only): production `vite build` of each
		// js-framework app with ONE normalized minify setting, reporting raw/gzip/
		// brotli JS bytes per framework. Deterministic; the iteration knob is unused.
		name: 'bundle-size',
		cwd: 'bundle-size',
		servers: [],
		iter: { normal: 1, quick: 1 },
		runs: [{ script: 'run.mjs', args: () => [] }],
	},
];

const SUITE_BY_NAME = new Map(SUITES.map((s) => [s.name, s]));

// ── args ──────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--') && !a.includes('=')));
const kv = new Map(
	argv
		.filter((a) => a.startsWith('--') && a.includes('='))
		.map((a) => {
			const i = a.indexOf('=');
			return [a.slice(2, i), a.slice(i + 1)];
		}),
);
const selectedNames = argv.filter((a) => !a.startsWith('--'));

const QUICK = flags.has('--quick');
const RECORD = flags.has('--record');
const COMPARE = flags.has('--compare');
const RATIOS = flags.has('--ratios');
const LIST = flags.has('--list');

const BASELINE_DIR = path.resolve(REPO, kv.get('baseline-dir') || 'benchmarks/baselines/local');
const RATIOS_FILE = path.resolve(REPO, 'benchmarks/baselines/ratios.json');
const RESULTS_DIR = path.resolve(REPO, kv.get('results-dir') || 'benchmarks/results');

if (LIST) {
	console.log('Available suites:');
	for (const s of SUITES) console.log(`  ${s.name}`);
	process.exit(0);
}

const suitesToRun = selectedNames.length
	? selectedNames.map((n) => {
			const s = SUITE_BY_NAME.get(n);
			if (!s) {
				console.error(`✗ unknown suite "${n}" — use --list to see suite names`);
				process.exit(2);
			}
			return s;
		})
	: SUITES;

// ── small utilities ─────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function portUp(port) {
	// A single non-blocking probe: curl returns 0 as soon as the port answers
	// (any HTTP status counts — vite may 404 a path but the server is up).
	try {
		execFileSync('curl', ['-s', '-o', '/dev/null', '--max-time', '2', url(port)], {
			stdio: 'ignore',
		});
		return true;
	} catch {
		return false;
	}
}

async function waitForPort(port, timeoutMs = 90_000) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (portUp(port)) return true;
		await sleep(500);
	}
	return false;
}

function pidsOnPort(port) {
	try {
		const out = execFileSync('lsof', ['-ti', `tcp:${port}`], { encoding: 'utf8' });
		return out
			.split('\n')
			.map((s) => s.trim())
			.filter(Boolean);
	} catch {
		return [];
	}
}

function killPort(port) {
	for (const pid of pidsOnPort(port)) {
		try {
			process.kill(Number(pid), 'SIGKILL');
		} catch {
			/* already gone */
		}
	}
}

function tailFile(file, lines = 15) {
	if (!fs.existsSync(file)) return '(no log)';
	return fs.readFileSync(file, 'utf8').split('\n').slice(-lines).join('\n');
}

const builtServerFilters = new Set();

function buildServer(filter, logDir) {
	if (builtServerFilters.has(filter)) return;
	const logPath = path.join(logDir, `build-${filter}.log`);
	const logFd = fs.openSync(logPath, 'w');
	const res = spawnSync('pnpm', ['--filter', filter, 'build'], {
		cwd: REPO,
		stdio: ['ignore', logFd, logFd],
	});
	fs.closeSync(logFd);
	if ((res.status ?? 1) !== 0) {
		throw new Error(
			`build failed for ${filter}\n--- log tail (${path.relative(REPO, logPath)}) ---\n${tailFile(logPath)}`,
		);
	}
	builtServerFilters.add(filter);
}

// Start `pnpm --filter <filter> preview` detached, logging to the results dir.
// The corresponding `build` has already run, so browser suites compare
// production bundles instead of Vite's dev transform/runtime. We track BOTH the
// child (to signal its process group) and the port (the reliable kill handle —
// vite forks, so killing by listening port is what actually frees it, per the
// spec).
function startServer(filter, port, logDir) {
	const logPath = path.join(logDir, `server-${port}.log`);
	const logFd = fs.openSync(logPath, 'w');
	const child = spawn('pnpm', ['--filter', filter, 'preview'], {
		cwd: REPO,
		detached: true,
		stdio: ['ignore', logFd, logFd],
	});
	child.unref();
	return { filter, port, child, logPath };
}

function stopServers(servers) {
	for (const s of servers) {
		// Kill the listening port first (frees it for the next suite), then the
		// spawned process group as a belt-and-braces cleanup.
		killPort(s.port);
		try {
			if (s.child.pid) process.kill(-s.child.pid, 'SIGKILL');
		} catch {
			/* ignore */
		}
	}
}

// Run one harness invocation; returns { code, json|null }.
function runHarness(suite, run, outPath) {
	const n = QUICK ? suite.iter.quick : suite.iter.normal;
	const args = [run.script, ...run.args(n, QUICK)];
	const env = { ...process.env, BENCH_JSON: outPath, ...(run.env ? run.env(n, QUICK) : {}) };
	if (fs.existsSync(outPath)) fs.rmSync(outPath);
	const label = run.label ? `${suite.name}/${run.label}` : suite.name;
	console.error(
		`  ▶ node ${args.join(' ')}  (iter=${QUICK ? suite.iter.quick : suite.iter.normal})`,
	);
	const res = spawnSync('node', args, {
		cwd: path.join(BENCH, suite.cwd),
		env,
		stdio: 'inherit',
	});
	let json = null;
	if (fs.existsSync(outPath)) {
		try {
			json = JSON.parse(fs.readFileSync(outPath, 'utf8'));
		} catch (e) {
			console.error(`  ! ${label}: BENCH_JSON at ${outPath} did not parse: ${e.message}`);
		}
	}
	return { code: res.status ?? 1, json };
}

// ── run one suite end-to-end ─────────────────────────────────────────────────

async function runSuite(suite) {
	console.error(`\n=== ${suite.name} ===`);
	fs.mkdirSync(RESULTS_DIR, { recursive: true });

	const started = [];
	try {
		for (const srv of suite.servers) {
			console.error(`  building ${srv.filter}…`);
			buildServer(srv.filter, RESULTS_DIR);
			console.error(`  starting ${srv.filter} preview on :${srv.port}…`);
			killPort(srv.port); // clear any stale listener from a crashed prior run
			started.push(startServer(srv.filter, srv.port, RESULTS_DIR));
		}
		for (const srv of started) {
			const ok = await waitForPort(srv.port);
			if (!ok) {
				throw new Error(
					`server ${srv.filter} never came up on :${srv.port}\n--- log tail (${path.relative(REPO, srv.logPath)}) ---\n${tailFile(srv.logPath)}`,
				);
			}
			console.error(`  ✓ :${srv.port} ready`);
		}

		// Run each invocation; merge their payloads' targets into one result.
		const merged = { suite: suite.name, iterations: null, targets: [] };
		const failedParts = [];
		let anyExit = 0;
		for (let i = 0; i < suite.runs.length; i++) {
			const run = suite.runs[i];
			const outPath = path.join(RESULTS_DIR, `_tmp-${suite.name}-${run.label || i}.json`);
			const { code, json } = runHarness(suite, run, outPath);
			if (code !== 0) anyExit = code;
			if (json) {
				merged.iterations = json.iterations ?? merged.iterations;
				if (Array.isArray(json.targets)) merged.targets.push(...json.targets);
				if (json.failed) failedParts.push(json.failed);
			}
			fs.rmSync(outPath, { force: true });
		}
		if (failedParts.length) merged.failed = failedParts.join(' | ');
		merged.harnessExit = anyExit;

		const resultPath = path.join(RESULTS_DIR, `${suite.name}.json`);
		fs.writeFileSync(resultPath, JSON.stringify(merged, null, '\t') + '\n');
		console.error(`  → wrote ${path.relative(REPO, resultPath)}`);
		if (merged.targets.length === 0) {
			throw new Error('no targets produced numbers (harness wrote no parseable BENCH_JSON)');
		}
		if (merged.failed) console.error(`  ! harness reported gate failure(s): ${merged.failed}`);
		return merged;
	} finally {
		if (started.length) {
			console.error(`  stopping ${started.length} server(s)…`);
			stopServers(started);
		}
	}
}

// ── baseline compare (noise-aware) ────────────────────────────────────────────

const scoreOf = (stat) => stat?.score ?? stat?.median;

// Regression iff score > base.score*1.15 AND min > base.min*1.10. For ops with
// base score < 1ms, additionally require an absolute excess > 0.1ms so timer
// granularity (0.1ms in Chromium) on sub-ms ops can't trip a false regression.
// Older baselines do not have `score`; they transparently fall back to median.
function compareResult(result, baseline) {
	const rows = [];
	const baseTargets = new Map((baseline.targets || []).map((t) => [t.name, t]));
	for (const t of result.targets) {
		const bt = baseTargets.get(t.name);
		if (!bt) continue;
		for (const [op, r] of Object.entries(t.ops)) {
			const b = bt.ops[op];
			if (!b) continue;
			const score = scoreOf(r);
			const baseScore = scoreOf(b);
			const scoreOver = score > baseScore * 1.15;
			const minOver = r.min > b.min * 1.1;
			const smallOk = baseScore < 1 ? score - baseScore > 0.1 : true;
			const regressed = scoreOver && minOver && smallOk;
			rows.push({
				target: t.name,
				op,
				score,
				baseScore,
				median: r.median,
				baseMedian: b.median,
				min: r.min,
				baseMin: b.min,
				regressed,
			});
		}
	}
	return rows;
}

function printCompareTable(suiteName, rows) {
	const regs = rows.filter((r) => r.regressed);
	console.log(`\n[compare] ${suiteName}: ${rows.length} op(s), ${regs.length} regression(s)`);
	if (regs.length === 0) {
		console.log('  PASS — no regressions');
		return 0;
	}
	console.log(
		'  target                    op                         score  (base)     min  (base)',
	);
	for (const r of regs) {
		console.log(
			`  REGRESSION ${r.target.padEnd(16)} ${r.op.padEnd(24)} ` +
				`${r.score.toFixed(3)} (${r.baseScore.toFixed(3)})  ${r.min.toFixed(3)} (${r.baseMin.toFixed(3)})`,
		);
	}
	return regs.length;
}

// ── ratio guards (hardware-independent) ───────────────────────────────────────

function loadRatios() {
	if (!fs.existsSync(RATIOS_FILE)) return [];
	try {
		const parsed = JSON.parse(fs.readFileSync(RATIOS_FILE, 'utf8'));
		return Array.isArray(parsed) ? parsed : parsed.guards || [];
	} catch (e) {
		console.error(`✗ ${RATIOS_FILE} did not parse: ${e.message}`);
		process.exit(2);
	}
}

// For a set of collected suite results, check every guard whose (suite, target,
// reference, op) all ran. ratio = target score / reference score; a breach is
// ratio > maxRatio or, for cliff/advantage guards, ratio < minRatio. Existing
// median-only baselines fall back to median. Returns { checked, breaches[],
// suggestions[] }.
function checkRatios(resultsBySuite, guards) {
	const breaches = [];
	const suggestions = [];
	let checked = 0;
	const opScore = (suite, targetName, op) => {
		const res = resultsBySuite.get(suite);
		if (!res) return null;
		const t = res.targets.find((x) => x.name === targetName);
		if (!t || !t.ops[op]) return null;
		return scoreOf(t.ops[op]);
	};
	for (const g of guards) {
		const tScore = opScore(g.suite, g.target, g.op);
		const rScore = opScore(g.suite, g.reference, g.op);
		if (tScore == null || rScore == null || rScore === 0) continue; // both sides must have run
		checked++;
		const ratio = tScore / rScore;
		const hasMax = typeof g.maxRatio === 'number';
		const hasMin = typeof g.minRatio === 'number';
		const highBreach = hasMax && ratio > g.maxRatio;
		const lowBreach = hasMin && ratio < g.minRatio;
		if (highBreach || lowBreach) breaches.push({ ...g, ratio, highBreach, lowBreach });
		// Suggest fresh guard bounds with 1.5× headroom around the observed ratio.
		const suggestion = { ...g, observedRatio: ratio };
		if (hasMax) suggestion.suggestedMaxRatio = Math.ceil(ratio * 15) / 10;
		if (hasMin) suggestion.suggestedMinRatio = Math.floor((ratio / 1.5) * 10) / 10;
		suggestions.push(suggestion);
	}
	return { checked, breaches, suggestions };
}

function formatRatioBounds(guard) {
	const bounds = [];
	if (typeof guard.minRatio === 'number') bounds.push(`minRatio ${guard.minRatio}`);
	if (typeof guard.maxRatio === 'number') bounds.push(`maxRatio ${guard.maxRatio}`);
	return bounds.join(', ');
}

// ── main ──────────────────────────────────────────────────────────────────────

(async () => {
	const modeBits = [QUICK && 'quick', RECORD && 'record', COMPARE && 'compare', RATIOS && 'ratios']
		.filter(Boolean)
		.join(' + ');
	console.error(
		`bench.mjs — ${suitesToRun.length} suite(s)${modeBits ? ` [${modeBits}]` : ''}\n` +
			`  results → ${path.relative(REPO, RESULTS_DIR)}\n` +
			`  baselines → ${path.relative(REPO, BASELINE_DIR)}`,
	);

	const resultsBySuite = new Map();
	const hardErrors = [];
	for (const suite of suitesToRun) {
		try {
			const res = await runSuite(suite);
			resultsBySuite.set(suite.name, res);
		} catch (e) {
			console.error(`✗ ${suite.name}: ${e.message}`);
			hardErrors.push(`${suite.name}: ${e.message}`);
		}
	}

	// record
	if (RECORD) {
		fs.mkdirSync(BASELINE_DIR, { recursive: true });
		for (const [name, res] of resultsBySuite) {
			const p = path.join(BASELINE_DIR, `${name}.json`);
			fs.writeFileSync(p, JSON.stringify(res, null, '\t') + '\n');
			console.error(`[record] wrote ${path.relative(REPO, p)}`);
		}
	}

	// compare
	let regressionCount = 0;
	if (COMPARE) {
		for (const [name, res] of resultsBySuite) {
			const bpath = path.join(BASELINE_DIR, `${name}.json`);
			if (!fs.existsSync(bpath)) {
				console.log(
					`\n[compare] ${name}: no baseline at ${path.relative(REPO, bpath)} — skipped (run --record first)`,
				);
				continue;
			}
			const baseline = JSON.parse(fs.readFileSync(bpath, 'utf8'));
			regressionCount += printCompareTable(name, compareResult(res, baseline));
		}
	}

	// ratios
	let ratioBreaches = 0;
	if (RATIOS) {
		const guards = loadRatios();
		const { checked, breaches, suggestions } = checkRatios(resultsBySuite, guards);
		console.log(
			`\n[ratios] checked ${checked}/${guards.length} guard(s) (only those whose both sides ran)`,
		);
		if (breaches.length === 0) {
			console.log('  PASS — no ratio guards breached');
		} else {
			for (const b of breaches) {
				console.log(
					`  BREACH ${b.suite} ${b.op}: ${b.target}/${b.reference} = ${b.ratio.toFixed(2)}x outside ${formatRatioBounds(b)}`,
				);
			}
		}
		ratioBreaches = breaches.length;
		// --record --ratios refreshes SUGGESTIONS without overwriting ratios.json.
		if (RECORD && suggestions.length) {
			const sp = path.resolve(REPO, 'benchmarks/baselines/ratios.suggested.json');
			fs.writeFileSync(sp, JSON.stringify(suggestions, null, '\t') + '\n');
			console.error(
				`[ratios] wrote suggestions → ${path.relative(REPO, sp)} (review, don't auto-copy)`,
			);
		}
	}

	// ── exit policy ──────────────────────────────────────────────────────────
	// Hard errors (a server never came up, a suite produced no numbers) always
	// fail. --compare fails on regressions; --ratios fails on breaches. A harness
	// gate failure (harnessExit != 0) is a CORRECTNESS failure and is fatal by
	// default — performance ratios may be tolerant, correctness may not. A suite
	// with a known upstream bug can be allowlisted below, but only with a reason
	// and an expiry date so the exemption cannot silently outlive the bug.
	let exit = 0;
	if (hardErrors.length) {
		console.error(`\n✗ ${hardErrors.length} hard error(s):`);
		for (const e of hardErrors) console.error(`  - ${e}`);
		exit = 1;
	}
	if (COMPARE && regressionCount > 0) {
		console.error(`\n✗ ${regressionCount} regression(s) vs baseline`);
		exit = 1;
	}
	if (RATIOS && ratioBreaches > 0) {
		console.error(`\n✗ ${ratioBreaches} ratio guard breach(es)`);
		exit = 1;
	}
	const gateFails = [...resultsBySuite.values()].filter(
		(r) => r.harnessExit && r.harnessExit !== 0,
	);
	for (const r of gateFails) {
		const waiver = HARNESS_FAILURE_ALLOWLIST[r.suite];
		const active = waiver && todayISO() <= waiver.expires;
		if (active) {
			console.error(
				`\n! ${r.suite}: harness gate failure waived until ${waiver.expires} — ${waiver.reason}` +
					(r.failed ? ` (${r.failed})` : ''),
			);
		} else {
			console.error(
				`\n✗ ${r.suite}: harness gate failure${r.failed ? ` (${r.failed})` : ''}` +
					(waiver ? ` — waiver expired ${waiver.expires} (${waiver.reason})` : ''),
			);
			exit = 1;
		}
	}
	process.exit(exit);
})().catch((e) => {
	console.error(e);
	process.exit(1);
});
