import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import workspace from '../../../vitest.config.js';

const projects = new Set(['base-ui', 'base-ui-ssr', 'base-ui-differential']);

export default defineConfig({
	...workspace,
	root: resolve(import.meta.dirname, '../../..'),
	test: {
		...workspace.test,
		projects: workspace.test.projects.filter(
			(project) => typeof project === 'object' && projects.has(project.test?.name),
		),
	},
});
