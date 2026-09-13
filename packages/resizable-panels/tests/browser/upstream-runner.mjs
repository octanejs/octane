import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { createServer } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import {
	validateUpstreamLock,
	verifyPristineTree,
} from '../../../../scripts/react-port/materialize-lib.mjs';
import { octane } from '../../../octane/src/compiler/vite.js';

const packageRoot = path.resolve(import.meta.dirname, '../..');
const repoRoot = path.resolve(packageRoot, '../..');
const require = createRequire(path.join(packageRoot, 'package.json'));
const harness = path.join(import.meta.dirname, 'upstream-harness');

function execute(command, args, options) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
		let diagnostics = '';
		for (const stream of [child.stdout, child.stderr]) {
			stream.on('data', (chunk) => {
				diagnostics = (diagnostics + chunk).slice(-100_000);
			});
		}
		const timer = setTimeout(() => {
			child.kill('SIGKILL');
		}, 210_000);
		child.once('error', (error) => {
			clearTimeout(timer);
			reject(error);
		});
		child.once('close', (code, signal) => {
			clearTimeout(timer);
			resolve({ code, signal, diagnostics });
		});
	});
}

function resultsFromReport(report) {
	const tests = [];
	function visit(suites, parents = []) {
		for (const suite of suites ?? []) {
			const titles = [...parents, suite.title];
			for (const spec of suite.specs ?? []) {
				for (const test of spec.tests ?? []) {
					tests.push({
						file: path.basename(spec.file),
						title: [...titles.slice(1), spec.title].join(' > '),
						project: test.projectName,
						status: test.results.at(-1)?.status,
						errors: test.results.flatMap((result) => result.errors ?? []),
					});
				}
			}
			visit(suite.suites, titles);
		}
	}
	visit(report.suites);
	return tests;
}

