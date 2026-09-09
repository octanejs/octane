// Production Node/V8 probe for octanejs/octane#981's memo wrapper shapes.
// Run client and server in separate isolates: their accessor identities are
// independent, and loading both into one isolate would change the map sample.
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

const suppliedDist = process.env.BENCH_DIST_DIR;
const suppliedClient = process.env.BENCH_CLIENT_RUNTIME_URL;
const suppliedServer = process.env.BENCH_SERVER_RUNTIME_URL;
if (suppliedDist && (suppliedClient || suppliedServer)) {
	throw new Error('Use BENCH_DIST_DIR or the two runtime URLs, not both.');
}
if (!suppliedDist && !suppliedClient && !suppliedServer) {
	const build = spawnSync('pnpm', ['--filter', 'octane', 'build'], {
		cwd: REPO,
		stdio: 'inherit',
	});
	if (build.status !== 0) throw new Error('The production octane build failed.');
} else if (!suppliedDist && (!suppliedClient || !suppliedServer)) {
	throw new Error('Specify both BENCH_CLIENT_RUNTIME_URL and BENCH_SERVER_RUNTIME_URL.');
}

const dist = suppliedDist ? path.resolve(suppliedDist) : path.join(REPO, 'packages/octane/dist');
const clientUrl = suppliedClient ?? pathToFileURL(path.join(dist, 'runtime.js')).href;
const serverUrl = suppliedServer ?? pathToFileURL(path.join(dist, 'runtime.server.js')).href;
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const script = fileURLToPath(import.meta.url);
let payload;

