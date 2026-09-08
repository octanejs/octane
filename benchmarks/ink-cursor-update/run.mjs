process.env.NODE_ENV = 'production';

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { summarizeSamples, timingStatForJson } from '../lib/stats.mjs';

if (process.env.OCTANE_INK_CURSOR_BENCH_CHILD !== '1') {
	const child = spawnSync(
		process.execPath,
		['--expose-gc', '--max-semi-space-size=128', import.meta.filename, ...process.argv.slice(2)],
		{
			env: { ...process.env, OCTANE_INK_CURSOR_BENCH_CHILD: '1' },
			stdio: 'inherit',
		},
	);
	process.exit(child.status ?? 1);
}

assert.equal(
	typeof globalThis.gc,
	'function',
	'Ink cursor benchmark requires exposed garbage collection',
);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const INK_SOURCE_DIR = path.join(REPO, 'packages/ink/src');
const LOG_UPDATE_PATH = path.join(INK_SOURCE_DIR, 'log-update.ts');
const iterations = Number.parseInt(process.argv[2] ?? '8', 10);

if (!Number.isSafeInteger(iterations) || iterations < 1) {
	throw new Error('Ink cursor-update iterations must be a positive integer');
}

const REPRESENTATIVE_LINES = 20_000;
const STRESS_LINES = 80_000;
const SMALL_LINES = 32;
const REPRESENTATIVE_UPDATES = 80;
const SCALING_UPDATES = 20_000;
const SPLIT_UPDATES = 12;
const CONTROL_RENDERS = 32;
const POSITION_A = { x: 3, y: 1 };

const currentStandardBranch = String.raw`		if (str === previousOutput && cursorChanged) {
			const visibleCount = retainedVisibleLineCount(previousLineCount, previousOutput);
			stream.write(
				buildCursorOnlySequence({
					cursorWasShown,
					previousLineCount,
					previousCursorPosition,
					visibleLineCount: visibleCount,
					cursorPosition: activeCursor,
				}),
			);
		} else {
			const lines = str.split('\n');
			const visibleCount = visibleLineCount(lines, str);
			const cursorSuffix = buildCursorSuffix(visibleCount, activeCursor);
			previousOutput = str;
			const returnPrefix = buildReturnToBottomPrefix(
				cursorWasShown,
				previousLineCount,
				previousCursorPosition,
			);
			stream.write(returnPrefix + ansiEscapes.eraseLines(previousLineCount) + str + cursorSuffix);
			previousLineCount = lines.length;
		}`;

const previousStandardBranch = String.raw`		const lines = str.split('\n');
		const visibleCount = visibleLineCount(lines, str);
		const cursorSuffix = buildCursorSuffix(visibleCount, activeCursor);

		if (str === previousOutput && cursorChanged) {
			stream.write(
				buildCursorOnlySequence({
					cursorWasShown,
					previousLineCount,
					previousCursorPosition,
					visibleLineCount: visibleCount,
					cursorPosition: activeCursor,
				}),
			);
		} else {
			previousOutput = str;
			const returnPrefix = buildReturnToBottomPrefix(
				cursorWasShown,
				previousLineCount,
				previousCursorPosition,
			);
			stream.write(returnPrefix + ansiEscapes.eraseLines(previousLineCount) + str + cursorSuffix);
			previousLineCount = lines.length;
		}`;

const currentIncrementalBranch = String.raw`		if (str === previousOutput && cursorChanged) {
			const visibleCount = retainedVisibleLineCount(previousLines.length, previousOutput);
			stream.write(
				buildCursorOnlySequence({
					cursorWasShown,
					previousLineCount: previousLines.length,
					previousCursorPosition,
					visibleLineCount: visibleCount,
					cursorPosition: activeCursor,
				}),
			);
			previousCursorPosition = activeCursor ? { ...activeCursor } : undefined;
			cursorWasShown = activeCursor !== undefined;
			return true;
		}

		const nextLines = str.split('\n');
		const visibleCount = visibleLineCount(nextLines, str);
		const previousVisible = visibleLineCount(previousLines, previousOutput);`;

