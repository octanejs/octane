import { readdirSync, readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

const EXPECTED_PROJECT = 'better-auth-differential';
const EXPECTED_ROOTS = ['packages/better-auth/tests/differential'];

function portable(path) {
	return path.split(sep).join('/');
}

function discoveredTests(root) {
	const directory = resolve(root, EXPECTED_ROOTS[0]);
	return readdirSync(directory, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name.endsWith('.test.ts'))
		.map((entry) => portable(relative(root, resolve(entry.parentPath ?? entry.path, entry.name))))
		.sort();
}

export function verifyBetterAuthRuntimeInventory(root, inventoryOverride) {
	const inventory =
		inventoryOverride ??
		JSON.parse(
			readFileSync(resolve(root, 'packages/better-auth/audit/adapted-runtime.json'), 'utf8'),
		);
	if (
		inventory?.schemaVersion !== 1 ||
		inventory.project !== EXPECTED_PROJECT ||
		JSON.stringify(inventory.roots) !== JSON.stringify(EXPECTED_ROOTS) ||
		!Array.isArray(inventory.files) ||
		!Array.isArray(inventory.tests) ||
		inventory.tests.length === 0
	) {
		throw new Error('Better Auth adapted runtime inventory has an invalid or empty schema');
	}
	const discovered = discoveredTests(root);
	if (JSON.stringify([...inventory.files].sort()) !== JSON.stringify(discovered)) {
		throw new Error('Better Auth adapted runtime file inventory drifted');
	}
	if (new Set(inventory.files).size !== inventory.files.length) {
		throw new Error('Better Auth adapted runtime inventory has duplicate files');
	}
	const ids = new Set();
	const identities = new Set();
	for (const test of inventory.tests) {
		if (!test?.id || !test?.file || !test?.fullName || !inventory.files.includes(test.file)) {
			throw new Error('Better Auth adapted runtime inventory has an invalid test identity');
		}
		if (ids.has(test.id))
			throw new Error('Better Auth adapted runtime inventory has duplicate ids');
		const identity = `${test.file}\0${test.fullName}`;
		if (identities.has(identity)) {
			throw new Error('Better Auth adapted runtime inventory has duplicate identities');
		}
		ids.add(test.id);
		identities.add(identity);
	}
	return { files: inventory.files.length, tests: inventory.tests.length };
}
