#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { summarizeRuntimeInventories } from './harness-lib.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const hashes = new Map();
const sha256 = (path) => {
	if (!hashes.has(path))
		hashes.set(
			path,
			createHash('sha256')
				.update(readFileSync(resolve(root, path)))
				.digest('hex'),
		);
	return hashes.get(path);
};
const evidence = (path, role = 'support', cases) => ({
	path,
	role,
	sha256: sha256(path),
	...(cases ? { cases } : {}),
});
const runtimeSupport = (inventory) => [
	evidence(inventory),
	evidence('packages/formisch/audit/adapted-react-source-fingerprints.json'),
	evidence('scripts/react-parity/formisch-runtime-inventory.mjs'),
	evidence('scripts/react-parity/formisch-upstream-lib.mjs'),
	evidence('packages/formisch/audit/pristine-react-core-setup.ts'),
	evidence('packages/formisch/upstream/packages/core/src/vitest/setup.ts'),
	evidence('packages/formisch/upstream/frameworks/react/src/vitest/setup.ts'),
];
const typeEvidence = (inventory, id, name, project) => [
	evidence(inventory, 'test', [{ id, testName: name, fullName: name }]),
	evidence(project),
	evidence('packages/formisch/audit/type-parity.json'),
	evidence('scripts/react-parity/type-parity-lib.mjs'),
];
const environment = 'workspace-node';
const runtimeLane = ({ id, type, project, inventory, notes, support = [] }) => ({
	id,
	type,
	oracle: 'required',
	environment,
	project,
	evidenceOrigin: 'upstream-suite',
	notes,
	execution: { kind: 'vitest-full', inventory },
	files: [...runtimeSupport(inventory), ...support.map((path) => evidence(path))],
});
const typeLane = ({ id, type, project, compiler, inventory, caseId, testName, notes }) => ({
	id,
	type,
	oracle: 'required',
	environment,
	project: id,
	evidenceOrigin: 'upstream-suite',
	notes,
	execution: { kind: 'typescript', compiler, project },
	files: typeEvidence(inventory, caseId, testName, project),
});
const adaptedRuntimeSummary = summarizeRuntimeInventories(
	[
		'packages/formisch/audit/adapted-runtime-core-methods.json',
		'packages/formisch/audit/adapted-runtime-resolver-canary.json',
		'packages/formisch/audit/adapted-runtime-react.json',
	].map((path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'))),
);

const manifest = {
	schemaVersion: 1,
	provenance: {
		repo: 'https://github.com/open-circle/formisch.git',
		version: '1.0.0-rc.0',
		commit: '4c494fd8cf105efd04a4b179e9c090595a0bf041',
		sourceRoot: 'frameworks/react; packages/core; packages/methods',
		testRoot: 'the test artifacts colocated under those source roots',
		license: 'MIT',
		integrity: 'sha256:3f9c1c6da89473296033cc2701405080b2cb11478724bc7f045063ee618aaf57',
		verification: 'verified',
	},
	upstreamSuites: { runtime: 'present', types: 'present' },
	adaptedRoots: {
		source: {
			roots: ['packages/formisch/src'],
			include: ['\\.(?:[cm]?[jt]s|[jt]sx|tsrx)$'],
			exclude: [],
		},
		tests: {
			roots: ['packages/formisch/audit', 'packages/formisch/tests/upstream/frameworks/react/src'],
			include: ['\\.test\\.(?:ts|tsrx)$'],
			exclude: [],
		},
	},
	adaptedRuntimeSummary,
	environments: {
		[environment]: {
			node: '>=22',
			platform: 'any',
			arch: 'any',
			packageManager: 'pnpm@11.15.1',
			lockfile: 'pnpm-lock.yaml',
			lockfileSha256: sha256('pnpm-lock.yaml'),
		},
	},
	lanes: [
		runtimeLane({
			id: 'formisch-pristine-core',
			type: 'pristine-upstream',
			project: 'formisch-pristine-core',
			inventory: 'packages/formisch/audit/pristine-runtime-core.json',
			notes: 'Runs all 302 byte-exact upstream core cases against the pinned source.',
		}),
		runtimeLane({
			id: 'formisch-pristine-methods',
			type: 'pristine-upstream',
			project: 'formisch-pristine-methods',
			inventory: 'packages/formisch/audit/pristine-runtime-methods.json',
			notes: 'Runs all 205 byte-exact upstream methods cases with the pinned React core selector.',
		}),
		runtimeLane({
			id: 'formisch-pristine-react',
			type: 'pristine-upstream',
			project: 'formisch-pristine-react',
			inventory: 'packages/formisch/audit/pristine-runtime-react.json',
			notes: 'Runs all 42 byte-exact upstream adapter cases against React.',
		}),
		runtimeLane({
			id: 'formisch-adapted-core-methods',
			type: 'adapted-octane',
			project: 'formisch-adapted-core-methods',
			inventory: 'packages/formisch/audit/adapted-runtime-core-methods.json',
			notes:
				'Runs the unchanged 507-case framework-neutral suite through a distinct entrypoint against the Octane-selected core and methods sources.',
			support: ['packages/formisch/audit/adapted-core-methods.test.ts'],
		}),
		runtimeLane({
			id: 'formisch-adapted-resolver-canary',
			type: 'adapted-octane',
			project: 'formisch-adapted-resolver-canary',
			inventory: 'packages/formisch/audit/adapted-runtime-resolver-canary.json',
			notes:
				'Proves the adapted core and methods resolver executes the Octane source tree rather than vendored upstream code.',
		}),
		runtimeLane({
			id: 'formisch-adapted-react',
			type: 'adapted-octane',
			project: 'formisch',
			inventory: 'packages/formisch/audit/adapted-runtime-react.json',
			notes:
				'Runs all 42 one-for-one adapted adapter cases, including the explicit StrictMode divergence.',
		}),
		typeLane({
			id: 'formisch-pristine-types-core-methods',
			type: 'pristine-types',
			notes:
				'Compiles the five byte-exact core and methods type artifacts against vendored source.',
			compiler: 'tsc',
			project: 'packages/formisch/audit/tsconfig.pristine-types.json',
			inventory: 'packages/formisch/audit/upstream-types.json',
			caseId: 'types:pristine-core-methods',
			testName: 'pinned upstream core and methods type suite',
		}),
		typeLane({
			id: 'formisch-pristine-types-react',
			type: 'pristine-types',
			notes: 'Compiles byte-exact React type-test overlays against pinned published declarations.',
			compiler: 'tsc',
			project: 'packages/formisch/audit/tsconfig.pristine-react.json',
			inventory: 'packages/formisch/audit/upstream-types.json',
			caseId: 'types:pristine-react',
			testName: 'pinned upstream React type suite',
		}),
		typeLane({
			id: 'formisch-adapted-types',
			type: 'adapted-types',
			notes: 'Compiles the one-for-one adapted React and methods type artifacts with tsrx-tsc.',
			compiler: 'tsrx-tsc',
			project: 'packages/formisch/typetests/tsconfig.json',
			inventory: 'packages/formisch/audit/adapted-types.json',
			caseId: 'types:adapted-react-methods',
			testName: 'adapted Octane React and methods type suite',
		}),
		typeLane({
			id: 'formisch-adapted-types-exact',
			type: 'adapted-types',
			notes: 'Compiles the one-for-one adapted core type artifacts with exact optional properties.',
			compiler: 'tsrx-tsc',
			project: 'packages/formisch/typetests/tsconfig.exact.json',
			inventory: 'packages/formisch/audit/adapted-types.json',
			caseId: 'types:adapted-core-exact',
			testName: 'adapted Octane core type suite',
		}),
		{
			id: 'formisch-differential',
			type: 'differential',
			oracle: 'required',
			environment,
			project: 'formisch-differential',
			evidenceOrigin: 'repo-authored',
			notes:
				'The same fixture runs through Octane and real @formisch/react via the shared differential rig.',
			files: [
				evidence('packages/formisch/tests/differential/parity.test.ts', 'test', [
					{
						id: 'differential:field-update',
						testName: 'field update: programmatic onChange renders byte-identical',
						fullName:
							'differential: @octanejs/formisch vs @formisch/react field update: programmatic onChange renders byte-identical',
					},
				]),
				evidence('packages/formisch/tests/_fixtures/differential.tsrx'),
				evidence('packages/octane/tests/differential/_rig.ts'),
				evidence('packages/formisch/tests/differential/_setup.ts'),
			],
		},
	],
	divergences: [
		{
			id: 'formisch-no-strictmode-replay',
			caseIds: ['runtime:5457ff55c8742f8e'],
			upstreamResult:
				'React StrictMode replays effects while retaining a live signal subscription.',
			octaneResult:
				'Octane has no StrictMode development replay; a committed subscription remains live normally.',
			rationale: 'Octane intentionally does not implement StrictMode double invocation.',
			classification: 'intentional framework divergence',
			consumerImpact:
				'Production subscription behavior is unchanged; StrictMode-only development replay is unavailable.',
			migrationGuidance: 'Do not depend on StrictMode effect replay for subscription correctness.',
			owner: 'Octane Formisch binding',
			reviewCondition:
				'Revisit if Octane adds a StrictMode-compatible development replay contract.',
		},
	],
};

writeFileSync(
	resolve(root, 'packages/formisch/audit/react-parity.json'),
	`${JSON.stringify(manifest, null, 2)}\n`,
);
console.log('packages/formisch/audit/react-parity.json');