const previousIncrementalBranch = String.raw`		const nextLines = str.split('\n');
		const visibleCount = visibleLineCount(nextLines, str);
		const previousVisible = visibleLineCount(previousLines, previousOutput);

		if (str === previousOutput && cursorChanged) {
			stream.write(
				buildCursorOnlySequence({
					cursorWasShown,
					previousLineCount: previousLines.length,
					previousCursorPosition,
					visibleLineCount: visibleCount,
					cursorPosition: activeCursor,
				}),
			);
			previousCursorPosition = activeCursor ? { ...activeCursor } : undefined;
			cursorWasShown = activeCursor !== undefined;
			return true;
		}`;

function replaceExact(source, current, previous, label) {
	const first = source.indexOf(current);
	assert.notEqual(first, -1, `current ${label} branch no longer matches the benchmark fixture`);
	assert.equal(
		source.indexOf(current, first + current.length),
		-1,
		`current ${label} branch matched more than once`,
	);
	return source.slice(0, first) + previous + source.slice(first + current.length);
}

function previousSourceFrom(currentSource) {
	return replaceExact(
		replaceExact(
			currentSource,
			currentStandardBranch,
			previousStandardBranch,
			'standard cursor-only',
		),
		currentIncrementalBranch,
		previousIncrementalBranch,
		'incremental cursor-only',
	);
}

async function bundlePair(previousSource, outfile) {
	await build({
		stdin: {
			contents:
				`import production from ${JSON.stringify(LOG_UPDATE_PATH)};\n` +
				`import previous from 'virtual:ink-previous';\n` +
				`export { production, previous };\n`,
			resolveDir: REPO,
			sourcefile: 'ink-cursor-update-entry.mjs',
			loader: 'js',
		},
		outfile,
		bundle: true,
		format: 'esm',
		platform: 'node',
		target: 'node22',
		logLevel: 'silent',
		define: { 'process.env.NODE_ENV': JSON.stringify('production') },
		banner: {
			js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
		},
		plugins: [
			{
				name: 'ink-previous-log-update',
				setup(pluginBuild) {
					pluginBuild.onResolve({ filter: /^virtual:ink-previous$/ }, () => ({
						path: 'log-update.ts',
						namespace: 'ink-previous',
					}));
					pluginBuild.onLoad({ filter: /.*/, namespace: 'ink-previous' }, () => ({
						contents: previousSource,
						loader: 'ts',
						resolveDir: INK_SOURCE_DIR,
					}));
				},
			},
		],
	});
}

function makeFrame(lineCount) {
	const lines = new Array(lineCount);
	for (let index = 0; index < lineCount; index++) {
		lines[index] = `line-${String(index).padStart(5, '0')}-${'x'.repeat(39)}`;
	}
	return lines.join('\n');
}

function materializeEqualCopies(frame, count) {
	return Array.from({ length: count }, () => Buffer.from(frame).toString());
}

function positionB(lineCount) {
	return { x: 17, y: lineCount - 2 };
}

function createDiscardStream(capture = false) {
	const chunks = capture ? [] : null;
	let writes = 0;
	return {
		stream: {
			columns: 80,
			isTTY: false,
			write(chunk, callback) {
				writes++;
				chunks?.push(String(chunk));
				callback?.();
				return true;
			},
		},
		get writes() {
			return writes;
		},
		reset() {
			writes = 0;
			if (chunks) chunks.length = 0;
		},
		chunks,
	};
}

function createRenderer(factory, incremental, output = createDiscardStream()) {
	return {
		output,
		render: factory.create(output.stream, { incremental, showCursor: true }),
	};
}

function transcript(factory, incremental, scenario) {
	const { output, render } = createRenderer(factory, incremental, createDiscardStream(true));
	const results = scenario(render);
	return { bytes: output.chunks.join(''), chunks: [...output.chunks], results };
}

