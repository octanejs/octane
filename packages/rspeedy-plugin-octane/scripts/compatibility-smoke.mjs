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

const RSPEEDY_DEPENDENCY_REQUESTS = Object.freeze({
	'@lynx-js/cache-events-webpack-plugin': '^0.2.0',
	'@lynx-js/chunk-loading-webpack-plugin': '^0.4.1',
	'@lynx-js/debug-metadata-rsbuild-plugin': '^0.2.0',
	'@lynx-js/web-rsbuild-server-middleware': '0.22.2',
	'@lynx-js/webpack-dev-transport': '^0.3.0',
	'@lynx-js/websocket': '^0.0.4',
	'@rsbuild/core': '2.1.4',
	'@rsbuild/plugin-css-minimizer': '2.0.0',
	'@rsdoctor/rspack-plugin': '~1.5.6',
});

function parseArguments(args) {
	let lane;
	let checkRegistry = false;
	for (let index = 0; index < args.length; index++) {
		const argument = args[index];
		if (argument === '--check-registry') {
			checkRegistry = true;
			continue;
		}
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
	return {
		checkRegistry,
		lanes: lane === undefined ? Object.keys(LYNX_TOOLCHAIN_LANES) : [lane],
	};
}

function npmView(spec, fields) {
	const output = execFileSync('npm', ['view', spec, ...fields, '--json'], {
		cwd: WORKSPACE_ROOT,
		encoding: 'utf8',
		timeout: 60_000,
	});
	return JSON.parse(output);
}

function latestVersion(spec) {
	const value = npmView(spec, ['version']);
	return Array.isArray(value) ? value.at(-1) : value;
}

function checkCurrentRegistry(lane) {
	const rspeedy = npmView('@lynx-js/rspeedy@latest', [
		'version',
		'dependencies',
		'peerDependencies',
	]);
	assert.equal(rspeedy.version, lane.packages['@lynx-js/rspeedy']);
	assert.equal(rspeedy.peerDependencies.typescript, '5.1.6 - 5.9.x');
	for (const [packageName, expectedRequest] of Object.entries(RSPEEDY_DEPENDENCY_REQUESTS)) {
		assert.equal(rspeedy.dependencies[packageName], expectedRequest);
		assert.equal(latestVersion(`${packageName}@${expectedRequest}`), lane.packages[packageName]);
	}

	const rsbuild = npmView(`@rsbuild/core@${lane.packages['@rsbuild/core']}`, [
		'version',
		'dependencies',
	]);
	assert.equal(rsbuild.dependencies['@rspack/core'], '~2.1.2');
	assert.equal(
		latestVersion(`@rspack/core@${rsbuild.dependencies['@rspack/core']}`),
		lane.packages['@rspack/core'],
	);

	for (const packageName of [
		'@lynx-js/css-extract-webpack-plugin',
		'@lynx-js/runtime-wrapper-webpack-plugin',
		'@lynx-js/template-webpack-plugin',
		'@lynx-js/testing-environment',
		'@lynx-js/webpack-dev-transport',
	]) {
		assert.equal(latestVersion(`${packageName}@latest`), lane.packages[packageName]);
	}
	assert.equal(latestVersion('typescript@5.9'), lane.packages.typescript);

	const template = npmView(
		`@lynx-js/template-webpack-plugin@${lane.packages['@lynx-js/template-webpack-plugin']}`,
		['dependencies'],
	);
	assert.equal(template['@lynx-js/tasm'], lane.packages['@lynx-js/tasm']);
	assert.equal(template['@lynx-js/web-core'], lane.packages['@lynx-js/web-core']);
	assert.equal(template['@lynx-js/webpack-runtime-globals'], '^0.0.7');
	assert.equal(
		latestVersion(
			`@lynx-js/webpack-runtime-globals@${template['@lynx-js/webpack-runtime-globals']}`,
		),
		lane.packages['@lynx-js/webpack-runtime-globals'],
	);

	const debugMetadata = npmView(
		`@lynx-js/debug-metadata-rsbuild-plugin@${lane.packages['@lynx-js/debug-metadata-rsbuild-plugin']}`,
		['dependencies'],
	);
	assert.equal(debugMetadata['@lynx-js/debug-metadata'], '^0.1.0');
	assert.equal(
		latestVersion(`@lynx-js/debug-metadata@${debugMetadata['@lynx-js/debug-metadata']}`),
		lane.packages['@lynx-js/debug-metadata'],
	);

	const excluded = {
		'@lynx-js/tasm': latestVersion('@lynx-js/tasm@latest'),
		'@lynx-js/types': latestVersion('@lynx-js/types@latest'),
		'@rsbuild/core': latestVersion('@rsbuild/core@latest'),
	};
	console.log(
		`registry graph verified; standalone releases intentionally excluded by exact compatibility pins: ${JSON.stringify(excluded)}`,
	);
}

function packWorkspacePackages(directory) {
	return Object.fromEntries(
		Object.entries(WORKSPACE_PACKAGES).map(([name, packageRoot]) => {
			const destination = join(directory, name.replaceAll('/', '-').replaceAll('@', ''));
			mkdirSync(destination, { recursive: true });
			execFileSync('pnpm', ['--dir', packageRoot, 'pack', '--pack-destination', destination], {
				cwd: WORKSPACE_ROOT,
				stdio: ['ignore', 'pipe', 'inherit'],
				timeout: 120_000,
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

const options = parseArguments(process.argv.slice(2));
const repositoryLockfile = join(WORKSPACE_ROOT, 'pnpm-lock.yaml');
const lockfileBefore = readFileSync(repositoryLockfile);

if (options.lanes.length > 1) {
	// Rspack and TASM both load native state. Keep lane verification in separate
	// processes so loading a second physical consumer cannot reuse the first
	// consumer's native module state (and sporadically segfault on teardown/build).
	const script = fileURLToPath(import.meta.url);
	for (const laneName of options.lanes) {
		const args = [script, '--lane', laneName];
		if (options.checkRegistry && laneName === 'current') args.push('--check-registry');
		execFileSync(process.execPath, args, {
			cwd: WORKSPACE_ROOT,
			stdio: 'inherit',
			timeout: 600_000,
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
		for (const laneName of options.lanes) {
			const lane = LYNX_TOOLCHAIN_LANES[laneName];
			if (options.checkRegistry && laneName === 'current') checkCurrentRegistry(lane);
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
