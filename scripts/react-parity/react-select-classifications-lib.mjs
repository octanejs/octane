import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

const CONFIG = 'packages/select/audit/test-classifications.json';
const MANIFEST = 'packages/select/audit/react-parity.json';
const DISPOSITIONS = new Set([
	'unmodified-upstream-suite-wrapper',
	'adapted-upstream-suite',
	'react-octane-differential',
	'octane-only-framework-contract',
	'octane-only-divergence',
	'repo-authored-type-parity',
]);

function discoverExecutableEvidence(root) {
	const roots = [
		resolve(root, 'packages/select/tests'),
		resolve(root, 'packages/select/typetests'),
	];
	const discovered = [];
	for (const evidenceRoot of roots) {
		if (!existsSync(evidenceRoot)) continue;
		for (const entry of readdirSync(evidenceRoot, { recursive: true, withFileTypes: true })) {
			if (!entry.isFile()) continue;
			const absolute = resolve(entry.parentPath ?? entry.path, entry.name);
			const portable = relative(root, absolute).split(sep).join('/');
			if (portable.includes('/typetests/')) {
				if (!/\.ts$/.test(entry.name) || entry.name.startsWith('tsconfig')) continue;
			} else if (!/\.test\.(?:ts|tsx|tsrx|mjs)$/.test(entry.name)) {
				continue;
			}
			discovered.push(portable);
		}
	}
	return discovered.sort();
}

export function verifyReactSelectTestClassifications(root) {
	const discovered = discoverExecutableEvidence(root);
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
		throw new Error('every authored react-select test must have exactly one classification');
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
			for (const divergenceId of classifiedDivergences)
				if (!divergenceIds.has(divergenceId))
					throw new Error(`${entry.path}: divergence id is not present in the parity manifest`);
		}
	}
	return { tests: discovered.length };
}
