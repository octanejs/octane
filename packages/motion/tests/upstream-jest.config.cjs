/** Jest config for the curated Motion pristine useMotionValue suite. */
const { join } = require('node:path');

module.exports = {
	// The wrapper runs this config against a scratch rootDir outside the
	// repository, so dependency resolution (react/jsx-runtime, motion/react)
	// must anchor to the repository's own module tree explicitly.
	modulePaths: [
		join(__dirname, '..', 'node_modules'),
		join(__dirname, '..', '..', '..', 'node_modules'),
	],
	clearMocks: true,
	resetMocks: true,
	restoreMocks: true,
	roots: ['<rootDir>/src'],
	testMatch: ['**/value/__tests__/use-motion-value.test.tsx'],
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