function semanticGates(previous, production) {
	const scenarios = [
		{
			name: 'ordinary',
			run(render) {
				render.setCursorPosition({ x: 0, y: 0 });
				const seeded = render('one\ntwo');
				render.setCursorPosition({ x: 2, y: 1 });
				return [seeded, render('one\ntwo')];
			},
		},
		{
			name: 'trailing-newline',
			run(render) {
				render.setCursorPosition({ x: 0, y: 0 });
				const seeded = render('one\ntwo\n');
				render.setCursorPosition({ x: 2, y: 1 });
				return [seeded, render('one\ntwo\n')];
			},
		},
		...['create', 'clear', 'reset', 'done'].map((state) => ({
			name: `empty-after-${state}`,
			run(render) {
				if (state !== 'create') {
					render('seed');
					render[state]();
				}
				render.setCursorPosition({ x: 0, y: 0 });
				return [render.willRender(''), render('')];
			},
		})),
		{
			name: 'dirty-hide-no-op',
			run(render) {
				render.setCursorPosition({ x: 1, y: 0 });
				const dirty = render('one\ntwo');
				const willHide = render.willRender('one\ntwo');
				const hidden = render('one\ntwo');
				const willNoop = render.willRender('one\ntwo');
				const noop = render('one\ntwo');
				return [dirty, willHide, hidden, willNoop, noop];
			},
		},
		{
			name: 'changed-output',
			run(render) {
				return [render('old\nframe'), render.willRender('new\nframe'), render('new\nframe')];
			},
		},
		{
			name: 'synced-output',
			run(render) {
				render.sync('one\ntwo\n');
				render.setCursorPosition({ x: 2, y: 1 });
				return [render.willRender('one\ntwo\n'), render('one\ntwo\n')];
			},
		},
	];

	for (const incremental of [false, true]) {
		for (const scenario of scenarios) {
			const expected = transcript(previous, incremental, scenario.run);
			const actual = transcript(production, incremental, scenario.run);
			assert.deepEqual(
				actual,
				expected,
				`${incremental ? 'incremental' : 'standard'}/${scenario.name} changed bytes or results`,
			);
		}
	}
	return scenarios.length * 2;
}

function countNewlineSplits(run) {
	const original = String.prototype.split;
	let splits = 0;
	String.prototype.split = function (separator, limit) {
		if (separator === '\n') splits++;
		return original.call(this, separator, limit);
	};
	try {
		run();
		return splits;
	} finally {
		String.prototype.split = original;
	}
}

function splitGates(implementations, modes, frame, changedFrame) {
	const counts = {};
	for (const implementation of implementations) {
		for (const mode of modes) {
			const prefix = `${implementation.name}-${mode.name}`;
			const cursor = createRenderer(implementation.factory, mode.incremental);
			cursor.render.setCursorPosition(POSITION_A);
			assert.equal(cursor.render(frame), true);
			const cursorCount = countNewlineSplits(() => {
				for (let update = 0; update < SPLIT_UPDATES; update++) {
					cursor.render.setCursorPosition(
						update % 2 === 0 ? positionB(REPRESENTATIVE_LINES) : POSITION_A,
					);
					assert.equal(cursor.render(frame), true);
				}
			});

			const initial = createRenderer(implementation.factory, mode.incremental);
			const initialCount = countNewlineSplits(() => assert.equal(initial.render(frame), true));

			const changed = createRenderer(implementation.factory, mode.incremental);
			assert.equal(changed.render(frame), true);
			const changedCount = countNewlineSplits(() =>
				assert.equal(changed.render(changedFrame), true),
			);

			counts[prefix] = { cursor: cursorCount, initial: initialCount, changed: changedCount };
			assert.equal(
				cursorCount,
				implementation.name === 'production' ? 0 : SPLIT_UPDATES,
				`${prefix} cursor-only split count`,
			);
			assert.equal(initialCount, 1, `${prefix} initial split count`);
			assert.equal(changedCount, 1, `${prefix} changed split count`);
		}
	}
	return counts;
}

