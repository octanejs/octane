#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const adaptedRoots = ['packages/dropzone/tests/adapted'];
const lanes = [
	{
		project: 'dropzone-pristine',
		roots: ['packages/dropzone/upstream/canonical/src'],
		keep: (file) => file.startsWith('packages/dropzone/upstream/canonical/src/'),
		output: 'packages/dropzone/audit/runtime-inventories/pristine-harness.json',
	},
	{
		project: 'dropzone',
		roots: adaptedRoots,
		// Full-suite DOM inventory is adapted upstream cases only; Octane-only probes
		// stay in ordinary shards and are not adapted-suite evidence.
		keep: (file) => file.startsWith('packages/dropzone/tests/adapted/'),
		output: 'packages/dropzone/audit/runtime-inventories/adapted-dom.json',
	},
];

const portable = (value) => value.replaceAll('\\', '/');
const identityId = (file, fullName) =>
	`runtime:${createHash('sha256').update(`${file}\0${fullName}`).digest('hex').slice(0, 16)}`;

for (const lane of lanes) {
	const listed = JSON.parse(
		execFileSync(
			process.execPath,
			['node_modules/vitest/vitest.mjs', 'list', '--project', lane.project, '--json'],
			{ cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
		),
	);
	const identityCounts = new Map();
	const tests = listed
		.map((test) => {
			const file = portable(relative(root, test.file));
			const fullName = test.name.replaceAll(' > ', ' ');
			const identity = `${file}\0${fullName}`;
			const occurrence = (identityCounts.get(identity) ?? 0) + 1;
			identityCounts.set(identity, occurrence);
			return { id: `${identityId(file, fullName)}:${occurrence}`, file, fullName };
		})
		.filter(({ file }) => lane.keep(file))
		.sort((left, right) => {
			const leftKey = `${left.file}\0${left.fullName}`;
			const rightKey = `${right.file}\0${right.fullName}`;
			return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
		});
	const files = [...new Set(tests.map(({ file }) => file))].sort();
	const inventory = { schemaVersion: 1, project: lane.project, roots: lane.roots, files, tests };
	mkdirSync(dirname(resolve(root, lane.output)), { recursive: true });
	writeFileSync(resolve(root, lane.output), `${JSON.stringify(inventory, null, 2)}\n`);
	console.log(`${lane.output}: ${files.length} files, ${tests.length} tests`);
}
