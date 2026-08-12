/** Jest config for the curated Motion pristine useMotionValue suite. */
module.exports = {
	clearMocks: true,
	resetMocks: true,
	restoreMocks: true,
	roots: ['<rootDir>/src'],
	testMatch: ['**/value/__tests__/use-motion-value.test.tsx'],
	transform: {
		'^.+\\.tsx?$': [
			'@swc/jest',
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
