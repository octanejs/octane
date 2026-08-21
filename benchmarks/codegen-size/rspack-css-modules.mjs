// Exercise the actual Rspack adapter: a low-level compiler sentinel alone would
// remain green if the adapter stopped discovering or forwarding CSS proofs.
// Each pair uses identical authored source and loaders, excludes the framework
// from measured JS, and checks real CSS assets plus a complete SSR bundle.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, constants as zc, gzipSync } from 'node:zlib';
import rspack from '@rspack/core';
import { OctaneRspackPlugin } from '@octanejs/rspack-plugin';
import { CSS_MODULE_FIXTURE } from './css-modules.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const IMMUTABLE_META = 'octane:codegen-size:immutable-css';
const CSS_LOADER = require.resolve('css-loader');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const val = (bytes) => ({ median: bytes, min: bytes, samples: 1 });
const relative = (request) => {
	assert.ok(request.startsWith('./') && !request.slice(2).includes('..'));
	return request.slice(2);
};

function write(root, filename, source) {
	const target = path.join(root, filename);
	fs.mkdirSync(path.dirname(target), { recursive: true });
	fs.writeFileSync(target, source);
	return target;
}

function createFixture(parent, lane) {
	const root = path.join(parent, lane);
	const moduleFile = path.join(root, relative(CSS_MODULE_FIXTURE.moduleRequest));
	const namedImport = `import styles, { label } from '${CSS_MODULE_FIXTURE.moduleRequest}';`;
	const source =
		lane === 'named'
			? CSS_MODULE_FIXTURE.source.replace(
					namedImport,
					`import * as styles from '${CSS_MODULE_FIXTURE.moduleRequest}';\nimport { label } from '${CSS_MODULE_FIXTURE.moduleRequest}';`,
				)
			: CSS_MODULE_FIXTURE.source;
	if (lane === 'named') assert.notEqual(source, CSS_MODULE_FIXTURE.source);
	const classes =
		lane === 'named'
			? Object.fromEntries(
					Object.keys(CSS_MODULE_FIXTURE.classes).map((name) => [name, `mapped_${name}`]),
				)
			: CSS_MODULE_FIXTURE.classes;
	write(
		root,
		'package.json',
		JSON.stringify({
			name: `octane-rspack-css-${lane}-sentinel`,
			type: 'module',
			sideEffects: false,
			dependencies: { octane: '*' },
		}),
	);
	fs.mkdirSync(path.join(root, 'node_modules'));
	fs.symlinkSync(
		path.join(REPO, 'packages/octane'),
		path.join(root, 'node_modules/octane'),
		process.platform === 'win32' ? 'junction' : 'dir',
	);
	write(root, relative(CSS_MODULE_FIXTURE.componentRequest), source);
	write(
		root,
		'entry.js',
		`export { CssModules } from ${JSON.stringify(CSS_MODULE_FIXTURE.componentRequest)};`,
	);
	write(
		root,
		'server.js',
		`import { renderToString } from 'octane/server';
import { CssModules } from ${JSON.stringify(CSS_MODULE_FIXTURE.componentRequest)};
export async function render(props) { return (await renderToString(CssModules, props)).html; }`,
	);
	let rules;
	if (lane === 'named') {
		write(
			root,
			relative(CSS_MODULE_FIXTURE.moduleRequest),
			Object.keys(classes)
				.map((name, index) => `.${name}{--css-module-sentinel:${index}}`)
				.join('\n'),
		);
		rules = [
			{
				test: /\.module\.css$/,
				type: 'javascript/auto',
				sideEffects: false,
				use: [
					rspack.CssExtractRspackPlugin.loader,
					{
						loader: CSS_LOADER,
						options: {
							esModule: true,
							modules: { namedExport: true, localIdentName: 'mapped_[local]' },
						},
					},
				],
			},
		];
	} else {
		write(root, relative(CSS_MODULE_FIXTURE.moduleRequest), '');
		write(
			root,
			relative(CSS_MODULE_FIXTURE.stylesheetRequest),
			CSS_MODULE_FIXTURE.stylesheetSource,
		);
		const loader = write(
			root,
			'provider-loader.cjs',
			`module.exports = function () {
  this._module.buildInfo[${JSON.stringify(IMMUTABLE_META)}] = ${JSON.stringify({ named: classes, default: classes })};
  return ${JSON.stringify(CSS_MODULE_FIXTURE.providerSource)};
};`,
		);
		rules = [
			{
				test: /\.css$/,
				oneOf: [
					{
						test: /\.module\.css$/,
						type: 'javascript/auto',
						sideEffects: false,
						use: [loader],
					},
					{
						type: 'javascript/auto',
						sideEffects: true,
						use: [
							rspack.CssExtractRspackPlugin.loader,
							{ loader: CSS_LOADER, options: { modules: false } },
						],
					},
				],
			},
		];
	}
	return { root, lane, moduleFile, source, classes, rules, buildNumber: 0 };
}

