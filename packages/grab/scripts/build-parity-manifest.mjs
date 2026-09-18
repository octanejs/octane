#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { format, resolveConfig } from 'prettier';

const root = resolve(import.meta.dirname, '../../..');

const sha256 = (file) =>
	createHash('sha256')
		.update(readFileSync(resolve(root, file)))
		.digest('hex');
const file = (path, role = 'support') => ({ path, role, sha256: sha256(path) });
const inventory = (name) =>
	JSON.parse(readFileSync(resolve(root, `packages/grab/audit/${name}-runtime.json`), 'utf8'));

const summarize = (inventories) => {
	const all = new Set();
	const laneCounts = new Map();
	let entries = 0;
	let duplicates = 0;
	for (const inv of inventories) {
		const laneIdentities = new Set();
		for (const test of inv.tests) {
			const identity = `${test.file} ${test.fullName}`;
			entries++;
			all.add(identity);
			laneIdentities.add(identity);
		}
		duplicates += inv.tests.length - laneIdentities.size;
		for (const identity of laneIdentities)
			laneCounts.set(identity, (laneCounts.get(identity) ?? 0) + 1);
	}
	return {
		inventoryEntries: entries,
		uniqueIdentities: all.size,
		duplicateEntriesWithinLanes: duplicates,
		identitiesSharedAcrossLanes: [...laneCounts.values()].filter((count) => count > 1).length,
	};
};

const adaptedInventory = inventory('adapted');
const pnpmVersion = `pnpm@${JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
	.packageManager.split('@')
	.at(-1)}`;

