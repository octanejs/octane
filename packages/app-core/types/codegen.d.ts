import type { RootBoundaryOptions, Route } from '@octanejs/app-core';
import type { ClientAssetEntry } from '@octanejs/app-core/production';

export const RESOLVED_ADAPTER_BROWSER_STUB_ID: '\0octane:adapter-browser-stub';
export const SERVER_ONLY_ADAPTER_IDS: Set<string>;
export function create_adapter_browser_stub_source(): string;

export interface GeneratedProjectOptions {
	root: string;
	cacheDir?: string;
	generatedDir?: string;
}

export function get_project_generated_dir(options: GeneratedProjectOptions): string;
export function write_project_generated_file(
	options: GeneratedProjectOptions,
	name: string,
	source: string,
): string;

export interface StaticClientEntry {
	/** Stable ID serialized in hydration data. */
	id: string;
	/** Bundler-resolvable import specifier emitted in generated source. */
	specifier: string;
}

export interface ClientEntryOptions {
	configPath?: string;
	staticEntries?: Array<string | StaticClientEntry>;
	resolveImport?: (id: string) => string;
	runtimeModuleId?: string;
	generatedBy?: string;
}

export function create_client_entry_source(options?: ClientEntryOptions): string;

export interface ServerEntryOptions {
	routes: Route[];
	octaneConfigPath: string;
	rootBoundary?: RootBoundaryOptions;
	rpcModulePaths?: string[];
	clientAssetMap?: Record<string, ClientAssetEntry>;
	/** JSON file resolved beside the built server entry at module evaluation. */
	clientAssetMapFile?: string;
	/** Stable application module ID to emitted bundler import specifier. */
	moduleImports?: Record<string, string>;
	resolveImport?: (id: string) => string;
	configImportPath?: string;
	/** Server module shape emitted for the active adapter target. @default 'handler' */
	mode?: 'handler' | 'manifest' | 'webworker';
	serverRuntimeModuleId?: string;
	staticRuntimeModuleId?: string;
	productionModuleId?: string;
	configModuleId?: string;
	nodeModuleId?: string;
	generatedBy?: string;
}

/** Generate a production server entry in the requested module shape. */
export function generateServerEntry(options: ServerEntryOptions): string;
/** Generate a template-free bundle exporting `manifest` and `rendererDeps`. */
export function generateServerManifestEntry(options: ServerEntryOptions): string;

/** Convert an absolute file under `root` to a stable project-root module ID. */
export function normalize_module_reference(filename: string, root: string): string;
/** Compatibility alias retained for the Vite integration. */
export function to_vite_root_import(filename: string, root: string): string;
