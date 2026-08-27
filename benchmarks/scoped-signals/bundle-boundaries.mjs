import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export const BUNDLE_CASES = [
	{
		id: 'ordinary-client',
		request: 'octane',
		exports: ['createRoot'],
		platform: 'browser',
		baseline: true,
	},
	{
		id: 'ordinary-server',
		request: 'octane/server',
		exports: ['renderToString'],
		platform: 'node',
		baseline: true,
	},
	{
		id: 'engine',
		request: 'octane/signals',
		exports: ['createScope', 'query'],
		platform: 'browser',
		baseline: false,
	},
	{
		id: 'native-client',
		request: 'octane/signals/client',
		exports: ['useSignal$'],
		platform: 'browser',
		baseline: false,
	},
	{
		id: 'native-server',
		request: 'octane/signals/server',
		exports: ['useSignal$'],
		platform: 'node',
		baseline: false,
	},
];

export function entrySource(scenario) {
	return `export { ${scenario.exports.join(', ')} } from ${JSON.stringify(scenario.request)};\n`;
}

export function sha256(contents) {
	return createHash('sha256').update(contents).digest('hex');
}

export function gitBlobHash(contents, algorithm = 'sha1') {
	return createHash(algorithm).update(`blob ${contents.length}\0`).update(contents).digest('hex');
}

// Inspect the complete resolved graph, including modules that tree shaking
// removes. A zero-byte graph dependency is still an accidental engine import.
export function verifyBundleInputs(scenario, inputs) {
	const names = inputs.map((input) => input.path.replaceAll('\\', '/'));
	const alien = inputs.filter((input) => input.package?.name === 'alien-signals');
	const engine = names.filter((name) =>
		/\/src\/signals\/(?:index|engine|graph|requests|encoding|client|server)\.[jt]s$/.test(name),
	);
	const compiler = names.filter((name) => /\/src\/compiler\//.test(name));
	const react = inputs.filter((input) => /^(?:react|react-dom)$/.test(input.package?.name ?? ''));
	assert.deepEqual(compiler, [], `${scenario.id}: compiler reached a public runtime entry`);
	assert.deepEqual(react, [], `${scenario.id}: React reached a native entry`);
	if (scenario.id.startsWith('ordinary-')) {
		assert.deepEqual(alien, [], `${scenario.id}: ordinary imports reached Alien Signals`);
		assert.deepEqual(engine, [], `${scenario.id}: ordinary imports reached the scoped engine`);
	} else {
		assert.ok(alien.length > 0, `${scenario.id}: selected engine dependency is missing`);
		for (const input of alien) {
			assert.equal(input.package.version, '3.2.0', `${scenario.id}: wrong Alien Signals version`);
		}
	}
	if (scenario.id === 'engine') {
		const renderer = names.filter((name) =>
			/\/src\/(?:runtime(?:\.server)?\.[jt]s$|server\/|react\/|internal\/|[^/]*devtools[^/]*\.[jt]s$)/.test(
				name,
			),
		);
		assert.deepEqual(renderer, [], 'engine: renderer or DevTools reached the independent engine');
	}
	if (scenario.id === 'native-client' || scenario.id === 'native-server') {
		const suffix = scenario.id === 'native-client' ? '/src/runtime.ts' : '/src/runtime.server.ts';
		assert.ok(
			names.some((name) => name.endsWith(suffix)),
			`${scenario.id}: native runtime missing`,
		);
	}
}
