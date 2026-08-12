#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { compareTestIdentities, toPortablePath } from './harness-lib.mjs';
import { verifyVaulUpstream } from '../../packages/vaul/scripts/verify-upstream.mjs';

const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const runnerPath = fileURLToPath(import.meta.url);

function flag(args, name) {
	const index = args.indexOf(name);
	if (index === -1 || !args[index + 1]) throw new Error(`Missing ${name}`);
	return args[index + 1];
}

function readyEventLatch(eventName) {
	if (typeof eventName !== 'string' || eventName.length === 0) return '';
	// Event names are opaque upstream API. In particular, Drei intentionally
	// supplies its published `playright:r3f` spelling here.
	const serializedEventName = JSON.stringify(eventName);
	return `<script>
{
  const eventName = ${serializedEventName};
  let dispatched = false;
  const dispatchEvent = document.dispatchEvent.bind(document);
  const addEventListener = document.addEventListener.bind(document);
  document.dispatchEvent = function latchReadyEvent(event) {
    if (event.type === eventName) dispatched = true;
    return dispatchEvent(event);
  };
  document.addEventListener = function replayReadyEvent(type, listener, options) {
    addEventListener(type, listener, options);
    if (type === eventName && dispatched) queueMicrotask(() => dispatchEvent(new Event(eventName)));
  };
}
</script>`;
}

function writeViteConfig(workRoot, rewrites = []) {
	if (
		!Array.isArray(rewrites) ||
		rewrites.some(
			(rewrite) =>
				!rewrite ||
				typeof rewrite.from !== 'string' ||
				rewrite.from.length === 0 ||
				typeof rewrite.to !== 'string' ||
				rewrite.to.length === 0,
		)
	) {
		throw new Error('playwright-full config urlRewrites must contain non-empty from/to pairs');
	}
	writeFileSync(
		join(workRoot, 'vite.config.mjs'),
		`const rewrites = ${JSON.stringify(rewrites)};
export default {
  esbuild: { jsx: 'automatic' },
  plugins: [{
    name: 'octane-pristine-url-rewrites',
    transform(code) {
      let rewritten = code;
      for (const { from, to } of rewrites) rewritten = rewritten.replaceAll(from, to);
      return rewritten === code ? null : { code: rewritten, map: null };
    },
  }],
};
`,
	);
}

function runStage(label, command, commandArgs, cwd, env = process.env) {
	const startedAt = Date.now();
	const result = spawnSync(command, commandArgs, {
		cwd,
		encoding: 'utf8',
		env,
		maxBuffer: 32 * 1024 * 1024,
	});
	process.stderr.write(
		`[playwright-full] ${label} finished in ${((Date.now() - startedAt) / 1000).toFixed(1)}s\n`,
	);
	if (result.status !== 0) {
		process.stderr.write(result.stdout ?? '');
		process.stderr.write(result.stderr ?? '');
		throw new Error(`${command} ${commandArgs.join(' ')} failed with status ${result.status}`);
	}
	return result;
}

async function waitForServer(port) {
	const deadline = Date.now() + 60_000;
	while (Date.now() < deadline) {
		try {
			const response = await fetch(`http://localhost:${port}/`);
			if (response.ok) return;
		} catch {
			// The preview process is still starting.
		}
		await delay(250);
	}
	throw new Error(`Vite preview did not start on port ${port}`);
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
		throw new Error(`failed to reserve a local port: ${result.stderr}`);
	}
	return port;
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

