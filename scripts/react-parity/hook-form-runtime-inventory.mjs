#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareTestIdentities, toPortablePath } from './harness-lib.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const lanes = [
	['hook-form', 'packages/hook-form/audit/adapted-runtime.json'],
	['hook-form-server', 'packages/hook-form/audit/adapted-runtime-server.json'],
];

for (const [project, destination] of lanes) {
	const idOccurrences = new Map();
	const output = execFileSync(
		process.execPath,
		['node_modules/vitest/vitest.mjs', 'list', '--project', project, '--json'],
		{ cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
	);
	const tests = JSON.parse(output)
		.map((test) => ({ ...test, relativeFile: toPortablePath(relative(root, test.file)) }))
		.filter((test) => test.relativeFile.startsWith('packages/hook-form/tests/upstream/'))
		.map((test) => {
			const baseId = `runtime:${createHash('sha256')
				.update(`${test.relativeFile}\0${test.name.replaceAll(' > ', ' ')}`)
				.digest('hex')
				.slice(0, 16)}`;
			const occurrence = idOccurrences.get(baseId) ?? 0;
			idOccurrences.set(baseId, occurrence + 1);
			return {
				id: occurrence === 0 ? baseId : `${baseId}:${occurrence + 1}`,
				file: test.relativeFile,
				fullName: test.name.replaceAll(' > ', ' '),
			};
		})
		.sort(compareTestIdentities);
	const inventory = {
		schemaVersion: 1,
		project,
		roots: ['packages/hook-form/tests/upstream'],
		files: [...new Set(tests.map((test) => test.file))],
		tests,
	};
	const absolute = resolve(root, destination);
	mkdirSync(dirname(absolute), { recursive: true });
	writeFileSync(absolute, `${JSON.stringify(inventory, null, 2)}\n`);
	console.log(`${destination}: ${tests.length} tests`);
}
