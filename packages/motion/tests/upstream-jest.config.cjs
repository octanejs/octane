/** Jest config for the curated Motion pristine useMotionValue suite. */
const { join } = require('node:path');

module.exports = {
	// The wrapper runs this config against a scratch rootDir outside the
	// repository, so dependency resolution (react/jsx-runtime, motion/react)
	// must anchor to the repository's own module tree explicitly.
	modulePaths: [
		join(__dirname, '..', 'node_modules'),
		join(__dirname, '..', '..', '..', 'node_modules'),
		// pnpm's hidden hoist store holds transitive dependencies (motion-utils,
		// expect) that neither package tree exposes directly.
		join(__dirname, '..', '..', '..', 'node_modules', '.pnpm', 'node_modules'),
	],
	setupFilesAfterEnv: [join(__dirname, 'upstream-jest.matcher-compat.cjs')],
	clearMocks: true,
	resetMocks: true,
	restoreMocks: true,
	roots: ['<rootDir>/src'],
	testMatch: ['**/value/__tests__/*.test.ts', '**/value/__tests__/*.test.tsx'],
	transform: {
		'^.+\\.tsx?$': [
			// Resolved absolutely: the pristine wrapper runs this config against a
			// scratch rootDir outside the repository, where a bare module id
			// cannot resolve.
			require.resolve('@swc/jest'),
			{
				jsc: {
					parser: { syntax: 'typescript', tsx: true },
					transform: { react: { runtime: 'automatic' } },
				},
			},
		],
	},
	testEnvironment: 'jest-fixed-jsdom',
	testEnvironmentOptions: {
		customExportConditions: [''],
	},
	moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
};
