// Production Node-only descriptor-shape workload for octanejs/octane#981.
// Run a frozen baseline through BENCH_CLIENT_RUNTIME_URL and
// BENCH_SERVER_RUNTIME_URL; the default builds and imports this worktree.
process.env.NODE_ENV = 'production';

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { summarizeSamples, timingStatForJson } from '../lib/stats.mjs';

const REPO = path.resolve(import.meta.dirname, '../..');
const iterations = Number(process.argv[2] ?? 7);
if (!Number.isSafeInteger(iterations) || iterations < 1) {
	throw new TypeError('Pass a positive integer sample count.');
}
if (!process.env.BENCH_CLIENT_RUNTIME_URL && !process.env.BENCH_SERVER_RUNTIME_URL) {
	const build = spawnSync('pnpm', ['--filter', 'octane', 'build'], {
		cwd: REPO,
		stdio: 'inherit',
	});
	if (build.status !== 0) throw new Error('The production octane build failed.');
} else if (!process.env.BENCH_CLIENT_RUNTIME_URL || !process.env.BENCH_SERVER_RUNTIME_URL) {
	throw new Error('Specify both BENCH_CLIENT_RUNTIME_URL and BENCH_SERVER_RUNTIME_URL.');
}

const dist = path.join(REPO, 'packages/octane/dist');
const clientUrl =
	process.env.BENCH_CLIENT_RUNTIME_URL ?? pathToFileURL(path.join(dist, 'runtime.js')).href;
const serverUrl =
	process.env.BENCH_SERVER_RUNTIME_URL ?? pathToFileURL(path.join(dist, 'runtime.server.js')).href;

const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
let payload;

