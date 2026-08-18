import type { RsbuildPlugin } from '@rsbuild/core';
import {
	tanstackStart,
	type OctaneCompilerOptions,
	type TanStackOctaneStartRsbuildInputConfig,
} from '@octanejs/tanstack-start/plugin/rsbuild';

const options = {
	octane: {
		devtools: true,
		hmr: false,
		parallel: { maxWorkers: 2 },
	},
	rsbuild: {
		client: { output: 'module' },
	},
} satisfies TanStackOctaneStartRsbuildInputConfig;

const plugin: RsbuildPlugin = tanstackStart(options);
void plugin;

const invalidCompilerOptions: OctaneCompilerOptions = {
	// @ts-expect-error Start owns the generated client and server environment names
	clientEnvironment: 'browser',
};
void invalidCompilerOptions;
