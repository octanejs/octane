#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
	cpSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const packageRoot = resolve(import.meta.dirname, '../..');
const temporary = mkdtempSync(resolve(tmpdir(), 'octane-swr-pack-'));
const installRoot = resolve(temporary, 'consumer');
const installedPackage = resolve(installRoot, 'node_modules/@octanejs/swr');

function runNode(args, expectedStatus = 0) {
	const result = spawnSync(process.execPath, args, {
		cwd: installRoot,
		encoding: 'utf8',
	});
	assert.equal(result.status, expectedStatus, `${result.stdout}\n${result.stderr}`);
	return result.stdout.trim();
}

try {
	mkdirSync(installedPackage, { recursive: true });
	const packedJson = JSON.parse(
		execFileSync('npm', ['pack', '--json', '--pack-destination', temporary], {
			cwd: packageRoot,
			encoding: 'utf8',
			env: { ...process.env, npm_config_cache: resolve(temporary, 'npm-cache') },
		}),
	);
	const tarball = resolve(temporary, packedJson[0].filename);
	const unpack = resolve(temporary, 'unpack');
	mkdirSync(unpack);
	execFileSync('tar', ['-xzf', tarball, '-C', unpack]);
	cpSync(resolve(unpack, 'package'), installedPackage, { recursive: true });
	// Model the dependency links a package-manager install creates around the
	// extracted tarball. The gate remains network-free and exercises the packed
	// package's declared authored-source imports.
	symlinkSync(resolve(packageRoot, '../octane'), resolve(installRoot, 'node_modules/octane'));
	symlinkSync(
		realpathSync(resolve(packageRoot, 'node_modules/dequal')),
		resolve(installRoot, 'node_modules/dequal'),
	);
	symlinkSync(
		realpathSync(resolve(packageRoot, '../../node_modules/@types')),
		resolve(installRoot, 'node_modules/@types'),
	);

	const esm = JSON.parse(
		runNode([
			'--input-type=module',
			'-e',
			`console.log(JSON.stringify({r:import.meta.resolve('@octanejs/swr'),i:import.meta.resolve('@octanejs/swr/infinite'),m:import.meta.resolve('@octanejs/swr/immutable'),u:import.meta.resolve('@octanejs/swr/mutation'),s:import.meta.resolve('@octanejs/swr/subscription'),x:import.meta.resolve('@octanejs/swr/_internal')}))`,
		]),
	);
	assert.ok(esm.r.endsWith('/src/index/index.ts'));
	assert.ok(esm.i.endsWith('/src/infinite/index.ts'));
	assert.ok(esm.m.endsWith('/src/immutable/index.ts'));
	assert.ok(esm.u.endsWith('/src/mutation/index.ts'));
	assert.ok(esm.s.endsWith('/src/subscription/index.ts'));
	assert.ok(esm.x.endsWith('/src/_internal/index.ts'));

	const cjs = JSON.parse(
		runNode([
			'-e',
			`const p=require('@octanejs/swr/package.json');console.log(JSON.stringify({r:require.resolve('@octanejs/swr'),i:require.resolve('@octanejs/swr/infinite'),name:p.name,version:p.version}))`,
		]),
	);
	assert.ok(cjs.r.endsWith('/src/index/index.cts'));
	assert.ok(cjs.i.endsWith('/src/infinite/index.cts'));
	assert.equal(cjs.name, '@octanejs/swr');
	assert.equal(cjs.version, '0.0.1');

	const server = JSON.parse(
		runNode([
			'--conditions=react-server',
			'--input-type=module',
			'-e',
			`console.log(JSON.stringify({r:import.meta.resolve('@octanejs/swr'),i:import.meta.resolve('@octanejs/swr/infinite'),x:import.meta.resolve('@octanejs/swr/_internal')}))`,
		]),
	);
	assert.ok(server.r.endsWith('/src/index/index.react-server.ts'));
	assert.ok(server.i.endsWith('/src/infinite/index.react-server.ts'));
	assert.ok(server.x.endsWith('/src/_internal/index.react-server.ts'));

	const infiniteReactServerSource = readFileSync(
		resolve(installedPackage, 'src/infinite/index.react-server.ts'),
		'utf8',
	);
	assert.match(infiniteReactServerSource, /from '\.\/serialize\.js'/);
	assert.doesNotMatch(infiniteReactServerSource, /from '\.\/index\.js'/);
	const serializeSource = readFileSync(
		resolve(installedPackage, 'src/infinite/serialize.ts'),
		'utf8',
	);
	assert.doesNotMatch(serializeSource, /from '\.\/(index|runtime|infinite)\./);

	const metadata = JSON.parse(readFileSync(resolve(installedPackage, 'package.json'), 'utf8'));
	assert.deepEqual(Object.keys(metadata.exports), [
		'./package.json',
		'.',
		'./infinite',
		'./immutable',
		'./subscription',
		'./mutation',
		'./_internal',
	]);

	const conditionSource = resolve(packageRoot, 'tests/probes/conditions');
	const conditionTarget = resolve(installRoot, 'conditions');
	cpSync(conditionSource, conditionTarget, { recursive: true });
	const require = createRequire(import.meta.url);
	const tsc = process.env.SWR_TSC_BIN || require.resolve('typescript/bin/tsc');
	for (const config of [
		'tsconfig.nodenext.json',
		'tsconfig.bundler.json',
		'tsconfig.react-server.json',
	]) {
		const result = spawnSync(process.execPath, [tsc, '-p', resolve(conditionTarget, config)], {
			cwd: installRoot,
			encoding: 'utf8',
		});
		assert.equal(result.status, 0, `${config}\n${result.stdout}\n${result.stderr}`);
	}

	console.log(
		'SWR packed export gate passed: ESM, CJS, react-server, NodeNext, Bundler, package.json',
	);
} finally {
	rmSync(temporary, { recursive: true, force: true });
}