function seedRenderer(factory, incremental, frame, lineCount, output = createDiscardStream()) {
	const created = createRenderer(factory, incremental, output);
	created.render.setCursorPosition(POSITION_A);
	assert.equal(created.render(frame), true, 'seed render failed');
	created.output.reset();
	return { ...created, alternate: positionB(lineCount) };
}

function cursorBatchTranscript(factory, incremental, frames, lineCount) {
	const output = createDiscardStream(true);
	const { render, alternate } = seedRenderer(factory, incremental, frames[0], lineCount, output);
	const results = [];
	for (let update = 0; update < frames.length; update++) {
		render.setCursorPosition(update % 2 === 0 ? alternate : POSITION_A);
		results.push(render(frames[update]));
	}
	return { chunks: [...output.chunks], results, writes: output.writes };
}

function representativeTranscriptGates(previous, production, modes, frames, lineCount) {
	for (const mode of modes) {
		const expected = cursorBatchTranscript(previous, mode.incremental, frames, lineCount);
		const actual = cursorBatchTranscript(production, mode.incremental, frames, lineCount);
		assert.deepEqual(
			actual,
			expected,
			`${mode.name}/representative changed per-update bytes or results`,
		);
	}
	return modes.length;
}

function measureCursorBatch(factory, incremental, frames, lineCount) {
	const { output, render, alternate } = seedRenderer(factory, incremental, frames[0], lineCount);
	let successfulRenders = 0;
	globalThis.gc();
	const started = performance.now();
	for (let update = 0; update < frames.length; update++) {
		render.setCursorPosition(update % 2 === 0 ? alternate : POSITION_A);
		if (render(frames[update])) successfulRenders++;
	}
	const elapsed = performance.now() - started;
	assert.equal(successfulRenders, frames.length, 'cursor batch did not render every update');
	assert.equal(output.writes, frames.length, 'cursor batch did not write every update');
	return { elapsed, successfulRenders, writes: output.writes };
}

function sampleKey(implementation, mode, scenario) {
	return `${implementation.name}-${mode.name}-${scenario}`;
}

function collectPairedSamples(implementations, modes, iterations, scenario, measure) {
	const samples = new Map();
	const outcomes = new Map();
	for (const implementation of implementations) {
		for (const mode of modes) {
			const key = sampleKey(implementation, mode, scenario);
			samples.set(key, []);
			measure(implementation, mode);
		}
	}
	for (let iteration = 0; iteration < iterations; iteration++) {
		const implementationOrder =
			iteration % 2 === 0 ? implementations : implementations.toReversed();
		const modeOrder = iteration % 2 === 0 ? modes : modes.toReversed();
		for (const mode of modeOrder) {
			for (const implementation of implementationOrder) {
				const result = measure(implementation, mode);
				const key = sampleKey(implementation, mode, scenario);
				samples.get(key).push(result.elapsed);
				outcomes.set(key, result);
			}
		}
	}
	return { samples, outcomes };
}

function prepareControl(implementation, mode, scenario, frame, changedFrame) {
	const created = createRenderer(implementation.factory, mode.incremental);
	if (scenario === 'changed') {
		assert.equal(created.render(frame), true, 'changed-render seed failed');
		created.output.reset();
	}
	return {
		implementation,
		output: created.output,
		run: () => created.render(scenario === 'initial' ? frame : changedFrame),
	};
}