if (process.env.BENCH_SCOPE === undefined) {
	const childResults = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-memo-wrapper-shapes-'));
	try {
		const targets = [];
		for (const scope of ['client', 'server']) {
			const output = path.join(childResults, `${scope}.json`);
			const child = spawnSync(
				process.execPath,
				['--allow-natives-syntax', script, String(iterations)],
				{
					cwd: REPO,
					encoding: 'utf8',
					env: {
						...process.env,
						BENCH_SCOPE: scope,
						BENCH_JSON: output,
						BENCH_CLIENT_RUNTIME_URL: clientUrl,
						BENCH_SERVER_RUNTIME_URL: serverUrl,
						BENCH_DIST_DIR: '',
					},
				},
			);
			if (child.status !== 0) throw new Error(`${scope}: ${child.stderr || child.stdout}`);
			const result = JSON.parse(fs.readFileSync(output, 'utf8'));
			if (result.failed) throw new Error(`${scope}: ${result.failed}`);
			targets.push(...result.targets);
			process.stdout.write(child.stdout);
		}
		payload = { suite: 'memo-wrapper-shapes', iterations, targets };
	} catch (error) {
		const message = error instanceof Error ? error.stack || error.message : String(error);
		payload = { suite: 'memo-wrapper-shapes', iterations, targets: [], failed: message };
		console.error(message);
		process.exitCode = 1;
	} finally {
		fs.rmSync(childResults, { recursive: true, force: true });
	}
} else {
	try {
		const scope = process.env.BENCH_SCOPE;
		if (scope !== 'client' && scope !== 'server') throw new Error('Invalid BENCH_SCOPE.');
		const { memo } = await import(scope === 'client' ? clientUrl : serverUrl);
		const hasFastProperties = new Function('value', 'return %HasFastProperties(value);');
		const scenarios = [];
		const warmups = 5;

		for (const size of [128, 1_024]) {
			const components = Array.from({ length: size }, (_, index) => {
				function Component(props) {
					return props.value + index;
				}
				Component.defaultProps = { value: index };
				return Component;
			});
			const compare = (oldProps, newProps) => oldProps.value === newProps.value;
			const hasCompare = scope === 'client';
			const makeMemo = (component, index) =>
				hasCompare && index % 8 === 0 ? memo(component, compare) : memo(component);
			const makePlain = (component) => {
				function Plain(props) {
					return component(props);
				}
				return Plain;
			};
			const makeData = (component, index) => {
				function Data(props) {
					return component(props);
				}
				Object.defineProperty(Data, 'type', { value: component });
				Object.defineProperty(Data, 'displayName', {
					configurable: true,
					writable: true,
					value: 'Component',
				});
				Object.defineProperty(Data, '__memo', { value: true });
				Object.defineProperty(Data, 'defaultProps', {
					configurable: true,
					value: component.defaultProps,
				});
				if (hasCompare && index % 8 === 0) {
					Object.defineProperty(Data, '__compare', { value: compare });
				}
				return Data;
			};
			const makeBatch = (factory) => {
				const wrappers = new Array(size);
				for (let index = 0; index < size; index++) {
					wrappers[index] = factory(components[index], index);
				}
				return wrappers;
			};
			const memoWrappers = makeBatch(makeMemo);
			const plainWrappers = makeBatch(makePlain);
			const dataWrappers = makeBatch(makeData);

			function checkStatics(wrappers) {
				const results = [];
				for (let index = 0; index < size; index++) {
					const wrapper = wrappers[index];
					const component = components[index];
					assert.equal(wrapper.type, component);
					assert.equal(wrapper.displayName, 'Component');
					assert.equal(wrapper.__memo, true);
					assert.equal(wrapper.defaultProps, component.defaultProps);
					assert.equal(wrapper({ value: 3 }), index + 3);
					assert.deepEqual(Object.keys(wrapper), []);
					assert.equal(Object.getOwnPropertyDescriptor(wrapper, '__memo')?.enumerable, false);
					assert.equal(wrapper.__compare, hasCompare && index % 8 === 0 ? compare : undefined);
					results.push([index, wrapper.displayName, wrapper.defaultProps.value, wrapper.__memo]);
				}
				return hash(results);
			}

			function checkPlain(wrappers) {
				const results = [];
				for (let index = 0; index < size; index++) {
					assert.equal(wrappers[index]({ value: 3 }), index + 3);
					results.push([index, wrappers[index].name]);
				}
				return hash(results);
			}

			checkStatics(memoWrappers);
			checkStatics(dataWrappers);
			checkPlain(plainWrappers);
			// These are untimed contract checks. A static-hoisting HOC copies even
			// non-enumerable keys and must not become a memo boundary itself.
			const first = memoWrappers[0];
			const original = components[0];
			const before = original.defaultProps;
			function Hoisted() {}
			for (const key of Reflect.ownKeys(first)) {
				if (!['name', 'length', 'prototype', 'arguments', 'caller'].includes(key)) {
					Object.defineProperty(Hoisted, key, Object.getOwnPropertyDescriptor(first, key));
				}
			}
			assert.equal(Hoisted.__memo, false);
			assert.equal(Hoisted.defaultProps, before);
			const replacement = { value: 9001 };
			first.defaultProps = replacement;
			assert.equal(original.defaultProps, replacement);
			assert.equal(Hoisted.defaultProps, replacement);
			original.defaultProps = before;
			assert.equal(first.defaultProps, before);
			first.displayName = 'Renamed';
			assert.equal(first.displayName, 'Renamed');
			first.displayName = 'Component';

			const batches = Math.max(4, Math.ceil(16_384 / size));
			const add = (name, operations, work, verify, wrappers = null) => {
				scenarios.push({
					name: `${scope}-${name}-${size}`,
					size,
					operations,
					work,
					verify,
					wrappers,
					samples: [],
					outputHash: null,
				});
			};
			for (const [kind, factory, verify] of [
				['memo', makeMemo, checkStatics],
				['data', makeData, checkStatics],
				['plain', makePlain, checkPlain],
			]) {
				add(
					`${kind}-create`,
					size * batches,
					() => {
						let latest;
						for (let batch = 0; batch < batches; batch++) latest = makeBatch(factory);
						return latest;
					},
					verify,
				);
			}

			const readMemo = (wrappers) => {
				let total = 0;
				for (let repeat = 0; repeat < 128; repeat++) {
					for (let index = 0; index < size; index++) {
						const wrapped = wrappers[index];
						if (wrapped.__memo) total++;
						total += wrapped.defaultProps.value;
						total += wrapped.type.name.length + wrapped.displayName.length;
					}
				}
				return total;
			};
			const expectedMemo = readMemo(memoWrappers);
			add(
				'memo-read',
				size * 128,
				() => readMemo(memoWrappers),
				(value) => {
					assert.equal(value, expectedMemo);
					return hash(value);
				},
				memoWrappers,
			);
			const expectedData = readMemo(dataWrappers);
			assert.equal(expectedData, expectedMemo);
			add(
				'data-read',
				size * 128,
				() => readMemo(dataWrappers),
				(value) => {
					assert.equal(value, expectedData);
					return hash(value);
				},
				dataWrappers,
			);

			// Plain wrapper reads track CPU drift without memo metadata lookups.
			const readPlain = (wrappers) => {
				let total = 0;
				for (let repeat = 0; repeat < 128; repeat++) {
					for (let index = 0; index < size; index++) total += wrappers[index].name.length;
				}
				return total;
			};
			const expectedPlain = readPlain(plainWrappers);
			add(
				'plain-read',
				size * 128,
				() => readPlain(plainWrappers),
				(value) => {
					assert.equal(value, expectedPlain);
					return hash(value);
				},
				plainWrappers,
			);
		}

		for (let round = 0; round < warmups + iterations; round++) {
			const order = round % 2 === 0 ? scenarios : [...scenarios].reverse();
			for (const scenario of order) {
				const start = performance.now();
				const result = scenario.work();
				const perItemUs = ((performance.now() - start) * 1_000) / scenario.operations;
				const outputHash = scenario.verify(result);
				if (scenario.outputHash !== null) assert.equal(outputHash, scenario.outputHash);
				scenario.outputHash = outputHash;
				if (round >= warmups) scenario.samples.push(perItemUs);
			}
		}

		const targets = scenarios.map((scenario) => {
			const stat = summarizeSamples(scenario.samples, { scoreMode: 'mean' });
			const shapes = scenario.wrappers
				? scenario.wrappers.reduce(
						(count, wrapper) => count + Number(hasFastProperties(wrapper)),
						0,
					)
				: null;
			return {
				name: scenario.name,
				ops: { per_item_us: timingStatForJson(stat) },
				meta: {
					items: scenario.size,
					operationsPerSample: scenario.operations,
					outputHash: scenario.outputHash,
					fastPropertyObjects: shapes,
					shapeSampleObjects: scenario.wrappers?.length ?? 0,
					nodeVersion: process.version,
					platform: process.platform,
					architecture: process.arch,
				},
			};
		});
		const memoShapes = new Map();
		for (const size of [128, 1_024]) {
			const scenario = scenarios.find((entry) => entry.name === `${scope}-memo-read-${size}`);
			memoShapes.set(size, {
				fast: scenario.wrappers.reduce(
					(sum, wrapper) => sum + Number(hasFastProperties(wrapper)),
					0,
				),
				count: size,
			});
		}
		for (const target of targets) {
			if (target.name.includes('memo-create')) {
				target.meta.memoWrapperShapes = memoShapes.get(target.meta.items);
			}
		}
		payload = { suite: 'memo-wrapper-shapes', iterations, targets };
		console.log('| target | µs per item | fast sampled wrappers |');
		console.log('| --- | ---: | ---: |');
		for (const target of targets) {
			const shapes = target.meta.memoWrapperShapes;
			const shapeCount = shapes
				? `${shapes.fast}/${shapes.count}`
				: target.meta.shapeSampleObjects
					? `${target.meta.fastPropertyObjects}/${target.meta.shapeSampleObjects}`
					: '—';
			console.log(
				`| ${target.name} | ${target.ops.per_item_us.score.toFixed(3)} | ${shapeCount} |`,
			);
		}
	} catch (error) {
		const message = error instanceof Error ? error.stack || error.message : String(error);
		payload = { suite: 'memo-wrapper-shapes', iterations, targets: [], failed: message };
		console.error(message);
		process.exitCode = 1;
	}
}

if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, `${JSON.stringify(payload, null, '\t')}\n`);
}
