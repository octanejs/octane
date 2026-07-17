// Dashboard-style async composition benchmark. Unlike async-waterfall's one
// recursive happy path, this fixture combines adjacent async panels, nested
// async child components, an imported custom hook with two independent use()
// reads, and one deliberately data-dependent owner request.

import fs from 'node:fs';
import { chromium } from 'playwright';
import { summarizeSamples, timingStatForJson } from '../lib/stats.mjs';
import { DELAY, INDEPENDENT_RESOURCES, RESOURCE_ORDER } from './shared/data.js';

const ITER = parseInt(process.argv[2] || '10', 10);
const TARGETS = process.env.TARGETS
	? JSON.parse(process.env.TARGETS)
	: [
			{ name: 'octane-tsrx', url: 'http://localhost:5282/' },
			{ name: 'react', url: 'http://localhost:5284/' },
		];

const expectedText = (resource, version) =>
	`${resource}:v${version}${resource === 'owner' ? `:owner-${version}` : ''}`;
const expectedSignature = (version) =>
	RESOURCE_ORDER.map((resource) => `${resource}=${expectedText(resource, version)}`).join('|');

// These are one-way ceilings, not expected results: any improvement passes.
// They keep known gaps visible without allowing them to silently worsen.
const OBSERVATION_CEILINGS = {
	'octane-tsrx': {
		init: { waves: 2, calls: 8, mixedStates: 0 },
		update: { waves: 2, calls: 8, mixedStates: 1 },
	},
	react: {
		init: { mixedStates: 0 },
		update: { mixedStates: 0 },
	},
};

function validateIntermediateSignatures(prefix, version, signatures) {
	const previousVersion = version - 1;
	const seen = new Set();
	const advanced = new Set();

	for (const signature of signatures) {
		if (seen.has(signature)) {
			throw new Error(`${prefix}: transition revisited an earlier mixed signature`);
		}
		seen.add(signature);
		const parts = signature.split('|');
		if (parts.length !== RESOURCE_ORDER.length) {
			throw new Error(
				`${prefix}: transition temporarily removed dashboard resources: ${signature}`,
			);
		}
		for (let index = 0; index < RESOURCE_ORDER.length; index++) {
			const resource = RESOURCE_ORDER[index];
			const oldPart = `${resource}=${expectedText(resource, previousVersion)}`;
			const newPart = `${resource}=${expectedText(resource, version)}`;
			if (parts[index] === newPart) {
				advanced.add(resource);
				continue;
			}
			if (parts[index] !== oldPart) {
				throw new Error(`${prefix}: invalid mixed transition signature: ${signature}`);
			}
			if (advanced.has(resource)) {
				throw new Error(
					`${prefix}: ${resource} reverted to the previous version during transition`,
				);
			}
		}
		const projectIsNew = parts[0] === `project=${expectedText('project', version)}`;
		const ownerIsNew = parts[3] === `owner=${expectedText('owner', version)}`;
		if (ownerIsNew && !projectIsNew) {
			throw new Error(`${prefix}: rendered the new owner against the previous project`);
		}
	}
}

function enforceObservationCeilings(target, operation, trace, mixedStates) {
	const ceilings = OBSERVATION_CEILINGS[target]?.[operation];
	if (!ceilings) return;
	const observed = {
		waves: trace.waves.length,
		calls: trace.calls.length,
		mixedStates,
	};
	for (const [metric, ceiling] of Object.entries(ceilings)) {
		if (observed[metric] > ceiling) {
			throw new Error(
				`${target}/${operation}: ${metric} regressed to ${observed[metric]} (ceiling ${ceiling})`,
			);
		}
	}
}

