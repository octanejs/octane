import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { toPortablePath } from '../../../scripts/react-parity/harness-lib.mjs';
import { verifyRequiredLaneIds, verifyTypeCaseInventory } from './parity-guards.mjs';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(packageRoot, '../..');
const auditRoot = resolve(packageRoot, 'audit');
const relativeRepo = (path) => toPortablePath(relative(repoRoot, path));
const checkOnly = process.argv.includes('--check');
const unexpectedArguments = process.argv.slice(2).filter((argument) => argument !== '--check');
if (unexpectedArguments.length) {
	throw new Error('usage: node scripts/generate-parity-audit.mjs [--check]');
}

async function writeJson(path, value) {
	await mkdir(dirname(path), { recursive: true });
	const serialized = await format(`${JSON.stringify(value, null, 2)}\n`, {
		...((await resolveConfig(path)) ?? {}),
		filepath: path,
	});
	if (checkOnly) {
		let retained;
		try {
			retained = await readFile(path, 'utf8');
		} catch (error) {
			if (error?.code === 'ENOENT')
				throw new Error(`missing generated audit artifact: ${relativeRepo(path)}`);
			throw error;
		}
		if (retained !== serialized) {
			throw new Error(`stale generated audit artifact: ${relativeRepo(path)}`);
		}
		return;
	}
	await writeFile(path, serialized);
}

async function sha256(path) {
	return createHash('sha256')
		.update(await readFile(resolve(repoRoot, path)))
		.digest('hex');
}

async function walkFiles(path) {
	const entries = await readdir(resolve(repoRoot, path), { withFileTypes: true });
	const files = [];
	for (const entry of entries) {
		const child = `${path}/${entry.name}`;
		if (entry.isDirectory()) files.push(...(await walkFiles(child)));
		else files.push(child);
	}
	return files;
}

function testId(file, fullName) {
	return `runtime:${createHash('sha256').update(`${file}\0${fullName}`).digest('hex').slice(0, 16)}`;
}

