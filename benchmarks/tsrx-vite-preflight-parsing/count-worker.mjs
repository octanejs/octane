import assert from 'node:assert/strict';
import { createTransformCase, rootIdsFor } from './harness.mjs';

const COUNTER_KEY = Symbol.for('octane.tsrx-vite-preflight-parsing.parse-counts');
const cases = [
	{ mode: 'production-client', expected: { adapter: 3, authoritative: 1 } },
	{ mode: 'production-server', expected: { adapter: 3, authoritative: 1 } },
	{ mode: 'dev-client', expected: { adapter: 2, authoritative: 1 } },
	{ mode: 'production-client', css: true, expected: { adapter: 4, authoritative: 1 } },
];

const results = [];
for (const entry of cases) {
	const transform = createTransformCase({
		componentCount: 8,
		css: entry.css === true,
		mode: entry.mode,
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
		name: entry.css === true ? 'production-client-css' : entry.mode,
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
