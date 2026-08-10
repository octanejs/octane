import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

const DISPOSITIONS = new Set([
	'unmodified-upstream-suite-wrapper',
	'react-octane-differential',
	'octane-only-divergence',
	'octane-only-framework-contract',
]);

export function verifyPortTestClassifications(root, binding = 'hook-form') {
	const config = `packages/${binding}/audit/test-classifications.json`;
	const manifestPath = `packages/${binding}/audit/react-parity.json`;
	const testsRoot = resolve(root, `packages/${binding}/tests`);
	const discovered = readdirSync(testsRoot, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile() && /\.test\.(?:ts|tsx|tsrx)$/.test(entry.name))
		.map((entry) =>
			relative(root, resolve(entry.parentPath ?? entry.path, entry.name))
				.split(sep)
				.join('/'),
		)
		.filter((path) => !path.includes('/tests/upstream/'))
		.sort();
	const configPath = resolve(root, config);
	if (!existsSync(configPath)) throw new Error(`missing port-test classifications: ${config}`);
	const classifications = JSON.parse(readFileSync(configPath, 'utf8'));
	const manifest = JSON.parse(readFileSync(resolve(root, manifestPath), 'utf8'));
	const divergenceIds = new Set(manifest.divergences.map((entry) => entry.id));
	const declared = classifications.tests.map((entry) => entry.path).sort();
	if (JSON.stringify(discovered) !== JSON.stringify(declared)) {
		throw new Error(`every port-authored ${binding} test must have exactly one classification`);
	}
	for (const entry of classifications.tests) {
		if (!DISPOSITIONS.has(entry.disposition))
			throw new Error(`${entry.path}: unknown test disposition`);
		if (entry.disposition.startsWith('octane-only-')) {
			if (!entry.reason)
				throw new Error(`${entry.path}: Octane-only tests require an explicit reason`);
			if (entry.oracle)
				throw new Error(`${entry.path}: Octane-only tests must not claim React parity`);
		} else if (!entry.oracle) {
			throw new Error(
				`${entry.path}: React-parity evidence requires a React oracle or upstream citation`,
			);
		}
		if (entry.disposition === 'octane-only-divergence') {
			if (!entry.divergenceId)
				throw new Error(`${entry.path}: divergence tests require a manifest divergence id`);
			if (!divergenceIds.has(entry.divergenceId))
				throw new Error(`${entry.path}: divergence id is not present in the parity manifest`);
		}
	}
	return { tests: discovered.length };
}
