// Deterministic source/build-level size evidence for Octane's background-only
// Lynx preview shape and its dual-thread instant-first-render (IFR) shape.
// Both targets use the real Octane compiler and Rspeedy encoder. The preview
// target pairs the real background renderer with the real main host receiver,
// but deliberately does not render the authored tree on main. The IFR target
// uses @octanejs/rspeedy-plugin application mode unchanged.
//
// The encoded artifacts are decoded, their thread ownership is checked, and a
// marker checksums prove that each measured thread still contains its visible
// or background-owned slice of the representative tree/state/event workload.
// This does not execute a Lynx engine and makes no native timing, paint,
// adoption, or memory claim.
process.env.NODE_ENV = 'production';

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { brotliCompressSync, constants as zc, gzipSync } from 'node:zlib';

import { pluginOctane } from '../../packages/rspeedy-plugin-octane/src/index.js';
import {
	LYNX_TARGET_SDK_VERSION,
	exposeLynxTemplatePlugin,
} from '../../packages/rspeedy-plugin-octane/src/application.js';

import {
	lynxModeBackgroundSemanticMarkers,
	lynxModeVisibleSemanticMarkers,
} from './src/semantics.js';

const ROOT = import.meta.dirname;
const REPO = path.resolve(ROOT, '../..');
const RSPEEDY_MODULES = path.join(REPO, 'packages/rspeedy-plugin-octane/node_modules');
// Use the plugin's checked fixture only as the dependency-resolution anchor.
// The benchmark entry and every measured artifact remain benchmark-owned.
const RSPEEDY_CWD = path.join(REPO, 'packages/rspeedy-plugin-octane/tests/_fixtures/application');
const LYNX_BACKGROUND_LAYER = 'octane:background';
const LYNX_MAIN_THREAD_LAYER = 'octane:main-thread';
const ENTRY_NAME = 'main';
const PREVIEW_RECEIVER_NAME = 'main__preview_receiver';
const BUNDLE_NAME = 'main.lynx.bundle';
const FORBIDDEN_RUNTIME = /(?:^|[^$\w])(?:react|react-dom|preact|ReactLynx)(?:[^$\w]|$)/i;
const FORBIDDEN_DOM = /\b(?:document|window|HTMLElement|MutationObserver)\b/;

function packageEntry(packageName) {
	const packageRoot = path.join(RSPEEDY_MODULES, ...packageName.split('/'));
	const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
	const exported = manifest.exports?.['.'];
	const entry =
		typeof exported === 'string'
			? exported
			: typeof exported?.import === 'string'
				? exported.import
				: manifest.module || manifest.main;
	if (typeof entry !== 'string') throw new Error(`${packageName} has no importable package entry.`);
	return pathToFileURL(path.join(packageRoot, entry)).href;
}

const [{ createRspeedy }, templateModule, wrapperModule, tasm] = await Promise.all([
	import(packageEntry('@lynx-js/rspeedy')),
	import(packageEntry('@lynx-js/template-webpack-plugin')),
	import(packageEntry('@lynx-js/runtime-wrapper-webpack-plugin')),
	import(packageEntry('@lynx-js/tasm')),
]);
const { LynxEncodePlugin, LynxTemplatePlugin } = templateModule;
const { RuntimeWrapperWebpackPlugin } = wrapperModule;

const gzipBytes = (buffer) => gzipSync(buffer, { level: zc.Z_BEST_COMPRESSION }).length;
const brotliBytes = (buffer) =>
	brotliCompressSync(buffer, {
		params: { [zc.BROTLI_PARAM_QUALITY]: zc.BROTLI_MAX_QUALITY },
	}).length;
const stat = (value) => ({
	score: value,
	median: value,
	min: value,
	mean: value,
	p95: value,
	sd: 0,
	rme: 0,
	warmupRatio: 1,
	samples: 1,
});

function gate(condition, message) {
	if (!condition) throw new Error(`semantic checksum failed: ${message}`);
}

