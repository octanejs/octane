import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const SOURCE_ROOT = path.resolve(process.env.OCTANE_HOOKS_ROOT || path.join(HERE, '../..'));
const hash = (value) => createHash('sha256').update(value).digest('hex');
const requireFromNews = createRequire(new URL('../news/package.json', import.meta.url));
const packageResolvers = [
	['octane', createRequire(path.join(SOURCE_ROOT, 'packages/octane/package.json'))],
	[
		'@octanejs/zustand',
		createRequire(new URL('../../packages/zustand/package.json', import.meta.url)),
	],
	['@octanejs/mobx', createRequire(new URL('../../packages/mobx/package.json', import.meta.url))],
];

function workspacePublicImports() {
	return {
		name: 'hook-store-workspace-public-imports',
		enforce: 'pre',
		resolveId(source) {
			for (const [name, resolver] of packageResolvers) {
				if (source === name || source.startsWith(`${name}/`)) return resolver.resolve(source);
			}
			return null;
		},
	};
}

export function chromium() {
	return requireFromNews('playwright').chromium;
}

export async function startFixture({ work = false, noBuild = false } = {}) {
	process.env.NODE_ENV = 'production';
	const { build, preview } = await import(pathToFileURL(requireFromNews.resolve('vite')).href);
	const { octane } = await import(
		pathToFileURL(packageResolvers[0][1].resolve('octane/compiler/vite')).href
	);
	const outDir = path.join(
		HERE,
		'dist',
		(work ? 'work' : 'timing') +
			(process.env.OCTANE_HOOKS_ROOT ? '-' + hash(SOURCE_ROOT).slice(0, 12) : ''),
	);
	if (!noBuild) {
		await build({
			configFile: false,
			root: HERE,
			logLevel: 'warn',
			plugins: [workspacePublicImports(), octane({ hmr: false, profile: false })],
			define: {
				'process.env.NODE_ENV': JSON.stringify('production'),
				__OCTANE_PROFILE_ENABLED__: 'false',
			},
			build: {
				outDir,
				emptyOutDir: true,
				target: 'esnext',
				minify: work ? false : 'esbuild',
				rollupOptions: {
					input: path.join(HERE, 'index.html'),
					output: {
						entryFileNames: 'assets/[name]-[hash].js',
						chunkFileNames: 'assets/[name]-[hash].js',
					},
				},
			},
		});
		const assets = fs
			.readdirSync(path.join(outDir, 'assets'))
			.filter((name) => name.endsWith('.js'))
			.sort()
			.map((name) => {
				const content = fs.readFileSync(path.join(outDir, 'assets', name));
				return {
					name,
					sha256: hash(content),
					bytes: content.length,
					gzip: gzipSync(content, { level: 9 }).length,
				};
			});
		fs.writeFileSync(
			path.join(outDir, 'artifact.json'),
			JSON.stringify({
				sourceRoot: SOURCE_ROOT,
				runtimeSha256: hash(
					fs.readFileSync(path.join(SOURCE_ROOT, 'packages/octane/src/runtime.ts')),
				),
				assets,
			}),
		);
	}
	if (!fs.existsSync(path.join(outDir, 'index.html'))) {
		throw new Error(`Missing production hook/store fixture: ${outDir}`);
	}
	const server = await preview({
		configFile: false,
		root: HERE,
		logLevel: 'error',
		build: { outDir },
		preview: { host: '127.0.0.1', port: 0, strictPort: true },
	});
	const address = server.httpServer.address();
	if (address === null || typeof address === 'string') {
		await closeServer(server);
		throw new Error('The hook/store preview did not expose a TCP port');
	}
	return {
		url: `http://127.0.0.1:${address.port}/`,
		artifact: fs.existsSync(path.join(outDir, 'artifact.json'))
			? JSON.parse(fs.readFileSync(path.join(outDir, 'artifact.json'), 'utf8'))
			: null,
		close: () => closeServer(server),
	};
}

function closeServer(server) {
	return server.close();
}

export async function closeResources(browser, fixture) {
	const failures = [];
	for (const [name, resource] of [
		['browser', browser],
		['fixture', fixture],
	]) {
		if (!resource) continue;
		try {
			await resource.close();
		} catch (error) {
			const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
			failures.push(`${name} cleanup: ${message}`);
		}
	}
	return failures;
}

export function fixtureUrl(origin, lane, diagnostics = false) {
	const url = new URL(origin);
	url.searchParams.set('lane', lane);
	if (diagnostics) url.searchParams.set('diagnostics', '1');
	return url.href;
}

export async function openCase(browser, origin, lane, diagnostics = false) {
	const context = await browser.newContext();
	const page = await context.newPage();
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'error') errors.push(message.text());
	});
	try {
		await page.goto(fixtureUrl(origin, lane, diagnostics), { waitUntil: 'load' });
		await page.waitForFunction(() => window.__ready === true, null, { timeout: 10_000 });
		return { context, page, errors };
	} catch (error) {
		await context.close();
		throw new Error(`${lane}: production fixture failed to start: ${errors.join('; ')}`, {
			cause: error,
		});
	}
}

export function checkBrowserErrors(lane, errors) {
	if (errors.length !== 0) throw new Error(`${lane}: browser errors: ${errors.join('; ')}`);
}

export function writePayload(payload) {
	if (process.env.BENCH_JSON) {
		fs.writeFileSync(process.env.BENCH_JSON, `${JSON.stringify(payload, null, '\t')}\n`);
	}
}
