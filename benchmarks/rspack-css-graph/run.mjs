import assert from 'node:assert/strict';
import fs from 'node:fs';
import { installCssModuleConstants } from '../../packages/rspack-plugin-octane/src/css-module-constants.js';
import {
	CSS_MODULE_BUILD_INFO_KEY,
	CSS_MODULE_CONTEXT_KEY,
	cssModuleSourceHash,
} from '../../packages/rspack-plugin-octane/src/css-module-data.js';
import { deterministicCount, deterministicStatForJson } from '../lib/dom-nodes.mjs';

const iterations = Number.parseInt(process.argv[2] ?? '8', 10);
if (!Number.isSafeInteger(iterations) || iterations < 1) {
	throw new Error('Rspack CSS graph iterations must be a positive integer');
}

const EXPORTS = `var root = 'mapped_root'; var label = 'mapped_label'; export { root, label };`;

function hook() {
	const taps = [];
	const add = (options, run) => {
		taps.push({ stage: typeof options === 'string' ? 0 : (options.stage ?? 0), run });
	};
	const ordered = () => [...taps].sort((left, right) => left.stage - right.stage);
	return {
		tap: add,
		tapPromise: add,
		call(...args) {
			for (const tap of ordered()) tap.run(...args);
		},
		async promise(...args) {
			for (const tap of ordered()) await tap.run(...args);
		},
	};
}

function module(id, source, resource = '/project/styles.module.css') {
	return {
		id,
		type: 'javascript/auto',
		resource,
		source,
		buildInfo: {},
		identifier() {
			return this.id;
		},
		originalSource() {
			return { source: () => this.source };
		},
	};
}

function importer(id, requests) {
	const result = module(id, 'export {};', `/project/${id}.tsrx`);
	result.buildInfo[CSS_MODULE_BUILD_INFO_KEY] = {
		sourceHash: cssModuleSourceHash(`authored:${id}`),
		requests,
		consumed: [],
	};
	return result;
}

function edge(request, target, attributes) {
	return {
		dependency: { request, category: 'esm', attributes },
		module: target,
	};
}

function compiler(provider) {
	const result = {
		options: { mode: 'production', watch: false },
		watchMode: false,
		hooks: { thisCompilation: hook(), finishMake: hook() },
		webpack: {
			NormalModule: { getCompilationHooks: (compilation) => compilation.loaderHooks },
			Compilation: { PROCESS_ASSETS_STAGE_REPORT: 5000 },
		},
	};
	installCssModuleConstants(result, { option: provider, environment: 'client' });
	return result;
}

function countedGraph(edges, activity) {
	return {
		getOutgoingConnections(current) {
			activity.traversals++;
			const connections = edges.get(current.id) ?? [];
			return (function* () {
				for (const connection of connections) {
					activity.visits++;
					yield connection;
				}
			})();
		},
	};
}

