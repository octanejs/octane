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
 * sees, chunks, and hashes them; the runtime falls back to the hidden dynamic
 * import only for paths outside the map (the dev case, where the map is empty
 * and the integration serves any module by URL).
 *
 * octane specifics:
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
 *   resolveImport?: (id: string) => string,
 *   runtimeModuleId?: string,
 *   generatedBy?: string,
 * }} [options]
 * @returns {string}
 */
export function create_client_entry_source(options = {}) {
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

	return `// Auto-generated by ${generatedBy}.
// This file is written to the active integration's project cache.

import { hydrateRoot, Suspense, ErrorBoundary, createElement } from ${JSON.stringify(runtimeModuleId)};

// Static import map (production): every module the server may name in
// #__octane_data, as bundle-analyzable dynamic imports. Empty in dev.
const routeModules = {
${static_map_lines}
};

// Keep the fallback hidden from static import analysis. Some integrations
// rewrite variable dynamic imports into queried URLs, which can evaluate as a
// SECOND browser module instance and stop pages/preHydrate hooks sharing
// singletons with statically imported copies of the same files.
const dynamicImport = new Function('specifier', 'return import(specifier)');

function importModule(path) {
  const loader = routeModules[path];
  return loader ? loader() : dynamicImport(path);
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
    if (!data.entry) {
      console.error('[octane] Unable to hydrate: no route entry in #__octane_data.');
      return;
    }

    const pageMod = await importModule(data.entry);
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
      const hook = preMod.default;
      if (typeof hook === 'function') await hook({ url, params });
    }

    // Build the same props-closing root wrapper as the server.
    let Content;
    if (data.layout) {
      const layoutMod = await importModule(data.layout);
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
      const Boundary = getComponentExport(module, entry.exportName ?? undefined);
      if (!Boundary) {
        console.error('[octane] Unable to hydrate: no rootBoundary component for', entry.path);
        return;
      }
      rootBoundary[kind] = Boundary;
    }

    hydrateRoot(target, withRootBoundary(Content, rootBoundary));
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