function measureControlPair(implementations, mode, scenario, frame, changedFrame, reverse) {
	const elapsed = new Map(implementations.map(({ name }) => [name, 0]));
	const successfulRenders = new Map(implementations.map(({ name }) => [name, 0]));
	const writes = new Map(implementations.map(({ name }) => [name, 0]));

	for (let repetition = 0; repetition < CONTROL_RENDERS; repetition++) {
		const forward = (repetition + Number(reverse)) % 2 === 0;
		const first = forward ? implementations : implementations.toReversed();
		const balancedOrder = [...first, ...first.toReversed()];
		const controls = balancedOrder.map((implementation) =>
			prepareControl(implementation, mode, scenario, frame, changedFrame),
		);
		globalThis.gc();
		for (const control of controls) {
			const started = performance.now();
			const rendered = control.run();
			const duration = performance.now() - started;
			elapsed.set(control.implementation.name, elapsed.get(control.implementation.name) + duration);
			if (rendered) {
				successfulRenders.set(
					control.implementation.name,
					successfulRenders.get(control.implementation.name) + 1,
				);
			}
			writes.set(
				control.implementation.name,
				writes.get(control.implementation.name) + control.output.writes,
			);
		}
	}

	const result = new Map();
	const rendersPerImplementation = CONTROL_RENDERS * 2;
	for (const implementation of implementations) {
		const name = implementation.name;
		assert.equal(
			successfulRenders.get(name),
			rendersPerImplementation,
			`${name}/${mode.name}/${scenario} render batch failed`,
		);
		assert.equal(
			writes.get(name),
			rendersPerImplementation,
			`${name}/${mode.name}/${scenario} write batch failed`,
		);
		result.set(name, {
			elapsed: elapsed.get(name) / rendersPerImplementation,
			successfulRenders: successfulRenders.get(name),
			writes: writes.get(name),
		});
	}
	return result;
}

function collectControlSamples(implementations, modes, iterations, scenario, frame, changedFrame) {
	const samples = new Map();
	const outcomes = new Map();
	for (const implementation of implementations) {
		for (const mode of modes) {
			samples.set(sampleKey(implementation, mode, scenario), []);
		}
	}
	for (const mode of modes) {
		measureControlPair(implementations, mode, scenario, frame, changedFrame, false);
	}

	for (let iteration = 0; iteration < iterations; iteration++) {
		const modeOrder = iteration % 2 === 0 ? modes : modes.toReversed();
		for (const mode of modeOrder) {
			const pair = measureControlPair(
				implementations,
				mode,
				scenario,
				frame,
				changedFrame,
				iteration % 2 === 1,
			);
			for (const implementation of implementations) {
				const result = pair.get(implementation.name);
				samples.get(sampleKey(implementation, mode, scenario)).push(result.elapsed);
				outcomes.set(sampleKey(implementation, mode, scenario), result);
			}
		}
	}
	return { samples, outcomes };
}

function addRows(targets, sampleGroup, implementations, modes, scenario, updates, meta = {}) {
	for (const implementation of implementations) {
		for (const mode of modes) {
			const key = sampleKey(implementation, mode, scenario);
			const raw = sampleGroup.samples.get(key);
			const outcome = sampleGroup.outcomes.get(key);
			targets.push({
				name: key,
				ops: {
					batch: timingStatForJson(summarizeSamples(raw)),
					cursor_update: timingStatForJson(
						summarizeSamples(raw.map((elapsed) => elapsed / updates)),
					),
				},
				meta: {
					...meta,
					updates,
					successfulRenders: outcome.successfulRenders,
					writes: outcome.writes,
					correctness: 'pass',
				},
			});
		}
	}
}

function targetMap(targets) {
	return new Map(targets.map((target) => [target.name, target]));
}

function score(targetsByName, name, op) {
	return targetsByName.get(name).ops[op].score;
}

