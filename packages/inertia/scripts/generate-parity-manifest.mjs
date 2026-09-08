#!/usr/bin/env node
/**
 * Regenerates packages/inertia/audit/react-parity.json and the adapted runtime
 * inventory. Edit lane files, then rerun this before react-parity:check.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';

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
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const hashFile = (relative) => sha256(readFileSync(path.join(REPO, relative)));
const pendingWrites = [];

const TEST_ROOTS = ['packages/inertia/tests/adapted'];

function writeInventory(project, ownedPrefixes, inventoryRelative) {
	const owned = (file) =>
		ownedPrefixes.some((prefix) => file === prefix || file.startsWith(`${prefix}/`));
	const result = spawnSync(
		process.execPath,
		['node_modules/vitest/vitest.mjs', 'run', '--project', project, '--reporter=json'],
		{ cwd: REPO, encoding: 'utf8', maxBuffer: 1024 * 1024 * 64 },
	);
	const start = result.stdout.indexOf('{');
	if (start < 0)
		throw new Error(`no JSON reporter output for project ${project}:\n${result.stderr}`);
	const report = JSON.parse(result.stdout.slice(start));
	const tests = [];
	const files = new Set();
	for (const suite of report.testResults ?? []) {
		const file = path.relative(REPO, suite.name).split(path.sep).join('/');
		if (!owned(file)) continue;
		files.add(file);
		for (const assertion of suite.assertionResults ?? []) {
			const fullName = assertion.fullName;
			tests.push({
				id: `runtime:${sha256(`${file}\0${fullName}`).slice(0, 16)}`,
				file,
				fullName,
			});
		}
	}
	tests.sort((a, b) => (a.file + a.fullName < b.file + b.fullName ? -1 : 1));
	if (tests.length === 0) throw new Error(`project ${project} collected no tests`);
	const inventory = {
		schemaVersion: 1,
		project,
		roots: TEST_ROOTS,
		files: [...files].sort(),
		tests,
	};
	pendingWrites.push(writeJson(path.join(REPO, inventoryRelative), inventory));
	return inventory;
}

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
	const lines = [];
	for (const file of walk(root)) {
		const relative = path.relative(root, file).split(path.sep).join('/');
		if (relative === 'SHA256SUMS') continue;
		lines.push(`${sha256(readFileSync(file))}  ${relative}`);
	}
	const sumsPath = path.join(root, 'SHA256SUMS');
	writeFileSync(sumsPath, `${lines.join('\n')}\n`);
	return `sha256:${sha256(readFileSync(sumsPath))}`;
}

function collectCases(relative, idPrefix) {
	const source = readFileSync(path.join(REPO, relative), 'utf8');
	const cases = [];
	let describeName = '';
	const pattern = /\b(describe|it|test)\(\s*(['"`])((?:\\.|(?!\2)[^\\])*)\2/g;
	let match;
	while ((match = pattern.exec(source)) !== null) {
		const [, kind, , rawName] = match;
		const name = rawName.replace(/\\(['"`\\])/g, '$1');
		if (kind === 'describe') {
			describeName = name;
			continue;
		}
		const marker = [...source.slice(0, match.index).matchAll(/\/\/\s*@parity-case\s+(\S+)/g)].pop();
		const id = marker?.[1] ?? `${idPrefix}:${cases.length + 1}`;
		cases.push({
			id,
			testName: name,
			fullName: describeName ? `${describeName} ${name}` : name,
		});
	}
	if (cases.length === 0) throw new Error(`no cases collected from ${relative}`);
	return cases;
}

const testFile = (relative, idPrefix) => ({
	path: relative,
	role: 'test',
	sha256: hashFile(relative),
	cases: collectCases(relative, idPrefix),
});

const typeSuiteFile = (relative, id) => ({
	path: relative,
	role: 'test',
	sha256: hashFile(relative),
	cases: [
		{ id, testName: 'public surface type assertions', fullName: 'public surface type assertions' },
	],
});

const supportFile = (relative) => ({
	path: relative,
	role: 'support',
	sha256: hashFile(relative),
});

function summarize(list) {
	const all = new Set();
	const laneCounts = new Map();
	let entries = 0;
	let duplicates = 0;
	for (const inventory of list) {
		const lane = new Set();
		for (const test of inventory.tests) {
			const identity = `${test.file}\0${test.fullName}`;
			entries++;
			all.add(identity);
			lane.add(identity);
		}
		duplicates += inventory.tests.length - lane.size;
		for (const identity of lane) laneCounts.set(identity, (laneCounts.get(identity) ?? 0) + 1);
	}
	return {
		inventoryEntries: entries,
		uniqueIdentities: all.size,
		duplicateEntriesWithinLanes: duplicates,
		identitiesSharedAcrossLanes: [...laneCounts.values()].filter((count) => count > 1).length,
	};
}

mkdirSync(AUDIT, { recursive: true });
const integrity = upstreamIntegrity();
const adaptedInventory = writeInventory(
	'inertia-adapted',
	['packages/inertia/tests/adapted'],
	'packages/inertia/audit/adapted-runtime.json',
);
await Promise.all(pendingWrites);

const manifest = {
	$schema: '../../hook-form/audit/react-parity.schema.json',
	schemaVersion: 1,
	provenance: {
		repo: 'https://github.com/inertiajs/inertia.git',
		version: '3.6.1',
		commit: '68b13b662d7a6ecdd504026ee18733192b0c7d73',
		sourceRoot: 'packages/react',
		testRoot: 'tests',
		license: 'MIT',
		integrity,
		verification: 'verified',
	},
	upstreamSuites: {
		runtime: 'absent',
		types: 'absent',
	},
	adaptedRoots: {
		source: {
			roots: ['packages/inertia/src'],
			include: ['\\.(?:[cm]?[jt]s|[jt]sx|tsrx)$'],
			exclude: [],
		},
		tests: {
			roots: TEST_ROOTS,
			include: ['\\.(?:test|spec)\\.(?:[cm]?[jt]s|[jt]sx|tsrx)$'],
			exclude: [],
		},
	},
	adaptedRuntimeSummary: summarize([adaptedInventory]),
	environments: {
		'workspace-node': {
			node: '>=22',
			platform: 'any',
			arch: 'any',
			packageManager: 'pnpm@11.15.1',
			lockfile: 'pnpm-lock.yaml',
			lockfileSha256: hashFile('pnpm-lock.yaml'),
		},
	},
	lanes: [
		{
			id: 'inertia-adapted-use-page',
			type: 'adapted-octane',
			oracle: 'required',
			environment: 'workspace-node',
			project: 'inertia-adapted',
			evidenceOrigin: 'repo-authored',
			notes:
				'Cited adapted usePage cases against packages/inertia/upstream/src/usePage.ts at the pinned commit. Upstream ships no unit suite for this module.',
			execution: {
				kind: 'vitest-full',
				inventory: 'packages/inertia/audit/adapted-runtime.json',
			},
			files: [
				supportFile('packages/inertia/audit/adapted-runtime.json'),
				supportFile('packages/inertia/tests/adapted/use-page.test.ts'),
				supportFile('packages/inertia/tests/_fixtures/page-provider.tsrx'),
				supportFile('vitest.config.js'),
			],
		},
		{
			id: 'inertia-differential',
			type: 'differential',
			oracle: 'required',
			environment: 'workspace-node',
			project: 'inertia-differential',
			evidenceOrigin: 'repo-authored',
			notes:
				'The same usePage fixture runs through Octane and @inertiajs/react@3.6.1 via the shared differential rig.',
			files: [
				testFile('packages/inertia/tests/differential/parity.test.ts', 'differential'),
				supportFile('packages/inertia/tests/_fixtures/use-page-diff.tsrx'),
				supportFile('packages/octane/tests/differential/_rig.ts'),
				supportFile('packages/inertia/tests/differential/_setup.ts'),
				supportFile('vitest.config.js'),
			],
		},
		{
			id: 'inertia-pristine-types',
			type: 'pristine-types',
			oracle: 'required',
			available: true,
			environment: 'workspace-node',
			project: 'inertia-pristine-types',
			evidenceOrigin: 'repo-authored',
			notes: 'Port-authored React declaration probes against @inertiajs/react@3.6.1 with tsc.',
			execution: {
				kind: 'typescript',
				compiler: 'tsc',
				project: 'packages/inertia/typetests/pristine/tsconfig.json',
			},
			files: [
				typeSuiteFile('packages/inertia/typetests/pristine/types.test-d.ts', 'types:pristine'),
				supportFile('packages/inertia/typetests/pristine/tsconfig.json'),
				supportFile('packages/inertia/typetests/assertions.md'),
			],
		},
		{
			id: 'inertia-adapted-types',
			type: 'adapted-types',
			oracle: 'required',
			available: true,
			environment: 'workspace-node',
			project: 'inertia-adapted-types',
			evidenceOrigin: 'repo-authored',
			notes:
				'Matching Octane public probes against @octanejs/inertia with tsrx-tsc. Permitted transformations are listed in typetests/assertions.md.',
			execution: {
				kind: 'typescript',
				compiler: 'tsrx-tsc',
				project: 'packages/inertia/typetests/adapted/tsconfig.json',
			},
			files: [
				typeSuiteFile('packages/inertia/typetests/adapted/types.test-d.ts', 'types:adapted'),
				supportFile('packages/inertia/typetests/adapted/tsconfig.json'),
				supportFile('packages/inertia/typetests/assertions.md'),
			],
		},
	],
	divergences: [],
};

await writeJson(path.join(AUDIT, 'react-parity.json'), manifest);
console.log('wrote packages/inertia/audit/react-parity.json');
