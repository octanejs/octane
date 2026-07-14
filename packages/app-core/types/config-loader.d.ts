import type {
	LoadedOctaneConfig,
	LoadConfigOptions,
	OctaneConfigOptions,
	ResolvedOctaneConfig,
} from '@octanejs/app-core';

export { resolveOctaneConfig } from '@octanejs/app-core';
export function getOctaneConfigPath(projectRoot: string, configFile?: string): string;
export function octaneConfigExists(projectRoot: string, configFile?: string): boolean;
export function loadOctaneConfig(
	projectRoot: string,
	options?: LoadConfigOptions,
): Promise<ResolvedOctaneConfig>;
export function loadOctaneConfigWithMetadata(
	projectRoot: string,
	options?: LoadConfigOptions,
): Promise<LoadedOctaneConfig>;

export type {
	ConfigModuleRunner,
	LoadedOctaneConfig,
	LoadConfigOptions,
	OctaneConfigOptions,
	ResolvedOctaneConfig,
} from '@octanejs/app-core';
