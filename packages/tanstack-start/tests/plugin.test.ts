import { describe, expect, it } from 'vitest';
import type { Plugin, PluginOption } from 'vite';
import { tanstackStart } from '@octanejs/tanstack-start/plugin/vite';

function flattenPlugins(options: Array<PluginOption>): Array<Plugin> {
	const plugins: Array<Plugin> = [];
	for (const option of options) {
		if (Array.isArray(option)) plugins.push(...flattenPlugins(option));
		else if (option && typeof option === 'object' && !('then' in option)) plugins.push(option);
	}
	return plugins;
}

describe('TanStack Start Vite integration', () => {
	it('rejects an SSR override that would desynchronize Start environments', () => {
		const options = {
			octane: { ssr: false },
		} as unknown as Parameters<typeof tanstackStart>[0];

		expect(() => tanstackStart(options)).toThrow(/octane\.ssr.*not supported/i);
	});

	it('installs Octane compilation before route generation', () => {
		const plugins = flattenPlugins(tanstackStart({ octane: { hmr: false } }));
		const names = plugins.map((plugin) => plugin.name);
		const compilerIndex = names.indexOf('octane');
		const generatorIndex = names.indexOf('tanstack:router-generator');

		expect(compilerIndex).toBeGreaterThanOrEqual(0);
		expect(generatorIndex).toBeGreaterThan(compilerIndex);
	});
});
