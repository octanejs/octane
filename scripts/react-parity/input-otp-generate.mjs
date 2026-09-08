#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const audit = 'packages/input-otp/audit';
const adaptedRoots = ['packages/input-otp/tests'];

const lanes = [
	[
		'input-otp-adapted',
		'input-otp',
		'packages/input-otp/audit/adapted-runtime.json',
		[
			'packages/input-otp/tests/conformance/input.test.ts',
			'packages/input-otp/tests/hydration/input.test.ts',
		],
	],
	[
		'input-otp-server',
		'input-otp-server',
		'packages/input-otp/audit/adapted-runtime-server.json',
		['packages/input-otp/tests/ssr/input.server.test.ts'],
	],
	[
		'input-otp-browser',
		'input-otp-browser',
		'packages/input-otp/audit/adapted-runtime-browser.json',
		[
			'packages/input-otp/tests/browser/conformance.browser.test.ts',
			'packages/input-otp/tests/browser/upstream/base.delete-word.spec.ts',
			'packages/input-otp/tests/browser/upstream/base.props.spec.ts',
			'packages/input-otp/tests/browser/upstream/base.render.spec.ts',
			'packages/input-otp/tests/browser/upstream/base.selections.spec.ts',
			'packages/input-otp/tests/browser/upstream/base.slot.spec.ts',
			'packages/input-otp/tests/browser/upstream/base.typing.spec.ts',
			'packages/input-otp/tests/browser/upstream/with-autofocus.spec.ts',
			'packages/input-otp/tests/browser/upstream/with-on-complete.spec.ts',
			'packages/input-otp/tests/browser/upstream/pwm-space.spec.ts',
		],
	],
];

const upstreamFiles = ['packages/input-otp/tests/pristine/upstream.browser.test.ts'];
const pristineLedgerPath = 'packages/input-otp/audit/pristine-adaptation-ledger.json';
const pinnedUpstreamFiles = [
	'packages/input-otp/upstream/apps/playground/src/tests/base.delete-word.spec.ts',
	'packages/input-otp/upstream/apps/playground/src/tests/base.props.spec.ts',
	'packages/input-otp/upstream/apps/playground/src/tests/base.render.spec.ts',
	'packages/input-otp/upstream/apps/playground/src/tests/base.selections.spec.ts',
	'packages/input-otp/upstream/apps/playground/src/tests/base.slot.spec.ts',
	'packages/input-otp/upstream/apps/playground/src/tests/base.typing.spec.ts',
	'packages/input-otp/upstream/apps/playground/src/tests/pwm-space.spec.ts',
	'packages/input-otp/upstream/apps/playground/src/tests/with-autofocus.spec.ts',
	'packages/input-otp/upstream/apps/playground/src/tests/with-on-complete.spec.ts',
];

function sha(contents) {
	return createHash('sha256').update(contents).digest('hex');
}

async function fileSha(file) {
	return sha(await readFile(path.join(repo, file)));
}

