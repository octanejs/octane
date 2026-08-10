#!/usr/bin/env node
/**
 * Regenerates packages/monaco-editor/audit/react-parity.json and inventories.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { format, resolveConfig } from 'prettier';

import { runPristineUpstreamSuite } from '../../../scripts/react-parity/monaco-editor-pristine-runtime.mjs';

async function writeJson(absolute, value) {
	const source = `${JSON.stringify(value, null, '\t')}\n`;
	writeFileSync(
		absolute,
		await format(source, { ...(await resolveConfig(absolute)), filepath: absolute }),
	);
}

const PACKAGE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(PACKAGE, '../..');
const AUDIT = path.join(PACKAGE, 'audit');
mkdirSync(AUDIT, { recursive: true });

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const hashFile = (relative) => sha256(readFileSync(path.join(REPO, relative)));

function walk(absolute) {
	const out = [];
	for (const name of readdirSync(absolute).sort()) {
		const full = path.join(absolute, name);
		if (statSync(full).isDirectory()) out.push(...walk(full));
		else out.push(full);
	}
	return out;
}

function upstreamIntegrity() {
	const root = path.join(PACKAGE, 'upstream');
	const hash = createHash('sha256');
	for (const file of walk(root)) {
		hash.update(path.relative(root, file).split(path.sep).join('/'));
		hash.update(readFileSync(file));
	}
	return `sha256:${hash.digest('hex')}`;
}

const ADAPTED_TEST_ROOTS = ['packages/monaco-editor/tests/upstream'];
const DIFFERENTIAL_ROOTS = ['packages/monaco-editor/tests/differential'];
const PRISTINE_UPSTREAM_ROOTS = ['packages/monaco-editor/upstream/src'];

function writeInventory(project, ownedPrefixes, inventoryRelative, idPrefix, roots) {
	const owned = (file) =>
		ownedPrefixes.some((prefix) => file === prefix || file.startsWith(`${prefix}/`));
	const result = spawnSync(
		process.execPath,
		['node_modules/vitest/vitest.mjs', 'run', '--project', project, '--reporter=json'],
		{ cwd: REPO, encoding: 'utf8', maxBuffer: 1024 * 1024 * 64 },
	);
	const start = result.stdout.indexOf('{');
	if (start < 0) {
		throw new Error(`no JSON reporter output for project ${project}:\n${result.stderr}`);
	}
	const report = JSON.parse(result.stdout.slice(start));
	const tests = [];
	const files = new Set();
	for (const suite of report.testResults ?? []) {
		const file = path.relative(REPO, suite.name).split(path.sep).join('/');
		if (!owned(file)) continue;
		files.add(file);
		for (const assertion of suite.assertionResults ?? []) {
			const fullName = assertion.fullName;
			const testName = assertion.title ?? assertion.fullName;
			const digest = sha256(`${file}\0${fullName}`).slice(0, idPrefix === 'differential' ? 10 : 16);
			tests.push({
				id: `${idPrefix}:${digest}`,
				file,
				testName,
				fullName,
			});
		}
	}
	tests.sort((a, b) => (a.file + a.fullName < b.file + b.fullName ? -1 : 1));
	if (tests.length === 0) throw new Error(`project ${project} collected no tests`);
	const inventory = {
		schemaVersion: 1,
		project,
		roots,
		files: [...files].sort(),
		tests,
	};
	return { inventory, inventoryRelative, reportSuccess: report.success };
}

function collectUpstreamSpecCases() {
	const cases = [];
	const specRoot = path.join(PACKAGE, 'upstream/src');
	for (const file of walk(specRoot).filter((f) => f.endsWith('.spec.tsx'))) {
		const relativeFile = path.relative(REPO, file).split(path.sep).join('/');
		const source = readFileSync(file, 'utf8');
		let describeName = '';
		const pattern = /\b(describe|it)\(\s*(['"`])((?:\\.|(?!\2)[^\\])*)\2/g;
		let match;
		while ((match = pattern.exec(source)) !== null) {
			const [, kind, , rawName] = match;
			const name = rawName.replace(/\\(['"`\\])/g, '$1');
			if (kind === 'describe') {
				describeName = name;
				continue;
			}
			const fullName = describeName ? `${describeName} ${name}` : name;
			cases.push({
				id: `runtime:${sha256(`${relativeFile}\0${fullName}`).slice(0, 16)}`,
				file: relativeFile,
				fullName,
			});
		}
	}
	cases.sort((a, b) => (a.file + a.fullName < b.file + b.fullName ? -1 : 1));
	if (cases.length !== 6) {
		throw new Error(`expected six upstream RTL cases, found ${cases.length}`);
	}
	return cases;
}

function fileEntry(relative, role, cases) {
	const entry = { path: relative, role, sha256: hashFile(relative) };
	if (cases) entry.cases = cases;
	return entry;
}

function normalizeImportSpecifier(specifier) {
	if (specifier === '@monaco-editor/react' || specifier === '@octanejs/monaco-editor') {
		return '#monaco-public';
	}
	if (specifier === 'react' || specifier === 'octane') return '#renderable-runtime';
	if (specifier === 'vitest') return '#type-test-runtime';
	return specifier;
}

function normalizeTypeGroup(source, fileName) {
	const sourceFile = ts.createSourceFile(
		fileName,
		source,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS,
	);
	const printer = ts.createPrinter({ removeComments: true });
	let transformed = source;
	const replacements = [];
	for (const statement of sourceFile.statements) {
		if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier))
			continue;
		const normalized = normalizeImportSpecifier(statement.moduleSpecifier.text);
		if (normalized === statement.moduleSpecifier.text) continue;
		replacements.push({
			start: statement.moduleSpecifier.getStart(sourceFile) + 1,
			end: statement.moduleSpecifier.getEnd() - 1,
			value: normalized,
		});
	}
	for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
		transformed = `${transformed.slice(0, replacement.start)}${replacement.value}${transformed.slice(replacement.end)}`;
	}
	transformed = transformed
		.replace(/\bReactNode\b/g, 'RenderableNode')
		.replace(/\bOctaneNode\b/g, 'RenderableNode')
		.replace(/\/\/\s*Group\s+\d+[^\n]*/g, '')
		.replace(/\/\/\s*@ts-expect-error[^\n]*/g, '// @ts-expect-error')
		.replace(/\bconst\s+[A-Za-z_$][\w$]*/g, 'const _')
		.replace(/\bvoid\s+[A-Za-z_$][\w$]*/g, 'void _');
	const normalizedFile = ts.createSourceFile(
		fileName,
		transformed,
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS,
	);
	return ts
		.createPrinter({ removeComments: true })
		.printFile(normalizedFile)
		.replace(/\s+/g, ' ')
		.trim();
}

