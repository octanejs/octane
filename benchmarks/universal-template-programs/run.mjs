// Universal prepared template programs (Node-only): 1,000 compiled keyed @for
// rows whose click handler sits on the row element, through the public
// compiler and a program-capable object driver.
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
const temporary = fs.mkdtempSync(
	path.join(repo, 'packages/octane/node_modules/.universal-template-programs-'),
);

const sides = [{ name: 'head', root: repo }];
if (process.env.UNIVERSAL_BASE_ROOT) {
	sides.unshift({ name: 'base', root: path.resolve(process.env.UNIVERSAL_BASE_ROOT) });
}

const ROWS = 1_000;
const STEPS = 20;
const WARMUP_STEPS = 20;

// `event` rows carry a click handler on the row element. `styled` rows also
// pass a style object, which needs the structured-values capability.
const appSource = (style) => `
import { useState } from 'octane';

export default function App(props) @{
	const [rows, setRows] = useState(props.rows);
	props.expose({ setRows });
	<list>
		@for (const row of rows; key row.id) {
			<row id={row.id} on={row.on ? 'yes' : 'no'}${style} onPress={() => props.select(row.id)}>
				<label text={row.label} />
			</row>
		}
	</list>
}
`;
const VARIANTS = {
	event: { style: '', structured: false },
	styled: { style: ' style={{ opacity: row.on ? 1 : 0.5 }}', structured: true },
};

