export declare const SUPPORTED_DOCUSARUS_VERSION = '3.10.1';
export declare const MINIMUM_DOCUSARUS_NODE_VERSION = '20.0.0';

export interface ResolvedDocusaurusCore {
	manifestPath: string;
	packageRoot: string;
	version: string;
}

export interface LoadDocusaurusSiteOptions {
	siteDir?: string;
	outDir?: string;
	config?: string;
	locale?: string;
	automaticBaseUrlLocalizationDisabled?: boolean;
	allowUnsupportedVersion?: boolean;
}

export interface LoadedDocusaurusSite {
	corePath: string;
	docusaurusVersion: string;
	site: {
		props: Record<string, any> & {
			siteDir: string;
			generatedFilesDir: string;
			outDir: string;
			baseUrl: string;
			routesPaths: string[];
			routes: any[];
			plugins: any[];
		};
		params: Record<string, any>;
	};
}

export interface ImportedDocusaurusModule {
	__import: true;
	path: string;
	query?: unknown;
}

export type DocusaurusModule = string | ImportedDocusaurusModule;

export interface DocusaurusManifestRoute {
	id: string;
	path: string;
	component: DocusaurusModule;
	exact: boolean;
	priority?: number;
	modules?: Record<string, DocusaurusModule | DocusaurusModule[]>;
	context?: unknown;
	props?: unknown;
	metadata?: unknown;
	plugin?: unknown;
	attributes?: Record<string, unknown>;
	children: DocusaurusManifestRoute[];
}

export interface DocusaurusManifestAliases {
	site: string;
	generated: string;
	docs: string;
	theme: Record<string, string>;
	themeOriginal: Record<string, string>;
	themeInit: Record<string, string>;
}

export interface DocusaurusManifest {
	schemaVersion: 1;
	docusaurusVersion: string;
	siteDir: string;
	generatedFilesDir: string;
	outDir: string;
	baseUrl: string;
	routesPaths: string[];
	routes: DocusaurusManifestRoute[];
	globalData: Record<string, unknown>;
	content: Record<string, Record<string, any>>;
	aliases: DocusaurusManifestAliases;
}

export declare function resolveDocusaurusCore(siteDir: string): Promise<ResolvedDocusaurusCore>;

export declare function assertSupportedDocusaurusRuntime(
	resolved: ResolvedDocusaurusCore,
	options?: { allowUnsupportedVersion?: boolean },
): void;

export declare function loadDocusaurusSite(
	options?: LoadDocusaurusSiteOptions,
): Promise<LoadedDocusaurusSite>;

export declare function createDocusaurusManifest(
	loaded: LoadedDocusaurusSite,
): Promise<DocusaurusManifest>;

export declare function resolveDocusaurusId(
	id: string,
	manifest: DocusaurusManifest,
): string | null;

export declare function writeDocusaurusManifest(
	manifest: DocusaurusManifest,
	filename: string,
): Promise<string>;

export declare function readDocusaurusManifest(filename: string): Promise<DocusaurusManifest>;
