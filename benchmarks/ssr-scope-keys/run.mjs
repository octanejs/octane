// Node-only SSR guard for scoped-counter keying.
//
// Every component child pays a scoped child-segment counter keyed by the
// active ASYNC_SCOPE string, which grows by a component-membrane segment at
// every nesting level — so per-child keying cost scales with scope-path
// length. `nested-components` renders a deep component tree; `nested-arms`
// renders a component tree whose items enter through compiler-emitted @for
// arm membranes (arm-position occurrence keys plus children scoped under each
// arm); `host-tree` renders a matching element shape with zero components
// (no frames, no scoped counters) as a same-process reference that must not
// move. The nested/host ratios bound the scoped-render overhead: suffix-keyed
// counters keep it near the host baseline, while full-path keying re-scans
// the shared prefix per child and roughly doubles the ratio.
//
// Usage: node run.mjs [iterations]
// Emits BENCH_JSON targets `nested-components`, `nested-arms`, and
// `host-tree`, op `render` (ms/render). Guards live in
// benchmarks/baselines/ratios.json.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { summarizeSamples, timingStatForJson } from '../lib/stats.mjs';

const HERE = import.meta.dirname;
const REPO = resolve(HERE, '../..');
const iterations = Number.parseInt(process.argv[2] ?? '9', 10);
const RENDERS_PER_SAMPLE = 15;
const DEPTH = 6;
const READERS_PER_LEVEL = 8;
const LEVELS_PER_LEVEL = 3;

if (!Number.isSafeInteger(iterations) || iterations < 1) {
	throw new Error('ssr-scope-keys iterations must be a positive integer');
}

// The arm-tree scenario needs real compiler-emitted arm membranes, so compile
// a small @for fixture into the bundle — same pattern as ssr-final-metadata's
// audit suite.
const { compile } = await import(
	pathToFileURL(join(REPO, 'packages/octane/src/compiler/index.js')).href
);
const fixturePath = join(fs.mkdtempSync(join(os.tmpdir(), 'ssr-scope-keys-')), 'arm-fixture.js');
fs.writeFileSync(
	fixturePath,
	compile(
		`
			function Row(props) @{
				<i>{props.label as string}</i>
			}
			export function ArmLevel(props) @{
				<section>
					@for (const i of props.readers; key i) {
						<Row label={props.prefix + ':' + i} />
					}
					@for (const d of props.depth > 0 ? props.levels : []; key 'd' + d) {
						<ArmLevel depth={props.depth - 1} prefix={props.prefix + ':' + d} readers={props.readers} levels={props.levels} />
					}
				</section>
			}
		`,
		'arm-fixture.tsrx',
		{ mode: 'server', hmr: false, dev: false },
	).code,
);

// Bundle the production server runtime straight from source so the guard runs
// against the checkout under test rather than a published build.
const esbuildEntry = createRequire(join(REPO, 'package.json')).resolve('esbuild');
const { build } = await import(pathToFileURL(esbuildEntry).href);
const built = await build({
	absWorkingDir: REPO,
	stdin: {
		contents: `export {renderToString, createElement, use, createContext} from './packages/octane/src/runtime.server.ts'; export * as fixture from ${JSON.stringify(fixturePath)};`,
		resolveDir: REPO,
		sourcefile: 'ssr-scope-keys-entry.mjs',
	},
	bundle: true,
	write: false,
	format: 'esm',
	platform: 'node',
	target: 'es2022',
	minify: true,
	define: {
		'process.env.NODE_ENV': '"production"',
		__OCTANE_PROFILE_ENABLED__: 'false',
	},
	nodePaths: [join(REPO, 'packages/octane/node_modules'), join(REPO, 'node_modules')],
	plugins: [
		{
			name: 'ssr-scope-keys-source',
			setup(plugin) {
				plugin.onResolve({ filter: /^octane(?:\/(?:server|internal\/server))?$/ }, () => ({
					path: join(REPO, 'packages/octane/src/server/index.ts'),
				}));
			},
		},
	],
	logLevel: 'silent',
});
const ssr = await import(
	`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`
);

