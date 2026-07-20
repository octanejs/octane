import type { TanStackStartViteInputConfig } from '#tanstack-start/plugin-core/vite';
import type {
	OctaneRendererBoundaryOptions,
	OctaneRendererConfigOptions,
	OctaneRendererRegistryEntry,
	OctaneRendererRuleOptions,
	OctaneVitePluginOptions,
} from 'octane/compiler/vite';
import type { PluginOption } from 'vite';

export type OctaneRendererDescriptor = Exclude<OctaneRendererRegistryEntry, string>;
export type OctaneRendererBoundary = OctaneRendererBoundaryOptions;
export type OctaneRendererRule = OctaneRendererRuleOptions;
export type OctaneRendererConfig = OctaneRendererConfigOptions;
export type OctaneCompilerOptions = Omit<OctaneVitePluginOptions, 'ssr'>;

export type TanStackOctaneStartViteInputConfig = TanStackStartViteInputConfig & {
	octane?: OctaneCompilerOptions;
};

export declare function tanstackStart(
	options?: TanStackOctaneStartViteInputConfig,
): Array<PluginOption>;