async function buildFixture(fixture, mode, proven, minify, withRuntime = false) {
	const directory = path.join(fixture.root, `dist-${++fixture.buildNumber}`);
	const cssModuleConstants = !proven
		? false
		: fixture.lane === 'named'
			? true
			: ({ meta }) => meta[IMMUTABLE_META];
	const compiler = rspack({
		context: fixture.root,
		mode: 'production',
		target: mode === 'server' ? 'node22' : 'web',
		entry: withRuntime ? './server.js' : './entry.js',
		devtool: false,
		cache: false,
		resolve: { extensionAlias: { '.js': ['.ts', '.js'] } },
		experiments: { css: false },
		output: {
			path: directory,
			filename: 'main.cjs',
			publicPath: '/',
			library: { type: 'commonjs2' },
		},
		...(withRuntime ? {} : { externalsType: 'commonjs', externals: [/^octane(?:\/|$)/] }),
		module: { rules: fixture.rules },
		optimization: { minimize: minify, splitChunks: false, runtimeChunk: false },
		plugins: [
			new rspack.CssExtractRspackPlugin({ filename: 'main.css' }),
			new OctaneRspackPlugin({
				hmr: false,
				dev: false,
				parallel: false,
				cssModuleConstants,
			}),
		],
	});
	const snapshot = await new Promise((resolve, reject) => {
		compiler.run((error, result) => {
			let captured;
			let failure = error;
			if (!failure) {
				try {
					if (!result) throw new Error('Rspack completed without stats.');
					if (result.hasErrors()) {
						throw new Error(result.toString({ all: false, errors: true }));
					}
					const provider = [...result.compilation.modules].find(
						(module) => module.resource === fixture.moduleFile,
					);
					captured = {
						assets: result.compilation.getAssets().map((asset) => asset.name),
						providerSource: provider?.originalSource()?.source().toString(),
					};
					assert.equal(
						typeof captured.providerSource,
						'string',
						'missing completed CSS provider source',
					);
				} catch (error) {
					failure = error;
				}
			}
			compiler.close((closeError) => {
				if (failure || closeError) return reject(failure ?? closeError);
				resolve(captured);
			});
		});
	});
	// Compilation and Module wrap native build state; only these copied strings
	// survive compiler.close(). The emitted files remain the byte-size oracle.
	const { assets, providerSource } = snapshot;
	assert.deepEqual(
		assets.filter((name) => name.endsWith('.cjs')),
		['main.cjs'],
	);
	assert.deepEqual(
		assets.filter((name) => name.endsWith('.css')),
		['main.css'],
	);
	const code = fs.readFileSync(path.join(directory, 'main.cjs'));
	const stylesheet = fs.readFileSync(path.join(directory, 'main.css'), 'utf8');
	for (const value of Object.values(fixture.classes)) {
		assert.ok(stylesheet.includes(`.${value}`), `missing emitted CSS rule ${value}`);
	}
	return { directory, code, stylesheet, providerSource };
}

function compressedSizes(code) {
	return {
		minified: code.length,
		gzip: gzipSync(code, { level: zc.Z_BEST_COMPRESSION }).length,
		brotli: brotliCompressSync(code, {
			params: { [zc.BROTLI_PARAM_QUALITY]: zc.BROTLI_MAX_QUALITY },
		}).length,
	};
}

