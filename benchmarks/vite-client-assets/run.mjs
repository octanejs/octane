import fs from 'node:fs';
import { createClientAssetMap } from '../../packages/vite-plugin-octane/src/client-assets.js';
import { summarizeSamples, timingStatForJson } from '../lib/stats.mjs';

const iterations = Number.parseInt(process.argv[2] ?? '8', 10);
const MAPS_PER_SAMPLE = 20;

if (!Number.isSafeInteger(iterations) || iterations < 1) {
	throw new Error('Vite client-asset iterations must be a positive integer');
}

function createScenario(name, routeCount, sharedDepth) {
	const manifest = {};
	for (let index = 0; index < sharedDepth; index++) {
		manifest[`_shared-${index}.js`] = {
			file: `assets/shared-${index}.js`,
			...(index + 1 < sharedDepth
				? { imports: [`_shared-${index + 1}.js`] }
				: { css: ['assets/shared.css'] }),
		};
	}
	const moduleIds = [];
	for (let index = 0; index < routeCount; index++) {
		const moduleId = `/src/route-${index}.tsrx`;
		moduleIds.push(moduleId);
		manifest[moduleId.slice(1)] = {
			file: `assets/route-${index}.js`,
			imports: ['_shared-0.js'],
		};
	}
	return { name, routeCount, sharedDepth, manifest, moduleIds };
}

const scenarios = [
	createScenario('routes-100-deep', 100, 500),
	createScenario('routes-1000-deep', 1_000, 500),
	createScenario('routes-1000-shallow', 1_000, 1),
];

function verify(scenario, assets) {
	if (Object.keys(assets).length !== scenario.routeCount) return false;
	for (let index = 0; index < scenario.moduleIds.length; index++) {
		const moduleId = scenario.moduleIds[index];
		const entry = assets[moduleId];
		if (
			entry?.js !== `assets/route-${index}.js` ||
			entry.css.length !== 1 ||
			entry.css[0] !== 'assets/shared.css'
		) {
			return false;
		}
	}
	return true;
}

function runMaps(scenario, count) {
	let checksum = 0;
	const started = performance.now();
	for (let index = 0; index < count; index++) {
		const assets = createClientAssetMap(scenario.manifest, scenario.moduleIds);
		checksum += assets[scenario.moduleIds[index % scenario.routeCount]].css.length;
	}
	return { elapsed: performance.now() - started, checksum };
}

for (const scenario of scenarios) {
	const assets = createClientAssetMap(scenario.manifest, scenario.moduleIds);
	if (!verify(scenario, assets)) throw new Error(`${scenario.name} correctness failed`);
	const warmup = runMaps(scenario, 5);
	if (warmup.checksum !== 5) throw new Error(`${scenario.name} warmup correctness failed`);
}

const samples = new Map(scenarios.map((scenario) => [scenario.name, []]));
for (let iteration = 0; iteration < iterations; iteration++) {
	const order = iteration % 2 === 0 ? scenarios : [...scenarios].reverse();
	for (const scenario of order) {
		const sample = runMaps(scenario, MAPS_PER_SAMPLE);
		if (sample.checksum !== MAPS_PER_SAMPLE) {
			throw new Error(`${scenario.name} timed correctness failed`);
		}
		samples.get(scenario.name).push(sample.elapsed / MAPS_PER_SAMPLE);
	}
}

const targets = scenarios.map((scenario) => {
	const summary = summarizeSamples(samples.get(scenario.name));
	console.log(`PASS vite-client-assets/${scenario.name}: ${summary.score.toFixed(3)}ms/map`);
	return {
		name: scenario.name,
		ops: { asset_map: timingStatForJson(summary) },
		meta: {
			routes: scenario.routeCount,
			sharedDepth: scenario.sharedDepth,
			mapsPerSample: MAPS_PER_SAMPLE,
			correctness: 'pass',
		},
	};
});

const payload = {
	suite: 'vite-client-assets',
	iterations,
	targets,
};

if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, `${JSON.stringify(payload, null, '\t')}\n`);
}