const e = ssr.createElement;
const ctx = ssr.createContext(0);

function Leaf({ i }) {
	ssr.use(ctx, `rd-${i}`);
	return e('i', null, `r${i}`);
}
function Pass(props) {
	return props.children;
}
function Level({ depth }) {
	const kids = [];
	for (let i = 0; i < READERS_PER_LEVEL; i++) kids.push(e(Leaf, { key: i, i }));
	if (depth > 0)
		for (let i = 0; i < LEVELS_PER_LEVEL; i++)
			kids.push(e(Level, { key: `d${i}`, depth: depth - 1 }));
	return e(Pass, null, e('section', null, kids));
}
function hostLevel(depth) {
	const kids = [];
	for (let i = 0; i < READERS_PER_LEVEL; i++) kids.push(e('i', null, `r${i}`));
	if (depth > 0) for (let i = 0; i < LEVELS_PER_LEVEL; i++) kids.push(hostLevel(depth - 1));
	return e('section', null, kids);
}

const readers = Array.from({ length: READERS_PER_LEVEL }, (_, i) => i);
const levels = Array.from({ length: LEVELS_PER_LEVEL }, (_, i) => i);

const scenarios = [
	{ name: 'nested-components', render: () => ssr.renderToString(e(Level, { depth: DEPTH })).html },
	{
		name: 'nested-arms',
		render: () =>
			ssr.renderToString(e(ssr.fixture.ArmLevel, { depth: DEPTH, prefix: 'a', readers, levels }))
				.html,
	},
	{ name: 'host-tree', render: () => ssr.renderToString(hostLevel(DEPTH)).html },
];

const digest = (html) => createHash('sha256').update(html).digest('hex');
const markers = { 'nested-components': 'r0', 'nested-arms': 'a:0', 'host-tree': 'r0' };
const expected = new Map(
	scenarios.map((scenario) => {
		const html = scenario.render();
		assert.ok(
			html.includes(markers[scenario.name]),
			`${scenario.name} did not render the leaf marker`,
		);
		return [scenario.name, digest(html)];
	}),
);

const samples = new Map(scenarios.map((scenario) => [scenario.name, []]));
for (const scenario of scenarios) {
	for (let i = 0; i < 3; i++) scenario.render();
}

for (let iteration = 0; iteration < iterations; iteration++) {
	const order = iteration % 2 === 0 ? scenarios : [...scenarios].reverse();
	for (const scenario of order) {
		const started = performance.now();
		for (let i = 0; i < RENDERS_PER_SAMPLE; i++) scenario.render();
		const elapsed = performance.now() - started;
		assert.equal(
			digest(scenario.render()),
			expected.get(scenario.name),
			`${scenario.name} rendered different bytes on iteration ${iteration}`,
		);
		samples.get(scenario.name).push(elapsed / RENDERS_PER_SAMPLE);
	}
}

const targets = scenarios.map((scenario) => {
	const summary = summarizeSamples(samples.get(scenario.name));
	console.log(`PASS ssr-scope-keys/${scenario.name}: ${summary.score.toFixed(3)}ms/render`);
	return {
		name: scenario.name,
		ops: { render: timingStatForJson(summary) },
		meta: {
			depth: DEPTH,
			readersPerLevel: READERS_PER_LEVEL,
			levelsPerLevel: LEVELS_PER_LEVEL,
			rendersPerSample: RENDERS_PER_SAMPLE,
			semanticHash: expected.get(scenario.name).slice(0, 16),
			correctness: 'pass',
		},
	};
});

const payload = {
	suite: 'ssr-scope-keys',
	iterations,
	targets,
};

if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, `${JSON.stringify(payload, null, '\t')}\n`);
}
process.exit(process.exitCode ?? 0);
