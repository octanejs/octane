// Universal keyed @for survivor rows (Node-only): 1,000 rows beside a counter in
// the same component, through the public compiler and the native object driver.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { pairedRatio, summarizeSamples, timingStatForJson } from '../lib/stats.mjs';

process.env.NODE_ENV = 'production';
const repo = path.resolve(import.meta.dirname, '../..');
const rawIterations = process.argv[2] ?? '7';
const iterations = Number(rawIterations);
if (!Number.isSafeInteger(iterations) || iterations < 2) {
	throw new TypeError(
		`iterations must be a safe integer of at least 2, received ${rawIterations}.`,
	);
}
const { build } = createRequire(path.join(repo, 'packages/octane/package.json'))('esbuild');
// Bundles live under the package so their external dependencies (including the
// parser's native binding) resolve from this checkout.
const temporary = fs.mkdtempSync(
	path.join(repo, 'packages/octane/node_modules/.universal-for-row-memo-'),
);

// A baseline checkout's sources run beside this one, sampled in alternating
// pairs; its dependencies also come from this checkout.
const sides = [{ name: 'head', root: repo }];
if (process.env.UNIVERSAL_BASE_ROOT) {
	sides.unshift({ name: 'base', root: path.resolve(process.env.UNIVERSAL_BASE_ROOT) });
}

const ROWS = 1_000;
const STEPS = 20;
const WARMUP_STEPS = 20;

// `pure` rows render only from their item and captures, so a survivor whose
// item is unchanged may keep its output. `called` rows format their label
// through a module function: the control that re-renders every row.
const appSource = (label) => `
import { useState } from 'octane';

function format(label) {
	return label;
}

export default function App(props) @{
	const [count, setCount] = useState(0);
	const [rows, setRows] = useState(props.rows);
	props.expose({ tick: () => setCount(count + 1), setRows });
	<list count={count}>
		@for (const row of rows; key row.id) {
			<row id={row.id} label={${label}} on={row.on ? 'yes' : 'no'} onPress={() => props.select(row.id)} />
		}
	</list>
}
`;
const VARIANTS = { pure: 'String(row.label)', called: 'format(row.label)' };

// Each row reads `label` through a getter, so the count is how many row bodies ran.
let rowRenders = 0;
const makeRow = (id, on = false) => ({
	id,
	on,
	get label() {
		rowRenders++;
		return `row-${id}`;
	},
});

const OPERATIONS = {
	// Unrelated state beside the list.
	tick: () => undefined,
	// One row's item changes.
	toggle: (rows, step) => {
		const index = (step * 37) % rows.length;
		const next = rows.slice();
		next[index] = makeRow(rows[index].id, !rows[index].on);
		return next;
	},
	// The last row moves to the front; every row keeps its item.
	rotate: (rows) => [rows[rows.length - 1], ...rows.slice(0, -1)],
	// Every row's item changes, so no row can be kept.
	replace: (rows) => rows.map((row) => makeRow(row.id, !row.on)),
};

async function bundle(root, entry, file) {
	const output = await build({
		entryPoints: [path.join(root, 'packages/octane/src', entry)],
		bundle: true,
		write: false,
		format: 'esm',
		platform: 'node',
		target: 'node22',
		packages: 'external',
		define: { 'process.env.NODE_ENV': '"production"', __OCTANE_PROFILE_ENABLED__: 'false' },
	});
	fs.writeFileSync(file, output.outputFiles[0].text);
	return import(pathToFileURL(file).href);
}

async function prepare(side) {
	const directory = path.join(temporary, side.name);
	fs.mkdirSync(directory);
	const { compile } = await bundle(side.root, 'compiler/index.js', `${directory}/compiler.mjs`);
	const runtime = await bundle(side.root, 'universal-native.ts', `${directory}/runtime.mjs`);
	const apps = {};
	for (const [variant, label] of Object.entries(VARIANTS)) {
		const { code } = compile(appSource(label), 'app.tsrx', {
			mode: 'client',
			renderer: {
				id: 'object',
				module: './runtime.mjs',
				target: 'universal',
				server: 'unsupported',
				text: 'host',
				capabilities: [],
			},
		});
		fs.writeFileSync(`${directory}/${variant}.mjs`, code);
		apps[variant] = (await import(pathToFileURL(`${directory}/${variant}.mjs`).href)).default;
	}
	return { ...side, runtime, apps };
}

