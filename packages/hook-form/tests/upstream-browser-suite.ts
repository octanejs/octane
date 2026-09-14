import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer, type Plugin } from 'vite';
import { octane } from 'octane/compiler/vite';
import { expect } from 'vitest';
import { launchBrowser } from '../../../test-utils/playwright-browser';

const exec = promisify(execFile);
const packageRoot = resolve(import.meta.dirname, '..');
const repoRoot = resolve(packageRoot, '../..');
const routerId = '\0hook-form-fixture-params';

type Registration = { source: string; title: string };
type BrowserSpec = { file: string; title: string };
type BrowserSuite = { suites?: BrowserSuite[]; specs?: BrowserSpec[] };

export async function verifyUpstreamBrowser(mode: 'pristine' | 'adapted') {
	const directory = mkdtempSync(join(tmpdir(), `octane-hook-form-browser-${mode}-`));
	const pristineBuild = join(directory, 'pristine-source');
	// The application has its own lockfile: its renderer and build tool versions
	// differ from the upstream unit-test environment. Keep that oracle isolated.
	if (mode === 'pristine') {
		execFileSync(
			process.execPath,
			[
				resolve(repoRoot, 'node_modules/typescript/bin/tsc'),
				'--project',
				resolve(packageRoot, 'upstream/tsconfig.json'),
				'--ignoreDeprecations',
				'5.0',
				'--noEmit',
				'false',
				'--declaration',
				'false',
				'--declarationMap',
				'false',
				'--skipLibCheck',
				'false',
				'--outDir',
				pristineBuild,
			],
			{ cwd: repoRoot, stdio: 'inherit' },
		);
	}
	const reportFile = process.env.HOOK_FORM_BROWSER_REPORT_DIR
		? resolve(process.env.HOOK_FORM_BROWSER_REPORT_DIR, `${mode}.json`)
		: join(directory, 'report.json');
	const source = readFileSync(resolve(packageRoot, 'upstream/app/src/app.tsx'), 'utf8');
	const imports = new Map(
		[...source.matchAll(/import (\w+) from '\.\/([^']+)';/g)].map((match) => [
			match[1],
			{ file: match[2], name: 'default' },
		]),
	);
	for (const match of source.matchAll(/import \{ (\w+) \} from '\.\/([^']+)';/g))
		imports.set(match[1], { file: match[2], name: match[1] });
	const routes = [
		...source.matchAll(/<Route\s+path="([^"]+)"\s+element=\{<(\w+)\s*\/>\}\s*\/>/g),
	].map((match) => {
		const component = imports.get(match[2]);
		if (!component) throw new Error(`Unresolved pinned application route ${match[2]}`);
		const names: string[] = [];
		const pattern = new RegExp(
			'^' +
				match[1].replace(/:([^/]+)/g, (_, name: string) => {
					names.push(name);
					return '([^/]+)';
				}) +
				'$',
			'i',
		);
		return { pattern, names, ...component };
	});
	expect(routes.length).toBe((source.match(/<Route\s/g) ?? []).length);
	const appRoot = resolve(
		packageRoot,
		mode === 'pristine' ? 'upstream/app/src' : 'tests/upstream/_app',
	);
	const fixtureRouter: Plugin = {
		name: 'hook-form-browser-fixture-routes',
		enforce: 'pre',
		resolveId(id) {
			if (mode === 'adapted' && id === 'react-router-dom') return routerId;
		},
		load(id) {
			if (id === routerId)
				return 'export function useParams() { return globalThis.__hookFormRouteParams; }';
		},
		configureServer(server) {
			server.middlewares.use((request, response, next) => {
				const url = new URL(request.url ?? '/', 'http://localhost');
				if (url.pathname === '/') {
					response.end('<!doctype html><title>Hook Form browser fixtures</title>');
					return;
				}
				const route = routes.find((route) => route.pattern.test(url.pathname));
				if (!route) return next();
				const values = route.pattern.exec(url.pathname)!;
				const params = Object.fromEntries(
					route.names.map((name, index) => [name, decodeURIComponent(values[index + 1])]),
				);
				const component = resolve(appRoot, mode === 'pristine' ? 'app.tsx' : route.file + '.tsx');
				const script =
					`import { ${mode === 'pristine' ? 'default' : route.name} as App } from ${JSON.stringify('/@fs/' + component)};\n` +
					`import ${JSON.stringify('/@fs/' + resolve(appRoot, 'style.css'))};\n` +
					(mode === 'pristine'
						? `import { createElement } from 'react'; import { createRoot } from 'react-dom/client'; createRoot(document.getElementById('root')).render(createElement(App));`
						: `import { createRoot } from ${JSON.stringify('/@fs/' + resolve(repoRoot, 'packages/octane/src/index.ts'))}; createRoot(document.getElementById('root')).render(App);`);
				const html = `<!doctype html><html><head><meta charset="UTF-8"></head><body><div id="root"></div><script>globalThis.__hookFormRouteParams=${JSON.stringify(params).replaceAll('<', '\\u003c')};</script><script type="module">${script}</script></body></html>`;
				void server
					.transformIndexHtml(url.pathname, html)
					.then((transformed) => {
						response.setHeader('Content-Type', 'text/html');
						response.end(transformed);
					})
					.catch(next);
			});
		},
	};
	const pristineVite = mode === 'pristine' ? await import('hook-form-pristine-vite') : undefined;
	const pristineReact =
		mode === 'pristine' ? (await import('hook-form-pristine-vite-react')).default : undefined;
	const server = await (pristineVite?.createServer ?? createServer)({
		configFile: false,
		root: packageRoot,
		cacheDir: resolve(repoRoot, 'node_modules/.vite/hook-form-upstream-browser-v6-oracle-' + mode),
		logLevel: 'error',
		plugins: [fixtureRouter, ...(mode === 'adapted' ? [octane()] : [pristineReact!()])],
		resolve: {
			dedupe: ['react', 'react-dom', 'octane'],
			alias: [
				...(mode === 'pristine'
					? [
							{
								find: /^react$/,
								replacement: resolve(packageRoot, 'node_modules/hook-form-pristine-react/index.js'),
							},
							{
								find: /^react\/(.*)$/,
								replacement: resolve(packageRoot, 'node_modules/hook-form-pristine-react') + '/$1',
							},
							{
								find: /^react-dom$/,
								replacement: resolve(
									packageRoot,
									'node_modules/hook-form-pristine-react-dom/index.js',
								),
							},
							{
								find: /^react-dom\/(.*)$/,
								replacement:
									resolve(packageRoot, 'node_modules/hook-form-pristine-react-dom') + '/$1',
							},
						]
					: []),
				{
					find: /^react-hook-form$/,
					replacement:
						mode === 'pristine'
							? join(pristineBuild, 'index.js')
							: resolve(packageRoot, 'src/index.ts'),
				},
				{ find: /^@octanejs\/hook-form$/, replacement: resolve(packageRoot, 'src/index.ts') },
				{
					find: /^@octanejs\/select$/,
					replacement: resolve(repoRoot, 'packages/select/src/index.ts'),
				},
			],
		},
		// Finish dependency preparation before interaction; a Vite reload midway
		// through a multi-page test would reset the form and invalidate the oracle.
		optimizeDeps: {
			force: true,
			noDiscovery: true,
			entries: [],
			exclude: ['octane', '@octanejs/hook-form', '@octanejs/select', '@hookform/resolvers'],
			include:
				mode === 'pristine'
					? [
							'react',
							'react-dom/client',
							'react/jsx-runtime',
							'react/jsx-dev-runtime',
							'react-select',
							'react-router-dom',
							'@mui/material',
							'@emotion/react',
							'@emotion/styled',
							'joi',
							'yup',
						]
					: [
							'joi',
							'yup',
							'octane > devalue',
							'@octanejs/select > @emotion/cache',
							'@octanejs/select > @emotion/serialize',
							'@octanejs/select > @emotion/utils',
							'@octanejs/select > @floating-ui/dom',
							'@octanejs/select > memoize-one',
						],
		},
		esbuild: mode === 'pristine' ? { jsx: 'automatic', jsxImportSource: 'react' } : undefined,
		server: { host: '127.0.0.1', port: 0, fs: { allow: [repoRoot, directory] } },
	});
	try {
		await server.listen();
		const address = server.httpServer!.address();
		if (!address || typeof address === 'string')
			throw new Error('Missing upstream browser server address');
		const browser = await launchBrowser({ headless: true });
		try {
			const page = await browser.newPage();
			const errors: string[] = [];
			page.on('pageerror', (error) => errors.push(error.message));
			page.on('console', (message) => {
				if (message.type() === 'error') errors.push(message.text());
			});
			await page.goto(`http://127.0.0.1:${address.port}/basic/onSubmit`);
			try {
				await page.locator('button#submit').waitFor({ timeout: 10_000 });
			} catch (error) {
				throw new Error(`${mode} browser setup: ${errors.join('\n')}`, { cause: error });
			}
			expect(errors).toEqual([]);
		} finally {
			await browser.close();
		}
		const config = {
			testDir: resolve(packageRoot, mode === 'pristine' ? 'upstream/e2e' : 'tests/upstream/_e2e'),
			testMatch: '**/*.spec.ts',
			fullyParallel: true,
			workers: 2,
			retries: 0,
			timeout: 30_000,
			maxFailures: 3,
			reporter: [['json', { outputFile: reportFile }]],
			outputDir: join(directory, 'results'),
			use: { baseURL: `http://127.0.0.1:${address.port}`, headless: true, actionTimeout: 10_000 },
		};
		const configPath = join(directory, 'playwright.config.mjs');
		writeFileSync(configPath, 'export default ' + JSON.stringify(config) + ';\n');
		let failure: unknown;
		try {
			await exec(
				process.execPath,
				[
					resolve(packageRoot, 'node_modules/@playwright/test/cli.js'),
					'test',
					'--config',
					configPath,
				],
				{ cwd: repoRoot, maxBuffer: 32 * 1024 * 1024, timeout: 300_000 },
			);
		} catch (error) {
			failure = error;
		}
		const report = JSON.parse(readFileSync(reportFile, 'utf8'));
		const specifications: BrowserSpec[] = [];
		const collect = (suite: BrowserSuite) => {
			specifications.push(...(suite.specs ?? []));
			for (const child of suite.suites ?? []) collect(child);
		};
		for (const suite of report.suites) collect(suite);
		const registrations: Registration[] = JSON.parse(
			readFileSync(resolve(packageRoot, 'audit/registrations.json'), 'utf8'),
		);
		const expected = registrations
			.filter(
				(row) =>
					row.source.startsWith('e2e/') &&
					!(mode === 'adapted' && row.source.startsWith('e2e/controller.spec.ts:')),
			)
			.map((row) => `${basename(row.source.split(':')[0])}\0${row.title}`)
			.sort();
		const actual = specifications.map((spec) => `${basename(spec.file)}\0${spec.title}`).sort();
		expect(
			actual,
			`Every immutable browser registration must remain visible: ${reportFile}`,
		).toEqual(expected);
		expect(report.errors, reportFile).toEqual([]);
		expect(
			report.stats,
			`Browser report: ${reportFile}\n${failure instanceof Error ? failure.message.slice(-3000) : ''}`,
		).toMatchObject({ expected: expected.length, skipped: 0, unexpected: 0, flaky: 0 });
		expect(failure, reportFile).toBeUndefined();
		return { report, specifications };
	} finally {
		await server.close();
	}
}
