import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

const CONFIG = 'packages/tanstack-table/audit/test-classifications.json';
const MANIFEST = 'packages/tanstack-table/audit/react-parity.json';
const DISPOSITIONS = new Set([
	'react-octane-differential',
	'octane-only-divergence',
	'octane-only-framework-contract',
	'pristine-types',
	'adapted-types',
]);

const DISCOVERY_ROOTS = [
	{
		root: 'packages/tanstack-table/tests',
		match: /\.test\.(?:ts|tsx|tsrx)$/,
		exclude: /\/tests\/upstream\//,
	},
	{
		root: 'packages/tanstack-table/typetests/pristine',
		match: /\.test-d\.ts$/,
	},
	{
		root: 'packages/tanstack-table/typetests/adapted',
		match: /\.test-d\.ts$/,
	},
];

function discoverFiles(root) {
	const discovered = [];
	for (const entry of DISCOVERY_ROOTS) {
		const absoluteRoot = resolve(root, entry.root);
		if (!existsSync(absoluteRoot))
			throw new Error(`missing tanstack-table discovery root: ${entry.root}`);
		for (const file of readdirSync(absoluteRoot, { recursive: true, withFileTypes: true })) {
			if (!file.isFile() || !entry.match.test(file.name)) continue;
			const path = relative(root, resolve(file.parentPath ?? file.path, file.name))
				.split(sep)
				.join('/');
			if (entry.exclude && entry.exclude.test(path)) continue;
			discovered.push(path);
		}
	}
	return discovered.sort();
}

export function verifyTanstackTableTestClassifications(root) {
	const configPath = resolve(root, CONFIG);
	if (!existsSync(configPath)) throw new Error(`missing port-test classifications: ${CONFIG}`);
	const config = JSON.parse(readFileSync(configPath, 'utf8'));
	const manifest = JSON.parse(readFileSync(resolve(root, MANIFEST), 'utf8'));
	const divergenceIds = new Set(
		(manifest.divergences ?? []).map(function idOf(entry) {
			return entry.id;
		}),
	);
	const discovered = discoverFiles(root);
	const declared = config.tests
		.map(function pathOf(entry) {
			return entry.path;
		})
		.sort();
	if (JSON.stringify(discovered) !== JSON.stringify(declared)) {
		throw new Error(
			'every port-authored tanstack-table runtime and type test must have exactly one classification',
		);
	}
	for (const entry of config.tests) {
		if (!DISPOSITIONS.has(entry.disposition))
			throw new Error(`${entry.path}: unknown test disposition`);
		if (entry.disposition === 'pristine-types' && !entry.path.includes('/typetests/pristine/'))
			throw new Error(`${entry.path}: pristine-types disposition requires typetests/pristine`);
		if (entry.disposition === 'adapted-types' && !entry.path.includes('/typetests/adapted/'))
			throw new Error(`${entry.path}: adapted-types disposition requires typetests/adapted`);
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
	const pristine = config.tests.filter(function isPristine(entry) {
		return entry.disposition === 'pristine-types';
	});
	const adapted = config.tests.filter(function isAdapted(entry) {
		return entry.disposition === 'adapted-types';
	});
	if (pristine.length === 0 || adapted.length === 0) {
		throw new Error(
			'tanstack-table type tests require both pristine-types and adapted-types dispositions',
		);
	}
	return { tests: discovered.length, pristineTypes: pristine.length, adaptedTypes: adapted.length };
}
