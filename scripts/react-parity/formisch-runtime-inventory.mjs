#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareTestIdentities, toPortablePath } from './harness-lib.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const adaptedRoots = [
	'packages/formisch/audit',
	'packages/formisch/tests/upstream/frameworks/react/src',
];
const lanes = [
	{
		project: 'formisch-pristine-core',
		destination: 'packages/formisch/audit/pristine-runtime-core.json',
		roots: ['packages/formisch/upstream/packages/core/src'],
	},
	{
		project: 'formisch-pristine-methods',
		destination: 'packages/formisch/audit/pristine-runtime-methods.json',
		roots: ['packages/formisch/upstream/packages/methods/src'],
	},
	{
		project: 'formisch-pristine-react',
		destination: 'packages/formisch/audit/pristine-runtime-react.json',
		roots: ['packages/formisch/upstream/frameworks/react/src'],
	},
	{
		project: 'formisch-adapted-core-methods',
		destination: 'packages/formisch/audit/adapted-runtime-core-methods.json',
		roots: adaptedRoots,
		filterRoots: ['packages/formisch/audit/adapted-core-methods.test.ts'],
	},
	{
		project: 'formisch-adapted-resolver-canary',
		destination: 'packages/formisch/audit/adapted-runtime-resolver-canary.json',
		roots: adaptedRoots,
		filterRoots: ['packages/formisch/audit/resolver-canary'],
	},
	{
		project: 'formisch',
		destination: 'packages/formisch/audit/adapted-runtime-react.json',
		roots: adaptedRoots,
		filterRoots: ['packages/formisch/tests/upstream/frameworks/react/src'],
	},
];

for (const lane of lanes) {
	const occurrences = new Map();
	const output = execFileSync(
		process.execPath,
		['node_modules/vitest/vitest.mjs', 'list', '--project', lane.project, '--json'],
		{ cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
	);
	const tests = JSON.parse(output)
		.map((test) => ({ ...test, file: toPortablePath(relative(root, test.file)) }))
		.filter((test) =>
			(lane.filterRoots ?? lane.roots).some(
				(testRoot) => test.file === testRoot || test.file.startsWith(`${testRoot}/`),
			),
		)
		.map((test) => {
			const fullName = test.name.replaceAll(' > ', ' ');
			const baseId = `runtime:${createHash('sha256')
				.update(`${test.file}\0${fullName}`)
				.digest('hex')
				.slice(0, 16)}`;
			const occurrence = occurrences.get(baseId) ?? 0;
			occurrences.set(baseId, occurrence + 1);
			return {
				id: occurrence === 0 ? baseId : `${baseId}:${occurrence + 1}`,
				file: test.file,
				fullName,
			};
		})
		.sort(compareTestIdentities);
	const inventory = {
		schemaVersion: 1,
		project: lane.project,
		roots: lane.roots,
		files: [...new Set(tests.map((test) => test.file))],
		tests,
	};
	const destination = resolve(root, lane.destination);
	mkdirSync(dirname(destination), { recursive: true });
	writeFileSync(destination, `${JSON.stringify(inventory, null, 2)}\n`);
	console.log(`${lane.destination}: ${inventory.files.length} files, ${tests.length} tests`);
}