function splitAssertionGroups(source) {
	const chunks = source
		.split(/(?=\/\/\s*Group\s+\d+)/)
		.filter((chunk) => /\/\/\s*Group\s+\d+/.test(chunk));
	if (chunks.length === 0) throw new Error('no // Group markers found in type test');
	return chunks;
}

function buildTypeInventories() {
	const pristineRel = 'packages/monaco-editor/typetests/pristine/types.test-d.ts';
	const adaptedRel = 'packages/monaco-editor/typetests/adapted/types.test-d.ts';
	const pristineSource = readFileSync(path.join(REPO, pristineRel), 'utf8');
	const adaptedSource = readFileSync(path.join(REPO, adaptedRel), 'utf8');
	const pristineGroups = splitAssertionGroups(pristineSource);
	const adaptedGroups = splitAssertionGroups(adaptedSource);
	const sharedCount = pristineGroups.length;
	if (sharedCount > adaptedGroups.length) {
		throw new Error('adapted type suite has fewer groups than pristine');
	}
	for (let index = 0; index < sharedCount; index++) {
		const normalizedPristine = normalizeTypeGroup(pristineGroups[index], 'types.test-d.ts');
		const normalizedAdapted = normalizeTypeGroup(adaptedGroups[index], 'types.test-d.ts');
		if (normalizedPristine !== normalizedAdapted) {
			throw new Error(`type assertion group ${index + 1} differs after permitted transforms`);
		}
	}
	const pristineInventory = [
		{
			path: 'types.test-d.ts',
			sha256: hashFile(pristineRel),
			assertionGroups: pristineGroups.map((group) =>
				sha256(normalizeTypeGroup(group, 'types.test-d.ts')),
			),
		},
	];
	const adaptedInventory = [
		{
			path: 'types.test-d.ts',
			sha256: hashFile(adaptedRel),
			assertionGroups: adaptedGroups.map((group) =>
				sha256(normalizeTypeGroup(group, 'types.test-d.ts')),
			),
		},
	];
	return {
		pristineInventory,
		adaptedInventory,
		sharedCount,
		adaptedOnlyCount: adaptedGroups.length - sharedCount,
	};
}