async function runSafeScenario(requestCount) {
	const requests = Array.from(
		{ length: requestCount },
		(_, index) => `./styles-${index}.module.css`,
	);
	const app = importer(`requests-${requestCount}`, requests);
	const styles = requests.map((request, index) =>
		module(
			`styles-${index}`,
			EXPORTS.replaceAll('mapped_', `mapped_${index}_`),
			`/project/${request.slice(2)}`,
		),
	);
	const unrelated = module('unrelated', EXPORTS);
	const edges = new Map([
		[
			app.id,
			requestCount === 0
				? [edge('./unrelated.module.css', unrelated)]
				: requests.map((request, index) => edge(request, styles[index])),
		],
	]);
	const activity = { traversals: 0, visits: 0 };
	const supplied = [];
	const proofRequests = [];
	const currentCompiler = compiler((input) => {
		supplied.push(input.id);
	});
	const compilation = {
		modules: new Set([app, ...styles, unrelated]),
		loaderHooks: { loader: hook() },
		hooks: { seal: hook(), processAssets: hook() },
		moduleGraph: countedGraph(edges, activity),
	};
	const contextFor = (current) => {
		const context = {};
		compilation.loaderHooks.loader.call(context, current);
		return context[CSS_MODULE_CONTEXT_KEY];
	};
	compilation.rebuildModule = (current, done) => {
		queueMicrotask(() => {
			try {
				const proof = structuredClone(contextFor(current)).proof;
				assert.ok(proof, 'Expected the benchmark importer to receive a proof');
				const consumed = proof.imports.map((entry) => entry.request);
				proofRequests.push(...consumed);
				current.buildInfo[CSS_MODULE_BUILD_INFO_KEY] = {
					...current.buildInfo[CSS_MODULE_BUILD_INFO_KEY],
					consumed,
				};
				done(null, current);
			} catch (error) {
				done(error);
			}
		});
	};
	currentCompiler.hooks.thisCompilation.call(compilation);
	await currentCompiler.hooks.finishMake.promise(compilation);
	compilation.hooks.seal.call();
	compilation.hooks.processAssets.call({});

	assert.deepEqual([...new Set(supplied)].sort(), styles.map((style) => style.id).sort());
	assert.deepEqual([...new Set(proofRequests)].sort(), requests.toSorted());
	return activity;
}

async function runTerminalInvalidScenario() {
	const requests = ['./invalid-a.module.css', './invalid-b.module.css'];
	const app = importer('terminal-invalidity', requests);
	const invalidA = module('invalid-a', EXPORTS);
	const invalidB = module('invalid-b', EXPORTS);
	const trailing = Array.from({ length: 16 }, (_, index) => module(`trailing-${index}`, EXPORTS));
	const edges = new Map([
		[
			app.id,
			[
				edge(requests[0], invalidA, { type: 'css' }),
				edge(requests[1], invalidB, { type: 'css' }),
				...trailing.map((target, index) => edge(`./trailing-${index}.module.css`, target)),
			],
		],
	]);
	const activity = { traversals: 0, visits: 0 };
	const currentCompiler = compiler(true);
	const compilation = {
		modules: new Set([app, invalidA, invalidB, ...trailing]),
		loaderHooks: { loader: hook() },
		hooks: { seal: hook(), processAssets: hook() },
		moduleGraph: countedGraph(edges, activity),
		rebuildModule() {
			throw new Error('Terminally invalid requests must not schedule a rebuild');
		},
	};
	currentCompiler.hooks.thisCompilation.call(compilation);
	await currentCompiler.hooks.finishMake.promise(compilation);
	compilation.hooks.seal.call();
	compilation.hooks.processAssets.call({});
	return activity;
}

const scenarios = [
	{ name: 'zero-requests', requests: 0, activity: await runSafeScenario(0) },
	{ name: 'one-request', requests: 1, activity: await runSafeScenario(1) },
	{ name: 'sixteen-requests', requests: 16, activity: await runSafeScenario(16) },
	{ name: 'terminal-invalid', requests: 2, activity: await runTerminalInvalidScenario() },
];

assert.deepEqual(scenarios[0].activity, { traversals: 0, visits: 0 });
assert.deepEqual(scenarios[1].activity, { traversals: 3, visits: 3 });
assert.deepEqual(scenarios[2].activity, { traversals: 3, visits: 48 });
assert.deepEqual(scenarios[3].activity, { traversals: 1, visits: 2 });

const targets = scenarios.map((scenario) => {
	console.log(
		`PASS rspack-css-graph/${scenario.name}: ${scenario.activity.traversals} traversals, ` +
			`${scenario.activity.visits} connection visits`,
	);
	return {
		name: scenario.name,
		ops: {
			graph_traversals: deterministicStatForJson(deterministicCount(scenario.activity.traversals)),
			connection_visits: deterministicStatForJson(deterministicCount(scenario.activity.visits)),
		},
		meta: {
			requests: scenario.requests,
			correctness: 'pass',
		},
	};
});

const payload = { suite: 'rspack-css-graph', iterations, targets };
if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, `${JSON.stringify(payload, null, '\t')}\n`);
}
