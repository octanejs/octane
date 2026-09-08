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
const policy = JSON.parse(
	readFileSync(resolve(root, 'packages/base-ui/audit/runtime-skip-policy.json'), 'utf8'),
);
const browserPolicy = JSON.parse(
	readFileSync(resolve(root, 'packages/base-ui/audit/browser-runtime-skip-policy.json'), 'utf8'),
);
const lock = JSON.parse(
	readFileSync(resolve(root, 'packages/base-ui/audit/upstream.lock.json'), 'utf8'),
);
if (policy.commit !== lock.identity.commit || policy.environment !== 'jsdom')
	throw new Error('Runtime skip policy does not match the pinned jsdom suite');
if (browserPolicy.commit !== lock.identity.commit || browserPolicy.environment !== 'chromium')
	throw new Error('Runtime skip policy does not match the pinned Chromium suite');
const lanes = [
	...['base-ui', 'base-ui-utils'].map((name) => ({
		project: `${name}-pristine`,
		root: `packages/${name}/upstream`,
		inventoryRoots: [`packages/${name}/upstream`],
		destination: `packages/${name}/audit/pristine-runtime.json`,
	})),
	{
		project: 'base-ui-differential',
		root: 'packages/base-ui/tests/differential',
		inventoryRoots: ['packages/base-ui/tests/differential'],
		destination: 'packages/base-ui/audit/differential-runtime.json',
	},
	{
		project: 'base-ui-adapted',
		root: 'packages/base-ui/tests/upstream',
		inventoryRoots: ['packages/base-ui/tests/upstream'],
		destination: 'packages/base-ui/audit/adapted-runtime.json',
	},
	{
		project: 'base-ui-utils-adapted',
		root: 'packages/base-ui-utils/tests/upstream',
		inventoryRoots: ['packages/base-ui-utils/tests/upstream'],
		destination: 'packages/base-ui-utils/audit/adapted-runtime.json',
	},
	...['pristine', 'adapted'].map((mode) => {
		const root = `packages/base-ui/${mode === 'pristine' ? 'upstream' : 'tests/upstream'}`;
		return {
			project: `base-ui-${mode}-browser`,
			root,
			browser: true,
			inventoryRoots: [root],
			destination: `packages/base-ui/audit/${mode}-browser-runtime.json`,
		};
	}),
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
	const runtimeSkips = new Map(
		lane.browser || ['base-ui-pristine', 'base-ui-adapted'].includes(lane.project)
			? (lane.browser ? browserPolicy : policy).tests.map((test) => [
					`${lane.root}/${test.file}\0${test.fullName}`,
					test.rationale,
				])
			: [],
	);
	const allTests = (await collectVitestTests(root, lane.project))
		.map((test) => ({ ...test, file: toPortablePath(relative(root, test.file)) }))
		.filter((test) => test.file.startsWith(`${lane.root}/`))
		.map((test) => {
			const fullName = test.name.replaceAll(' > ', ' ');
			const runtimeSkip = runtimeSkips.get(`${test.file}\0${fullName}`);
			if (runtimeSkip) {
				if (test.mode !== 'run')
					throw new Error(`Runtime skip changed registration mode: ${fullName}`);
				runtimeSkips.delete(`${test.file}\0${fullName}`);
			}
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
				...(runtimeSkip || test.mode !== 'run'
					? {
							mode: test.mode,
							rationale:
								runtimeSkip ??
								`The pinned suite registers this case as ${test.mode} during collection.`,
						}
					: {}),
			};
		})
		.sort(compareTestIdentities);
	if (runtimeSkips.size) throw new Error(`Unmatched runtime skip dispositions in ${lane.project}`);
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
