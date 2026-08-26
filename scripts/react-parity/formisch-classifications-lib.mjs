import { accessSync, constants, readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { toPortablePath } from './harness-lib.mjs';

const DISPOSITIONS = new Set([
	'adapted-upstream',
	'adapted-upstream-with-divergence',
	'octane-only-divergence',
	'octane-only-framework-contract',
	'react-octane-differential',
	'react-octane-differential-fixture',
]);

export function verifyFormischClassificationEntries(classifications, manifest) {
	if (classifications.schemaVersion !== 1 || !Array.isArray(classifications.tests))
		throw new Error('invalid Formisch test classification schema');
	const divergenceIds = new Set(manifest.divergences.map((entry) => entry.id));
	for (const entry of classifications.tests) {
		if (!DISPOSITIONS.has(entry.disposition))
			throw new Error(`${entry.path}: unknown test disposition`);
		if (entry.disposition.startsWith('octane-only-') && !entry.reason)
			throw new Error(`${entry.path}: Octane-only tests require an explicit reason`);
		if (entry.disposition.startsWith('react-octane-') && (!entry.reason || !entry.oracle))
			throw new Error(`${entry.path}: differential tests require a reason and React oracle`);
		if (
			entry.disposition.endsWith('-with-divergence') ||
			entry.disposition === 'octane-only-divergence'
		) {
			if (!entry.reason || !entry.divergenceId)
				throw new Error(
					`${entry.path}: divergence tests require a reason and manifest divergence id`,
				);
			if (!divergenceIds.has(entry.divergenceId))
				throw new Error(`${entry.path}: divergence id is not present in the parity manifest`);
		}
	}
}

export function verifyFormischTestClassifications(repoRoot) {
	const classificationPath = resolve(repoRoot, 'packages/formisch/audit/test-classifications.json');
	const classifications = JSON.parse(readFileSync(classificationPath, 'utf8'));
	const manifest = JSON.parse(
		readFileSync(resolve(repoRoot, 'packages/formisch/audit/react-parity.json'), 'utf8'),
	);
	verifyFormischClassificationEntries(classifications, manifest);
	const declared = classifications.tests.map((entry) => entry.path).sort();
	if (new Set(declared).size !== declared.length)
		throw new Error('duplicate Formisch test classification');
	for (const entry of classifications.tests) {
		try {
			accessSync(resolve(repoRoot, entry.path), constants.F_OK);
		} catch {
			throw new Error(`invalid Formisch test classification: ${entry.path}`);
		}
	}
	const testsRoot = resolve(repoRoot, 'packages/formisch/tests');
	const discovered = readdirSync(testsRoot, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile() && /\.test\.(?:[cm]?[jt]sx?|tsrx)$/.test(entry.name))
		.map((entry) =>
			toPortablePath(relative(repoRoot, resolve(entry.parentPath ?? entry.path, entry.name))),
		)
		.sort();
	if (JSON.stringify(discovered) !== JSON.stringify(declared))
		throw new Error('Formisch port-authored test classifications are incomplete or stale');
	return { files: declared.length };
}
