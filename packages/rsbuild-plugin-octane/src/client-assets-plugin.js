// @ts-check
import fs from 'node:fs';
import path from 'node:path';

import { rspack } from '@rsbuild/core';

import { resolveProjectModule } from './project.js';

const PLUGIN_NAME = 'OctaneClientAssetsPlugin';

/** @param {string} file */
function canonicalResource(file) {
	const normalized = path.normalize(file);
	try {
		return path.normalize(fs.realpathSync(normalized));
	} catch {
		return normalized;
	}
}

/** @param {unknown} value */
function iterable(value) {
	return value && typeof value === 'object' && Symbol.iterator in value
		? /** @type {Iterable<any>} */ (value)
		: [];
}

/**
 * @param {any} module
 * @param {(module: any) => void} visit
 * @param {Set<any>} [seen]
 */
function visitModule(module, visit, seen = new Set()) {
	if (!module || seen.has(module)) return;
	seen.add(module);
	visit(module);
	for (const child of iterable(module.modules)) visitModule(child, visit, seen);
	if (module.rootModule) visitModule(module.rootModule, visit, seen);
}

/** @param {string} file */
function isJavaScript(file) {
	return /\.m?js(?:\?.*)?$/.test(file) && !/\.hot-update\.js(?:\?|$)/.test(file);
}

/** @param {string} file */
function isCss(file) {
	return /\.css(?:\?.*)?$/.test(file);
}

/**
 * Emit the stable route-module → built JS/CSS map consumed by the production
 * server. This uses Rspack's actual module/chunk graph rather than assuming a
 * Vite-shaped manifest.
 */
export class OctaneClientAssetsPlugin {
	/**
	 * @param {{ root: string, entries: string[] | (() => string[]), filename?: string }} options
	 */
	constructor(options) {
		this.root = path.resolve(options.root);
		this.entries = options.entries;
		this.filename = options.filename ?? 'octane-client-assets.json';
	}

	/** @param {import('@rspack/core').Compiler} compiler */
	apply(compiler) {
		compiler.hooks.thisCompilation.tap(PLUGIN_NAME, (compilation) => {
			compilation.hooks.processAssets.tap(
				{
					name: PLUGIN_NAME,
					stage: rspack.Compilation.PROCESS_ASSETS_STAGE_REPORT,
				},
				() => {
					const configuredEntries =
						typeof this.entries === 'function' ? this.entries() : this.entries;
					const entries = [...new Set(configuredEntries)];
					const expected = new Map();
					for (const id of entries) {
						const resource = resolveProjectModule(id, this.root);
						expected.set(path.normalize(resource), id);
						expected.set(canonicalResource(resource), id);
					}
					/** @type {Record<string, { js: string, css: string[] }>} */
					const assets = {};

					for (const topLevelModule of compilation.modules) {
						visitModule(topLevelModule, (module) => {
							const resource =
								typeof module.resource === 'string' ? module.resource.split('?')[0] : '';
							const id = expected.get(canonicalResource(resource));
							if (!id) return;
							const files = new Set();
							for (const chunk of compilation.chunkGraph.getModuleChunksIterable(module)) {
								for (const file of iterable(chunk.files)) files.add(String(file));
								for (const file of iterable(chunk.auxiliaryFiles)) files.add(String(file));
							}
							const sorted = [...files].sort();
							assets[id] = {
								js: sorted.find(isJavaScript) ?? '',
								css: sorted.filter(isCss),
							};
						});
					}

					for (const id of entries) assets[id] ??= { js: '', css: [] };
					const json = JSON.stringify(assets, null, 2) + '\n';
					compilation.emitAsset(this.filename, new rspack.sources.RawSource(json));
				},
			);
		});
	}
}
