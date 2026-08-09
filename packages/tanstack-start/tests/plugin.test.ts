import { describe, expect, it } from 'vitest';
import { build, type Plugin, type PluginOption } from 'vite';
import { cloudflareExternals, tanstackStart } from '@octanejs/tanstack-start/plugin/vite';

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

describe('cloudflare externals', () => {
	const plugin = cloudflareExternals() as Plugin;

	it('externalizes cloudflare: specifiers in the server environment only', () => {
		const applyToEnvironment = plugin.applyToEnvironment as (environment: {
			name: string;
		}) => boolean;
		expect(applyToEnvironment({ name: 'ssr' })).toBe(true);
		expect(applyToEnvironment({ name: 'client' })).toBe(false);

		const resolveId = plugin.resolveId as (id: string) => unknown;
		expect(resolveId('cloudflare:workers')).toEqual({
			id: 'cloudflare:workers',
			external: true,
		});
		expect(resolveId('cloudflare:email')).toEqual({
			id: 'cloudflare:email',
			external: true,
		});
	});

	it('leaves other specifiers to the normal resolver', () => {
		const plugin = cloudflareExternals() as Plugin;
		const resolveId = plugin.resolveId as (id: string) => unknown;

		expect(resolveId('vite')).toBeUndefined();
		expect(resolveId('./relative.js')).toBeUndefined();
	});

	it('keeps cloudflare: imports external in a real server build', async () => {
		const plugin = cloudflareExternals() as Plugin;
		const result = (await build({
			configFile: false,
			logLevel: 'silent',
			build: {
				write: false,
				ssr: true,
				rollupOptions: { input: 'virtual:entry' },
			},
			plugins: [
				{
					name: 'test-server-entry',
					resolveId(id) {
						if (id === 'virtual:entry') return id;
					},
					load(id) {
						if (id === 'virtual:entry') {
							return 'import * as cf from "cloudflare:workers"; export default cf.env;';
						}
					},
				},
				plugin,
			],
		})) as unknown as {
			output: Array<{ type: string; code?: string }>;
		};

		const code = result.output
			.filter((entry) => entry.type === 'chunk' && entry.code !== undefined)
			.map((entry) => entry.code!)
			.join('\n');
		expect(code).toContain('cloudflare:workers');
	});
});

describe('octane.devtools', () => {
	const PROFILE_DEFINE = '__OCTANE_PROFILE_ENABLED__';

	function compilerConfigHook(options: Parameters<typeof tanstackStart>[0]) {
		const plugins = flattenPlugins(tanstackStart(options));
		const compiler = plugins.find((plugin) => plugin.name === 'octane');
		return compiler?.config as
			| ((
					config: { root?: string; define?: Record<string, unknown> },
					env: { command: 'serve' | 'build' },
			  ) => unknown)
			| undefined;
	}

	async function profileDefine(
		options: Parameters<typeof tanstackStart>[0],
		command: 'serve' | 'build',
	): Promise<unknown> {
		const config = compilerConfigHook(options);
		const result = (await config?.({}, { command })) as { define?: Record<string, unknown> };
		return result?.define?.[PROFILE_DEFINE];
	}

	it('enables profiling in dev and compiles it out of a build, like @octanejs/vite-plugin', async () => {
		const options = { octane: { devtools: true } } as unknown as Parameters<
			typeof tanstackStart
		>[0];

		expect(await profileDefine(options, 'serve')).toBe(JSON.stringify(true));
		expect(await profileDefine(options, 'build')).toBe(JSON.stringify(false));
	});

	it('lets an explicit profile override devtools', async () => {
		const off = {
			octane: { devtools: true, profile: false },
		} as unknown as Parameters<typeof tanstackStart>[0];
		expect(await profileDefine(off, 'serve')).toBe(JSON.stringify(false));

		const on = {
			octane: { devtools: false, profile: true },
		} as unknown as Parameters<typeof tanstackStart>[0];
		expect(await profileDefine(on, 'build')).toBe(JSON.stringify(true));
	});
});
