// @ts-check
import fs from 'node:fs';
import path from 'node:path';

import { rspack } from '@rsbuild/core';

import { resolveProjectModule } from './project.js';

const PLUGIN_NAME = 'OctaneClientAssetsPlugin';

/** @param {string} file */
function canonicalResource(file) {
	if (!file) return '';
	const normalized = path.normalize(file);
	try {
		return path.normalize(fs.realpathSync(normalized));
	} catch {
		return normalized;
	}
}

/** @param {unknown} request @param {string} root */
function canonicalRequestResource(request, root) {
	if (typeof request !== 'string' || request.length === 0) return '';
	// Rspack origins normally contain the concrete import specifier. Keep this
	// tolerant of loader chains and resource queries so matching remains stable
	// when another plugin decorates the generated import.
	const resource = request.slice(request.lastIndexOf('!') + 1).split(/[?#]/, 1)[0];
	return resource ? canonicalResource(resolveProjectModule(resource, root)) : '';
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

/** @param {any} chunk */
function javascriptFiles(chunk) {
	return [...iterable(chunk?.files)].map(String).filter(isJavaScript).sort();
}

/** @param {Set<string>} files @param {any} chunk */
function collectCss(files, chunk) {
	for (const file of iterable(chunk?.files)) {
		const filename = String(file);
		if (isCss(filename)) files.add(filename);
	}
	for (const file of iterable(chunk?.auxiliaryFiles)) {
		const filename = String(file);
		if (isCss(filename)) files.add(filename);
	}
}

/** @param {any} compilation @param {string} message */
function addCompilationError(compilation, message) {
	const error = new Error(`[octane] ${message}`);
	if (compilation.errors && typeof compilation.errors.push === 'function') {
		compilation.errors.push(error);
		return;
	}
	throw error;
}

/**
 * Emit the stable route-module → built JS/CSS map consumed by the production
 * server. This uses Rspack's actual module/chunk graph rather than assuming a
 * Vite-shaped manifest.
 */
export class OctaneClientAssetsPlugin {
	/**
	 * @param {{ root: string, entries: string[] | (() => string[]), filename?: string, clientEntry?: string }} options
	 */
	constructor(options) {
		this.root = path.resolve(options.root);
		this.entries = options.entries;
		this.filename = options.filename ?? 'octane-client-assets.json';
		this.clientEntry = options.clientEntry
			? canonicalResource(resolveProjectModule(options.clientEntry, this.root))
			: '';
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
					/** @type {Map<string, Set<any>>} */
					const moduleChunks = new Map(entries.map((id) => [id, new Set()]));
					/** @type {Set<any>} */
					const chunkGroups = new Set(iterable(compilation.chunkGroups));
					const seenModules = new Set();

					for (const topLevelModule of compilation.modules) {
						visitModule(
							topLevelModule,
							(module) => {
								const resource =
									typeof module.resource === 'string' ? module.resource.split('?')[0] : '';
								const id = expected.get(canonicalResource(resource));
								if (!id) return;
								for (const chunk of compilation.chunkGraph.getModuleChunksIterable(module)) {
									moduleChunks.get(id)?.add(chunk);
									for (const group of iterable(chunk.groupsIterable)) chunkGroups.add(group);
								}
							},
							seenModules,
						);
					}

					/** @type {Map<string, Set<any>>} */
					const routeGroups = new Map(entries.map((id) => [id, new Set()]));
					for (const group of chunkGroups) {
						if (typeof group?.isInitial === 'function' && group.isInitial()) continue;
						for (const origin of iterable(group?.origins)) {
							const id = expected.get(canonicalRequestResource(origin?.request, this.root));
							if (!id) continue;
							const originResource =
								typeof origin?.module?.resource === 'string'
									? canonicalResource(origin.module.resource.split('?')[0])
									: '';
							if (this.clientEntry && originResource && originResource !== this.clientEntry)
								continue;
							routeGroups.get(id)?.add(group);
						}
					}

					/** @type {Record<string, { js: string, css: string[] }>} */
					const assets = {};
					for (const id of entries) {
						const css = new Set();
						for (const chunk of moduleChunks.get(id) ?? []) collectCss(css, chunk);

						const groupJavaScript = new Set();
						for (const group of routeGroups.get(id) ?? []) {
							const chunks = [...iterable(group?.chunks)];
							for (const chunk of chunks) collectCss(css, chunk);
							// SplitChunks inserts shared chunks before the original async chunk,
							// so scan from the end for the route script. Do not call
							// getEntrypointChunk(): normal Rspack async groups are not entrypoints.
							for (let index = chunks.length - 1; index >= 0; index--) {
								const files = javascriptFiles(chunks[index]);
								if (files.length === 0) continue;
								if (files.length > 1) {
									addCompilationError(
										compilation,
										`Route ${JSON.stringify(id)} emitted multiple JavaScript assets in one chunk: ${files.join(', ')}`,
									);
								} else {
									groupJavaScript.add(files[0]);
								}
								break;
							}
						}

						let js = '';
						if (groupJavaScript.size === 1) {
							js = /** @type {string} */ (groupJavaScript.values().next().value);
						} else if (groupJavaScript.size > 1) {
							addCompilationError(
								compilation,
								`Route ${JSON.stringify(id)} matched multiple async JavaScript chunks: ${[...groupJavaScript].sort().join(', ')}`,
							);
						} else {
							// Tree-shaken/eager edge cases may not retain an async group. Preserve
							// the old behavior only when the module graph leaves one unambiguous
							// JavaScript file; never guess between filenames.
							const directJavaScript = new Set();
							for (const chunk of moduleChunks.get(id) ?? []) {
								for (const file of javascriptFiles(chunk)) directJavaScript.add(file);
							}
							if (directJavaScript.size === 1) {
								js = /** @type {string} */ (directJavaScript.values().next().value);
							} else if (directJavaScript.size > 1) {
								addCompilationError(
									compilation,
									`Route ${JSON.stringify(id)} has no matching async group and multiple JavaScript chunks: ${[...directJavaScript].sort().join(', ')}`,
								);
							}
						}

						assets[id] = { js, css: [...css].sort() };
					}
					const json = JSON.stringify(assets, null, 2) + '\n';
					compilation.emitAsset(this.filename, new rspack.sources.RawSource(json));
				},
			);
		});
	}
}
