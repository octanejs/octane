#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { format, resolveConfig } from 'prettier';

import {
	compareTestIdentities,
	toPortablePath,
} from '../../../scripts/react-parity/harness-lib.mjs';
import { collectVitestTests } from '../../../scripts/react-parity/collect-vitest-tests.mjs';

const root = resolve(import.meta.dirname, '../../..');
const lock = JSON.parse(
	readFileSync(resolve(root, 'packages/grab/audit/upstream.lock.json'), 'utf8'),
);
if (lock.identity.version !== '0.2.0') {
	throw new Error('Runtime inventories must be generated against the pinned react-grab 0.2.0');
}
const lanes = [
	{
		project: 'grab-pristine',
		root: 'packages/grab/upstream',
		inventoryRoots: ['packages/grab/upstream'],
		destination: 'packages/grab/audit/pristine-runtime.json',
	},
	{
		project: 'grab',
		root: 'packages/grab/tests/upstream',
		inventoryRoots: ['packages/grab/tests/upstream'],
		destination: 'packages/grab/audit/adapted-runtime.json',
	},
	{
		project: 'grab-differential',
		root: 'packages/grab/tests/differential',
		inventoryRoots: ['packages/grab/tests/differential'],
		destination: 'packages/grab/audit/differential-runtime.json',
	},
	{
		project: 'grab-browser',
		root: 'packages/grab/tests/browser',
		inventoryRoots: ['packages/grab/tests/browser'],
		destination: 'packages/grab/audit/browser-runtime.json',
	},
];

const [flag, selectedProject, ...extra] = process.argv.slice(2);
if (
	flag &&
	(flag !== '--project' || !lanes.some((lane) => lane.project === selectedProject) || extra.length)
)
	throw new Error(
		'Supply --project with one configured inventory project, or omit it to generate all lanes',
	);
for (const lane of lanes.filter((lane) => !selectedProject || lane.project === selectedProject)) {
	const occurrences = new Map();
	const allTests = (await collectVitestTests(root, lane.project))
		.map((test) => ({ ...test, file: toPortablePath(relative(root, test.file)) }))
		.filter((test) => test.file.startsWith(`${lane.root}/`))
		.map((test) => {
			const fullName = test.name.replaceAll(' > ', ' ');
			if (!['run', 'skip', 'todo'].includes(test.mode))
				throw new Error(`Unexpected registration mode: ${test.mode}`);
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
				...(test.mode !== 'run'
					? {
							mode: test.mode,
							rationale: `The pinned suite registers this case as ${test.mode} during collection.`,
						}
					: {}),
			};
		})
		.sort(compareTestIdentities);
	const tests = allTests.filter((test) => !test.mode);
	const skippedTests = allTests.filter((test) => test.mode);
	const destination = resolve(root, lane.destination);
	writeFileSync(
		destination,
		await format(
			JSON.stringify({
				schemaVersion: 2,
				project: lane.project,
				roots: lane.inventoryRoots,
				files: readdirSync(resolve(root, lane.root), { recursive: true, withFileTypes: true })
					.filter((entry) => entry.isFile() && /\.test\.(?:ts|tsx|tsrx)$/.test(entry.name))
					.map((entry) => toPortablePath(relative(root, resolve(entry.parentPath, entry.name))))
					.sort(),
				tests,
				skippedTests,
			}),
			{
				...(await resolveConfig(destination, { editorconfig: true })),
				filepath: destination,
			},
		),
	);
	console.log(
		`${lane.destination}: ${tests.length} required passes, ${skippedTests.length} explicit skip/todo dispositions`,
	);
}
