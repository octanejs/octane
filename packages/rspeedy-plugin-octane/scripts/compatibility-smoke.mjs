#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
	cpSync,
	existsSync,
	mkdtempSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LYNX_TOOLCHAIN_LANES } from '../src/toolchain-lanes.js';
import { verifyCompatibilityConsumer } from './compatibility-consumer.mjs';

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
			mkdirSync(destination, { recursive: true });
			execFileSync('pnpm', ['--dir', packageRoot, 'pack', '--pack-destination', destination], {
				cwd: WORKSPACE_ROOT,
				stdio: ['ignore', 'pipe', 'inherit'],
				timeout: 300_000,
			});
			const archives = readdirSync(destination).filter((entry) => entry.endsWith('.tgz'));
			assert.equal(archives.length, 1, `${name} should produce exactly one archive`);
			return [name, join(destination, archives[0])];
		}),
	);
}

function renderOverrides(archives) {
	return `overrides:\n${Object.entries(archives)
		.map(([name, archive]) => `  ${JSON.stringify(name)}: ${JSON.stringify(`file:${archive}`)}`)
		.join('\n')}\n`;
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
			},
			null,
			2,
		)}\n`,
		'utf8',
	);
	writeFileSync(join(root, 'pnpm-workspace.yaml'), renderOverrides(archives), 'utf8');
	execFileSync(
		'pnpm',
		[
			'install',
			'--prefer-offline',
			'--ignore-scripts',
			'--lockfile=false',
			'--config.auto-install-peers=false',
			'--strict-peer-dependencies',
		],
		{
			cwd: root,
			env: { ...process.env, CI: '1' },
			stdio: ['ignore', 'inherit', 'inherit'],
			timeout: 180_000,
		},
	);
	assert.equal(existsSync(join(root, 'pnpm-lock.yaml')), false, 'smoke created a lockfile');
}

const lanes = parseArguments(process.argv.slice(2));
const repositoryLockfile = join(WORKSPACE_ROOT, 'pnpm-lock.yaml');
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