function validateObservation(target, operation, version, result) {
	const prefix = `${target}/${operation}`;
	if (!Number.isFinite(result.readyMs) || result.readyMs < 0) {
		throw new Error(`${prefix}: invalid readyMs ${result.readyMs}`);
	}
	if (result.signature !== expectedSignature(version)) {
		throw new Error(`${prefix}: wrong rendered signature: ${result.signature}`);
	}
	if (result.trace?.version !== version) {
		throw new Error(`${prefix}: trace version ${result.trace?.version}, expected ${version}`);
	}

	const starts = result.trace.starts || [];
	const settles = result.trace.settles || [];
	const calls = result.trace.calls || [];
	if (starts.length !== RESOURCE_ORDER.length || settles.length !== RESOURCE_ORDER.length) {
		throw new Error(
			`${prefix}: expected ${RESOURCE_ORDER.length} starts/settles, got ${starts.length}/${settles.length}`,
		);
	}
	const startedResources = starts.map((entry) => entry.resource).toSorted();
	if (JSON.stringify(startedResources) !== JSON.stringify(RESOURCE_ORDER.toSorted())) {
		throw new Error(`${prefix}: wrong resource starts: ${startedResources.join(', ')}`);
	}
	if (new Set(starts.map((entry) => entry.key)).size !== starts.length) {
		throw new Error(`${prefix}: duplicate network request keys`);
	}
	if (starts.some((entry) => entry.version !== version)) {
		throw new Error(`${prefix}: stale-version request started`);
	}
	if (calls.length < starts.length) {
		throw new Error(`${prefix}: trace lost resource-call observations`);
	}
	if (target === 'octane-tsrx') {
		const firstWave = result.trace.waves[0]?.resources?.toSorted() || [];
		if (JSON.stringify(firstWave) !== JSON.stringify(INDEPENDENT_RESOURCES.toSorted())) {
			throw new Error(`${prefix}: first wave missed independent work: ${firstWave.join(', ')}`);
		}
	}

	const projectSettle = settles.find((entry) => entry.resource === 'project');
	const ownerStart = starts.find((entry) => entry.resource === 'owner');
	if (ownerStart.wave <= projectSettle.wave) {
		throw new Error(`${prefix}: owner request started before its project dependency settled`);
	}
	if (ownerStart.dependency !== `owner-${version}`) {
		throw new Error(`${prefix}: owner request used wrong dependency ${ownerStart.dependency}`);
	}
	if (operation === 'update') {
		if (result.retainedOldResourceValues !== true) {
			throw new Error(`${prefix}: transition did not initially retain previous resource values`);
		}
		if (result.fallbackVisibleAfterTrigger !== false) {
			throw new Error(`${prefix}: transition exposed the initial fallback`);
		}
	}
	const intermediateSignatures = result.intermediateSignatures || [];
	validateIntermediateSignatures(prefix, version, intermediateSignatures);
	enforceObservationCeilings(target, operation, result.trace, intermediateSignatures.length);

	const independentStarts = starts
		.filter((entry) => INDEPENDENT_RESOURCES.includes(entry.resource))
		.map((entry) => entry.atMs);
	return {
		readyMs: result.readyMs,
		independentStartSpanMs: Math.max(...independentStarts) - Math.min(...independentStarts),
		intermediateSignatures,
		trace: result.trace,
	};
}

const patternFor = (trace) => trace.waves.map((wave) => wave.resources.join('+')).join(' -> ');

function traceMeta(samples) {
	return {
		waveCounts: samples.map((sample) => sample.trace.waves.length),
		firstWaveCounts: samples.map((sample) => sample.trace.waves[0]?.resources.length || 0),
		requestCounts: samples.map((sample) => sample.trace.starts.length),
		callCounts: samples.map((sample) => sample.trace.calls.length),
		wavePatterns: [...new Set(samples.map((sample) => patternFor(sample.trace)))],
		mixedStateCounts: samples.map((sample) => sample.intermediateSignatures.length),
		mixedStateSignatures: [...new Set(samples.flatMap((sample) => sample.intermediateSignatures))],
	};
}