function statusFromTest(test) {
	const results = test.results ?? [];
	const finalResult = results[results.length - 1];
	const status = finalResult?.status ?? test.status ?? 'unknown';
	if (status === 'skipped' || status === 'pending') return status;
	if (
		status === 'passed' ||
		status === 'expected' ||
		test.status === 'expected' ||
		test.status === 'flaky' ||
		test.ok === true
	) {
		return 'passed';
	}
	return status;
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

export function collectVaulTests(suites) {
	const tests = [];
	function visit(suite, ancestors) {
		const titles = [...ancestors, suite.title].filter(Boolean);
		for (const spec of suite.specs ?? []) {
			const fullBase = [...titles, spec.title].filter(Boolean).join(' ');
			for (const entry of spec.tests ?? []) {
				const status = statusFromTest(entry);
				if (status === 'skipped' || status === 'pending') continue;
				const project = entry.projectName ? ` [${entry.projectName}]` : '';
				tests.push({
					file: vaulFileFromSpec(spec, suite),
					fullName: `${fullBase}${project}`,
					status,
				});
			}
		}
		for (const child of suite.suites ?? []) visit(child, titles);
	}
	for (const suite of suites) visit(suite, []);
	return tests.sort(compareTestIdentities);
}

function viteE2eFileFromSpec(spec) {
	return join('test/e2e', spec.file ?? 'snapshot.test.ts');
}

function sonnerFileFromSpec(spec, suite) {
	const relativeFile = typeof spec.file === 'string' ? spec.file : suite.file;
	return join('test', relativeFile);
}

function vaulFileFromSpec(spec, suite) {
	const file = toPortablePath(spec.file ?? suite.file ?? '');
	const testMarker = '/test/';
	return file.includes(testMarker)
		? `test/${file.slice(file.lastIndexOf(testMarker) + testMarker.length)}`
		: file.startsWith('test/')
			? file
			: `test/${file}`;
}

function readPackageVersion(nodeModules, packageName) {
	const packageJsonPath = join(nodeModules, packageName, 'package.json');
	if (!existsSync(packageJsonPath)) {
		throw new Error(`dependency workspace is missing ${packageName}`);
	}
	return JSON.parse(readFileSync(packageJsonPath, 'utf8')).version;
}

export function validateDependencyWorkspace(root, config) {
	if (typeof config.dependencyWorkspace !== 'string' || config.dependencyWorkspace.length === 0) {
		throw new Error('playwright-full config requires dependencyWorkspace');
	}
	const dependencyRoot = resolve(root, config.dependencyWorkspace);
	const portableRelative = toPortablePath(relative(root, dependencyRoot));
	if (portableRelative.startsWith('../') || isAbsolute(portableRelative)) {
		throw new Error('playwright-full dependencyWorkspace must stay inside the repository');
	}
	const nodeModules = join(dependencyRoot, 'node_modules');
	if (!existsSync(nodeModules)) {
		throw new Error(`dependency workspace is not installed: ${portableRelative}`);
	}
	const packageVersion = readPackageVersion(nodeModules, config.packageName);
	if (packageVersion !== config.packageVersion) {
		throw new Error(
			`${config.packageName} resolved to ${packageVersion}; expected ${config.packageVersion}`,
		);
	}
	const testVersion = readPackageVersion(nodeModules, '@playwright/test');
	const playwrightVersion = readPackageVersion(nodeModules, 'playwright');
	if (testVersion !== playwrightVersion) {
		throw new Error(
			`Playwright packages must resolve together; found ${testVersion} and ${playwrightVersion}`,
		);
	}
	return { dependencyRoot, nodeModules, playwrightVersion };
}

function linkDependencyWorkspace(workRoot, nodeModules) {
	symlinkSync(nodeModules, join(workRoot, 'node_modules'), 'dir');
	return {
		// Invoke bins through their physical workspace path. pnpm's .bin links are
		// relative, so resolving them through the temporary node_modules symlink
		// would incorrectly make those links relative to the OS temp directory.
		playwright: join(nodeModules, '.bin', 'playwright'),
		vite: join(nodeModules, '.bin', 'vite'),
	};
}

export function playwrightConfigSource(config, reportPath, port) {
	const sonner = config.mode === 'sonner-vite';
	const vaul = config.mode === 'vaul-next';
	const browserConfig = sonner
		? `  use: {
    trace: 'on-first-retry',
    baseURL: ${JSON.stringify(`http://localhost:${port}`)},
  },
  projects: [{
    name: ${JSON.stringify(config.project)},
    use: { ...devices['Desktop Chrome'] },
  }],`
		: vaul
			? `  use: {
    browserName: 'chromium',
    trace: 'on-first-retry',
    baseURL: ${JSON.stringify(`http://127.0.0.1:${port}`)},
  },
  webServer: {
    command: ${JSON.stringify(`npm run dev -- --port ${port} --hostname 127.0.0.1`)},
    url: ${JSON.stringify(`http://127.0.0.1:${port}`)},
    cwd: './test',
    reuseExistingServer: false,
  },
  projects: [
    { name: 'iPhone', use: { ...devices['iPhone 13 Pro'] } },
    { name: 'Pixel', use: { ...devices['Pixel 5'] } },
  ],`
			: "  use: { ...devices['Desktop Chrome'] },";
	return `import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: ${JSON.stringify(vaul || sonner ? './test' : './test/e2e')},
  timeout: 30 * 1000,
  expect: { timeout: 5000 },
  fullyParallel: ${sonner || vaul},
  forbidOnly: !!process.env.CI,
  retries: ${sonner || vaul ? 2 : 0},
  workers: 1,
  reporter: [['json', { outputFile: ${JSON.stringify(reportPath)} }]],
${browserConfig}
});
`;
}

function writePlaywrightConfig(workRoot, config, reportPath, port) {
	writeFileSync(
		join(workRoot, 'playwright.config.ts'),
		playwrightConfigSource(config, reportPath, port),
	);
}

function writeViteE2eFiles(workRoot, suiteRoot, config) {
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
		`${readyEventLatch(config.readyEvent)}<div id="root"></div><script type="module" src="/src/main.tsx"></script>\n`,
	);
	writeFileSync(
		join(workRoot, 'src', 'main.tsx'),
		"import { createRoot } from 'react-dom/client';\nimport App from './App';\ncreateRoot(document.querySelector('#root')).render(<App />);\n",
	);
	writeViteConfig(workRoot, config.urlRewrites);
}

export function prepareSonnerAppSource(source) {
	const serverActionImport = "import { action } from '@/app/action';";
	if (source.split(serverActionImport).length !== 2) {
		throw new Error('Sonner upstream app no longer has the expected server-action import');
	}
	return source.replace(
		serverActionImport,
		"const action = async () => 'load complete'; // Unused by the vendored browser suite.",
	);
}

function writeSonnerFiles(workRoot, suiteRoot) {
	mkdirSync(join(workRoot, 'test'), { recursive: true });
	cpSync(join(suiteRoot, 'test', 'tests'), join(workRoot, 'test', 'tests'), { recursive: true });
	const appSource = readFileSync(join(suiteRoot, 'test', 'src', 'app', 'page.tsx'), 'utf8');
	writeFileSync(join(workRoot, 'src', 'App.tsx'), prepareSonnerAppSource(appSource));
	writeFileSync(
		join(workRoot, 'index.html'),
		'<div id="root"></div><script type="module" src="/src/main.tsx"></script>\n',
	);
	writeFileSync(
		join(workRoot, 'src', 'main.tsx'),
		`import { createRoot } from 'react-dom/client';
