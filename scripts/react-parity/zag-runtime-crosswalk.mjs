import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const DISPOSITIONS_PATH = 'packages/zag/audit/runtime-case-dispositions.json';
const ALLOWED_DISPOSITIONS = new Set(['pristine-only']);

/**
 * Normalize a pristine or adapted inventory path to the upstream suite basename
 * so identities can be compared one-for-one across lane roots.
 */
export function normalizedSuiteKey(file) {
	return basename(file);
}

/**
 * Stable identity key shared by pristine and adapted inventories.
 */
export function normalizedIdentityKey(test) {
	return `${normalizedSuiteKey(test.file)}\0${test.fullName}`;
}

export function loadZagRuntimeCaseDispositions(root) {
	const path = resolve(root, DISPOSITIONS_PATH);
	const ledger = JSON.parse(readFileSync(path, 'utf8'));
	if (ledger.schemaVersion !== 1) throw new Error(`${DISPOSITIONS_PATH}: schemaVersion must be 1`);
	if (!Array.isArray(ledger.cases) || ledger.cases.length === 0)
		throw new Error(`${DISPOSITIONS_PATH}: cases must be a non-empty array`);
	const seen = new Set();
	for (const entry of ledger.cases) {
		if (typeof entry.id !== 'string' || !entry.id.startsWith('runtime:'))
			throw new Error(`${DISPOSITIONS_PATH}: case id must be a runtime identity`);
		if (seen.has(entry.id)) throw new Error(`${DISPOSITIONS_PATH}: duplicate case id ${entry.id}`);
		seen.add(entry.id);
		if (!ALLOWED_DISPOSITIONS.has(entry.disposition))
			throw new Error(`${DISPOSITIONS_PATH}: unsupported disposition ${entry.disposition}`);
		if (typeof entry.fullName !== 'string' || entry.fullName.length === 0)
			throw new Error(`${DISPOSITIONS_PATH}: ${entry.id} requires fullName`);
		if (typeof entry.file !== 'string' || !entry.file.includes('strict-mode.test.tsx'))
			throw new Error(`${DISPOSITIONS_PATH}: ${entry.id} must record the StrictMode suite file`);
		if (typeof entry.rationale !== 'string' || entry.rationale.length === 0)
			throw new Error(`${DISPOSITIONS_PATH}: ${entry.id} requires rationale`);
	}
	return ledger;
}

/**
 * Prove every non-dispositioned pristine identity has exactly one adapted
 * counterpart (by suite basename + fullName), and that dispositioned
 * StrictMode identities account for the residual gap.
 */
export function assertPristineAdaptedCrosswalk({ pristine, adapted, dispositions }) {
	if (!pristine?.tests || !adapted?.tests)
		throw new Error('zag runtime crosswalk requires pristine and adapted inventories');
	if (!dispositions?.cases) throw new Error('zag runtime crosswalk requires case dispositions');

	const pristineById = new Map(
		pristine.tests.map(function entry(test) {
			return [test.id, test];
		}),
	);
	const adaptedByKey = new Map();
	for (const test of adapted.tests) {
		const key = normalizedIdentityKey(test);
		if (adaptedByKey.has(key))
			throw new Error(`duplicate adapted identity key: ${key.replace('\0', ' :: ')}`);
		adaptedByKey.set(key, test);
	}

	const disposedIds = new Set();
	for (const entry of dispositions.cases) {
		const pristineCase = pristineById.get(entry.id);
		if (!pristineCase)
			throw new Error(`disposition ${entry.id} is missing from pristine inventory`);
		if (pristineCase.fullName !== entry.fullName)
			throw new Error(`disposition ${entry.id} fullName drifted from pristine inventory`);
		if (pristineCase.file !== entry.file)
			throw new Error(`disposition ${entry.id} file drifted from pristine inventory`);
		const adaptedHit = adaptedByKey.get(normalizedIdentityKey(pristineCase));
		if (adaptedHit)
			throw new Error(
				`disposition ${entry.id} must stay pristine-only, but adapted inventory includes it`,
			);
		disposedIds.add(entry.id);
	}

	const missingAdapted = [];
	const portableKeys = new Set();
	for (const test of pristine.tests) {
		if (disposedIds.has(test.id)) continue;
		const key = normalizedIdentityKey(test);
		portableKeys.add(key);
		if (!adaptedByKey.has(key)) missingAdapted.push(`${test.file} :: ${test.fullName}`);
	}
	if (missingAdapted.length > 0) {
		throw new Error(
			`adapted inventory missing one-for-one counterparts:\n${missingAdapted.join('\n')}`,
		);
	}

	const adaptedOrphans = [];
	for (const test of adapted.tests) {
		const key = normalizedIdentityKey(test);
		if (!portableKeys.has(key)) adaptedOrphans.push(`${test.file} :: ${test.fullName}`);
	}
	if (adaptedOrphans.length > 0) {
		throw new Error(
			`adapted inventory has identities without pristine counterparts:\n${adaptedOrphans.join('\n')}`,
		);
	}

	const expectedAdapted = pristine.tests.length - dispositions.cases.length;
	if (adapted.tests.length !== expectedAdapted) {
		throw new Error(
			`adapted inventory size ${adapted.tests.length} does not match pristine ${pristine.tests.length} minus ${dispositions.cases.length} dispositioned cases`,
		);
	}

	return {
		pristine: pristine.tests.length,
		adapted: adapted.tests.length,
		dispositioned: dispositions.cases.length,
	};
}

export function verifyZagRuntimeCrosswalk(root) {
	const pristine = JSON.parse(
		readFileSync(resolve(root, 'packages/zag/audit/pristine-runtime.json'), 'utf8'),
	);
	const adapted = JSON.parse(
		readFileSync(resolve(root, 'packages/zag/audit/adapted-runtime.json'), 'utf8'),
	);
	const dispositions = loadZagRuntimeCaseDispositions(root);
	return assertPristineAdaptedCrosswalk({ pristine, adapted, dispositions });
}