export async function measureRspackCssModules() {
	const parent = fs.realpathSync(fs.mkdtempSync(path.join(tmpdir(), 'octane-rspack-css-size-')));
	const targets = [];
	const summary = {
		provenance: {
			nodeExecutable: process.execPath,
			node: process.version,
			zlib: process.versions.zlib,
			brotli: process.versions.brotli,
			rspack: require('@rspack/core/package.json').version,
			cssLoader: require('css-loader/package.json').version,
			gzipLevel: zc.Z_BEST_COMPRESSION,
			brotliQuality: zc.BROTLI_MAX_QUALITY,
			measuredRuntime: 'external',
			cache: false,
			parallel: false,
		},
		lanes: {},
	};
	try {
		for (const lane of ['named', 'default']) {
			const fixture = createFixture(parent, lane);
			const laneSummary = { fixtureChecksum: hash(fixture.source), modes: {} };
			summary.lanes[lane] = laneSummary;
			let stylesheet;
			let rawStylesheet;
			let providerSource;
			for (const mode of ['client', 'server']) {
				laneSummary.modes[mode] = {};
				for (const [variant, proven] of [
					['control', false],
					['proven', true],
				]) {
					const raw = await buildFixture(fixture, mode, proven, false);
					const minified = await buildFixture(fixture, mode, proven, true);
					rawStylesheet ??= raw.stylesheet;
					stylesheet ??= minified.stylesheet;
					providerSource ??= minified.providerSource;
					assert.equal(raw.stylesheet, rawStylesheet, 'raw CSS must not change with proofs');
					assert.equal(minified.stylesheet, stylesheet, 'minified CSS must not change with proofs');
					assert.equal(
						raw.providerSource,
						providerSource,
						'the actual provider must stay identical',
					);
					assert.equal(
						minified.providerSource,
						providerSource,
						'the actual provider must stay identical',
					);
					const sizes = { raw: raw.code.length, ...compressedSizes(minified.code) };
					laneSummary.modes[mode][variant] = sizes;
					targets.push({
						name: `rspack-css-${lane}-${mode}-${variant}`,
						ops: Object.fromEntries(
							Object.entries(sizes).map(([name, value]) => [name, val(value)]),
						),
					});
				}
			}
			const html = {};
			for (const [variant, proven] of [
				['control', false],
				['proven', true],
			]) {
				const output = await buildFixture(fixture, 'server', proven, true, true);
				assert.equal(output.stylesheet, stylesheet, 'SSR must retain the same stylesheet');
				assert.equal(output.providerSource, providerSource, 'SSR must use the same provider');
				const filename = path.join(output.directory, 'main.cjs');
				const module = require(filename);
				html[variant] = [];
				for (const { props, contains } of CSS_MODULE_FIXTURE.semanticInputs) {
					const rendered = await module.render(props);
					for (const expected of contains) assert.ok(rendered.includes(expected), expected);
					assert.ok(rendered.includes(`class="${fixture.classes.root}"`));
					assert.ok(rendered.includes(`class="${fixture.classes.caption} muted"`));
					html[variant].push(rendered);
				}
				delete require.cache[filename];
			}
			assert.deepEqual(html.proven, html.control, 'Rspack CSS proofs must render identically');
			Object.assign(laneSummary, {
				providerChecksum: hash(providerSource),
				semanticChecksum: hash(JSON.stringify(html.control)),
				stylesheetChecksum: hash(stylesheet),
				stylesheetBytes: Buffer.byteLength(stylesheet),
			});
			for (const target of targets.filter((target) =>
				target.name.startsWith(`rspack-css-${lane}-`),
			)) {
				target.meta = {
					provenance: summary.provenance,
					lane,
					fixtureChecksum: laneSummary.fixtureChecksum,
					providerChecksum: laneSummary.providerChecksum,
					semanticChecksum: laneSummary.semanticChecksum,
					stylesheetChecksum: laneSummary.stylesheetChecksum,
					stylesheetBytes: laneSummary.stylesheetBytes,
				};
			}
		}
		return { targets, summary };
	} finally {
		fs.rmSync(parent, { recursive: true, force: true });
	}
}
