#!/usr/bin/env node
/**
 * Regenerates packages/react-map-gl/audit/react-parity.json.
 *
 * Hashes and case lists are derived from the files themselves so the manifest
 * cannot drift silently: edit a lane file without rerunning this and
 * `pnpm react-parity:check` fails on the integrity mismatch, which is the point.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';

/** Written through Prettier so `pnpm format:check` stays clean. */
async function writeJson(absolute, value) {
	const source = `${JSON.stringify(value, null, '\t')}\n`;
	writeFileSync(
		absolute,
		await format(source, { ...(await resolveConfig(absolute)), filepath: absolute }),
	);
}

const PACKAGE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(PACKAGE, '../..');

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const pendingWrites = [];

/**
 * Collect a Vitest project's real test identities and write them as a runtime
 * inventory. Derived from an actual run so a renamed or deleted case shows up as
 * an inventory mismatch instead of quietly shrinking the evidence.
 */
function writeInventory(project, ownedPrefixes, inventoryRelative) {
	// `roots` is the manifest-wide declaration every inventory must repeat; the
	// prefixes are what this particular lane owns inside it.
	const owned = (file) =>
		ownedPrefixes.some((prefix) => file === prefix || file.startsWith(`${prefix}/`));
	const result = spawnSync(
		process.execPath,
		['node_modules/vitest/vitest.mjs', 'run', '--project', project, '--reporter=json'],
		{ cwd: REPO, encoding: 'utf8', maxBuffer: 1024 * 1024 * 64 },
	);
	const start = result.stdout.indexOf('{');
	if (start < 0)
		throw new Error(`no JSON reporter output for project ${project}:\n${result.stderr}`);
	const report = JSON.parse(result.stdout.slice(start));
	const tests = [];
	const files = new Set();
	for (const suite of report.testResults ?? []) {
		const file = path.relative(REPO, suite.name).split(path.sep).join('/');
		// A project may also run Octane-only conformance files; those belong to the
		// ordinary shards, not to parity evidence, so they stay out of the
		// inventory and out of the declared roots.
		if (!owned(file)) continue;
		files.add(file);
		for (const assertion of suite.assertionResults ?? []) {
			const fullName = assertion.fullName;
			tests.push({
				id: `runtime:${sha256(`${file}\0${fullName}`).slice(0, 16)}`,
				file,
				fullName,
			});
		}
	}
	tests.sort((a, b) => (a.file + a.fullName < b.file + b.fullName ? -1 : 1));
	if (tests.length === 0) throw new Error(`project ${project} collected no tests`);
	const inventory = {
		schemaVersion: 1,
		project,
		roots: TEST_ROOTS,
		files: [...files].sort(),
		tests,
	};
	pendingWrites.push(writeJson(path.join(REPO, inventoryRelative), inventory));
	return inventory;
}
const hashFile = (relative) => sha256(readFileSync(path.join(REPO, relative)));

function walk(absolute) {
	const out = [];
	for (const name of readdirSync(absolute).sort()) {
		const full = path.join(absolute, name);
		if (statSync(full).isDirectory()) out.push(...walk(full));
		else out.push(full);
	}
	return out;
}

/** One digest over the whole vendored upstream tree, path and bytes. */
function upstreamIntegrity() {
	const root = path.join(PACKAGE, 'upstream');
	const hash = createHash('sha256');
	for (const file of walk(root)) {
		hash.update(path.relative(root, file).split(path.sep).join('/'));
		hash.update(readFileSync(file));
	}
	return `sha256:${hash.digest('hex')}`;
}

/**
 * Collect `describe`/`it` names by parsing the source. Vitest joins them with a
 * space, and `react-parity:check` rejects a fullName that does not match exactly
 * one collected test, so a wrong guess here fails loudly rather than silently.
 */
