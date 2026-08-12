#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const sha = (path) =>
	createHash('sha256')
		.update(readFileSync(resolve(root, path)))
		.digest('hex');
const file = (path, role = 'support', cases) => ({
	path,
	role,
	sha256: sha(path),
	...(cases ? { cases } : {}),
});
const typeCase = (id, fullName) => [{ id, testName: fullName, fullName }];
const adaptedRuntime = JSON.parse(
	readFileSync(resolve(root, 'packages/swr/audit/adapted-runtime.json'), 'utf8'),
);
const typeLane = ({
	id,
	type,
	project,
	compiler,
	caseId,
	fullName,
	evidenceOrigin = 'upstream-suite',
}) => ({
	id,
	type,
	oracle: 'required',
	environment: 'workspace-node',
	project: id,
	evidenceOrigin,
	execution: { kind: 'typescript', compiler, project },
	files: [
		file('packages/swr/audit/type-inventory.json', 'test', typeCase(caseId, fullName)),
		file(project),
	],
});

const manifest = {
	$schema: './react-parity.schema.json',
	schemaVersion: 1,
	provenance: {
		repo: 'https://github.com/vercel/swr.git',
		version: '2.4.2',
		commit: 'f1c1fd855f1e9e7c85755e4232ea4b03c7f81910',
		sourceRoot: 'src',
		testRoot: 'test',
		license: 'MIT',
		integrity: 'sha256:948ad899c51e73ca9555e8182946978f367410406fe6c2acb4d1012c509c9982',
		verification: 'recorded-unverified',
	},
	upstreamSuites: { runtime: 'present', types: 'present' },
	adaptedRoots: {
		source: {
			roots: ['packages/swr/src'],
			include: ['\\.(?:[cm]?[jt]s|[jt]sx|tsrx)$'],
			exclude: [],
		},
		tests: {
			roots: ['packages/swr/tests/upstream'],
			include: ['\\.test\\.ts$'],
			exclude: [],
		},
	},
	adaptedRuntimeSummary: {
		inventoryEntries: adaptedRuntime.tests.length,
		uniqueIdentities: new Set(adaptedRuntime.tests.map((test) => `${test.file}\0${test.fullName}`))
			.size,
		duplicateEntriesWithinLanes: 0,
		identitiesSharedAcrossLanes: 0,
	},
	environments: {
		'workspace-node': {
			node: '>=22',
			platform: 'any',
			arch: 'any',
			packageManager: 'pnpm@11.15.1',
			lockfile: 'pnpm-lock.yaml',
			lockfileSha256: sha('pnpm-lock.yaml'),
		},
	},
	lanes: [
		{
			id: 'swr-pristine-upstream',
			type: 'pristine-upstream',
			oracle: 'required',
			environment: 'workspace-node',
			project: 'swr-pristine',
			evidenceOrigin: 'upstream-suite',
			execution: {
				kind: 'jest-full',
				config: 'packages/swr/audit/jest-pristine.config.mjs',
				root: 'packages/swr/upstream',
				inventory: 'packages/swr/audit/pristine-runtime.json',
			},
			files: [
				file('packages/swr/audit/pristine-runtime.json'),
				file('packages/swr/audit/jest-pristine.config.mjs'),
				file('packages/swr/upstream/SHA256SUMS'),
				file('scripts/react-parity/jest-full-runner.mjs'),
				file('scripts/react-parity/swr-runtime-inventory.mjs'),
			],
		},
		typeLane({
			id: 'swr-pristine-runtime-types',
			type: 'pristine-types',
			project: 'packages/swr/audit/tsconfig-pristine-runtime.json',
			compiler: 'tsc',
			caseId: 'types:pristine-runtime',
			fullName: 'pinned upstream runtime TypeScript project',
		}),
		typeLane({
			id: 'swr-pristine-public-types',
			type: 'pristine-types',
			project: 'packages/swr/audit/tsconfig-pristine-types.json',
			compiler: 'tsc',
			caseId: 'types:pristine-public',
			fullName: 'pinned upstream public TypeScript project',
		}),
		typeLane({
			id: 'swr-pristine-suspense-types',
			type: 'pristine-types',
			project: 'packages/swr/audit/tsconfig-pristine-suspense.json',
			compiler: 'tsc',
			caseId: 'types:pristine-suspense',
			fullName: 'pinned upstream Suspense TypeScript project',
		}),
		typeLane({
			id: 'swr-adapted-internal-types',
			type: 'adapted-types',
			project: 'packages/swr/typetests/internal/tsconfig.json',
			compiler: 'tsrx-tsc',
			caseId: 'types:adapted-internal',
			fullName: 'adapted Octane internal TypeScript project',
			evidenceOrigin: 'repo-authored',
		}),
		typeLane({
			id: 'swr-adapted-root-types',
			type: 'adapted-types',
			project: 'packages/swr/typetests/root/tsconfig.json',
			compiler: 'tsrx-tsc',
			caseId: 'types:adapted-root',
			fullName: 'adapted Octane root TypeScript project',
			evidenceOrigin: 'repo-authored',
		}),
		typeLane({
			id: 'swr-adapted-specialized-types',
			type: 'adapted-types',
			project: 'packages/swr/typetests/specialized/tsconfig.json',
			compiler: 'tsrx-tsc',
			caseId: 'types:adapted-specialized',
			fullName: 'adapted Octane specialized TypeScript project',
			evidenceOrigin: 'repo-authored',
		}),
		{
			id: 'swr-adapted-selected-cases',
			type: 'adapted-octane',
			oracle: 'required',
			environment: 'workspace-node',
			project: 'swr',
			evidenceOrigin: 'repo-authored',
			notes:
				'Selected adapted Octane cases with upstream citations; not a one-for-one map of the 367 pristine identities. Exhaustive dispositions remain required before verified provenance.',
			execution: { kind: 'vitest-full', inventory: 'packages/swr/audit/adapted-runtime.json' },
			files: [
				file('packages/swr/audit/adapted-runtime.json'),
				file('scripts/react-parity/swr-runtime-inventory.mjs'),
				file('vitest.config.js'),
			],
		},
		{
			id: 'swr-differential',
			type: 'differential',
			oracle: 'required',
			environment: 'workspace-node',
			project: 'swr-differential',
			evidenceOrigin: 'repo-authored',
			notes:
				'Direct Octane-vs-pinned-upstream traces and export oracles for U2–U4; kept in a dedicated Vitest project so they do not share ownership with the adapted selected-case suite. Octane-only request-state oracles live under tests/unit/.',
			files: [
				file('packages/swr/tests/differential/cache.test.ts', 'test', [
					{
						id: 'differential:cache-serialize',
						testName: 'matches the pinned serialization and config oracle',
						fullName:
							'SWR U2 React/Octane differential traces matches the pinned serialization and config oracle',
					},
					{
						id: 'differential:cache-trace',
						testName: 'matches cache snapshots and callback logs',
						fullName:
							'SWR U2 React/Octane differential traces matches cache snapshots and callback logs',
					},
				]),
				file('packages/swr/tests/differential/root.test.ts', 'test', [
					{
						id: 'differential:root-surface',
						testName: 'preserves the exact pinned root runtime surface',
						fullName:
							'SWR U3 pinned React/Octane root surface preserves the exact pinned root runtime surface',
					},
				]),
				file('packages/swr/tests/differential/specialized-exports.test.ts', 'test', [
					{
						id: 'differential:specialized-exports',
						testName: 'matches every pinned specialized runtime name',
						fullName:
							'SWR U4 exact specialized runtime oracles matches every pinned specialized runtime name',
					},
				]),
				file('vitest.config.js'),
			],
		},
	],
	divergences: [
		{
			id: 'swr-devtools-global',
			caseIds: ['runtime:c00d484f4ecc81a0'],
			upstreamResult:
				'window.__SWR_DEVTOOLS_REACT__ is assigned the React package reference for React-only SWR DevTools.',
			octaneResult:
				'window.__SWR_DEVTOOLS_OCTANE__ identifies the Octane binding; __SWR_DEVTOOLS_REACT__ is not claimed.',
			rationale:
				'Octane is not React. Claiming the React identity would mislead React-only SWR DevTools about the host runtime.',
			classification: 'devtools-host-identity',
			consumerImpact:
				'React-only SWR DevTools that require window.__SWR_DEVTOOLS_REACT__ do not attach to this binding.',
			migrationGuidance:
				'Prefer Octane-aware tooling that reads window.__SWR_DEVTOOLS_OCTANE__, or treat React-only SWR DevTools as unsupported.',
			owner: '@octanejs/swr',
			reviewCondition:
				'Review if Octane ships a shared SWR DevTools bridge that can safely advertise a host-compatible identity.',
		},
	],
};

writeFileSync(
	resolve(root, 'packages/swr/audit/react-parity.json'),
	`${JSON.stringify(manifest, null, 2)}\n`,
);
