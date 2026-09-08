import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { verifyReactSpringTypes } from './react-spring-types-lib.mjs';

const ROOT = 'packages/spring/upstream';
const PER_COMMENT = /^\s*\/\/\s*Per\s+(\S+):(\d+)\s*$/;
const ALLOWED_DISPOSITIONS = new Set([
	'adapted',
	'adapted-types',
	'reused-dependency',
	'awaiting-adaptation',
]);

function filesUnder(root) {
	return readdirSync(root, { recursive: true, withFileTypes: true })
		.filter(function keepFiles(entry) {
			return entry.isFile();
		})
		.map(function toPath(entry) {
			return join(entry.parentPath ?? entry.path, entry.name);
		});
}

function digest(path) {
	return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function collectPerComments(source) {
	const comments = [];
	for (const line of source.split('\n')) {
		const match = PER_COMMENT.exec(line);
		if (match !== null) {
			comments.push({ path: match[1], line: match[2] ? Number(match[2]) : null });
		}
	}
	return comments;
}

function loadInventory(repoRoot, inventoryPath) {
	const absolute = join(repoRoot, inventoryPath);
	if (!existsSync(absolute)) {
		throw new Error(`runtime inventory is missing: ${inventoryPath}`);
	}
	const inventory = JSON.parse(readFileSync(absolute, 'utf8'));
	if (!Array.isArray(inventory.tests) || inventory.tests.length === 0) {
		throw new Error(`runtime inventory has no case identities: ${inventoryPath}`);
	}
	return inventory;
}

export function verifyReactSpringVendoredBytes(repoRoot) {
	const root = join(repoRoot, ROOT);
	// The committed upstream/ tree verifies offline against the upstream git
	// blob shas in audit/upstream.lock.json.
	// Resolve the materialize CLI from this module's real location so sandboxed
	// repoRoot copies (negative-control fixtures) still verify offline.
	const materialize = fileURLToPath(new URL('../react-port/materialize.mjs', import.meta.url));
	execFileSync(
		process.execPath,
		['--', materialize, 'run', '--check', '--package-dir', join(repoRoot, 'packages/spring')],
		{ stdio: 'pipe' },
	);
	const lockPath = join(repoRoot, 'packages/spring/audit/upstream.lock.json');
	const actual = filesUnder(root)
		.map(function relativePath(path) {
			return relative(root, path).replaceAll('\\', '/');
		})
		.sort();
	return { files: actual.length, checksum: digest(lockPath), testFiles: actual };
}

export function verifyReactSpringUpstream(repoRoot) {
	verifyReactSpringTypes(repoRoot);

	const vendored = verifyReactSpringVendoredBytes(repoRoot);
	const testFiles = vendored.testFiles
		.filter(function isTest(path) {
			return /\.test(?:-d)?\.tsx?$/.test(path);
		})
		.sort();

	const required = [
		'LICENSE',
		'packages/animated/src/createHost.ts',
		'packages/core/src/index.ts',
		'packages/core/src/SpringValue.test.ts',
		'packages/parallax/src/index.tsx',
		'packages/shared/src/index.ts',
		'packages/types/src/index.ts',
		'targets/web/src/index.ts',
		'targets/web/src/animated.test.tsx',
	];
	for (const path of required) {
		if (!vendored.testFiles.includes(path) && !existsSync(join(repoRoot, ROOT, path))) {
			throw new Error(`required upstream boundary is missing: ${path}`);
		}
	}

	const manifestPath = join(repoRoot, 'packages/spring/audit/react-parity.json');
	if (!existsSync(manifestPath)) {
		throw new Error('react-parity manifest is missing');
	}
	const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
	if (
		manifest.upstreamSuites?.runtime !== 'present' ||
		manifest.upstreamSuites?.types !== 'present'
	) {
		throw new Error(
			'react-parity manifest must record present upstream runtime and type suites for the vendored pin',
		);
	}

	const pristineLane = manifest.lanes.find(function findPristine(lane) {
		return (
			lane.type === 'pristine-upstream' &&
			lane.execution?.kind === 'vitest-full' &&
			lane.oracle === 'required' &&
			lane.evidenceOrigin === 'upstream-suite'
		);
	});
	if (pristineLane === undefined) {
		throw new Error('react-parity manifest lacks a required pristine-upstream vitest-full lane');
	}
	const pristineCaseInventoryPath = 'packages/spring/audit/pristine-runtime.json';
	const pristineInventory = loadInventory(repoRoot, pristineCaseInventoryPath);

	const adaptedLane = manifest.lanes.find(function findAdapted(lane) {
		return (
			lane.type === 'adapted-octane' &&
			lane.execution?.kind === 'vitest-full' &&
			lane.oracle === 'required' &&
			lane.evidenceOrigin === 'upstream-suite'
		);
	});
	if (adaptedLane === undefined) {
		throw new Error('react-parity manifest lacks a required adapted-octane vitest-full lane');
	}
	const adaptedInventory = loadInventory(repoRoot, adaptedLane.execution.inventory);
	const adaptedByKey = new Map(
		adaptedInventory.tests.map(function entry(test) {
			return [`${test.file}\0${test.fullName}`, test];
		}),
	);

	const dispositionsPath = join(repoRoot, 'packages/spring/audit/upstream-case-dispositions.json');
	if (!existsSync(dispositionsPath)) throw new Error('upstream case dispositions are missing');
	const dispositionsDoc = JSON.parse(readFileSync(dispositionsPath, 'utf8'));
	if (!Array.isArray(dispositionsDoc.cases) || dispositionsDoc.cases.length === 0) {
		throw new Error('upstream case dispositions has no case identities');
	}

	const pristineKeys = new Set(
		pristineInventory.tests.map(function keyOf(test) {
			return `${test.file.replace(/^packages\/spring\/upstream\//, '')}\0${test.fullName}`;
		}),
	);
	const dispositionKeys = new Set();
	for (const entry of dispositionsDoc.cases) {
		if (!ALLOWED_DISPOSITIONS.has(entry.disposition)) {
			throw new Error(`invalid upstream case disposition: ${entry.disposition}`);
		}
		if (typeof entry.upstreamFile !== 'string' || typeof entry.upstreamFullName !== 'string') {
			throw new Error('upstream case disposition is missing upstream identity fields');
		}
		const key = `${entry.upstreamFile}\0${entry.upstreamFullName}`;
		if (dispositionKeys.has(key)) {
			throw new Error(`duplicate upstream case disposition: ${key}`);
		}
		dispositionKeys.add(key);
		if (!pristineKeys.has(key) && entry.disposition !== 'adapted-types') {
			throw new Error(`case disposition is not present in pristine inventory: ${key}`);
		}

		if (entry.disposition === 'adapted') {
			if (typeof entry.adaptedFile !== 'string' || typeof entry.adaptedFullName !== 'string') {
				throw new Error(`adapted disposition lacks adapted identity: ${key}`);
			}
			const adaptedKey = `${entry.adaptedFile}\0${entry.adaptedFullName}`;
			if (!adaptedByKey.has(adaptedKey)) {
				throw new Error(
					`adapted disposition points at a missing adapted inventory identity: ${key} -> ${adaptedKey}`,
				);
			}
			const evidencePath = join(repoRoot, entry.adaptedFile);
			if (!existsSync(evidencePath)) {
				throw new Error(`adapted evidence is missing: ${entry.adaptedFile}`);
			}
			const source = readFileSync(evidencePath, 'utf8');
			const perComments = collectPerComments(source);
			if (perComments.length === 0) {
				throw new Error(`adapted evidence lacks // Per provenance: ${entry.adaptedFile}`);
			}
			const citesUpstream = perComments.some(function cites(comment) {
				return comment.path === entry.upstreamFile;
			});
			if (!citesUpstream) {
				throw new Error(
					`adapted evidence does not cite upstream case ${entry.upstreamFile}: ${entry.adaptedFile}`,
				);
			}
			const skippedIts = [...source.matchAll(/^\s*it\.(skip|todo)\s*\(/gm)].length;
			if (skippedIts > 0) {
				throw new Error(`adapted evidence contains skipped cases: ${entry.adaptedFile}`);
			}
			if (
				!source.includes(entry.adaptedFullName.split(' ').at(-1) ?? '') &&
				!source.includes(entry.adaptedFullName)
			) {
				// Prefer exact title token presence for the leaf it() name.
				const leaf = entry.adaptedFullName.split(' ').at(-1) ?? '';
				if (leaf.length > 0 && !source.includes(leaf.replaceAll('"', ''))) {
					throw new Error(
						`adapted evidence is missing adapted case title: ${entry.adaptedFile} -> ${entry.adaptedFullName}`,
					);
				}
			}
		} else if (entry.disposition === 'reused-dependency') {
			if (!Array.isArray(entry.evidence) || entry.evidence.length === 0) {
				throw new Error(`reused-dependency disposition lacks evidence: ${key}`);
			}
			for (const evidence of entry.evidence) {
				if (!existsSync(join(repoRoot, 'packages/spring', evidence))) {
					throw new Error(`reused-dependency evidence is missing: ${key} -> ${evidence}`);
				}
			}
		} else if (entry.disposition === 'awaiting-adaptation') {
			if (typeof entry.reason !== 'string' || entry.reason.trim().length === 0) {
				throw new Error(`awaiting-adaptation disposition lacks reason: ${key}`);
			}
		}
	}

	for (const key of pristineKeys) {
		if (!dispositionKeys.has(key)) {
			throw new Error(`pristine identity lacks a case disposition: ${key}`);
		}
	}

	// Negative control: every upstream runtime/type test file must appear in at least one disposition.
	const dispositionFiles = new Set(
		dispositionsDoc.cases.map(function fileOf(entry) {
			return entry.upstreamFile;
		}),
	);
	for (const path of testFiles) {
		if (
			!dispositionFiles.has(path) &&
			!path.endsWith('.test-d.ts') &&
			!path.endsWith('.test-d.tsx')
		) {
			// Runtime files must be covered via pristine identities; type files are covered by type lanes.
			const runtimeCovered = [...pristineKeys].some(function hasFile(key) {
				return key.startsWith(`${path}\0`);
			});
			if (!runtimeCovered && /\.test\.tsx?$/.test(path)) {
				throw new Error(`upstream runtime test file has no pristine identities: ${path}`);
			}
		}
	}

	const runtimeSource = filesUnder(join(repoRoot, 'packages/spring/src'));
	for (const path of runtimeSource) {
		if (/from\s+['"](?:react|react-dom)(?:\/|['"])/.test(readFileSync(path, 'utf8'))) {
			throw new Error(`React import leaked into published source: ${relative(repoRoot, path)}`);
		}
	}

	return {
		files: vendored.files,
		checksum: vendored.checksum,
		pristineCases: pristineInventory.tests.length,
		adaptedCases: adaptedInventory.tests.length,
		caseDispositions: dispositionsDoc.cases.length,
	};
}
