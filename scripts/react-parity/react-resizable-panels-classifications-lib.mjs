import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

const CONFIG = 'packages/resizable-panels/audit/test-classifications.json';
const MANIFEST = 'packages/resizable-panels/audit/react-parity.json';
const TEST_INVENTORY = 'packages/resizable-panels/audit/test-inventory.json';
const PACKAGE_PREFIX = 'packages/resizable-panels/';
const AUDIT_SCRIPT_TEST_ROOT = 'scripts/react-parity';
const AUDIT_SCRIPT_TEST_PATTERN = /^react-resizable-panels-.+-lib\.test\.mjs$/;
const DISPOSITIONS = new Set([
	'unmodified-upstream-suite-wrapper',
	'adapted-upstream-suite',
	'react-octane-differential',
	'octane-only-divergence',
	'octane-only-framework-contract',
]);

function portablePath(root, absolutePath) {
	return relative(root, absolutePath).split(sep).join('/');
}

function discoverTestFiles(testsRoot, root) {
	return readdirSync(testsRoot, { recursive: true, withFileTypes: true })
		.filter(function keepTestFiles(entry) {
			return entry.isFile() && /\.(?:browser\.)?test\.(?:ts|tsx|tsrx)$/.test(entry.name);
		})
		.map(function toPortablePath(entry) {
			return portablePath(root, resolve(entry.parentPath ?? entry.path, entry.name));
		})
		.sort();
}

function discoverAuditScriptTests(root) {
	const scriptRoot = resolve(root, AUDIT_SCRIPT_TEST_ROOT);
	if (!existsSync(scriptRoot)) return [];
	return readdirSync(scriptRoot, { withFileTypes: true })
		.filter(function keepAuditTests(entry) {
			return entry.isFile() && AUDIT_SCRIPT_TEST_PATTERN.test(entry.name);
		})
		.map(function toPortablePath(entry) {
			return `${AUDIT_SCRIPT_TEST_ROOT}/${entry.name}`;
		})
		.sort();
}

/**
 * Port-authored tests stay in test-classifications.json. Adapted upstream copies
 * are exhaustively accounted for by equating the discovered tests/upstream/**
 * set to inventory adaptedPath entries (with an extra-file negative control).
 * Port-authored audit verifiers under scripts/react-parity/ are classified too.
 */
export function verifyReactResizablePanelsTestClassifications(root) {
	const testsRoot = resolve(root, 'packages/resizable-panels/tests');
	const discovered = discoverTestFiles(testsRoot, root);
	const packagePortAuthored = discovered.filter(function excludeUpstreamCopy(path) {
		return !path.includes('/tests/upstream/');
	});
	const auditScriptTests = discoverAuditScriptTests(root);
	const portAuthored = [...packagePortAuthored, ...auditScriptTests].sort();
	const adaptedDiscovered = discovered
		.filter(function keepUpstreamCopy(path) {
			return path.includes('/tests/upstream/');
		})
		.sort();

	const inventory = JSON.parse(readFileSync(resolve(root, TEST_INVENTORY), 'utf8'));
	const adaptedFromInventory = inventory.artifacts
		.map(function toPackagePath(artifact) {
			if (!artifact.adaptedPath) {
				throw new Error(`${artifact.path}: adapted artifact is missing adaptedPath`);
			}
			return `${PACKAGE_PREFIX}${artifact.adaptedPath}`;
		})
		.sort();
	if (JSON.stringify(adaptedDiscovered) !== JSON.stringify(adaptedFromInventory)) {
		throw new Error(
			'discovered tests/upstream/** must exactly equal test-inventory.json adaptedPath set',
		);
	}

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
	if (JSON.stringify(portAuthored) !== JSON.stringify(declared)) {
		throw new Error(
			'every port-authored react-resizable-panels test (package + scripts/react-parity audit) must have exactly one classification',
		);
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
			if (!entry.divergenceId)
				throw new Error(`${entry.path}: divergence tests require a manifest divergence id`);
			if (!divergenceIds.has(entry.divergenceId))
				throw new Error(`${entry.path}: divergence id is not present in the parity manifest`);
		}
	}
	return {
		tests: portAuthored.length,
		adaptedUpstreamSuites: adaptedDiscovered.length,
	};
}
