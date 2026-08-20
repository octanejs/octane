const path = require('node:path');

const tagRoot = path.resolve(__dirname, '../upstream');

module.exports = {
	rootDir: tagRoot,
	testEnvironment: 'jsdom',
	verbose: true,
	testMatch: ['<rootDir>/tests/**/*.test.js'],
	transform: {
		'^.+\\.[jt]sx?$': [
			require.resolve('@swc/jest'),
			{
				jsc: {
					parser: { syntax: 'typescript', tsx: true },
					transform: { react: { runtime: 'classic' } },
				},
				module: { type: 'commonjs' },
			},
		],
	},
	moduleNameMapper: {
		'\\.css$': '<rootDir>/tests/__mocks__/styles.css.mock.ts',
	},
	setupFiles: [path.resolve(__dirname, 'upstream-jest.setup.cjs')],
	setupFilesAfterEnv: [path.resolve(__dirname, 'upstream-jest.snapshot.cjs')],
	// The pinned snapshot keeps its byte-exact legacy header in upstream/;
	// Jest reads the lock-regenerated, header-corrected copy instead.
	snapshotResolver: path.resolve(__dirname, 'upstream-jest.snapshot-resolver.cjs'),
};
