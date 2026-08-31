import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { summarizeSamples, timingStatForJson } from '../lib/stats.mjs';

const iterationArgument = process.argv[2] ?? '8';
const iterations = Number(iterationArgument);
if (!/^[1-9]\d*$/.test(iterationArgument) || !Number.isSafeInteger(iterations)) {
	throw new Error('Signal trace iterations must be a positive integer');
}

const repo = path.resolve(import.meta.dirname, '../..');
const bundled = await build({
	absWorkingDir: repo,
	stdin: {
		contents: 'export { ScopeImpl } from "./packages/octane/src/signals/engine.ts";',
		resolveDir: repo,
		sourcefile: 'signal-trace-benchmark-entry.mjs',
	},
	bundle: true,
	write: false,
	minify: true,
	format: 'esm',
	platform: 'node',
	target: 'node22',
	define: { 'process.env.NODE_ENV': '"production"' },
	logLevel: 'silent',
});
const { ScopeImpl } = await import(
	`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`
);

const EVENTS_PER_SAMPLE = 5_000;
const WARMUP_EVENTS = 200;
const scenarios = [
	{ name: 'unfilled-max-budget', traceLimit: 10_000, prefill: 0 },
	{ name: 'wrapped-small-budget', traceLimit: 3, prefill: 3 },
	{ name: 'wrapped-max-budget', traceLimit: 10_000, prefill: 10_000 },
];

function verifyTrace(trace, traceLimit, emitted) {
	const retained = Math.min(traceLimit, emitted);
	const firstSequence = emitted - retained + 1;
	assert.equal(trace.length, retained);
	for (let index = 0; index < trace.length; index++) {
		assert.deepEqual(trace[index], {
			sequence: firstSequence + index,
			type: 'write',
		});
	}
	return {
		retained,
		firstSequence,
		lastSequence: emitted,
	};
}

function sample(scenario, events, sampleIndex) {
	const scopeKey = `trace-${scenario.name}-${sampleIndex}`;
	const scope = new ScopeImpl(scopeKey, {
		scopeKey,
		debug: { traceLimit: scenario.traceLimit },
	});
	for (let index = 0; index < scenario.prefill; index++) scope.trace('write');

	const started = performance.now();
	for (let index = 0; index < events; index++) scope.trace('write');
	const elapsed = performance.now() - started;

	const metadata = verifyTrace(
		scope.inspect().trace,
		scenario.traceLimit,
		scenario.prefill + events,
	);
	scope.dispose();
	return { nanosecondsPerEvent: (elapsed * 1_000_000) / events, metadata };
}

const quiet = new ScopeImpl('trace-disabled-control', { scopeKey: 'trace-disabled-control' });
quiet.trace('write');
assert.deepEqual(quiet.inspect().trace, []);
quiet.dispose();

for (const [index, scenario] of scenarios.entries()) {
	sample(scenario, WARMUP_EVENTS, `warmup-${index}`);
}

const samples = new Map(scenarios.map((scenario) => [scenario.name, []]));
const metadata = new Map();
for (let iteration = 0; iteration < iterations; iteration++) {
	const order = iteration % 2 === 0 ? scenarios : scenarios.toReversed();
	for (const scenario of order) {
		const result = sample(scenario, EVENTS_PER_SAMPLE, iteration);
		samples.get(scenario.name).push(result.nanosecondsPerEvent);
		metadata.set(scenario.name, result.metadata);
	}
}

const targets = scenarios.map((scenario) => {
	const traceEvent = timingStatForJson(summarizeSamples(samples.get(scenario.name)));
	const retained = metadata.get(scenario.name);
	console.log(
		`PASS scoped-signals-trace/${scenario.name}: ${traceEvent.score.toFixed(3)}ns/event, ` +
			`sequences ${retained.firstSequence}-${retained.lastSequence}`,
	);
	return {
		name: scenario.name,
		ops: { trace_event: traceEvent },
		meta: {
			traceLimit: scenario.traceLimit,
			prefill: scenario.prefill,
			eventsPerSample: EVENTS_PER_SAMPLE,
			...retained,
			correctness: 'pass',
		},
	};
});

const payload = { suite: 'scoped-signals-trace', iterations, targets };
if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, `${JSON.stringify(payload, null, '\t')}\n`);
}
