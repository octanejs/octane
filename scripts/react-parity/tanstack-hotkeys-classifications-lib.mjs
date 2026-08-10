import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

const CONFIG = 'packages/tanstack-hotkeys/audit/test-classifications.json';
const MANIFEST = 'packages/tanstack-hotkeys/audit/react-parity.json';
const DISPOSITIONS = new Set([
	'adapted-upstream-suite',
	'pristine-upstream-suite',
	'react-octane-differential',
	'octane-only-divergence',
	'octane-only-framework-contract',
]);

export function verifyTanstackHotkeysTestClassifications(root) {
	const testsRoot = resolve(root, 'packages/tanstack-hotkeys/tests');
	const discovered = readdirSync(testsRoot, { recursive: true, withFileTypes: true })
		.filter(function keepTestFiles(entry) {
			return entry.isFile() && /\.test\.(?:ts|tsx|tsrx)$/.test(entry.name);
		})
		.map(function toPortablePath(entry) {
			return relative(root, resolve(entry.parentPath ?? entry.path, entry.name))
				.split(sep)
				.join('/');
		})
		.sort();
	const configPath = resolve(root, CONFIG);
	if (!existsSync(configPath)) throw new Error(`missing port-test classifications: ${CONFIG}`);
	const config = JSON.parse(readFileSync(configPath, 'utf8'));
	const manifest = JSON.parse(readFileSync(resolve(root, MANIFEST), 'utf8'));
	const divergenceIds = new Set(
		(manifest.divergences ?? []).map(function idOf(entry) {
			return entry.id;
		}),
	);
	const declared = config.tests
		.map(function pathOf(entry) {
			return entry.path;
		})
		.sort();
	if (JSON.stringify(discovered) !== JSON.stringify(declared)) {
		throw new Error('every port-authored tanstack-hotkeys test must have exactly one classification');
	}
	for (const entry of config.tests) {
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
			const classifiedDivergences = entry.divergenceIds ?? [entry.divergenceId].filter(Boolean);
			if (!classifiedDivergences.length)
				throw new Error(`${entry.path}: divergence tests require a manifest divergence id`);
			for (const divergenceId of classifiedDivergences) {
				if (!divergenceIds.has(divergenceId))
					throw new Error(`${entry.path}: divergence id is not present in the parity manifest`);
			}
		}
	}
	return { tests: discovered.length };
}
