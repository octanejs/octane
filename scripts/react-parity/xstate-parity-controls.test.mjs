// Negative controls for the @octanejs/xstate and @octanejs/xstate-store parity
// evidence. A green port suite proves behavior only if the evidence collector is
// itself known to fail closed, so each case below breaks one piece of the
// evidence chain and asserts that the generic harness rejects it.
//
// These exercise the shared validator in harness-lib.mjs rather than a
// binding-specific verifier, so they also guard the machinery every other
// binding's manifest depends on.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { loadManifest, verifyManifestFiles } from './harness-lib.mjs';
import { verifyXstateStoreTypes, verifyXstateTypes } from './xstate-types-lib.mjs';
import { verifyXstateUpstream } from '../../packages/xstate/scripts/verify-upstream.mjs';
import { verifyXstateStoreUpstream } from '../../packages/xstate-store/scripts/verify-upstream.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const XSTATE_MANIFEST = 'packages/xstate/audit/react-parity.json';
const STORE_MANIFEST = 'packages/xstate-store/audit/react-parity.json';

function read(relativePath) {
	return readFileSync(join(REPO, relativePath), 'utf8');
}

// Rewrites a repository file for the duration of `body`, then restores the
// original bytes whether or not the assertion held.
async function withFileContents(relativePath, next, body) {
	const absolute = join(REPO, relativePath);
	const original = readFileSync(absolute, 'utf8');
	try {
		writeFileSync(absolute, typeof next === 'function' ? next(original) : next);
		await body();
	} finally {
		writeFileSync(absolute, original);
	}
}

async function assertManifestRejects(manifestPath, pattern) {
	await assert.rejects(async function loadAndVerify() {
		const manifest = await loadManifest(join(REPO, manifestPath));
		await verifyManifestFiles(manifest, REPO);
	}, pattern);
}

// Tampering with an evidence file trips the sha256 gate first, which only proves
// the outer defense. The interesting attack is an edit whose digests were
// dutifully regenerated: these helpers rewrite the file AND its recorded hash,
// so the assertion below reaches the semantic gate and shows that fresh hashes
// alone do not buy a green harness.
function rehashManifest(manifestSource, relativePath, digest) {
	const manifest = JSON.parse(manifestSource);
	for (const lane of manifest.lanes) {
		for (const file of lane.files) {
			if (file.path === relativePath) file.sha256 = digest;
		}
	}
	for (const divergence of manifest.divergences) {
		for (const evidence of divergence.ordinaryEvidence ?? []) {
			if (evidence.path === relativePath) evidence.sha256 = digest;
		}
	}
	return `${JSON.stringify(manifest, null, 2)}\n`;
}

async function withRehashedEvidence(manifestPath, relativePath, mutate, body) {
	const absolute = join(REPO, relativePath);
	const manifestAbsolute = join(REPO, manifestPath);
	const originalFile = readFileSync(absolute, 'utf8');
	const originalManifest = readFileSync(manifestAbsolute, 'utf8');
	try {
		const mutated = mutate(originalFile);
		writeFileSync(absolute, mutated);
		writeFileSync(
			manifestAbsolute,
			rehashManifest(
				originalManifest,
				relativePath,
				createHash('sha256').update(mutated).digest('hex'),
			),
		);
		await body();
	} finally {
		writeFileSync(absolute, originalFile);
		writeFileSync(manifestAbsolute, originalManifest);
	}
}

test('committed xstate evidence passes the generic manifest verifier', async () => {
	for (const manifestPath of [XSTATE_MANIFEST, STORE_MANIFEST]) {
		const manifest = await loadManifest(join(REPO, manifestPath));
		assert.equal(await verifyManifestFiles(manifest, REPO), true);
	}
});

test('every adapted xstate identity is an unmodified upstream identity', () => {
	const pristine = JSON.parse(read('packages/xstate/audit/pristine-runtime.json'));
	const adapted = JSON.parse(read('packages/xstate/audit/adapted-runtime.json'));
	const pristineNames = new Set(pristine.tests.map((entry) => entry.fullName));
	const unmatched = adapted.tests
		.map((entry) => entry.fullName)
		.filter((fullName) => !pristineNames.has(fullName));
	assert.deepEqual(
		unmatched,
		[],
		`adapted cases with no pristine counterpart:\n${unmatched.join('\n')}`,
	);
});

test('the adapted xstate suite covers every applicable pristine identity', () => {
	const pristine = JSON.parse(read('packages/xstate/audit/pristine-runtime.json'));
	const adapted = JSON.parse(read('packages/xstate/audit/adapted-runtime.json'));
	const adaptedNames = new Set(adapted.tests.map((entry) => entry.fullName));
	// The strict pass is not applicable (Octane has no StrictMode double-invoke)
	// and types.test.tsx is evidence for the type lanes, not the runtime lane.
	const applicable = pristine.tests.filter(
		(entry) => !entry.fullName.includes('(strict)') && !entry.file.endsWith('types.test.tsx'),
	);
	const missing = applicable
		.map((entry) => entry.fullName)
		.filter((fullName) => !adaptedNames.has(fullName));
	assert.deepEqual(
		missing,
		[],
		`pristine identities absent from the adapted suite:\n${missing.join('\n')}`,
	);
	assert.equal(adapted.tests.length, applicable.length);
});

