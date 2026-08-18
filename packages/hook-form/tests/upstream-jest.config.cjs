const upstream = require('../upstream/scripts/jest/jest.config.js');

module.exports = {
	...upstream,
	projects: upstream.projects.map((project) =>
		project.displayName.name === 'Web'
			? {
					...project,
					transform: { '^.+\\.tsx?$': '@swc/jest' },
					setupFilesAfterEnv: ['<rootDir>/../tests/upstream-jest.setup.ts'],
				}
			: {
					...project,
					// Resolve the bare 'node' environment from this package's pinned
					// jest-environment-node. Leaving it to jest's walk-up resolution ends in
					// pnpm's hidden hoist folder, which holds whichever version a past
					// install hoisted first — an old jest-environment-node pairs a
					// jest-mock without clearMocksOnScope with jest-runtime 30.4, and every
					// Server suite fails to run.
					testEnvironment: require.resolve('jest-environment-node'),
				},
	),
};
