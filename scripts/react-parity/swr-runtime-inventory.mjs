#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compareTestIdentities, toPortablePath } from './harness-lib.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));

const pristine = execFileSync(
	process.execPath,
	[
		'scripts/react-parity/jest-full-runner.mjs',
		'--config',
		'packages/swr/audit/jest-pristine.config.mjs',
		'--root',
		'packages/swr/upstream',
	],
	{ cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
);
writeFileSync(
	resolve(root, 'packages/swr/audit/pristine-runtime.json'),
	`${JSON.stringify(JSON.parse(pristine), null, 2)}\n`,
);

const listed = execFileSync(
	process.execPath,
	['node_modules/vitest/vitest.mjs', 'list', '--project', 'swr', '--json'],
	{ cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
);
const occurrences = new Map();
const tests = JSON.parse(listed)
	.map((test) => ({
		...test,
		file: toPortablePath(relative(root, test.file)),
		fullName: test.name.replaceAll(' > ', ' '),
	}))
	.filter((test) => test.file.startsWith('packages/swr/tests/upstream/'))
	.map((test) => {
		const baseId = `runtime:${createHash('sha256')
			.update(`${test.file}\0${test.fullName}`)
			.digest('hex')
			.slice(0, 16)}`;
		const occurrence = occurrences.get(baseId) ?? 0;
		occurrences.set(baseId, occurrence + 1);
		return {
			id: occurrence === 0 ? baseId : `${baseId}:${occurrence + 1}`,
			file: test.file,
			fullName: test.fullName,
		};
	})
	.sort(compareTestIdentities);

writeFileSync(
	resolve(root, 'packages/swr/audit/adapted-runtime.json'),
	`${JSON.stringify(
		{
			schemaVersion: 1,
			project: 'swr',
			roots: ['packages/swr/tests/upstream'],
			files: [...new Set(tests.map((test) => test.file))],
			tests,
		},
		null,
		2,
	)}\n`,
);

console.log(`SWR pristine: ${JSON.parse(pristine).tests.length} tests`);
console.log(`SWR adapted: ${tests.length} tests`);