function gateTimings(targets, modes, scalingRaw) {
	const byName = targetMap(targets);
	for (const mode of modes) {
		const previousRepresentative = score(byName, `previous-${mode.name}-representative`, 'batch');
		const productionRepresentative = score(
			byName,
			`production-${mode.name}-representative`,
			'batch',
		);
		assert.ok(
			productionRepresentative <= previousRepresentative * 0.35,
			`${mode.name} representative ratio ${(productionRepresentative / previousRepresentative).toFixed(3)} exceeded 0.35`,
		);
		assert.ok(
			previousRepresentative - productionRepresentative >= 10,
			`${mode.name} representative saved only ${(previousRepresentative - productionRepresentative).toFixed(3)}ms`,
		);

		for (const scenario of ['scaling-20000', 'scaling-80000']) {
			const raw = scalingRaw.samples.get(`production-${mode.name}-${scenario}`);
			assert.ok(
				raw.every((elapsed) => elapsed >= 1),
				`${mode.name}/${scenario} included a sub-1ms sample`,
			);
		}
		const stressPerUpdate = score(byName, `production-${mode.name}-scaling-80000`, 'cursor_update');
		const stable20kPerUpdate = score(
			byName,
			`production-${mode.name}-scaling-20000`,
			'cursor_update',
		);
		assert.ok(
			stressPerUpdate <= stable20kPerUpdate * 2,
			`${mode.name} stress cursor update was ${(stressPerUpdate / stable20kPerUpdate).toFixed(3)}x stable 20k`,
		);

		for (const scenario of ['initial', 'changed']) {
			const previous = score(byName, `previous-${mode.name}-${scenario}`, 'render');
			const production = score(byName, `production-${mode.name}-${scenario}`, 'render');
			assert.ok(
				production <= previous * 1.25,
				`${mode.name}/${scenario} ratio ${(production / previous).toFixed(3)} exceeded 1.25`,
			);
			assert.ok(
				production - previous <= 1,
				`${mode.name}/${scenario} was ${(production - previous).toFixed(3)}ms slower`,
			);
		}
	}
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-ink-cursor-update-'));
const targets = [];
let failure;
let semanticScenarios = 0;
let splitCounts = {};

try {
	const currentSource = fs.readFileSync(LOG_UPDATE_PATH, 'utf8');
	const previousSource = previousSourceFrom(currentSource);
	const bundlePath = path.join(tempDir, 'ink-cursor-update.mjs');
	await bundlePair(previousSource, bundlePath);
	const { production, previous } = await import(pathToFileURL(bundlePath).href);
	const implementations = [
		{ name: 'previous', factory: previous },
		{ name: 'production', factory: production },
	];
	const modes = [
		{ name: 'standard', incremental: false },
		{ name: 'incremental', incremental: true },
	];

	semanticScenarios = semanticGates(previous, production);

	const representativeFrame = makeFrame(REPRESENTATIVE_LINES);
	const changedFrame = `${representativeFrame.slice(0, -1)}y`;
	const representativeCopies = materializeEqualCopies(representativeFrame, REPRESENTATIVE_UPDATES);
	const smallFrame = makeFrame(SMALL_LINES);
	const smallCopies = materializeEqualCopies(smallFrame, REPRESENTATIVE_UPDATES);
	const stressFrame = makeFrame(STRESS_LINES);
	const scaling20kFrames = new Array(SCALING_UPDATES).fill(representativeFrame);
	const scaling80kFrames = new Array(SCALING_UPDATES).fill(stressFrame);

	semanticScenarios += representativeTranscriptGates(
		previous,
		production,
		modes,
		representativeCopies,
		REPRESENTATIVE_LINES,
	);
	splitCounts = splitGates(implementations, modes, representativeFrame, changedFrame);

	const representative = collectPairedSamples(
		implementations,
		modes,
		iterations,
		'representative',
		(implementation, mode) =>
			measureCursorBatch(
				implementation.factory,
				mode.incremental,
				representativeCopies,
				REPRESENTATIVE_LINES,
			),
	);
	addRows(
		targets,
		representative,
		implementations,
		modes,
		'representative',
		REPRESENTATIVE_UPDATES,
		{ lines: REPRESENTATIVE_LINES, frameBytes: Buffer.byteLength(representativeFrame) },
	);
	for (const implementation of implementations) {
		for (const mode of modes) {
			const target = targets.find(
				({ name }) => name === `${implementation.name}-${mode.name}-representative`,
			);
			target.meta.instrumentedCursorSplits =
				splitCounts[`${implementation.name}-${mode.name}`].cursor;
			target.meta.semanticScenarios = semanticScenarios;
		}
	}

	const small = collectPairedSamples(
		implementations,
		modes,
		iterations,
		'small',
		(implementation, mode) =>
			measureCursorBatch(implementation.factory, mode.incremental, smallCopies, SMALL_LINES),
	);
	addRows(targets, small, implementations, modes, 'small', REPRESENTATIVE_UPDATES, {
		lines: SMALL_LINES,
		frameBytes: Buffer.byteLength(smallFrame),
		diagnostic: true,
	});

	const productionOnly = implementations.filter(({ name }) => name === 'production');
	const scaling20k = collectPairedSamples(
		productionOnly,
		modes,
		iterations,
		'scaling-20000',
		(implementation, mode) =>
			measureCursorBatch(
				implementation.factory,
				mode.incremental,
				scaling20kFrames,
				REPRESENTATIVE_LINES,
			),
	);
	addRows(targets, scaling20k, productionOnly, modes, 'scaling-20000', SCALING_UPDATES, {
		lines: REPRESENTATIVE_LINES,
		stableFrame: true,
		instrumentedCursorSplits: 0,
	});
	const scaling80k = collectPairedSamples(
		productionOnly,
		modes,
		iterations,
		'scaling-80000',
		(implementation, mode) =>
			measureCursorBatch(implementation.factory, mode.incremental, scaling80kFrames, STRESS_LINES),
	);
	addRows(targets, scaling80k, productionOnly, modes, 'scaling-80000', SCALING_UPDATES, {
		lines: STRESS_LINES,
		stableFrame: true,
		stress: true,
		instrumentedCursorSplits: 0,
	});

	for (const scenario of ['initial', 'changed']) {
		const group = collectControlSamples(
			implementations,
			modes,
			iterations,
			scenario,
			representativeFrame,
			changedFrame,
		);
		for (const implementation of implementations) {
			for (const mode of modes) {
				const key = sampleKey(implementation, mode, scenario);
				const outcome = group.outcomes.get(key);
				targets.push({
					name: key,
					ops: {
						render: timingStatForJson(
							summarizeSamples(group.samples.get(key), { scoreMode: 'mean' }),
						),
					},
					meta: {
						lines: REPRESENTATIVE_LINES,
						frameBytes: Buffer.byteLength(representativeFrame),
						splits: splitCounts[`${implementation.name}-${mode.name}`][scenario],
						successfulRenders: outcome.successfulRenders,
						writes: outcome.writes,
						correctness: 'pass',
					},
				});
			}
		}
	}

	const scalingSamples = {
		samples: new Map([...scaling20k.samples, ...scaling80k.samples]),
	};
	gateTimings(targets, modes, scalingSamples);

	const byName = targetMap(targets);
	for (const mode of modes) {
		const previous = score(byName, `previous-${mode.name}-representative`, 'batch');
		const production = score(byName, `production-${mode.name}-representative`, 'batch');
		const stress = score(byName, `production-${mode.name}-scaling-80000`, 'cursor_update');
		const stable20kPerUpdate = score(
			byName,
			`production-${mode.name}-scaling-20000`,
			'cursor_update',
		);
		console.log(
			`PASS ink-cursor-update/${mode.name}: ${production.toFixed(3)}ms production vs ` +
				`${previous.toFixed(3)}ms previous (${(production / previous).toFixed(3)}x, ` +
				`${(previous - production).toFixed(3)}ms saved); stress ` +
				`${(stress / stable20kPerUpdate).toFixed(3)}x stable-20k/update`,
		);
	}
} catch (error) {
	failure = error instanceof Error ? (error.stack ?? error.message) : String(error);
	console.error(`FAIL ink-cursor-update: ${failure}`);
} finally {
	fs.rmSync(tempDir, { recursive: true, force: true });
}

const payload = {
	suite: 'ink-cursor-update',
	iterations,
	targets,
	meta: {
		semanticScenarios,
		splitCounts,
		representativeLines: REPRESENTATIVE_LINES,
		representativeUpdates: REPRESENTATIVE_UPDATES,
		scalingUpdates: SCALING_UPDATES,
		stressLines: STRESS_LINES,
	},
	...(failure ? { failed: failure } : {}),
};

if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, `${JSON.stringify(payload, null, '\t')}\n`);
}

if (failure) process.exitCode = 1;
