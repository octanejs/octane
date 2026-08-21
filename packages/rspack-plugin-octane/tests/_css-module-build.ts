import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import rspack, { type Configuration, type RuleSetRule, type Stats } from '@rspack/core';
import { JSDOM } from 'jsdom';
import { OctaneRspackPlugin } from '../src/index.js';
import type { OctaneRspackPluginOptions } from '../types/index.js';

const requireFixture = createRequire(import.meta.url);
const octanePackage = fileURLToPath(new URL('../../octane/', import.meta.url));
let buildNumber = 0;

export type CssOption = OctaneRspackPluginOptions['cssModuleConstants'];
export type CssProvider = Exclude<NonNullable<CssOption>, boolean>;
export type CssProviderInput = Parameters<CssProvider>[0];
export type CssMode = 'named' | 'default' | 'native';

export function write(root: string, relative: string, source: string) {
	const filename = join(root, relative);
	mkdirSync(dirname(filename), { recursive: true });
	writeFileSync(filename, source);
	return filename;
}

export function createFixture(files: Record<string, string>) {
	const root = realpathSync(mkdtempSync(join(tmpdir(), 'octane-rspack-css-constants-')));
	write(
		root,
		'package.json',
		JSON.stringify({ type: 'module', sideEffects: false, dependencies: { octane: '*' } }),
	);
	mkdirSync(join(root, 'node_modules'));
	symlinkSync(octanePackage, join(root, 'node_modules/octane'), 'dir');
	for (const [filename, source] of Object.entries(files)) write(root, filename, source);
	return root;
}

export function cssRule(mode: CssMode = 'named', localIdentName = 'mapped_[local]'): RuleSetRule {
	if (mode === 'native') {
		return {
			test: /\.module\.css$/,
			type: 'css/module',
			sideEffects: false,
			parser: { namedExports: true },
			generator: { localIdentName, exportsOnly: false },
		};
	}
	return {
		test: /\.module\.css$/,
		type: 'javascript/auto',
		// The application owns this policy. An unused exported component may
		// take its private stylesheet with it; enabling proofs must not change it.
		sideEffects: false,
		use: [
			rspack.CssExtractRspackPlugin.loader,
			{
				loader: requireFixture.resolve('css-loader'),
				options: {
					esModule: true,
					modules: { namedExport: mode === 'named', localIdentName },
				},
			},
		],
	};
}

export interface CssBuildOptions {
	server?: boolean;
	externalRuntime?: boolean;
	cssMode?: CssMode;
	cssModuleConstants?: CssOption;
	parallel?: OctaneRspackPluginOptions['parallel'];
	rules?: RuleSetRule[];
	configuration?: Configuration;
}

export function configurationForFixture(
	root: string,
	entry: NonNullable<Configuration['entry']>,
	{
		server = false,
		externalRuntime = !server,
		cssMode = 'named',
		cssModuleConstants = true,
		parallel = false,
		rules = [cssRule(cssMode)],
		configuration = {},
	}: CssBuildOptions = {},
) {
	const directory = configuration.output?.path ?? join(root, `dist-${++buildNumber}`);
	const { output, plugins = [], optimization, ...rest } = configuration;
	const result: Configuration = {
		context: root,
		mode: 'production',
		target: server ? 'node22' : 'web',
		entry,
		devtool: false,
		// The fixture consumes the authored workspace runtime, whose TypeScript
		// modules use their published JavaScript import spelling.
		resolve: { extensionAlias: { '.js': ['.ts', '.js'] } },
		experiments: { css: cssMode === 'native' },
		...(externalRuntime ? { externalsType: 'commonjs', externals: [/^octane(?:\/|$)/] } : {}),
		module: { rules },
		...rest,
		output: {
			path: directory,
			filename: '[name].cjs',
			chunkFilename: '[id].cjs',
			cssFilename: '[name].css',
			cssChunkFilename: '[id].css',
			publicPath: '/',
			globalObject: 'globalThis',
			library: server ? { type: 'commonjs2' } : { name: 'cssFixture', type: 'var' },
			...output,
		},
		optimization: { minimize: true, ...optimization },
		plugins: [
			...(cssMode === 'native'
				? []
				: [
						new rspack.CssExtractRspackPlugin({
							filename: '[name].css',
							chunkFilename: '[id].css',
						}),
					]),
			new OctaneRspackPlugin({ hmr: false, parallel, cssModuleConstants }),
			...plugins,
		],
	};
	return { directory, configuration: result };
}