if (process.env.BENCH_SCOPE === undefined) {
	// The client and server runtime use different shared getter functions for
	// otherwise identically shaped records. Loading both in one V8 isolate makes
	// the second runtime dictionary-mode even when its real deployment is fast.
	const childResults = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-scoped-shapes-'));
	try {
		const targets = [];
		for (const scope of ['client', 'server']) {
			const output = path.join(childResults, `${scope}.json`);
			const child = spawnSync(
				process.execPath,
				[fileURLToPath(import.meta.url), String(iterations)],
				{
					cwd: REPO,
					encoding: 'utf8',
					env: {
						...process.env,
						BENCH_SCOPE: scope,
						BENCH_JSON: output,
						BENCH_CLIENT_RUNTIME_URL: clientUrl,
						BENCH_SERVER_RUNTIME_URL: serverUrl,
					},
				},
			);
			if (child.status !== 0) throw new Error(`${scope}: ${child.stderr || child.stdout}`);
			const result = JSON.parse(fs.readFileSync(output, 'utf8'));
			if (result.failed) throw new Error(`${scope}: ${result.failed}`);
			targets.push(...result.targets);
			process.stdout.write(child.stdout);
		}
		payload = { suite: 'scoped-descriptor-shapes', iterations, targets };
	} catch (error) {
		const message = error instanceof Error ? error.stack || error.message : String(error);
		payload = { suite: 'scoped-descriptor-shapes', iterations, targets: [], failed: message };
		console.error(message);
		process.exitCode = 1;
	} finally {
		fs.rmSync(childResults, { recursive: true, force: true });
	}
} else {
	if (process.env.BENCH_SCOPE !== 'client' && process.env.BENCH_SCOPE !== 'server') {
		throw new Error('BENCH_SCOPE must be client or server.');
	}
	try {
		const scope = process.env.BENCH_SCOPE;
		const modules = [[scope, await import(scope === 'client' ? clientUrl : serverUrl)]];
		const scenarios = [];
		const warmupSamples = 5;

		for (const [environment, runtime] of modules) {
			const { Children, cloneElement, createElement, createScopedElement, createScopedValue } =
				runtime;
			let nestedChildrenReads = 0;
			const nestedValue = createScopedValue(() =>
				createScopedElement('span', { key: 'nested', id: 'nested' }, () => {
					nestedChildrenReads++;
					return 'nested-child';
				}),
			);
			const nestedClone = cloneElement(nestedValue, { title: 'copied' });
			const nestedMapped = Children.map([nestedValue], (element) => element)[0];
			assert.equal(
				nestedChildrenReads,
				0,
				`${environment}: nested children resolved before inspection`,
			);
			assert.equal(nestedClone.key, 'nested');
			assert.equal(nestedClone.props.id, 'nested');
			assert.equal(nestedClone.props.title, 'copied');
			assert.equal(nestedClone.children, 'nested-child');
			assert.equal(nestedClone.props.children, 'nested-child');
			assert.equal(nestedMapped.key, '.$nested');
			assert.equal(nestedMapped.children, 'nested-child');
			assert.equal(nestedMapped.props.children, 'nested-child');
			assert.equal(nestedChildrenReads, 1);
			for (const size of [128, 1_024]) {
				const rows = Array.from({ length: size }, (_, index) => ({
					key: `row-${index}`,
					id: `row-${index}`,
					title: `label-${index}`,
					child: `value-${index}`,
				}));
				const configs = rows.map((row) => ({
					key: row.key,
					id: row.id,
					title: row.title,
					'data-kind': 'entry',
				}));
				const cloneConfigs = rows.map((row) => ({ title: `copy-${row.id}` }));
				const readCounts = new Int32Array(size);
				const readers = rows.map((row, index) => () => {
					readCounts[index]++;
					return row.child;
				});
				const plain = rows.map((row, index) => createElement('span', configs[index], row.child));
				const plainReaders = plain.map((element, index) => () => {
					readCounts[index]++;
					return element;
				});
				const scoped = rows.map((_, index) =>
					createScopedElement('span', configs[index], readers[index]),
				);
				const values = rows.map((_, index) => createScopedValue(plainReaders[index]));

				function inspect(element, row, kind, key = row.key, title = row.title) {
					assert.equal(element.type, 'span');
					assert.equal(element.key, key);
					assert.equal(element.ref, null);
					assert.equal(element.props.id, row.id);
					assert.equal(element.props.title, title);
					assert.equal(element.props['data-kind'], 'entry');
					assert.deepEqual(Object.keys(element), [
						'$$kind',
						'type',
						'props',
						'key',
						'ref',
						'children',
					]);
					assert.deepEqual(Object.keys(element.props), ['id', 'title', 'data-kind', 'children']);
					const deferred = Object.getOwnPropertyDescriptor(element, 'children');
					const propsDeferred = Object.getOwnPropertyDescriptor(element.props, 'children');
					assert.equal(deferred.enumerable, true);
					assert.equal(propsDeferred.enumerable, true);
					assert.equal(typeof deferred.get === 'function', kind !== 'plain');
					assert.equal(typeof propsDeferred.get === 'function', kind === 'scoped');
					assert.equal(element.children, row.child);
					assert.equal(element.props.children, row.child);
					return [key, title, element.children, element.props.children];
				}

				function add(name, operations, work, verify, shouldStayDeferred = false) {
					scenarios.push({
						name: `${environment}-${name}-${size}`,
						environment,
						size,
						operations,
						work,
						verify,
						deferredReadCounts: shouldStayDeferred ? readCounts : null,
						samples: [],
						outputHash: null,
					});
				}

				function createBatch(factory) {
					const result = new Array(size);
					for (let index = 0; index < size; index++) result[index] = factory(index);
					return result;
				}
				function verifyBatch(
					result,
					kind,
					keyFor = (row) => row.key,
					titleFor = (row) => row.title,
				) {
					assert.equal(result.length, size);
					return hash(
						result.map((item, index) =>
							inspect(item, rows[index], kind, keyFor(rows[index]), titleFor(rows[index])),
						),
					);
				}
				function expectedSum(items, work) {
					let total = 0;
					for (const item of items) total += work(item);
					return total;
				}
				function readFields(item) {
					return (
						item.type.length +
						item.props.id.length +
						item.key.length +
						(item.ref === null ? 1 : 0) +
						item.children.length +
						item.props.children.length
					);
				}
				function readKeys(item) {
					let count = 0;
					for (const key in item) count += key.length;
					for (const key in item.props) count += key.length;
					return count;
				}
				function readBatch(items, read, repetitions) {
					let total = 0;
					for (let repeat = 0; repeat < repetitions; repeat++) {
						for (let index = 0; index < size; index++) total += read(items[index]);
					}
					return total;
				}

				for (const [kind, factory, items] of [
					[
						'scoped-element',
						(index) => createScopedElement('span', configs[index], readers[index]),
						scoped,
					],
					['scoped-value', (index) => createScopedValue(plainReaders[index]), values],
					['plain', (index) => createElement('span', configs[index], rows[index].child), plain],
				]) {
					const descriptorKind =
						kind === 'scoped-element' ? 'scoped' : kind === 'plain' ? 'plain' : 'value';
					add(
						`${kind}-create`,
						size,
						() => createBatch(factory),
						(result) => verifyBatch(result, descriptorKind),
						kind !== 'plain',
					);
					const fieldsSum = expectedSum(items, readFields);
					add(
						`${kind}-read`,
						size * 32,
						() => readBatch(items, readFields, 32),
						(result) => {
							assert.equal(result, fieldsSum * 32);
							return hash(result);
						},
					);
					if (size === 1_024) {
						const keysSum = expectedSum(items, readKeys);
						add(
							`${kind}-enumerate`,
							size * 8,
							() => readBatch(items, readKeys, 8),
							(result) => {
								assert.equal(result, keysSum * 8);
								return hash(result);
							},
						);
					}
				}

				for (const [kind, items] of [
					['scoped-element', scoped],
					['plain', plain],
				]) {
					const descriptorKind = kind === 'plain' ? 'plain' : 'scoped';
					add(
						`${kind}-clone`,
						size,
						() => createBatch((index) => cloneElement(items[index], cloneConfigs[index])),
						(result) =>
							verifyBatch(
								result,
								descriptorKind,
								(row) => row.key,
								(row) => `copy-${row.id}`,
							),
						kind !== 'plain',
					);
					add(
						`${kind}-children-map`,
						size,
						() => Children.map(items, (element) => element),
						(result) => verifyBatch(result, descriptorKind, (row) => `.$${row.key}`),
						kind !== 'plain',
					);
				}

				if (environment === 'server' && size === 128) {
					for (const [kind, children] of [
						['scoped-element', scoped],
						['plain', plain],
					]) {
						const root = createElement('ul', { id: 'rows' }, children);
						const expectedHtml = `<!--[--><ul id="rows">${rows
							.map(
								(row) =>
									`<span id="${row.id}" title="${row.title}" data-kind="entry">${row.child}</span>`,
							)
							.join('')}</ul><!--]-->`;
						add(
							`${kind}-ssr`,
							size,
							() => runtime.renderToString(root),
							({ html, css }) => {
								assert.equal(html, expectedHtml);
								assert.equal(css, '');
								return hash([html, css]);
							},
						);
					}
				}
			}
		}

		function takeSample(scenario, measured) {
			const previousDeferredReads = scenario.deferredReadCounts?.reduce(
				(sum, count) => sum + count,
				0,
			);
			const start = performance.now();
			const result = scenario.work();
			const elapsedUsPerItem = ((performance.now() - start) * 1_000) / scenario.operations;
			if (scenario.deferredReadCounts !== null) {
				assert.equal(
					scenario.deferredReadCounts.reduce((sum, count) => sum + count, 0),
					previousDeferredReads,
					`${scenario.name}: deferred resolver ran during creation or cloning`,
				);
			}
			const outputHash = scenario.verify(result);
			if (scenario.outputHash !== null) assert.equal(outputHash, scenario.outputHash);
			scenario.outputHash = outputHash;
			if (measured) scenario.samples.push(elapsedUsPerItem);
		}
		for (let round = 0; round < warmupSamples + iterations; round++) {
			const ordered = round % 2 === 0 ? scenarios : [...scenarios].reverse();
			for (const scenario of ordered) takeSample(scenario, round >= warmupSamples);
		}
		const targets = scenarios.map((scenario) => {
			const timing = summarizeSamples(scenario.samples, { scoreMode: 'mean' });
			return {
				name: scenario.name,
				ops: { per_item_us: timingStatForJson(timing) },
				meta: {
					environment: scenario.environment,
					items: scenario.size,
					operationsPerSample: scenario.operations,
					outputHash: scenario.outputHash,
					nodeVersion: process.version,
					platform: process.platform,
					architecture: process.arch,
				},
			};
		});
		payload = { suite: 'scoped-descriptor-shapes', iterations, targets };
		console.log('| target | µs per item |');
		console.log('| --- | ---: |');
		for (const target of targets) {
			console.log(`| ${target.name} | ${target.ops.per_item_us.score.toFixed(3)} |`);
		}
	} catch (error) {
		const message = error instanceof Error ? error.stack || error.message : String(error);
		payload = { suite: 'scoped-descriptor-shapes', iterations, targets: [], failed: message };
		console.error(message);
		process.exitCode = 1;
	}
}

if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, `${JSON.stringify(payload, null, '\t')}\n`);
}
