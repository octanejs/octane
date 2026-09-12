// @ts-check
import fs from 'node:fs';
import path from 'node:path';

export { generateServerEntry, generateServerManifestEntry } from './server/server-entry.js';

export const RESOLVED_ADAPTER_BROWSER_STUB_ID = '\0octane:adapter-browser-stub';
// Server-only deploy/adapter packages: client-side imports of these specifiers
// resolve to the browser stub below instead of the real module (whose graph
// pulls node builtins). Every published adapter package MUST be listed here,
// and its public exports added to the stub.
export const SERVER_ONLY_ADAPTER_IDS = new Set([
	'@ripple-ts/adapter-node',
	'@ripple-ts/adapter-bun',
	'@ripple-ts/adapter-vercel',
	'@octanejs/adapter-vercel',
	'@octanejs/adapter-cloudflare',
]);

/** @type {Map<string, string>} */
const generated_file_cache = new Map();

/**
 * The browser stand-in shared by every SERVER_ONLY_ADAPTER_IDS package — it
 * must export the UNION of their public names, each failing loudly on use
 * (never at import, so merely reaching the module keeps the app alive).
 * @returns {string}
 */
export function create_adapter_browser_stub_source() {
	return `export const runtime = undefined;
export function serve() {
  throw new Error('[octane] Server adapters cannot run in the browser.');
}
export function nodeRequestToWebRequest() {
  throw new Error('[octane] Node request helpers cannot run in the browser.');
}
export function webResponseToNodeResponse() {
  throw new Error('[octane] Node response helpers cannot run in the browser.');
}
export function vercel() {
  throw new Error('[octane] Deploy adapters cannot run in the browser.');
}
export function cloudflare() {
  throw new Error('[octane] Deploy adapters cannot run in the browser.');
}
export function adapt() {
  throw new Error('[octane] Deploy adapters cannot run in the browser.');
}
`;
}

/**
 * Resolve the directory used for generated project entries. Integrations may
 * supply an explicit `generatedDir`; otherwise their cache directory is used.
 * The shape intentionally accepts Vite/Rsbuild resolved configs without
 * importing either package's types.
 *
 * @param {{ root: string, cacheDir?: string, generatedDir?: string }} options
 * @returns {string}
 */
export function get_project_generated_dir(options) {
	if (options.generatedDir) return path.resolve(options.root, options.generatedDir);
	const cacheDir = options.cacheDir ?? path.join(options.root, 'node_modules/.cache/octane');
	return path.join(cacheDir, 'project');
}

/**
 * @param {{ root: string, cacheDir?: string, generatedDir?: string }} options
 * @param {string} name
 * @param {string} source
 * @returns {string}
 */
export function write_project_generated_file(options, name, source) {
	const dir = get_project_generated_dir(options);
	const file = path.join(dir, name);

	if (generated_file_cache.get(file) === source && fs.existsSync(file)) {
		return file;
	}

	fs.mkdirSync(dir, { recursive: true });
	if (!fs.existsSync(file) || fs.readFileSync(file, 'utf-8') !== source) {
		fs.writeFileSync(file, source);
	}
	generated_file_cache.set(file, source);
	return file;
}

