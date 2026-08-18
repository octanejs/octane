#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

import {
	compareTestIdentities,
	toPortablePath,
} from '../../../scripts/react-parity/harness-lib.mjs';

const root = resolve(import.meta.dirname, '../../..');
const lanes = [
	{
		project: 'base-ui-differential',
		root: 'packages/base-ui/tests/differential',
		inventoryRoots: ['packages/base-ui/tests/differential'],
		destination: 'packages/base-ui/audit/differential-runtime.json',
	},
	{
		project: 'base-ui-upstream-adapted',
		root: 'packages/base-ui/tests/upstream',
		inventoryRoots: ['packages/base-ui/tests/upstream'],
		destination: 'packages/base-ui/audit/adapted-runtime.json',
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
		.filter((test) => test.file.startsWith(`${lane.root}/`))
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
	writeFileSync(
		resolve(root, lane.destination),
		`${JSON.stringify(
			{
				schemaVersion: 1,
				project: lane.project,
				roots: lane.inventoryRoots,
				files: [...new Set(tests.map((test) => test.file))],
				tests,
			},
			null,
			2,
		)}\n`,
	);
	console.log(`${lane.destination}: ${tests.length} tests`);
}