function collectCases(relative, idPrefix) {
	const source = readFileSync(path.join(REPO, relative), 'utf8');
	const cases = [];
	let describeName = '';
	// `test(` is tape's registration, which the adapter turns into a top-level
	// `it` with no describe wrapper.
	const pattern = /\b(describe|it|test)\(\s*(['"`])((?:\\.|(?!\2)[^\\])*)\2/g;
	let match;
	while ((match = pattern.exec(source)) !== null) {
		const [, kind, , rawName] = match;
		const name = rawName.replace(/\\(['"`\\])/g, '$1');
		if (kind === 'describe') {
			describeName = name;
			continue;
		}
		if (kind === 'test') {
			cases.push({ id: `${idPrefix}:${cases.length + 1}`, testName: name, fullName: name });
			continue;
		}
		cases.push({
			id: `${idPrefix}:${cases.length + 1}`,
			testName: name,
			fullName: describeName ? `${describeName} ${name}` : name,
		});
	}
	if (cases.length === 0) throw new Error(`no cases collected from ${relative}`);
	return cases;
}

const testFile = (relative, idPrefix) => ({
	path: relative,
	role: 'test',
	sha256: hashFile(relative),
	cases: collectCases(relative, idPrefix),
});

/**
 * A type suite compiles as a whole, so its executable case is the compilation.
 * The per-assertion inventory lives in typetests/assertions.md.
 */
const typeSuiteFile = (relative, id) => ({
	path: relative,
	role: 'test',
	sha256: hashFile(relative),
	cases: [
		{ id, testName: 'public surface type assertions', fullName: 'public surface type assertions' },
	],
});

const supportFile = (relative) => ({
	path: relative,
	role: 'support',
	sha256: hashFile(relative),
});

const UPSTREAM_UTIL_SPECS = [
	'apply-react-style',
	'compare-class-names',
	'deep-equal',
	'style-utils',
	'transform',
].map((name) => `packages/react-map-gl/upstream/test/utils/${name}.spec.js`);

const PORTED_SPECS = [
	['controls', 'ported:controls'],
	['map', 'ported:map'],
	['marker', 'ported:marker'],
	['popup', 'ported:popup'],
	['source-layer', 'ported:source-layer'],
	['use-map', 'ported:use-map'],
].map(([name, prefix]) => testFile(`packages/react-map-gl/tests/upstream/${name}.test.ts`, prefix));

const sharedSupport = [
	supportFile('packages/react-map-gl/tests/_helpers.ts'),
	supportFile('packages/react-map-gl/tests/_mocks/mapbox-gl.ts'),
	supportFile('packages/react-map-gl/tests/_fixtures/upstream-apps.tsrx'),
	supportFile('vitest.config.js'),
];

const upstreamUtilLane = (lane, project) => ({
	id: `react-map-gl-upstream-${lane}`,
	type: lane === 'pristine' ? 'pristine-upstream' : 'adapted-octane',
	oracle: 'required',
	environment: 'workspace-node',
	project,
	evidenceOrigin: 'upstream-suite',
	notes:
		lane === 'pristine'
			? "Runs @vis.gl/react-mapbox 8.1.2's own framework-neutral util specs, byte-exact, against upstream's own source through a tape-to-Vitest adapter."
			: 'Runs the same byte-exact upstream specs against the modules this port reuses verbatim. Both lanes passing is what backs the reuse claim.',
	execution: {
		kind: 'vitest-full',
		inventory: `packages/react-map-gl/audit/upstream-util-${lane}-runtime.json`,
	},
	files: [
		testFile(`packages/react-map-gl/tests/upstream-util/${lane}.test.ts`, `upstream-util-${lane}`),
		// The vendored spec files stay byte-exact, so they are hashed here rather
		// than annotated: the wrapper above declares their cases. The whole
		// vendored tree additionally verifies offline against the upstream git
		// blob shas in the lock.
		supportFile('packages/react-map-gl/audit/upstream.lock.json'),
		...UPSTREAM_UTIL_SPECS.map(supportFile),
		supportFile('packages/react-map-gl/tests/_harness/tape-adapter.ts'),
		supportFile('vitest.config.js'),
	],
});

// Every runtime inventory must declare the manifest's adapted test roots.
/**
 * The adapted-Octane test roots. `react-parity:check` requires the union of the
 * adapted lanes' inventories to equal everything discovered here, so the
 * pristine wrapper — which runs upstream's source, not the port's — is excluded.
 */
const TEST_ROOTS = [
	'packages/react-map-gl/tests/upstream',
	'packages/react-map-gl/tests/upstream-util',
];
const TEST_EXCLUDE = ['tests/upstream-util/pristine\\.test\\.ts$'];

const [pristineInventory, adaptedUtilInventory, portedInventory, differentialInventory] = [
	writeInventory(
		'react-map-gl-upstream-pristine',
		['packages/react-map-gl/tests/upstream-util'],
		'packages/react-map-gl/audit/upstream-util-pristine-runtime.json',
	),
	writeInventory(
		'react-map-gl-upstream-adapted',
		['packages/react-map-gl/tests/upstream-util'],
		'packages/react-map-gl/audit/upstream-util-adapted-runtime.json',
	),
	writeInventory(
		'react-map-gl',
		['packages/react-map-gl/tests/upstream'],
		'packages/react-map-gl/audit/ported-runtime.json',
	),
	writeInventory(
		'react-map-gl-differential',
		['packages/react-map-gl/tests/differential'],
		'packages/react-map-gl/audit/differential-runtime.json',
	),
];
void pristineInventory;
void differentialInventory;

function summarize(list) {
	const all = new Set();
	const laneCounts = new Map();
	let entries = 0;
	let duplicates = 0;
	for (const inventory of list) {
		const lane = new Set();
		for (const test of inventory.tests) {
			const identity = `${test.file}\0${test.fullName}`;
			entries++;
			all.add(identity);
			lane.add(identity);
		}
		duplicates += inventory.tests.length - lane.size;
		for (const identity of lane) laneCounts.set(identity, (laneCounts.get(identity) ?? 0) + 1);
	}
	return {
		inventoryEntries: entries,
		uniqueIdentities: all.size,
		duplicateEntriesWithinLanes: duplicates,
		identitiesSharedAcrossLanes: [...laneCounts.values()].filter((count) => count > 1).length,
	};
}

const manifest = {
	$schema: '../../hook-form/audit/react-parity.schema.json',
	schemaVersion: 1,
	provenance: {
		repo: 'https://github.com/visgl/react-map-gl.git',
		version: '8.1.2',
		commit: 'b1e46fcfb9d5de9bb179ca54e7d27617caa28c65',
		sourceRoot: 'modules/react-mapbox/src',
		testRoot: 'modules/react-mapbox/test',
		license: 'MIT',
		integrity: upstreamIntegrity(),
		verification: 'verified',
	},
	upstreamSuites: {
		runtime: 'present',
		// @vis.gl/react-mapbox 8.1.2 ships no type-test suite; there is no
		// __typetest__ directory or tsd/expect-type harness at the pin.
		types: 'absent',
	},
	adaptedRoots: {
		source: {
			roots: ['packages/react-map-gl/src'],
			include: ['\\.(?:[cm]?[jt]s|[jt]sx|tsrx)$'],
			exclude: [],
		},
		tests: {
			roots: TEST_ROOTS,
			include: ['\\.(?:test|spec)\\.(?:[cm]?[jt]s|[jt]sx|tsrx)$'],
			exclude: TEST_EXCLUDE,
		},
	},
	// The checker summarizes only the adapted-octane lanes.
	adaptedRuntimeSummary: summarize([adaptedUtilInventory, portedInventory]),
	environments: {
		'workspace-node': {
			node: '>=22',
			platform: 'any',
			arch: 'any',
			packageManager: 'pnpm@11.15.1',
			lockfile: 'pnpm-lock.yaml',
			lockfileSha256: hashFile('pnpm-lock.yaml'),
		},
	},
	lanes: [
		upstreamUtilLane('pristine', 'react-map-gl-upstream-pristine'),
		upstreamUtilLane('adapted', 'react-map-gl-upstream-adapted'),
		{
			id: 'react-map-gl-ported-components',
			type: 'adapted-octane',
			oracle: 'required',
			environment: 'workspace-node',
			project: 'react-map-gl',
			evidenceOrigin: 'upstream-suite',
			notes:
				"Upstream's seven component specs, re-authored in .tsrx against a mapbox-gl double. Upstream drives a real mapbox-gl@3 with a live access token in a browser, which CI cannot do, so these are the ported form of that evidence and each case cites its origin.",
			execution: {
				kind: 'vitest-full',
				inventory: 'packages/react-map-gl/audit/ported-runtime.json',
			},
			files: [...PORTED_SPECS, ...sharedSupport],
		},
		{
			// @vis.gl/react-mapbox 8.1.2 ships no type tests, so both sides here are
			// port-authored against the same assertion list. The pristine side
			// compiles them against the PUBLISHED upstream typings with tsc, which
			// is what makes the adapted side a parity claim rather than a
			// self-description.
			id: 'react-map-gl-pristine-types',
			type: 'pristine-types',
			oracle: 'required',
			available: true,
			environment: 'workspace-node',
			project: 'react-map-gl-pristine-types',
			evidenceOrigin: 'repo-authored',
			notes:
				'Type assertions for the public surface, compiled against @vis.gl/react-mapbox 8.1.2 with tsc and pinned React types.',
			execution: {
				kind: 'typescript',
				compiler: 'tsc',
				project: 'packages/react-map-gl/typetests/pristine/tsconfig.json',
			},
			files: [
				typeSuiteFile('packages/react-map-gl/typetests/pristine/types.test-d.ts', 'types:pristine'),
				supportFile('packages/react-map-gl/typetests/pristine/tsconfig.json'),
				supportFile('packages/react-map-gl/typetests/assertions.md'),
			],
		},
		{
			id: 'react-map-gl-adapted-types',
			type: 'adapted-types',
			oracle: 'required',
			available: true,
			environment: 'workspace-node',
			project: 'react-map-gl-adapted-types',
			evidenceOrigin: 'repo-authored',
			notes:
				'The same assertion groups against @octanejs/react-map-gl with tsrx-tsc. Permitted transformations are listed in typetests/assertions.md; anything else is drift.',
			execution: {
				kind: 'typescript',
				compiler: 'tsrx-tsc',
				project: 'packages/react-map-gl/typetests/adapted/tsconfig.json',
			},
			files: [
				typeSuiteFile('packages/react-map-gl/typetests/adapted/types.test-d.ts', 'types:adapted'),
				supportFile('packages/react-map-gl/typetests/adapted/tsconfig.json'),
				supportFile('packages/react-map-gl/typetests/assertions.md'),
			],
		},
		{
			id: 'react-map-gl-differential',
			type: 'differential',
			oracle: 'required',
			environment: 'workspace-node',
			project: 'react-map-gl-differential',
			evidenceOrigin: 'repo-authored',
			notes:
				'One fixture through Octane and the published @vis.gl/react-mapbox 8.1.2 on React, sharing the same mapbox-gl double. This is what licenses the double as evidence: it would have to flatter both bindings identically.',
			execution: {
				kind: 'vitest-full',
				inventory: 'packages/react-map-gl/audit/differential-runtime.json',
			},
			files: [
				testFile('packages/react-map-gl/tests/differential/parity.test.ts', 'differential'),
				supportFile('packages/react-map-gl/tests/differential/_setup.ts'),
				supportFile('packages/react-map-gl/tests/_fixtures/differential/map-diff.tsrx'),
				supportFile('packages/react-map-gl/tests/_fixtures/differential/source-layer-diff.tsrx'),
				supportFile('packages/react-map-gl/tests/_fixtures/differential/overlay-diff.tsrx'),
				supportFile('packages/react-map-gl/tests/_fixtures/differential/use-map-diff.tsrx'),
				supportFile('packages/react-map-gl/tests/_fixtures/differential/use-control-diff.tsrx'),
				supportFile('packages/react-map-gl/tests/_fixtures/differential/marker-children-diff.tsrx'),
				supportFile('packages/react-map-gl/tests/_mocks/mapbox-gl.ts'),
				supportFile('vitest.config.js'),
			],
		},
	],
	// Divergences here are parity findings tied to a lane case. The unmount-drain
	// scheduling difference is deliberately NOT one: no lane observes it, because
	// it is an Octane runtime property rather than a binding behavior. It is
	// recorded in UPSTREAM.md and status.json and pinned by
	// tests/runtime/lifecycle.test.ts, which stays in the ordinary shards.
	divergences: [
		{
			id: 'react-map-gl-source-id-by-context',
			caseIds: ['ported:source-layer:3'],
			upstreamResult:
				'<Source> clones its children with cloneElement(child, {source: id}), which reaches direct children only and overrides any explicit source prop.',
			octaneResult:
				'<Source> publishes its id through a context that <Layer> reads, which reaches any descendant layer and likewise overrides an explicit source prop.',
			rationale:
				"Octane's compiler lowers a .tsrx parent's element children to a render function, which cannot be cloned, so the id cannot be injected per child.",
			classification: 'compiler-model',
			consumerImpact:
				'A <Layer> nested below a wrapper component inside a <Source> inherits that source id, where upstream would have left it unset.',
			migrationGuidance:
				'Set an explicit source on layers that must not belong to an enclosing <Source>, and keep such layers outside it.',
			owner: '@octanejs/react-map-gl',
			reviewCondition:
				'Review if Octane gains a way to project props onto a compiled children block.',
		},
		{
			id: 'react-map-gl-refs-as-props',
			caseIds: ['ported:map:1', 'ported:marker:1', 'ported:popup:1', 'ported:controls:3'],
			upstreamResult:
				'Map, Marker, Popup and GeolocateControl are wrapped in forwardRef and receive their ref through the React ref channel.',
			octaneResult:
				'The same components declare `ref` as an ordinary prop; Octane has no forwardRef.',
			rationale: 'Octane follows the React 19 refs-as-props model and does not ship forwardRef.',
			classification: 'ref-model',
			consumerImpact:
				'`<Map ref={mapRef} />` continues to work unchanged; only code that wrapped these components in its own forwardRef needs updating.',
			migrationGuidance: 'Pass ref as a normal prop and drop any forwardRef wrapper.',
			owner: '@octanejs/react-map-gl',
			reviewCondition: 'Review if Octane adds a forwardRef compatibility shim.',
		},
	],
};

const target = path.join(PACKAGE, 'audit/react-parity.json');
await Promise.all(pendingWrites);
await writeJson(target, manifest);
console.log(`wrote ${path.relative(REPO, target)}`);