export async function runUpstreamBrowserSuite({ mode, reportPath, maxFailures = 0 } = {}) {
	assert(['react', 'octane'].includes(mode));
	const lock = validateUpstreamLock(
		JSON.parse(await readFile(path.join(packageRoot, 'audit/upstream.lock.json'))),
	);
	assert.deepEqual(verifyPristineTree(lock, path.join(packageRoot, 'upstream')), {
		missing: [],
		mismatched: [],
		unexpected: [],
	});
	const registrations = JSON.parse(
		await readFile(path.join(packageRoot, 'audit/registrations.json')),
	);
	const dispositions = JSON.parse(
		await readFile(path.join(packageRoot, 'audit/browser-dispositions.json')),
	).cases;
	const appCases = registrations.filter((entry) =>
		entry.source.startsWith('integrations/tests/tests/default-layout.spec.tsx:'),
	);
	assert.equal(appCases.length, 3);
	assert.deepEqual(
		dispositions.map(({ id, source, title }) => ({ id, source, title })),
		appCases.map(({ id, source, title }) => ({ id, source, title })),
	);
	assert.equal(dispositions.filter((entry) => entry.disposition === 'conformance').length, 2);
	assert.equal(dispositions.filter((entry) => entry.disposition === 'inapplicable').length, 1);
	const scratch = await mkdtemp(path.join(tmpdir(), 'octane-resizable-browser-'));
	const upstreamRoot = path.join(packageRoot, 'upstream/integrations/tests');
	const componentRoot =
		mode === 'react'
			? path.join(upstreamRoot, 'src')
			: path.join(packageRoot, 'tests/upstream/browser/src');
	const libTools = path.join(harness, mode === 'react' ? 'lib-tools.react.tsx' : 'lib-tools.tsrx');
	const entry =
		mode === 'react'
			? `import {createElement} from 'react'; import {createRoot} from 'react-dom/client';`
			: `import {createElement,createRoot,delegateEvents} from 'octane'; delegateEvents(['click','pointerdown','pointerup','focus','blur']);`;
	const server = await createServer({
		configFile: false,
		root: harness,
		logLevel: 'error',
		server: { host: '127.0.0.1', port: 0, fs: { allow: [repoRoot] } },
		plugins: [
			{
				name: 'resizable-upstream-entry',
				resolveId(id) {
					if (id === '/entry.tsx') return '\0resizable-entry';
				},
				load(id) {
					if (id !== '\0resizable-entry') return;
					return `${entry}
import {Decoder} from ${JSON.stringify(path.join(componentRoot, 'components/Decoder.tsx'))};
import ${JSON.stringify(path.join(harness, 'styles.css'))};
const encoded = decodeURIComponent(location.pathname.slice('/decoder/'.length));
const root=createRoot(document.getElementById('root'));
root.render(createElement(Decoder,{encoded,searchParams:new URLSearchParams(location.search)}));
`;
				},
			},
			...(mode === 'octane' ? [octane()] : []),
			tailwindcss(),
		],
		esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
		resolve: {
			alias: [
				{ find: /^react-lib-tools$/, replacement: libTools },
				{
					find: /^react-resizable-panels$/,
					replacement: path.join(packageRoot, 'upstream-artifact/dist/react-resizable-panels.js'),
				},
				{
					find: /^@octanejs\/resizable-panels$/,
					replacement: path.join(packageRoot, 'src/index.tsrx'),
				},
				{ find: /^octane$/, replacement: path.join(repoRoot, 'packages/octane/src/index.ts') },
			],
			dedupe: ['react', 'react-dom', 'octane'],
		},
	});
	try {
		await server.listen();
		const origin = server.resolvedUrls.local[0].replace(/\/$/, '');
		const testFiles = lock.files.filter((file) =>
			/^integrations\/tests\/tests\/.*\.spec\.tsx$/.test(file.path),
		);
		assert.equal(testFiles.length, 10);
		for (const file of testFiles) {
			if (file.path === 'integrations/tests/tests/default-layout.spec.tsx') continue;
			await build({
				entryPoints: [path.join(packageRoot, 'upstream', file.path)],
				outfile: path.join(scratch, path.basename(file.path).replace(/\.tsx$/, '.cjs')),
				bundle: true,
				platform: 'node',
				format: 'cjs',
				jsx: 'automatic',
				plugins: [
					{
						name: 'pinned-driver-runtime',
						setup(context) {
							context.onResolve(
								{ filter: /^(?:react|react-dom|@playwright\/test)(?:\/.*)?$/ },
								(args) => ({
									path: require.resolve(args.path),
									external: true,
								}),
							);
							context.onResolve({ filter: /^react-resizable-panels$/ }, () => ({
								path: path.join(packageRoot, 'upstream-artifact/dist/react-resizable-panels.js'),
							}));
							context.onResolve({ filter: /^react-lib-tools$/ }, () => ({
								path: path.join(harness, 'lib-tools.react.tsx'),
							}));
							context.onLoad({ filter: /goToUrl\.ts$/ }, async (args) => ({
								contents: (await readFile(args.path, 'utf8')).replaceAll(
									'http://localhost:3012',
									origin,
								),
								loader: 'ts',
							}));
						},
					},
				],
			});
		}
		const output = path.join(scratch, 'results.json');
		const configuration = {
			testDir: scratch,
			testMatch: '*.spec.cjs',
			timeout: 15_000,
			retries: 0,
			maxFailures,
			workers: 4,
			reporter: [['json', { outputFile: output }]],
			outputDir: path.join(scratch, 'artifacts'),
			projects: [false, true].map((usePopUpWindow) => ({
				name: usePopUpWindow ? 'chromium: popup' : 'chromium',
				use: {
					browserName: 'chromium',
					headless: true,
					viewport: { width: 1000, height: 600 },
					usePopUpWindow,
				},
			})),
		};
		const config = path.join(scratch, 'playwright.config.mjs');
		await writeFile(config, `export default ${JSON.stringify(configuration)};\n`);
		const run = await execute(
			process.execPath,
			[require.resolve('@playwright/test/cli'), 'test', '--config', config],
			{ cwd: packageRoot, env: { ...process.env, CI: 'true' } },
		);
		const report = JSON.parse(await readFile(output, 'utf8'));
		if (reportPath) await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
		const results = resultsFromReport(report);
		return {
			passed: results.filter((test) => test.status === 'passed'),
			skipped: results.filter((test) => test.status === 'skipped'),
			failed: [
				...results.filter((test) => !['passed', 'skipped'].includes(test.status)),
				...(report.errors ?? []),
				...(run.code === 0 ? [] : [{ exitCode: run.code, signal: run.signal }]),
			],
			diagnostics: run.diagnostics,
		};
	} finally {
		await server.close();
		await rm(scratch, { recursive: true, force: true });
	}
}