function nativeScriptBytes(script) {
	if (typeof script === 'string') return Buffer.from(script);
	if (ArrayBuffer.isView(script)) {
		return Buffer.from(script.buffer, script.byteOffset, script.byteLength);
	}
	if (Array.isArray(script)) {
		if (script.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)) {
			return Buffer.from(script);
		}
		return Buffer.concat(script.map(nativeScriptBytes));
	}
	if (script !== null && typeof script === 'object') {
		return Buffer.concat(Object.values(script).map(nativeScriptBytes));
	}
	return Buffer.alloc(0);
}

function decodedScript(decoded, key) {
	const bytes = nativeScriptBytes(decoded[key]);
	return { bytes, text: bytes.toString('latin1') };
}

function semanticChecksum(text, markers) {
	const present = markers.filter((marker) => text.includes(marker));
	return {
		checksum: createHash('sha256').update(JSON.stringify(present)).digest('hex'),
		present,
		missing: markers.filter((marker) => !present.includes(marker)),
	};
}

function withoutKnownDiagnosticText(text) {
	// The main renderer's error string describes a bounded render phase, not the
	// browser global. Keep the DOM-global scan strict without treating that word
	// as implementation evidence.
	return text.replaceAll('render window has closed', 'render phase has closed');
}

function sizeOps(bundle, main, background) {
	const programs = Buffer.concat([main, background]);
	return {
		bundle_raw: stat(bundle.length),
		bundle_gzip: stat(gzipBytes(bundle)),
		bundle_brotli: stat(brotliBytes(bundle)),
		program_raw: stat(programs.length),
		program_gzip: stat(gzipBytes(programs)),
		program_brotli: stat(brotliBytes(programs)),
		main_raw: stat(main.length),
		main_gzip: stat(gzipBytes(main)),
		main_brotli: stat(brotliBytes(main)),
		background_raw: stat(background.length),
		background_gzip: stat(gzipBytes(background)),
		background_brotli: stat(brotliBytes(background)),
	};
}

class MarkPreviewMainThreadAssetPlugin {
	apply(compiler) {
		compiler.hooks.thisCompilation.tap(this.constructor.name, (compilation) => {
			compilation.hooks.processAssets.tap(
				{
					name: this.constructor.name,
					stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL,
				},
				() => {
					for (const asset of compilation.getAssets()) {
						if (!asset.name.endsWith('/main-thread.js')) continue;
						compilation.updateAsset(asset.name, asset.source, {
							...asset.info,
							'lynx:main-thread': true,
						});
					}
				},
			);
		});
	}
}

function previewApplicationPlugin() {
	return {
		name: 'octane:lynx-preview-benchmark',
		setup(api) {
			exposeLynxTemplatePlugin(api);
			api.modifyEnvironmentConfig?.((config, { name, mergeEnvironmentConfig }) => {
				if (name !== 'lynx') return;
				return mergeEnvironmentConfig(config, {
					splitChunks: false,
					tools: { rspack: { output: { iife: false } } },
				});
			});
			api.modifyBundlerChain({
				order: 'post',
				handler(chain, { environment }) {
					if (environment.name !== 'lynx') return;
					const entries = chain.entryPoints.entries();
					const background = entries?.[ENTRY_NAME];
					if (background === undefined) {
						throw new Error('preview benchmark expected one Rspeedy `main` entry.');
					}
					const values = [...background.values()];
					chain.entryPoints.clear();
					for (const value of values) {
						chain.entry(ENTRY_NAME).add({
							...(typeof value === 'string' ? { import: [value] } : value),
							filename: '.rspeedy/main/background.js',
							layer: LYNX_BACKGROUND_LAYER,
						});
					}
					chain.entry(PREVIEW_RECEIVER_NAME).add({
						filename: '.rspeedy/main/main-thread.js',
						import: [path.join(ROOT, 'src/preview-main.js')],
						layer: LYNX_MAIN_THREAD_LAYER,
					});
					chain.plugin('octane:lynx-preview-template').use(LynxTemplatePlugin, [
						{
							chunks: [PREVIEW_RECEIVER_NAME, ENTRY_NAME],
							cssPlugins: [],
							dsl: 'react_nodiff',
							enableA11y: true,
							enableAccessibilityElement: false,
							enableCSSInheritance: false,
							enableCSSInvalidation: true,
							enableCSSSelector: true,
							enableNewGesture: false,
							enableRemoveCSSScope: true,
							filename: BUNDLE_NAME,
							intermediate: '.rspeedy/main',
							removeDescendantSelectorScope: true,
							targetSdkVersion: LYNX_TARGET_SDK_VERSION,
						},
					]);
					chain.plugin('octane:lynx-preview-mark-main').use(MarkPreviewMainThreadAssetPlugin, []);
					chain.plugin('octane:lynx-preview-runtime-wrapper').use(RuntimeWrapperWebpackPlugin, [
						{
							targetSdkVersion: LYNX_TARGET_SDK_VERSION,
							test: /^(?!.*main-thread\.js$).*\.js$/,
						},
					]);
					chain
						.plugin('octane:lynx-preview-encode')
						.use(LynxEncodePlugin, [{ inlineScripts: true }]);
				},
			});
		},
	};
}