/**
 * Generate the client hydration entry (served at virtual:octane-hydrate).
 *
 * CONFIG-FREE: it does NOT import octane.config.ts. Importing the config into
 * the browser would drag the plugin (and the server adapter) — with their
 * `node:fs` imports — into the client graph and throw at module-eval. Instead
 * the server serializes everything needed into #__octane_data ({ entry,
 * exportName, layout, params, url, preHydrate }), and this entry
 * dynamic-imports the page/layout from there.
 *
 * `staticEntries` (production builds) lists every module path the server can
 * name in #__octane_data — page entries, layouts, and the preHydrate hook.
 * Each becomes a STATIC `() => import('/src/…')` in a lookup map, so Rollup
 * sees, chunks, and hashes them; the runtime falls back to a native dynamic
 * import only for paths outside the map (the dev case, where the map is empty
 * and the integration serves any module by URL). The fallback resolves the
 * project-root ID against the browsing context's real location. Project IDs
 * are root-absolute, so this has the same URL semantics as importing from this
 * generated module while remaining immune to an authored `<base>` element.
 * (Rspack rewrites `import.meta.url` to `document.baseURI` in classic output,
 * so it cannot be used directly here.) Vite serves `.tsrx` modules through its
 * canonical `?import` URL but leaves ordinary JavaScript/TypeScript URLs
 * unchanged, while Rspack honors its ignore hint. Keeping the import native
 * avoids requiring `unsafe-eval` under a nonce-based Content Security Policy.
 *
 * octane specifics:
 *   - `initializeHydrationEventCapture()` runs before any async route work so
 *     interaction boundaries can preserve intent that precedes `hydrateRoot()`.
 *   - `import { hydrateRoot } from 'octane'` (NO `mount`).
 *   - `hydrateRoot(container, body, props)` signature (container FIRST, React-18
 *     shape) — no `{ target, props }` wrapper.
 *   - The layout `children` is a props-first ComponentBody whose closure calls
 *     `Page({ params, url }, scope, extra)`, NOT a 0-arg thunk: octane's
 *     `childSlot` invokes a bare function child with `{}` props, so page data
 *     rides the closure — mirroring the server `createLayoutWrapper`.
 *   - hydrateRoot() itself locates/consumes the <script data-octane-suspense>
 *     seed inside #root, so the entry does nothing special for suspense.
 *   - `preHydrate` (config `router.preHydrate`, a project-root module ID) is
 *     imported and its default export awaited BEFORE hydrateRoot — the hook an
 *     app-level client router uses to commit its match tree so the first
 *     hydration pass adopts the same resolved tree the server rendered.
 *
 * `getComponentExport` mirrors routes.js `get_component_export` (route named
 * export > default > first PascalCase) so server and client pick the SAME
 * component.
 *
 * @param {{
 *   configPath?: string,
 *   staticEntries?: Array<string | { id: string, specifier: string }>,
 *   independentEntries?: Array<{ id: string, specifier: string }>,
 *   clientBuildId?: string,
 *   clientBuildIdExpression?: string,
 *   devClientBuild?: boolean,
 *   resolveImport?: (id: string) => string,
 *   runtimeModuleId?: string,
 *   generatedBy?: string,
 * }} [options]
 * @returns {string}
 */
