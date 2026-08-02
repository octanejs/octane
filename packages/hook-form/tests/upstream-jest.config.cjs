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
			: project,
	),
};