async function decodeNativeBundle(content) {
	return tasm.supportNapi() ? tasm.decode_napi(content) : await tasm.decode_wasm(content);
}

async function buildMode(mode, outputRoot) {
	const rspeedy = await createRspeedy({
		cwd: RSPEEDY_CWD,
		loadEnv: false,
		environment: ['lynx'],
		rspeedyConfig: {
			mode: 'production',
			environments: { lynx: {} },
			dev: { hmr: false, liveReload: false },
			output: {
				cleanDistPath: true,
				distPath: { root: outputRoot },
				filenameHash: false,
				inlineScripts: true,
				sourceMap: false,
			},
			source: { entry: { [ENTRY_NAME]: path.join(ROOT, 'src/entry.ts') } },
			splitChunks: false,
			tools: {
				rspack: {
					resolve: { modules: [RSPEEDY_MODULES, 'node_modules'] },
				},
			},
			plugins:
				mode === 'preview'
					? [
							pluginOctane({ thread: 'background', hmr: false, dev: false }),
							previewApplicationPlugin(),
						]
					: [pluginOctane({ hmr: false, dev: false })],
		},
	});
	let build;
	try {
		build = await rspeedy.build();
	} finally {
		await build?.close();
	}
	const bundlePath = path.join(outputRoot, BUNDLE_NAME);
	const bundle = fs.readFileSync(bundlePath);
	const decoded = await decodeNativeBundle(bundle);
	gate(decoded['engine-version'] === LYNX_TARGET_SDK_VERSION, `${mode} engine version`);
	const main = decodedScript(decoded, 'main-thread-script');
	const background = decodedScript(decoded, 'background-thread-script');
	gate(main.bytes.length > 0, `${mode} main program is empty`);
	gate(background.bytes.length > 0, `${mode} background program is empty`);
	gate(/getJSContext/.test(main.text), `${mode} main program does not select JS context`);
	gate(!/getCoreContext/.test(main.text), `${mode} main program retained background context`);
	gate(
		/getCoreContext/.test(background.text),
		`${mode} background program does not select core context`,
	);
	gate(!/getJSContext/.test(background.text), `${mode} background program retained main context`);
	const combinedText = `${main.text}\n${background.text}`;
	const forbiddenRuntime = combinedText.match(FORBIDDEN_RUNTIME)?.[0];
	const forbiddenDOM = withoutKnownDiagnosticText(combinedText).match(FORBIDDEN_DOM)?.[0];
	gate(
		forbiddenRuntime === undefined,
		`${mode} retained forbidden runtime marker ${JSON.stringify(forbiddenRuntime)}`,
	);
	gate(
		forbiddenDOM === undefined,
		`${mode} retained DOM-only marker ${JSON.stringify(forbiddenDOM)}`,
	);
	const visibleMarkers = lynxModeVisibleSemanticMarkers();
	const backgroundMarkers = lynxModeBackgroundSemanticMarkers();
	const expectedVisibleChecksum = createHash('sha256')
		.update(JSON.stringify(visibleMarkers))
		.digest('hex');
	const expectedBackgroundChecksum = createHash('sha256')
		.update(JSON.stringify(backgroundMarkers))
		.digest('hex');
	const mainSemantics = semanticChecksum(main.text, visibleMarkers);
	const backgroundSemantics = semanticChecksum(background.text, backgroundMarkers);
	gate(
		backgroundSemantics.missing.length === 0,
		`${mode} background markers missing: ${backgroundSemantics.missing.join(', ')}`,
	);
	gate(
		backgroundSemantics.checksum === expectedBackgroundChecksum,
		`${mode} background checksum ${backgroundSemantics.checksum}`,
	);
	gate(!main.text.includes('lynx-mode-event-'), `${mode} main retained background tap update`);
	if (mode === 'preview') {
		gate(
			mainSemantics.present.length === 0,
			`preview main program retained authored markers: ${mainSemantics.present.join(', ')}`,
		);
	} else {
		gate(
			mainSemantics.missing.length === 0,
			`IFR main markers missing: ${mainSemantics.missing.join(', ')}`,
		);
		gate(
			mainSemantics.checksum === expectedVisibleChecksum,
			`IFR main checksum ${mainSemantics.checksum}`,
		);
	}
	return {
		name: mode === 'preview' ? 'octane-preview' : 'octane-ifr',
		ops: sizeOps(bundle, main.bytes, background.bytes),
		meta: {
			artifact: BUNDLE_NAME,
			engineVersion: decoded['engine-version'],
			backgroundByteChecksum: createHash('sha256').update(background.bytes).digest('hex'),
			semanticChecksum: expectedBackgroundChecksum,
			visibleSemanticChecksum: expectedVisibleChecksum,
			backgroundSemanticChecksum: backgroundSemantics.checksum,
			mainSemanticChecksum: mode === 'preview' ? null : mainSemantics.checksum,
			authoredRenderCopies: mode === 'preview' ? 1 : 2,
			evidence: 'decoded-production-artifact',
			nativeExecution: false,
		},
	};
}

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'octane-lynx-bundle-size-'));
const results = [];
let failed;
try {
	for (const mode of ['preview', 'ifr']) {
		console.error(`Building Octane Lynx ${mode} artifact with Rspeedy…`);
		results.push(await buildMode(mode, path.join(temporaryRoot, mode)));
	}
	const [preview, ifr] = results;
	gate(
		preview.meta.backgroundSemanticChecksum === ifr.meta.backgroundSemanticChecksum,
		'preview and IFR background semantic checksums differ',
	);
	gate(
		preview.meta.backgroundByteChecksum === ifr.meta.backgroundByteChecksum,
		'preview and IFR background programs differ',
	);
	for (const operation of ['background_raw', 'background_gzip', 'background_brotli']) {
		gate(
			preview.ops[operation].score === ifr.ops[operation].score,
			`preview and IFR ${operation} differ`,
		);
	}
} catch (error) {
	failed = error instanceof Error ? error.stack || error.message : String(error);
	console.error(failed);
} finally {
	fs.rmSync(temporaryRoot, { force: true, recursive: true });
}

const payload = { suite: 'lynx-bundle-size', iterations: 1, targets: results };
if (failed !== undefined) payload.failed = failed;
if (process.env.BENCH_JSON) {
	fs.writeFileSync(process.env.BENCH_JSON, JSON.stringify(payload, null, '\t') + '\n');
}

if (failed !== undefined) {
	process.exitCode = 1;
} else {
	console.log('\ntarget                  bundle raw  bundle gzip  main gzip  background gzip');
	for (const result of results) {
		console.log(
			`${result.name.padEnd(23)} ${String(result.ops.bundle_raw.score).padStart(10)} ${String(result.ops.bundle_gzip.score).padStart(12)} ${String(result.ops.main_gzip.score).padStart(10)} ${String(result.ops.background_gzip.score).padStart(16)}`,
		);
	}
}
