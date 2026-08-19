import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';

await import('../audit/validate-crosswalk.mjs');

const LYNX_ROOT = new URL('../', import.meta.url);
const PROBE_ROOT = new URL('../probe/', import.meta.url);
const REPOSITORY_ROOT = new URL('../../../', import.meta.url);

async function readJson(relativeUrl, base = LYNX_ROOT) {
	return JSON.parse(await readFile(new URL(relativeUrl, base), 'utf8'));
}

const toolchain = await readJson('./audit/toolchain.json');
const evidence = await readJson('./audit/phase-0-evidence.json');
const packageManifest = await readJson('./package.json', PROBE_ROOT);
const lockfile = await readJson('./package-lock.json', PROBE_ROOT);

const pinnedPackages = new Map(toolchain.packages.map((entry) => [entry.name, entry.version]));
const probeOnlyPackages = new Map([
	['jsdom', '29.1.1'],
	['typescript', toolchain.compatibility.selectedTypeScript],
]);
for (const [name, version] of Object.entries(packageManifest.devDependencies)) {
	const expected = pinnedPackages.get(name) ?? probeOnlyPackages.get(name);
	assert(expected, `${name} is not represented by the Phase 0 pin`);
	assert.equal(version, expected, `${name} differs from the Phase 0 pin`);
}
assert.equal(packageManifest.overrides['@rspack/core'], pinnedPackages.get('@rspack/core'));

const installedPackages = Object.entries(lockfile.packages ?? {});
const installedVersions = (name) =>
	new Set(
		installedPackages
			.filter(([path]) => path.endsWith(`node_modules/${name}`))
			.map(([, value]) => value.version),
	);
assert.deepEqual([...installedVersions('@rsbuild/core')], ['2.1.4']);
assert.deepEqual([...installedVersions('@rspack/core')], ['2.1.3']);
const expectedAbsentAuditedPackages = new Set([
	// Audited for the Milestone 5 plugin path, but not installed by the Phase 0 probe.
	'@lynx-js/css-extract-webpack-plugin',
]);
const absentAuditedPackages = new Set();
for (const pinnedPackage of toolchain.packages) {
	const matches = installedPackages.filter(([path]) =>
		path.endsWith(`node_modules/${pinnedPackage.name}`),
	);
	if (matches.length === 0) {
		absentAuditedPackages.add(pinnedPackage.name);
		continue;
	}
	for (const [, installedPackage] of matches) {
		assert.equal(
			installedPackage.version,
			pinnedPackage.version,
			`${pinnedPackage.name} version differs from toolchain.json`,
		);
		if (pinnedPackage.integrity) {
			assert.equal(
				installedPackage.integrity,
				pinnedPackage.integrity,
				`${pinnedPackage.name} integrity differs from toolchain.json`,
			);
		}
	}
}
assert.deepEqual(
	absentAuditedPackages,
	expectedAbsentAuditedPackages,
	'the audited packages absent from the isolated probe lock changed',
);
assert.equal(
	installedPackages.some(
		([path]) =>
			path.includes('node_modules/@lynx-js/react') ||
			/node_modules\/(?:preact|react)(?:\/|$)/.test(path),
	),
	false,
	'the Phase 0 graph must remain React/Preact-free',
);

for (const source of [
	'./src/bundle-entry.mjs',
	'./src/empty-background.mjs',
	'./src/imperative-baseline.mjs',
	'./src/main-thread-entry.mjs',
	'./src/papi.mjs',
	'./src/protocol.mjs',
	'./src/runtime-bridge.mjs',
]) {
	const contents = await readFile(new URL(source, PROBE_ROOT), 'utf8');
	assert.doesNotMatch(contents, /structuredClone/, `${source} uses an unproven PrimJS global`);
}

for (const artifact of evidence.artifacts) {
	const artifactUrl = new URL(artifact.path, REPOSITORY_ROOT);
	const metadata = await stat(artifactUrl);
	assert.equal(metadata.size, artifact.bytes, `${artifact.path} evidence is stale`);
	const digest = createHash('sha256')
		.update(await readFile(artifactUrl))
		.digest('hex');
	assert.equal(digest, artifact.sha256, `${artifact.path} digest evidence is stale`);
}

assert.equal(evidence.milestoneExit.status, 'blocked');
const gatesById = new Map(evidence.gates.map((gate) => [gate.id, gate]));
assert.equal(gatesById.size, evidence.gates.length, 'Phase 0 gate IDs must be unique');
assert.equal(
	new Set(evidence.milestoneExit.blockingGateIds).size,
	evidence.milestoneExit.blockingGateIds.length,
	'Phase 0 blocking gate IDs must be unique',
);
for (const blockingGateId of evidence.milestoneExit.blockingGateIds) {
	const gate = gatesById.get(blockingGateId);
	assert(gate, `${blockingGateId} must reference a Phase 0 gate`);
	assert.notEqual(gate.status, 'passed', `${blockingGateId} cannot block after passing`);
}
for (const requiredGate of [
	'encoded-bundle-in-testing-environment',
	'public-background-event-receiver',
	'public-current-init-data-receiver',
	'public-reload-and-background-teardown',
	'lynx-web-runtime',
	'lynx-explorer-3.9.0',
	'android-lynx-3.9.0',
	'ios-lynx-3.9.0',
	'comparable-runtime-baselines',
]) {
	assert(
		evidence.milestoneExit.blockingGateIds.includes(requiredGate),
		`${requiredGate} must remain an explicit exit gate`,
	);
}
assert.equal(gatesById.get('runner-expanded-test-case-inventory')?.status, 'passed');

console.log('Validated Lynx Phase 0 pins, dependency graph, evidence, and gates.');
