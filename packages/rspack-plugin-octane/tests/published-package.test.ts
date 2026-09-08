import {
	cpSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	realpathSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { constants as zlib, gzipSync } from 'node:zlib';
import rspack from '@rspack/core';
import { build } from 'esbuild';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { verifyScenario } from '../../../benchmarks/bundle-size/verify-reachability.mjs';
import { buildPackageCommonjs } from '../../../scripts/build-package-commonjs.mjs';
import { OctaneRspackPlugin } from '../src/index.js';

const repositoryRoot = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const octaneSourcePackage = join(repositoryRoot, 'packages/octane');
const fixtures = fileURLToPath(new URL('./_fixtures/', import.meta.url));
const packageRequire = createRequire(import.meta.url);
const { JSDOM } = packageRequire('jsdom') as {
	JSDOM: new (
		markup: string,
		options: { runScripts: 'outside-only'; pretendToBeVisual: boolean },
	) => {
		window: Window & {
			eval(source: string): unknown;
			close(): void;
			__OCTANE_REACHABILITY__?: { run(container: HTMLElement): Promise<unknown> };
		};
	};
};

function write(root: string, relativePath: string, content: string) {
	const file = join(root, relativePath);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, content);
	return file;
}

/** Build the real per-module runtime with the package's actual published exports. */
async function installPublishedOctane(packageDirectory: string) {
	const manifest = JSON.parse(readFileSync(join(octaneSourcePackage, 'package.json'), 'utf8'));
	const sourceDirectory = join(packageDirectory, 'src');
	const distDirectory = join(packageDirectory, 'dist');
	cpSync(join(octaneSourcePackage, 'src'), sourceDirectory, { recursive: true });
	write(
		packageDirectory,
		'package.json',
		JSON.stringify({ ...manifest, ...manifest.publishConfig, publishConfig: undefined }) + '\n',
	);
	// Runtime dependencies remain real workspace-installed packages; the Octane
	// package itself has no source entry or ambient workspace alias to fall back to.
	symlinkSync(
		join(octaneSourcePackage, 'node_modules'),
		join(packageDirectory, 'node_modules'),
		'dir',
	);
	const entryPoints = readdirSync(sourceDirectory, { recursive: true, encoding: 'utf8' })
		.filter(
			(file) =>
				(file.endsWith('.ts') || file.endsWith('.js')) &&
				!file.endsWith('.d.ts') &&
				!file.startsWith(`compiler${sep}`),
		)
		.map((file) => join(sourceDirectory, file));
	await build({
		entryPoints,
		outdir: distDirectory,
		outbase: sourceDirectory,
		format: 'esm',
		platform: 'neutral',
		target: 'esnext',
		bundle: false,
		logLevel: 'silent',
	});
	await buildPackageCommonjs({
		packageDir: packageDirectory,
		entries: ['src/index.ts', 'src/server/index.ts'],
		outdir: 'dist/cjs',
		sourceRoot: 'src',
	});
	cpSync(join(sourceDirectory, 'compiler'), join(distDirectory, 'compiler'), { recursive: true });
	rmSync(sourceDirectory, { recursive: true, force: true });
}

function copyPublishedOctane(source: string, destination: string) {
	cpSync(join(source, 'dist'), join(destination, 'dist'), { recursive: true });
	cpSync(join(source, 'package.json'), join(destination, 'package.json'));
	symlinkSync(join(octaneSourcePackage, 'node_modules'), join(destination, 'node_modules'), 'dir');
}

async function compile(config: Record<string, unknown>) {
	const compiler = rspack(config as any) as any;
	return new Promise<any>((resolve, reject) => {
		compiler.run((error: Error | null, stats: any) => {
			compiler.close((closeError: Error | null) => {
				if (error || closeError) {
					reject(error ?? closeError);
					return;
				}
				if (!stats || stats.hasErrors()) {
					const errors = stats?.toJson({ all: false, errors: true }).errors ?? [];
					reject(
						new Error(
							errors.map((entry: any) => entry.message ?? String(entry)).join('\n') ||
								'Rspack completed without stats.',
						),
					);
					return;
				}
				resolve(stats);
			});
		});
	});
}

interface ChunkModule {
	nameForCondition?: string;
	modules?: ChunkModule[];
	children?: ChunkModule[];
}

