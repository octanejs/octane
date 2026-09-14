#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectVitestTests, compareTestIdentities, toPortablePath } from './harness-lib.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const lanes = [
	[
		'hook-form-pristine-browser',
		'packages/hook-form/audit/pristine-browser-wrapper-runtime.json',
		false,
	],
	[
		'hook-form-adapted-browser',
		'packages/hook-form/audit/adapted-browser-wrapper-runtime.json',
		false,
	],
	['hook-form', 'packages/hook-form/audit/adapted-runtime.json', true],
	['hook-form', 'packages/hook-form/audit/native-runtime.json', false],
	['hook-form-browser', 'packages/hook-form/audit/browser-runtime.json', false],
	['hook-form-server', 'packages/hook-form/audit/adapted-runtime-server.json', true],
];

const collections = new Map();
for (const [project, destination, upstream] of lanes) {
	const idOccurrences = new Map();
	if (!collections.has(project)) collections.set(project, await collectVitestTests(project, root));
	const tests = collections
		.get(project)
		.map((test) => ({ ...test, relativeFile: toPortablePath(relative(root, test.file)) }))
		.filter(
			(test) => test.relativeFile.startsWith('packages/hook-form/tests/upstream/') === upstream,
		)
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
		roots: [upstream ? 'packages/hook-form/tests/upstream' : 'packages/hook-form/tests'],
		files: [...new Set(tests.map((test) => test.file))],
		tests,
	};
	const absolute = resolve(root, destination);
	mkdirSync(dirname(absolute), { recursive: true });
	writeFileSync(absolute, `${JSON.stringify(inventory, null, 2)}\n`);
	console.log(`${destination}: ${tests.length} tests`);
}
