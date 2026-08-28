import { resolve } from 'node:path';
import { createServer } from 'vite';

import { octane } from '../src/compiler/vite.js';
import type { RenderResult } from '../src/runtime.server';

type HydrationBinding =
	| 'alien-signals'
	| 'apollo-client'
	| 'aria'
	| 'base-ui'
	| 'docusaurus'
	| 'formisch'
	| 'monaco-editor'
	| 'pdf'
	| 'rainbowkit'
	| 'react-map-gl'
	| 'select'
	| 'solana-kit'
	| 'testing-library';

const repositoryRoot = resolve(import.meta.dirname, '../../..');

function bindingAliases(binding: HydrationBinding) {
	const source = resolve(repositoryRoot, 'packages', binding, 'src');
	if (binding === 'alien-signals') {
		return [{ find: /^@octanejs\/alien-signals$/, replacement: resolve(source, 'index.ts') }];
	}

	if (binding === 'apollo-client') {
		return [
			{
				find: /^@octanejs\/apollo-client\/react\/internal$/,
				replacement: resolve(source, 'react/internal/index.js'),
			},
			{
				find: /^@octanejs\/apollo-client\/react$/,
				replacement: resolve(source, 'react/index.js'),
			},
			{ find: /^@octanejs\/apollo-client$/, replacement: resolve(source, 'index.js') },
		];
	}

	if (binding === 'aria') {
		return [
			{ find: /^@octanejs\/aria$/, replacement: resolve(source, 'index.ts') },
			{ find: /^@octanejs\/aria\/(.*)$/, replacement: `${source}/$1/index.ts` },
		];
	}

	if (binding === 'docusaurus') {
		return [
			{
				find: /^@octanejs\/docusaurus\/server$/,
				replacement: resolve(source, 'server.js'),
			},
			{
				find: /^@octanejs\/remix-router$/,
				replacement: resolve(repositoryRoot, 'packages/remix-router/src/index.ts'),
			},
		];
	}

	if (binding === 'formisch') {
		return [{ find: /^@octanejs\/formisch$/, replacement: resolve(source, 'index.ts') }];
	}

	if (binding === 'solana-kit') {
		return [
			{
				find: /^@octanejs\/solana-kit$/,
				replacement: resolve(source, 'index.ts'),
			},
		];
	}

	if (binding === 'rainbowkit') {
		return [
			{
				find: /^@octanejs\/rainbowkit$/,
				replacement: resolve(source, 'index.ts'),
			},
			{
				find: /^@octanejs\/wagmi$/,
				replacement: resolve(repositoryRoot, 'packages/wagmi/src/index.ts'),
			},
			{
				find: /^@octanejs\/tanstack-query$/,
				replacement: resolve(repositoryRoot, 'packages/tanstack-query/src/index.ts'),
			},
		];
	}

	if (binding === 'monaco-editor') {
		return [
			{
				find: /^@octanejs\/monaco-editor$/,
				replacement: resolve(source, 'index.ts'),
			},
			{
				find: /^@monaco-editor\/loader$/,
				replacement: resolve(repositoryRoot, 'packages/monaco-editor/tests/_mocks/loader.ts'),
			},
		];
	}

	if (binding === 'pdf') {
		return [
			{
				find: /^@octanejs\/pdf$/,
				replacement: resolve(source, 'index.server.ts'),
			},
		];
	}

	if (binding === 'react-map-gl') {
		return [{ find: /^@octanejs\/react-map-gl$/, replacement: resolve(source, 'index.ts') }];
	}

	if (binding === 'select') return [];

	if (binding === 'testing-library') {
		// Its hydration fixtures import `octane` and nothing else — the binding
		// itself is what the TEST mounts through, never what the server renders.
		return [];
	}

	return [
		{ find: /^@octanejs\/base-ui$/, replacement: resolve(source, 'index.ts') },
		{ find: /^@octanejs\/base-ui\/(.*)$/, replacement: `${source}/$1.ts` },
		{
			find: /^@octanejs\/floating-ui$/,
			replacement: resolve(repositoryRoot, 'packages/floating-ui/src/index.ts'),
		},
	];
}

async function withHydrationServer<T>(
	binding: HydrationBinding,
	run: (server: Awaited<ReturnType<typeof createServer>>, serverRuntime: string) => Promise<T>,
): Promise<T> {
	const serverRuntime = resolve(repositoryRoot, 'packages/octane/src/server/index.ts');
	const server = await createServer({
		configFile: false,
		root: repositoryRoot,
		logLevel: 'silent',
		appType: 'custom',
		plugins: [octane({ ssr: true })],
		resolve: {
			alias: [
				{ find: /^octane$/, replacement: serverRuntime },
				{ find: /^octane\/server$/, replacement: serverRuntime },
				{
					find: /^octane\/static$/,
					replacement: resolve(repositoryRoot, 'packages/octane/src/static/index.ts'),
				},
				...bindingAliases(binding),
			],
		},
		server: { middlewareMode: true, hmr: false },
	});

	try {
		return await run(server, serverRuntime);
	} finally {
		await server.close();
	}
}

/**
 * Render a fixture through Vite's real SSR compiler before hydrating its
 * separately client-compiled twin. Provider and component-range markers are
 * renderer-specific, so React markup cannot stand in for Octane server HTML.
 */
export async function renderHydrationFixture(
	binding: HydrationBinding,
	fixture: string,
	exportName: string,
	props?: unknown,
): Promise<RenderResult> {
	return withHydrationServer(binding, async (server, serverRuntime) => {
		const [module, runtime] = await Promise.all([
			server.ssrLoadModule(resolve(repositoryRoot, fixture)),
			server.ssrLoadModule(serverRuntime),
		]);
		const component = module[exportName];
		if (typeof component !== 'function') {
			throw new Error(`Missing server fixture export: ${fixture}#${exportName}`);
		}
		return runtime.renderToString(component, props);
	});
}

export async function executeHydrationFixture<T>(
	binding: HydrationBinding,
	fixture: string,
	exportName: string,
	...args: unknown[]
): Promise<T> {
	return withHydrationServer(binding, async (server) => {
		const module = await server.ssrLoadModule(resolve(repositoryRoot, fixture));
		const execute = module[exportName];
		if (typeof execute !== 'function') {
			throw new Error(`Missing server fixture function: ${fixture}#${exportName}`);
		}
		return execute(...args) as Promise<T>;
	});
}
