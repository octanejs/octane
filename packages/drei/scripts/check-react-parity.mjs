#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyDreiTypes } from '../../../scripts/react-parity/drei-types-lib.mjs';

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const override = process.env.OCTANE_DREI_PARITY_AUDIT;
const audit = override ? resolve(override) : resolve(root, 'packages/drei/audit');
const read = (name) => JSON.parse(readFileSync(resolve(audit, name), 'utf8'));
const digest = (value) => createHash('sha256').update(value).digest('hex');
const portable = (value) => value.replaceAll('\\', '/');
const fail = (message) => {
	throw new Error(`Drei React-parity audit: ${message}`);
};

const OCTANE_ONLY = new Set([
	'packages/drei/tests/config.test.ts',
	'packages/drei/tests/crosswalk-guard.test.ts',
	'packages/drei/tests/react-parity-guard.test.ts',
]);

const inventory = read('adapted-runtime.json');
const evidence = read('runtime-evidence.json');
const classifications = read('test-classifications.json');
const upstream = read('upstream-test-artifacts.json');
const manifest = read('react-parity.json');

const discovered = readdirSync(resolve(root, 'packages/drei/tests'), {
	recursive: true,
	withFileTypes: true,
})
	.filter((entry) => entry.isFile() && /\.test\.(?:ts|tsx|tsrx)$/.test(entry.name))
	.map((entry) => portable(relative(root, resolve(entry.parentPath, entry.name))))
	.sort();
const inventoried = [...inventory.files].sort();
const differential = discovered.filter((path) => path.includes('/tests/differential/'));
const guards = discovered.filter((path) => OCTANE_ONLY.has(path));
const expectedAdapted = discovered
	.filter((path) => !OCTANE_ONLY.has(path) && !path.includes('/tests/differential/'))
	.sort();
if (JSON.stringify(expectedAdapted) !== JSON.stringify(inventoried))
	fail('adapted inventory must cover every paired file and exclude guards/differential');
if (differential.length === 0) fail('differential project files are missing');
if (guards.length !== OCTANE_ONLY.size) fail('octane-only guard files drifted');

const classified = classifications.tests.map((entry) => entry.path).sort();
if (JSON.stringify(discovered) !== JSON.stringify(classified))
	fail('every port-authored test must have exactly one classification');
if (new Set(classified).size !== classified.length)
	fail('a port-authored test has multiple classifications');

for (const entry of classifications.tests) {
	if (entry.disposition === 'react-octane-differential') {
		if (!entry.oracle) fail(`${entry.path} lacks a pinned React oracle`);
		const source = readFileSync(resolve(root, entry.path), 'utf8');
		if (!source.includes('@react-three/drei'))
			fail(`${entry.path} no longer imports its React oracle`);
		if (OCTANE_ONLY.has(entry.path))
			fail(`${entry.path} is classified as parity evidence but is an Octane-only guard`);
	} else if (!entry.disposition.startsWith('octane-only-') || !entry.reason || entry.oracle) {
		fail(`${entry.path} has an invalid unpaired classification`);
	} else if (!OCTANE_ONLY.has(entry.path)) {
		fail(`${entry.path} is classified Octane-only but is not a declared guard`);
	}
}

if (JSON.stringify(evidence.files.map((entry) => entry.path).sort()) !== JSON.stringify(discovered))
	fail('runtime file evidence does not cover the complete suite');
for (const file of evidence.files) {
	const contents = readFileSync(resolve(root, file.path));
	if (digest(contents) !== file.sha256) fail(`${file.path} file hash drifted`);
	const assertions = inventory.tests.filter((test) => test.file === file.path);
	if (inventoried.includes(file.path)) {
		if (assertions.length !== file.assertionCount) fail(`${file.path} lost or gained an assertion`);
		if (
			digest(assertions.map((test) => test.fullName).join('\n')) !== file.assertionInventorySha256
		)
			fail(`${file.path} assertion inventory drifted`);
	}
}

const discoveredUpstream = readdirSync(resolve(root, 'packages/drei/upstream/test'), {
	recursive: true,
	withFileTypes: true,
})
	.filter((entry) => entry.isFile())
	.map((entry) => portable(relative(root, resolve(entry.parentPath, entry.name))))
	.sort();
if (
	JSON.stringify(upstream.artifacts.map((entry) => entry.path).sort()) !==
	JSON.stringify(discoveredUpstream)
)
	fail('every vendored upstream test artifact must have exactly one disposition');
for (const artifact of upstream.artifacts) {
	if (!artifact.disposition || !artifact.reason)
		fail(`${artifact.path} lacks a disposition or reason`);
	if (artifact.disposition !== 'out-of-scope')
		fail(`${artifact.path} must be out-of-scope for the Playwright gallery suite`);
	if (!existsSync(resolve(root, artifact.path))) fail(`${artifact.path} is missing`);
	if (digest(readFileSync(resolve(root, artifact.path))) !== artifact.sha256)
		fail(`${artifact.path} hash drifted`);
}
if (upstream.upstreamRuntimeSuite !== 'absent')
	fail('pinned Drei Playwright gallery must be recorded as an absent Vitest/Jest runtime suite');
if (upstream.upstreamTypeSuite !== 'absent')
	fail('pinned Drei must not claim an upstream type suite');
if (manifest.upstreamSuites?.runtime !== 'absent' || manifest.upstreamSuites?.types !== 'absent')
	fail('react-parity manifest suite states must match the upstream artifact ledger');
const upstreamFiles = readdirSync(resolve(root, 'packages/drei/upstream'), {
	recursive: true,
	withFileTypes: true,
})
	.filter((entry) => entry.isFile())
	.map((entry) => resolve(entry.parentPath, entry.name));
if (upstreamFiles.some((path) => /(?:type.?tests?|__typetest__)/i.test(path)))
	fail('upstream type-test absence claim is stale');
const actualExpectErrors = upstreamFiles.flatMap((path) =>
	/\.[cm]?[jt]sx?$/.test(path)
		? readFileSync(path, 'utf8')
				.split('\n')
				.flatMap((line, index) =>
					line.includes('@ts-expect-error')
						? [
								{
									path: portable(relative(root, path)),
									line: index + 1,
									sha256: digest(line.trim()),
								},
							]
						: [],
				)
		: [],
);
if (JSON.stringify(actualExpectErrors) !== JSON.stringify(upstream.upstreamSourceExpectErrors))
	fail('an upstream source @ts-expect-error directive was removed, added, or changed');
if (upstream.allowedTransformations.length !== 0)
	fail('Drei has no adapted upstream suite, so its transformation ledger must be empty');

if (!override) {
	try {
		verifyDreiTypes(root);
	} catch (error) {
		fail(error.message);
	}
}

console.log(
	`Drei parity evidence is current (${inventory.tests.length} adapted assertions in ${inventory.files.length} files; ${differential.length} differential file(s); ${guards.length} Octane-only guards).`,
);
