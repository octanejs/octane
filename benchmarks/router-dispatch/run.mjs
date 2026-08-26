import fs from 'node:fs';
import { createRouter } from '../../packages/app-core/src/server/router.js';
import { summarizeSamples, timingStatForJson } from '../lib/stats.mjs';

const iterations = Number.parseInt(process.argv[2] ?? '8', 10);
const ROUTE_COUNT = 1_000;
const MATCHES_PER_SAMPLE = 2_000;
const WARMUP_MATCHES = 500;

if (!Number.isSafeInteger(iterations) || iterations < 1) {
	throw new Error('Router dispatch iterations must be a positive integer');
}

const staticRoutes = Array.from({ length: ROUTE_COUNT }, (_, index) => ({
	type: 'render',
	path: `/static-${index}`,
}));
const serverRoutes = Array.from({ length: ROUTE_COUNT }, (_, index) => ({
	type: 'server',
	path: `/api-${index}`,
	methods: ['GET'],
}));
const dynamicRoutes = Array.from({ length: ROUTE_COUNT }, (_, index) => ({
	type: 'render',
	path: `/:value/dynamic-${index}`,
}));

const scenarios = [
	{
		name: 'static-routes',
		router: createRouter(staticRoutes),
		method: 'GET',
		pathname: '/static-999',
		verify(match) {
			return match?.route === staticRoutes[999] && Object.keys(match.params).length === 0;
		},
	},
	{
		name: 'wrong-method-routes',
		router: createRouter(serverRoutes),
		method: 'post',
		pathname: '/api-999',
		verify(match) {
			return match === null;
		},
	},
	{
		name: 'dynamic-routes',
		router: createRouter(dynamicRoutes),
		method: 'GET',
		pathname: '/hello%20world/dynamic-999',
		verify(match) {
			return match?.route === dynamicRoutes[999] && match.params.value === 'hello world';
		},
	},
];

function runMatches(scenario, count) {
	let checksum = 0;
	const started = performance.now();
	for (let index = 0; index < count; index++) {
		checksum += scenario.verify(scenario.router.match(scenario.method, scenario.pathname)) ? 1 : 0;
	}
	return { elapsed: performance.now() - started, checksum };
}

const samples = new Map(scenarios.map((scenario) => [scenario.name, []]));
for (const scenario of scenarios) {
	const warmup = runMatches(scenario, WARMUP_MATCHES);
	if (warmup.checksum !== WARMUP_MATCHES) {
		throw new Error(`${scenario.name} warmup correctness failed: ${warmup.checksum}`);
	}
}

for (let iteration = 0; iteration < iterations; iteration++) {
	const order = iteration % 2 === 0 ? scenarios : [...scenarios].reverse();
	for (const scenario of order) {
		const sample = runMatches(scenario, MATCHES_PER_SAMPLE);
		if (sample.checksum !== MATCHES_PER_SAMPLE) {
			throw new Error(`${scenario.name} correctness failed: ${sample.checksum}`);
		}
		samples
			.get(scenario.name)
			.push((sample.elapsed * 1_000_000) / (MATCHES_PER_SAMPLE * ROUTE_COUNT));
	}
}

const targets = scenarios.map((scenario) => {
	const summary = summarizeSamples(samples.get(scenario.name));
	console.log(
		`PASS router-dispatch/${scenario.name}: ${summary.score.toFixed(3)}ms/million candidates`,
	);
	return {
		name: scenario.name,
		ops: { dispatch_per_million_candidates: timingStatForJson(summary) },
		meta: {
			routes: ROUTE_COUNT,
			matchesPerSample: MATCHES_PER_SAMPLE,
			correctness: 'pass',
		},
	};
});

const payload = {
	suite: 'router-dispatch',
	iterations,
	targets,
};

if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, `${JSON.stringify(payload, null, '\t')}\n`);
}