async function runTarget(target) {
	const browser = await chromium.launch({ headless: true, args: ['--disable-extensions'] });
	const context = await browser.newContext();
	const init = [];
	const update = [];

	try {
		for (let i = 0; i < ITER; i++) {
			const page = await context.newPage();
			try {
				await page.goto(target.url, { waitUntil: 'load' });
				await page.waitForFunction(() => typeof window.__init === 'function', { timeout: 10_000 });
				init.push(
					validateObservation(target.name, 'init', 0, await page.evaluate(() => window.__init())),
				);
				update.push(
					validateObservation(
						target.name,
						'update',
						1,
						await page.evaluate(() => window.__update()),
					),
				);
			} finally {
				await page.close();
			}
		}
	} finally {
		await browser.close();
	}

	const summarize = (samples) => summarizeSamples(samples, { scoreMode: 'mean' });
	return {
		name: target.name,
		ops: {
			init: timingStatForJson(summarize(init.map((sample) => sample.readyMs))),
			update: timingStatForJson(summarize(update.map((sample) => sample.readyMs))),
			init_waves: timingStatForJson(summarize(init.map((sample) => sample.trace.waves.length))),
			update_waves: timingStatForJson(summarize(update.map((sample) => sample.trace.waves.length))),
			init_calls: timingStatForJson(summarize(init.map((sample) => sample.trace.calls.length))),
			update_calls: timingStatForJson(summarize(update.map((sample) => sample.trace.calls.length))),
			update_mixed_states: timingStatForJson(
				summarize(update.map((sample) => sample.intermediateSignatures.length)),
			),
			init_start_span: timingStatForJson(
				summarize(init.map((sample) => sample.independentStartSpanMs)),
			),
			update_start_span: timingStatForJson(
				summarize(update.map((sample) => sample.independentStartSpanMs)),
			),
		},
		meta: {
			gate: 'passed',
			delayMs: DELAY,
			resources: RESOURCE_ORDER.length,
			independentResources: INDEPENDENT_RESOURCES.length,
			idealRounds: 2,
			idealFloorMs: DELAY * 2,
			units: {
				init_waves: 'waves',
				update_waves: 'waves',
				init_calls: 'calls',
				update_calls: 'calls',
				update_mixed_states: 'states',
			},
			init: traceMeta(init),
			update: traceMeta(update),
		},
	};
}

const targetResults = [];
const failures = [];
for (const target of TARGETS) {
	console.error(`Running ${target.name} (${target.url}) × ${ITER}…`);
	try {
		targetResults.push(await runTarget(target));
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		failures.push(`${target.name}: ${message}`);
		targetResults.push({ name: target.name, ops: {}, meta: { gate: 'failed', error: message } });
	}
}

console.log();
console.log(
	`${RESOURCE_ORDER.length} resources (${INDEPENDENT_RESOURCES.length} independent, one dependent) × ${DELAY}ms — ideal floor ${DELAY * 2}ms`,
);
console.log();
const operationWidth = 24;
console.log(
	'Op'.padEnd(operationWidth) + '| ' + TARGETS.map((target) => target.name.padEnd(24)).join('| '),
);
console.log('-'.repeat(operationWidth) + '+-' + TARGETS.map(() => '-'.repeat(24)).join('+-'));
for (const operation of [
	'init',
	'update',
	'init_waves',
	'update_waves',
	'init_calls',
	'update_calls',
	'update_mixed_states',
	'init_start_span',
	'update_start_span',
]) {
	const cells = targetResults.map((target) => {
		const score = target.ops[operation]?.score;
		const unit = operation.endsWith('_waves')
			? ' waves'
			: operation.endsWith('_calls')
				? ' calls'
				: operation.endsWith('_states')
					? ' states'
					: 'ms';
		return score === undefined ? 'failed'.padEnd(24) : `${score.toFixed(1)}${unit}`.padEnd(24);
	});
	console.log(operation.padEnd(operationWidth) + '| ' + cells.join('| '));
}

console.log();
for (const target of targetResults) {
	if (target.meta.gate !== 'passed') continue;
	console.log(`${target.name} init waves:   ${target.meta.init.wavePatterns.join(' || ')}`);
	console.log(`${target.name} update waves: ${target.meta.update.wavePatterns.join(' || ')}`);
}

const payload = {
	suite: 'async-composition',
	iterations: ITER,
	targets: targetResults,
	...(failures.length === 0 ? {} : { failed: failures.join('; ') }),
};
if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(payload, null, '\t') + '\n');
	console.error(`BENCH_JSON written to ${process.env.BENCH_JSON}`);
}
if (failures.length > 0) {
	console.error(failures.join('\n'));
	process.exitCode = 1;
}
