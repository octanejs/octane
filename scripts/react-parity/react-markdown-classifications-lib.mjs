import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

const CONFIG = 'packages/markdown/audit/test-classifications.json';
const MANIFEST = 'packages/markdown/audit/react-parity.json';
const DISCOVERY_ROOTS = [
	{
		root: 'packages/markdown/tests',
		match: /\.test\.(?:ts|tsx|tsrx)$/,
	},
	{
		root: 'packages/markdown/audit/type-probes',
		match: /\.test-d\.ts$/,
	},
	{
		root: 'packages/markdown/typetests',
		match: /\.test-d\.ts$/,
	},
];
const DISPOSITIONS = new Set([
	'unmodified-upstream-suite-wrapper',
	'adapted-upstream-suite',
	'paired-repo-authored-react-type-oracle',
	'react-octane-differential',
	'octane-only-divergence',
	'octane-only-framework-contract',
]);
const TYPE_PROBE_PREFIX = 'packages/markdown/audit/type-probes/';

function discoverPortAuthoredTests(root) {
	const discovered = [];
	for (const entry of DISCOVERY_ROOTS) {
		const absRoot = resolve(root, entry.root);
		if (!existsSync(absRoot)) continue;
		const files = readdirSync(absRoot, { recursive: true, withFileTypes: true });
		for (const file of files) {
			if (!file.isFile() || !entry.match.test(file.name)) continue;
			const path = relative(root, resolve(file.parentPath ?? file.path, file.name))
				.split(sep)
				.join('/');
			if (path.includes('/tests/upstream/')) continue;
			discovered.push(path);
		}
	}
	return discovered.sort();
}

export function verifyReactMarkdownTestClassifications(root) {
	const discovered = discoverPortAuthoredTests(root);
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
		throw new Error('every port-authored react-markdown test must have exactly one classification');
	}
	for (const entry of config.tests) {
		if (!DISPOSITIONS.has(entry.disposition)) {
			throw new Error(`${entry.path}: unknown test disposition`);
		}
		if (entry.path.startsWith(TYPE_PROBE_PREFIX)) {
			if (entry.disposition !== 'paired-repo-authored-react-type-oracle') {
				throw new Error(
					`${entry.path}: type-probe files are repo-authored React declaration/type-oracle evidence and must use paired-repo-authored-react-type-oracle`,
				);
			}
		} else if (entry.disposition === 'paired-repo-authored-react-type-oracle') {
			throw new Error(
				`${entry.path}: paired-repo-authored-react-type-oracle is reserved for audit/type-probes`,
			);
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
