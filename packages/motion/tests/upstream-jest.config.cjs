/** Original Motion client/SSR suites, with the pinned upstream React/Jest environment. */
const { createRequire } = require('node:module');
const { join, resolve } = require('node:path');
const repo = resolve(__dirname, '../../..');
const oracle = createRequire(join(repo, 'scripts/react-parity/fixtures/motion/package.json'));
const source = process.env.OCTANE_MOTION_PRISTINE_ROOT;
if (!source) throw new Error('Motion pristine runner must supply its authenticated scratch root');
const aliases = {
	'^framer-motion$': join(source, 'src/index.ts'),
	'^framer-motion/client$': join(source, 'src/client.ts'),
};
for (const name of [
	'react',
	'react/jsx-runtime',
	'react/jsx-dev-runtime',
	'react-dom',
	'react-dom/client',
	'react-dom/server',
	'react-dom/test-utils',
	'@testing-library/react',
	'@testing-library/dom',
	'@testing-library/jest-dom',
])
	aliases['^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'] = oracle.resolve(name);
const common = {
	rootDir: source,
	roots: ['<rootDir>/src'],
	modulePaths: [
		join(__dirname, '../node_modules'),
		join(repo, 'node_modules'),
		join(repo, 'node_modules/.pnpm/node_modules'),
	],
	moduleNameMapper: aliases,
	setupFilesAfterEnv: [join(source, 'src/jest.setup.tsx')],
	clearMocks: true,
	resetMocks: true,
	restoreMocks: true,
	transform: {
		'^.+\\.tsx?$': [
			require.resolve('@swc/jest'),
			{
				jsc: {
					parser: { syntax: 'typescript', tsx: true },
					transform: { react: { runtime: 'automatic' } },
				},
			},
		],
	},
	moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
};
module.exports = {
	projects: [
		{
			...common,
			displayName: 'motion-pristine-client',
			testEnvironment: oracle.resolve('jest-environment-jsdom'),
			testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
			testPathIgnorePatterns: ['ssr.test.tsx'],
		},
		{
			...common,
			displayName: 'motion-pristine-ssr',
			testEnvironment: 'node',
			testMatch: ['**/__tests__/**/*ssr.test.tsx'],
		},
	],
};