const makeRow = (id, on = false) => ({ id, on, label: `row-${id}-${on}` });
const OPERATIONS = {
	// A fresh root mounts every row.
	mount: null,
	// One row's item changes.
	toggle: (rows, step) => {
		const index = (step * 37) % rows.length;
		const next = rows.slice();
		next[index] = makeRow(rows[index].id, !rows[index].on);
		return next;
	},
	// Every row's item changes, so no row can keep its memo.
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
	for (const [variant, { style }] of Object.entries(VARIANTS)) {
		const { code } = compile(appSource(style), 'app.tsrx', {
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

// An object driver that accepts prepared template programs and runs, records
// the serialized size of every batch it receives, and expands template
// commands into ordinary object-host commands.
function createProgramDriver(runtime, structured, metrics) {
	const base = runtime.createObjectDriver('object');
	return {
		...base,
		templates: runtime.universalHostTemplates,
		capabilities: {
			...base.capabilities,
			templateMount: true,
			collapsedTemplateMount: true,
			templateProgramMount: true,
			stableStaticHostProps: true,
			templateProgramRuns: true,
			templateProgramStructuredValues: structured,
		},
		prepareBatch(container, batch, context) {
			metrics.bytes += JSON.stringify(batch.commands).length;
			for (const command of batch.commands) metrics.ops.add(command.op);
			const commands = [];
			for (const command of batch.commands) {
				if (command.op === 'mount-template') {
					metrics.templates++;
					const { nodes, shape } = command;
					nodes.forEach((node, index) => {
						commands.push({
							op: 'create',
							id: node.id,
							type: shape[index].type,
							props: node.props,
						});
						for (const event of node.events ?? []) {
							commands.push({
								op: 'event',
								id: node.id,
								type: event.type,
								listener: event.listener,
							});
						}
					});
					for (let index = 1; index < nodes.length; index++) {
						const parent = nodes[shape[index].parent].id;
						commands.push({ op: 'insert', parent, id: nodes[index].id, before: null });
					}
					commands.push({
						op: 'insert',
						parent: command.parent,
						id: nodes[0].id,
						before: command.before,
					});
					continue;
				}
				if (command.op !== 'mount-template-run' && command.op !== 'mount-template-range') {
					commands.push(command);
					continue;
				}
				metrics.programs++;
				const count = command.op === 'mount-template-run' ? command.count : 1;
				const { nodes, events } = command.program;
				const stride = command.values.length / count;
				for (let row = 0; row < count; row++) {
					const firstId = command.firstId + row * nodes.length;
					nodes.forEach((node, index) => {
						const props = { ...node.props };
						for (const binding of node.bindings ?? []) {
							props[binding.name] = command.values[row * stride + binding.valueIndex];
						}
						commands.push({ op: 'create', id: firstId + index, type: node.type, props });
					});
					events.forEach((event, index) => {
						const id = command.firstListenerId + row * events.length + index;
						const listener = { id, priority: event.priority };
						commands.push({ op: 'event', id: firstId + event.node, type: event.type, listener });
					});
					for (let index = 1; index < nodes.length; index++) {
						const parent = firstId + nodes[index].parent;
						commands.push({ op: 'insert', parent, id: firstId + index, before: null });
					}
					commands.push({
						op: 'insert',
						parent: command.parent,
						id: firstId,
						before: command.before,
					});
				}
			}
			return base.prepareBatch(container, { ...batch, commands }, context);
		},
	};
}

function measure({ runtime }, App, structured, operation) {
	const { createObjectContainer, createUniversalRoot, flushUniversalSync } = runtime;
	const result = { samples: [], bytes: 0, metrics: null };
	const render = () => {
		const metrics = { bytes: 0, templates: 0, programs: 0, ops: new Set() };
		const rows = Array.from({ length: ROWS }, (_, id) => makeRow(id));
		const selected = [];
		const container = createObjectContainer('object');
		const root = createUniversalRoot(container, createProgramDriver(runtime, structured, metrics));
		let api;
		const start = performance.now();
		flushUniversalSync(() =>
			root.render(App, {
				rows,
				expose: (value) => (api = value),
				select: (id) => selected.push(id),
			}),
		);
		const elapsed = performance.now() - start;
		const hosts = [...container.children[0].children];
		return { metrics, rows, selected, container, root, hosts, api: () => api, elapsed, steps: 0 };
	};
	const step = () =>
		flushUniversalSync(() => {
			state.rows = OPERATIONS[operation](state.rows, state.steps++);
			state.api().setRows(state.rows);
		});
	const record = () => {
		const { bytes, templates, programs, ops } = state.metrics;
		result.metrics = { templates, programs, ops: [...ops].sort() };
		return bytes;
	};
	// Updates run on one root mounted up front, as in universal-for-row-memo.
	let state = operation === 'mount' ? undefined : render();
	if (state !== undefined) for (let index = 0; index < WARMUP_STEPS; index++) step();
	return {
		result,
		sample() {
			if (operation === 'mount') {
				// A fresh root per sample; the previous one unmounts untimed.
				state?.root.unmount();
				state = render();
				result.samples.push(state.elapsed);
				result.bytes = record();
				return;
			}
			state.metrics.bytes = 0;
			state.metrics.ops.clear();
			const start = performance.now();
			for (let index = 0; index < STEPS; index++) step();
			result.samples.push((performance.now() - start) / STEPS);
			result.bytes = record() / STEPS;
		},
		finish() {
			const list = state.container.children[0];
			assert.equal(list.children.length, ROWS);
			list.children.forEach((child, index) => {
				// Keyed rows keep their hosts across every update.
				assert.equal(child, state.hosts[index]);
				assert.equal(child.props.id, state.rows[index].id);
				assert.equal(child.props.on, state.rows[index].on ? 'yes' : 'no');
				assert.equal(child.children[0].props.text, state.rows[index].label);
			});
			state.container.dispatchEvent(list.children[7], 'press');
			assert.deepEqual(state.selected, [7]);
			state.root.unmount();
			assert.equal(state.container.instanceCount, 0);
		},
	};
}

const formatRatio = ({ ratio, low, high }) =>
	`${ratio.toFixed(2)} [${low.toFixed(2)}, ${high.toFixed(2)}]`;
const kb = (bytes) => (bytes / 1024).toFixed(1);

let payload;
try {
	const prepared = [];
	for (const side of sides) prepared.push(await prepare(side));
	const targets = [];
	const rows = [];
	for (const [variant, { structured }] of Object.entries(VARIANTS)) {
		for (const operation of Object.keys(OPERATIONS)) {
			const runs = prepared.map((side) => measure(side, side.apps[variant], structured, operation));
			// Alternate AB/BA so drift on a shared host moves both sides of a pair.
			for (let iteration = 0; iteration < iterations; iteration++) {
				const order = iteration % 2 === 0 ? runs : [...runs].reverse();
				for (const run of order) run.sample();
			}
			runs.forEach((run, index) => {
				run.finish();
				const side = prepared[index].name;
				const { metrics } = run.result;
				if (side === 'head') {
					// Every row mounts from a prepared program, and an update only
					// writes changed bindings to the retained hosts.
					if (operation === 'mount') {
						assert.equal(metrics.templates, 0);
						assert.ok(metrics.programs > 0);
					} else {
						assert.deepEqual(metrics.ops, ['update']);
					}
				}
				targets.push({
					name: `${side === 'head' ? '' : `${side}-`}${variant}-${operation}`,
					ops: {
						ms: timingStatForJson(summarizeSamples(run.result.samples)),
						bytes: { score: run.result.bytes, median: run.result.bytes, samples: 1 },
					},
					meta: { variant, operation, rows: ROWS, ...metrics },
				});
			});
			const [base, head] = runs.length === 2 ? runs : [null, runs[0]];
			const median = (run) => summarizeSamples(run.result.samples).median.toFixed(3);
			rows.push(
				`| ${variant}-${operation} | ${base === null ? '' : `${median(base)} | `}${median(head)} | ${
					base === null
						? ''
						: `${formatRatio(pairedRatio(base.result.samples, head.result.samples))} | ${kb(base.result.bytes)} | `
				}${kb(head.result.bytes)} |`,
			);
		}
	}
	payload = { suite: 'universal-template-programs', iterations, targets };
	console.log(
		sides.length === 2
			? '| target | base ms | head ms | head/base [95% CI] | base KB per batch | head KB per batch |\n| --- | ---: | ---: | ---: | ---: | ---: |'
			: '| target | ms | KB per batch |\n| --- | ---: | ---: |',
	);
	console.log(rows.join('\n'));
} catch (error) {
	const message = error instanceof Error ? error.stack || error.message : String(error);
	payload = { suite: 'universal-template-programs', iterations, targets: [], failed: message };
	console.error(message);
	process.exitCode = 1;
} finally {
	fs.rmSync(temporary, { recursive: true, force: true });
}

if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, `${JSON.stringify(payload, null, '\t')}\n`);
}
