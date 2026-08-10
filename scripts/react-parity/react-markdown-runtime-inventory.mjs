#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { compareTestIdentities, toPortablePath } from './harness-lib.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const adaptedFiles = [
	'packages/markdown/tests/conformance/public-types.test.ts',
	'packages/markdown/tests/conformance/sync.server.test.ts',
	'packages/markdown/tests/async/markdown-async.server.test.ts',
	'packages/markdown/tests/hooks/markdown-hooks.test.ts',
	'packages/markdown/tests/validation.test.ts',
	'packages/markdown/tests/differential/processor.test.ts',
	'packages/markdown/tests/differential/url-transform.test.ts',
];
const lanes = [
	{
		project: 'node:test',
		destination: 'packages/markdown/audit/pristine-runtime.json',
		root: 'packages/markdown/upstream/source',
		file: 'packages/markdown/upstream/source/test.jsx',
		inventory: 'packages/markdown/audit/test-inventory.json',
	},
	{
		project: 'markdown',
		destination: 'packages/markdown/audit/adapted-runtime.json',
		roots: ['packages/markdown/tests'],
		include: (file) => adaptedFiles.includes(file),
	},
];

for (const lane of lanes) {
	if (lane.inventory) {
		const upstream = JSON.parse(readFileSync(resolve(root, lane.inventory), 'utf8'));
		const inventory = {
			schemaVersion: 1,
			root: lane.root,
			snapshots: 0,
			tests: upstream.cases
				.map((test) => ({ file: lane.file, fullName: test.title, status: 'passed' }))
				.sort(compareTestIdentities),
		};
		const destination = resolve(root, lane.destination);
		writeFileSync(
			destination,
			await format(JSON.stringify(inventory), {
				...(await resolveConfig(destination)),
				filepath: destination,
			}),
		);
		console.log(`${lane.destination}: ${inventory.tests.length} tests`);
		continue;
	}
	const output = execFileSync(
		process.execPath,
		['node_modules/vitest/vitest.mjs', 'list', '--project', lane.project, '--json'],
		{ cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
	);
	const tests = JSON.parse(output)
		.map((test) => ({
			file: toPortablePath(relative(root, test.file)),
			fullName: test.name.replaceAll(' > ', ' '),
		}))
		.filter((test) => lane.include(test.file))
		.map((test) => ({
			id: `runtime:${createHash('sha256')
				.update(`${test.file}\0${test.fullName}`)
				.digest('hex')
				.slice(0, 16)}`,
			...test,
		}))
		.sort(compareTestIdentities);
	const inventory = {
		schemaVersion: 1,
		project: lane.project,
		roots: lane.roots,
		files: [...new Set(tests.map((test) => test.file))].sort(),
		tests,
	};
	const destination = resolve(root, lane.destination);
	writeFileSync(
		destination,
		await format(JSON.stringify(inventory), {
			...(await resolveConfig(destination)),
			filepath: destination,
		}),
	);
	console.log(`${lane.destination}: ${tests.length} tests`);
}
