// @ts-check
/**
 * Production server-entry generator.
 *
 * `generateServerEntry` emits the module an integration uses as its server
 * bundle input. The generated module statically imports every RenderRoute
 * entry/layout module (compiled in server mode by the active bundler
 * integration) plus octane.config.ts itself. Its mode selects one of three
 * deployment surfaces:
 *
 *   - `handler` exports the Web fetch handler and a Node `(req, res)` wrapper
 *     for serverless platforms, then auto-boots when run directly.
 *   - `manifest` exports the template-free manifest and renderer dependencies
 *     consumed by integrations that inject the current HTML themselves.
 *   - `webworker` exports those manifest values plus a
 *     `createWebWorkerHandler({ htmlTemplate, clientAssets? })` factory, without
 *     template filesystem access, a Node HTTP bridge, or automatic boot.
 *
 * The Node handler's wrapper supports platforms such as Vercel, where a
 * function can do:
 *
 *   - `export { nodeHandler as default } from '../dist/server/entry.js'`
 *
 * Its direct-execution path uses the adapter's `serve()` when configured,
 * otherwise the built-in Node server (static dist/client assets + the handler).
 *
 * Dev integrations use the manifest shape while loading request modules
 * directly; the deployment handler shapes are production-only.
 */

/** @import { Route, RootBoundaryOptions } from '@octanejs/app-core' */
/** @import { ClientAssetEntry } from '../../types/production.d.ts' */

import { get_route_entry_export_name, get_route_entry_path } from '../routes.js';

/**
 * @typedef {Object} ServerEntryOptions
 * @property {Route[]} routes - Route definitions from octane.config.ts
 * @property {string} octaneConfigPath - Absolute path to octane.config.ts
 * @property {RootBoundaryOptions} [rootBoundary] - Importable app-wide boundary entries
 * @property {string[]} [rpcModulePaths] - Project-root module IDs containing `module server`
 * @property {Record<string, ClientAssetEntry>} [clientAssetMap] - Route entry path → built client asset paths
 * @property {string} [clientAssetMapFile] - JSON asset map, resolved beside the built server entry at runtime
 * @property {Record<string, string>} [moduleImports] - Stable module ID → bundler import specifier
 * @property {((id: string) => string)} [resolveImport] - Fallback module-specifier mapper
 * @property {string} [configImportPath] - Bundler import specifier for octane.config.ts
 * @property {'handler' | 'manifest' | 'webworker'} [mode] - Emit a bootable handler, template-free manifest, or Web Worker factory module
 * @property {string} [serverRuntimeModuleId] - Renderer server runtime module ID
 * @property {string} [staticRuntimeModuleId] - Renderer static runtime module ID
 * @property {string} [productionModuleId] - App-core production runtime module ID
 * @property {string} [configModuleId] - App-core config runtime module ID
 * @property {string} [nodeModuleId] - App-core Node bridge module ID
 * @property {string} [generatedBy] - Integration name used in generated comments
 */

/**
 * @param {ServerEntryOptions} options
 * @returns {string} The generated JavaScript module source
 */
