import { createRequire } from 'node:module';
import { resolve } from 'node:path';

export const packageRoot = resolve(import.meta.dirname, '..');
const require = createRequire(resolve(packageRoot, 'package.json'));
export const routerOracleAliases = [
	'react',
	'react/jsx-runtime',
	'react/jsx-dev-runtime',
	'react-dom',
	'react-dom/client',
	'react-dom/server',
].map((specifier) => ({
	find: new RegExp(`^${specifier.replaceAll('/', '\\/')}$`),
	replacement: require.resolve(specifier),
}));
export const routerNeutralAliases = [
	{
		find: /^(?:\.\.\/){2,3}router-core\/src\/ssr\/ssr-match-id$/,
		replacement: resolve(packageRoot, 'node_modules/@tanstack/router-core/src/ssr/ssr-match-id.ts'),
	},
];
export const routerAdaptedAliases = [
	...routerNeutralAliases,
	{
		find: /^@octanejs\/testing-library$/,
		replacement: resolve(packageRoot, '../testing-library/src/index.ts'),
	},
	{
		find: /^@tanstack\/react-query$/,
		replacement: resolve(packageRoot, '../tanstack-query/src/index.ts'),
	},
];
export const adaptedRouterJsx = {
	name: 'router-adapted-jsx',
	enforce: 'pre' as const,
	transform(code: string, id: string) {
		if (id.startsWith(resolve(packageRoot, 'tests/upstream') + '/') && id.endsWith('.tsx'))
			return { code: '/** @jsxImportSource octane */\n' + code, map: null };
	},
};
