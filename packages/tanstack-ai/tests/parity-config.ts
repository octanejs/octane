import { resolve } from 'node:path';
export const packageRoot = resolve(import.meta.dirname, '..');
const coreRoot = resolve(packageRoot, 'node_modules/@tanstack/ai-client');
export const aiAliases = [
	{
		find: /^@octanejs\/testing-library\/(.*)$/,
		replacement: resolve(packageRoot, '../testing-library/src') + '/$1.ts',
	},
	{
		find: /^(?:\.\.\/){2,3}ai-client\/tests\/(.*)$/,
		replacement: resolve(packageRoot, 'upstream-helpers/ai-client/tests') + '/$1',
	},
	{
		find: /^@octanejs\/testing-library$/,
		replacement: resolve(packageRoot, '../testing-library/src/index.ts'),
	},
];
export const aiHelperImports = {
	name: 'ai-pinned-helper-core',
	enforce: 'pre' as const,
	resolveId(source: string, importer?: string) {
		if (importer?.includes('/upstream-helpers/ai-client/tests/') && source.startsWith('../src/'))
			return resolve(coreRoot, 'src', source.slice('../src/'.length) + '.ts');
	},
};
export const adaptedJsx = {
	name: 'ai-adapted-jsx',
	enforce: 'pre' as const,
	transform(code: string, id: string) {
		if (id.startsWith(resolve(packageRoot, 'tests/upstream') + '/') && id.endsWith('.tsx'))
			return { code: '/** @jsxImportSource octane */\n' + code, map: null };
	},
};
