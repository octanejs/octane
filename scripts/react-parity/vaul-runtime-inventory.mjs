#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareTestIdentities, toPortablePath } from './harness-lib.mjs';
import { verifyVaulAdaptedRuntimeStructure } from './vaul-runtime-lib.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const classifications = JSON.parse(
	readFileSync(resolve(root, 'packages/vaul/audit/test-classifications.json'), 'utf8'),
);
const parityOwnedFiles = new Set(
	classifications.tests
		.filter(function keepParityEvidence(entry) {
			return !entry.disposition.startsWith('octane-only-');
		})
		.map(function pathOf(entry) {
			return entry.path;
		}),
);
const lanes = [
	['vaul', 'packages/vaul/audit/adapted-runtime.json'],
	['vaul-browser', 'packages/vaul/audit/adapted-runtime-browser.json'],
	['vaul-differential', 'packages/vaul/audit/adapted-runtime-differential.json'],
];

for (const [project, destination] of lanes) {
	const idOccurrences = new Map();
	const output = execFileSync(
		process.execPath,
		['node_modules/vitest/vitest.mjs', 'list', '--project', project, '--json'],
		{ cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
	);
	const tests = JSON.parse(output)
		.map(function withRelative(test) {
			return { ...test, relativeFile: toPortablePath(relative(root, test.file)) };
		})
		.filter(function keepParityOwned(test) {
			return (
				test.relativeFile.startsWith('packages/vaul/tests/') &&
				parityOwnedFiles.has(test.relativeFile)
			);
		})
		.map(function toIdentity(test) {
			const fullName = test.name.replaceAll(' > ', ' ');
			const baseId = `runtime:${createHash('sha256').update(`${test.relativeFile}\0${fullName}`).digest('hex').slice(0, 16)}`;
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
		roots: ['packages/vaul/tests'],
		files: [
			...new Set(
				tests.map(function fileOf(test) {
					return test.file;
				}),
			),
		],
		tests,
	};
	const absolute = resolve(root, destination);
	mkdirSync(dirname(absolute), { recursive: true });
	writeFileSync(absolute, `${JSON.stringify(inventory, null, 2)}\n`);
	console.log(`${destination}: ${tests.length} tests`);
}

const structural = verifyVaulAdaptedRuntimeStructure(root);
console.log(
	`adapted runtime structural crosswalk: ${structural.cases} cases across ${structural.projects.join(', ')}`,
);
