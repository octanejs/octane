#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';

import { compareTestIdentities, toPortablePath } from './harness-lib.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const lanes = [
	{
		project: 'select',
		destination: 'packages/select/audit/adapted-runtime.json',
		roots: ['packages/select/tests/upstream'],
	},
	{
		project: 'select-differential',
		destination: 'packages/select/audit/differential-runtime.json',
		roots: ['packages/select/tests'],
	},
];

for (const { project, destination, roots } of lanes) {
	const output = execFileSync(
		process.execPath,
		['node_modules/vitest/vitest.mjs', 'list', '--project', project, '--json'],
		{ cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
	);
	const idOccurrences = new Map();
	const tests = JSON.parse(output)
		.map(function addRelativeFile(test) {
			return { ...test, relativeFile: toPortablePath(relative(root, test.file)) };
		})
		.filter(function keepLaneRoot(test) {
			return roots.some((laneRoot) => test.relativeFile.startsWith(`${laneRoot}/`));
		})
		.map(function inventoryEntry(test) {
			const fullName = test.name.replaceAll(' > ', ' ');
			const baseId = `runtime:${createHash('sha256')
				.update(`${test.relativeFile}\0${fullName}`)
				.digest('hex')
				.slice(0, 16)}`;
			const occurrence = idOccurrences.get(baseId) ?? 0;
			idOccurrences.set(baseId, occurrence + 1);
			return {
				id: occurrence === 0 ? baseId : `${baseId}:${occurrence + 1}`,
				file: test.relativeFile,
				fullName,
			};
		})
		.sort(compareTestIdentities);

	const inventory = {
		schemaVersion: 1,
		project,
		roots,
		files: [
			...new Set(
				tests.map(function testFile(test) {
					return test.file;
				}),
			),
		],
		tests,
	};
	const absolute = resolve(root, destination);
	mkdirSync(dirname(absolute), { recursive: true });
	writeFileSync(
		absolute,
		await format(JSON.stringify(inventory), {
			...(await resolveConfig(absolute)),
			filepath: absolute,
		}),
	);
	console.log(`${destination}: ${tests.length} tests`);
}
