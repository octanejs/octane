import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

const CONFIG = 'packages/vaul/audit/test-classifications.json';
const MANIFEST = 'packages/vaul/audit/react-parity.json';
const VITEST_CONFIG = 'vitest.config.js';
const DISPOSITIONS = new Set([
	'adapted-upstream-suite',
	'react-octane-differential',
	'octane-only-divergence',
	'octane-only-framework-contract',
	'audit-verifier',
]);
const TYPE_TEST_ROOT = 'packages/vaul/tests/types/';
const AUDIT_TEST_ROOT = 'scripts/react-parity/';

function toPortablePath(root, absolutePath) {
	return relative(root, absolutePath).split(sep).join('/');
}

function discoverPortAuthoredVaulTests(root) {
	const testsRoot = resolve(root, 'packages/vaul/tests');
	const discovered = readdirSync(testsRoot, { recursive: true, withFileTypes: true })
		.filter(function keepClassifiedFiles(entry) {
			if (!entry.isFile()) return false;
			const absolute = resolve(entry.parentPath ?? entry.path, entry.name);
			const portable = toPortablePath(root, absolute);
			if (portable.includes('/tests/upstream/') || portable.includes('/.pristine-upstream-')) {
				return false;
			}
			if (/\.test\.(?:ts|tsx|tsrx)$/.test(entry.name)) return true;
			return portable.startsWith(TYPE_TEST_ROOT) && portable.endsWith('.ts');
		})
		.map(function toPortable(entry) {
			return toPortablePath(root, resolve(entry.parentPath ?? entry.path, entry.name));
		});
	const auditRoot = resolve(root, AUDIT_TEST_ROOT);
	if (existsSync(auditRoot)) {
		for (const entry of readdirSync(auditRoot, { withFileTypes: true })) {
			if (!entry.isFile()) continue;
			if (!/^vaul-.*\.test\.mjs$/.test(entry.name)) continue;
			discovered.push(toPortablePath(root, resolve(auditRoot, entry.name)));
		}
	}
	return discovered.sort();
}

function readVaulParityOwnedPaths(root) {
	const source = readFileSync(resolve(root, VITEST_CONFIG), 'utf8');
	const owned = new Set();
	const projectBlocks = [
		{ name: 'vaul', whollyOwned: false },
		{ name: 'vaul-differential', whollyOwned: true },
		{ name: 'vaul-browser', whollyOwned: true },
	];
	for (const project of projectBlocks) {
		const marker = `name: '${project.name}'`;
		const nameIndex = source.indexOf(marker);
		if (nameIndex === -1) continue;
		const before = source.slice(0, nameIndex);
		const executionIndex = before.lastIndexOf('testExecution:');
		if (executionIndex === -1) continue;
		const executionBlock = before.slice(executionIndex, nameIndex);
		if (!/testExecution:\s*\{[\s\S]*\}\s*,\s*test:\s*\{\s*$/.test(executionBlock)) {
			continue;
		}
		const includeMatch = executionBlock.match(/include:\s*\[([\s\S]*?)\]/);
		if (includeMatch) {
			for (const match of includeMatch[1].matchAll(/'([^']+)'/g)) {
				owned.add(match[1]);
			}
			continue;
		}
		if (project.whollyOwned || /group:\s*'react-parity'/.test(executionBlock)) {
			const testBlock = source.slice(nameIndex);
			const projectInclude = testBlock.match(/include:\s*\[([\s\S]*?)\]/);
			if (!projectInclude) continue;
			for (const match of projectInclude[1].matchAll(/'([^']+)'/g)) {
				const pattern = match[1];
				if (pattern.startsWith('!')) continue;
				if (pattern.includes('*')) {
					owned.add(pattern);
				} else {
					owned.add(pattern);
				}
			}
		}
	}
	return [...owned];
}

function pathOwnedByParity(path, ownedPaths) {
	if (ownedPaths === null) {
		return (
			path.startsWith('packages/vaul/tests/') &&
			path.endsWith('.test.ts') &&
			!path.includes('/tests/ssr/') &&
			!path.includes('/tests/browser-conformance/')
		);
	}
	if (ownedPaths.includes(path)) return true;
	return ownedPaths.some(function matchesGlob(pattern) {
		if (!pattern.includes('*')) return false;
		const escaped = pattern
			.replace(/[.+^${}()|[\]\\]/g, '\\$&')
			.replace(/\*\*/g, '::DOUBLE::')
			.replace(/\*/g, '[^/]*')
			.replace(/::DOUBLE::/g, '.*');
		return new RegExp(`^${escaped}$`).test(path);
	});
}

export function verifyVaulTestClassifications(root) {
	const discovered = discoverPortAuthoredVaulTests(root);
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
		throw new Error('every port-authored vaul test must have exactly one classification');
	}
	const ownedPaths = readVaulParityOwnedPaths(root);
	for (const entry of config.tests) {
		if (!DISPOSITIONS.has(entry.disposition))
			throw new Error(`${entry.path}: unknown test disposition`);
		if (entry.disposition === 'audit-verifier') {
			if (!entry.path.startsWith(AUDIT_TEST_ROOT)) {
				throw new Error(`${entry.path}: audit-verifier tests must live under ${AUDIT_TEST_ROOT}`);
			}
			if (entry.oracle) {
				throw new Error(`${entry.path}: audit-verifier tests must not claim React parity`);
			}
			if (!entry.reason) {
				throw new Error(`${entry.path}: audit-verifier tests require an explicit reason`);
			}
			continue;
		}
		if (entry.disposition.startsWith('octane-only-')) {
			if (!entry.reason)
				throw new Error(`${entry.path}: Octane-only tests require an explicit reason`);
			if (entry.oracle)
				throw new Error(`${entry.path}: Octane-only tests must not claim React parity`);
			if (pathOwnedByParity(entry.path, ownedPaths)) {
				throw new Error(
					`${entry.path}: Octane-only framework/package contracts must not be owned by a react-parity lane`,
				);
			}
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