test('every adapted xstate-store identity is an unmodified upstream identity', () => {
	const pristine = JSON.parse(read('packages/xstate-store/audit/pristine-runtime.json'));
	const adapted = JSON.parse(read('packages/xstate-store/audit/adapted-runtime.json'));
	const adaptedNames = new Set(adapted.tests.map((entry) => entry.fullName));
	// The store suite is not parametrized over React modes, so the only pristine
	// identities outside the runtime lane are its type tests.
	const applicable = pristine.tests.filter((entry) => !entry.file.endsWith('types.test.tsx'));
	const missing = applicable
		.map((entry) => entry.fullName)
		.filter((fullName) => !adaptedNames.has(fullName));
	assert.deepEqual(
		missing,
		[],
		`pristine identities absent from the adapted suite:\n${missing.join('\n')}`,
	);
	assert.equal(adapted.tests.length, applicable.length);
});

test('a removed adapted case fails manifest verification even with fresh hashes', async () => {
	await withRehashedEvidence(
		XSTATE_MANIFEST,
		'packages/xstate/audit/adapted-runtime.json',
		(original) => {
			const inventory = JSON.parse(original);
			inventory.tests = inventory.tests.slice(1);
			return `${JSON.stringify(inventory, null, 2)}\n`;
		},
		() => assertManifestRejects(XSTATE_MANIFEST, /adapted runtime inventory summary drifted/),
	);
});

test('a renamed adapted case breaks the upstream identity crosswalk', () => {
	const pristine = JSON.parse(read('packages/xstate/audit/pristine-runtime.json'));
	const adapted = JSON.parse(read('packages/xstate/audit/adapted-runtime.json'));
	const pristineNames = new Set(pristine.tests.map((entry) => entry.fullName));
	const renamed = adapted.tests.map((entry, index) =>
		index === 0 ? { ...entry, fullName: `${entry.fullName} (renamed)` } : entry,
	);
	const unmatched = renamed
		.map((entry) => entry.fullName)
		.filter((fullName) => !pristineNames.has(fullName));
	assert.equal(unmatched.length, 1, 'renaming a case must break its upstream counterpart');
});

test('a skipped adapted file fails manifest verification even with fresh hashes', async () => {
	await withRehashedEvidence(
		XSTATE_MANIFEST,
		'packages/xstate/audit/adapted-runtime.json',
		(original) => {
			const inventory = JSON.parse(original);
			const dropped = inventory.files[0];
			inventory.files = inventory.files.slice(1);
			inventory.tests = inventory.tests.filter((entry) => entry.file !== dropped);
			return `${JSON.stringify(inventory, null, 2)}\n`;
		},
		() =>
			assertManifestRejects(
				XSTATE_MANIFEST,
				/adapted test roots drifted from the union of full-suite inventories|adapted runtime inventory summary drifted/,
			),
	);
});

test('a tampered lane evidence file fails manifest verification', async () => {
	await withFileContents(
		'packages/xstate/tests/_fixtures/upstream/utils.ts',
		(original) => `${original}\n// drift\n`,
		() => assertManifestRejects(XSTATE_MANIFEST, /integrity mismatch for evidence file/),
	);
});

test('a stale SHA256SUMS entry fails the vendored-byte verifier', async () => {
	for (const [sumsPath, verify, packageDir] of [
		['packages/xstate/upstream/SHA256SUMS', verifyXstateUpstream, 'packages/xstate'],
		[
			'packages/xstate-store/upstream/SHA256SUMS',
			verifyXstateStoreUpstream,
			'packages/xstate-store',
		],
	]) {
		await withFileContents(
			sumsPath,
			(original) => original.replace(/^[0-9a-f]{64}/m, '0'.repeat(64)),
			() => {
				assert.throws(function verifyDrifted() {
					verify(join(REPO, packageDir));
				});
			},
		);
	}
});

test('dropping a divergence marker fails manifest verification', async () => {
	await withFileContents(
		'packages/xstate/src/useSyncExternalStoreWithSelector.ts',
		(original) =>
			original.replace(
				/^\t*\/\/ OCTANE DIVERGENCE\[xstate-sync-external-store-commit-reread\]\[[^\]]+\]\n/m,
				'',
			),
		() =>
			assertManifestRejects(
				XSTATE_MANIFEST,
				/divergence xstate-sync-external-store-commit-reread has no structured source or test marker/,
			),
	);
});