/** Inspect emitted chunks, not modules that Rspack merely parsed and discarded. */
function retainedModules(stats: any): string[] {
	const retained = new Set<string>();
	const visit = (modules: ChunkModule[]) => {
		for (const module of modules) {
			if (module.nameForCondition) retained.add(module.nameForCondition.split(sep).join('/'));
			visit(module.modules ?? []);
			visit(module.children ?? []);
		}
	};
	const output = stats.toJson({
		all: false,
		chunks: true,
		chunkModules: true,
		dependentModules: true,
		nestedModules: true,
		orphanModules: true,
		cachedModules: true,
		chunkModulesSpace: 10_000,
		nestedModulesSpace: 10_000,
		groupModulesByAttributes: false,
		groupModulesByCacheStatus: false,
		groupModulesByExtension: false,
		groupModulesByLayer: false,
		groupModulesByPath: false,
		groupModulesByType: false,
	});
	for (const chunk of output.chunks ?? []) visit(chunk.modules ?? []);
	return [...retained].sort();
}

async function runRefs(code: string) {
	const browser = new JSDOM('<!doctype html><div id="root"></div>', {
		runScripts: 'outside-only',
		pretendToBeVisual: true,
	});
	try {
		browser.window.eval(code);
		const scenario = browser.window.__OCTANE_REACHABILITY__;
		expect(scenario?.run).toBeTypeOf('function');
		const container = browser.window.document.getElementById('root')!;
		const result = await scenario!.run(container);
		// The bundle executes in a fresh browser realm; compare public JSON values.
		return JSON.parse(JSON.stringify(result));
	} finally {
		browser.window.close();
	}
}

const expectedRefs = {
	calls: ['first:attach', 'first:detach', 'second:attach', 'second:detach'],
	sameElement: true,
	text: 'ready',
	cleaned: true,
};

