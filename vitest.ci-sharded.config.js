import { configDefaults, defineConfig } from 'vitest/config';

import baseConfig from './vitest.config.js';

export const ISOLATED_COMPILER_SPEC =
	'packages/octane/tests/compiler/compiler-vite-options.test.ts';

export function configureShardedProjects(projects) {
	return projects.flatMap((project) => {
		const { testExecution, ...vitestProject } = project;
		if (!testExecution?.group) return [vitestProject];
		if (!testExecution.include?.length) return [];
		return [
			{
				...vitestProject,
				test: {
					...vitestProject.test,
					exclude: [
						...(vitestProject.test.exclude ?? configDefaults.exclude),
						...testExecution.include,
					],
				},
			},
		];
	});
}

const ciProjects = baseConfig.test.projects.map((project) =>
	project.test?.name === 'octane'
		? { ...project, testExecution: { group: 'heavy-node', include: [ISOLATED_COMPILER_SPEC] } }
		: project,
);

export default defineConfig({
	...baseConfig,
	test: {
		...baseConfig.test,
		projects: configureShardedProjects(ciProjects),
	},
});