export interface CssBuildSnapshot {
	assetNames: string[];
	chunks: { initial: boolean | undefined; files: string[] }[];
	cssModules: {
		id: string;
		resource: string;
		layer: string | undefined;
		type: string;
		code: string | undefined;
	}[];
}

/** Copy native-backed build data while the run/watch callback owns it. */
export function snapshotBuild(stats: Stats): CssBuildSnapshot {
	if (stats.hasErrors()) throw new Error(stats.toString({ all: false, errors: true }));
	const json = stats.toJson({ all: false, chunks: true });
	return {
		// Stats presentation can group unchanged cache-hit assets into nameless
		// rows. The compilation owns the complete, ungrouped asset collection.
		assetNames: stats.compilation.getAssets().map((asset) => asset.name),
		chunks: (json.chunks ?? []).map((chunk) => ({
			initial: chunk.initial,
			files: [...(chunk.files ?? [])],
		})),
		cssModules: [...stats.compilation.modules].flatMap((module) => {
			if (
				!(module instanceof rspack.NormalModule) ||
				typeof module.resource !== 'string' ||
				!/\.module\.css(?:[?#]|$)/i.test(module.resource)
			) {
				return [];
			}
			return [
				{
					id: module.identifier(),
					resource: module.resource,
					layer: module.layer ?? undefined,
					type: module.type,
					code: module.originalSource()?.source().toString(),
				},
			];
		}),
	};
}

export async function compile(configuration: Configuration): Promise<CssBuildSnapshot> {
	const compiler = rspack(configuration);
	return new Promise((resolve, reject) => {
		compiler.run((error, stats) => {
			let snapshot: CssBuildSnapshot | undefined;
			let failure: unknown = error;
			if (!failure) {
				try {
					if (!stats) throw new Error('Rspack completed without stats.');
					snapshot = snapshotBuild(stats);
				} catch (error) {
					failure = error;
				}
			}
			compiler.close((closeError) => {
				if (failure || closeError) return reject(failure ?? closeError);
				resolve(snapshot!);
			});
		});
	});
}

export function readBuild(directory: string, snapshot: CssBuildSnapshot) {
	const css = Object.fromEntries(
		snapshot.assetNames
			.filter((name) => name.endsWith('.css'))
			.map((name) => [name, readFileSync(join(directory, name), 'utf8')]),
	);
	const cssFiles = (initial: boolean) =>
		[
			...new Set(
				snapshot.chunks
					.filter((chunk) => chunk.initial === initial)
					.flatMap((chunk) => chunk.files ?? []),
			),
		]
			.filter((filename) => filename.endsWith('.css'))
			.sort();
	return {
		directory,
		cssModules: snapshot.cssModules,
		css,
		cssSource: Object.values(css).join('\n'),
		initialCss: cssFiles(true),
		lazyCss: cssFiles(false),
	};
}

export async function buildFixture(
	root: string,
	entry: NonNullable<Configuration['entry']>,
	options: CssBuildOptions = {},
) {
	const { directory, configuration } = configurationForFixture(root, entry, options);
	return readBuild(directory, await compile(configuration));
}

export type Build = ReturnType<typeof readBuild>;

export function serverModule(output: Build, entry = 'main'): Record<string, any> {
	const filename = join(output.directory, `${entry}.cjs`);
	delete requireFixture.cache[filename];
	return requireFixture(filename);
}

export function renderClient(output: Build) {
	const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
		runScripts: 'outside-only',
		url: 'https://fixture.test/',
	});
	try {
		dom.window.eval(readFileSync(join(output.directory, 'main.cjs'), 'utf8'));
		const api = (dom.window as unknown as { cssFixture: Record<string, any> }).cssFixture;
		const container = dom.window.document.getElementById('root')!;
		const unmount = api.render(container);
		const html = container.innerHTML;
		unmount();
		return html;
	} finally {
		dom.window.close();
	}
}
