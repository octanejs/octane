import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import workspace from '../../../vitest.config.js';

export default defineConfig({
	...workspace,
	root: resolve(import.meta.dirname, '../../..'),
	test: {
		...workspace.test,
		projects: workspace.test.projects.filter(
			(project) => typeof project === 'object' && project.test?.name === 'base-ui-utils',
		),
	},
});