test('an unbound divergence marker fails manifest verification', async () => {
	await withFileContents(
		'packages/xstate/src/useSyncExternalStoreWithSelector.ts',
		(original) =>
			original.replace(
				/OCTANE DIVERGENCE\[xstate-sync-external-store-commit-reread\]\[[^\]]+\]/,
				'OCTANE DIVERGENCE[xstate-sync-external-store-commit-reread]',
			),
		() => assertManifestRejects(XSTATE_MANIFEST, /divergence markers must bind a declared case id/),
	);
});

test('removing an ordinary-evidence parity marker fails manifest verification even with fresh hashes', async () => {
	await withRehashedEvidence(
		XSTATE_MANIFEST,
		'packages/xstate/tests/conformance/divergences.test.ts',
		(original) =>
			original.replace(
				/^\t*\/\/ @parity-case ordinary:xstate-sync-external-store-skips-commit-reread\n/m,
				'',
			),
		() => assertManifestRejects(XSTATE_MANIFEST, /@parity-case .* must appear exactly once/),
	);
});

test('renaming an evidenced differential case fails manifest verification even with fresh hashes', async () => {
	await withRehashedEvidence(
		XSTATE_MANIFEST,
		'packages/xstate/tests/differential/parity.test.ts',
		(original) =>
			original.replace(
				"it('useMachine: state transitions are byte-identical'",
				"it('useMachine: state transitions are byte-identical (renamed)'",
			),
		() => assertManifestRejects(XSTATE_MANIFEST, /must immediately precede one active test named/),
	);
});

// The type suites are compiled, never executed, so their accept/reject result is
// the assertion. That makes their evidence chain the easiest to weaken silently:
// a deleted case still compiles, and a dropped `@ts-expect-error` turns a
// negative assertion into a passing positive one. Each control below performs
// exactly that weakening and requires the verifier to catch it.
const XSTATE_ADAPTED_TYPES = 'packages/xstate/typetests/types.test-d.tsx';
const STORE_ADAPTED_TYPES = 'packages/xstate-store/typetests/types.test-d.tsx';

test('committed type suites pass the type parity verifier', () => {
	assert.equal(verifyXstateTypes(REPO).expectErrors, 3);
	assert.equal(verifyXstateStoreTypes(REPO).expectErrors, 13);
});

test('removing a @ts-expect-error marker fails type parity', async () => {
	await withFileContents(
		STORE_ADAPTED_TYPES,
		(original) => original.replace(/^\s*\/\/ @ts-expect-error[^\n]*\n/m, ''),
		() => {
			assert.throws(function verifyStripped() {
				verifyXstateStoreTypes(REPO);
			}, /undeclared structural change/);
		},
	);
});

test('deleting a type assertion fails type parity', async () => {
	await withFileContents(
		XSTATE_ADAPTED_TYPES,
		(original) => original.replace(/^.*const bar: number = current\.context\.bar;\n/m, ''),
		() => {
			assert.throws(function verifyDeleted() {
				verifyXstateTypes(REPO);
			}, /undeclared structural change/);
		},
	);
});

test('a skipped type suite fails type parity', async () => {
	// A gutted suite still compiles clean, which is exactly why the compiler's
	// exit code cannot be the only evidence. It is rejected here because the
	// transformation ledger's adapted line no longer exists in the file.
	await withFileContents(XSTATE_ADAPTED_TYPES, '// intentionally emptied\n', () => {
		assert.throws(function verifyEmptied() {
			verifyXstateTypes(REPO);
		}, /declares an adapted line that is not present|undeclared structural change/);
	});
});

test('an undeclared transformation fails type parity', async () => {
	await withFileContents(
		XSTATE_ADAPTED_TYPES,
		(original) => original.replace("from 'xstate';", "from 'xstate/dist/index.js';"),
		() => {
			assert.throws(function verifyRetargeted() {
				verifyXstateTypes(REPO);
			}, /undeclared structural change/);
		},
	);
});

test('a stale type inventory fails type parity', async () => {
	await withFileContents(
		'packages/xstate/audit/adapted-types.json',
		(original) => {
			const inventory = JSON.parse(original);
			inventory[0].assertionGroups = inventory[0].assertionGroups.slice(1);
			return `${JSON.stringify(inventory, null, 2)}\n`;
		},
		() => {
			assert.throws(function verifyStale() {
				verifyXstateTypes(REPO);
			}, /is stale; regenerate the xstate type inventories/);
		},
	);
});

test('an executable line smuggled into the adapted header fails type parity', async () => {
	await withFileContents(
		XSTATE_ADAPTED_TYPES,
		(original) => `const smuggled = 1;\n${original}`,
		() => {
			assert.throws(function verifySmuggled() {
				verifyXstateTypes(REPO);
			}, /undeclared structural change|adapted header must contain only comments/);
		},
	);
});
