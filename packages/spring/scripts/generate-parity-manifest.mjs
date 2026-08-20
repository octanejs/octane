#!/usr/bin/env node
/**
 * Regenerates packages/spring/audit/react-parity.json and runtime inventories.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { summarizeRuntimeInventories } from '../../../scripts/react-parity/harness-lib.mjs';
import { renderTypeInventories } from '../../../scripts/react-parity/react-spring-types-lib.mjs';

const PACKAGE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(PACKAGE, '../..');
const sha256 = function digest(value) {
	return createHash('sha256').update(value).digest('hex');
};
const hashFile = function hashRelative(relative) {
	return sha256(readFileSync(path.join(REPO, relative)));
};

async function writeJson(absolute, value) {
	const source = `${JSON.stringify(value, null, '\t')}\n`;
	writeFileSync(
		absolute,
		await format(source, { ...(await resolveConfig(absolute)), filepath: absolute }),
	);
}

const ADAPTED_FILES = [
	'packages/spring/tests/upstream/AnimationConfig.test.ts',
	'packages/spring/tests/upstream/helpers.test.ts',
	'packages/spring/tests/upstream/stringInterpolation.test.ts',
];

function listProject(project) {
	const result = spawnSync(
		process.execPath,
		['node_modules/vitest/vitest.mjs', 'list', '--project', project, '--json'],
		{ cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
	);
	if (result.status !== 0) {
		throw new Error(`vitest list --project ${project} failed:\n${result.stderr || result.stdout}`);
	}
	return JSON.parse(result.stdout);
}

function writeInventory(project, ownedFiles, inventoryRelative, roots) {
	const owned = new Set(ownedFiles);
	const tests = [];
	const files = new Set();
	for (const test of listProject(project)) {
		const file = path.relative(REPO, test.file).split(path.sep).join('/');
		if (!owned.has(file)) continue;
		files.add(file);
		const fullName = test.name.replaceAll(' > ', ' ');
		tests.push({
			id: `runtime:${sha256(`${file}\0${fullName}`).slice(0, 16)}`,
			file,
			fullName,
		});
	}
	tests.sort(function compare(a, b) {
		return a.file + a.fullName < b.file + b.fullName ? -1 : 1;
	});
	if (tests.length === 0) throw new Error(`project ${project} collected no owned tests`);
	return {
		inventory: {
			schemaVersion: 1,
			project,
			roots,
			files: [...files].sort(),
			tests,
		},
		inventoryRelative,
	};
}

const adapted = writeInventory(
	'spring',
	ADAPTED_FILES,
	'packages/spring/audit/adapted-runtime.json',
	['packages/spring/tests/upstream'],
);

const lockfileSha256 = sha256(readFileSync(path.join(REPO, 'pnpm-lock.yaml')));
const summary = summarizeRuntimeInventories([adapted.inventory]);
const pristineInventoryRelative = 'packages/spring/audit/pristine-wrapper-runtime.json';
const pristineCaseInventoryRelative = 'packages/spring/audit/pristine-runtime.json';

const differentialPath = 'packages/spring/tests/differential/parity.test.ts';
const differentialCase = {
	id: 'differential:spring-value-settle',
	testName: 'SpringValue: settles an identical numeric goal to the same final value',
	fullName:
		'differential: @octanejs/spring vs @react-spring/web SpringValue: settles an identical numeric goal to the same final value',
};

const manifest = {
	$schema: '../../hook-form/audit/react-parity.schema.json',
	schemaVersion: 1,
	provenance: {
		repo: 'https://github.com/pmndrs/react-spring.git',
		version: '10.1.2',
		commit: '59b1e5306402d3039120e2da464b66e10b1a1aa1',
		sourceRoot: 'packages/core/src',
		testRoot: 'packages/core/src',
		license: 'MIT',
		integrity: `sha256:${hashFile('packages/spring/audit/upstream.lock.json')}`,
		verification: 'verified',
	},
	upstreamSuites: {
		runtime: 'present',
		types: 'present',
	},
	adaptedRoots: {
		source: {
			roots: ['packages/spring/src'],
			include: ['\\.(?:ts|tsrx)$'],
			exclude: [],
		},
		tests: {
			roots: ['packages/spring/tests/upstream'],
			include: ['\\.test\\.ts$'],
			exclude: [],
		},
	},
	adaptedRuntimeSummary: summary,
	environments: {
		'workspace-node': {
			node: '>=22',
			platform: 'any',
			arch: 'any',
			packageManager: 'pnpm@11.15.1',
			lockfile: 'pnpm-lock.yaml',
			lockfileSha256,
		},
	},
	lanes: [
		{
			id: 'react-spring-pristine-upstream',
			type: 'pristine-upstream',
			oracle: 'required',
			environment: 'workspace-node',
			project: 'spring-pristine',
			evidenceOrigin: 'upstream-suite',
			notes:
				'Runs the byte-exact react-spring 10.1.2 Vitest browser unit suite against the vendored React source and checks every passed identity against the committed inventory.',
			execution: {
				kind: 'vitest-full',
				inventory: pristineInventoryRelative,
			},
			files: [
				{
					path: pristineInventoryRelative,
					role: 'support',
					sha256: 'pending',
				},
				{
					path: pristineCaseInventoryRelative,
					role: 'support',
					sha256: 'pending',
				},
				{
					path: 'packages/spring/tests/upstream-original.test.ts',
					role: 'support',
					sha256: 'pending',
				},
				{
					path: 'scripts/react-parity/react-spring-pristine-runtime.mjs',
					role: 'support',
					sha256: 'pending',
				},
				{
					path: 'packages/spring/tests/upstream-vitest.config.ts',
					role: 'support',
					sha256: 'pending',
				},
				{
					path: 'packages/spring/audit/upstream.lock.json',
					role: 'support',
					sha256: 'pending',
				},
			],
		},
		{
			id: 'react-spring-adapted-full-suite',
			type: 'adapted-octane',
			oracle: 'required',
			environment: 'workspace-node',
			project: 'spring',
			evidenceOrigin: 'upstream-suite',
			notes:
				'Runs one-for-one adapted upstream identities under tests/upstream with exact inventoried names; remaining pristine identities are tracked in upstream-case-dispositions.json.',
			execution: {
				kind: 'vitest-full',
				inventory: adapted.inventoryRelative,
			},
			files: [
				{
					path: adapted.inventoryRelative,
					role: 'support',
					sha256: 'pending',
				},
				{
					path: 'packages/spring/audit/upstream-case-dispositions.json',
					role: 'support',
					sha256: 'pending',
				},
			],
		},
		{
			id: 'react-spring-differential',
			type: 'differential',
			oracle: 'required',
			environment: 'workspace-node',
			project: 'spring-differential',
			evidenceOrigin: 'repo-authored',
			notes: 'Same SpringValue settle path through Octane and published @react-spring/web.',
			files: [
				{
					path: differentialPath,
					role: 'test',
					sha256: 'pending',
					cases: [differentialCase],
				},
			],
		},
		{
			id: 'react-spring-pristine-types',
			type: 'pristine-types',
			oracle: 'required',
			environment: 'workspace-node',
			project: 'spring-pristine-types',
			evidenceOrigin: 'upstream-suite',
			notes:
				'Runs the pinned upstream *.test-d.ts/*.test-d.tsx programs with tsc against the vendored core sources.',
			execution: {
				kind: 'typescript',
				compiler: 'tsc',
				project: 'packages/spring/audit/type-probes/tsconfig.pristine-upstream.json',
			},
			files: [
				{
					path: 'packages/spring/audit/pristine-types.json',
					role: 'test',
					sha256: 'pending',
					cases: [
						{
							id: 'types:pristine-upstream',
							testName: 'pinned upstream type suite',
							fullName: 'pinned upstream type suite',
						},
					],
				},
				{
					path: 'packages/spring/audit/type-probes/tsconfig.pristine-upstream.json',
					role: 'support',
					sha256: 'pending',
				},
				{
					path: 'packages/spring/audit/type-parity.json',
					role: 'support',
					sha256: 'pending',
				},
			],
		},
		{
			id: 'react-spring-adapted-types',
			type: 'adapted-types',
			oracle: 'required',
			environment: 'workspace-node',
			project: 'spring-adapted-types',
			evidenceOrigin: 'upstream-suite',
			notes:
				'One-for-one adapted upstream type programs under typetests/upstream after permitted import-root transforms.',
			execution: {
				kind: 'typescript',
				compiler: 'tsrx-tsc',
				project: 'packages/spring/typetests/tsconfig.upstream.json',
			},
			files: [
				{
					path: 'packages/spring/audit/adapted-types.json',
					role: 'test',
					sha256: 'pending',
					cases: [
						{
							id: 'types:adapted-octane',
							testName: 'adapted Octane type suite',
							fullName: 'adapted Octane type suite',
						},
					],
				},
				{
					path: 'packages/spring/typetests/tsconfig.upstream.json',
					role: 'support',
					sha256: 'pending',
				},
				{
					path: 'packages/spring/audit/type-parity.json',
					role: 'support',
					sha256: 'pending',
				},
			],
		},
	],
	divergences: [],
};

const pristineTypes = {
	schemaVersion: 1,
	cases: [
		{
			id: 'types:pristine-upstream',
			testName: 'pinned upstream type suite',
			fullName: 'pinned upstream type suite',
		},
	],
};
const adaptedTypes = {
	schemaVersion: 1,
	cases: [
		{
			id: 'types:adapted-octane',
			testName: 'adapted Octane type suite',
			fullName: 'adapted Octane type suite',
		},
	],
};

await writeJson(path.join(REPO, adapted.inventoryRelative), adapted.inventory);
await writeJson(path.join(REPO, 'packages/spring/audit/pristine-types.json'), pristineTypes);
await writeJson(path.join(REPO, 'packages/spring/audit/adapted-types.json'), adaptedTypes);

const typeParity = {
	schemaVersion: 1,
	upstreamRoot: 'packages/spring/upstream/packages/core/src',
	adaptedRoot: 'packages/spring/typetests/upstream',
	inventories: {
		upstream: 'packages/spring/audit/upstream-types.json',
		adapted: 'packages/spring/audit/adapted-types-inventory.json',
	},
	lanes: {
		pristine: {
			compiler: 'tsc',
			project: 'packages/spring/audit/type-probes/tsconfig.pristine-upstream.json',
			sourcePolicy: 'byte-exact pinned upstream programs',
		},
		adapted: {
			compiler: 'tsrx-tsc',
			project: 'packages/spring/typetests/tsconfig.upstream.json',
			sourcePolicy: 'structurally equivalent after permitted import-root transforms',
		},
	},
	permittedTransformations: [
		{
			kind: 'import-root',
			rule: 'relative upstream source imports may become @octanejs/spring',
		},
		{
			kind: 'jsx-import-source',
			rule: 'adapted component type tests use jsxImportSource octane',
		},
	],
	divergences: [],
	notes:
		'Adapted type programs are inventoried one-for-one with the vendored *.test-d.ts/*.test-d.tsx suite and executed by the adapted-types lane.',
};
await writeJson(path.join(REPO, 'packages/spring/audit/type-parity.json'), typeParity);
const { inventory: typeInventories } = renderTypeInventories(REPO);
await writeJson(path.join(REPO, typeParity.inventories.upstream), typeInventories.upstream);
await writeJson(path.join(REPO, typeParity.inventories.adapted), typeInventories.adapted);

for (const lane of manifest.lanes) {
	for (const file of lane.files) {
		file.sha256 = hashFile(file.path);
	}
}

await writeJson(path.join(REPO, 'packages/spring/audit/react-parity.json'), manifest);
console.log(
	`react-parity.json: pristine=${JSON.parse(readFileSync(path.join(REPO, pristineInventoryRelative), 'utf8')).tests.length} adapted=${adapted.inventory.tests.length}`,
);
console.log('adaptedRuntimeSummary', JSON.stringify(summary));
