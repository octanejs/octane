import { escapeRegExp } from "../utils.js";
import { generateServerFnResolverModule } from "../start-compiler/server-fn-resolver-module.js";
import { buildStartManifest } from "../start-manifest-plugin/manifestBuilder.js";
import { generateSerializationAdaptersModule } from "../serialization-adapters-module.js";
import { RSBUILD_ENVIRONMENT_NAMES } from "./planning.js";
import { VIRTUAL_MODULES } from "@tanstack/start-server-core";
//#region src/rsbuild/virtual-modules.ts
var RSC_RUNTIME_VIRTUAL_ID = "virtual:tanstack-rsc-runtime";
var RSC_HMR_VIRTUAL_ID = "virtual:tanstack-rsc-hmr";
var RSC_BROWSER_DECODE_VIRTUAL_ID = "virtual:tanstack-rsc-browser-decode";
var RSC_SSR_DECODE_VIRTUAL_ID = "virtual:tanstack-rsc-ssr-decode";
var START_MANIFEST_PLACEHOLDER = "__TSS_START_MANIFEST_PLACEHOLDER__";
var DEV_START_MANIFEST_GLOBAL = "__TSS_DEV_START_MANIFEST__";
/**
* VirtualModulesPlugin resolves module paths relative to compiler.context.
* Prefix them under the app root so they are unique and watcher-friendly.
*/
function virtualPath(root, moduleId) {
	return `${root}/node_modules/.virtual/${moduleId.replace(/[:#]/g, "_")}.js`;
}
function getScriptFormatProperty(scriptFormat) {
	return scriptFormat === "iife" ? `  scriptFormat: 'iife',\n` : "";
}
function getEntryScriptAttrs(entryUrl, scriptFormat) {
	return scriptFormat === "module" ? `{ type: 'module', async: true, src: '${entryUrl}' }` : `{ async: true, src: '${entryUrl}' }`;
}
function generateManifestModuleDev(devClientEntryUrl, scriptFormat) {
	return `const fallbackManifest = {
${getScriptFormatProperty(scriptFormat)}  routes: {
    __root__: {
      preloads: ['${devClientEntryUrl}'],
      scripts: [{ attrs: ${getEntryScriptAttrs(devClientEntryUrl, scriptFormat)} }],
    },
  },
}
export const tsrStartManifest = () => globalThis[${JSON.stringify(DEV_START_MANIFEST_GLOBAL)}] ?? fallbackManifest`;
}
function buildStartManifestData(clientBuild, publicBase, inlineCss, scriptFormat) {
	const routeTreeRoutes = globalThis.TSS_ROUTES_MANIFEST;
	return buildStartManifest({
		clientBuild,
		routeTreeRoutes,
		basePath: publicBase,
		inlineCss,
		scriptFormat
	});
}
function serializeStartManifestData(clientBuild, publicBase, inlineCss, scriptFormat) {
	return JSON.stringify(buildStartManifestData(clientBuild, publicBase, inlineCss, scriptFormat));
}
function generateManifestModuleBuild(clientBuild, publicBase, _devClientEntryUrl, inlineCss, scriptFormat) {
	if (!clientBuild) return `const tsrStartManifestData = ${JSON.stringify(START_MANIFEST_PLACEHOLDER)}
export const tsrStartManifest = () => tsrStartManifestData`;
	return `export const tsrStartManifest = () => (${serializeStartManifestData(clientBuild, publicBase, inlineCss, scriptFormat)})`;
}
/**
* Generate virtual:tanstack-rsc-runtime content.
* In the RSC layer this re-exports from react-server-dom-rspack/server.
* In other layers it provides stubs that throw.
*/
function generateRscRuntimeModule(isRscLayer) {
	if (isRscLayer) return `export { renderToReadableStream, createTemporaryReferenceSet, decodeReply, decodeAction, decodeFormState } from 'react-server-dom-rspack/server'
export function createFromReadableStream() { throw new Error('createFromReadableStream is not available in RSC environment (use SSR or browser decode instead)'); }
// loadServerAction is provided by the RSC entry, not react-server-dom-rspack
import { getServerFnById } from '#tanstack-start-server-fn-resolver'
export const loadServerAction = async (id) => getServerFnById(id, { origin: 'server' })`;
	return `
export function renderToReadableStream() { throw new Error('renderToReadableStream can only be used in RSC environment'); }
export function createFromReadableStream() { throw new Error('createFromReadableStream can only be used in RSC environment'); }
export function createTemporaryReferenceSet() { throw new Error('createTemporaryReferenceSet can only be used in RSC environment'); }
export function decodeReply() { throw new Error('decodeReply can only be used in RSC environment'); }
export function loadServerAction() { throw new Error('loadServerAction can only be used in RSC environment'); }
export function decodeAction() { throw new Error('decodeAction can only be used in RSC environment'); }
export function decodeFormState() { throw new Error('decodeFormState can only be used in RSC environment'); }
`;
}
/**
* Generate virtual:tanstack-rsc-hmr content.
* In the client env during dev, listens for rsc:update WebSocket events
* and invalidates the router. In all other contexts, exports nothing.
*/
function generateRscHmrModule(isClientEnv, isDev) {
	if (!isClientEnv || !isDev) return "export function setupRscHmr() {}";
	return `
// RSC HMR listener for rsbuild dev server
// Listens for 'rsc:update' custom events sent via sockWrite
export function setupRscHmr() {
  let __invalidateQueued = false

  function __queueInvalidate() {
    if (__invalidateQueued) return
    __invalidateQueued = true
    queueMicrotask(async () => {
      __invalidateQueued = false
      try {
        const router = window.__TSR_ROUTER__
        if (!router) {
          console.warn('[rsc:hmr] No router found on window.__TSR_ROUTER__')
          return
        }
        await router.invalidate()
      } catch (e) {
        console.warn('[rsc:hmr] Failed to invalidate router:', e)
      }
    })
  }

  if (import.meta.webpackHot) {
    import.meta.webpackHot.on('rsc:update', () => {
      __queueInvalidate()
    })
  }
}
`;
}
/**
* Registers virtual modules for the rsbuild adapter using VirtualModulesPlugin.
*
* Creates one VirtualModulesPlugin per environment and registers them via
* `modifyBundlerChain`. Provides update functions to refresh content dynamically.
*/
function registerVirtualModules(api, opts) {
	const isDev = api.context.action === "dev";
	const root = opts.root;
	const paths = {
		manifest: virtualPath(root, VIRTUAL_MODULES.startManifest),
		serverFnResolver: virtualPath(root, VIRTUAL_MODULES.serverFnResolver),
		pluginAdapters: virtualPath(root, VIRTUAL_MODULES.pluginAdapters)
	};
	const rscPaths = opts.rscEnabled ? {
		rscRuntime: virtualPath(root, RSC_RUNTIME_VIRTUAL_ID),
		rscHmr: virtualPath(root, RSC_HMR_VIRTUAL_ID),
		rscBrowserDecode: virtualPath(root, RSC_BROWSER_DECODE_VIRTUAL_ID),
		rscSsrDecode: virtualPath(root, RSC_SSR_DECODE_VIRTUAL_ID)
	} : null;
	const vmPlugins = {};
	const readyVmPlugins = {};
	const pendingWrites = /* @__PURE__ */ new Map();
	let clientBuild;
	const lastResolverContentByEnvironment = {};
	const hasSeparateProviderEnvironment = !opts.rscEnabled && opts.providerEnvName !== RSBUILD_ENVIRONMENT_NAMES.server;
	const hasSerializationAdapters = Boolean(opts.serializationAdapters?.length);
	function isProviderEnvironment(environmentName) {
		return environmentName === opts.providerEnvName;
	}
	function needsServerFnResolver(environmentName) {
		return environmentName === RSBUILD_ENVIRONMENT_NAMES.server || hasSeparateProviderEnvironment && isProviderEnvironment(environmentName);
	}
	function generateResolverContent(environmentName) {
		return generateServerFnResolverModule({
			serverFnsById: opts.serverFnsById,
			includeClientReferencedCheck: !isProviderEnvironment(environmentName),
			useStaticImports: Boolean(opts.rscEnabled && isDev)
		});
	}
	function writeResolverContent(environmentName, content) {
		if (!isDev || content !== lastResolverContentByEnvironment[environmentName]) {
			lastResolverContentByEnvironment[environmentName] = content;
			tryWriteModule(environmentName, paths.serverFnResolver, content);
		}
	}
	function queuePendingWrite(environmentName, filePath, content) {
		let writes = pendingWrites.get(environmentName);
		if (!writes) {
			writes = /* @__PURE__ */ new Map();
			pendingWrites.set(environmentName, writes);
		}
		writes.set(filePath, content);
	}
	function tryWriteModule(environmentName, filePath, content) {
		const vmPlugin = vmPlugins[environmentName];
		if (!vmPlugin || !readyVmPlugins[environmentName]) {
			queuePendingWrite(environmentName, filePath, content);
			return false;
		}
		vmPlugin.writeModule(filePath, content);
		return true;
	}
	function flushPendingWrites(environmentName) {
		if (!readyVmPlugins[environmentName]) return;
		const writes = pendingWrites.get(environmentName);
		if (!writes?.size) return;
		for (const [filePath, content] of writes) {
			if (!tryWriteModule(environmentName, filePath, content)) return;
			writes.delete(filePath);
		}
		if (writes.size === 0) pendingWrites.delete(environmentName);
	}
	function getInitialContent(environmentName) {
		const { resolvedStartConfig, startConfig } = opts.getConfig();
		const isServerEnv = environmentName === RSBUILD_ENVIRONMENT_NAMES.server;
		const isClientEnv = environmentName === RSBUILD_ENVIRONMENT_NAMES.client;
		const content = {};
		if (isServerEnv) {
			const devClientEntryUrl = opts.getDevClientEntryUrl(resolvedStartConfig.basePaths.publicBase);
			content[paths.manifest] = isDev ? generateManifestModuleDev(devClientEntryUrl, opts.scriptFormat) : generateManifestModuleBuild(clientBuild, resolvedStartConfig.basePaths.publicBase, devClientEntryUrl, startConfig.server.build.inlineCss, opts.scriptFormat);
		} else content[paths.manifest] = "export default {}";
		if (needsServerFnResolver(environmentName)) content[paths.serverFnResolver] = generateResolverContent(environmentName);
		else content[paths.serverFnResolver] = "export {}";
		if (hasSerializationAdapters) content[paths.pluginAdapters] = generateSerializationAdaptersModule({
			adapters: opts.serializationAdapters,
			runtime: environmentName === RSBUILD_ENVIRONMENT_NAMES.client ? "client" : "server"
		});
		if (rscPaths) {
			if (isServerEnv) content[rscPaths.rscRuntime] = generateRscRuntimeModule(true);
			else content[rscPaths.rscRuntime] = generateRscRuntimeModule(false);
			content[rscPaths.rscHmr] = generateRscHmrModule(isClientEnv, isDev);
			content[rscPaths.rscBrowserDecode] = isClientEnv ? `export * from '@tanstack/react-start/rsbuild/browser-decode'` : `export function createFromReadableStream() { throw new Error('RSC browser decode is only available in the client environment') }
export function createFromFetch() { throw new Error('RSC browser decode is only available in the client environment') }`;
			content[rscPaths.rscSsrDecode] = isServerEnv ? `export { setOnClientReference, createFromReadableStream } from '@tanstack/react-start/rsbuild/ssr-decode'` : `export function setOnClientReference() {}
export function createFromReadableStream() { throw new Error('RSC SSR decode is only available in the server environment') }`;
		}
		return content;
	}
	const aliasMap = {
		[VIRTUAL_MODULES.startManifest]: paths.manifest,
		[VIRTUAL_MODULES.serverFnResolver]: paths.serverFnResolver
	};
	if (hasSerializationAdapters) aliasMap[VIRTUAL_MODULES.pluginAdapters] = paths.pluginAdapters;
	if (rscPaths) {
		aliasMap[RSC_RUNTIME_VIRTUAL_ID] = rscPaths.rscRuntime;
		aliasMap[RSC_HMR_VIRTUAL_ID] = rscPaths.rscHmr;
		aliasMap[RSC_BROWSER_DECODE_VIRTUAL_ID] = rscPaths.rscBrowserDecode;
		aliasMap[RSC_SSR_DECODE_VIRTUAL_ID] = rscPaths.rscSsrDecode;
	}
	api.modifyRspackConfig((config, utils) => {
		const envName = utils.environment.name;
		const initialContent = getInitialContent(envName);
		const VMP = utils.rspack.experiments.VirtualModulesPlugin;
		const vmPlugin = new VMP(initialContent);
		vmPlugins[envName] = vmPlugin;
		readyVmPlugins[envName] = false;
		config.plugins.push(vmPlugin);
		config.plugins.push({ apply(compiler) {
			compiler.hooks.thisCompilation.tap("TanStackStartFlushPendingVirtualModules", () => {
				readyVmPlugins[envName] = true;
				flushPendingWrites(envName);
			});
		} });
		for (const [moduleId, virtualFilePath] of Object.entries(aliasMap)) {
			const NMR = utils.rspack.NormalModuleReplacementPlugin;
			config.plugins.push(new NMR(new RegExp(`^${escapeRegExp(moduleId)}$`), virtualFilePath));
		}
		const resolve = config.resolve;
		const resolveAlias = resolve.alias ??= {};
		resolveAlias[VIRTUAL_MODULES.serverFnResolver] = paths.serverFnResolver;
		if (hasSerializationAdapters) resolveAlias[VIRTUAL_MODULES.pluginAdapters] = paths.pluginAdapters;
		if (rscPaths) {
			resolveAlias[RSC_RUNTIME_VIRTUAL_ID] = rscPaths.rscRuntime;
			resolveAlias[RSC_HMR_VIRTUAL_ID] = rscPaths.rscHmr;
			resolveAlias[RSC_BROWSER_DECODE_VIRTUAL_ID] = rscPaths.rscBrowserDecode;
			resolveAlias[RSC_SSR_DECODE_VIRTUAL_ID] = rscPaths.rscSsrDecode;
		}
	});
	return {
		serverFnResolverPath: paths.serverFnResolver,
		manifestPath: paths.manifest,
		vmPlugins,
		generateCurrentResolverContent(forProvider) {
			return generateResolverContent(forProvider ? opts.providerEnvName : RSBUILD_ENVIRONMENT_NAMES.server);
		},
		generateManifestContent(newClientBuild) {
			const { resolvedStartConfig, startConfig } = opts.getConfig();
			const devClientEntryUrl = opts.getDevClientEntryUrl(resolvedStartConfig.basePaths.publicBase);
			return generateManifestModuleBuild(newClientBuild, resolvedStartConfig.basePaths.publicBase, devClientEntryUrl, !isDev ? startConfig.server.build.inlineCss : {
				enabled: false,
				transformAssets: false
			}, opts.scriptFormat);
		},
		generateManifestValueLiteral(newClientBuild) {
			const { resolvedStartConfig, startConfig } = opts.getConfig();
			return serializeStartManifestData(newClientBuild, resolvedStartConfig.basePaths.publicBase, !isDev ? startConfig.server.build.inlineCss : {
				enabled: false,
				transformAssets: false
			}, opts.scriptFormat);
		},
		updateManifest(newClientBuild) {
			clientBuild = newClientBuild;
			const { resolvedStartConfig } = opts.getConfig();
			if (isDev) globalThis[DEV_START_MANIFEST_GLOBAL] = buildStartManifestData(clientBuild, resolvedStartConfig.basePaths.publicBase, {
				enabled: false,
				transformAssets: false
			}, opts.scriptFormat);
		},
		updateServerFnResolver() {
			const updateEnvironment = (environmentName) => {
				if (!needsServerFnResolver(environmentName)) return;
				writeResolverContent(environmentName, generateResolverContent(environmentName));
			};
			updateEnvironment(RSBUILD_ENVIRONMENT_NAMES.server);
			if (hasSeparateProviderEnvironment) updateEnvironment(opts.providerEnvName);
		},
		tryUpdateServerFnResolver(content) {
			lastResolverContentByEnvironment[RSBUILD_ENVIRONMENT_NAMES.server] = content;
			tryWriteModule(RSBUILD_ENVIRONMENT_NAMES.server, paths.serverFnResolver, content);
		},
		getVirtualPath(moduleId) {
			return virtualPath(root, moduleId);
		}
	};
}
//#endregion
export { START_MANIFEST_PLACEHOLDER, registerVirtualModules };

//# sourceMappingURL=virtual-modules.js.map