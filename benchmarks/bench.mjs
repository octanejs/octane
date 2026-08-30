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
//   --ratios    fail if any applicable committed ratio guard
//               (baselines/ratios.json) is breached. Both sides run on the SAME
//               machine in the SAME run; byte/count ratios are deterministic,
//               while timing ratios use explicit noise headroom.
//
// Absolute-baseline comparison (--record / --compare) is LOCAL-ONLY by design.
// Timing records depend on the recording machine; deterministic byte/count
// records depend on the exact fixture and toolchain. CI runs --ratios only.
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
			{ filter: 'preact-jsbench', port: 5260 },
			{ filter: 'svelte-jsbench', port: 5271 },
			{ filter: 'inferno-jsbench', port: 5320 },
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
			{ filter: 'preact-jsbench', port: 5260 },
			{ filter: 'svelte-jsbench', port: 5271 },
			{ filter: 'inferno-jsbench', port: 5320 },
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
			{ filter: 'preact-todomvc', port: 5261 },
			{ filter: 'svelte-todomvc', port: 5272 },
			{ filter: 'inferno-todomvc', port: 5321 },
		],
		iter: { normal: 8, quick: 3 },
		runs: [{ script: 'run.mjs', args: (n) => [String(n)] }],
	},
	{
		name: 'weather-app',
		cwd: 'weather-app',
		servers: [
			{ filter: 'octane-tsrx-weather-app-bench', port: 5292 },
			{ filter: 'react-weather-app-bench', port: 5293 },
			{ filter: 'preact-weather-app-bench', port: 5294 },
			{ filter: 'solid-weather-app-bench', port: 5295 },
			{ filter: 'svelte-weather-app-bench', port: 5296 },
			{ filter: 'vue-weather-app-bench', port: 5297 },
			{ filter: 'inferno-weather-app-bench', port: 5335 },
		],
		iter: { normal: 8, quick: 3 },
		runs: [{ script: 'run.mjs', args: (n) => [String(n)] }],
	},
	{
		name: 'weather-app-lighthouse',
		cwd: 'weather-app',
		servers: [
			{ filter: 'octane-tsrx-weather-app-bench', port: 5292 },
			{ filter: 'react-weather-app-bench', port: 5293 },
			{ filter: 'preact-weather-app-bench', port: 5294 },
			{ filter: 'solid-weather-app-bench', port: 5295 },
			{ filter: 'svelte-weather-app-bench', port: 5296 },
			{ filter: 'vue-weather-app-bench', port: 5297 },
			{ filter: 'inferno-weather-app-bench', port: 5335 },
		],
		iter: { normal: 5, quick: 3 },
		runs: [{ script: 'lighthouse.mjs', args: (n) => [String(n)] }],
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
			{ filter: 'preact-chat-stream', port: 5262 },
			{ filter: 'svelte-chat-stream', port: 5273 },
			{ filter: 'inferno-chat-stream', port: 5323 },
		],
		iter: { normal: 8, quick: 3 },
		runs: [{ script: 'run.mjs', args: (n) => [String(n)] }],
	},
	{
		// React-hosted migration boundary: the same React 19 host renders either
		// upstream Streamdown directly or @octanejs/streamdown through
		// OctaneCompat. The browser harness checks semantic DOM parity before
		// publishing mount, replacement, and token-stream timings.
		name: 'streamdown-hosted',
		cwd: 'streamdown-hosted',
		servers: [
			{ filter: 'react-streamdown-hosted-bench', port: 5300 },
			{ filter: 'octane-streamdown-hosted-bench', port: 5301 },
		],
		iter: { normal: 8, quick: 3 },
		runs: [{ script: 'run.mjs', args: (n) => [String(n)] }],
	},
	{
		// Hand-rolled-SVG observability dashboard (no chart libs): path-d and
		// transform churn, keyed reconcile inside <svg>, foreignObject labels,
		// portal tooltip overlay, and a createElement icon layer (octane's
		// de-opt path). The harness byte-compares the DOM against a Node-side
		// replay of the shared ops module and cross-hashes DOM parity across
		// all four fixtures before timing anything.
		name: 'svg-dashboard',
		cwd: 'svg-dashboard',
		servers: [
			{ filter: 'octane-tsrx-svg-dashboard-bench', port: 5302 },
			{ filter: 'react-svg-dashboard-bench', port: 5303 },
			{ filter: 'solid-svg-dashboard-bench', port: 5304 },
			{ filter: 'svelte-svg-dashboard-bench', port: 5305 },
			{ filter: 'inferno-svg-dashboard-bench', port: 5324 },
		],
		iter: { normal: 20, quick: 3 },
		runs: [{ script: 'run.mjs', args: (n) => [String(n)] }],
	},
	{
		// Fresh implementation of localvoid/UIbench's complete 96-case desktop
		// matrix: tables, sparse animation updates, keyed flat/deep tree
		// transforms, historical worst cases, and large no-change diffs. Every
		// endpoint and surviving node identity is correctness-gated before timing.
		name: 'uibench',
		cwd: 'uibench',
		servers: [
			{ filter: 'octane-tsrx-uibench-bench', port: 5315 },
			{ filter: 'react-uibench-bench', port: 5316 },
			{ filter: 'solid-uibench-bench', port: 5317 },
			{ filter: 'preact-uibench-bench', port: 5318 },
			{ filter: 'vue-vapor-uibench-bench', port: 5319 },
			{ filter: 'ripple-uibench-bench', port: 5322 },
			{ filter: 'inferno-uibench-bench', port: 5325 },
		],
		iter: { normal: 10, quick: 2 },
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
			{ filter: 'preact-dbmon-bench', port: 5263 },
			{ filter: 'svelte-dbmon-bench', port: 5274 },
			{ filter: 'inferno-dbmon-bench', port: 5326 },
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
			{ filter: 'preact-recursive-bench', port: 5264 },
			{ filter: 'svelte-recursive-bench', port: 5275 },
			{ filter: 'inferno-recursive-bench', port: 5327 },
		],
		iter: { normal: 20, quick: 3 },
		runs: [
			{ script: 'run.mjs', args: (n) => [String(n)] },
			{ label: 'work', script: 'work.mjs', args: () => [] },
		],
	},
	{
		name: 'spa-navigation',
		cwd: 'spa-navigation',
		servers: [
			{ filter: 'octane-tsrx-spa-navigation-bench', port: 5310 },
			{ filter: 'octane-jsx-spa-navigation-bench', port: 5311 },
			{ filter: 'react-spa-navigation-bench', port: 5312 },
			{ filter: 'solid-spa-navigation-bench', port: 5313 },
			{ filter: 'vue-vapor-spa-navigation-bench', port: 5314 },
			{ filter: 'inferno-spa-navigation-bench', port: 5328 },
		],
		iter: { normal: 20, quick: 3 },
		runs: [
			{ script: 'run.mjs', args: (n) => [String(n)] },
			{ label: 'work', script: 'work.mjs', args: () => [] },
		],
	},
	{
		// Renderer-free Alien 3.2.0 versus scoped-engine graphs, plus one
		// uninterrupted ownership lifetime with repeated partial disposal.
		name: 'scoped-signals',
		cwd: 'scoped-signals',
		servers: [],
		iter: { normal: 9, quick: 3 },
		runs: [{ script: 'run.mjs', args: (n, quick) => [String(n), ...(quick ? ['--quick'] : [])] }],
	},
	{
		// Actual production compilation with ordinary/native read controls,
		// plus deterministic five-dependency use() creation-cache guards.
		name: 'scoped-native-reads',
		cwd: 'scoped-signals',
		servers: [],
		iter: { normal: 9, quick: 3 },
		runs: [
			{
				script: 'run-native-costs.mjs',
				args: (n, quick) => [`--samples=${n}`, ...(quick ? ['--quick'] : [])],
			},
		],
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
			{ filter: 'preact-signal-bench', port: 5265 },
			{ filter: 'svelte-signal-bench', port: 5276 },
			{ filter: 'inferno-signal-bench', port: 5329 },
		],
		iter: { normal: 20, quick: 3 },
		runs: [
			{ script: 'run.mjs', args: (n) => [String(n)] },
			{ label: 'work', script: 'work.mjs', args: () => [] },
		],
	},
	{
		// News is build-based (no preview servers): its harness vite-builds each
		// target and times the built SSR + hydration. One invocation per target;
		// the per-target single-target payloads are merged into one `news` result.
		name: 'news',
		cwd: 'news',
		servers: [],
		iter: { normal: 20, quick: 3 },
		runs: [
			'octane-tsrx',
			'octane-jsx',
			'react',
			'preact',
			'ripple',
			'solid',
			'svelte',
			'vue-vapor',
			'inferno',
		].map((target) => ({
			label: target,
			script: 'run.mjs',
			args: (n) => [target, String(n)],
		})),
	},
	{
		// Real pre-hydration typing against a withheld production client chunk,
		// measured with Chromium CDP CPU throttling. The seven target apps reuse
		// news's existing SSR toolchains, including Solid 2 and Vue Vapor; Octane's
		// real early-capture bootstrap additionally proves exactly-once replay.
		name: 'hydration-interactivity',
		cwd: 'hydration-interactivity',
		servers: [],
		iter: { normal: 5, quick: 2 },
		runs: ['octane-tsrx', 'react', 'preact', 'solid', 'svelte', 'vue-vapor', 'inferno'].map(
			(target) => ({
				label: target,
				script: 'run.mjs',
				args: (n) => [target, String(n)],
			}),
		),
	},
	{
		name: 'hydration-stress',
		cwd: 'hydration-stress',
		servers: [],
		iter: { normal: 5, quick: 2 },
		runs: ['octane-tsrx', 'react', 'preact', 'solid', 'svelte', 'vue-vapor', 'inferno'].map(
			(target) => ({
				label: target,
				script: 'run.mjs',
				args: (n) => [target, String(n)],
			}),
		),
	},
	...[
		'lifecycle-memory',
		'controlled-form',
		'external-store-fanout',
		'external-store-integrations',
		'scheduler-responsiveness',
		'suspense-recovery',
		'event-delegation',
		'application-composition',
		'scaling-curves',
	].map((name) => ({
		name,
		cwd: name,
		servers: [],
		iter: name === 'lifecycle-memory' ? { normal: 84, quick: 2 } : { normal: 8, quick: 2 },
		runs: [
			...['octane-tsrx', 'react', 'preact', 'solid', 'svelte', 'vue-vapor', 'inferno'].map(
				(target) => ({
					label: target,
					script: 'run.mjs',
					args: (n) => [target, String(n)],
				}),
			),
			...(name === 'event-delegation' || name === 'external-store-fanout'
				? [{ label: 'work', script: 'work.mjs', args: () => [] }]
				: []),
		],
	})),
	{
		// Node/jsdom development-runtime scaling: the same controlled-value commit
		// at 4k and 32k hosts, normalized per host for a same-process ratio guard.
		name: 'dev-form-diagnostics',
		cwd: 'dev-form-diagnostics',
		servers: [],
		iter: { normal: 8, quick: 2 },
		runs: [{ script: 'run.mjs', args: (n) => [String(n)] }],
	},
	{
		// Production client scheduler scaling for deepest-first state updates across
		// a nested component chain, normalized per queued component.
		name: 'scheduler-depth',
		cwd: 'scheduler-depth',
		servers: [],
		iter: { normal: 9, quick: 3 },
		runs: [{ script: 'run.mjs', args: (n) => [String(n)] }],
	},
	{
		// Production SSR hydration of coextensive wrapper chains, normalized per
		// wrapper to catch repeated post-adoption range bookkeeping.
		name: 'hydration-range-compaction',
		cwd: 'hydration-range-compaction',
		servers: [],
		iter: { normal: 9, quick: 3 },
		runs: [{ script: 'run.mjs', args: (n) => [String(n)] }],
	},
	{
		// Headless-Chromium production scaling for late behavior events whose
		// distinct asynchronous adoptions settle one at a time.
		name: 'behavior-root-events',
		cwd: 'behavior-root-events',
		servers: [],
		iter: { normal: 8, quick: 2 },
		runs: [{ script: 'run.mjs', args: (n) => [String(n)] }],
	},
	{
		// Node-only Radix collection ordering against the exact prior indexOf
		// comparator, with small-path controls and indexed 256/4,096-item rows.
		name: 'radix-collection-order',
		cwd: 'radix-collection-order',
		servers: [],
		iter: { normal: 8, quick: 3 },
		runs: [{ script: 'run.mjs', args: (n) => [String(n)] }],
	},
	{
		// Node-only app-core route matching across large static, method-miss,
		// and dynamic route tables with cost normalized per candidate route.
		name: 'router-dispatch',
		cwd: 'router-dispatch',
		servers: [],
		iter: { normal: 8, quick: 3 },
		runs: [{ script: 'run.mjs', args: (n) => [String(n)] }],
	},
	{
		// Floating UI's virtual nested-menu routing: exact previous behavior versus
		// production on deep and branching trees, with deterministic node-read counts.
		name: 'floating-tree-navigation',
		cwd: 'floating-tree-navigation',
		servers: [],
		iter: { normal: 8, quick: 3 },
		runs: [{ script: 'run.mjs', args: (n) => [String(n)] }],
	},
	{
		// Ink's cursor-only terminal updates over unchanged large frames: exact
		// previous branches, byte/split gates, and stable-frame scaling controls.
		name: 'ink-cursor-update',
		cwd: 'ink-cursor-update',
		servers: [],
		iter: { normal: 8, quick: 3 },
		runs: [{ script: 'run.mjs', args: (n) => [String(n)] }],
	},
	{
		// Shared-compiler watched-path invalidation after nearest-package
		// decisions have been cached for small and large source trees.
		name: 'manifest-cache-invalidation',
		cwd: 'manifest-cache-invalidation',
		servers: [],
		iter: { normal: 8, quick: 3 },
		runs: [{ script: 'run.mjs', args: (n) => [String(n)] }],
	},
	{
		// Node-only Vite manifest traversal across many routes that converge on
		// one deep shared chunk graph, plus a shallow-graph control.
		name: 'vite-client-assets',
		cwd: 'vite-client-assets',
		servers: [],
		iter: { normal: 8, quick: 3 },
		runs: [{ script: 'run.mjs', args: (n) => [String(n)] }],
	},
	{
		// Selector-based fan-out: 512 subscribers read one store through a
		// selector, then the parent re-renders 20 times with the store untouched.
		// Reuses the news per-target toolchains with its own page, so the shared
		// runtime-stress fixture's 512 form fields stay out of the measurement.
		name: 'store-selector-fanout',
		cwd: 'store-selector-fanout',
		servers: [],
		iter: { normal: 8, quick: 2 },
		runs: ['octane-tsrx', 'react', 'preact', 'solid', 'svelte', 'vue-vapor', 'inferno'].map(
			(target) => ({
				label: target,
				script: 'run.mjs',
				args: (n) => [target, String(n)],
			}),
		),
	},
	{
		// Matched direct/nested callback work plus the shipped store bindings.
		// The fixture builds itself; named production calls are observed in a
		// separate unminified build so instrumentation stays out of timings.
		name: 'hook-store-composition',
		cwd: 'hook-store-composition',
		servers: [],
		iter: { normal: 8, quick: 2 },
		runs: [
			{ script: 'run.mjs', args: (n) => [String(n)] },
			{ label: 'work', script: 'work.mjs', args: () => [] },
		],
	},
	{
		// Public Activity lifecycle and hidden descendant work. The paired fixture
		// builds itself, and a separate production-work pass defends the range walk.
		name: 'activity',
		cwd: 'activity',
		servers: [],
		iter: { normal: 8, quick: 2 },
		runs: [
			{ script: 'run.mjs', args: (n) => [String(n)] },
			{ label: 'work', script: 'work.mjs', args: () => [] },
			{ label: 'refs', script: 'refs.mjs', args: (n) => [String(n)] },
			{ label: 'refs-work', script: 'refs-work.mjs', args: () => [] },
			{ label: 'bundle', script: 'bundle.mjs', args: () => [] },
		],
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
			{ filter: 'preact-effectful-list-bench', port: 5266 },
			{ filter: 'svelte-effectful-list-bench', port: 5277 },
			{ filter: 'inferno-effectful-list-bench', port: 5330 },
		],
		iter: { normal: 30, quick: 3 },
		runs: [{ script: 'run.mjs', args: (n) => [String(n)] }],
	},
	{
		// The only suite that reaches the shared-parent bulk clear: every other
		// fixture's `@for` is the sole child of its parent. The two shared sizes
		// straddle the strategy boundary, so moving it moves one of them.
		name: 'list-clear',
		cwd: 'list-clear',
		servers: [{ filter: 'octane-tsrx-list-clear-bench', port: 5298 }],
		iter: { normal: 20, quick: 4 },
		runs: [{ script: 'run.mjs', args: (n) => [String(n)] }],
	},
	{
		name: 'memo-wall',
		cwd: 'memo-wall',
		servers: [
			{ filter: 'octane-tsrx-memowall-bench', port: 5206 },
			{ filter: 'octane-jsx-memowall-bench', port: 5207 },
			{ filter: 'react-memowall-bench', port: 5208 },
			{ filter: 'react-compiler-memowall-bench', port: 5226 },
			{ filter: 'solid-memowall-bench', port: 5182 },
			{ filter: 'ripple-memowall-bench', port: 5225 },
			{ filter: 'vue-vapor-memowall-bench', port: 5223 },
			{ filter: 'preact-memowall-bench', port: 5267 },
			{ filter: 'svelte-memowall-bench', port: 5278 },
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
			{ filter: 'preact-portal-swarm-bench', port: 5268 },
			{ filter: 'svelte-portal-swarm-bench', port: 5279 },
			{ filter: 'inferno-portal-swarm-bench', port: 5332 },
		],
		iter: { normal: 20, quick: 3 },
		runs: [{ script: 'run.mjs', args: (n) => [String(n)] }],
	},
	{
		// Node-only structural baseline for React-hosted Octane compat islands
		// (docs/react-hosted-octane-compat-plan.md Phase 0): deterministic
		// listener/root/bridge-binding COUNTS at 1/100/1000 islands in jsdom.
		// Counts are exact, so the iteration knob is unused.
		name: 'react-hosted-islands',
		cwd: 'react-hosted-islands',
		servers: [],
		iter: { normal: 1, quick: 1 },
		runs: [{ script: 'run.mjs', args: () => [] }],
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
		// renderToPipeableStream vs React/Preact pipeable streams, Solid
		// renderToStream, and Ripple's stream mode. Svelte is N/A because its public
		// renderer is buffered. Iteration-counted (renders per target per scenario).
		name: 'streaming-ssr',
		cwd: 'streaming-ssr',
		servers: [],
		iter: { normal: 30, quick: 3 },
		runs: [{ script: 'run.mjs', args: (n) => [String(n)] }],
	},
	{
		// Raw streaming API over REAL HTTP, cold and warm: fresh-process import
		// cost, spawn→listen→first-byte cold TTFB, and warm shell/total/throughput
		// for octane renderToPipeableStream vs React Fizz behind one identical
		// minimal node:http host (streaming-ssr's fixtures). The renderer link of
		// the SSR attribution chain; the app link is the tanstack-start suite.
		// Iterations are cold spawns per target, so normal stays small.
		name: 'ssr-http',
		cwd: 'ssr-http',
		servers: [],
		iter: { normal: 10, quick: 2 },
		runs: [{ script: 'run.mjs', args: (n) => [String(n)] }],
	},
	{
		name: 'streaming-backpressure',
		cwd: 'streaming-backpressure',
		servers: [],
		iter: { normal: 5, quick: 2 },
		runs: [{ script: 'run.mjs', args: (n) => [String(n)] }],
	},
	{
		// Streaming SSR inside REAL workerd (the Cloudflare Workers runtime) via
		// miniflare: cold isolate spawn→ready→first-byte, warm shell/total, and
		// the deploy-relevant worker-script bytes. Three targets: octane vs
		// React Fizz edge behind identical minimal module Workers (renderer
		// comparison), plus octane-app — the @octanejs/vite-plugin +
		// @octanejs/adapter-cloudflare deployment shape (octane-only; its delta
		// vs octane-tsrx is the metaframework layer). Cold spawns dominate wall
		// time, so normal stays small.
		name: 'ssr-workerd',
		cwd: 'ssr-workerd',
		servers: [],
		iter: { normal: 10, quick: 2 },
		runs: [{ script: 'run.mjs', args: (n) => [String(n)] }],
	},
	{
		// The REAL TanStack Start app pair (correctness-gated by compare.mjs +
		// the shared Playwright spec), measured over HTTP as three targets:
		// react (srvx minimal host), octane-minimal (identical minimal host), and
		// octane-nitro (the nitro deployment output). Cold spawn→first-byte and
		// warmed per-route TTFB/stream/throughput; minimal-vs-react isolates the
		// Octane Start stack, nitro-vs-minimal isolates the host. Cold spawns
		// dominate wall time, so normal stays small.
		name: 'tanstack-start',
		cwd: 'tanstack-start',
		servers: [],
		iter: { normal: 7, quick: 2 },
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
		// nested-use code with the compiler pipeline (memoized creations +
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
			{ filter: 'preact-async-bench', port: 5269 },
			{ filter: 'svelte-async-bench', port: 5280 },
			{ filter: 'inferno-async-bench', port: 5333 },
		],
		iter: { normal: 10, quick: 2 },
		runs: [{ script: 'run.mjs', args: (n) => [String(n)] }],
	},
	{
		// Realistic async composition: adjacent panels under one route boundary,
		// nested async children, an imported custom hook with independent use()
		// reads, and one true data dependency.
		name: 'async-composition',
		cwd: 'async-composition',
		servers: [
			{ filter: 'octane-tsrx-async-composition-bench', port: 5282 },
			{ filter: 'react-async-composition-bench', port: 5284 },
			{ filter: 'inferno-async-composition-bench', port: 5334 },
		],
		iter: { normal: 10, quick: 2 },
		runs: [{ script: 'run.mjs', args: (n) => [String(n)] }],
	},
	{
		// Native Lynx list virtualization (Node-only): drives the real host through
		// a fake Element PAPI and reports deterministic physical-cell counts for a
		// bounded visible window over 1,000 logical rows. No device timing claim.
		name: 'lynx-list',
		cwd: 'lynx-list',
		servers: [],
		iter: { normal: 3, quick: 1 },
		runs: [{ script: 'run.mjs', args: (n) => [String(n)] }],
	},
	{
		// Universal renderer update locality (Node-only): compiles the public issue
		// fixture and measures one stateful leaf beside up to 4,000 unrelated owners.
		name: 'universal-leaf-update',
		cwd: 'universal-leaf-update',
		servers: [],
		iter: { normal: 5, quick: 3 },
		runs: [{ script: 'run.mjs', args: (n) => [String(n)] }],
	},
	{
		// Native universal external-store hooks: stable subscription lifetimes and
		// bounded state-projection work across parent renders and notification bursts.
		name: 'universal-external-store',
		cwd: 'universal-external-store',
		servers: [],
		iter: { normal: 5, quick: 3 },
		runs: [{ script: 'run.mjs', args: (n) => [String(n)] }],
	},
	{
		// Compiled Octane and pinned ReactLynx dual-thread render cost (Node-only)
		// on the same cheap Element PAPI. Both visible trees and real native taps
		// must match; three quick samples keep same-run ratio guards stable.
		name: 'lynx-render',
		cwd: 'lynx-render',
		servers: [],
		iter: { normal: 5, quick: 3 },
		runs: [{ script: 'run.mjs', args: (n) => [String(n)] }],
	},
	{
		// Native Lynx table wire cost (Node-only): drives the cross-framework
		// krausest table app through the real dual-thread path via real tap tokens
		// and reports deterministic per-operation command counts and serialized
		// commit bytes against a changed-rows semantic floor. The wire payload of a
		// point update must scale with the change, not the tree. Wall-clock lives
		// in the separate Lynx-for-Web harness (lynx-table-web) and is ungated.
		name: 'lynx-table',
		cwd: 'lynx-table',
		servers: [],
		iter: { normal: 2, quick: 1 },
		runs: [
			{
				script: 'run.mjs',
				args: (n) => [String(n)],
				env: (iter, quick) => ({ LYNX_TABLE_SCALES: quick ? '1000' : '1000,10000' }),
			},
		],
	},
	{
		// Lynx-for-Web wall clock (headless Chromium): serves the octane table
		// app and the vendored ReactLynx / Vue Lynx reference bundles into a
		// <lynx-view> and drives real clicks through one shared page driver.
		// Timing is host-bound and carries no ratio guards — the deterministic
		// wire gates live in `lynx-table` — but the recorded medians feed the
		// site's cross-framework Lynx chart. Iterations map to fresh-page reps.
		name: 'lynx-table-web',
		cwd: 'lynx-table',
		servers: [],
		iter: { normal: 3, quick: 1 },
		runs: [{ script: 'web/run-web.mjs', args: (n) => ['--reps', String(n)] }],
	},
	{
		// Production Rspeedy preview/IFR bundles (Node-only): decodes both real
		// compiler graphs, verifies semantic markers, and reports deterministic
		// encoded and per-thread bytes. This is build evidence, not native timing.
		name: 'lynx-bundle-size',
		cwd: 'lynx-bundle-size',
		servers: [],
		iter: { normal: 1, quick: 1 },
		runs: [
			{ script: 'run.mjs', args: () => [] },
			{ script: 'inventory.mjs', args: () => [] },
		],
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
		// Hook memoization's production compiler A/B: execute identical clean
		// programs, then count function/array creation expressions in separate
		// observed bundles. Deterministic; no timing or browser server required.
		name: 'hook-memo',
		cwd: 'hook-memo',
		servers: [],
		iter: { normal: 1, quick: 1 },
		runs: [{ script: 'run.mjs', args: () => [] }],
	},
	{
		// Strong-mode keyed row reuse, with receiver calls observed outside the
		// compiled source and DOM/event controls for every dependency change.
		name: 'template-call-memo',
		cwd: 'template-call-memo',
		servers: [],
		iter: { normal: 1, quick: 1 },
		runs: [{ script: 'run.mjs', args: () => [] }],
	},
	{
		name: 'compiler-throughput',
		cwd: 'compiler-throughput',
		servers: [],
		iter: { normal: 5, quick: 2 },
		runs: [{ script: 'run.mjs', args: (n) => [String(n)] }],
	},
	{
		name: 'tsrx-component-graph',
		cwd: 'tsrx-component-graph',
		servers: [],
		iter: { normal: 8, quick: 4 },
		runs: [{ script: 'run.mjs', args: (n) => [String(n)] }],
	},
	{
		// Conditional JSX return analysis at two component counts plus a
		// same-sized structurally ineligible parse/print control.
		name: 'tsrx-jsx-return-branches',
		cwd: 'tsrx-jsx-return-branches',
		servers: [],
		iter: { normal: 7, quick: 3 },
		runs: [{ script: 'run.mjs', args: (n) => [String(n)] }],
	},
	{
		// Optional TypeScript text-inference scaling: repeated warm snapshots of
		// one target with either 32 or 20,000 unrelated configured roots.
		name: 'text-type-roots',
		cwd: 'text-type-roots',
		servers: [],
		iter: { normal: 9, quick: 3 },
		runs: [{ script: 'run.mjs', args: (n) => [String(n)] }],
	},
	{
		// Development TSRX compiler scaling: distinct authored HTML-nesting
		// diagnostics at two sizes, normalized per invalid site in one process.
		name: 'tsrx-nesting-diagnostics',
		cwd: 'tsrx-nesting-diagnostics',
		servers: [],
		iter: { normal: 9, quick: 3 },
		runs: [{ script: 'run.mjs', args: (n) => [String(n)] }],
	},
	{
		// Ordered filename-to-renderer classification with one retained normalized
		// config versus equivalent raw revalidation in the same process.
		name: 'tsrx-renderer-selection',
		cwd: 'tsrx-renderer-selection',
		servers: [],
		iter: { normal: 9, quick: 3 },
		runs: [{ script: 'run.mjs', args: (n) => [String(n)] }],
	},
	{
		// Native onChange analysis on hostless TSRX at two sizes, paired with an
		// AST-identical large source whose ignored marker conservatively forces the scan.
		name: 'tsrx-native-change-analysis',
		cwd: 'tsrx-native-change-analysis',
		servers: [],
		iter: { normal: 7, quick: 3 },
		runs: [{ script: 'run.mjs', args: (n) => [String(n)] }],
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
	{
		// Public-import reachability (Node-only): builds and executes isolated
		// production feature entries, then compares raw/gzip/brotli bytes with
		// explicit same-run budget targets through the committed ratio guards.
		name: 'bundle-reachability',
		cwd: 'bundle-size',
		servers: [],
		iter: { normal: 1, quick: 1 },
		runs: [{ script: 'run-minimal.mjs', args: () => [] }],
	},
	{
		// Three host lifecycle work in a production browser: Octane Three against
		// R3F 9.6.1 and a direct plain-Three lower bound. The injected renderer
		// deliberately excludes GPU/driver time while retaining real Three objects,
		// native pointer dispatch, and raycasting.
		name: 'three-renderer',
		cwd: 'three',
		servers: [{ filter: 'octane-three-bench', port: 5291 }],
		iter: { normal: 20, quick: 10 },
		runs: [{ script: 'run.mjs', args: (n) => [String(n)] }],
	},
	{
		// Deterministic production bundle bytes for minimal and full-catalogue
		// Octane Three, R3F, and plain Three entries. The harness loads every built
		// entry in Chromium and rejects it unless the scene checksum is valid.
		name: 'three-bundle-size',
		cwd: 'three',
		servers: [],
		iter: { normal: 1, quick: 1 },
		runs: [{ script: 'run-size.mjs', args: () => [] }],
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

function printHydrationInteractivityUx(result) {
	if (result.suite !== 'hydration-interactivity' && result.suite !== 'hydration-stress') return;

	const measured = result.targets.filter((target) => target.meta?.userExperience?.samples > 0);
	if (measured.length === 0) return;

	console.error('\n  Pre-hydration search-and-Send UX correctness');
	console.error('  framework       outcome  Send handled  query saved   delivered');
	for (const target of measured) {
		const ux = target.meta.userExperience;
		const fraction = (count) => `${count}/${ux.samples}`;
		console.error(
			`  ${target.name.padEnd(15)} ${ux.status.toUpperCase().padEnd(8)} ${fraction(
				ux.deliveredSendClicks,
			).padEnd(13)} ${fraction(ux.preservedSearches).padEnd(13)} ${fraction(ux.exactDeliveries)}`,
		);
		if (ux.issues.length > 0) {
			console.error(`    UX failure: ${ux.issues.join('; ')}`);
		}
	}

	const keyboard = result.targets.filter((target) => target.meta?.keyboardExperience?.samples > 0);
	if (keyboard.length === 0) return;
	console.error('\n  Pre-hydration keyboard-and-Send UX correctness');
	console.error('  framework       outcome  Enter handled query saved   delivered');
	for (const target of keyboard) {
		const ux = target.meta.keyboardExperience;
		const fraction = (count) => `${count}/${ux.samples}`;
		console.error(
			`  ${target.name.padEnd(15)} ${ux.status.toUpperCase().padEnd(8)} ${fraction(
				ux.deliveredSendClicks,
			).padEnd(13)} ${fraction(ux.preservedSearches).padEnd(13)} ${fraction(ux.exactDeliveries)}`,
		);
		if (ux.issues.length > 0) {
			console.error(`    UX failure: ${ux.issues.join('; ')}`);
		}
	}
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
		printHydrationInteractivityUx(merged);
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

// ── paired ratio guards ───────────────────────────────────────────────────────

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
