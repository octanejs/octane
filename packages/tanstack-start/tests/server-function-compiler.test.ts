import { describe, expect, it } from 'vitest';
import { StartCompiler } from '../src/internal/start-plugin-core/start-compiler/compiler.js';
import { startCompilerPlugin } from '../src/internal/start-plugin-core/vite/start-compiler-plugin/plugin.js';

const publicFactoryId = '\0virtual:server-fn-factory?variant=public';
const implementationFactoryId = '\0virtual:server-fn-factory?variant=implementation';
const virtualModules: Record<string, string> = {
	[publicFactoryId]: `
		import { createIssueServerFn } from 'virtual:server-fn-factory?variant=implementation'
		export { createIssueServerFn }
	`,
	[implementationFactoryId]: `
		import { createServerFn } from '@octanejs/tanstack-start'
		export const createIssueServerFn = createServerFn
	`,
};
const routeCode = `
	import { createIssueServerFn } from 'virtual:server-fn-factory?variant=public'
	const issueServerFn = createIssueServerFn().handler(async () => 'ok')
`;

function createViteCompilerPlugins() {
	return startCompilerPlugin({
		framework: 'octane',
		environments: [{ name: 'client', type: 'client' }],
		providerEnvName: 'ssr',
	}) as Array<any>;
}

function getPlugin(plugins: Array<any>, name: string) {
	const plugin = plugins.find((candidate) => candidate.name === name);
	if (!plugin) throw new Error(`Missing ${name} plugin`);
	return plugin;
}

function resolveVirtualFactory(source: string) {
	if (source.startsWith('virtual:server-fn-factory?')) {
		return { id: `\0${source}`, external: false };
	}
	return null;
}

describe('TanStack Start server-function compilation', () => {
	it('keeps query-bearing virtual module identities distinct', async () => {
		const loadedIds: Array<string> = [];

		const compiler = new StartCompiler({
			env: 'client',
			envName: 'client',
			root: '/test',
			framework: 'octane',
			providerEnvName: 'ssr',
			mode: 'build',
			loadModule: async (id) => {
				loadedIds.push(id);
				const code = virtualModules[id];
				if (code) compiler.ingestModule({ code, id });
			},
			lookupKinds: new Set(['ServerFn']),
			lookupConfigurations: [
				{
					libName: '@octanejs/tanstack-start',
					rootExport: 'createServerFn',
					kind: 'Root',
				},
			],
			getKnownServerFns: () => ({}),
			resolveId: async (source) => resolveVirtualFactory(source)?.id ?? null,
		});

		const result = await compiler.compile({
			id: '/test/src/test.ts',
			code: routeCode,
		});

		expect(result).not.toBeNull();
		expect(result!.code).toContain('createClientRpc');
		expect(loadedIds).toEqual([publicFactoryId, implementationFactoryId]);
	});

	it('preserves query-bearing resolved IDs through the Vite build hooks', async () => {
		const loadedIds: Array<string> = [];
		const plugin = getPlugin(createViteCompilerPlugins(), 'tanstack-start-core::server-fn:client');
		plugin.configResolved({ root: '/test', experimental: { bundledDev: false } });

		const context = {
			environment: { name: 'client', mode: 'build' },
			load: async ({ id }: { id: string }) => {
				loadedIds.push(id);
				const code = virtualModules[id];
				return code === undefined ? undefined : { code };
			},
			resolve: async (source: string) => resolveVirtualFactory(source),
			error: (message: string) => {
				throw new Error(message);
			},
			warn: () => {},
		};
		plugin.buildStart.call(context);
		const result = await plugin.transform.handler.call(context, routeCode, '/test/src/test.ts');

		expect(result).not.toBeNull();
		expect(result.code).toContain('createClientRpc');
		expect(loadedIds).toEqual([publicFactoryId, implementationFactoryId]);
	});

	it('round-trips query-bearing IDs through Vite dev lookup requests', async () => {
		const lookupFlag = 'server-fn-module-lookup';
		const requestedIds: Array<string> = [];
		const plugins = createViteCompilerPlugins();
		const compilerPlugin = getPlugin(plugins, 'tanstack-start-core::server-fn:client');
		const capturePlugin = getPlugin(plugins, 'tanstack-start-core:capture-server-fn-module-lookup');
		compilerPlugin.configResolved({ root: '/test', experimental: { bundledDev: false } });

		const lookupModules: Record<string, string> = {
			[`${publicFactoryId}&${lookupFlag}`]: virtualModules[publicFactoryId],
			[`${implementationFactoryId}&${lookupFlag}`]: virtualModules[implementationFactoryId],
		};
		let context: any;
		context = {
			environment: {
				name: 'client',
				mode: 'dev',
				transformRequest: async (id: string) => {
					requestedIds.push(id);
					const code = lookupModules[id];
					if (code === undefined) throw new Error(`Unexpected lookup ID: ${id}`);
					capturePlugin.transform.handler.call(context, code, id);
				},
			},
			load: async () => {
				throw new Error('Vite dev lookup should use transformRequest');
			},
			resolve: async (source: string) => resolveVirtualFactory(source),
			error: (message: string) => {
				throw new Error(message);
			},
			warn: () => {},
		};
		compilerPlugin.buildStart.call(context);
		const result = await compilerPlugin.transform.handler.call(
			context,
			routeCode,
			'/test/src/test.ts',
		);

		expect(result).not.toBeNull();
		expect(result.code).toContain('createClientRpc');
		expect(requestedIds).toEqual([
			`${publicFactoryId}&${lookupFlag}`,
			`${implementationFactoryId}&${lookupFlag}`,
		]);
	});
});
