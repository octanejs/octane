/// <reference path="./virtual.d.ts" />

import type { CompileMdxResult } from '@octanejs/mdx/compile';
import type { DocusaurusManifest, LoadDocusaurusSiteOptions } from './index.js';
import type { CompileDocusaurusMdxOptions } from './mdx.js';

export declare const DOCUSAURUS_MANIFEST_ID = 'virtual:octane-docusaurus-manifest';
export declare const DOCUSAURUS_ROUTES_ID = 'virtual:octane-docusaurus-routes';

export interface DocusaurusMdxPluginOptions extends Omit<
	CompileDocusaurusMdxOptions,
	'mode' | 'hmr' | 'dev' | 'metadata'
> {
	ssr?: boolean;
	md?: boolean;
	hmr?: boolean;
	profile?: boolean;
	metadata?:
		| Record<string, any>
		| ((id: string) => Record<string, any> | undefined | Promise<Record<string, any> | undefined>);
}

export interface DocusaurusViteOptions extends LoadDocusaurusSiteOptions {
	mdx?: DocusaurusMdxPluginOptions;
}

export interface DocusaurusBridgePlugin {
	name: 'octane-docusaurus-bridge';
	enforce: 'pre';
	api: {
		getManifest(): Promise<DocusaurusManifest>;
		reload(): Promise<DocusaurusManifest>;
	};
	configureServer(server: {
		moduleGraph: {
			getModuleById(id: string): unknown;
			invalidateModule(module: unknown): void;
		};
		ws: {
			send(payload: { type: 'full-reload' }): void;
		};
	}): void;
	configResolved(config: { root?: string; command: string }): Promise<void>;
	buildStart(this: { addWatchFile?(id: string): void }): Promise<void>;
	watchChange(id: string): Promise<void>;
	resolveId(id: string): Promise<string | null>;
	load(id: string): Promise<string | null>;
}

export interface DocusaurusMdxPlugin {
	name: 'octane-docusaurus-mdx';
	enforce: 'pre';
	configResolved(config: { root?: string; command: string }): void;
	watchChange(id: string): void;
	transform(
		this: {
			addWatchFile?(id: string): void;
			warn?(warning: {
				code: string;
				message: string;
				id: string;
				loc: { file: string; line: number; column: number };
			}): void;
			environment?: { config?: { consumer?: string } };
		},
		code: string,
		id: string,
		options?: { ssr?: boolean },
	): Promise<CompileMdxResult | null>;
}

export declare function docusaurusBridge(options?: DocusaurusViteOptions): DocusaurusBridgePlugin;

export declare function docusaurusMdx(options?: DocusaurusMdxPluginOptions): DocusaurusMdxPlugin;

export declare function docusaurus(
	options?: DocusaurusViteOptions,
): [DocusaurusBridgePlugin, DocusaurusMdxPlugin];
