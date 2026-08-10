#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compareTestIdentities, toPortablePath } from './harness-lib.mjs';

const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const args = process.argv.slice(2);

function flag(name) {
	const index = args.indexOf(name);
	if (index === -1 || !args[index + 1]) throw new Error(`Missing ${name}`);
	return args[index + 1];
}

if (args.length !== 4 || !args.every((value, index) => index % 2 === 0 || value.length > 0))
	throw new Error('Usage: playwright-full-runner.mjs --config PATH --root PATH');

const configPath = resolve(repoRoot, flag('--config'));
const suiteRoot = resolve(repoRoot, flag('--root'));
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const packageName = typeof config.packageName === 'string' ? config.packageName : 'sonner';
const packageVersion = typeof config.packageVersion === 'string' ? config.packageVersion : null;
const zodVersion = typeof config.zodVersion === 'string' ? config.zodVersion : '3.25.76';
const playwrightVersion =
	typeof config.playwrightVersion === 'string' ? config.playwrightVersion : '1.49.1';
const project = typeof config.project === 'string' ? config.project : 'chromium';

if (!packageVersion) throw new Error('playwright-full config requires packageVersion');

const workRoot = mkdtempSync(join(tmpdir(), 'octane-playwright-full-'));
const reportPath = join(workRoot, 'playwright-report.json');

function writeJson(path, value) {
	writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function run(command, commandArgs, cwd) {
	const result = spawnSync(command, commandArgs, {
		cwd,
		encoding: 'utf8',
		env: process.env,
	});
	if (result.status !== 0) {
		process.stderr.write(result.stdout ?? '');
		process.stderr.write(result.stderr ?? '');
		throw new Error(`${command} ${commandArgs.join(' ')} failed with status ${result.status}`);
	}
	return result;
}

function statusFromSpec(spec) {
	// Do not use Playwright's aggregated `ok` flag: it is also true for skipped
	// and expected-failure tests. Use the final result status after retries.
	const entries = spec.tests ?? [];
	if (entries.length === 0) return 'failed';
	let sawSkipped = false;
	for (const entry of entries) {
		const results = entry.results ?? [];
		const finalResult = results[results.length - 1];
		const resultStatus = finalResult?.status;
		if (resultStatus === 'skipped') {
			sawSkipped = true;
			continue;
		}
		if (resultStatus !== 'passed') return 'failed';
	}
	return sawSkipped ? 'skipped' : 'passed';
}

function collectTests(suites) {
	const tests = [];
	function visit(suite, ancestors, isRoot) {
		const title = typeof suite.title === 'string' ? suite.title : '';
		const looksLikeFile = isRoot || /\.(?:spec|test)\.[cm]?[jt]sx?$/u.test(title);
		const nextAncestors = looksLikeFile || title.length === 0 ? ancestors : [...ancestors, title];
		for (const child of suite.suites ?? []) visit(child, nextAncestors, false);
		for (const spec of suite.specs ?? []) {
			const specTitle = typeof spec.title === 'string' ? spec.title : '';
			const fullName = [...nextAncestors, specTitle].filter(Boolean).join(' ');
			const relativeFile = typeof spec.file === 'string' ? spec.file : suite.file;
			const file = toPortablePath(join('test', relativeFile));
			tests.push({ file, fullName, status: statusFromSpec(spec) });
		}
	}
	for (const suite of suites) visit(suite, [], true);
	return tests.sort(compareTestIdentities);
}

try {
	mkdirSync(workRoot, { recursive: true });
	cpSync(join(suiteRoot, 'test'), join(workRoot, 'test'), { recursive: true });
	cpSync(join(suiteRoot, 'playwright.config.ts'), join(workRoot, 'playwright.config.ts'));

	const appPackagePath = join(workRoot, 'test', 'package.json');
	const appPackage = JSON.parse(readFileSync(appPackagePath, 'utf8'));
	appPackage.dependencies = appPackage.dependencies ?? {};
	appPackage.dependencies[packageName] = packageVersion;
	appPackage.dependencies.zod = zodVersion;
	writeJson(appPackagePath, appPackage);

	writeJson(join(workRoot, 'package.json'), {
		name: 'octane-playwright-full-runner',
		private: true,
		devDependencies: {
			'@playwright/test': playwrightVersion,
		},
	});

	const playwrightConfigPath = join(workRoot, 'playwright.config.ts');
	let playwrightConfig = readFileSync(playwrightConfigPath, 'utf8');
	playwrightConfig = playwrightConfig.replace(
		/reporter:\s*'html'/,
		`reporter: [['json', { outputFile: ${JSON.stringify(reportPath)} }], ['list']]`,
	);
	playwrightConfig = playwrightConfig.replace(
		/projects:\s*\[[\s\S]*?\n\s*\],/,
		`projects: [
    {
      name: ${JSON.stringify(project)},
      use: { ...devices['Desktop Chrome'] },
    },
  ],`,
	);
	playwrightConfig = playwrightConfig.replace(
		/workers:\s*process\.env\.CI \? 1 : undefined,/,
		'workers: 1,',
	);
	writeFileSync(playwrightConfigPath, playwrightConfig);

	run('npm', ['install', '--no-fund', '--no-audit'], workRoot);
	run('npm', ['install', '--no-fund', '--no-audit', '--legacy-peer-deps'], join(workRoot, 'test'));
	run('npx', ['playwright', 'install', project], workRoot);

	const testResult = spawnSync('npx', ['playwright', 'test', `--project=${project}`], {
		cwd: workRoot,
		encoding: 'utf8',
		// Match upstream CI settings: one worker and retries for timing-sensitive e2e.
		env: { ...process.env, CI: '1' },
	});
	if (testResult.status !== 0) {
		process.stderr.write(testResult.stdout ?? '');
		process.stderr.write(testResult.stderr ?? '');
		process.exitCode = testResult.status ?? 1;
	} else {
		const report = JSON.parse(readFileSync(reportPath, 'utf8'));
		const tests = collectTests(Array.isArray(report.suites) ? report.suites : []);
		process.stdout.write(
			JSON.stringify({
				schemaVersion: 1,
				root: toPortablePath(relative(repoRoot, suiteRoot)),
				tests,
				snapshots: 0,
			}),
		);
	}
} finally {
	rmSync(workRoot, { recursive: true, force: true });
}