const manifest = {
	schemaVersion: 1,
	provenance: {
		repo: 'https://github.com/aidenybai/react-grab.git',
		version: '0.2.0',
		commit: '23bce0e56f2808902f1126ad581f6d8c3b5f639e',
		sourceRoot: 'packages/react-grab/src',
		testRoot: 'packages/react-grab/tests; packages/react-grab/e2e',
		license: 'MIT',
		integrity: `sha256:${sha256('packages/grab/upstream-artifact/react-grab-0.2.0.tgz')}`,
		verification: 'verified',
	},
	materializedTests: 'packages/grab',
	upstreamSuites: { runtime: 'present', types: 'absent' },
	adaptedRoots: {
		source: {
			roots: ['packages/grab/src'],
			include: ['\\.(?:[cm]?[jt]s|[jt]sx|tsrx)$'],
			exclude: [],
		},
		tests: {
			roots: ['packages/grab/tests/upstream'],
			include: ['\\.test\\.(?:ts|tsx|tsrx)$'],
			exclude: [],
		},
	},
	adaptedRuntimeSummary: summarize([adaptedInventory]),
	environments: {
		'workspace-node': {
			node: '>=22',
			platform: 'any',
			arch: 'any',
			packageManager: pnpmVersion,
			lockfile: 'pnpm-lock.yaml',
			lockfileSha256: sha256('pnpm-lock.yaml'),
		},
	},
	lanes: [
		{
			id: 'grab-pristine',
			type: 'pristine-upstream',
			oracle: 'required',
			environment: 'workspace-node',
			project: 'grab-pristine',
			evidenceOrigin: 'upstream-suite',
			notes:
				'Runs all 356 byte-exact pinned upstream unit cases (vite-plus/test aliased to vitest) against the materialized react-grab source.',
			execution: {
				kind: 'vitest-full',
				inventory: 'packages/grab/audit/pristine-runtime.json',
			},
			files: [
				file('packages/grab/audit/pristine-runtime.json'),
				file('packages/grab/audit/upstream.lock.json'),
				file('packages/grab/scripts/build-runtime-inventories.mjs'),
			],
		},
		{
			id: 'grab-adapted',
			type: 'adapted-octane',
			oracle: 'required',
			environment: 'workspace-node',
			project: 'grab',
			evidenceOrigin: 'upstream-suite',
			notes:
				'Runs the materialized upstream unit suite (356 cases under mechanical import rewrites) against the Octane binding source.',
			execution: {
				kind: 'vitest-full',
				inventory: 'packages/grab/audit/adapted-runtime.json',
			},
			files: [
				file('packages/grab/audit/adapted-runtime.json'),
				file('packages/grab/audit/upstream.lock.json'),
				file('packages/grab/tests/_setup.ts'),
				file('packages/grab/scripts/build-runtime-inventories.mjs'),
			],
		},
		{
			id: 'grab-differential',
			type: 'differential',
			oracle: 'required',
			environment: 'workspace-node',
			project: 'grab-differential',
			evidenceOrigin: 'repo-authored',
			notes:
				'Drives pinned react-grab and @octanejs/grab through the same scenarios (disabled init, lifecycle, DEFAULT_THEME, error classes, element-info formatting) and asserts identical observable results.',
			execution: {
				kind: 'vitest-full',
				inventory: 'packages/grab/audit/differential-runtime.json',
			},
			files: [
				file('packages/grab/audit/differential-runtime.json'),
				file('packages/grab/tests/differential/parity.test.ts'),
				file('packages/grab/tests/_setup.ts'),
			],
		},
		{
			id: 'grab-browser',
			type: 'browser',
			oracle: 'required',
			environment: 'workspace-node',
			project: 'grab-browser',
			notes:
				'Boots the real package (compiled .tsrx through the Octane Vite plugin) in headless Chromium and drives activation, selection, copy, and dispose with real input.',
			execution: {
				kind: 'vitest-full',
				inventory: 'packages/grab/audit/browser-runtime.json',
			},
			files: [
				file('packages/grab/audit/browser-runtime.json'),
				file('packages/grab/tests/browser/overlay.browser.test.ts'),
				file('packages/grab/tests/browser/harness/index.html'),
				file('packages/grab/tests/browser/harness/main.ts'),
			],
		},
		{
			id: 'grab-pristine-types',
			type: 'pristine-types',
			oracle: 'required',
			environment: 'workspace-node',
			project: 'grab-pristine-types',
			evidenceOrigin: 'repo-authored',
			notes:
				'Compiles the pinned upstream type surface through the repo-authored contract (upstream has no type test suite; upstreamSuites.types is absent).',
			execution: {
				kind: 'typescript',
				compiler: 'tsc',
				project: 'packages/grab/typetests/pristine/tsconfig.json',
			},
			files: [
				{
					path: 'packages/grab/typetests/pristine/pristine.ts',
					role: 'test',
					sha256: sha256('packages/grab/typetests/pristine/pristine.ts'),
					cases: [
						{
							id: 'types:pristine',
							testName: 'pinned upstream type contract',
							fullName: 'pinned upstream type contract',
						},
					],
				},
				file('packages/grab/typetests/pristine/upstream-contract.ts'),
				file('packages/grab/typetests/pristine/tsconfig.json'),
			],
		},
		{
			id: 'grab-adapted-types',
			type: 'adapted-types',
			oracle: 'required',
			environment: 'workspace-node',
			project: 'grab-adapted-types',
			evidenceOrigin: 'repo-authored',
			notes:
				'Compiles the Octane binding against the repo-authored upstream contract under tsrx-tsc.',
			execution: {
				kind: 'typescript',
				compiler: 'tsrx-tsc',
				project: 'packages/grab/typetests/adapted/tsconfig.json',
			},
			files: [
				{
					path: 'packages/grab/typetests/adapted/adapted.ts',
					role: 'test',
					sha256: sha256('packages/grab/typetests/adapted/adapted.ts'),
					cases: [
						{
							id: 'types:adapted',
							testName: 'adapted binding type contract',
							fullName: 'adapted binding type contract',
						},
					],
				},
				file('packages/grab/typetests/adapted/tsconfig.json'),
			],
		},
	],
	divergences: [],
};

const destination = resolve(root, 'packages/grab/audit/react-parity.json');
writeFileSync(
	destination,
	await format(JSON.stringify(manifest), {
		...(await resolveConfig(destination, { editorconfig: true })),
		filepath: destination,
	}),
);
console.log('packages/grab/audit/react-parity.json written');
