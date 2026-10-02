import assert from 'node:assert/strict';
import {
	createSharedPluginCase,
	createTransformCase,
	hostOwnedTypeScriptModules,
	rootIdsFor,
	sourceFor,
} from './harness.mjs';

const COUNTER_KEY = Symbol.for('octane.tsrx-vite-preflight-parsing.parse-counts');
// The adapter's @tsrx/core parser rejects source-phase imports, while the
// authoritative compiler parser accepts them.
const PARSER_DISAGREEMENT = `import source wasm from './module.wasm';
export function App() @{ <main>{wasm.name as string}</main> }`;
const cases = [
	{ mode: 'production-client', expected: { adapter: 1, authoritative: 1 } },
	{ mode: 'production-server', expected: { adapter: 1, authoritative: 1 } },
	{ mode: 'dev-client', expected: { adapter: 1, authoritative: 1 } },
	{ mode: 'production-client', css: true, expected: { adapter: 1, authoritative: 1 } },
	{
		name: 'parser-disagreement-dev-client',
		mode: 'dev-client',
		source: PARSER_DISAGREEMENT,
		expected: { adapter: 2, authoritative: 1 },
	},
	{
		name: 'parser-disagreement-production-server',
		mode: 'production-server',
		source: PARSER_DISAGREEMENT,
		expected: { adapter: 2, authoritative: 1 },
	},
];

// One plugin instance shared by several environments. Preflight is keyed by the
// exact source, module ID, environment, and specialization flags, so only an
// unchanged module in another client environment may skip its adapter parse.
// The authoritative compiler still parses once per transform.
const EDITED_SOURCE = sourceFor(9);
const [HOST_MODULE] = hostOwnedTypeScriptModules(1);
const sharedCases = [
	{
		name: 'shared-second-client-environment',
		steps: [{ environment: 'client' }, { environment: 'worker' }],
		expected: { adapter: 1, authoritative: 2 },
	},
	{
		name: 'shared-client-then-server',
		steps: [{ environment: 'client' }, { environment: 'ssr', consumer: 'server' }],
		expected: { adapter: 2, authoritative: 2 },
	},
	{
		name: 'shared-edited-source',
		steps: [{ environment: 'client' }, { environment: 'worker', source: EDITED_SOURCE }],
		expected: { adapter: 2, authoritative: 2 },
	},
	{
		name: 'shared-watch-generation',
		steps: [{ environment: 'client' }, { watchChange: true }, { environment: 'worker' }],
		expected: { adapter: 2, authoritative: 2 },
	},
	{
		// A development edit reaches every environment as a watch event before
		// the edited source is transformed again.
		name: 'shared-dev-edit',
		mode: 'dev-client',
		steps: [
			{ environment: 'client' },
			{ environment: 'worker' },
			{ watchChange: true },
			{ environment: 'client', source: EDITED_SOURCE },
			{ environment: 'worker', source: EDITED_SOURCE },
		],
		expected: { adapter: 2, authoritative: 4 },
	},
	{
		name: 'shared-host-owned-typescript',
		pluginOptions: { requireDirective: true },
		moduleId: HOST_MODULE.id,
		source: HOST_MODULE.source,
		steps: [{ environment: 'client' }, { environment: 'worker' }, { environment: 'legacy' }],
		expected: { adapter: 1, authoritative: 0 },
	},
];

const results = [];
for (const entry of cases) {
	const transform = createTransformCase({
		componentCount: 8,
		css: entry.css === true,
		mode: entry.mode,
		source: entry.source,
		verifySemantic: false,
	});
	const counter = {
		sources: [transform.source],
		ids: rootIdsFor(transform.id),
		adapter: 0,
		authoritative: 0,
		calls: [],
	};
	globalThis[COUNTER_KEY] = counter;
	await transform.run();
	const result = {
		name: entry.name ?? (entry.css === true ? 'production-client-css' : entry.mode),
		adapter: counter.adapter,
		authoritative: counter.authoritative,
		total: counter.adapter + counter.authoritative,
		calls: counter.calls,
	};
	assert.deepEqual(
		{ adapter: result.adapter, authoritative: result.authoritative },
		entry.expected,
		`${result.name} parse-count split changed`,
	);
	results.push(result);
}

for (const entry of sharedCases) {
	const shared = createSharedPluginCase({ mode: entry.mode, pluginOptions: entry.pluginOptions });
	const moduleId = entry.moduleId ?? shared.id;
	const source = entry.source ?? shared.source;
	const counter = {
		sources: [source, EDITED_SOURCE],
		ids: rootIdsFor(moduleId),
		adapter: 0,
		authoritative: 0,
		calls: [],
	};
	globalThis[COUNTER_KEY] = counter;
	for (const step of entry.steps) {
		if (step.watchChange) shared.watchChange(moduleId);
		else await shared.transform({ ...step, source: step.source ?? source, moduleId });
	}
	const result = {
		name: entry.name,
		adapter: counter.adapter,
		authoritative: counter.authoritative,
		total: counter.adapter + counter.authoritative,
		calls: counter.calls,
	};
	assert.deepEqual(
		{ adapter: result.adapter, authoritative: result.authoritative },
		entry.expected,
		`${result.name} parse-count split changed`,
	);
	results.push(result);
}

delete globalThis[COUNTER_KEY];
process.stdout.write(JSON.stringify(results));
