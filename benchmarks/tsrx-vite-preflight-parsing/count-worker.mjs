import assert from 'node:assert/strict';
import { createTransformCase, rootIdsFor } from './harness.mjs';

const COUNTER_KEY = Symbol.for('octane.tsrx-vite-preflight-parsing.parse-counts');
const PARSER_DISAGREEMENT = `using resource = acquire();
export function App() @{ <main>{resource.label as string}</main> }`;
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
		source: transform.source,
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

delete globalThis[COUNTER_KEY];
process.stdout.write(JSON.stringify(results));