export function create_client_entry_source(options = {}) {
	if (options.clientBuildId !== undefined && options.clientBuildIdExpression !== undefined) {
		throw new TypeError('Provide one executing client build identity, not both forms.');
	}
	if (options.clientBuildId === '' || options.clientBuildIdExpression === '') {
		throw new TypeError('The executing client build identity must not be empty.');
	}
	const staticEntries = new Map();
	for (const entry of options.staticEntries ?? []) {
		const id = typeof entry === 'string' ? entry : entry.id;
		const specifier =
			typeof entry === 'string' ? (options.resolveImport?.(id) ?? id) : entry.specifier;
		staticEntries.set(id, specifier);
	}
	const runtimeModuleId = options.runtimeModuleId ?? 'octane';
	const generatedBy = options.generatedBy ?? '@octanejs/app-core';
	const static_map_lines = [...staticEntries]
		.map(
			([id, specifier]) => `  ${JSON.stringify(id)}: () => import(${JSON.stringify(specifier)}),`,
		)
		.join('\n');
	const independent_map_lines = (options.independentEntries ?? [])
		.map(
			({ id, specifier }) => `  ${JSON.stringify(id)}: () => import(${JSON.stringify(specifier)}),`,
		)
		.join('\n');

	return `// Auto-generated by ${generatedBy}.
// This file is written to the active integration's project cache.

import { hydrateRoot, initializeHydrationEventCapture, Suspense, ErrorBoundary, createElement } from ${JSON.stringify(runtimeModuleId)};

// Capture once: an HMR runtime hash may change, this document's authority must not.
const clientBuildId = ${options.clientBuildIdExpression ?? JSON.stringify(options.clientBuildId ?? null)};
initializeHydrationEventCapture();

let independentCapability = false;
let independentTarget;
let signalOwner;
let streamedHydration;
let signalHydrationModule;
let documentData;
let documentLifecycle;
let lifecycleBootstrap;
let independentBootstrap;
let disposeIndependentHydration;
let incompatibleBuild = false;
${
	options.devClientBuild
		? `
if (import.meta.hot) {
  import.meta.hot.on('octane:independent-hydration', (data) => {
    if (data.buildId !== clientBuildId) {
      incompatibleBuild = true;
      documentLifecycle?.dispose();
      disposeIndependentHydration?.();
      streamedHydration?.dispose();
      globalThis.location.reload();
      return;
    }
    if (data.enabled !== true || incompatibleBuild) return;
    independentCapability = true;
    if (independentTarget) {
      void bootstrapIndependentIslands(independentTarget).catch((error) => {
        console.error('[octane] Independent Hydrate bootstrap failed.', error);
      });
    }
  });
  // Subscribe before asking for the current snapshot: discovery may predate entry evaluation.
  import.meta.hot.send('octane:independent-hydration');
}
`
		: ''
}

// Static import map (production): every module the server may name in
// #__octane_data, as bundle-analyzable dynamic imports. Empty in dev.
const routeModules = {
${static_map_lines}
};

// Strict independent islands are separate graph roots. Their loader closures
// live in this bootstrap entry, never in the lexical parent component, so an
// early interaction can fetch one widget without evaluating its parent/sibling
// modules. The build manifest's opaque moduleId selects this registry entry.
const independentModules = {
${independent_map_lines}
};

// Keep the fallback native and canonical. Vite serves static \`.tsrx\` imports
// through \`?import\`, but ordinary JS/TS imports without it. Resolve that same
// root-absolute URL against the browsing context's real location (not a
// possibly-authored document <base>) so Vite's variable-import helper leaves
// it unchanged; Rspack honors webpackIgnore. Pages/preHydrate hooks then share
// module singletons with static imports. A Function constructor breaks CSP.
const dynamicImport = (specifier) => {
  const url = new URL(specifier, globalThis.location.href);
  if (url.pathname.endsWith('.tsrx') && !url.searchParams.has('import')) {
    const query = url.search.slice(1);
    url.search = query ? '?import&' + query : '?import';
  }
  return import(/* @vite-ignore */ /* webpackIgnore: true */ url.href);
};

function importModule(path) {
  const loader = routeModules[path];
  return loader ? loader() : dynamicImport(path);
}

const independentStyles = new Map();

function clientAssetPath(path) {
  return path.startsWith('/') ? path : '/' + path;
}

function loadIndependentStyle(path) {
  const href = new URL(clientAssetPath(path), globalThis.location.href).href;
  let pending = independentStyles.get(href);
  if (pending) return pending;
  pending = new Promise((resolve, reject) => {
    let link = null;
    for (const candidate of document.querySelectorAll('link[rel="stylesheet"]')) {
      if (candidate.href === href) {
        link = candidate;
        break;
      }
    }
    if (link?.sheet) {
      resolve();
      return;
    }
    const owned = link === null;
    if (!link) {
      link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
    }
    link.addEventListener('load', resolve, { once: true });
    link.addEventListener('error', () => {
      independentStyles.delete(href);
      // A later activation may retry, but authored/SSR links belong to the document.
      if (owned) link.remove();
      reject(new Error('[octane] Failed to load independent Hydrate stylesheet: ' + href));
    }, { once: true });
    if (!link.isConnected) document.head.appendChild(link);
  });
  independentStyles.set(href, pending);
  return pending;
}

async function bootstrapIndependentIslands(target) {
  independentTarget = target;
  if (incompatibleBuild) return;
  // A supported widget may arrive during later navigation, after initial HTML.
  // Keep its observer ready without loading optional code in feature-free apps.
  if (
    !independentCapability &&
    Object.keys(independentModules).length === 0 &&
    (!globalThis.__OCTANE_INDEPENDENT_MODULES__ || Object.keys(globalThis.__OCTANE_INDEPENDENT_MODULES__).length === 0) &&
    !target.querySelector('script[data-octane-independent]')
  ) return;
  await bootstrapDocumentLifecycle();
  if (documentLifecycle && !await documentLifecycle.whenActive()) return;
  if (independentBootstrap) return independentBootstrap;
  independentBootstrap = import('octane/hydration').then(async ({ bootstrapIndependentHydration }) => {
    if (incompatibleBuild) return;
    if (documentLifecycle && !await documentLifecycle.whenActive()) return;
    disposeIndependentHydration = bootstrapIndependentHydration(target, {
    ...(clientBuildId === null ? {} : { buildId: clientBuildId }),
    ...(signalOwner === undefined ? {} : { signalOwner }),
    loadModule: (moduleId) => {
      const loader = independentModules[moduleId] ?? globalThis.__OCTANE_INDEPENDENT_MODULES__?.[moduleId];
      return loader ? loader() : dynamicImport(clientAssetPath(moduleId));
    },
    loadStyles: (styles) => Promise.all(styles.map(loadIndependentStyle)).then(() => undefined),
    onError: (error) => console.error('[octane] Independent Hydrate activation failed.', error),
    });
  });
  return independentBootstrap;
}

async function bootstrapDocumentLifecycle() {
  if (clientBuildId === null || !documentData?.streamedSignals) return;
  if (lifecycleBootstrap) return lifecycleBootstrap;
  lifecycleBootstrap = (async () => {
    signalHydrationModule ??= await import('octane/hydration/streamed-signals');
    if (incompatibleBuild) return;
    documentLifecycle = signalHydrationModule.installSignalDocumentLifecycle({
      document, buildId: clientBuildId, documentId: documentData.streamedSignals.documentId,
      ...(signalOwner === undefined ? {} : { signalOwner }),
      get streamedHydration() { return streamedHydration; },
      get independentHydration() { return disposeIndependentHydration; },
      onMismatch() { incompatibleBuild = true; globalThis.location.reload(); },
    });
    signalOwner = documentLifecycle.signalOwner;
  })();
  return lifecycleBootstrap;
}

function getComponentExport(module, exportName) {
  // Explicit export name requires an exact match; do NOT fall back, so a
  // typo'd route renders nothing rather than the wrong component.
  if (exportName) return typeof module[exportName] === 'function' ? module[exportName] : undefined;
  if (typeof module.default === 'function') return module.default;
  return Object.entries(module).find(([key, value]) => typeof value === 'function' && /^[A-Z]/.test(key))?.[1];
}

function withRootBoundary(content, boundary) {
  let body = content;
  // Keep ErrorBoundary closest to the route. Suspense may retain its pending
  // shell for an unhandled server render error, so it must wrap the configured
  // catch boundary rather than hiding route errors from it.
  if (boundary.catch) {
    const child = body;
    const Catch = boundary.catch;
    body = (props, scope) => ErrorBoundary({
      fallback: (error, reset) => createElement(Catch, { error, reset }),
      children: (_props, childScope) => child(props, childScope),
    }, scope);
  }
  if (boundary.pending) {
    const child = body;
    const Pending = boundary.pending;
    body = (props, scope) => Suspense({
      fallback: createElement(Pending, {}),
      children: (_props, childScope) => child(props, childScope),
    }, scope);
  }
  return body;
}

(async () => {
  try {
    const el = document.getElementById('__octane_data');
    const target = document.getElementById('root');
    if (!el || !target) {
      console.error('[octane] Unable to hydrate: missing #__octane_data or #root.');
      return;
    }
    const data = JSON.parse(el.textContent || '{}'); // { entry, exportName, layout, params, url, preHydrate }
    documentData = data;
    if (incompatibleBuild) return;
    if (clientBuildId !== null || data.clientBuild != null) {
      if (
        typeof clientBuildId !== 'string' || !clientBuildId ||
        data.clientBuild?.version !== 1 || data.clientBuild.buildId !== clientBuildId ||
        !['production', 'development'].includes(data.clientBuild.mode) ||
        typeof data.clientBuild.capabilities?.independentHydration !== 'boolean'
      ) throw new Error('[octane] Client build identity does not match the server document.');
      independentCapability ||= data.clientBuild.capabilities.independentHydration;
    }
    if (data.streamedSignals !== undefined && (
      !data.clientBuild || data.streamedSignals?.buildId !== clientBuildId ||
      typeof data.streamedSignals.documentId !== 'string' || !data.streamedSignals.documentId
    )) throw new Error('[octane] Invalid streamed signal document identity.');
    if (globalThis.__octaneStreamedSignalSelections !== undefined) {
      if (!data.streamedSignals) throw new Error('[octane] Missing streamed signal document identity.');
      signalHydrationModule = await import('octane/hydration/streamed-signals');
      if (incompatibleBuild) return;
      streamedHydration = signalHydrationModule.bootstrapStreamedSignalHydration(data.streamedSignals);
      signalOwner = streamedHydration.signalOwner;
      await bootstrapDocumentLifecycle();
    }
    if (!data.entry) {
      console.error('[octane] Unable to hydrate: no route entry in #__octane_data.');
      return;
    }

    await bootstrapIndependentIslands(target);
    if (incompatibleBuild) return;
    if (documentLifecycle && !await documentLifecycle.whenActive()) return;

    const pageMod = await importModule(data.entry);
    if (incompatibleBuild) return;
    if (documentLifecycle && !await documentLifecycle.whenActive()) return;
    const Component = getComponentExport(pageMod, data.exportName ?? undefined);
    if (!Component) {
      console.error('[octane] Unable to hydrate: no component export for', data.entry);
      return;
    }

    const params = data.params;
    const url = data.url;

    // Run the app's pre-hydrate hook (config \`router.preHydrate\`) before the
    // first hydration render — e.g. a client router committing its match tree
    // so hydration adopts the same resolved tree the server rendered.
    if (data.preHydrate) {
      const preMod = await importModule(data.preHydrate);
      if (incompatibleBuild) return;
      if (documentLifecycle && !await documentLifecycle.whenActive()) return;
      const hook = preMod.default;
      if (typeof hook === 'function') await hook({ url, params });
    }
    if (incompatibleBuild) return;
    if (documentLifecycle && !await documentLifecycle.whenActive()) return;

    // Build the same props-closing root wrapper as the server.
    let Content;
    if (data.layout) {
      const layoutMod = await importModule(data.layout);
      if (incompatibleBuild) return;
      if (documentLifecycle && !await documentLifecycle.whenActive()) return;
      const Layout = getComponentExport(layoutMod);
      if (Layout) {
        // children is a ComponentBody closing over the page props; octane's
        // childSlot invokes a function child PROPS-FIRST as \`({}, block, extra)\`,
        // so we ignore the empty props and render the page with its real
        // \`{ params, url }\`, threading the scope + extra — mirroring the server
        // createLayoutWrapper so the markers line up.
        const children = (_props, scope, extra) => Component({ params, url }, scope, extra);
        Content = (_props, scope, extra) => Layout({ params, url, children }, scope, extra);
      }
    }
    if (!Content) {
      Content = (_props, scope, extra) => Component({ params, url }, scope, extra);
    }

    const rootBoundary = { pending: null, catch: null };
    for (const kind of ['pending', 'catch']) {
      const entry = data.rootBoundary?.[kind];
      if (!entry) continue;
      const module = await importModule(entry.path);
      if (incompatibleBuild) return;
      if (documentLifecycle && !await documentLifecycle.whenActive()) return;
      const Boundary = getComponentExport(module, entry.exportName ?? undefined);
      if (!Boundary) {
        console.error('[octane] Unable to hydrate: no rootBoundary component for', entry.path);
        return;
      }
      rootBoundary[kind] = Boundary;
    }

    if (incompatibleBuild) return;
    if (documentLifecycle && !await documentLifecycle.whenActive()) return;
    hydrateRoot(target, withRootBoundary(Content, rootBoundary), undefined,
      signalOwner === undefined ? undefined : { signalOwner });
  } catch (error) {
    console.error('[octane] Failed to bootstrap client hydration.', error);
  }
})();
`;
}

/**
 * @param {string} filename
 * @param {string} root
 * @returns {string}
 */
export function normalize_module_reference(filename, root) {
	const normalizedRoot = path.resolve(root);
	const normalizedFile = path.resolve(filename);
	const relative = path.relative(normalizedRoot, normalizedFile);
	const withinRoot =
		relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
	return withinRoot
		? `/${relative.split(path.sep).join('/')}`
		: normalizedFile.split(path.sep).join('/');
}

/**
 * Compatibility alias for the Vite integration. Module references themselves
 * are bundler-neutral; a project-root absolute `/src/...` ID is understood by
 * both Vite and Rsbuild/Rspack aliases.
 *
 * @param {string} filename
 * @param {string} root
 * @returns {string}
 */
export function to_vite_root_import(filename, root) {
	return normalize_module_reference(filename, root);
}
