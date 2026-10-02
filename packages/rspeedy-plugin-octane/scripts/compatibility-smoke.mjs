#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
	cpSync,
	existsSync,
	mkdtempSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LYNX_TOOLCHAIN_LANES } from '../src/toolchain-lanes.js';
import { verifyCompatibilityConsumer } from './compatibility-consumer.mjs';
import { packPackage } from '../../../scripts/pack-package.mjs';

const WORKSPACE_ROOT = resolve(import.meta.dirname, '../../..');
const FIXTURE = resolve(import.meta.dirname, '../tests/_fixtures/application');
const WORKSPACE_PACKAGES = Object.freeze({
	octane: resolve(WORKSPACE_ROOT, 'packages/octane'),
	'@octanejs/lynx': resolve(WORKSPACE_ROOT, 'packages/lynx'),
	'@octanejs/rspack-plugin': resolve(WORKSPACE_ROOT, 'packages/rspack-plugin-octane'),
	'@octanejs/rspeedy-plugin': resolve(WORKSPACE_ROOT, 'packages/rspeedy-plugin-octane'),
});

function parseArguments(args) {
	let lane;
	for (let index = 0; index < args.length; index++) {
		const argument = args[index];
		if (argument === '--lane') {
			lane = args[++index];
			if (lane === undefined) throw new Error('--lane requires a value');
			continue;
		}
		throw new Error(`unknown argument ${JSON.stringify(argument)}`);
	}
	if (lane !== undefined && !Object.hasOwn(LYNX_TOOLCHAIN_LANES, lane)) {
		throw new Error(`unknown compatibility lane ${JSON.stringify(lane)}`);
	}
	return lane === undefined ? Object.keys(LYNX_TOOLCHAIN_LANES) : [lane];
}

function packWorkspacePackages(directory) {
	return Object.fromEntries(
		Object.entries(WORKSPACE_PACKAGES).map(([name, packageRoot]) => {
			const destination = join(directory, name.replaceAll('/', '-').replaceAll('@', ''));
			return [name, packPackage(packageRoot, destination, { root: WORKSPACE_ROOT }).archive];
		}),
	);
}

function installConsumer(root, lane, archives) {
	mkdirSync(root, { recursive: true });
	cpSync(join(FIXTURE, 'src'), join(root, 'src'), { recursive: true });
	const archiveSpecs = Object.fromEntries(
		Object.entries(archives).map(([name, archive]) => [name, `file:${archive}`]),
	);
	writeFileSync(
		join(root, 'package.json'),
		`${JSON.stringify(
			{
				name: `octane-lynx-${lane.description.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}`,
				private: true,
				type: 'module',
				dependencies: {
					...lane.packages,
					'@octanejs/lynx': archiveSpecs['@octanejs/lynx'],
					'@octanejs/rspack-plugin': archiveSpecs['@octanejs/rspack-plugin'],
					'@octanejs/rspeedy-plugin': archiveSpecs['@octanejs/rspeedy-plugin'],
					octane: archiveSpecs.octane,
				},
				overrides: archiveSpecs,
			},
			null,
			2,
		)}\n`,
		'utf8',
	);
	const install = spawnSync(
		'bun',
		[
			'install',
			'--prefer-offline',
			'--ignore-scripts',
			'--no-save',
			'--linker',
			'isolated',
			'--omit',
			'peer',
		],
		{
			cwd: root,
			encoding: 'utf8',
			env: { ...process.env, CI: '1' },
			stdio: ['ignore', 'pipe', 'pipe'],
			timeout: 180_000,
		},
	);
	process.stdout.write(install.stdout ?? '');
	process.stderr.write(install.stderr ?? '');
	if (install.error) throw install.error;
	assert.equal(install.status, 0, 'bun install failed');
	assert.doesNotMatch(
		`${install.stdout}${install.stderr}`,
		/incorrect peer dependency/,
		'bun install reported unmet peer dependencies', // Bun has no --strict-peer-dependencies
	);
	assert.equal(existsSync(join(root, 'bun.lock')), false, 'smoke created a lockfile');
}

const lanes = parseArguments(process.argv.slice(2));
const repositoryLockfile = join(WORKSPACE_ROOT, 'bun.lock');
const lockfileBefore = readFileSync(repositoryLockfile);

if (lanes.length > 1) {
	// Rspack and TASM both load native state. Keep lane verification in separate
	// processes so loading a second physical consumer cannot reuse the first
	// consumer's native module state (and sporadically segfault on teardown/build).
	const script = fileURLToPath(import.meta.url);
	for (const laneName of lanes) {
		const args = [script, '--lane', laneName];
		execFileSync(process.execPath, args, {
			cwd: WORKSPACE_ROOT,
			stdio: 'inherit',
			// Allow four sequential five-minute packs, installation, and both
			// clean native builds to complete within the per-lane parent guard.
			timeout: 1_800_000,
		});
	}
	assert.deepEqual(
		readFileSync(repositoryLockfile),
		lockfileBefore,
		'compatibility smoke changed the repository lockfile',
	);
	console.log('minimum and current compatibility lanes passed in isolated processes');
} else {
	const temporaryRoot = mkdtempSync(join(tmpdir(), 'octane-lynx-compatibility-'));
	try {
		const archives = packWorkspacePackages(join(temporaryRoot, 'archives'));
		for (const laneName of lanes) {
			const lane = LYNX_TOOLCHAIN_LANES[laneName];
			const consumerRoot = join(temporaryRoot, laneName);
			installConsumer(consumerRoot, lane, archives);
			const result = await verifyCompatibilityConsumer({
				consumerRoot,
				laneName,
				workspaceRoot: WORKSPACE_ROOT,
			});
			console.log(JSON.stringify(result, null, 2));
		}
		assert.deepEqual(
			readFileSync(repositoryLockfile),
			lockfileBefore,
			'compatibility smoke changed the repository lockfile',
		);
	} finally {
		rmSync(temporaryRoot, { recursive: true, force: true });
	}
}
