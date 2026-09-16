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
		id: 'binding-scalar',
		request: 'octane/dom-bindings',
		exports: ['__adoptBindings'],
		platform: 'browser',
		baseline: 'if-exported',
		rendererFree: true,
		graphFree: true,
		bindingCapabilities: [],
	},
	{
		id: 'binding-structural',
		request: 'octane/dom-binding-program',
		exports: ['__adoptBindingProgram', '__mountBindingProgram'],
		platform: 'browser',
		baseline: 'if-exported',
		rendererFree: true,
		graphFree: true,
		bindingCapabilities: ['program'],
	},
	{
		id: 'binding-controls',
		request: 'octane/dom-binding-controls',
		exports: ['__createBindingControls'],
		platform: 'browser',
		baseline: false,
		rendererFree: true,
		graphFree: true,
		bindingCapabilities: ['controls'],
	},
	{
		id: 'binding-whole-style',
		request: 'octane/dom-binding-styles',
		exports: ['__createBindingStyles'],
		platform: 'browser',
		baseline: false,
		rendererFree: true,
		graphFree: true,
		bindingCapabilities: ['styles'],
	},
	{
		id: 'binding-scalar-controls-style',
		request: 'octane/dom-bindings',
		exports: ['__adoptBindings'],
		additionalExports: {
			'octane/dom-binding-controls': ['__createBindingControls'],
			'octane/dom-binding-styles': ['__createBindingStyles'],
		},
		platform: 'browser',
		baseline: false,
		rendererFree: true,
		graphFree: true,
		bindingCapabilities: ['controls', 'styles'],
	},
	{
		id: 'engine',
		request: 'octane/signals',
		exports: ['createScope', 'query'],
		platform: 'browser',
		baseline: 'if-exported',
	},
	{
		id: 'native-client',
		request: 'octane/signals/client',
		exports: ['useSignal$'],
		platform: 'browser',
		baseline: 'if-exported',
	},
	{
		id: 'native-server',
		request: 'octane/signals/server',
		exports: ['useSignal$'],
		platform: 'node',
		baseline: 'if-exported',
	},
	{
		id: 'compiled-plain-signals',
		request: 'octane/signals',
		exports: ['exercise'],
		platform: 'browser',
		baseline: 'if-exported',
		compilePlain: true,
		rendererFree: true,
	},
	{
		id: 'streamed-signals-bootstrap',
		request: 'octane/hydration/streamed-signals',
		exports: ['bootstrapStreamedSignalHydration', 'installSignalDocumentLifecycle'],
		platform: 'browser',
		baseline: 'if-exported',
		rendererFree: true,
	},
	{
		id: 'streamed-signal-results-bootstrap',
		request: 'octane/hydration/streamed-signals',
		exports: ['bootstrapStreamedSignalResults', 'installSignalDocumentLifecycle'],
		platform: 'browser',
		baseline: 'if-exported',
		rendererFree: true,
	},
];

export function baselineUnavailableReason(scenario, exports) {
	if (scenario.baseline !== 'if-exported') return null;
	const key = scenario.request === 'octane' ? '.' : `.${scenario.request.slice('octane'.length)}`;
	return exports?.[key] == null ? `Archived baseline does not export ${scenario.request}.` : null;
}

export function entrySource(scenario) {
	if (scenario.compilePlain) {
		return `import { signal$, derived$, query$, runWithSignalOwner, retireSignalOwnerIdentity } from 'octane/signals';
const count$ = signal$(1);
const double$ = derived$(() => count$.get() * 2);
const result$ = query$(() => count$.get(), async (value) => value * 3);
// An unused declaration must not retain its general async implementation.
const unused$ = derived$(async () => count$.get());
export async function exercise() {
  const owner = { scopeKey: 'compiled-plain-bundle' };
  const read = (callback) => runWithSignalOwner(owner, callback);
  try {
    const initial = read(() => double$.get());
    read(() => count$.set(2));
    const updated = read(() => double$.get());
    try { read(() => result$.get()); } catch (pending) {
      if (typeof pending?.then !== 'function') throw pending;
      await pending;
    }
    return { initial, updated, result: read(() => result$.get()) };
  } finally { retireSignalOwnerIdentity(owner); }
}
`;
	}
	return Object.entries({ [scenario.request]: scenario.exports, ...scenario.additionalExports })
		.map(([request, names]) => `export { ${names.join(', ')} } from ${JSON.stringify(request)};\n`)
		.join('');
}

export function sha256(contents) {
	return createHash('sha256').update(contents).digest('hex');
}

export function gitBlobHash(contents, algorithm = 'sha1') {
	return createHash(algorithm).update(`blob ${contents.length}\0`).update(contents).digest('hex');
}