function runtimeCaseId(inventory, nameNeedle) {
	const match = inventory.tests.find((test) => test.fullName.includes(nameNeedle));
	if (!match) throw new Error(`runtime inventory missing case matching ${nameNeedle}`);
	return match.id;
}

function adaptedCaseId(inventory, nameNeedle) {
	const match = inventory.tests.find((test) => test.fullName.includes(nameNeedle));
	if (!match) throw new Error(`adapted inventory missing case matching ${nameNeedle}`);
	return match.id;
}

const adaptedInventoryRel = 'packages/monaco-editor/audit/adapted-runtime.json';
const differentialInventoryRel = 'packages/monaco-editor/audit/differential-runtime.json';
const pristineRuntimeRel = 'packages/monaco-editor/audit/pristine-runtime.json';
const pristineWrapperRel = 'packages/monaco-editor/audit/pristine-wrapper-runtime.json';

const { inventory: adaptedInventory, reportSuccess: adaptedSuccess } = writeInventory(
	'monaco-editor-adapted',
	ADAPTED_TEST_ROOTS,
	adaptedInventoryRel,
	'runtime',
	ADAPTED_TEST_ROOTS,
);

let differentialInventory;
let differentialSuccess = false;
try {
	const differentialResult = writeInventory(
		'monaco-editor-differential',
		DIFFERENTIAL_ROOTS,
		differentialInventoryRel,
		'differential',
		DIFFERENTIAL_ROOTS,
	);
	differentialInventory = differentialResult.inventory;
	differentialSuccess = differentialResult.reportSuccess;
} catch (error) {
	console.warn(
		'differential inventory collection failed; using adapted-case annotations',
		error.message,
	);
	const differentialSource = readFileSync(
		path.join(REPO, 'packages/monaco-editor/tests/differential/parity.test.ts'),
		'utf8',
	);
	const cases = [];
	const pattern =
		/\/\/\s*@parity-case\s+(differential:[a-f0-9]+)[\s\S]*?\bit\(\s*(['"`])((?:\\.|(?!\2)[^\\])*)\2/g;
	let match;
	let describeName = 'differential: @octanejs/monaco-editor vs @monaco-editor/react 4.7.0';
	while ((match = pattern.exec(differentialSource)) !== null) {
		const [, id, , rawName] = match;
		const testName = rawName.replace(/\\(['"`\\])/g, '$1');
		cases.push({
			id,
			file: 'packages/monaco-editor/tests/differential/parity.test.ts',
			testName,
			fullName: `${describeName} ${testName}`,
		});
	}
	if (cases.length !== 3) throw error;
	differentialInventory = {
		schemaVersion: 1,
		project: 'monaco-editor-differential',
		roots: DIFFERENTIAL_ROOTS,
		files: ['packages/monaco-editor/tests/differential/parity.test.ts'],
		tests: cases,
	};
}

const pristineCases = collectUpstreamSpecCases();
const pristineRun = runPristineUpstreamSuite({ repoRoot: REPO });
const pristineInventory = {
	schemaVersion: 1,
	project: 'monaco-editor-pristine-upstream',
	roots: PRISTINE_UPSTREAM_ROOTS,
	files: [...new Set(pristineCases.map((test) => test.file))].sort(),
	tests: pristineCases,
	snapshots: 4,
};
const pristineWrapperInventory = {
	schemaVersion: 1,
	project: 'monaco-editor-pristine',
	roots: ['packages/monaco-editor/tests'],
	files: ['packages/monaco-editor/tests/upstream-original.test.ts'],
	tests: [
		{
			id: 'runtime:monaco-react-original-suite',
			file: 'packages/monaco-editor/tests/upstream-original.test.ts',
			fullName: 'runs all six pinned @monaco-editor/react 4.7.0 upstream RTL specs',
		},
	],
};

const { pristineInventory: pristineTypes, adaptedInventory: adaptedTypes } = buildTypeInventories();

await writeJson(path.join(REPO, adaptedInventoryRel), adaptedInventory);
await writeJson(path.join(REPO, differentialInventoryRel), differentialInventory);
await writeJson(path.join(REPO, pristineRuntimeRel), pristineInventory);
await writeJson(path.join(REPO, pristineWrapperRel), pristineWrapperInventory);
await writeJson(path.join(REPO, 'packages/monaco-editor/audit/pristine-types.json'), pristineTypes);
await writeJson(path.join(REPO, 'packages/monaco-editor/audit/adapted-types.json'), adaptedTypes);
await writeJson(path.join(REPO, 'packages/monaco-editor/audit/type-transformations.json'), {
	schemaVersion: 1,
	upstreamRoot: 'packages/monaco-editor/typetests/pristine',
	adaptedRoot: 'packages/monaco-editor/typetests/adapted',
	inventories: {
		upstream: 'packages/monaco-editor/audit/pristine-types.json',
		adapted: 'packages/monaco-editor/audit/adapted-types.json',
	},
	lanes: {
		pristine: {
			compiler: 'tsc',
			project: 'packages/monaco-editor/typetests/pristine/tsconfig.json',
			sourcePolicy:
				'Port-authored React oracle probes against pinned @monaco-editor/react@4.7.0 (upstream ships no typetests).',
		},
		adapted: {
			compiler: 'tsrx-tsc',
			project: 'packages/monaco-editor/typetests/adapted/tsconfig.json',
			sourcePolicy:
				'Shared groups 1–6 mirror pristine; groups 7–9 are adapted-only public-surface probes.',
		},
	},
	permittedTransformations: [
		{
			kind: 'import-root',
			rule: 'Pristine imports @monaco-editor/react; adapted imports @octanejs/monaco-editor.',
		},
		{
			kind: 'renderable-type',
			rule: 'ReactNode loading/renderable slots become OctaneNode in adapted public props.',
		},
		{
			kind: 'jsx-runtime',
			rule: 'Adapted typetests compile with jsxImportSource octane via tsrx-tsc.',
		},
		{
			kind: 'negative-control',
			rule: 'Matching @ts-expect-error controls must reject the same invalid call shapes on both sides.',
		},
		{
			kind: 'adapted-only-groups',
			rule: 'Groups 7–9 (extended props surface, loader.config, useMonaco arity) exist only in adapted typetests.',
		},
	],
	divergences: [
		{
			id: 'loading-octane-node',
			groups: ['1'],
			rationale: 'loading accepts OctaneNode | string instead of ReactNode.',
		},
	],
});

const lockfileSha256 = sha256(readFileSync(path.join(REPO, 'pnpm-lock.yaml')));

const adaptedTestFiles = adaptedInventory.files
	.filter((file) => file.startsWith('packages/monaco-editor/tests/upstream/'))
	.map((file) =>
		fileEntry(
			file,
			'test',
			adaptedInventory.tests
				.filter((t) => t.file === file)
				.map((t) => ({
					id: t.id,
					testName: t.testName,
					fullName: t.fullName,
				})),
		),
	);

const differentialTestFiles = differentialInventory.files.map((file) =>
	fileEntry(
		file,
		'test',
		differentialInventory.tests
			.filter((t) => t.file === file)
			.map((t) => ({
				id: t.id,
				testName: t.testName,
				fullName: t.fullName,
			})),
	),
);

// Ownership-aware model dispose is documented in UPSTREAM.md / status.json (runtime tests stay outside adapted inventory).

const pristineVerified =
	pristineRun.status === 0 && pristineRun.identities.every((test) => test.status === 'passed');
const suiteVerified = adaptedSuccess && differentialSuccess && pristineVerified;

const manifest = {
	$schema: '../../hook-form/audit/react-parity.schema.json',
	schemaVersion: 1,
	provenance: {
		repo: 'https://github.com/suren-atoyan/monaco-react.git',
		version: '4.7.0',
		commit: 'eb120e66378471315620fe5339b73ba003f199ad',
		sourceRoot: 'src',
		testRoot: 'src',
		license: 'MIT',
		integrity: upstreamIntegrity(),
		verification: suiteVerified ? 'verified' : 'recorded-unverified',
	},
	upstreamSuites: {
		runtime: 'present',
		types: 'absent',
	},
	adaptedRoots: {
		source: {
			roots: ['packages/monaco-editor/src'],
			include: ['\\.(?:[cm]?[jt]s|[jt]sx|tsrx)$'],
			exclude: [],
		},
		tests: {
			roots: ['packages/monaco-editor/tests/upstream'],
			include: ['\\.(?:test|spec)\\.(?:[cm]?[jt]s|[jt]sx|tsrx)$'],
			exclude: [],
		},
	},
	adaptedRuntimeSummary: {
		inventoryEntries: adaptedInventory.tests.filter((t) =>
			t.file.startsWith('packages/monaco-editor/tests/upstream/'),
		).length,
		uniqueIdentities: adaptedInventory.tests.filter((t) =>
			t.file.startsWith('packages/monaco-editor/tests/upstream/'),
		).length,
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
			id: 'monaco-editor-pristine-upstream',
			type: 'pristine-upstream',
			oracle: 'required',
			environment: 'workspace-node',
			project: 'monaco-editor-pristine',
			evidenceOrigin: 'upstream-suite',
			notes:
				'Runs the six vendored @monaco-editor/react@4.7.0 RTL snapshot specs against React 19.2.7 via upstream-pristine Vitest config and the shared loader mock. Snapshot client wiring for Vitest 4 against vendored Jest-format snapshots may still be incomplete.',
			execution: {
				kind: 'vitest-full',
				inventory: pristineWrapperRel,
			},
			files: [
				fileEntry(pristineWrapperRel, 'support'),
				fileEntry(pristineRuntimeRel, 'support'),
				fileEntry('packages/monaco-editor/tests/upstream-original.test.ts', 'support'),
				fileEntry('scripts/react-parity/monaco-editor-pristine-runtime.mjs', 'support'),
				fileEntry('packages/monaco-editor/scripts/run-pristine-upstream.mjs', 'support'),
				fileEntry('packages/monaco-editor/tests/upstream-pristine.vitest.config.ts', 'support'),
				fileEntry('packages/monaco-editor/tests/_harness/pristine-setup.ts', 'support'),
				fileEntry('packages/monaco-editor/upstream/COMMIT', 'support'),
			],
		},
		{
			id: 'monaco-editor-adapted',
			type: 'adapted-octane',
			oracle: 'required',
			environment: 'workspace-node',
			project: 'monaco-editor-adapted',
			evidenceOrigin: 'upstream-suite',
			notes:
				'Adapted upstream snapshot ports (Loading / MonacoContainer / Editor / DiffEditor). Port-authored lifecycle/useMonaco live under tests/runtime and stay outside adapted inventory.',
			execution: {
				kind: 'vitest-full',
				inventory: adaptedInventoryRel,
			},
			files: [
				fileEntry(adaptedInventoryRel, 'support'),
				...adaptedTestFiles,
				fileEntry('packages/monaco-editor/tests/_helpers.ts', 'support'),
				fileEntry('packages/monaco-editor/tests/_mocks/loader.ts', 'support'),
				fileEntry('packages/monaco-editor/tests/_mocks/monaco.ts', 'support'),
				fileEntry('packages/monaco-editor/tests/_fixtures/upstream.tsrx', 'support'),
			],
		},
		{
			id: 'monaco-editor-pristine-types',
			type: 'pristine-types',
			oracle: 'required',
			available: true,
			environment: 'workspace-node',
			project: 'monaco-editor-pristine-types',
			evidenceOrigin: 'repo-authored',
			notes: 'Port-authored React-oracle type probes (groups 1–6); upstream ships no typetests.',
			execution: {
				kind: 'typescript',
				compiler: 'tsc',
				project: 'packages/monaco-editor/typetests/pristine/tsconfig.json',
			},
			files: [
				fileEntry('packages/monaco-editor/audit/pristine-types.json', 'test', [
					{
						id: 'types:pristine:groups-1-6',
						testName: 'shared public surface type assertion groups',
						fullName: 'shared public surface type assertion groups',
					},
				]),
				fileEntry('packages/monaco-editor/typetests/pristine/types.test-d.ts', 'test', [
					{
						id: 'types:pristine:source',
						testName: 'pristine types.test-d.ts compiles',
						fullName: 'pristine types.test-d.ts compiles',
					},
				]),
				fileEntry('packages/monaco-editor/typetests/pristine/tsconfig.json', 'support'),
				fileEntry('packages/monaco-editor/typetests/assertions.md', 'support'),
				fileEntry('packages/monaco-editor/audit/type-transformations.json', 'support'),
			],
		},
		{
			id: 'monaco-editor-adapted-types',
			type: 'adapted-types',
			oracle: 'required',
			available: true,
			environment: 'workspace-node',
			project: 'monaco-editor-adapted-types',
			evidenceOrigin: 'repo-authored',
			notes:
				'Shared groups 1–6 plus adapted-only groups 7–9 against @octanejs/monaco-editor with tsrx-tsc.',
			execution: {
				kind: 'typescript',
				compiler: 'tsrx-tsc',
				project: 'packages/monaco-editor/typetests/adapted/tsconfig.json',
			},
			files: [
				fileEntry('packages/monaco-editor/audit/adapted-types.json', 'test', [
					{
						id: 'types:adapted:groups-1-9',
						testName: 'adapted public surface type assertion groups',
						fullName: 'adapted public surface type assertion groups',
					},
				]),
				fileEntry('packages/monaco-editor/typetests/adapted/types.test-d.ts', 'test', [
					{
						id: 'types:adapted:source',
						testName: 'adapted types.test-d.ts compiles',
						fullName: 'adapted types.test-d.ts compiles',
					},
				]),
				fileEntry('packages/monaco-editor/typetests/adapted/tsconfig.json', 'support'),
				fileEntry('packages/monaco-editor/typetests/assertions.md', 'support'),
				fileEntry('packages/monaco-editor/audit/type-transformations.json', 'support'),
			],
		},
		{
			id: 'monaco-editor-differential',
			type: 'differential',
			oracle: 'required',
			environment: 'workspace-node',
			project: 'monaco-editor-differential',
			evidenceOrigin: 'repo-authored',
			notes:
				'Loading-shell DOM parity vs pinned @monaco-editor/react@4.7.0 on React 19.2.7 under the shared loader mock.',
			execution: {
				kind: 'vitest-full',
				inventory: differentialInventoryRel,
			},
			files: [
				fileEntry(differentialInventoryRel, 'support'),
				...differentialTestFiles,
				fileEntry(
					'packages/monaco-editor/tests/_fixtures/differential/editor-diff.tsrx',
					'support',
				),
				fileEntry('packages/monaco-editor/tests/differential/_setup.ts', 'support'),
			],
		},
	],
	divergences: [
		{
			id: 'container-ref',
			caseIds: [adaptedCaseId(adaptedInventory, '<MonacoContainer />')],
			upstreamResult: 'Internal MonacoContainer accepts _ref',
			octaneResult: 'Internal MonacoContainer accepts Octane ref',
			rationale: 'Octane has no forwardRef; refs are ordinary props.',
			classification: 'intentional-divergence',
			consumerImpact: 'None — _ref was never public.',
			migrationGuidance: 'No consumer change.',
			owner: 'bindings',
			reviewCondition: 'If upstream exports MonacoContainer publicly with _ref.',
		},
		{
			id: 'loading-octane-node',
			caseIds: [
				adaptedCaseId(adaptedInventory, '<Loading /> should check render with snapshot'),
				adaptedCaseId(adaptedInventory, '<Loading /> should check content'),
			],
			upstreamResult: 'loading?: ReactNode',
			octaneResult: 'loading?: OctaneNode | string',
			rationale: 'Octane renderable type.',
			classification: 'intentional-divergence',
			consumerImpact: 'Type-only for loading slots.',
			migrationGuidance: 'Pass OctaneNode or string.',
			owner: 'bindings',
			reviewCondition: 'n/a',
		},
	],
};

await writeJson(path.join(AUDIT, 'react-parity.json'), manifest);
console.log('wrote', path.join(AUDIT, 'react-parity.json'));
console.log(
	'adapted upstream',
	manifest.adaptedRuntimeSummary.inventoryEntries,
	'differential',
	differentialInventory.tests.length,
	'pristine upstream',
	pristineInventory.tests.length,
	'verification',
	manifest.provenance.verification,
);
