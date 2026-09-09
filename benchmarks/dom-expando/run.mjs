// Node-only production probe for octanejs/octane#981's DOM expando reads.
// Each dist runs in its own process so one runtime cannot seed the other's DOM.
process.env.NODE_ENV = 'production';

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { summarizeSamples, timingStatForJson } from '../lib/stats.mjs';

const REPO = path.resolve(import.meta.dirname, '../..');
const HERE = fileURLToPath(import.meta.url);
const iterations = Number(process.argv[2] ?? 9);
if (!Number.isSafeInteger(iterations) || iterations < 1) {
	throw new TypeError('Pass a positive integer number of samples.');
}

const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const runtimeUrl = (dist) => pathToFileURL(path.join(path.resolve(dist), 'runtime.js')).href;
const baseline = process.env.BENCH_BASELINE_DIST_DIR;
const candidate = process.env.BENCH_CANDIDATE_DIST_DIR;
const single = process.env.BENCH_DIST_DIR;
if ((baseline || candidate) && (!baseline || !candidate || single)) {
	throw new Error(
		'Set both BENCH_BASELINE_DIST_DIR and BENCH_CANDIDATE_DIST_DIR, or BENCH_DIST_DIR alone.',
	);
}
if (!baseline && !single) {
	throw new Error('Build octane first and set BENCH_DIST_DIR or both BENCH_*_DIST_DIR paths.');
}

