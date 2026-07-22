import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRouterCodeSplitterPlugin } from '../src/internal/router-plugin/core/router-code-splitter-plugin.js';
import { createRouterPluginContext } from '../src/internal/router-plugin/core/router-plugin-context.js';
import { normalizePath } from '../src/internal/router-plugin/core/utils.js';
import type { TransformResult, UnpluginOptions } from 'unplugin';

const referencePluginName = 'tanstack-router:code-splitter:compile-reference-file';

const routeCode = `
import { createFileRoute } from '@tanstack/react-router'

function Component() {
  return <div>Hello</div>
}

export const Route = createFileRoute('/route')({
  component: Component,
})
`;

type Bundler = 'vite' | 'webpack' | 'rspack';

function getReferencePlugin(
	plugins: ReturnType<typeof createRouterCodeSplitterPlugin>,
): UnpluginOptions {
	const pluginArray = Array.isArray(plugins) ? plugins : [plugins];
	const plugin = pluginArray.find((item) => item.name === referencePluginName);
	if (!plugin) {
		throw new Error('Router reference code-splitter plugin not found');
	}
	return plugin;
}

async function configurePlugin(plugin: UnpluginOptions, bundler: Bundler, production: boolean) {
	if (bundler === 'vite') {
		const hook = plugin.vite?.configResolved;
		if (!hook) {
			throw new Error('Expected a Vite configResolved hook');
		}
		const config = {
			root: process.cwd(),
			command: production ? 'build' : 'serve',
			plugins: [{ name: referencePluginName }],
		} as never;
		if (typeof hook === 'function') {
			await hook.call({} as never, config);
		} else {
			await hook.handler.call({} as never, config);
		}
		return;
	}

	const hook = plugin[bundler];
	if (!hook) {
		throw new Error(`Expected a ${bundler} hook`);
	}
	await hook({ options: { mode: production ? 'production' : 'development' } } as never);
}

function getCode(result: TransformResult | null | undefined) {
	if (!result) {
		return null;
	}
	return typeof result === 'string' ? result : result.code;
}

async function compileRoute(options: {
	bundler: Bundler;
	production: boolean;
	ambientMode: 'development' | 'production';
}) {
	vi.stubEnv('NODE_ENV', options.ambientMode);
	const routeFile = normalizePath(path.join(process.cwd(), `src/routes/${options.bundler}.tsx`));
	const context = createRouterPluginContext();
	context.routesByFile.set(routeFile, { routeId: `/${options.bundler}` });
	const referencePlugin = getReferencePlugin(
		createRouterCodeSplitterPlugin(
			{
				target: 'react',
				autoCodeSplitting: true,
				plugin: options.bundler === 'vite' ? undefined : { hmr: { style: 'webpack' } },
			},
			context,
		),
	);

	await configurePlugin(referencePlugin, options.bundler, options.production);
	const transform = referencePlugin.transform;
	if (!transform || typeof transform === 'function') {
		throw new Error('Expected an object transform hook');
	}
	return getCode(await transform.handler.call({} as never, routeCode, routeFile));
}

afterEach(() => {
	vi.unstubAllEnvs();
});

describe('router code-splitter production mode', () => {
	it.each([
		['vite', 'import.meta.hot'],
		['webpack', 'import.meta.webpackHot'],
		['rspack', 'import.meta.webpackHot'],
	] as const)(
		'uses the %s invocation mode instead of ambient NODE_ENV',
		async (bundler, hmrMarker) => {
			const productionCode = await compileRoute({
				bundler,
				production: true,
				ambientMode: 'development',
			});
			expect(productionCode).not.toBeNull();
			expect(productionCode).not.toContain(hmrMarker);

			const developmentCode = await compileRoute({
				bundler,
				production: false,
				ambientMode: 'production',
			});
			expect(developmentCode).not.toBeNull();
			expect(developmentCode).toContain(hmrMarker);
		},
	);
});
