import { configDefaults, defineConfig } from 'vitest/config';

import baseConfig from './vitest.config.js';

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

export default defineConfig({
	...baseConfig,
	test: {
		...baseConfig.test,
		projects: configureShardedProjects(baseConfig.test.projects),
	},
});
