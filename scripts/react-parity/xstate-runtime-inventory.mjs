#!/usr/bin/env node
// Writes the Vitest runtime inventories that packages/xstate{,-store}/audit/
// react-parity.json reference as `execution.inventory`.
//
// Two inventory kinds are produced per package:
//
//   * the pristine *wrapper* inventory, which is what the `*-pristine` Vitest
//     project actually executes — a single case that spawns the vendored suite
//     in a child run. The inner 144/19 upstream identities are recorded
//     separately in `audit/pristine-runtime.json` by the pristine runners and
//     ride along as support evidence.
//   * the adapted inventory, which covers only the one-for-one adapted upstream
//     drivers. Octane-only conformance cases share the same Vitest project but
//     are deliberately excluded: they are not React-parity evidence, and the
//     manifest's `adaptedRoots.tests` must match this file set exactly.
//
// Identity ids follow the scheme already used by the pristine runners:
// `runtime:<sha256(file\0fullName)[0..16]>`, suffixed `:N` only on collision.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';

import { compareTestIdentities, toPortablePath } from './harness-lib.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const lanes = [
	{
		project: 'xstate-pristine',
		roots: ['packages/xstate/tests'],
		keep: (file) => file === 'packages/xstate/tests/upstream-original.test.ts',
		output: 'packages/xstate/audit/pristine-wrapper-runtime.json',
	},
	{
		project: 'xstate',
		roots: ['packages/xstate/tests/conformance'],
		keep: (file) => /^packages\/xstate\/tests\/conformance\/upstream-.*\.test\.ts$/u.test(file),
		output: 'packages/xstate/audit/adapted-runtime.json',
	},
	{
		project: 'xstate-store-pristine',
		roots: ['packages/xstate-store/tests'],
		keep: (file) => file === 'packages/xstate-store/tests/upstream-original.test.ts',
		output: 'packages/xstate-store/audit/pristine-wrapper-runtime.json',
	},
	{
		project: 'xstate-store',
		roots: ['packages/xstate-store/tests/conformance'],
		keep: (file) =>
			/^packages\/xstate-store\/tests\/conformance\/upstream-.*\.test\.ts$/u.test(file),
		output: 'packages/xstate-store/audit/adapted-runtime.json',
	},
];

const identityId = (file, fullName) =>
	`runtime:${createHash('sha256').update(`${file}\0${fullName}`).digest('hex').slice(0, 16)}`;

for (const lane of lanes) {
	const listed = JSON.parse(
		execFileSync(
			process.execPath,
			['node_modules/vitest/vitest.mjs', 'list', '--project', lane.project, '--json'],
			{ cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
		),
	);
	const occurrences = new Map();
	const tests = listed
		.map((test) => ({
			file: toPortablePath(relative(root, test.file)),
			fullName: test.name.replaceAll(' > ', ' '),
		}))
		.filter(({ file }) => lane.keep(file))
		.sort(compareTestIdentities)
		.map(({ file, fullName }) => {
			const baseId = identityId(file, fullName);
			const occurrence = occurrences.get(baseId) ?? 0;
			occurrences.set(baseId, occurrence + 1);
			return { id: occurrence === 0 ? baseId : `${baseId}:${occurrence + 1}`, file, fullName };
		});
	const files = [...new Set(tests.map(({ file }) => file))].sort();
	const inventory = { schemaVersion: 1, project: lane.project, roots: lane.roots, files, tests };
	const output = resolve(root, lane.output);
	mkdirSync(dirname(output), { recursive: true });
	// Emitted through Prettier so a later `pnpm format` cannot rewrite these bytes
	// and silently invalidate the sha256 the parity manifests record for them.
	writeFileSync(
		output,
		await format(JSON.stringify(inventory, null, 2), {
			...(await resolveConfig(output)),
			filepath: output,
		}),
	);
	console.log(`${lane.output}: ${files.length} files, ${tests.length} tests`);
}
