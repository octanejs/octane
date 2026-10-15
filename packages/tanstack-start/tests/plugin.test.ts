import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

	it.each([false, true])(
		'selects matching default entries for compiled=%s and honors custom entries',
		async (compiled) => {
			const root = mkdtempSync(join(tmpdir(), 'octane-start-entries-'));
			const src = join(root, 'src');
			mkdirSync(src);
			writeFileSync(join(src, 'router.ts'), 'export function getRouter() {}');
			try {
				async function aliases(custom: boolean) {
					const plugins = flattenPlugins(
						tanstackStart({
							compiled,
							...(custom
								? { client: { entry: './custom-client' }, server: { entry: './custom-server' } }
								: {}),
						}),
					);
					const config = plugins.find(
						(plugin) => plugin.name === 'tanstack-start-core:config',
					)!.config;
					const hook = typeof config === 'function' ? config : config!.handler;
					const result = await hook.call(
						{} as never,
						{ root },
						{ command: 'build', mode: 'production' },
					);
					return result!.resolve!.alias as Record<string, string>;
				}
				const defaults = await aliases(false);
				expect(defaults['virtual:tanstack-start-client-entry']).toMatch(
					compiled ? /compiled\/default-client\.js$/ : /default-entry\/client\.js$/,
				);
				expect(defaults['virtual:tanstack-start-server-entry']).toMatch(
					compiled ? /compiled\/default-server\.js$/ : /default-entry\/server\.js$/,
				);
				writeFileSync(join(src, 'custom-client.ts'), 'export {};');
				writeFileSync(join(src, 'custom-server.ts'), 'export {};');
				const custom = await aliases(true);
				expect(custom['virtual:tanstack-start-client-entry']).toBe(
					realpathSync(join(src, 'custom-client.ts')),
				);
				expect(custom['virtual:tanstack-start-server-entry']).toBe(
					realpathSync(join(src, 'custom-server.ts')),
				);
			} finally {
				rmSync(root, { recursive: true, force: true });
			}
		},
	);

	it('installs Octane compilation before route generation', () => {
		const plugins = flattenPlugins(tanstackStart({ octane: { hmr: false } }));
		const names = plugins.map((plugin) => plugin.name);
		const compilerIndex = names.indexOf('octane');
		const generatorIndex = names.indexOf('tanstack:router-generator');

		expect(compilerIndex).toBeGreaterThanOrEqual(0);
		expect(generatorIndex).toBeGreaterThan(compilerIndex);
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