async function behaviorCases(file) {
	const source = await readFile(path.join(repo, file), 'utf8');
	const matches = [...source.matchAll(/\b(?:it|test)\s*\(\s*(['"])((?:\\.|(?!\1)[\s\S])*?)\1/g)];
	return matches.map((match, index) => {
		const behavior = source
			.slice(match.index, matches[index + 1]?.index ?? source.length)
			.replace(/\/\/[^\n]*/g, '')
			.replace(/\s+/g, ' ')
			.trim();
		return {
			id: `${file}#${index + 1}`,
			path: file,
			ordinal: index + 1,
			title: match[2],
			behaviorSha256: sha(behavior),
		};
	});
}

function stringLiteral(source, offset) {
	const match = /^\s*(['"])((?:\\.|(?!\1)[\s\S])*)\1/.exec(source.slice(offset));
	return match?.[2].replaceAll("\\'", "'").replaceAll('\\"', '"');
}

async function identities(files, prefix) {
	const tests = [];
	for (const file of files) {
		const source = await readFile(path.join(repo, file), 'utf8');
		const suites = [];
		for (const match of source.matchAll(/\b(?:describe|it|test)(?:\.describe)?\s*\(/g)) {
			const title = stringLiteral(source, match.index + match[0].length);
			if (!title) continue;
			const token = match[0];
			if (token.includes('describe')) suites.push(title);
			else {
				const suite =
					source.includes('describe(') && !file.includes('/browser/') ? suites.at(-1) : undefined;
				tests.push({ file, fullName: suite ? `${suite} ${title}` : title });
			}
		}
	}
	tests.sort(
		(left, right) =>
			left.file.localeCompare(right.file) || left.fullName.localeCompare(right.fullName),
	);
	return tests.map((test, index) => ({
		id: `runtime:${prefix}:${String(index + 1).padStart(4, '0')}`,
		...test,
	}));
}

async function writeJson(relative, value) {
	await writeFile(
		path.join(repo, relative),
		await format(`${JSON.stringify(value, null, 2)}\n`, { parser: 'json' }),
	);
}

const pinnedBehaviorCases = (
	await Promise.all(pinnedUpstreamFiles.map((file) => behaviorCases(file)))
).flat();
const rewrittenBehaviorCases = await behaviorCases(upstreamFiles[0]);
const adaptationLedger = JSON.parse(await readFile(path.join(repo, pristineLedgerPath), 'utf8'));
if (
	adaptationLedger.cases.length !== pinnedBehaviorCases.length ||
	pinnedBehaviorCases.length !== rewrittenBehaviorCases.length
) {
	throw new Error('The pristine adaptation ledger case count is stale.');
}
for (const [index, pinnedCase] of pinnedBehaviorCases.entries()) {
	const rewrittenCase = rewrittenBehaviorCases[index];
	const [sourceFile, sourceOrdinal, sourceHash, rewrittenOrdinal, rewrittenHash] =
		adaptationLedger.cases[index];
	const ledgerId = `${pinnedCase.path.slice(pinnedCase.path.lastIndexOf('/') + 1)}#${sourceOrdinal}`;
	if (
		`${sourceFile}#${sourceOrdinal}` !== ledgerId ||
		rewrittenOrdinal !== rewrittenCase.ordinal ||
		sourceHash !== pinnedCase.behaviorSha256 ||
		rewrittenHash !== rewrittenCase.behaviorSha256
	) {
		throw new Error(`Pristine adaptation ledger mismatch at ${pinnedCase.id}.`);
	}
}

const inventories = [];
for (const [id, project, inventoryPath, files] of lanes) {
	const inventory = {
		schemaVersion: 1,
		project,
		roots: adaptedRoots,
		files,
		tests: await identities(files, project),
	};
	await writeJson(inventoryPath, inventory);
	inventories.push({ id, project, path: inventoryPath, inventory });
}

const pristinePath = `${audit}/pristine-runtime-browser.json`;
const pristineCrosswalkPath = `${audit}/pristine-runtime-crosswalk.json`;
const pinnedIdentities = await identities(pinnedUpstreamFiles, 'pinned-input-otp');
const rewrittenIdentities = await identities(upstreamFiles, 'input-otp-pristine-browser');
const unmatchedRewritten = [...rewrittenIdentities];
const identityCrosswalk = pinnedIdentities.map(({ file, fullName }) => {
	const rewrittenIndex = unmatchedRewritten.findIndex(
		(test) => fullName === test.fullName || fullName.endsWith(` ${test.fullName}`),
	);
	if (rewrittenIndex === -1) return null;
	const [rewritten] = unmatchedRewritten.splice(rewrittenIndex, 1);
	return {
		pinned: { path: file, fullName },
		rewritten: { path: upstreamFiles[0], fullName: rewritten.fullName },
	};
});
if (identityCrosswalk.some((entry) => entry === null) || unmatchedRewritten.length > 0) {
	throw new Error(
		'The adapted pristine suite does not map exactly to the pinned upstream identities.',
	);
}
await writeJson(pristineCrosswalkPath, {
	schemaVersion: 1,
	classification: 'adapted-execution-of-pinned-upstream-suite',
	pinnedSources: await Promise.all(
		pinnedUpstreamFiles.map(async (file) => ({ path: file, sha256: await fileSha(file) })),
	),
	rewrittenExecution: {
		path: upstreamFiles[0],
		sha256: await fileSha(upstreamFiles[0]),
	},
	identityCrosswalk,
	allowedTransforms: [
		'Consolidate the nine upstream Playwright spec modules into one Vitest module.',
		'Replace Playwright test imports and webServer routing with the local Vite/Chromium harness.',
		'Preserve each upstream test title, interaction sequence, and assertion outcome.',
	],
	adaptationLedger: {
		path: pristineLedgerPath,
		sha256: await fileSha(pristineLedgerPath),
	},
});
const pristine = {
	schemaVersion: 1,
	project: 'input-otp-pristine-browser',
	roots: ['packages/input-otp/tests/pristine'],
	files: upstreamFiles,
	tests: rewrittenIdentities,
};
await writeJson(pristinePath, pristine);

const differentialPath = `${audit}/differential-runtime.json`;
const differentialFiles = ['packages/input-otp/tests/differential/input.test.tsx'];
const differential = {
	schemaVersion: 1,
	project: 'input-otp-differential',
	roots: adaptedRoots,
	files: differentialFiles,
	tests: await identities(differentialFiles, 'input-otp-differential'),
};
await writeJson(differentialPath, differential);

await writeJson(`${audit}/runtime-inventory.json`, {
	schemaVersion: 1,
	generatedBy: 'scripts/react-parity/input-otp-generate.mjs',
	lanes: [pristine, ...inventories.map(({ inventory }) => inventory)],
	differential,
});

const lockfileSha256 = await fileSha('pnpm-lock.yaml');
const support = async (file) => ({ path: file, role: 'support', sha256: await fileSha(file) });
const typeTest = async (file, id, title) => ({
	path: file,
	role: 'test',
	sha256: await fileSha(file),
	cases: [{ id, testName: title, fullName: title }],
});
const adaptedTests = inventories.slice(0, 2).flatMap(({ inventory }) => inventory.tests);
const manifest = {
	schemaVersion: 1,
	provenance: {
		repo: 'https://github.com/guilhermerodz/input-otp.git',
		version: '1.5.0',
		commit: '3daad8fc88c9a041dbce98e97185efd65b3d87de',
		sourceRoot: 'packages/input-otp',
		testRoot: 'apps/playground/src/tests',
		license: 'MIT',
		integrity: 'sha256:62112dac2d8eea337fb8bafb5c9ce5a5d3574f03e06adfe1411ae40e3cc84d97',
		verification: 'verified',
	},
	upstreamSuites: { runtime: 'present', types: 'absent' },
	adaptedRoots: {
		source: { roots: ['packages/input-otp/src'], include: ['\\.(?:ts|tsrx)$'], exclude: [] },
		tests: {
			roots: adaptedRoots,
			include: ['\\.(?:test|spec)\\.(?:ts|tsx|tsrx)$'],
			exclude: ['/tests/(?:browser|differential|pristine)/'],
		},
	},
	adaptedRuntimeSummary: {
		inventoryEntries: adaptedTests.length,
		uniqueIdentities: new Set(adaptedTests.map(({ file, fullName }) => `${file}\0${fullName}`))
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
			lockfileSha256,
		},
	},
	lanes: [
		{
			id: 'input-otp-pristine-browser',
			type: 'pristine-upstream',
			oracle: 'required',
			environment: 'workspace-node',
			project: 'input-otp-pristine-browser',
			evidenceOrigin: 'upstream-suite',
			notes:
				'Adapted execution of all 19 pinned upstream React identities in real Chromium; complete pinned-source hashes, rewritten-source hash, and allowed transforms are recorded in the crosswalk.',
			execution: { kind: 'vitest-full', inventory: pristinePath },
			files: [
				// The lane's pinned-tree evidence: the lock's upstream git blob shas.
				await support('packages/input-otp/audit/upstream.lock.json'),
				await support(pristinePath),
				await support(pristineCrosswalkPath),
				await support(pristineLedgerPath),
				await support(upstreamFiles[0]),
				...(await Promise.all(pinnedUpstreamFiles.map(support))),
			],
		},
		...inventories.map(({ id, project, path: inventoryPath }, index) => ({
			id,
			type: index < 2 ? 'adapted-octane' : 'browser',
			oracle: 'required',
			environment: 'workspace-node',
			project,
			...(index < 2 ? { evidenceOrigin: index === 0 ? 'upstream-suite' : 'repo-authored' } : {}),
			notes: [
				'Complete adapted DOM and hydration suite.',
				'React-free SSR lane.',
				'Existing Vitest-full real Chromium lane containing all nine adapted upstream files and three port conformance cases.',
			][index],
			execution: {
				kind: 'vitest-full',
				inventory: inventoryPath,
				...(id === 'input-otp-browser' ? { fileParallelism: true } : {}),
			},
			files: [],
		})),
		{
			id: 'input-otp-differential',
			type: 'differential',
			oracle: 'required',
			environment: 'workspace-node',
			project: 'input-otp-differential',
			evidenceOrigin: 'repo-authored',
			notes:
				'Independent React/Octane public-input checkpoints for attributes, projection, edits, callbacks, and pattern rejection.',
			execution: { kind: 'vitest-full', inventory: differentialPath },
			files: [await support(differentialPath)],
		},
		{
			id: 'input-otp-pristine-types',
			type: 'pristine-types',
			oracle: 'required',
			environment: 'workspace-node',
			project: 'input-otp-pristine-types',
			evidenceOrigin: 'repo-authored',
			notes: 'Pinned published React declaration probes.',
			execution: {
				kind: 'typescript',
				compiler: 'tsc',
				project: `${audit}/type-probes/tsconfig.pristine.json`,
			},
			files: [
				await typeTest(
					`${audit}/type-probes/pristine.ts`,
					'types:input-otp-pristine',
					'pinned published declaration probes',
				),
				await support(`${audit}/type-probes/tsconfig.pristine.json`),
			],
		},
		{
			id: 'input-otp-adapted-types',
			type: 'adapted-types',
			oracle: 'required',
			environment: 'workspace-node',
			project: 'input-otp-adapted-types',
			evidenceOrigin: 'repo-authored',
			notes: 'Strict Octane public type probes.',
			execution: {
				kind: 'typescript',
				compiler: 'tsrx-tsc',
				project: 'packages/input-otp/typetests/tsconfig.json',
			},
			files: [
				await typeTest(
					'packages/input-otp/typetests/public-api.test-d.ts',
					'types:input-otp-adapted-public',
					'strict public declaration probes',
				),
				await typeTest(
					'packages/input-otp/typetests/shadcn-adoption.test-d.ts',
					'types:input-otp-adapted-shadcn',
					'shadcn adoption declaration probes',
				),
				await support('packages/input-otp/typetests/tsconfig.json'),
			],
		},
	],
	divergences: [],
};
for (const lane of manifest.lanes)
	if (lane.files.length === 0) lane.files = [await support(lane.execution.inventory)];
await writeJson(`${audit}/react-parity.json`, manifest);
console.log(
	`Generated input-otp parity evidence (${adaptedTests.length} adapted runtime identities, ${pristine.tests.length} pristine identities).`,
);