function listProject(project) {
	const output = execFileSync(
		process.execPath,
		['node_modules/vitest/vitest.mjs', 'list', '--project', project, '--json'],
		{ cwd: repoRoot, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
	);
	return JSON.parse(output).map((test) => ({
		file: relativeRepo(test.file),
		fullName: test.name.replaceAll(' > ', ' '),
	}));
}

const adaptedPrefix = 'packages/syntax-highlighter/tests/adapted/';
const adaptedTests = listProject('syntax-highlighter')
	.filter((test) => test.file.startsWith(adaptedPrefix))
	.map((test) => ({ id: testId(test.file, test.fullName), ...test }))
	.sort((left, right) =>
		`${left.file}\0${left.fullName}`.localeCompare(`${right.file}\0${right.fullName}`),
	);
const adaptedInventory = {
	schemaVersion: 1,
	project: 'syntax-highlighter',
	roots: ['packages/syntax-highlighter/tests/adapted'],
	files: [...new Set(adaptedTests.map((test) => test.file))],
	tests: adaptedTests,
};
await writeJson(resolve(auditRoot, 'adapted-runtime.json'), adaptedInventory);

const pristineOutput = execFileSync(
	process.execPath,
	[
		'scripts/react-parity/jest-full-runner.mjs',
		'--config',
		'packages/syntax-highlighter/jest.pristine.config.cjs',
		'--root',
		'packages/syntax-highlighter/upstream',
	],
	{ cwd: repoRoot, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
);
const pristineInventory = JSON.parse(pristineOutput);
pristineInventory.root = 'packages/syntax-highlighter/upstream';
await writeJson(resolve(auditRoot, 'pristine-runtime.json'), pristineInventory);

const normalizedFile = (path) =>
	basename(path)
		.replace(/\.test\.ts$/, '')
		.replace(/\.js$/, '');
const pristineByIdentity = new Map(
	pristineInventory.tests.map((test) => [`${normalizedFile(test.file)}\0${test.fullName}`, test]),
);
const crosswalk = adaptedTests.map((adapted) => {
	const identity = `${normalizedFile(adapted.file)}\0${adapted.fullName}`;
	const pristine = pristineByIdentity.get(identity);
	if (!pristine) throw new Error(`missing pristine identity for ${identity}`);
	pristineByIdentity.delete(identity);
	return {
		id: adapted.id,
		title: adapted.fullName,
		pristine: pristine.file,
		adapted: adapted.file,
	};
});
if (pristineByIdentity.size !== 0) {
	throw new Error(`unadapted pristine identities: ${[...pristineByIdentity.keys()].join(', ')}`);
}
await writeJson(resolve(auditRoot, 'upstream-crosswalk.json'), {
	schemaVersion: 1,
	upstreamFiles: 19,
	adaptedFiles: 19,
	tests: 51,
	snapshots: 40,
	entries: crosswalk,
});

const commonTypeCases = [
	'props',
	'render',
	'light-register',
	'prism-alias-name',
	'prism-alias-map',
	'default-supported',
	'prism-supported',
	'missing-children',
	'non-string-children',
];
const adaptedOnlyTypeCases = [
	'async-preload',
	'async-load-language',
	'async-supported',
	'async-registered',
	'light-no-supported',
	'prism-async-no-register',
	'prism-light-no-supported',
];
await writeJson(
	resolve(auditRoot, 'type-crosswalk.json'),
	verifyTypeCaseInventory(
		await readFile(resolve(packageRoot, 'typetests/pristine/public-api.test-d.ts'), 'utf8'),
		await readFile(resolve(packageRoot, 'typetests/adapted/public-api.test-d.ts'), 'utf8'),
		commonTypeCases,
		adaptedOnlyTypeCases,
	),
);

const allProjectTests = {
	'syntax-highlighter-differential': listProject('syntax-highlighter-differential'),
	'syntax-highlighter-browser': listProject('syntax-highlighter-browser'),
};

async function manifestFile(path, role = 'support', cases) {
	const value = { path, role, sha256: await sha256(path) };
	if (cases?.length) value.cases = cases;
	return value;
}

const selectedCases = {
	'packages/syntax-highlighter/tests/differential/parity.test.ts': [
		[
			'differential:render-and-update',
			'matches React DOM across line rendering, custom tags, and a language update',
		],
	],
	'packages/syntax-highlighter/tests/browser/rendering.browser.test.ts': [
		[
			'browser:chromium-render-update-async',
			'matches rendering, selection, updates, and async loading in Chromium',
		],
	],
};

function casesFor(project, files) {
	const collected = allProjectTests[project].filter((test) => files.includes(test.file));
	return files.flatMap((file) =>
		(selectedCases[file] ?? []).map(([id, testName]) => {
			const matches = collected.filter(
				(test) => test.fullName === testName || test.fullName.endsWith(` ${testName}`),
			);
			if (matches.length !== 1) {
				throw new Error(
					`${file}: expected one collected test ending in ${JSON.stringify(testName)}, found ${matches.length}`,
				);
			}
			return { id, testName, fullName: matches[0].fullName };
		}),
	);
}

async function selectedLane({ id, type, project, files, notes }) {
	return {
		id,
		type,
		oracle: 'required',
		environment: 'workspace-node',
		project,
		notes,
		files: await Promise.all(
			files.map((path) => manifestFile(path, 'test', casesFor(project, [path]))),
		),
	};
}

const differentialFiles = ['packages/syntax-highlighter/tests/differential/parity.test.ts'];
const browserFiles = ['packages/syntax-highlighter/tests/browser/rendering.browser.test.ts'];

const packageJson = JSON.parse(await readFile(resolve(repoRoot, 'package.json'), 'utf8'));
const lockfileSha256 = await sha256('pnpm-lock.yaml');
const tarball = 'packages/syntax-highlighter/upstream/npm/react-syntax-highlighter-16.1.1.tgz';
const adaptedEvidenceFiles = (await walkFiles('packages/syntax-highlighter/tests/adapted'))
	.filter((path) => path.endsWith('.test.ts') || path.endsWith('.snap'))
	.sort();
const lanes = [
	{
		id: 'react-syntax-highlighter-pristine-runtime',
		type: 'pristine-upstream',
		oracle: 'required',
		environment: 'workspace-node',
		project: 'react-syntax-highlighter-pristine',
		evidenceOrigin: 'upstream-suite',
		notes: 'Runs all 19 pinned upstream Jest suites, 51 identities, and 40 snapshots unchanged.',
		execution: {
			kind: 'jest-full',
			config: 'packages/syntax-highlighter/jest.pristine.config.cjs',
			root: 'packages/syntax-highlighter/upstream',
			inventory: 'packages/syntax-highlighter/audit/pristine-runtime.json',
		},
		files: await Promise.all([
			manifestFile('packages/syntax-highlighter/audit/pristine-runtime.json'),
			manifestFile('packages/syntax-highlighter/jest.pristine.config.cjs'),
			manifestFile('packages/syntax-highlighter/audit/upstream-files.json'),
		]),
	},
	{
		id: 'react-syntax-highlighter-adapted-runtime',
		type: 'adapted-octane',
		oracle: 'required',
		environment: 'workspace-node',
		project: 'syntax-highlighter',
		evidenceOrigin: 'upstream-suite',
		notes:
			'Runs every generated one-for-one Octane adaptation with the same 51 titles and 40 structural snapshots.',
		execution: {
			kind: 'vitest-full',
			inventory: 'packages/syntax-highlighter/audit/adapted-runtime.json',
		},
		files: await Promise.all([
			manifestFile('packages/syntax-highlighter/audit/adapted-runtime.json'),
			manifestFile('packages/syntax-highlighter/audit/upstream-crosswalk.json'),
			manifestFile('packages/syntax-highlighter/scripts/generate-adapted-tests.mjs'),
			manifestFile('packages/syntax-highlighter/scripts/generate-parity-audit.mjs'),
			...adaptedEvidenceFiles.map((path) => manifestFile(path)),
		]),
	},
	{
		...(await selectedLane({
			id: 'react-syntax-highlighter-differential',
			type: 'differential',
			project: 'syntax-highlighter-differential',
			files: differentialFiles,
			notes:
				'Runs React and Octane side by side and compares normalized DOM before and after a language update.',
		})),
		evidenceOrigin: 'repo-authored',
	},
	await selectedLane({
		id: 'react-syntax-highlighter-browser',
		type: 'browser',
		project: 'syntax-highlighter-browser',
		files: browserFiles,
		notes:
			'Runs real Chromium rendering, computed whitespace/wrapping, selection, updates, and async loading.',
	}),
	{
		id: 'react-syntax-highlighter-pristine-types',
		type: 'pristine-types',
		oracle: 'required',
		environment: 'workspace-node',
		project: 'react-syntax-highlighter-pristine-types',
		evidenceOrigin: 'repo-authored',
		notes: 'Compiles the public contract against pinned @types/react-syntax-highlighter 15.5.13.',
		execution: {
			kind: 'typescript',
			compiler: 'tsc',
			project: 'packages/syntax-highlighter/typetests/pristine/tsconfig.json',
		},
		files: [
			await manifestFile(
				'packages/syntax-highlighter/typetests/pristine/public-api.test-d.ts',
				'test',
				[
					{
						id: 'types:pristine-public',
						testName: 'pristine public type contract',
						fullName: 'pristine public type contract',
					},
				],
			),
			await manifestFile('packages/syntax-highlighter/typetests/pristine/tsconfig.json'),
			await manifestFile('packages/syntax-highlighter/audit/type-crosswalk.json'),
		],
	},
	{
		id: 'react-syntax-highlighter-adapted-types',
		type: 'adapted-types',
		oracle: 'required',
		environment: 'workspace-node',
		project: 'react-syntax-highlighter-adapted-types',
		evidenceOrigin: 'repo-authored',
		notes:
			'Compiles the same public contract against the generated Octane declarations and representative deep imports.',
		execution: {
			kind: 'typescript',
			compiler: 'tsrx-tsc',
			project: 'packages/syntax-highlighter/typetests/adapted/tsconfig.json',
		},
		files: [
			await manifestFile(
				'packages/syntax-highlighter/typetests/adapted/public-api.test-d.ts',
				'test',
				[
					{
						id: 'types:adapted-compiled-children',
						testName: 'adapted compiled children type contract',
						fullName: 'adapted compiled children type contract',
					},
					{
						id: 'types:adapted-custom-components',
						testName: 'adapted custom component type contract',
						fullName: 'adapted custom component type contract',
					},
				],
			),
			await manifestFile('packages/syntax-highlighter/typetests/adapted/tsconfig.json'),
			await manifestFile('packages/syntax-highlighter/audit/type-crosswalk.json'),
		],
	},
];

const manifest = {
	$schema: '../../../packages/hook-form/audit/react-parity.schema.json',
	schemaVersion: 1,
	provenance: {
		repo: 'https://github.com/react-syntax-highlighter/react-syntax-highlighter.git',
		version: '16.1.1',
		commit: 'ecac533ba1fce8cf4f98a79c5c913f1a7ffab34c',
		sourceRoot: 'src',
		testRoot: '__tests__',
		license: 'MIT',
		integrity: `sha256:${await sha256(tarball)}`,
		verification: 'verified',
	},
	upstreamSuites: { runtime: 'present', types: 'insufficient' },
	adaptedRoots: {
		source: {
			roots: ['packages/syntax-highlighter/src'],
			include: ['\\.(?:js|d\\.ts)$'],
			exclude: [],
		},
		tests: {
			roots: ['packages/syntax-highlighter/tests/adapted'],
			include: ['\\.test\\.ts$'],
			exclude: [],
		},
	},
	adaptedRuntimeSummary: {
		inventoryEntries: 51,
		uniqueIdentities: 51,
		duplicateEntriesWithinLanes: 0,
		identitiesSharedAcrossLanes: 0,
	},
	environments: {
		'workspace-node': {
			node: '>=22',
			platform: 'any',
			arch: 'any',
			packageManager: `pnpm@${packageJson.packageManager.split('@').at(-1)}`,
			lockfile: 'pnpm-lock.yaml',
			lockfileSha256,
		},
	},
	lanes,
	divergences: [
		{
			id: 'compiled-children-value',
			caseIds: ['types:adapted-compiled-children'],
			upstreamResult: 'Nested React children are inspectable source-string values.',
			octaneResult:
				'TSRX nested component children are opaque renderer blocks; source text is passed with children={source}.',
			rationale:
				'The Octane compiler owns nested component child blocks and intentionally does not expose their captured render scope to userland.',
			classification: 'compiler ownership boundary',
			consumerImpact:
				'Rewrite nested SyntaxHighlighter source to the explicit children prop in .tsrx.',
			migrationGuidance:
				'Replace <SyntaxHighlighter>{source}</SyntaxHighlighter> with <SyntaxHighlighter children={source} />.',
			owner: '@octanejs/syntax-highlighter',
			reviewCondition:
				'Remove only if Octane exposes a supported value-child lowering for text-inspecting component APIs.',
		},
		{
			id: 'custom-component-identity',
			caseIds: ['types:adapted-custom-components'],
			upstreamResult:
				'PreTag and CodeTag accept native tags or React class/function ComponentType values.',
			octaneResult:
				'PreTag and CodeTag accept native tags or Octane function ComponentBody values.',
			rationale:
				'React class instances and React element identity are renderer-owned objects that Octane cannot execute.',
			classification: 'framework identity boundary',
			consumerImpact:
				'Native tags and ordinary function components migrate directly; React class components require a function adapter.',
			migrationGuidance:
				'Replace a React class-valued custom tag with an Octane function component returning the same native host.',
			owner: '@octanejs/syntax-highlighter',
			reviewCondition:
				'Remove only if Octane gains a supported React class-component execution bridge.',
		},
	],
};

verifyRequiredLaneIds(
	lanes.map((lane) => lane.id),
	[
		'react-syntax-highlighter-pristine-runtime',
		'react-syntax-highlighter-adapted-runtime',
		'react-syntax-highlighter-differential',
		'react-syntax-highlighter-browser',
		'react-syntax-highlighter-pristine-types',
		'react-syntax-highlighter-adapted-types',
	],
);

await writeJson(resolve(auditRoot, 'react-parity.json'), manifest);
console.log(
	checkOnly
		? 'verified React Syntax Highlighter parity inventories, crosswalk, and manifest'
		: 'generated React Syntax Highlighter parity inventories, crosswalk, and manifest',
);