describe('published Octane package in Rspack', () => {
	let scratch: string;
	let root: string;
	let installedOctane: string;
	let nestedOctane: string;

	beforeAll(async () => {
		scratch = realpathSync(mkdtempSync(join(tmpdir(), 'octane-rspack-published-')));
		root = join(scratch, 'app');
		installedOctane = join(root, 'node_modules/octane');
		await installPublishedOctane(installedOctane);
		write(
			root,
			'package.json',
			JSON.stringify({
				name: 'published-rspack-consumer',
				private: true,
				type: 'module',
				dependencies: { octane: '*', '@fixture/linked-refs': '*' },
			}) + '\n',
		);
		const refSource = readFileSync(join(fixtures, 'published-refs.tsrx'), 'utf8');
		const serverSource = readFileSync(join(fixtures, 'published-server.tsrx'), 'utf8');
		write(root, 'src/Refs.tsrx', refSource);
		write(root, 'src/Server.tsrx', serverSource);
		write(root, 'src/refs.js', "export { run } from './Refs.tsrx';\n");
		write(
			root,
			'src/static.tsrx',
			readFileSync(
				join(repositoryRoot, 'benchmarks/bundle-size/fixtures/minimal/root-static.tsrx'),
				'utf8',
			),
		);
		const linkedRoot = join(scratch, 'linked-refs');
		write(
			linkedRoot,
			'package.json',
			JSON.stringify({
				name: '@fixture/linked-refs',
				type: 'module',
				exports: { '.': './Refs.tsrx', './server': './Server.tsrx' },
				dependencies: { octane: '*' },
			}) + '\n',
		);
		write(linkedRoot, 'Refs.tsrx', refSource);
		write(linkedRoot, 'Server.tsrx', serverSource);
		nestedOctane = join(linkedRoot, 'node_modules/octane');
		copyPublishedOctane(installedOctane, nestedOctane);
		mkdirSync(join(root, 'node_modules/@fixture'), { recursive: true });
		symlinkSync(linkedRoot, join(root, 'node_modules/@fixture/linked-refs'), 'dir');
		write(
			root,
			'src/linked.js',
			`import { RefComponent } from '@fixture/linked-refs';
import { run as runWithComponent } from './Refs.tsrx';
export const run = (container) => runWithComponent(container, RefComponent);
`,
		);
		write(
			root,
			'src/server.js',
			`import { ServerMessage } from '@fixture/linked-refs/server';
import { run as renderWithComponent } from './Server.tsrx';
export const run = () => renderWithComponent(ServerMessage);
`,
		);
		write(
			root,
			'src/profiled.js',
			`import { profiler } from 'octane/profiling';
import { run as runLinked } from './linked.js';
export async function run(container) {
	profiler.start();
	try {
		const result = await runLinked(container);
		return { ...result, profiled: profiler.getEvents().some((event) => event.component === 'RefComponent') };
	} finally {
		profiler.stop();
	}
}
`,
		);
	}, 60_000);

	afterAll(async () => {
		if (scratch)
			await rm(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
	});

	async function buildProduction(
		entry: string,
		name: string,
		options: { runtime?: string; profile?: boolean } = {},
		target: 'web' | 'node' = 'web',
	) {
		const outputPath = join(root, `dist-${name}`);
		const filename = target === 'node' ? 'bundle.cjs' : 'bundle.js';
		const stats = await compile({
			context: root,
			mode: 'production',
			target,
			entry: `./src/${entry}`,
			devtool: false,
			optimization: { minimize: true, splitChunks: false, runtimeChunk: false },
			output: {
				path: outputPath,
				filename,
				library:
					target === 'node'
						? { type: 'commonjs2' }
						: { name: '__OCTANE_REACHABILITY__', type: 'var' },
			},
			plugins: [new OctaneRspackPlugin({ parallel: false, ...options })],
		});
		const file = join(outputPath, filename);
		const code = readFileSync(file, 'utf8');
		return {
			code,
			file,
			modules: retainedModules(stats),
			sizes: {
				raw: Buffer.byteLength(code),
				gzip: gzipSync(code, { level: zlib.Z_BEST_COMPRESSION }).length,
			},
		};
	}

	it('preserves changing callback refs through ordinary public imports', async () => {
		const explicit = await buildProduction('refs.js', 'refs-explicit', {
			runtime: join(installedOctane, 'dist/index.js'),
		});
		expect(await runRefs(explicit.code)).toEqual(expectedRefs);

		const automatic = await buildProduction('refs.js', 'refs-automatic');
		expect(await runRefs(automatic.code)).toEqual(expectedRefs);
	}, 60_000);

	it('keeps the CommonJS distribution out of an ESM production application', async () => {
		// The package really has distinct conditional exports; source-only workspace
		// packages resolve the same file for import and require and miss this case.
		const requireEntry = createRequire(join(root, 'package.json')).resolve('octane');
		expect(requireEntry).toBe(join(installedOctane, 'dist/cjs/index.cjs'));
		const explicit = await buildProduction('static.tsrx', 'static-explicit', {
			runtime: join(installedOctane, 'dist/index.js'),
		});
		const commonjs = await buildProduction('static.tsrx', 'static-commonjs', {
			runtime: requireEntry,
		});
		const automatic = await buildProduction('static.tsrx', 'static-automatic');
		await verifyScenario('root-static', explicit.code);
		await verifyScenario('root-static', commonjs.code);
		await verifyScenario('root-static', automatic.code);

		const commonjsDirectory = `${installedOctane.split(sep).join('/')}/dist/cjs/`;
		// A forced CommonJS build is a semantic negative control for the reachability
		// observation, and verifies that an explicit absolute runtime remains respected.
		expect(commonjs.modules.some((module) => module.startsWith(commonjsDirectory))).toBe(true);
		expect(explicit.modules.filter((module) => module.startsWith(commonjsDirectory))).toEqual([]);
		expect(
			automatic.modules.filter((module) => module.startsWith(commonjsDirectory)),
			`default ${JSON.stringify(automatic.sizes)}; explicit ESM ${JSON.stringify(explicit.sizes)}`,
		).toEqual([]);
	}, 60_000);

	it('renders linked source components within the application server context', async () => {
		const result = await buildProduction('server.js', 'server', { profile: true }, 'node');
		const scenario = packageRequire(result.file) as { run(): { html: string; css: string } };
		expect(scenario.run()).toEqual({ html: '<span>provided</span>', css: '' });
		const nestedDirectory = `${nestedOctane.split(sep).join('/')}/`;
		expect(result.modules.filter((module) => module.startsWith(nestedDirectory))).toEqual([]);
	}, 60_000);

	it.each([false, true])(
		'shares the application runtime with linked source packages (profile=%s)',
		async (profile) => {
			const result = await buildProduction(
				profile ? 'profiled.js' : 'linked.js',
				`linked-${profile}`,
				{ profile },
			);
			expect(await runRefs(result.code)).toEqual({
				...expectedRefs,
				...(profile ? { profiled: true } : {}),
			});
			const nestedDirectory = `${nestedOctane.split(sep).join('/')}/`;
			expect(result.modules.filter((module) => module.startsWith(nestedDirectory))).toEqual([]);
		},
		60_000,
	);
});
