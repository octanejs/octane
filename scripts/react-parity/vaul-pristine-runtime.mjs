#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compareTestIdentities, toPortablePath } from './harness-lib.mjs';
import { verifyVaulUpstream } from '../../packages/vaul/scripts/verify-upstream.mjs';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../packages/vaul');
const upstreamRoot = join(packageRoot, 'upstream');

function rewriteTestPackageJson(packageJsonPath) {
	const manifest = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
	if (manifest.dependencies?.vaul === 'workspace:^') {
		manifest.dependencies.vaul = '1.1.2';
		writeFileSync(packageJsonPath, `${JSON.stringify(manifest, null, 2)}\n`);
	}
}

function prepareRootPackageJson(packageJsonPath) {
	const manifest = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
	manifest.packageManager = 'pnpm@11.15.1';
	manifest.pnpm = {
		...(manifest.pnpm ?? {}),
		dangerouslyAllowAllBuilds: true,
	};
	writeFileSync(packageJsonPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

function reservePort() {
	const result = spawnSync(
		process.execPath,
		[
			'-e',
			"const net=require('net');const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const {port}=s.address();s.close(()=>process.stdout.write(String(port)));});",
		],
		{ encoding: 'utf8' },
	);
	const port = Number((result.stdout ?? '').trim());
	if (!Number.isInteger(port) || port <= 0) {
		throw new Error(`failed to reserve a local port for pristine Vaul: ${result.stderr}`);
	}
	return port;
}

function preparePlaywrightConfig(configPath, reportFile, port) {
	let source = readFileSync(configPath, 'utf8');
	source = source.replace(
		/reporter:\s*'html'\s*,/u,
		`reporter: [['json', { outputFile: ${JSON.stringify(reportFile)} }]],`,
	);
	source = source.replace(
		/baseURL:\s*'http:\/\/localhost:3000'\s*,/u,
		`baseURL: 'http://127.0.0.1:${port}',`,
	);
	source = source.replace(
		/command:\s*'npm run dev'\s*,/u,
		`command: 'npm run dev -- --port ${port} --hostname 127.0.0.1',`,
	);
	source = source.replace(
		/url:\s*'http:\/\/localhost:3000'\s*,/u,
		`url: 'http://127.0.0.1:${port}',`,
	);
	writeFileSync(configPath, source);
}

function normalizePlaywrightStatus(entry) {
	const results = entry.results ?? [];
	const last = results[results.length - 1];
	const raw = last?.status ?? entry.status ?? 'unknown';
	if (raw === 'skipped' || raw === 'pending') return raw;
	if (
		raw === 'passed' ||
		raw === 'expected' ||
		entry.status === 'expected' ||
		entry.status === 'flaky' ||
		entry.ok === true
	) {
		return 'passed';
	}
	return raw;
}

function collectPlaywrightTests(suite, ancestors, out) {
	const titles = [...ancestors, suite.title].filter(Boolean);
	for (const spec of suite.specs ?? []) {
		const fullBase = [...titles, spec.title].filter(Boolean).join(' ');
		for (const entry of spec.tests ?? []) {
			const status = normalizePlaywrightStatus(entry);
			if (status === 'skipped' || status === 'pending') continue;
			const project = entry.projectName ? ` [${entry.projectName}]` : '';
			out.push({
				file: spec.file ?? suite.file ?? '',
				fullName: `${fullBase}${project}`,
				status,
			});
		}
	}
	for (const child of suite.suites ?? []) {
		collectPlaywrightTests(child, titles, out);
	}
}

function resolveReportFile(file, runRoot) {
	if (!file) return file;
	if (existsSync(file)) return file;
	const fromRoot = resolve(runRoot, file);
	if (existsSync(fromRoot)) return fromRoot;
	const fromTestDir = resolve(runRoot, 'test', file);
	if (existsSync(fromTestDir)) return fromTestDir;
	return fromRoot;
}

export function pristineTestIdentities(report, repoRoot = resolve(packageRoot, '../..'), runRoot) {
	const identities = [];
	for (const suite of report.suites ?? []) {
		collectPlaywrightTests(suite, [], identities);
	}
	return identities
		.map(function toPortable(identity) {
			const absoluteFile = resolveReportFile(identity.file, runRoot ?? packageRoot);
			const relativeFile = toPortablePath(relative(repoRoot, absoluteFile));
			const portable = relativeFile.includes('/.pristine-upstream-')
				? relativeFile.replace(
						/^packages\/vaul\/\.pristine-upstream-[^/]+\//u,
						'packages/vaul/upstream/',
					)
				: relativeFile;
			return {
				file: portable,
				fullName: identity.fullName,
				status: identity.status,
			};
		})
		.sort(compareTestIdentities);
}

function runCommand(command, args, options) {
	const result = spawnSync(command, args, {
		encoding: 'utf8',
		...options,
	});
	return {
		status: result.status ?? 1,
		stdout: result.stdout ?? '',
		stderr: result.stderr ?? '',
	};
}

export function runPristineUpstreamSuite({
	repoRoot = resolve(packageRoot, '../..'),
	reportPath = join(tmpdir(), `octane-vaul-pristine-${process.pid}.json`),
} = {}) {
	verifyVaulUpstream(packageRoot);
	const runRoot = mkdtempSync(join(packageRoot, '.pristine-upstream-'));
	try {
		cpSync(upstreamRoot, runRoot, { recursive: true });
		rmSync(join(runRoot, 'SHA256SUMS'), { force: true });
		prepareRootPackageJson(join(runRoot, 'package.json'));
		rewriteTestPackageJson(join(runRoot, 'test/package.json'));
		preparePlaywrightConfig(join(runRoot, 'playwright.config.ts'), reportPath, reservePort());

		const install = runCommand(
			'pnpm',
			['install', '--no-frozen-lockfile', '--config.dangerouslyAllowAllBuilds=true'],
			{
				cwd: runRoot,
				env: {
					...process.env,
					CI: process.env.CI ?? 'true',
					COREPACK_ENABLE_AUTO_PIN: '0',
				},
			},
		);
		if (install.status !== 0) {
			return {
				status: install.status,
				stdout: install.stdout,
				stderr: `${install.stderr}\npnpm install failed in pristine Vaul tree`,
				report: { suites: [] },
				identities: [],
			};
		}

		const browsers = runCommand('pnpm', ['exec', 'playwright', 'install'], {
			cwd: runRoot,
			env: { ...process.env, CI: process.env.CI ?? 'true' },
		});
		if (browsers.status !== 0) {
			return {
				status: browsers.status,
				stdout: `${install.stdout}\n${browsers.stdout}`,
				stderr: `${browsers.stderr}\nplaywright install failed in pristine Vaul tree`,
				report: { suites: [] },
				identities: [],
			};
		}

		const result = runCommand(
			'pnpm',
			['exec', 'playwright', 'test', '--config', 'playwright.config.ts'],
			{
				cwd: runRoot,
				env: { ...process.env, CI: process.env.CI ?? 'true' },
			},
		);

		let report = { suites: [] };
		if (existsSync(reportPath)) {
			report = JSON.parse(readFileSync(reportPath, 'utf8'));
		} else {
			const jsonText = result.stdout.trim();
			const start = jsonText.lastIndexOf('{');
			if (start !== -1) report = JSON.parse(jsonText.slice(start));
		}

		return {
			status: result.status ?? 1,
			stdout: result.stdout ?? '',
			stderr: result.stderr ?? '',
			report,
			identities: pristineTestIdentities(report, repoRoot, runRoot),
		};
	} finally {
		rmSync(runRoot, { recursive: true, force: true });
	}
}

export function inventoryFromIdentities(identities) {
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
		project: 'vaul-pristine',
		roots: ['packages/vaul/upstream'],
		files: [
			...new Set(
				tests.map(function fileOf(test) {
					return test.file;
				}),
			),
		].sort(),
		tests,
		snapshots: 0,
	};
}

if (process.argv.includes('--write')) {
	const destination = join(packageRoot, 'audit/pristine-runtime.json');
	const wrapperDestination = join(packageRoot, 'audit/pristine-wrapper-runtime.json');
	const result = runPristineUpstreamSuite();
	if (result.stdout) process.stdout.write(result.stdout);
	if (result.stderr) process.stderr.write(result.stderr);
	if (result.status !== 0) {
		console.error('Vaul pristine upstream suite failed; inventory not written.');
		process.exit(result.status ?? 1);
	}
	const inventory = inventoryFromIdentities(result.identities);
	writeFileSync(destination, `${JSON.stringify(inventory, null, 2)}\n`);
	const wrapperFullName = 'runs the pinned vaul 1.1.2 Playwright suite unchanged';
	const wrapperFile = 'packages/vaul/tests/upstream-original.test.ts';
	writeFileSync(
		wrapperDestination,
		`${JSON.stringify(
			{
				schemaVersion: 1,
				project: 'vaul-pristine',
				roots: ['packages/vaul/tests'],
				files: [wrapperFile],
				tests: [
					{
						id: `runtime:${createHash('sha256')
							.update(`${wrapperFile}\0${wrapperFullName}`)
							.digest('hex')
							.slice(0, 16)}`,
						file: wrapperFile,
						fullName: wrapperFullName,
					},
				],
			},
			null,
			2,
		)}\n`,
	);
	console.log(
		`packages/vaul/audit/pristine-runtime.json: ${inventory.tests.length} tests; wrapper inventory written.`,
	);
}
