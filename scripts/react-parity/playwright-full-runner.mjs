#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
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

function waitForServer(port) {
	return new Promise(function wait(resolveServer, rejectServer) {
		const deadline = Date.now() + 60_000;
		function check() {
			const request = spawnSync('curl', ['--fail', '--silent', `http://localhost:${port}/`], {
				encoding: 'utf8',
			});
			if (request.status === 0) {
				resolveServer();
				return;
			}
			if (Date.now() >= deadline) {
				rejectServer(new Error(`Vite preview did not start on port ${port}`));
				return;
			}
			setTimeout(check, 250);
		}
		check();
	});
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

function collectTests(suites, fileFromSpec) {
	const tests = [];
	function visit(suite, ancestors, isRoot) {
		const title = typeof suite.title === 'string' ? suite.title : '';
		const looksLikeFile = isRoot || /\.(?:spec|test)\.[cm]?[jt]sx?$/u.test(title);
		const nextAncestors = looksLikeFile || title.length === 0 ? ancestors : [...ancestors, title];
		for (const child of suite.suites ?? []) visit(child, nextAncestors, false);
		for (const spec of suite.specs ?? []) {
			const specTitle = typeof spec.title === 'string' ? spec.title : '';
			const fullName = [...nextAncestors, specTitle].filter(Boolean).join(' ');
			tests.push({
				file: toPortablePath(fileFromSpec(spec, suite)),
				fullName,
				status: statusFromSpec(spec),
			});
		}
	}
	for (const suite of suites) visit(suite, [], true);
	return tests.sort(compareTestIdentities);
}

function viteE2eFileFromSpec(spec) {
	return join('test/e2e', spec.file ?? 'snapshot.test.ts');
}

function sonnerFileFromSpec(spec, suite) {
	const relativeFile = typeof spec.file === 'string' ? spec.file : suite.file;
	return join('test', relativeFile);
}

function writeViteE2eFiles(workRoot, suiteRoot, config, reportPath) {
	const sourceRoot = join(suiteRoot, 'test', 'e2e');
	const testRoot = join(workRoot, 'test', 'e2e');
	mkdirSync(testRoot, { recursive: true });
	cpSync(join(sourceRoot, config.testFile.split('/').at(-1)), join(testRoot, 'snapshot.test.ts'));
	cpSync(
		join(sourceRoot, 'snapshot.test.ts-snapshots'),
		join(testRoot, 'snapshot.test.ts-snapshots'),
		{ recursive: true },
	);
	cpSync(join(sourceRoot, config.appFile.split('/').at(-1)), join(workRoot, 'src', 'App.tsx'));
	writeFileSync(
		join(workRoot, 'index.html'),
		'<div id="root"></div><script type="module" src="/src/main.tsx"></script>\n',
	);
	writeFileSync(
		join(workRoot, 'src', 'main.tsx'),
		"import { createRoot } from 'react-dom/client';\nimport App from './App';\ncreateRoot(document.querySelector('#root')).render(<App />);\n",
	);
	writeFileSync(
		join(workRoot, 'playwright.config.ts'),
		"import { defineConfig, devices } from '@playwright/test';\nexport default defineConfig({ testDir: './test/e2e', reporter: [['json', { outputFile: " +
			JSON.stringify(reportPath) +
			'}]], projects: [{ name: ' +
			JSON.stringify(config.project) +
			", use: { ...devices['Desktop Chrome'] } }], workers: 1 });\n",
	);
}

async function runViteE2e(workRoot, suiteRoot, config, reportPath) {
	mkdirSync(join(workRoot, 'src'), { recursive: true });
	writeViteE2eFiles(workRoot, suiteRoot, config, reportPath);
	const dependencies = {
		'@playwright/test': config.playwrightVersion,
		'@react-three/drei': config.packageVersion,
		...config.peers,
	};
	writeJson(join(workRoot, 'package.json'), {
		name: 'octane-playwright-full-runner',
		private: true,
		type: 'module',
		dependencies,
	});
	run('npm', ['install', '--no-fund', '--no-audit', '--legacy-peer-deps'], workRoot);
	run('npx', ['playwright', 'install', config.project], workRoot);
	run('npx', ['vite', 'build'], workRoot);
	const preview = spawn(
		'npx',
		['vite', 'preview', '--host', 'localhost', '--port', String(config.port)],
		{
			cwd: workRoot,
			env: process.env,
			stdio: 'ignore',
		},
	);
	try {
		await waitForServer(config.port);
		const result = spawnSync('npx', ['playwright', 'test', `--project=${config.project}`], {
			cwd: workRoot,
			encoding: 'utf8',
			env: { ...process.env, CI: '1' },
		});
		if (result.status !== 0) {
			process.stderr.write(result.stdout ?? '');
			process.stderr.write(result.stderr ?? '');
			process.exitCode = result.status ?? 1;
			return;
		}
		const report = JSON.parse(readFileSync(reportPath, 'utf8'));
		process.stdout.write(
			JSON.stringify({
				schemaVersion: 1,
				root: toPortablePath(relative(repoRoot, suiteRoot)),
				tests: collectTests(
					Array.isArray(report.suites) ? report.suites : [],
					viteE2eFileFromSpec,
				),
				snapshots: 1,
			}),
		);
	} finally {
		preview.kill();
	}
}

function runSonner(workRoot, suiteRoot, config, reportPath) {
	mkdirSync(workRoot, { recursive: true });
	cpSync(join(suiteRoot, 'test'), join(workRoot, 'test'), { recursive: true });
	cpSync(join(suiteRoot, 'playwright.config.ts'), join(workRoot, 'playwright.config.ts'));

	const appPackagePath = join(workRoot, 'test', 'package.json');
	const appPackage = JSON.parse(readFileSync(appPackagePath, 'utf8'));
	appPackage.dependencies = appPackage.dependencies ?? {};
	appPackage.dependencies[config.packageName] = config.packageVersion;
	appPackage.dependencies.zod = config.zodVersion ?? '3.25.76';
	writeJson(appPackagePath, appPackage);

	writeJson(join(workRoot, 'package.json'), {
		name: 'octane-playwright-full-runner',
		private: true,
		devDependencies: {
			'@playwright/test': config.playwrightVersion,
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
      name: ${JSON.stringify(config.project)},
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
	run('npx', ['playwright', 'install', config.project], workRoot);

	const testResult = spawnSync('npx', ['playwright', 'test', `--project=${config.project}`], {
		cwd: workRoot,
		encoding: 'utf8',
		// Match upstream CI settings: one worker and retries for timing-sensitive e2e.
		env: { ...process.env, CI: '1' },
	});
	if (testResult.status !== 0) {
		process.stderr.write(testResult.stdout ?? '');
		process.stderr.write(testResult.stderr ?? '');
		process.exitCode = testResult.status ?? 1;
		return;
	}
	const report = JSON.parse(readFileSync(reportPath, 'utf8'));
	process.stdout.write(
		JSON.stringify({
			schemaVersion: 1,
			root: toPortablePath(relative(repoRoot, suiteRoot)),
			tests: collectTests(Array.isArray(report.suites) ? report.suites : [], sonnerFileFromSpec),
			snapshots: 0,
		}),
	);
}

if (
	args.length !== 4 ||
	!args.every(function validArgument(value, index) {
		return index % 2 === 0 || value.length > 0;
	})
) {
	throw new Error('Usage: playwright-full-runner.mjs --config PATH --root PATH');
}

const configPath = resolve(repoRoot, flag('--config'));
const suiteRoot = resolve(repoRoot, flag('--root'));
const config = JSON.parse(readFileSync(configPath, 'utf8'));
if (typeof config.packageVersion !== 'string')
	throw new Error('playwright-full config requires packageVersion');
config.packageName = typeof config.packageName === 'string' ? config.packageName : 'sonner';
config.playwrightVersion =
	typeof config.playwrightVersion === 'string' ? config.playwrightVersion : '1.49.1';
config.project = typeof config.project === 'string' ? config.project : 'chromium';

const workRoot = mkdtempSync(join(tmpdir(), 'octane-playwright-full-'));
const reportPath = join(workRoot, 'playwright-report.json');
try {
	if (config.mode === 'vite-e2e') await runViteE2e(workRoot, suiteRoot, config, reportPath);
	else runSonner(workRoot, suiteRoot, config, reportPath);
} finally {
	rmSync(workRoot, { recursive: true, force: true });
}
