import assert from 'node:assert/strict';
import { ai } from '../src/libraries/libraries';
import type { Framework } from '../src/libraries/types';
import { getFrameworkDocsPath, getFrameworkPackageName } from '../src/libraries/frameworkSupport';

const expectedFrameworks: Framework[] = ['react', 'vue', 'solid', 'svelte', 'preact', 'vanilla'];

const expectedPackages: Partial<Record<Framework, string>> = {
	react: '@tanstack/ai-react',
	vue: '@tanstack/ai-vue',
	solid: '@tanstack/ai-solid',
	svelte: '@tanstack/ai-svelte',
	preact: '@tanstack/ai-preact',
	vanilla: '@tanstack/ai-client',
};

const expectedDocsPaths: Partial<Record<Framework, string>> = {
	react: 'getting-started/quick-start',
	vue: 'getting-started/quick-start-vue',
	solid: 'api/ai-solid',
	svelte: 'getting-started/quick-start-svelte',
	preact: 'api/ai-preact',
	vanilla: 'api/ai-client',
};

assert.deepEqual(
	ai.frameworks,
	expectedFrameworks,
	'AI framework list reflects shipped framework packages',
);

for (const framework of expectedFrameworks) {
	assert.equal(
		getFrameworkPackageName(framework, ai.id, ai),
		expectedPackages[framework],
		`${framework} package name points to the shipped AI package`,
	);

	assert.equal(
		getFrameworkDocsPath(framework, ai),
		expectedDocsPaths[framework],
		`${framework} framework card links to an existing AI docs page`,
	);
}

console.log('ai framework doc link tests passed');