import App from './App';
const searchParams = Object.fromEntries(new URLSearchParams(window.location.search));
createRoot(document.querySelector('#root')).render(<App searchParams={searchParams} />);
`,
	);
	writeViteConfig(workRoot);
}

function writeResult(reportPath, suiteRoot, fileFromSpec, snapshots, collector = collectTests) {
	const report = JSON.parse(readFileSync(reportPath, 'utf8'));
	process.stdout.write(
		JSON.stringify({
			schemaVersion: 1,
			root: toPortablePath(relative(repoRoot, suiteRoot)),
			tests: collector(Array.isArray(report.suites) ? report.suites : [], fileFromSpec),
			snapshots,
		}),
	);
}

async function runBrowserSuite(workRoot, suiteRoot, config, reportPath, commands) {
	const port = config.mode === 'vite-e2e' ? config.port : reservePort();
	if (!Number.isInteger(port) || port <= 0) {
		throw new Error('playwright-full config requires a positive integer port for vite-e2e');
	}
	if (config.mode === 'vaul-next') {
		writePlaywrightConfig(workRoot, config, reportPath, port);
		runStage('upstream Playwright suite', commands.playwright, ['test'], workRoot, {
			...process.env,
			CI: '1',
		});
		writeResult(reportPath, suiteRoot, vaulFileFromSpec, 0, collectVaulTests);
		return;
	}
	if (config.mode === 'vite-e2e') writeViteE2eFiles(workRoot, suiteRoot, config);
	else writeSonnerFiles(workRoot, suiteRoot);
	writePlaywrightConfig(workRoot, config, reportPath, port);

	runStage('Vite build', commands.vite, ['build'], workRoot);
	const preview = spawn(
		commands.vite,
		['preview', '--host', 'localhost', '--port', String(port), '--strictPort'],
		{
			cwd: workRoot,
			env: process.env,
			stdio: 'ignore',
		},
	);
	try {
		await waitForServer(port);
		runStage(
			'upstream Playwright suite',
			commands.playwright,
			config.mode === 'sonner-vite' ? ['test', `--project=${config.project}`] : ['test'],
			workRoot,
			{ ...process.env, CI: '1' },
		);
		writeResult(
			reportPath,
			suiteRoot,
			config.mode === 'vite-e2e' ? viteE2eFileFromSpec : sonnerFileFromSpec,
			config.mode === 'vite-e2e' ? 1 : 0,
		);
	} finally {
		preview.kill();
	}
}

function validateConfig(config) {
	if (typeof config.packageName !== 'string' || config.packageName.length === 0) {
		throw new Error('playwright-full config requires packageName');
	}
	if (typeof config.packageVersion !== 'string' || config.packageVersion.length === 0) {
		throw new Error('playwright-full config requires packageVersion');
	}
	if (!['vite-e2e', 'sonner-vite', 'vaul-next'].includes(config.mode)) {
		throw new Error(`Unsupported playwright-full mode: ${config.mode}`);
	}
	config.project = typeof config.project === 'string' ? config.project : 'chromium';
	if (
		config.readyEvent !== undefined &&
		(typeof config.readyEvent !== 'string' || config.readyEvent.length === 0)
	) {
		throw new Error('playwright-full config readyEvent must be a non-empty string');
	}
}

function copyDirectoryContents(source, destination) {
	for (const entry of readdirSync(source)) {
		cpSync(join(source, entry), join(destination, entry), { recursive: true });
	}
}

export async function main(args = process.argv.slice(2)) {
	if (
		args.length !== 4 ||
		!args.every(function validArgument(value, index) {
			return index % 2 === 0 || value.length > 0;
		})
	) {
		throw new Error('Usage: playwright-full-runner.mjs --config PATH --root PATH');
	}

	const configPath = resolve(repoRoot, flag(args, '--config'));
	const suiteRoot = resolve(repoRoot, flag(args, '--root'));
	const config = JSON.parse(readFileSync(configPath, 'utf8'));
	validateConfig(config);
	const dependency = validateDependencyWorkspace(repoRoot, config);
	process.stderr.write(
		`[playwright-full] using ${toPortablePath(relative(repoRoot, dependency.dependencyRoot))} with Playwright ${dependency.playwrightVersion}\n`,
	);

	const workRoot = mkdtempSync(join(tmpdir(), 'octane-playwright-full-'));
	const reportPath = join(workRoot, 'playwright-report.json');
	try {
		if (config.mode === 'vaul-next') {
			verifyVaulUpstream(join(repoRoot, 'packages/vaul'));
			copyDirectoryContents(suiteRoot, workRoot);
		} else {
			mkdirSync(join(workRoot, 'src'), { recursive: true });
		}
		const commands = linkDependencyWorkspace(workRoot, dependency.nodeModules);
		if (config.mode === 'vaul-next') {
			symlinkSync(dependency.nodeModules, join(workRoot, 'test', 'node_modules'), 'dir');
		}
		await runBrowserSuite(workRoot, suiteRoot, config, reportPath, commands);
	} finally {
		rmSync(workRoot, { recursive: true, force: true });
	}
}

if (resolve(process.argv[1] ?? '') === runnerPath) await main();