function mount({ runtime }, App, operation) {
	const { createObjectContainer, createObjectDriver, createUniversalRoot, flushUniversalSync } =
		runtime;
	let rows = Array.from({ length: ROWS }, (_, id) => makeRow(id));
	let api;
	let steps = 0;
	const container = createObjectContainer('object');
	const root = createUniversalRoot(container, createObjectDriver('object'));
	flushUniversalSync(() =>
		root.render(App, { rows, expose: (value) => (api = value), select() {} }),
	);
	const step = () =>
		flushUniversalSync(() => {
			const next = OPERATIONS[operation](rows, steps++);
			if (next === undefined) api.tick();
			else api.setRows((rows = next));
		});
	for (let index = 0; index < WARMUP_STEPS; index++) step();
	const result = { samples: [], rowRenders: 0 };
	return {
		result,
		sample() {
			rowRenders = 0;
			const start = performance.now();
			for (let index = 0; index < STEPS; index++) step();
			result.samples.push((performance.now() - start) / STEPS);
			result.rowRenders += rowRenders / STEPS;
		},
		finish() {
			const list = container.children[0];
			assert.equal(list.children.length, ROWS);
			list.children.forEach((child, index) => {
				assert.equal(child.props.id, rows[index].id);
				assert.equal(child.props.on, rows[index].on ? 'yes' : 'no');
			});
			assert.equal(list.props.count, operation === 'tick' ? steps : 0);
			root.unmount();
			assert.equal(container.instanceCount, 0);
			result.rowRenders /= iterations;
		},
	};
}

const formatRatio = ({ ratio, low, high }) =>
	`${ratio.toFixed(2)} [${low.toFixed(2)}, ${high.toFixed(2)}]`;

let payload;
try {
	const prepared = [];
	for (const side of sides) prepared.push(await prepare(side));
	const targets = [];
	const rows = [];
	for (const variant of Object.keys(VARIANTS)) {
		for (const operation of Object.keys(OPERATIONS)) {
			const runs = prepared.map((side) => mount(side, side.apps[variant], operation));
			// Alternate AB/BA so drift on a shared host moves both sides of a pair.
			for (let iteration = 0; iteration < iterations; iteration++) {
				const order = iteration % 2 === 0 ? runs : [...runs].reverse();
				for (const run of order) run.sample();
			}
			runs.forEach((run, index) => {
				run.finish();
				const name =
					prepared[index].name === 'head'
						? `${variant}-${operation}`
						: `${prepared[index].name}-${variant}-${operation}`;
				targets.push({
					name,
					ops: {
						step_ms: timingStatForJson(summarizeSamples(run.result.samples)),
						row_renders: {
							score: run.result.rowRenders,
							median: run.result.rowRenders,
							samples: 1,
						},
					},
					meta: { variant, operation, rows: ROWS, steps: iterations * STEPS },
				});
			});
			const [base, head] = runs.length === 2 ? runs : [null, runs[0]];
			rows.push(
				`| ${variant}-${operation} | ${
					base === null ? '' : `${summarizeSamples(base.result.samples).median.toFixed(3)} | `
				}${summarizeSamples(head.result.samples).median.toFixed(3)} | ${
					base === null
						? ''
						: `${formatRatio(pairedRatio(base.result.samples, head.result.samples))} | `
				}${head.result.rowRenders} |`,
			);
		}
	}
	payload = { suite: 'universal-for-row-memo', iterations, targets };
	console.log(
		sides.length === 2
			? '| target | base ms per step | head ms per step | head/base [95% CI] | head row renders per step |\n| --- | ---: | ---: | ---: | ---: |'
			: '| target | ms per step | row renders per step |\n| --- | ---: | ---: |',
	);
	console.log(rows.join('\n'));
} catch (error) {
	const message = error instanceof Error ? error.stack || error.message : String(error);
	payload = { suite: 'universal-for-row-memo', iterations, targets: [], failed: message };
	console.error(message);
	process.exitCode = 1;
} finally {
	fs.rmSync(temporary, { recursive: true, force: true });
}

if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, `${JSON.stringify(payload, null, '\t')}\n`);
}