export function generateServerEntry(options) {
	const {
		routes,
		octaneConfigPath,
		rootBoundary = {},
		rpcModulePaths = [],
		clientAssetMap = {},
		clientAssetMapFile,
		moduleImports = {},
		resolveImport,
		configImportPath,
		mode = 'handler',
		serverRuntimeModuleId = 'octane/server',
		staticRuntimeModuleId = 'octane/static',
		productionModuleId = '@octanejs/app-core/production',
		configModuleId = '@octanejs/app-core/config',
		nodeModuleId = '@octanejs/app-core/node',
		generatedBy = '@octanejs/app-core',
	} = options;
	const import_specifier = (/** @type {string} */ id) =>
		moduleImports[id] ?? resolveImport?.(id) ?? id;
	const resolvedConfigImport =
		configImportPath ?? moduleImports[octaneConfigPath] ?? octaneConfigPath;

	// Unique page-entry and layout module paths (multiple routes may share both).
	/** @type {Map<string, string>} module path → import variable name */
	const page_imports = new Map();
	/** @type {Map<string, string>} */
	const layout_imports = new Map();
	/** @type {Map<string, string>} */
	const rpc_imports = new Map();
	/** @type {Map<string, string>} */
	const boundary_imports = new Map();

	for (const route of routes) {
		if (route.type !== 'render') continue;
		const entryPath = get_route_entry_path(route.entry);
		if (entryPath && !page_imports.has(entryPath)) {
			page_imports.set(entryPath, `_page_${page_imports.size}`);
		}
		if (typeof route.layout === 'string' && !layout_imports.has(route.layout)) {
			layout_imports.set(route.layout, `_layout_${layout_imports.size}`);
		}
	}

	for (const entry of [rootBoundary.pending, rootBoundary.catch]) {
		const modulePath = get_route_entry_path(entry);
		if (modulePath && !boundary_imports.has(modulePath)) {
			boundary_imports.set(modulePath, `_boundary_${boundary_imports.size}`);
		}
	}

	for (const modulePath of rpcModulePaths) {
		if (!page_imports.has(modulePath)) {
			rpc_imports.set(modulePath, `_rpc_${rpc_imports.size}`);
		}
	}

	const import_lines = [];
	for (const [modulePath, varName] of page_imports) {
		import_lines.push(
			`import * as ${varName} from ${JSON.stringify(import_specifier(modulePath))};`,
		);
	}
	for (const [modulePath, varName] of layout_imports) {
		import_lines.push(
			`import * as ${varName} from ${JSON.stringify(import_specifier(modulePath))};`,
		);
	}
	for (const [modulePath, varName] of boundary_imports) {
		if (!page_imports.has(modulePath) && !layout_imports.has(modulePath)) {
			import_lines.push(
				`import * as ${varName} from ${JSON.stringify(import_specifier(modulePath))};`,
			);
		}
	}
	for (const [modulePath, varName] of rpc_imports) {
		if (!boundary_imports.has(modulePath) && !layout_imports.has(modulePath)) {
			import_lines.push(
				`import * as ${varName} from ${JSON.stringify(import_specifier(modulePath))};`,
			);
		}
	}

	// The manifest maps MODULE PATHS to module namespaces; createHandler picks
	// the export per-route with the same `get_component_export` dev uses.
	const component_entries = [...page_imports]
		.map(([modulePath, varName]) => `\t${JSON.stringify(modulePath)}: ${varName},`)
		.join('\n');
	const layout_entries = [...layout_imports]
		.map(([modulePath, varName]) => `\t${JSON.stringify(modulePath)}: ${varName},`)
		.join('\n');

	const import_var_for = (/** @type {string} */ modulePath) =>
		page_imports.get(modulePath) ??
		layout_imports.get(modulePath) ??
		boundary_imports.get(modulePath) ??
		rpc_imports.get(modulePath);
	const boundary_value = (/** @type {unknown} */ entry) => {
		const modulePath = get_route_entry_path(/** @type {any} */ (entry));
		if (!modulePath) return 'null';
		const varName = import_var_for(modulePath);
		const exportName = get_route_entry_export_name(/** @type {any} */ (entry));
		return `getComponentExport(${varName}, ${JSON.stringify(exportName ?? null)})`;
	};
	const rpc_entries = rpcModulePaths
		.map((modulePath) => {
			const varName = import_var_for(modulePath);
			return `\t${JSON.stringify(modulePath)}: ${varName}._$_server_$_,`;
		})
		.join('\n');

	if (mode === 'manifest' || mode === 'webworker') {
		const isWebWorker = mode === 'webworker';
		const readsAssetFile = !isWebWorker && Boolean(clientAssetMapFile);
		const assetFileImports = readsAssetFile
			? `import { readFileSync } from 'node:fs';\nimport { fileURLToPath } from 'node:url';\nimport { dirname, join } from 'node:path';\n`
			: '';
		const platformImports = isWebWorker
			? ''
			: `import { createHash } from 'node:crypto';\nimport { AsyncLocalStorage } from 'node:async_hooks';\n`;
		const handlerImport = isWebWorker
			? `import { createHandler } from ${JSON.stringify(productionModuleId)};\n`
			: '';
		const assetDirectory = readsAssetFile
			? `const __dirname = dirname(fileURLToPath(import.meta.url));\n`
			: '';
		const clientAssets = readsAssetFile
			? `JSON.parse(readFileSync(join(__dirname, ${JSON.stringify(clientAssetMapFile)}), 'utf-8'))`
			: JSON.stringify(clientAssetMap, null, '\t');
		const runtime = isWebWorker
			? `const runtime = octaneConfig.adapter?.runtime;
if (!runtime) {
	throw new Error(
		"[octane] adapter.serverTarget 'webworker' requires adapter.runtime platform primitives.",
	);
}`
			: `const runtime = octaneConfig.adapter?.runtime ?? {
	hash: (str) => createHash('sha256').update(str).digest('hex').slice(0, 8),
	createAsyncContext: () => {
		const als = new AsyncLocalStorage();
		return { run: (store, fn) => als.run(store, fn), getStore: () => als.getStore() };
	},
};`;
		const workerFactory = isWebWorker
			? `
export function createWebWorkerHandler({ htmlTemplate, clientAssets = manifest.clientAssets }) {
	return createHandler(
		{ ...manifest, clientAssets },
		{ ...rendererDeps, htmlTemplate },
	);
}
`
			: '';
		const entryDescription = isWebWorker
			? 'the Web Worker server entry'
			: 'the template-free server manifest entry';

		return `\
// Auto-generated by ${generatedBy} — ${entryDescription}.
// Do not edit; regenerated by the active app integration.

${assetFileImports}${platformImports}import {
	renderToReadableStream,
	executeServerFunction,
	Suspense,
	ErrorBoundary,
	createElement,
} from ${JSON.stringify(serverRuntimeModuleId)};
import { prerender } from ${JSON.stringify(staticRuntimeModuleId)};
import { resolveOctaneConfig } from ${JSON.stringify(configModuleId)};
${handlerImport}import _rawOctaneConfig from ${JSON.stringify(resolvedConfigImport)};

${import_lines.join('\n')}

export const octaneConfig = resolveOctaneConfig(_rawOctaneConfig);

${runtime}

const components = {
${component_entries}
};

const layouts = {
${layout_entries}
};

function getComponentExport(module, exportName) {
	if (exportName) return typeof module[exportName] === 'function' ? module[exportName] : null;
	if (typeof module.default === 'function') return module.default;
	return Object.entries(module).find(([key, value]) =>
		typeof value === 'function' && /^[A-Z]/.test(key))?.[1] ?? null;
}

const rootBoundary = {
	pending: ${boundary_value(rootBoundary.pending)},
	catch: ${boundary_value(rootBoundary.catch)},
};

const rootBoundaryEntries = ${JSON.stringify(
			{
				pending: serialize_entry(rootBoundary.pending),
				catch: serialize_entry(rootBoundary.catch),
			},
			null,
			'\t',
		)};

const rpcModules = {
${rpc_entries}
};

${assetDirectory}const clientAssets = ${clientAssets};

export const manifest = {
	routes: octaneConfig.router.routes,
	components,
	layouts,
	middlewares: octaneConfig.middlewares,
	trustProxy: octaneConfig.server.trustProxy,
	render: octaneConfig.server.render,
	rootBoundary,
	rootBoundaryEntries,
	preHydrate: octaneConfig.router.preHydrate ?? null,
	rpcModules,
	runtime,
	clientAssets,
};

export const rendererDeps = {
	renderToReadableStream,
	prerender,
	executeServerFunction,
	Suspense,
	ErrorBoundary,
	createElement,
};
${workerFactory}
`;
	}

	return `\
// Auto-generated by ${generatedBy} — the production server entry.
// Do not edit; regenerated on every build.

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

import {
	renderToReadableStream,
	executeServerFunction,
	Suspense,
	ErrorBoundary,
	createElement,
} from ${JSON.stringify(serverRuntimeModuleId)};
import { prerender } from ${JSON.stringify(staticRuntimeModuleId)};
import { createHandler, resolveOctaneConfig } from ${JSON.stringify(productionModuleId)};
import { createNodeServer, nodeRequestToWebRequest, sendWebResponse } from ${JSON.stringify(nodeModuleId)};

// The app config is bundled by the active server integration.
import _rawOctaneConfig from ${JSON.stringify(resolvedConfigImport)};

${import_lines.join('\n')}

const octaneConfig = resolveOctaneConfig(_rawOctaneConfig);

// Platform primitives: the adapter's when configured, else Node defaults.
// (hash mirrors the compiler's module-server hashing: sha-256 hex, 8 chars.)
const runtime = octaneConfig.adapter?.runtime ?? {
	hash: (str) => createHash('sha256').update(str).digest('hex').slice(0, 8),
	createAsyncContext: () => {
		const als = new AsyncLocalStorage();
		return { run: (store, fn) => als.run(store, fn), getStore: () => als.getStore() };
	},
};

const __dirname = dirname(fileURLToPath(import.meta.url));
// The HTML template is the BUILT client index.html (hashed hydrate script and
// asset links already in place), moved next to this entry by the build.
const htmlTemplate = readFileSync(join(__dirname, './index.html'), 'utf-8');

const components = {
${component_entries}
};

const layouts = {
${layout_entries}
};

function getComponentExport(module, exportName) {
	if (exportName) return typeof module[exportName] === 'function' ? module[exportName] : null;
	if (typeof module.default === 'function') return module.default;
	return Object.entries(module).find(([key, value]) =>
		typeof value === 'function' && /^[A-Z]/.test(key))?.[1] ?? null;
}

const rootBoundary = {
	pending: ${boundary_value(rootBoundary.pending)},
	catch: ${boundary_value(rootBoundary.catch)},
};

const rootBoundaryEntries = ${JSON.stringify(
		{
			pending: serialize_entry(rootBoundary.pending),
			catch: serialize_entry(rootBoundary.catch),
		},
		null,
		'\t',
	)};

const rpcModules = {
${rpc_entries}
};

const clientAssets = ${
		clientAssetMapFile
			? `JSON.parse(readFileSync(join(__dirname, ${JSON.stringify(clientAssetMapFile)}), 'utf-8'))`
			: JSON.stringify(clientAssetMap, null, '\t')
	};

export const handler = createHandler(
	{
		routes: octaneConfig.router.routes,
		components,
		layouts,
		middlewares: octaneConfig.middlewares,
		trustProxy: octaneConfig.server.trustProxy,
		render: octaneConfig.server.render,
		rootBoundary,
		rootBoundaryEntries,
		preHydrate: octaneConfig.router.preHydrate ?? null,
		rpcModules,
		runtime,
		clientAssets,
	},
	{
		renderToReadableStream,
		prerender,
		htmlTemplate,
		executeServerFunction,
		Suspense,
		ErrorBoundary,
		createElement,
	},
);

/**
 * Node-style (req, res) wrapper — for serverless platforms whose functions
 * speak Node HTTP (e.g. Vercel's Node runtime).
 */
export async function nodeHandler(req, res) {
	try {
		const response = await handler(nodeRequestToWebRequest(req));
		await sendWebResponse(res, response);
	} catch (error) {
		console.error('[octane] Request error:', error);
		if (!res.headersSent) {
			res.statusCode = 500;
			res.setHeader('Content-Type', 'text/plain; charset=utf-8');
		}
		res.end('Internal Server Error');
	}
}

// Auto-boot when run directly (node dist/server/entry.js); stay quiet when
// imported by a serverless wrapper.
const isMainModule =
	typeof process !== 'undefined' &&
	process.argv[1] &&
	fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMainModule) {
	const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
	if (isNaN(port) || port < 1 || port > 65535) {
		console.error('[octane] Invalid PORT value:', process.env.PORT);
		process.exit(1);
	}
	const staticDir = join(__dirname, '../client');
	const server = octaneConfig.adapter?.serve
		? octaneConfig.adapter.serve(handler, { static: { dir: staticDir } })
		: createNodeServer(handler, { staticDir });
	server.listen(port);
	console.log('[octane] Production server listening on port ' + port);
}
`;
}

/**
 * Generate the template-free module consumed by integration dev middleware.
 * The loaded bundle exports `manifest` and `rendererDeps`; the integration
 * supplies its current transformed HTML to `createHandler` per request/build.
 *
 * @param {ServerEntryOptions} options
 * @returns {string}
 */
export function generateServerManifestEntry(options) {
	return generateServerEntry({ ...options, mode: 'manifest' });
}

/**
 * @param {unknown} entry
 * @returns {{ path: string, exportName: string | null } | null}
 */
function serialize_entry(entry) {
	const path = get_route_entry_path(/** @type {any} */ (entry));
	if (!path) return null;
	return {
		path,
		exportName: get_route_entry_export_name(/** @type {any} */ (entry)) ?? null,
	};
}
