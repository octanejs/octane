import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const crosswalkPath =
	process.env.REACT_SELECT_CROSSWALK_PATH ?? join(packageRoot, 'audit/export-crosswalk.json');
const crosswalk = JSON.parse(readFileSync(crosswalkPath, 'utf8'));
const allowedStatuses = new Set([
	'not-started',
	'ported-and-tested',
	'waiting-on-react-transition-group-pr-487',
]);
const allowedTypeStatuses = new Set([
	'ported-and-tested',
	'ported-and-tested-with-platform-adaptations',
	'in-progress',
	'not-started',
	'waiting-on-react-transition-group-pr-487',
]);
const specifierFor = (path) => (path === '.' ? 'react-select' : `react-select/${path.slice(2)}`);

assert.equal(crosswalk.schemaVersion, 1);
assert.equal(crosswalk.pin.package, 'react-select');
assert.equal(crosswalk.pin.version, '5.10.2');
assert.equal(crosswalk.entryPoints.length, 6);
assert.deepEqual(
	crosswalk.typeEvidence.entryPoints,
	crosswalk.entryPoints.map((entry) => entry.path),
	'type-evidence entry-point drift',
);
for (const relativePath of [
	...crosswalk.typeEvidence.pairedFixtures,
	crosswalk.typeEvidence.compatibilityFixture,
	crosswalk.typeEvidence.browserFixtureProject,
]) {
	assert.ok(existsSync(join(packageRoot, relativePath)), `missing type evidence ${relativePath}`);
}
assert.deepEqual(crosswalk.typeEvidence.platformTypeAdaptations, [
	'OctaneNode replaces ReactNode in renderable callback and component contracts',
	'native DOM events replace React synthetic events',
	'Octane style objects replace Emotion CSSObjectWithLabel at renderer-owned boundaries',
]);
assert.deepEqual(crosswalk.typeEvidence.coverage, {
	pairedConsumerCompilation: 'all-six-entry-points',
	exactStructuralAssertions:
		'all-framework-neutral-declarations-and-complete-entry-point-props-member-inventories',
	rendererOwnedContracts: 'ported-with-documented-platform-adaptations',
});

let runtimeExports = 0;
let portedAndTested = 0;
let waitingOnPrerequisite = 0;
let notStarted = 0;
for (const entry of crosswalk.entryPoints) {
	assert.ok(
		allowedTypeStatuses.has(entry.types),
		`${entry.path} has unknown type status ${entry.types}`,
	);
	const upstream = await import(specifierFor(entry.path));
	const recorded = Object.keys(entry.runtimeExports).sort();
	assert.deepEqual(recorded, Object.keys(upstream).sort(), `${entry.path} runtime export drift`);
	for (const status of Object.values(entry.runtimeExports)) {
		assert.ok(allowedStatuses.has(status), `${entry.path} has unknown status ${status}`);
		runtimeExports++;
		if (status === 'ported-and-tested') portedAndTested++;
		else if (status === 'not-started') notStarted++;
		else waitingOnPrerequisite++;
	}
}

assert.deepEqual(crosswalk.summary, {
	entryPoints: crosswalk.entryPoints.length,
	runtimeExports,
	portedAndTested,
	waitingOnPrerequisite,
	notStarted,
});
process.stdout.write(
	`react-select@5.10.2 crosswalk verified: ${crosswalk.entryPoints.length} entry points / ${runtimeExports} runtime exports\n`,
);
