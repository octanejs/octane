#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
	cpSync,
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compareTestIdentities, toPortablePath } from './harness-lib.mjs';
import { verifyAlienSignalsUpstream } from '../../packages/alien-signals/scripts/verify-upstream.mjs';

const packageRoot = resolve(
	dirname(fileURLToPath(import.meta.url)),
	'../../packages/alien-signals',
);
const upstreamRoot = join(packageRoot, 'upstream');
const oracleEnvironmentPath = join(packageRoot, 'audit/pristine-oracle-environment.json');
const require = createRequire(import.meta.url);

export function resolveInstalledPackageVersion(packageName, fromPath = packageRoot) {
	const packageJsonPath = require.resolve(`${packageName}/package.json`, { paths: [fromPath] });
	return JSON.parse(readFileSync(packageJsonPath, 'utf8')).version;
}

export function assertPristineOracleEnvironment({
	environmentPath = oracleEnvironmentPath,
	fromPath = packageRoot,
} = {}) {
	if (!existsSync(environmentPath)) {
		throw new Error(
			`missing pristine oracle environment record: ${relative(resolve(packageRoot, '../..'), environmentPath)}`,
		);
	}
	const recorded = JSON.parse(readFileSync(environmentPath, 'utf8'));
	if (!recorded.packages || typeof recorded.packages !== 'object') {
		throw new Error('pristine oracle environment must declare packages');
	}
	const actual = {};
	for (const [packageName, expectedVersion] of Object.entries(recorded.packages)) {
		const version = resolveInstalledPackageVersion(packageName, fromPath);
		actual[packageName] = version;
		if (version !== expectedVersion) {
			throw new Error(
				`pristine oracle environment drift for ${packageName}: expected ${expectedVersion} (recorded intentional workspace oracle) but node_modules resolved ${version}`,
			);
		}
	}
	return { policy: recorded.policy, packages: actual };
}

function resolveBunBinary() {
	try {
		const packageJsonPath = require.resolve('bun/package.json', { paths: [packageRoot] });
		const bunPackageRoot = dirname(packageJsonPath);
		const candidates = [
			join(bunPackageRoot, 'bin', 'bun'),
			join(bunPackageRoot, 'bin', 'bun.exe'),
			join(packageRoot, 'node_modules', '.bin', 'bun'),
		];
		for (const candidate of candidates) {
			if (existsSync(candidate)) return candidate;
		}
	} catch {
		// Fall through to PATH lookup.
	}
	return 'bun';
}

function decodeXmlAttribute(value) {
	return value
		.replaceAll('&lt;', '<')
		.replaceAll('&gt;', '>')
		.replaceAll('&quot;', '"')
		.replaceAll('&apos;', "'")
		.replaceAll('&amp;', '&');
}

// bun's console ledger is not a stable machine surface: bun 1.3 omits the
// per-test `(pass)` lines entirely in some environments (for example when it
// detects an AI-agent session via CLAUDECODE), so identities must come from
// the JUnit report file instead.
export function parseJUnitIdentities(xml) {
	const identities = [];
	const portableFile = 'packages/alien-signals/upstream/src/index.test.ts';
	const testcasePattern = /<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g;
	for (const match of xml.matchAll(testcasePattern)) {
		const attributes = match[1];
		const body = match[2] ?? '';
		const name = decodeXmlAttribute(/\bname="([^"]*)"/.exec(attributes)?.[1] ?? '');
		const classname = decodeXmlAttribute(/\bclassname="([^"]*)"/.exec(attributes)?.[1] ?? '');
		const status = /<failure\b|<error\b/.test(body)
			? 'failed'
			: /<skipped\b/.test(body)
				? 'skipped'
				: 'passed';
		identities.push({
			file: portableFile,
			fullName: `${classname} ${name}`.replaceAll(' > ', ' ').trim(),
			status,
		});
	}
	return identities.sort(compareTestIdentities);
}

export function inventoryFromIdentities(identities, project = 'alien-signals-pristine') {
	const idOccurrences = new Map();
	const tests = identities
		.filter(function keepPassed(test) {
			return test.status === 'passed';
		})
		.map(function toInventoryEntry(test) {
			const baseId = `runtime:${createHash('sha256')
				.update(`${test.file}\0${test.fullName}`)
				.digest('hex')
				.slice(0, 16)}`;
			const occurrence = idOccurrences.get(baseId) ?? 0;
			idOccurrences.set(baseId, occurrence + 1);
			return {
				id: occurrence === 0 ? baseId : `${baseId}:${occurrence + 1}`,
				file: test.file,
				fullName: test.fullName,
			};
		})
		.sort(compareTestIdentities);
	return {
		schemaVersion: 1,
		project,
		roots: ['packages/alien-signals/upstream'],
		files: [
			...new Set(
				tests.map(function fileOf(test) {
					return test.file;
				}),
			),
		].sort(),
		tests,
	};
}

export function runPristineUpstreamSuite({ repoRoot = resolve(packageRoot, '../..') } = {}) {
	verifyAlienSignalsUpstream(packageRoot);
	const oracleEnvironment = assertPristineOracleEnvironment();
	const runRoot = mkdtempSync(join(tmpdir(), 'octane-alien-signals-pristine-'));
	try {
		cpSync(join(upstreamRoot, 'src'), join(runRoot, 'src'), { recursive: true });
		writeFileSync(
			join(runRoot, 'package.json'),
			`${JSON.stringify(
				{
					name: 'alien-signals-pristine-run',
					private: true,
					type: 'module',
					octanePristineOracle: oracleEnvironment,
				},
				null,
				'\t',
			)}\n`,
		);
		symlinkSync(join(packageRoot, 'node_modules'), join(runRoot, 'node_modules'), 'dir');
		const bunBinary = resolveBunBinary();
		const junitReport = join(runRoot, 'pristine-junit.xml');
		const result = spawnSync(
			bunBinary,
			['test', 'src/index.test.ts', '--reporter=junit', `--reporter-outfile=${junitReport}`],
			{
				cwd: runRoot,
				encoding: 'utf8',
			},
		);
		const stdout = result.stdout ?? '';
		const stderr = result.stderr ?? '';
		const identities = parseJUnitIdentities(
			existsSync(junitReport) ? readFileSync(junitReport, 'utf8') : '',
		);
		return {
			status: result.status ?? 1,
			stdout,
			stderr,
			identities,
			portableRoots: [toPortablePath(relative(repoRoot, upstreamRoot))],
		};
	} finally {
		rmSync(runRoot, { recursive: true, force: true });
	}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const result = runPristineUpstreamSuite();
	if (result.stdout) process.stdout.write(result.stdout);
	if (result.stderr) process.stderr.write(result.stderr);
	process.exitCode = result.status === 0 ? 0 : 1;
}