// Engine boundaries inspect the complete resolved graph, including modules
// that tree shaking removes. A zero-byte engine dependency is still a defect.
// Runtime exports can resolve their optional native adapters, but an ordinary
// entry must tree-shake every byte of those concrete implementations.
export function verifyBundleInputs(scenario, inputs) {
	const names = inputs.map((input) => input.path.replaceAll('\\', '/'));
	const alien = inputs.filter((input) => input.package?.name === 'alien-signals');
	const engine = names.filter((name) =>
		/\/src\/signals\/(?:index|engine|graph|requests|encoding|client|server|facade)\.[jt]s$/.test(
			name,
		),
	);
	const compiler = names.filter((name) => /\/src\/compiler\//.test(name));
	const react = inputs.filter((input) => /^(?:react|react-dom)$/.test(input.package?.name ?? ''));
	assert.deepEqual(compiler, [], `${scenario.id}: compiler reached a public runtime entry`);
	assert.deepEqual(react, [], `${scenario.id}: React reached a native entry`);
	if (scenario.id.startsWith('ordinary-')) {
		assert.deepEqual(alien, [], `${scenario.id}: ordinary imports reached Alien Signals`);
		assert.deepEqual(engine, [], `${scenario.id}: ordinary imports reached the scoped engine`);
		const adapters = inputs.filter((input) =>
			/\/src\/(?:signals\/native-read-(?:client|server|collector|inspection|retry)|server\/signal-query-observation)\.[jt]s$/.test(
				input.path.replaceAll('\\', '/'),
			),
		);
		for (const input of adapters) {
			assert.ok(
				Number.isSafeInteger(input.bytesInOutput) && input.bytesInOutput >= 0,
				`${scenario.id}: missing emitted-byte evidence for ${input.path}`,
			);
			assert.equal(
				input.bytesInOutput,
				0,
				`${scenario.id}: ordinary entry retained native adapter ${input.path}`,
			);
		}
		if (scenario.id === 'ordinary-client')
			for (const input of inputs)
				if (/\/src\/signals\/native-read-seeds\.[jt]s$/.test(input.path.replaceAll('\\', '/')))
					assert.equal(
						input.bytesInOutput,
						0,
						`${scenario.id}: a mount-only root retained seed hydration`,
					);
	} else if (scenario.graphFree) {
		assert.deepEqual(alien, [], `${scenario.id}: binding entry reached Alien Signals`);
		assert.deepEqual(engine, [], `${scenario.id}: binding entry reached the signal graph`);
	} else {
		assert.ok(alien.length > 0, `${scenario.id}: selected engine dependency is missing`);
		for (const input of alien) {
			assert.equal(input.package.version, '3.2.0', `${scenario.id}: wrong Alien Signals version`);
		}
	}
	if (scenario.id === 'engine' || scenario.rendererFree) {
		const renderer = names.filter((name) =>
			/\/src\/(?:runtime(?:\.server)?\.[jt]s$|signals\/native-read-(?:client|server)\.[jt]s$|server\/|react\/|internal\/|[^/]*devtools[^/]*\.[jt]s$)/.test(
				name,
			),
		);
		assert.deepEqual(
			renderer,
			[],
			`${scenario.id}: renderer or DevTools reached the independent engine`,
		);
	}
	if (scenario.bindingCapabilities) {
		for (const name of names) {
			const capability =
				/\/src\/dom-binding-(program|controls|styles|classes|signals)\.[jt]s$/.exec(name)?.[1];
			if (capability !== undefined) {
				assert.ok(
					scenario.bindingCapabilities.includes(capability),
					`${scenario.id}: unselected binding capability reached ${name}`,
				);
			}
		}
		if (!scenario.bindingCapabilities.includes('controls')) {
			assert.ok(
				!names.some((name) => /\/src\/signals\/control-binding\.[jt]s$/.test(name)),
				`${scenario.id}: unselected canonical control implementation reached the entry`,
			);
		}
	}
	if (scenario.id === 'compiled-plain-signals') {
		// This fixture has a compiler-proven scalar derivation and a real async
		// query. Neither the query nor an unused async declaration may force the
		// general derived-attempt engine into this scalar caller.
		for (const input of inputs.filter((input) =>
			/\/src\/signals\/computations\.[jt]s$/.test(input.path.replaceAll('\\', '/')),
		)) {
			assert.equal(
				input.bytesInOutput,
				0,
				`${scenario.id}: scalar caller retained general derived computation implementation`,
			);
		}
	}
	if (scenario.id === 'streamed-signal-results-bootstrap') {
		for (const input of inputs.filter((input) =>
			/\/src\/hydration\/stream-receiver\.[jt]s$/.test(input.path.replaceAll('\\', '/')),
		)) {
			assert.equal(
				input.bytesInOutput,
				0,
				`${scenario.id}: result-only bootstrap retained DOM placement implementation`,
			);
		}
	}
	if (scenario.id === 'native-client' || scenario.id === 'native-server') {
		const suffix = scenario.id === 'native-client' ? '/src/runtime.ts' : '/src/runtime.server.ts';
		assert.ok(
			names.some((name) => name.endsWith(suffix)),
			`${scenario.id}: native runtime missing`,
		);
	}
}