let payload;
try {
	if (process.env.BENCH_EXPANDO_WORKER === undefined) {
		const variants = baseline
			? [
					['baseline', baseline],
					['candidate', candidate],
				]
			: [['single', single]];
		const results = [];
		for (const [name, dist] of variants) {
			const child = spawnSync(process.execPath, [HERE, String(iterations)], {
				cwd: REPO,
				encoding: 'utf8',
				env: {
					...process.env,
					BENCH_EXPANDO_WORKER: '1',
					BENCH_EXPANDO_RUNTIME_URL: runtimeUrl(dist),
					BENCH_EXPANDO_VARIANT: name,
				},
			});
			if (child.status !== 0) {
				throw new Error(`${name}: ${child.stderr || child.stdout}`);
			}
			results.push(JSON.parse(child.stdout));
		}
		if (results.length === 2) {
			for (const target of results[0].targets) {
				const other = results[1].targets.find((entry) => entry.name === target.name);
				assert.ok(other, `${target.name}: missing candidate result`);
				assert.equal(
					other.meta.outputHash,
					target.meta.outputHash,
					`${target.name}: semantic drift`,
				);
			}
		}
		payload = { suite: 'dom-expando', iterations, variants: results };
		console.log('| target | ' + results.map((item) => item.variant).join(' | ') + ' |');
		console.log('| --- | ' + results.map(() => '---:').join(' | ') + ' |');
		for (const target of results[0].targets) {
			console.log(
				`| ${target.name} | ${results
					.map((item) =>
						item.targets
							.find((entry) => entry.name === target.name)
							.ops.per_item_us.score.toFixed(4),
					)
					.join(' | ')} |`,
			);
		}
		for (const item of results) console.log(`${item.variant}: ${JSON.stringify(item.diagnostics)}`);
	} else {
		const dependencyRoot = path.resolve(process.env.BENCH_DEPENDENCIES_DIR || REPO);
		const requireDependency = createRequire(path.join(dependencyRoot, 'package.json'));
		const { JSDOM } = requireDependency('jsdom');
		const dom = new JSDOM('<!doctype html><html><body></body></html>', {
			url: 'http://localhost/',
		});
		for (const key of [
			'window',
			'document',
			'Node',
			'Element',
			'CharacterData',
			'HTMLElement',
			'HTMLInputElement',
			'HTMLTextAreaElement',
			'Event',
			'MutationObserver',
		]) {
			Object.defineProperty(globalThis, key, {
				configurable: true,
				value: key === 'window' ? dom.window : dom.window[key],
			});
		}
		const runtime = await import(process.env.BENCH_EXPANDO_RUNTIME_URL);
		const {
			createRoot,
			createElement,
			flushSync,
			setDangerouslySetInnerHTML,
			setDefaultValueUncontrolled,
			setDefaultChecked,
		} = runtime;

		const count = 128;
		function Row({ id, version }) {
			return createElement('span', { 'data-row': id }, `row-${id}:${version}`);
		}
		function Scene({ version }) {
			return createElement(
				'section',
				{ id: 'rows' },
				Array.from({ length: count }, (_, id) => createElement(Row, { id, version, key: id })),
			);
		}
		const container = document.createElement('div');
		document.body.append(container);
		const root = createRoot(container);
		root.render(Scene, { version: 0 });
		const rendered = [...container.querySelectorAll('span[data-row]')];
		assert.equal(rendered.length, count);
		const stamped = rendered[0];
		const descriptor = Object.getOwnPropertySymbols(stamped).find(
			(symbol) => symbol.description === 'octane.deoptDesc',
		);
		assert.ok(descriptor, 'Scene must render real de-opt host descriptors');
		assert.ok(stamped[descriptor], 'rendered host must retain its descriptor');
		const plain = Array.from({ length: 1_024 }, () => document.createElement('span'));
		const text = Array.from({ length: 1_024 }, () => document.createTextNode('plain'));
		const inputs = Array.from({ length: 1_024 }, () => document.createElement('input'));
		const baselineInput = document.createElement('input');
		setDefaultValueUncontrolled(baselineInput, 'initial');
		const valueSymbol = Object.getOwnPropertySymbols(baselineInput).find(
			(symbol) => symbol.description === 'octane.defaultValue',
		);
		assert.ok(valueSymbol);
		baselineInput.value = 'user edit';
		setDefaultValueUncontrolled(baselineInput, 'reset');
		assert.equal(baselineInput.value, 'user edit');
		assert.equal(baselineInput.defaultValue, 'reset');
		const checked = document.createElement('input');
		checked.type = 'checkbox';
		checked.checked = false; // mark the browser's live checkedness dirty
		setDefaultChecked(checked, true);
		assert.equal(
			checked.checked,
			true,
			'first authored defaultChecked initializes live checkedness',
		);
		assert.equal(checked.defaultChecked, true);
		const raw = document.createElement('div');
		setDangerouslySetInnerHTML(raw, { __html: '<b>raw</b>' });
		assert.equal(raw.innerHTML, '<b>raw</b>');
		setDangerouslySetInnerHTML(raw, null);
		assert.equal(raw.innerHTML, '');

		const hasOwn = Object.prototype.hasOwnProperty;
		for (const host of [plain[0], text[0], inputs[0]]) {
			assert.equal(hasOwn.call(host, descriptor), false);
			assert.equal(host[descriptor], undefined);
		}
		assert.equal(hasOwn.call(plain[0], '__oct_dangerHTML'), false);
		assert.equal(plain[0].__oct_dangerHTML, undefined);
		assert.equal(hasOwn.call(inputs[0], valueSymbol), false);
		assert.equal(inputs[0][valueSymbol], undefined);

		const diagnostics = {
			'danger-inherited': '__oct_dangerHTML' in Element.prototype,
			'danger-static-inherited': '__oct_dangerChild' in Element.prototype,
			'danger-spread-inherited': '__oct_dangerSpreadChild' in Element.prototype,
			'danger-enumerable': Object.prototype.propertyIsEnumerable.call(
				Element.prototype,
				'__oct_dangerHTML',
			),
			'deopt-element-inherited': descriptor in Element.prototype,
			'deopt-text-inherited': descriptor in CharacterData.prototype,
			'default-value-inherited': valueSymbol in Element.prototype,
		};
		const scenarios = [];
		function add(name, items, repeats, work, verify) {
			scenarios.push({
				name,
				operations: items * repeats,
				work,
				verify,
				samples: [],
				outputHash: null,
			});
		}
		function sum(nodes, reader, repeats) {
			let total = 0;
			for (let repeat = 0; repeat < repeats; repeat++) {
				for (let index = 0; index < nodes.length; index++) total += reader(nodes[index]);
			}
			return total;
		}
		const emptyRead = (value) => (value === undefined ? 1 : 0);
		const controlSymbol = Symbol('unseeded-control');
		add(
			'unseeded-control-miss',
			plain.length,
			64,
			() => sum(plain, (node) => emptyRead(node[controlSymbol]), 64),
			(result) => {
				assert.equal(result, plain.length * 64);
				return hash(result);
			},
		);
		add(
			'node-type-control',
			plain.length,
			64,
			() => sum(plain, (node) => node.nodeType, 64),
			(result) => {
				assert.equal(result, plain.length * 64);
				return hash(result);
			},
		);
		add(
			'danger-active-miss',
			plain.length,
			64,
			() => sum(plain, (node) => emptyRead(node.__oct_dangerHTML), 64),
			(result) => {
				assert.equal(result, plain.length * 64);
				return hash(result);
			},
		);
		add(
			'danger-child-misses',
			plain.length,
			64,
			() =>
				sum(
					plain,
					(node) => emptyRead(node.__oct_dangerChild) + emptyRead(node.__oct_dangerSpreadChild),
					64,
				),
			(result) => {
				assert.equal(result, plain.length * 64 * 2);
				return hash(result);
			},
		);
		add(
			'deopt-element-miss',
			plain.length,
			64,
			() => sum(plain, (node) => emptyRead(node[descriptor]), 64),
			(result) => {
				assert.equal(result, plain.length * 64);
				return hash(result);
			},
		);
		add(
			'deopt-text-miss',
			text.length,
			64,
			() => sum(text, (node) => emptyRead(node[descriptor]), 64),
			(result) => {
				assert.equal(result, text.length * 64);
				return hash(result);
			},
		);
		add(
			'default-value-miss',
			inputs.length,
			64,
			() => sum(inputs, (node) => emptyRead(node[valueSymbol]), 64),
			(result) => {
				assert.equal(result, inputs.length * 64);
				return hash(result);
			},
		);
		let version = 1;
		add(
			'deopt-host-update',
			count,
			1,
			() => {
				const next = version++;
				flushSync(() => root.render(Scene, { version: next }));
				return next;
			},
			(next) => {
				const spans = [...container.querySelectorAll('span[data-row]')];
				assert.equal(spans.length, count);
				for (let id = 0; id < count; id++) {
					assert.equal(spans[id], rendered[id], `${id}: retained keyed row`);
					assert.equal(spans[id].textContent, `row-${id}:${next}`);
				}
				return hash(['retained de-opt rows', count]);
			},
		);

		const warmup = 5;
		for (let round = 0; round < warmup + iterations; round++) {
			for (const scenario of round % 2 === 0 ? scenarios : [...scenarios].reverse()) {
				const begin = performance.now();
				const result = scenario.work();
				const elapsed = ((performance.now() - begin) * 1_000) / scenario.operations;
				const observed = scenario.verify(result);
				if (scenario.outputHash !== null) assert.equal(observed, scenario.outputHash);
				scenario.outputHash = observed;
				if (round >= warmup) scenario.samples.push(elapsed);
			}
		}
		const targets = scenarios.map((scenario) => ({
			name: scenario.name,
			ops: {
				per_item_us: timingStatForJson(summarizeSamples(scenario.samples, { scoreMode: 'mean' })),
			},
			meta: {
				outputHash: scenario.outputHash,
				operationsPerSample: scenario.operations,
				nodeVersion: process.version,
			},
		}));
		root.unmount();
		container.remove();
		dom.window.close();
		process.stdout.write(
			JSON.stringify({ variant: process.env.BENCH_EXPANDO_VARIANT, targets, diagnostics }),
		);
	}
} catch (error) {
	const message = error instanceof Error ? error.stack || error.message : String(error);
	console.error(message);
	process.exitCode = 1;
	if (process.env.BENCH_EXPANDO_WORKER === undefined)
		payload = { suite: 'dom-expando', failed: message };
}

if (payload && process.env.BENCH_JSON)
	fs.writeFileSync(process.env.BENCH_JSON, `${JSON.stringify(payload, null, 2)}\n`);
