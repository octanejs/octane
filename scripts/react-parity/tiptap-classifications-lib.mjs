import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

const CONFIG = 'packages/tiptap/audit/test-classifications.json';
const MANIFEST = 'packages/tiptap/audit/react-parity.json';
const DISPOSITIONS = new Set([
	'unmodified-upstream-suite-wrapper',
	'react-octane-differential',
	'octane-only-divergence',
	'octane-only-framework-contract',
	'react-parity-type-probe',
	'octane-only-type-probe',
]);

function portablePath(root, entry) {
	return relative(root, resolve(entry.parentPath ?? entry.path, entry.name))
		.split(sep)
		.join('/');
}

function discoverPortTests(root) {
	const testsRoot = resolve(root, 'packages/tiptap/tests');
	return readdirSync(testsRoot, { recursive: true, withFileTypes: true })
		.filter(function keepTestFiles(entry) {
			return entry.isFile() && /\.test\.(?:ts|tsx|tsrx)$/.test(entry.name);
		})
		.map(function toPath(entry) {
			return portablePath(root, entry);
		})
		.filter(function excludeUpstreamCopy(path) {
			return !path.includes('/tests/upstream/');
		})
		.sort();
}

function discoverTypeProbes(root) {
	const typetestsRoot = resolve(root, 'packages/tiptap/typetests');
	if (!existsSync(typetestsRoot)) return [];
	return readdirSync(typetestsRoot, { recursive: true, withFileTypes: true })
		.filter(function keepTypeProbes(entry) {
			return entry.isFile() && /\.test-d\.ts$/.test(entry.name);
		})
		.map(function toPath(entry) {
			return portablePath(root, entry);
		})
		.sort();
}

/**
 * TipTap classifications cover port-authored Vitest files and every type-test
 * probe under typetests/ (pristine/adapted parity pair plus Octane-only APIs).
 */
export function verifyTiptapTestClassifications(root) {
	const discovered = [...discoverPortTests(root), ...discoverTypeProbes(root)].sort();
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
		throw new Error(
			'every port-authored tiptap test and type probe must have exactly one classification',
		);
	}
	for (const entry of config.tests) {
		if (!DISPOSITIONS.has(entry.disposition)) {
			throw new Error(`${entry.path}: unknown test disposition`);
		}
		const isTypeProbe = entry.path.includes('/typetests/');
		if (isTypeProbe) {
			if (
				entry.disposition !== 'react-parity-type-probe' &&
				entry.disposition !== 'octane-only-type-probe'
			) {
				throw new Error(`${entry.path}: type probes require a type-probe disposition`);
			}
			if (entry.disposition === 'octane-only-type-probe') {
				if (!entry.reason) {
					throw new Error(`${entry.path}: Octane-only type probes require an explicit reason`);
				}
				if (entry.oracle) {
					throw new Error(`${entry.path}: Octane-only type probes must not claim React parity`);
				}
			} else if (!entry.oracle) {
				throw new Error(
					`${entry.path}: React-parity type probes require a React oracle or upstream citation`,
				);
			}
			continue;
		}
		if (entry.disposition.startsWith('octane-only-')) {
			if (!entry.reason) {
				throw new Error(`${entry.path}: Octane-only tests require an explicit reason`);
			}
			if (entry.oracle) {
				throw new Error(`${entry.path}: Octane-only tests must not claim React parity`);
			}
		} else if (!entry.oracle) {
			throw new Error(
				`${entry.path}: React-parity evidence requires a React oracle or upstream citation`,
			);
		}
		if (entry.disposition === 'octane-only-divergence') {
			const classifiedDivergences = entry.divergenceIds ?? [entry.divergenceId].filter(Boolean);
			if (!classifiedDivergences.length) {
				throw new Error(`${entry.path}: divergence tests require a manifest divergence id`);
			}
			for (const divergenceId of classifiedDivergences) {
				if (!divergenceIds.has(divergenceId)) {
					throw new Error(`${entry.path}: divergence id is not present in the parity manifest`);
				}
			}
		}
	}
	return { tests: discovered.length };
}
